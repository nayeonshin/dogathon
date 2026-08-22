import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const htmlUrl = new URL("../public/platform.html", import.meta.url);
const scriptUrl = new URL("../public/platform.js", import.meta.url);

test("shared platform surface exposes the critical workflows and controls", async () => {
  const html = await readFile(htmlUrl, "utf8");

  for (const label of [
    "Organization workspace",
    "Adoption",
    "Foster",
    "Proposed actions",
    "Reminders",
    "Receipts &amp; errors",
    "Event timeline",
    "Partner capacity exchange",
    "Capacity offers",
    "Share grant",
    "Handoff",
  ]) {
    assert.match(html, new RegExp(label), `missing critical label: ${label}`);
  }
});

test("shared platform surface states its safety and privacy boundaries", async () => {
  const html = await readFile(htmlUrl, "utf8");
  const script = await readFile(scriptUrl, "utf8");

  assert.match(html, /demo organization isolation, not production tenant security/i);
  assert.match(html, /All records and people are synthetic/i);
  assert.match(html, /Personal foster data is never globally searchable/i);
  assert.match(html, /No action runs without named approval/i);
  assert.match(html, /No live provider action was executed/i);
  assert.match(script, /idempotency key/i);
  assert.match(script, /No duplicate was created/i);
  assert.doesNotMatch(html, /chat/i, "operator surface must not be framed as chat");
});

test("surface uses semantic, keyboard-friendly controls and local assets", async () => {
  const html = await readFile(htmlUrl, "utf8");
  const script = await readFile(scriptUrl, "utf8");

  assert.match(html, /<main\b/);
  assert.match(html, /role="tablist"/);
  assert.match(html, /aria-live="polite"/);
  assert.match(html, /<label for="organization">/);
  assert.match(script, /ArrowLeft/);
  assert.match(script, /ArrowRight/);
  assert.doesNotMatch(html, /https?:\/\//, "demo should have no external runtime dependencies");
});
