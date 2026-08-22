/** Foster intake agent. Same MCP tools as adoption triage; different job. */
import { Agent } from "@mastra/core/agent";
import { MODEL, SLACK_CHANNEL } from "./config.js";
import { gatewayTools, gatewayUrl } from "./gateway.js";
import { ORG, FOSTER_SHEET_TITLE } from "./dogs.js";
import type { Application } from "./arcade.js";
import type { TriageEvent } from "./triage.js";

function instructions() {
  const today = new Date().toISOString().slice(0, 10);
  return `You are the foster-home coordinator for ${ORG}, a dog rescue.
Today is ${today}. All times are America/Los_Angeles.

You will be given ONE email that arrived through the rescue's FOSTER application
form — not the adoption form. Foster applicants want to host a dog temporarily.
Some of these emails were collected by a Slack bot asking the same questions as
the website form; treat those as real applications. The body is the source of
truth.

FIRST, decide whether it is a real foster application. The form is public, so it
catches spam: marketing pitches, SEO, CRM demos, crypto, and gibberish all arrive
with the same subject line. A real application talks about housing a dog for a
period of time, their home, and what they can take on.

If it is NOT a real foster application:
  - Take NO actions. Do not touch the spreadsheet, Slack, the calendar or email.
  - Reply with exactly: REJECTED: <one short sentence on why>
  - Stop. Do not try to be helpful with it.

If it IS a real foster application, handle it end to end:

1. Read the applicant's name, email, phone, city, the dog they can foster
   (or Any), available-from and available-until dates, experience, hours home,
   housing, outdoor space, other pets, children, medication, vet transport, and
   notes from the email body. The body is the source of truth — the sender
   address is a shared intake inbox, not the applicant.
2. Find the spreadsheet titled "${FOSTER_SHEET_TITLE}". Inspect it to see where
   the data ends, then append exactly ONE row in this column order:
   Applicant Name, Email, Phone, City, Dog (or Any), Available from, Available
   until, Experience, Hours home, Housing, Outdoor space, Other pets, Children,
   Medication, Vet transport, Notes, Application Date (${today}), Status
   ("New"), Assigned Volunteer (leave blank), Home Visit (the time you book in
   step 4).
3. Post a message to the Slack channel "${SLACK_CHANNEL}" so a volunteer can
   claim this FOSTER home. This is not an adoption. Say it is a foster
   application, name the applicant, their city, the start and end dates they can
   foster, which dog (or any), and when the home visit is. Example tone: "New
   foster application — <name> in <city> can take <dog> from <from> to <until>.
   Home visit <time>. Who can claim this foster home?"
4. Book a 30-minute calendar event titled "Foster home visit: <applicant>".
   If they said when they are available, pick the soonest slot that honours it.
   If they said nothing, use the next weekday at 10:00 AM. Business hours only,
   9:00 AM to 6:00 PM Pacific, and never in the past. Use ISO 8601 datetimes.
5. DRAFT a warm, specific reply to the applicant about fostering — not adopting.
   Reference something concrete they wrote. Confirm the home-visit time. Sign it
   "${ORG}".

Rules:
- Reversible actions (spreadsheet row, Slack post, calendar hold) you do
  yourself. The reply to a real person is only ever DRAFTED, never sent.
- If a tool returns an authorization URL instead of a result, stop and report
  that URL. Do not retry in a loop.
- Never repeat a step that already succeeded.
- Finish with a two-line summary naming each artifact you created.`;
}

let cached: { url: string; agent: Agent } | null = null;

async function agent(): Promise<Agent> {
  const url = gatewayUrl();
  if (cached?.url !== url) {
    cached = {
      url,
      agent: new Agent({
        id: "foster-triage",
        name: `${ORG} foster intake`,
        instructions: instructions(),
        model: MODEL,
        tools: await gatewayTools(),
      }),
    };
  }
  return cached.agent;
}

export async function fosterTriage(app: Application, emit: (e: TriageEvent) => void) {
  const prompt = [
    `Subject: ${app.subject}`,
    `From: ${app.from}`,
    `Message-Id: ${app.id}`,
    "",
    app.body,
  ].join("\n");

  try {
    const result = await (await agent()).generate(prompt, {
      maxSteps: 12,
      onChunk: (chunk: { type?: string; payload?: Record<string, unknown> }) => {
        const name = String(chunk?.payload?.toolName ?? "");
        if (chunk?.type === "tool-call" && name) emit({ kind: "tool", name });
        if (chunk?.type === "tool-result" && name) {
          emit({ kind: "tool-result", name, ok: !chunk?.payload?.isError });
        }
      },
      onStepFinish: (step: { text?: string }) => {
        const text = step?.text?.trim();
        if (text && !text.startsWith("REJECTED:")) emit({ kind: "step", text });
      },
    } as never);

    const summary = (result as { text?: string })?.text?.trim() ?? "";
    if (summary.startsWith("REJECTED:")) {
      emit({ kind: "rejected", reason: summary.replace(/^REJECTED:\s*/, "") });
    } else {
      emit({ kind: "done", summary });
    }
  } catch (err) {
    emit({ kind: "error", message: err instanceof Error ? err.message : String(err) });
  }
}
