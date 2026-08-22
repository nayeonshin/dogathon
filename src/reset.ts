/** Wipe this machine's client-side state so the whole setup flow runs again.
 *
 *      npm run reset
 *
 *  Stop the server FIRST. A running server holds the gateway connection and the
 *  OAuth tokens in memory, and will happily flush them back to disk the next
 *  time it writes — so resetting underneath a live process quietly undoes
 *  itself.
 *
 *  This only touches local files. Revoking the Arcade grants and deleting the
 *  gateway happen in the Arcade dashboard, and are printed as a checklist
 *  below rather than done for you: they affect an account, not a directory.
 */
import { existsSync, unlinkSync } from "node:fs";
import { join } from "node:path";

/** Every piece of state the client persists. In-memory state — the connected
 *  MCP client, the cached tool list, the cached agent, and the set of already
 *  seen emails — needs no cleanup beyond stopping the process. */
const STATE = [
  {
    file: ".arcade-oauth.json",
    what: "gateway OAuth tokens, the registered client id, and a stale PKCE verifier",
  },
  {
    file: ".arcade-gateway",
    what: "the gateway URL used last run",
  },
];

console.log("\n  Resetting local state\n");

let removed = 0;
for (const { file, what } of STATE) {
  const path = join(process.cwd(), file);
  if (existsSync(path)) {
    unlinkSync(path);
    console.log(`  removed  ${file}`);
    console.log(`           ${what}`);
    removed += 1;
  } else {
    console.log(`  absent   ${file}`);
  }
}

console.log(
  removed
    ? "\n  Local state cleared.\n"
    : "\n  Nothing to clear — this machine was already reset.\n",
);

console.log(`  Do these in the dashboards, then restart:

    1. Arcade — revoke the Google and Slack connections for your user id,
       under Auth in the dashboard: https://app.arcade.dev

    2. Arcade — delete the MCP gateway
       https://app.arcade.dev/mcp-gateways

       When you recreate it, set auth to "Members of this Project
       (Arcade Auth)". Picking "Arcade Headers" changes what you are
       testing: the API key goes on the transport and the OAuth flow this
       demo exists to show never runs.

    3. Optional, and only for a true first-run rehearsal. Revoking at Arcade
       clears Arcade's copy of the token, but Google and Slack still remember
       that you approved the app once, so the consent screen may fly past
       without showing you the scopes. To see what an attendee sees:

         Google  https://myaccount.google.com/permissions   (remove Arcade)
         Slack   your workspace → Manage apps               (remove Arcade)

    4. npm start

  You should land on a single "Connect Google & Slack" button. If you see the
  gateway box or the demo buttons instead, something above did not take.
`);
