import "dotenv/config";

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing ${name} in .env — copy .env.example and fill it in.`);
  return v;
}

/** The Arcade API key and user id are used for exactly two things: polling Gmail
 *  and running the pre-authorization flows that connect Google and Slack. The
 *  agent never sees either — its identity comes from the gateway's OAuth flow. */
export const ARCADE_API_KEY = required("ARCADE_API_KEY");
export const ARCADE_USER_ID = required("ARCADE_USER_ID");

export const SLACK_CHANNEL = process.env.SLACK_CHANNEL ?? "adoptions";

/** Channel the Slack foster bot lives in. Create it, join it, type `apply-foster`.
 *  Hyphenated so Slack does not treat it as a slash command. Arcade posts as you,
 *  so you have to be a member. */
export const FOSTER_SLACK_CHANNEL =
  process.env.FOSTER_SLACK_CHANNEL ?? "submit-foster-applications";

/** Optional prefill for the gateway URL box. The gateway is entered in the UI at
 *  runtime, so this is a convenience for rehearsals, not a requirement. */
export const GATEWAY_URL_DEFAULT = process.env.ARCADE_GATEWAY_URL
  ?? (process.env.ARCADE_GATEWAY_SLUG ? `https://api.arcade.dev/mcp/${process.env.ARCADE_GATEWAY_SLUG}` : "");

/** How the MCP client authenticates TO the gateway. Not how the agent calls
 *  tools — that is always MCP either way.
 *
 *  "oauth"   — gateway set to "Members of this Project (Arcade Auth)".
 *              The default, and what you want. The browser leg is driven by
 *              src/oauth.ts rather than @mastra/mcp's own helper, because
 *              Mastra's OAuth callback parses only code/state/error and drops
 *              the RFC 9207 `iss` parameter, which makes the MCP SDK throw
 *              IssuerMismatchError against any authorization server that
 *              advertises support for it — as Arcade's correctly does.
 *  "headers" — gateway set to "Arcade Headers". Puts the API key on this one
 *              transport hop, which defeats the point of the demo. Kept as an
 *              escape hatch, not a recommendation. */
export const GATEWAY_AUTH = (process.env.GATEWAY_AUTH ?? "oauth") as "oauth" | "headers";

export const PORT = Number(process.env.PORT ?? 4111);
export const POLL_MS = Number(process.env.POLL_MS ?? 10_000);
export const MODEL = process.env.MODEL ?? "anthropic/claude-sonnet-5";

/** Every tool this demo touches.
 *
 *  Arcade issues scopes per tool, so asking tool by tool means five consent
 *  screens. Instead we ask Arcade what each tool needs, union the scopes per
 *  PROVIDER, and request that union once — one Google consent, one Slack. The
 *  scope strings are never hardcoded here; they come from Arcade at runtime so
 *  they cannot drift out of date. */
export const REQUIRED_TOOLS = [
  "Gmail_SearchEmailsByQuery",
  "Gmail_WriteDraftReplyEmail",
  "Gmail_SendEmail", // the demo buttons
  "GoogleSheets_SearchSpreadsheets",
  "GoogleSheets_InspectSpreadsheet",
  "GoogleSheets_CreateOrEditSpreadsheet",
  "GoogleCalendar_CreateEvent",
  "Slack_SendMessage",
  "Slack_GetMessages",
  "Slack_GetThreadMessages",
] as const;

/** Friendly names for Arcade's provider ids. */
export const PROVIDER_LABELS: Record<string, string> = {
  "arcade-google": "Google",
  "arcade-slack": "Slack",
};
