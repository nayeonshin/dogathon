/** Gateway OAuth, driven by hand.
 *
 *  Why not just call `mcp.authenticate()`? Because @mastra/mcp's loopback
 *  callback server parses only code/state/error and then calls
 *  `finishAuth(code)` — it never forwards the RFC 9207 `iss` parameter. The MCP
 *  SDK treats a missing `iss` as a possible mix-up attack whenever the
 *  authorization server's metadata advertises support for it, which Arcade's
 *  correctly does, and throws a deliberately non-retryable IssuerMismatchError.
 *
 *  So we run the same flow ourselves with the SDK's own primitives, on our own
 *  callback route where we CAN read `iss`, and hand the resulting tokens to
 *  Mastra's provider. Mastra then connects with stored tokens and never needs to
 *  run an authorization flow at all.
 *
 *  Delete this file once Mastra forwards `iss`; `mcp.authenticate()` is the
 *  supported path and this is a workaround for a fixable upstream bug.
 */
import { randomUUID } from "node:crypto";
import {
  discoverAuthorizationServerMetadata,
  discoverOAuthProtectedResourceMetadata,
  exchangeAuthorization,
  registerClient,
  startAuthorization,
} from "@modelcontextprotocol/client";

type Metadata = Awaited<ReturnType<typeof discoverAuthorizationServerMetadata>>;
export type ClientInfo = Awaited<ReturnType<typeof registerClient>>;

type Pending = {
  state: string;
  asUrl: string;
  metadata: Metadata;
  clientInformation: ClientInfo;
  codeVerifier: string;
  redirectUri: string;
  resource: URL;
};

let pending: Pending | null = null;

import { ORG } from "./dogs.js";

/** Shown on the gateway's OAuth consent screen, in front of the room. */
export const CLIENT_NAME = `${ORG} Triage`;

/** Discover, register, and build the authorization URL. */
export async function beginGatewayAuth(gatewayUrl: string, redirectUri: string) {
  const resourceMetadata = await discoverOAuthProtectedResourceMetadata(gatewayUrl);
  const asUrl = resourceMetadata.authorization_servers?.[0];
  if (!asUrl) throw new Error("Gateway advertises no authorization server.");

  const metadata = await discoverAuthorizationServerMetadata(asUrl);
  if (!metadata) throw new Error(`No authorization server metadata at ${asUrl}`);

  // Dynamic client registration (RFC 7591). Deprecated as of protocol 2026-07-28
  // in favour of Client ID Metadata Documents, but CIMD needs a client metadata
  // document the authorization server can FETCH — impossible for a server running
  // on someone's laptop. DCR stays functional for at least twelve months.
  const clientInformation = await registerClient(asUrl, {
    metadata,
    clientMetadata: {
      client_name: CLIENT_NAME,
      redirect_uris: [redirectUri],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    },
  });

  const state = randomUUID();
  const resource = new URL(resourceMetadata.resource ?? gatewayUrl);

  // Ask for offline_access when the server offers it, so we get a refresh token
  // and the demo survives an access token expiring mid-morning.
  const scopes = new Set(resourceMetadata.scopes_supported ?? ["mcp"]);
  if (metadata.scopes_supported?.includes("offline_access")) scopes.add("offline_access");

  const { authorizationUrl, codeVerifier } = await startAuthorization(asUrl, {
    metadata,
    clientInformation,
    redirectUrl: redirectUri,
    scope: [...scopes].join(" "),
    state,
    resource,
  });

  pending = { state, asUrl, metadata, clientInformation, codeVerifier, redirectUri, resource };
  return authorizationUrl.toString();
}

export type Tokens = Awaited<ReturnType<typeof exchangeAuthorization>>;

/** Redeem the code from our callback route. `iss` is passed through, which is
 *  the entire point of doing this by hand. */
export async function completeGatewayAuth(params: URLSearchParams): Promise<{
  tokens: Tokens;
  clientInformation: ClientInfo;
}> {
  const error = params.get("error");
  if (error) throw new Error(`Authorization server returned "${error}".`);

  const flow = pending;
  if (!flow) throw new Error("No authorization in progress.");

  const code = params.get("code");
  if (!code) throw new Error("Callback carried no authorization code.");

  // CSRF: a callback that doesn't match the state we issued isn't ours.
  if (params.get("state") !== flow.state) throw new Error("State mismatch.");

  const tokens = await exchangeAuthorization(flow.asUrl, {
    metadata: flow.metadata,
    clientInformation: flow.clientInformation,
    authorizationCode: code,
    iss: params.get("iss") ?? undefined, // <- the bit Mastra drops
    codeVerifier: flow.codeVerifier,
    redirectUri: flow.redirectUri,
    resource: flow.resource,
  });

  pending = null;
  return { tokens, clientInformation: flow.clientInformation };
}

export const authInProgress = () => !!pending;
