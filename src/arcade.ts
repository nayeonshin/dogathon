/** Arcade SDK = plumbing only.
 *
 *  Three jobs, none of them agentic: pre-authorize the providers, poll Gmail, and
 *  send the demo emails. Every tool call the AGENT makes goes through the MCP
 *  gateway (gateway.ts), which never sees the API key or the user id.
 */
import Arcade from "@arcadeai/arcadejs";
import { ARCADE_API_KEY, ARCADE_USER_ID, PROVIDER_LABELS, REQUIRED_TOOLS } from "./config.js";
import type { CalendarIntent } from "./foster.js";

const arcade = new Arcade({ apiKey: ARCADE_API_KEY });

export type ProviderState = {
  id: string;
  label: string;
  connected: boolean;
};

type Requirement = { id: string; scopes: Set<string>; pending: number };

/** Ask Arcade what each tool requires, then fold it up per provider.
 *
 *  A provider is connected only when every tool that needs it is authorized —
 *  Gmail search, compose and send are three different scopes on one provider. */
async function requirements(): Promise<Map<string, Requirement>> {
  const responses = await Promise.all(
    REQUIRED_TOOLS.map((tool) =>
      arcade.tools.authorize({ tool_name: tool, user_id: ARCADE_USER_ID }),
    ),
  );

  const byProvider = new Map<string, Requirement>();
  for (const r of responses) {
    const id = r.provider_id;
    if (!id) continue;
    const entry = byProvider.get(id) ?? { id, scopes: new Set<string>(), pending: 0 };
    for (const s of r.scopes ?? []) entry.scopes.add(s);
    if (r.status !== "completed") entry.pending += 1;
    byProvider.set(id, entry);
  }
  return byProvider;
}

/** Google first, then Slack, then anything else alphabetically.
 *
 *  The order is load-bearing now that consent is sequential: the UI labels its
 *  button from the first unconnected provider, so an unstable order would make
 *  the button flip between "Connect Google" and "Connect Slack" between polls. */
const ORDER = ["arcade-google", "arcade-slack"];
const rank = (id: string) => {
  const i = ORDER.indexOf(id);
  return i === -1 ? ORDER.length : i;
};

export async function providerState(): Promise<ProviderState[]> {
  const reqs = await requirements();
  return [...reqs.values()]
    .map((r) => ({
      id: r.id,
      label: PROVIDER_LABELS[r.id] ?? r.id,
      connected: r.pending === 0,
    }))
    .sort((a, b) => rank(a.id) - rank(b.id) || a.id.localeCompare(b.id));
}

export type ConnectFlow = { id: string; label: string; url: string; authId: string };

/** Start consent for ONE provider — the next one that still needs something,
 *  or `only` if named.
 *
 *  Deliberately one at a time. Returning both URLs at once and opening them in
 *  a loop looks tidier but does not work: by the time the fetch resolves the
 *  user gesture is spent, so the browser allows the first window.open and
 *  silently swallows the second. The button then has to be clicked twice with
 *  no indication of why. */
export async function startConnect(only?: string): Promise<ConnectFlow | null> {
  const reqs = await requirements();

  const pending = [...reqs.values()]
    .filter((r) => r.pending > 0)
    .sort((a, b) => rank(a.id) - rank(b.id) || a.id.localeCompare(b.id));

  const req = only ? pending.find((r) => r.id === only) : pending[0];
  if (!req) return null;

  const started = await arcade.auth.start(ARCADE_USER_ID, req.id, {
    scopes: [...req.scopes],
  });
  if (started.status === "completed" || !started.url) return null;

  return {
    id: req.id,
    label: PROVIDER_LABELS[req.id] ?? req.id,
    url: started.url,
    authId: started.id ?? "",
  };
}

/** Blocks until the user finishes the consent screen. */
export async function awaitConnect(authId: string) {
  return arcade.auth.waitForCompletion(authId);
}

export type Application = {
  id: string;
  subject: string;
  from: string;
  body: string;
};

/** Poll for adoption applications.
 *
 *  Deliberately narrow: a subject match rather than `is:unread`, so nothing else
 *  in the attendee's inbox can be mistaken for an application.
 *
 *  `in:inbox` is load-bearing. Gmail search spans drafts, so the reply the agent
 *  writes at the end of a run ("Re: New adoption application: ...") matches this
 *  query and comes back as an application on the next tick — the agent triaging
 *  its own output. `-subject:"Re:"` covers the same loop if the reply is ever
 *  sent rather than drafted, since here the applicant address IS this mailbox.
 *
 *  `result_detail: "full"` is required — without it the tool returns `snippet`
 *  only, and the agent cannot read the applicant's details out of a truncated
 *  preview. Note the parameter is `max_results`; passing `limit` is rejected
 *  outright with "Extra inputs are not permitted".
 *
 *  Throws on failure rather than returning [], so a broken search shows up in
 *  the log instead of looking like a quiet inbox. */
export async function fetchApplications(maxResults = 5): Promise<Application[]> {
  const result = await arcade.tools.execute({
    tool_name: "Gmail_SearchEmailsByQuery",
    input: {
      query: 'in:inbox -subject:"Re:" subject:"New adoption application"',
      max_results: maxResults,
      result_detail: "full",
    },
    user_id: ARCADE_USER_ID,
  });
  if (!result.success) {
    throw new Error(`Gmail search failed: ${JSON.stringify(result.output?.error)}`);
  }
  const value = result.output?.value as Record<string, unknown> | undefined;
  const emails = (value?.emails ?? []) as Record<string, string>[];
  return emails
    .filter((e) => !!e.message_id) // no id means we can't dedupe or reply to it
    .map((e) => ({
      id: e.message_id,
      subject: e.subject ?? "",
      from: e.sender ?? "",
      body: e.body ?? e.snippet ?? "",
    }));
}

/** The demo buttons. Plumbing, so they use the SDK.
 *
 *  Gmail always sends as the authorized user, so this arrives in the attendee's
 *  own inbox from their own address — which reads fine on a projector as a
 *  rescue's shared intake inbox receiving form submissions. */
export async function sendDemoEmail(app: { subject: string; body: string }) {
  const result = await arcade.tools.execute({
    tool_name: "Gmail_SendEmail",
    input: {
      recipient: ARCADE_USER_ID,
      subject: app.subject,
      body: app.body,
      content_type: "plain",
    },
    user_id: ARCADE_USER_ID,
  });
  if (!result.success) throw new Error(String(result.output?.error ?? "send failed"));
  return result.output?.value;
}

/** The foster workflow's sole live external side effect.
 *
 * Matching, outreach, reminders, and Shelterluv reconciliation stay local. This
 * call is reached only after the store has validated the staff-selected foster
 * and slot and marked the action pending. */
export async function createFosterHandoffEvent(intent: CalendarIntent) {
  const attendee = fosterDemoAlias(intent.fosterId);
  const result = await arcade.tools.execute({
    tool_name: "GoogleCalendar_CreateEvent",
    input: {
      calendar_id: "primary",
      summary: intent.summary,
      description: `${intent.description}\n\nDemo foster contact: ${attendee}`,
      start_datetime: intent.slot,
      end_datetime: intent.end,
      location: intent.location,
      visibility: "private",
      attendee_emails: [attendee],
      send_notifications_to_attendees: "all",
      add_google_meet: false,
    },
    user_id: ARCADE_USER_ID,
  });
  if (!result.success) {
    throw new Error(String(result.output?.error ?? "Google Calendar provider failed"));
  }

  const value = (result.output?.value ?? {}) as Record<string, unknown>;
  const executionId = String(result.execution_id ?? value.execution_id ?? value.id ?? "arcade-completed");
  const eventReference = [value.htmlLink, value.html_link, value.event_id, value.id]
    .find((item) => typeof item === "string") as string | undefined;
  return { executionId, eventReference, attendee };
}

function fosterDemoAlias(fosterId: string) {
  const [local, domain] = ARCADE_USER_ID.split("@");
  if (!domain) return ARCADE_USER_ID;
  return `${local}+dogathon-${fosterId}@${domain}`;
}
