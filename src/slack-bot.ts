/** Slack foster bot — the form, asked in #submit-foster-applications.
 *
 *  Join that channel and type `apply-foster` (hyphenated, so Slack does not
 *  treat it as a slash command and casual chat does not trip it). Or hit Call
 *  Slack bot. The bot asks the same questions as /foster-apply in a thread. When the
 *  last answer lands it emails intake and stops. The foster agent then files
 *  the Sheet, drafts a reply, and books the home visit.
 *
 *  Plumbing lives here and in arcade.ts. The agent is not in this loop.
 */
import { FOSTER_SLACK_CHANNEL } from "./config.js";
import { DOGS, ORG } from "./dogs.js";
import {
  getSlackMessages,
  getSlackThread,
  postSlackMessage,
  sendDemoEmail,
  type SlackTarget,
} from "./arcade.js";

export const BOT_MARK = "🐶";
/** Hyphenated on purpose: `/foster` is a Slack slash command, and `foster` is a name. */
export const FOSTER_TRIGGER = "apply-foster";

const dogs = DOGS.map((d) => d.name).join(", ");

/** Same fieldsets as public/foster-apply.html, asked out loud. */
const STEPS = [
  {
    title: "About you",
    prompt:
      `What's your *name*, *email*, *phone*, and *city*?\n` +
      `(same four fields as the website form)`,
  },
  {
    title: "Fostering",
    prompt:
      `Which *dog* can you take — ${dogs}, or Any?\n` +
      `*Available from* (date)? *Available until* (date, or open-ended)?\n` +
      `Have you *fostered before*, or is this your first time?\n` +
      `*Hours* you're typically home?`,
  },
  {
    title: "Your home",
    prompt:
      `*Housing* — house I own, house I rent, apartment/condo, or other?\n` +
      `*Outdoor space* — fenced yard, unfenced yard, or no yard?\n` +
      `*Other pets*? *Children* at home?`,
  },
  {
    title: "Care",
    prompt:
      `Can you *give medication* (pills and drops / willing to learn / no)?\n` +
      `*Vet transport* (yes / weekends only / no)?\n` +
      `Anything else, and *when can a volunteer visit*?`,
  },
];

export type BotEvent =
  | { kind: "started"; channel: string }
  | { kind: "ask"; title: string }
  | { kind: "heard"; title: string }
  | { kind: "submitted"; subject: string }
  | { kind: "cancelled" };

type Session = {
  threadTs: string;
  target: SlackTarget;
  step: number;
  qa: { title: string; prompt: string; answer: string }[];
  seen: Set<string>;
};

const sessions = new Map<string, Session>();
const seenTriggers = new Set<string>();
let primed = false;

const target = (): SlackTarget => ({
  channel_name: FOSTER_SLACK_CHANNEL.replace(/^#/, ""),
});

const channel = () => FOSTER_SLACK_CHANNEL.replace(/^#/, "");

function isBot(text: string) {
  return text.startsWith(BOT_MARK);
}

function isTrigger(text: string) {
  return /^(?:!)?apply-foster\b/i.test(text.trim());
}

function askText(step: number) {
  const s = STEPS[step];
  return `${BOT_MARK} *${s.title}* (${step + 1}/${STEPS.length})\n\n${s.prompt}`;
}

async function ask(session: Session, step: number) {
  const posted = await postSlackMessage(session.target, askText(step), session.threadTs);
  if (posted.ts) session.seen.add(posted.ts);
}

async function begin(threadTs: string, emit: (e: BotEvent) => void): Promise<Session> {
  const session: Session = {
    threadTs,
    target: target(),
    step: 0,
    qa: [],
    seen: new Set([threadTs]),
  };
  sessions.set(threadTs, session);
  seenTriggers.add(threadTs);
  emit({ kind: "started", channel: channel() });
  await ask(session, 0);
  emit({ kind: "ask", title: STEPS[0].title });
  return session;
}

/** Console button. Posts the opener in the foster channel, then asks question 1. */
export async function startFosterBot(emit: (e: BotEvent) => void) {
  const opener =
    `${BOT_MARK} Foster application for ${ORG}. I'll ask the same questions as ` +
    `the website form — reply in this thread. Type *cancel* to stop.`;
  const parent = await postSlackMessage(target(), opener);
  if (!parent.ts) throw new Error("Slack posted the opener but returned no message ts.");
  return begin(parent.ts, emit);
}

function guessName(firstAnswer: string): string {
  const line = firstAnswer.split(/[\n,]/)[0]?.trim() ?? "";
  const noEmail = line.replace(/\S+@\S+/g, "").trim();
  return (noEmail || line).slice(0, 80) || "Slack applicant";
}

function toEmail(session: Session): { subject: string; body: string } {
  const name = guessName(session.qa[0]?.answer ?? "");
  const blocks = session.qa
    .map((q) => `${q.title}:\n${q.answer.trim() || "(no answer)"}`)
    .join("\n\n");

  const body = `A new FOSTER application was submitted through Slack.

The applicant called the foster bot in #${channel()} and answered the
same questions as the ${ORG} website form.

Applicant: ${name}

${blocks}

--
Collected by the Slack foster bot.`;

  return { subject: `New foster application: any — ${name}`, body };
}

async function finish(session: Session, emit: (e: BotEvent) => void) {
  const { subject, body } = toEmail(session);
  await postSlackMessage(
    session.target,
    `${BOT_MARK} Thanks — I sent this to intake. A volunteer will confirm a home visit.`,
    session.threadTs,
  );
  await sendDemoEmail({ subject, body });
  sessions.delete(session.threadTs);
  emit({ kind: "submitted", subject });
}

async function advance(session: Session, emit: (e: BotEvent) => void) {
  const messages = await getSlackThread(session.target, session.threadTs);
  const next = [...messages]
    .sort((a, b) => Number(a.ts) - Number(b.ts))
    .find((m) => m.ts !== session.threadTs && !session.seen.has(m.ts) && !isBot(m.text));

  if (!next) return;
  session.seen.add(next.ts);

  const answer = next.text.trim();
  if (/^cancel\b/i.test(answer)) {
    await postSlackMessage(
      session.target,
      `${BOT_MARK} Cancelled. Type *apply-foster* when you want to try again.`,
      session.threadTs,
    );
    sessions.delete(session.threadTs);
    emit({ kind: "cancelled" });
    return;
  }

  const current = STEPS[session.step];
  session.qa.push({ title: current.title, prompt: current.prompt, answer });
  emit({ kind: "heard", title: current.title });
  session.step += 1;

  if (session.step >= STEPS.length) {
    await finish(session, emit);
    return;
  }

  await ask(session, session.step);
  emit({ kind: "ask", title: STEPS[session.step].title });
}

function isRecent(ts: string, withinMs = 5 * 60_000) {
  return Date.now() - Number(ts) * 1000 < withinMs;
}

/** Watch the foster channel for `apply-foster` and for answers in open threads. */
export async function tickFosterBot(emit: (e: BotEvent) => void) {
  for (const session of [...sessions.values()]) {
    await advance(session, emit);
  }

  // An open form already spent a GetThread call. Skip channel history until it
  // finishes so we do not burn Slack's rate limit looking for a second trigger.
  if (sessions.size > 0) return;

  const messages = await getSlackMessages(target());

  if (!primed) {
    for (const m of messages) {
      // First successful read: skip old chatter, but pick up apply-foster they
      // already typed while we were unauthorized.
      if (isTrigger(m.text) && !isBot(m.text) && isRecent(m.ts) && !sessions.has(m.ts)) {
        await begin(m.ts, emit);
      } else {
        seenTriggers.add(m.ts);
      }
    }
    primed = true;
    return;
  }

  for (const m of messages) {
    if (seenTriggers.has(m.ts) || sessions.has(m.ts)) continue;
    seenTriggers.add(m.ts);
    if (isTrigger(m.text) && !isBot(m.text)) await begin(m.ts, emit);
  }
}
