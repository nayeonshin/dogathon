/** The agentic part. A plain agent loop whose tools all come from the MCP
 *  gateway — no Arcade SDK anywhere in this file, and no API key or user id. */
import { Agent } from "@mastra/core/agent";
import { MODEL, SLACK_CHANNEL } from "./config.js";
import { gatewayTools, gatewayUrl } from "./gateway.js";
import { ORG, SHEET_TITLE } from "./dogs.js";
import type { Application } from "./arcade.js";

export type TriageEvent =
  | { kind: "step"; text: string }
  | { kind: "tool"; name: string }
  | { kind: "tool-result"; name: string; ok: boolean }
  | { kind: "done"; summary: string }
  | { kind: "rejected"; reason: string }
  | { kind: "error"; message: string };

/** Tool names are NOT hardcoded here on purpose.
 *
 *  Mastra namespaces MCP tools by server name, so `Slack_SendMessage` arrives as
 *  something like `arcade_Slack_SendMessage`. Naming them in the prompt would
 *  couple this text to that scheme and break when it changes. Describe the goal
 *  and let the model match it to the tools it was handed. */
function instructions() {
  const today = new Date().toISOString().slice(0, 10);
  return `You are the intake coordinator for ${ORG}, a dog rescue.
Today is ${today}. All times are America/Los_Angeles.

You will be given ONE email that arrived through the rescue's application form.

FIRST, decide whether it is a real adoption application. The form is public, so
it catches spam: marketing pitches, SEO and web-design solicitations, crypto,
link farms, and empty gibberish all arrive with the same subject line as a
genuine application. A real application talks about a specific dog and the
applicant's own living situation.

If it is NOT a real application:
  - Take NO actions. Do not touch the spreadsheet, Slack, the calendar or email.
  - Reply with exactly: REJECTED: <one short sentence on why>
  - Stop. Do not try to be helpful with it.

If it IS a real application, handle it end to end:

1. Read the applicant's name, email, phone and the dog they want from the email
   body. The body is the source of truth — the sender address is a shared intake
   inbox, not the applicant.
2. Find the spreadsheet titled "${SHEET_TITLE}". Inspect it to see where the
   data ends, then append exactly ONE row in this column order:
   Applicant Name, Email, Phone, Dog of Interest, Application Date (${today}),
   Status ("New"), Assigned Volunteer (leave blank), Meet & Greet (the time you
   book in step 4).
3. Post a message to the Slack channel "${SLACK_CHANNEL}" so a volunteer can
   claim this applicant. Name the applicant and the dog, and say when the
   meet-and-greet is.
4. Book a 30-minute calendar event titled "Meet & greet: <applicant> + <dog>".
   If the applicant said when they are available — a named day, "weekends only",
   "mornings", "after 6pm", "mid-week" — pick the soonest slot that actually
   honours it. If they said nothing, use the next weekday at 10:00 AM. Business
   hours only, 9:00 AM to 6:00 PM Pacific, and never in the past.
   Use ISO 8601 datetimes.
5. DRAFT a warm, specific reply to the applicant. Reference something concrete
   they wrote. Confirm the meet-and-greet time. Sign it "${ORG}".

Rules:
- Reversible actions (spreadsheet row, Slack post, calendar hold) you do
  yourself. The reply to a real person is only ever DRAFTED, never sent — a
  human presses send. This distinction is deliberate; do not shortcut it.
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
        id: "triage",
        name: `${ORG} intake`,
        instructions: instructions(),
        model: MODEL,
        tools: await gatewayTools(),
      }),
    };
  }
  return cached.agent;
}

export async function triage(app: Application, emit: (e: TriageEvent) => void) {
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
