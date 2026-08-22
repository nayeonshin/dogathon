/** The harness: a local server that turns the triage agent into an ambient one.
 *
 *  Two layers, kept deliberately apart:
 *    - Arcade SDK (API key + user id): pre-authorizes Google and Slack, polls
 *      Gmail, sends the demo emails. Plumbing.
 *    - MCP gateway: every tool call the agent makes. See GATEWAY_AUTH for how
 *      this client authenticates to it.
 *
 *  Three phases, and the UI only shows what the current one needs:
 *    connect -> gateway -> ready
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";

import { PORT, FOSTER_PORT, POLL_MS, SLACK_CHANNEL, ARCADE_USER_ID } from "./config.js";
import {
  awaitConnect,
  fetchApplications,
  FOSTER_QUERY,
  providerState,
  sendDemoEmail,
  startConnect,
} from "./arcade.js";
import {
  gatewayConfigured,
  gatewayConnected,
  gatewayNeedsAuthorize,
  gatewayUrl,
  restoreGateway,
  setGateway,
  startGatewayAuth,
  storeGatewayTokens,
} from "./gateway.js";
import { completeGatewayAuth } from "./oauth.js";
import { triage, type TriageEvent } from "./triage.js";
import { fosterTriage } from "./foster-triage.js";
import { formToEmail, GENUINE_SAMPLES, SPAM_SAMPLES } from "./applications.js";
import { fosterFormToEmail, FOSTER_SAMPLES, FOSTER_SPAM } from "./fosters.js";
import { DOGS, ORG } from "./dogs.js";

type Feed =
  | { type: "log"; level: "info" | "warn" | "error"; text: string }
  | { type: "email"; subject: string; from: string }
  | { type: "triage"; event: TriageEvent }
  | { type: "tick"; at: number; every: number; ignored: number };

const adoptionSubs = new Set<(f: Feed) => void>();
const fosterSubs = new Set<(f: Feed) => void>();

const publishTo = (subs: Set<(f: Feed) => void>, f: Feed) => {
  for (const send of subs) send(f);
};
const publishAdoption = (f: Feed) => publishTo(adoptionSubs, f);
const publishFoster = (f: Feed) => publishTo(fosterSubs, f);
const publishAll = (f: Feed) => {
  publishAdoption(f);
  publishFoster(f);
};

const log = (text: string, level: "info" | "warn" | "error" = "info") => {
  console.log(`[${level}] ${text}`);
  publishAll({ type: "log", level, text });
};

const app = new Hono();
const fosterApp = new Hono();

/** Serve a page from public/, substituting the brand.
 *
 *  Read per request rather than cached, so editing the HTML mid-workshop only
 *  needs a browser refresh. */
const page = (file: string) =>
  readFileSync(join(process.cwd(), "public", file), "utf8").replaceAll("{{ORG}}", ORG);

function consolePage(kind: "adoption" | "foster") {
  const foster = kind === "foster";
  return page("index.html")
    .replaceAll("{{CONSOLE_TITLE}}", foster ? "foster intake" : "intake")
    .replaceAll("{{HEADING}}", foster ? "Foster intake" : "Application intake")
    .replaceAll(
      "{{LEDE}}",
      foster
        ? "An agent that reads foster applications and files them. First, let it act on your behalf."
        : "An agent that reads adoption applications and files them. First, let it act on your behalf.",
    )
    .replaceAll("{{SEND_LABEL}}", foster ? "Send foster application" : "Send application")
    .replaceAll("{{IDLE}}", foster ? "Waiting for the first foster application" : "Waiting for the first application")
    .replaceAll("{{REJECT_PREFIX}}", foster ? "Not a foster application — " : "Not an application — ");
}

app.get("/", (c) => c.html(consolePage("adoption")));

function mountOps(h: Hono, subs: Set<(f: Feed) => void>) {
h.get("/api/state", async (c) => {
  const providers = await providerState();
  const allConnected = providers.length > 0 && providers.every((p) => p.connected);
  const next = providers.find((p) => !p.connected) ?? null;
  return c.json({
    userId: ARCADE_USER_ID,
    channel: SLACK_CHANNEL,
    phase: !allConnected ? "connect" : gatewayConnected() ? "ready" : "gateway",
    providers,
    next,
    step: {
      done: providers.filter((p) => p.connected).length,
      total: providers.length,
    },
    gateway: {
      url: gatewayUrl(),
      configured: gatewayConfigured(),
      connected: gatewayConnected(),
      needsAuthorize: gatewayNeedsAuthorize(),
    },
  });
});

/** Providers with a completion watcher already running, so clicking Connect
 *  twice doesn't produce two waiters and two duplicate log lines. */
const awaiting = new Set<string>();

/** Consent for the next unconnected provider, one per click.
 *
 *  See startConnect() for why this isn't both at once. The client relabels its
 *  button from /api/state, so after Google completes the same button reads
 *  "Connect Slack". */
h.post("/api/connect", async (c) => {
  const only = new URL(c.req.url).searchParams.get("provider") ?? undefined;
  try {
    const flow = await startConnect(only);
    if (!flow) {
      log("Already connected.");
      return c.json({ ok: true, flow: null });
    }
    if (flow.authId && !awaiting.has(flow.id)) {
      awaiting.add(flow.id);
      log(`Waiting for ${flow.label} authorization…`);
      awaitConnect(flow.authId)
        .then(() => log(`${flow.label} connected.`))
        .catch((e) => log(`${flow.label} authorization failed: ${e.message}`, "error"))
        .finally(() => awaiting.delete(flow.id));
    }
    return c.json({ ok: true, flow });
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    log(`Could not start authorization: ${error}`, "error");
    return c.json({ ok: false, error }, 500);
  }
});

/** Point the agent at a gateway. A step the attendee performs and watches, which
 *  is why it lives in the UI rather than in .env. */
h.post("/api/gateway", async (c) => {
  const { url } = (await c.req.json()) as { url?: string };
  if (!url) return c.json({ ok: false, error: "No URL provided." }, 400);
  try {
    const connected = await setGateway(url);
    log(connected ? "Gateway connected." : "Gateway set — needs authorization.");
    return c.json({ ok: true, connected });
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    log(`Gateway rejected: ${error}`, "error");
    return c.json({ ok: false, error }, 400);
  }
});

/** Starts the browser leg of the gateway OAuth flow and hands back the URL.
 *  The exchange happens in /oauth/callback below. */
h.post("/api/authorize/gateway", async (c) => {
  try {
    const url = await startGatewayAuth();
    log("Opening gateway authorization…");
    return c.json({ ok: true, url });
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    log(`Could not start gateway authorization: ${error}`, "error");
    return c.json({ ok: false, error }, 400);
  }
});

h.get("/api/events", (c) =>
  streamSSE(c, async (stream) => {
    const send = (f: Feed) => void stream.writeSSE({ data: JSON.stringify(f) });
    subs.add(send);
    await new Promise<void>((resolve) => stream.onAbort(resolve));
    subs.delete(send);
  }),
);
}

mountOps(app, adoptionSubs);

/** Where the authorization server sends the browser back.
 *
 *  Running this ourselves rather than via Mastra's loopback server is the entire
 *  workaround: we read `iss` off the query string and pass it to the token
 *  exchange, which Mastra's callback does not do. */
app.get("/oauth/callback", async (c) => {
  const params = new URL(c.req.url).searchParams;
  try {
    const { tokens, clientInformation } = await completeGatewayAuth(params);
    const connected = await storeGatewayTokens(clientInformation, tokens);
    log(connected ? "Gateway authorized. Watching for applications." : "Gateway authorized, but it returned no tools.", connected ? "info" : "warn");
    return c.html("<title>Connected</title><body style=\"font:16px system-ui;padding:3rem\">Gateway connected. You can close this tab.</body>");
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    log(`Gateway authorization failed: ${error}`, "error");
    return c.html(`<title>Failed</title><body style="font:16px system-ui;padding:3rem">Authorization failed. Check the server log.</body>`, 400);
  }
});

/** The public application form.
 *
 *  This is the trigger the audience can actually see. Two windows side by side:
 *  a form that anyone could fill in, and the operator's console. Nothing links
 *  them except an email in a mailbox.
 *
 *  The dog list is injected from dogs.ts rather than hardcoded in the HTML, so
 *  the roster still has exactly one source of truth. */
app.get("/apply", (c) => {
  const options = DOGS.map(
    (d) => `<option value="${d.name}">${d.name} — ${d.breed}, ${d.age}</option>`,
  ).join("");
  // Samples are injected rather than duplicated in the HTML, so the form's
  // prefill and the console's fallback button read the same list.
  const samples = JSON.stringify({ genuine: GENUINE_SAMPLES, spam: SPAM_SAMPLES });
  return c.html(
    page("apply.html")
      .replace("<!--DOGS-->", options)
      .replace('"<!--SAMPLES-->"', samples),
  );
});

/** Accept a submission and email it to the intake inbox.
 *
 *  Note what this route does NOT do: it does not trigger triage, or tell the
 *  console anything. It sends an email and stops. The agent finds out the same
 *  way it would find out about a form on a real website — by polling the
 *  mailbox. Wiring this straight to triage() would make the demo a lie. */
app.post("/apply", async (c) => {
  try {
    const submission = (await c.req.json()) as Record<string, unknown>;
    const { subject, body } = formToEmail(submission);
    await sendDemoEmail({ subject, body });
    console.log(`[info] form submission: ${subject}`);
    return c.json({ ok: true });
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    log(`Form submission failed to send: ${error}`, "error");
    return c.json({ ok: false, error }, 500);
  }
});

/** Foster site on FOSTER_PORT. Same `/` console and `/apply` form as 4111. */
const fosterPage = () => {
  const options = DOGS.map(
    (d) => `<option value="${d.name}">${d.name} — ${d.breed}, ${d.age}</option>`,
  ).join("");
  const samples = JSON.stringify({ genuine: FOSTER_SAMPLES, spam: FOSTER_SPAM });
  return page("foster.html")
    .replace("<!--DOGS-->", options)
    .replace('"<!--SAMPLES-->"', samples);
};

mountOps(fosterApp, fosterSubs);
fosterApp.get("/", (c) => c.html(consolePage("foster")));
fosterApp.get("/apply", (c) => c.html(fosterPage()));

fosterApp.post("/apply", async (c) => {
  try {
    const submission = (await c.req.json()) as Record<string, unknown>;
    const { subject, body } = fosterFormToEmail(submission);
    await sendDemoEmail({ subject, body });
    console.log(`[info] foster form submission: ${subject}`);
    return c.json({ ok: true });
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    log(`Foster form submission failed to send: ${error}`, "error");
    return c.json({ ok: false, error }, 500);
  }
});

fosterApp.post("/api/demo-email", async (c) => {
  const params = new URL(c.req.url).searchParams;
  const spam = params.get("kind") === "spam";
  const pool = spam ? FOSTER_SPAM : FOSTER_SAMPLES;
  const sample = pool[Number(params.get("i") ?? 0) % pool.length];
  try {
    await sendDemoEmail(fosterFormToEmail(sample));
    log(
      spam
        ? `Foster form spam sent: ${sample.name}`
        : `Foster application sent: ${sample.name} → ${sample.dog}`,
    );
    return c.json({ ok: true });
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    log(`Could not send foster demo: ${error}`, "error");
    return c.json({ ok: false, error }, 500);
  }
});

app.post("/api/demo-email", async (c) => {
  const params = new URL(c.req.url).searchParams;
  const spam = params.get("kind") === "spam";
  const pool = spam ? SPAM_SAMPLES : GENUINE_SAMPLES;
  const sample = pool[Number(params.get("i") ?? 0) % pool.length];
  try {
    await sendDemoEmail(formToEmail(sample));
    log(
      spam
        ? `Form spam sent: ${sample.name}`
        : `Application sent: ${sample.name} → ${sample.dog}`,
    );
    return c.json({ ok: true });
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    log(`Could not send: ${error}`, "error");
    return c.json({ ok: false, error }, 500);
  }
});

/** Emails already in the inbox when polling starts are NOT triaged.
 *
 *  Otherwise connecting the gateway would fire a run for every old application
 *  at once — a genuinely bad surprise thirty seconds into a talk. The first poll
 *  only records what it sees. */
const seen = new Set<string>();
let primed = false;
let busy = false;

async function poll() {
  // Nothing to triage with until the gateway is live, and polling before Google
  // is connected just logs 403s. Stay quiet until the setup is actually done.
  if (busy || !gatewayConnected()) return;
  busy = true;
  try {
    const applications = await fetchApplications();

    if (!primed) {
      for (const a of applications) seen.add(a.id);
      primed = true;
      log(`Watching for applications. Ignoring ${applications.length} already in the inbox.`);
      return;
    }

    // Announce every check, including the boring ones. A silent server is
    // indistinguishable from a hung one, and "mail that isn't an application
    // costs nothing" is only convincing if you can watch the nothing happen.
    publishAdoption({ type: "tick", at: Date.now(), every: POLL_MS, ignored: seen.size });

    for (const application of applications.reverse()) {
      if (seen.has(application.id)) continue;
      seen.add(application.id);
      publishAdoption({ type: "email", subject: application.subject, from: application.from });
      await triage(application, (event) => publishAdoption({ type: "triage", event }));
    }
  } catch (e) {
    log(`Poll failed: ${e instanceof Error ? e.message : String(e)}`, "warn");
  } finally {
    busy = false;
  }
}

const fosterSeen = new Set<string>();
let fosterPrimed = false;

async function pollFoster() {
  if (busy || !gatewayConnected()) return;
  busy = true;
  try {
    const applications = await fetchApplications(5, FOSTER_QUERY);

    if (!fosterPrimed) {
      for (const a of applications) fosterSeen.add(a.id);
      fosterPrimed = true;
      log(`Watching for foster applications. Ignoring ${applications.length} already in the inbox.`);
      return;
    }

    publishFoster({ type: "tick", at: Date.now(), every: POLL_MS, ignored: fosterSeen.size });

    for (const application of applications.reverse()) {
      if (fosterSeen.has(application.id)) continue;
      fosterSeen.add(application.id);
      publishFoster({ type: "email", subject: application.subject, from: application.from });
      await fosterTriage(application, (event) => publishFoster({ type: "triage", event }));
    }
  } catch (e) {
    log(`Foster poll failed: ${e instanceof Error ? e.message : String(e)}`, "warn");
  } finally {
    busy = false;
  }
}

serve({ fetch: app.fetch, port: PORT }, async (info) => {
  console.log(`\n  Adoption console → http://localhost:${info.port}`);
  console.log(`  Adoption form → http://localhost:${info.port}/apply`);
  console.log(`  Foster console → http://localhost:${FOSTER_PORT}`);
  console.log(`  Foster form → http://localhost:${FOSTER_PORT}/apply\n`);
  console.log(`  Acting as: ${ARCADE_USER_ID}`);
  console.log(`  Slack channel: #${SLACK_CHANNEL}\n`);

  // Reconnect to the gateway used last time, with any tokens already on disk, so
  // a restart doesn't ask you to redo setup you already did.
  if (await restoreGateway()) log("Gateway restored from last run.");

  setInterval(() => void poll(), POLL_MS);
  setTimeout(() => setInterval(() => void pollFoster(), POLL_MS), Math.floor(POLL_MS / 2));
});

serve({ fetch: fosterApp.fetch, port: FOSTER_PORT });
