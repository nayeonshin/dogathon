/** The MCP gateway. Every tool call the agent makes goes through here.
 *
 *  The gateway URL is supplied at runtime, not at boot, because connecting to it
 *  is a step the attendee performs and watches. Until it is set, polling still
 *  works (that runs on the Arcade SDK) but triage cannot.
 *
 *  Authorization is OAuth 2.1 with PKCE, but the browser leg is driven from
 *  oauth.ts rather than by Mastra's `authenticate()` — see that file for why.
 *  Mastra's client only ever consumes tokens we have already stored.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { MCPClient, MCPOAuthClientProvider } from "@mastra/mcp";
import {
  ARCADE_API_KEY,
  ARCADE_USER_ID,
  GATEWAY_AUTH,
  GATEWAY_URL_DEFAULT,
  APP_BASE_URL,
  RUNTIME_DATA_DIR,
} from "./config.js";
import { FileOAuthStorage } from "./oauth-storage.js";
import { beginGatewayAuth, CLIENT_NAME, type ClientInfo, type Tokens } from "./oauth.js";

/** Our own callback route lets us retain every OAuth query parameter, including
 *  `iss`. Locally APP_BASE_URL uses the RFC 8252 loopback address; deployments
 *  use their public HTTPS origin. */
export const REDIRECT_URI = `${APP_BASE_URL}/oauth/callback`;

const URL_FILE = join(RUNTIME_DATA_DIR, ".arcade-gateway");

type Live = { url: string; client: MCPClient; provider?: MCPOAuthClientProvider };

let live: Live | null = null;
let tools: Awaited<ReturnType<MCPClient["listTools"]>> | null = null;

export const gatewayUrl = () => live?.url ?? rememberedUrl() ?? GATEWAY_URL_DEFAULT;
export const gatewayConfigured = () => !!live;
export const gatewayNeedsAuthorize = () => GATEWAY_AUTH === "oauth";

function rememberedUrl(): string | null {
  try {
    return existsSync(URL_FILE) ? readFileSync(URL_FILE, "utf8").trim() || null : null;
  } catch {
    return null;
  }
}

function build(url: string): Live {
  if (GATEWAY_AUTH === "headers") {
    return {
      url,
      client: new MCPClient({
        id: "arcade-gateway",
        servers: {
          arcade: {
            url: new URL(url),
            requestInit: {
              headers: {
                Authorization: `Bearer ${ARCADE_API_KEY}`,
                "Arcade-User-ID": ARCADE_USER_ID,
              },
            },
          },
        },
      }),
    };
  }

  // The provider exists purely as a token store Mastra understands. We never let
  // it drive a browser flow, so there is no onRedirectToAuthorization here.
  const provider = new MCPOAuthClientProvider({
    redirectUrl: REDIRECT_URI,
    clientMetadata: {
      client_name: CLIENT_NAME,
      redirect_uris: [REDIRECT_URI],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
    },
    storage: new FileOAuthStorage(),
  });

  return {
    url,
    provider,
    client: new MCPClient({
      id: "arcade-gateway",
      servers: {
        // No headers. The OAuth token establishes which end user this is.
        arcade: { url: new URL(url), authProvider: provider },
      },
    }),
  };
}

/** Point the agent at a gateway. Replaces any existing connection. */
export async function setGateway(url: string) {
  if (live) await live.client.disconnect().catch(() => {});
  tools = null;
  live = build(url.trim());
  writeFileSync(URL_FILE, live.url, { mode: 0o600 });
  return prime();
}

/** Restore the gateway used last time, so a restart doesn't lose the setup. */
export async function restoreGateway(): Promise<boolean> {
  const url = rememberedUrl() ?? GATEWAY_URL_DEFAULT;
  if (!url) return false;
  live = build(url);
  return prime();
}

/** In header mode there is no OAuth state to read, so readiness means "the
 *  gateway actually handed us tools". In OAuth mode the auth state is
 *  authoritative. */
export function gatewayConnected(): boolean {
  if (!live) return false;
  if (GATEWAY_AUTH === "headers") return !!tools && Object.keys(tools).length > 0;
  return live.client.getServerAuthState("arcade") === "authorized";
}

/** Attempt a connection so `getServerAuthState` has something to report.
 *
 *  That state is `undefined` until a connection has been tried, so asking before
 *  connecting makes a restart with valid tokens on disk look unauthorized.
 *
 *  Reports the auth state rather than whether listTools() threw: listTools() can
 *  resolve with an empty set against a server that still needs authorization,
 *  which would otherwise report a cheerful "connected" for a gateway holding no
 *  usable tools. */
export async function prime(): Promise<boolean> {
  try {
    await gatewayTools();
  } catch {
    // Expected when unauthorized; the auth state below is the real answer.
  }
  return gatewayConnected();
}

/** Start the browser leg. Returns the URL for the user to visit. */
export async function startGatewayAuth(): Promise<string> {
  if (!live) throw new Error("No gateway set yet.");
  if (GATEWAY_AUTH === "headers") {
    throw new Error("Header mode needs no authorization — set the gateway and go.");
  }
  return beginGatewayAuth(live.url, REDIRECT_URI);
}

/** Hand freshly minted tokens to Mastra's provider, then reconnect. */
export async function storeGatewayTokens(
  clientInformation: ClientInfo,
  tokens: Tokens,
): Promise<boolean> {
  if (!live?.provider) throw new Error("No OAuth gateway to store tokens for.");
  await live.provider.saveClientInformation(clientInformation);
  await live.provider.saveTokens(tokens);
  tools = null; // re-list now that we can actually see them
  await live.client.reconnectServer("arcade").catch(() => {});
  return prime();
}

/** Cached after the first successful fetch, on purpose. The workshop's own
 *  troubleshooting notes assume bad conference wifi — re-listing tools during a
 *  triage run would add a network round trip to the critical path. */
export async function gatewayTools() {
  if (!live) throw new Error("No gateway set yet.");
  if (!tools) tools = await live.client.listTools();
  return tools;
}

export async function shutdownGateway() {
  await live?.client.disconnect().catch(() => {});
}
