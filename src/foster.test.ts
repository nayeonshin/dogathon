import assert from "node:assert/strict";
import test from "node:test";
import { FosterDomainError, FosterPlacementStore } from "./foster.js";
import { FosterCalendarExecutionError, performCalendarAction } from "./foster-calendar.js";

const fixedNow = new Date("2026-08-22T18:00:00.000Z");
const makeStore = () => new FosterPlacementStore(() => new Date(fixedNow));

test("deterministic rules identify eligible, excluded, and review candidates", () => {
  const store = makeStore();
  const state = store.createRequest();
  const byId = Object.fromEntries(state.evaluations.map((evaluation) => [evaluation.fosterId, evaluation]));

  assert.equal(byId.maya.result, "eligible");
  assert.equal(byId.maya.score, 100);
  assert.ok(byId.maya.checks.every((check) => check.result === "pass"));
  assert.equal(byId.jordan.result, "excluded");
  assert.match(byId.jordan.summary, /cats/i);
  assert.equal(byId.priya.result, "needs_review");
  assert.match(byId.priya.summary, /reconfirmed/i);
});

test("stale availability can be refreshed without overriding hard exclusions", () => {
  const store = makeStore();
  store.createRequest();
  const refreshed = store.refreshAvailability("priya");
  assert.equal(refreshed.evaluations.find((item) => item.fosterId === "priya")?.result, "eligible");
  assert.equal(refreshed.evaluations.find((item) => item.fosterId === "jordan")?.result, "excluded");
});

test("outreach requires eligible recipients and explicit approval", () => {
  const store = makeStore();
  store.createRequest();
  assert.throws(
    () => store.prepareOutreach("foster_luna_001", ["jordan"], { jordan: "Hello" }),
    (error: unknown) => error instanceof FosterDomainError && error.code === "invalid_recipient",
  );

  const prepared = store.prepareOutreach("foster_luna_001", ["maya"], { maya: "Hello Maya" });
  assert.equal(prepared.request.state, "awaiting_outreach_approval");
  assert.equal(prepared.outreach[0].approved, false);
  const approved = store.approveOutreach("foster_luna_001");
  assert.equal(approved.request.state, "awaiting_responses");
  assert.ok(approved.outreach[0].responseToken);
});

test("response links accept one idempotent answer and lock conflicting repeats", () => {
  const store = makeStore();
  store.createRequest();
  store.prepareOutreach("foster_luna_001", ["maya"], { maya: "Hello Maya" });
  const approved = store.approveOutreach("foster_luna_001");
  const token = approved.outreach[0].responseToken!;
  const slot = approved.request.handoffSlots[0];

  store.submitResponse(token, { answer: "yes", preferredSlot: slot, question: "Is food provided?" });
  const repeated = store.submitResponse(token, { answer: "yes", preferredSlot: slot, question: "Is food provided?" });
  assert.equal(repeated.responses.length, 1);
  assert.throws(
    () => store.submitResponse(token, { answer: "no" }),
    (error: unknown) => error instanceof FosterDomainError && error.code === "response_locked",
  );
  assert.throws(
    () => store.getResponseContext("bad-token"),
    (error: unknown) => error instanceof FosterDomainError && error.code === "invalid_token",
  );
});

test("yes, no, and maybe responses preserve questions and closed campaigns reject changes", () => {
  const store = makeStore();
  store.createRequest();
  store.refreshAvailability("priya");
  store.prepareOutreach("foster_luna_001", ["maya", "priya"], { maya: "Hello Maya", priya: "Hello Priya" });
  const approved = store.approveOutreach("foster_luna_001");
  const maya = approved.outreach.find((item) => item.fosterId === "maya")!;
  const priya = approved.outreach.find((item) => item.fosterId === "priya")!;
  store.submitResponse(maya.responseToken!, { answer: "yes", question: "Is food provided?" });
  store.submitResponse(priya.responseToken!, { answer: "maybe", question: "Can staff help with transport?" });
  assert.deepEqual(store.snapshot().responses.map((item) => item.answer), ["yes", "maybe"]);

  const declined = makeStore();
  declined.createRequest();
  declined.prepareOutreach("foster_luna_001", ["maya"], { maya: "Hello Maya" });
  const declineToken = declined.approveOutreach("foster_luna_001").outreach[0].responseToken!;
  assert.equal(declined.submitResponse(declineToken, { answer: "no", question: "Out of town" }).responses[0].answer, "no");

  store.selectPlacement("foster_luna_001", "maya", "priya");
  const slot = store.snapshot().request.handoffSlots[0];
  store.beginCalendar("foster_luna_001", slot);
  store.finishCalendarSuccess("exec", "event");
  store.confirmHandoff("foster_luna_001");
  store.close("foster_luna_001", "SL-DEMO");
  assert.throws(() => store.submitResponse(maya.responseToken!, { answer: "yes" }), FosterDomainError);
});

test("selection rejects declined, excluded, duplicate, and missing candidates", () => {
  const store = makeStore();
  store.createRequest();
  store.refreshAvailability("priya");
  store.prepareOutreach("foster_luna_001", ["maya", "priya"], { maya: "Hello", priya: "Hello" });
  const approved = store.approveOutreach("foster_luna_001");
  store.submitResponse(approved.outreach[0].responseToken!, { answer: "yes" });
  store.submitResponse(approved.outreach[1].responseToken!, { answer: "no" });
  assert.throws(() => store.selectPlacement("foster_luna_001", "maya", "priya"), FosterDomainError);
  assert.throws(() => store.selectPlacement("foster_luna_001", "maya", "maya"), FosterDomainError);
  assert.throws(() => store.selectPlacement("foster_luna_001", "jordan", "maya"), FosterDomainError);
});

test("primary, backup, Calendar, handoff, and Shelterluv closure form a gated loop", () => {
  const store = makeStore();
  store.createRequest();
  store.refreshAvailability("priya");
  store.prepareOutreach("foster_luna_001", ["maya", "priya"], { maya: "Hello Maya", priya: "Hello Priya" });
  const approved = store.approveOutreach("foster_luna_001");
  const maya = approved.outreach.find((item) => item.fosterId === "maya")!;
  const priya = approved.outreach.find((item) => item.fosterId === "priya")!;
  store.submitResponse(maya.responseToken!, { answer: "yes", preferredSlot: approved.request.handoffSlots[0] });
  store.submitResponse(priya.responseToken!, { answer: "maybe", preferredSlot: approved.request.handoffSlots[1], question: "Could transport help?" });

  const selected = store.selectPlacement("foster_luna_001", "maya", "priya");
  assert.equal(selected.request.state, "awaiting_schedule");
  store.prepareReminder("foster_luna_001", "confirmation", "Please confirm the handoff details.");
  const intent = store.beginCalendar("foster_luna_001", approved.request.handoffSlots[0]);
  assert.equal(intent.fosterName, "Maya Chen");
  store.finishCalendarFailure("provider unavailable");
  assert.equal(store.snapshot().request.state, "awaiting_schedule");

  store.beginCalendar("foster_luna_001", approved.request.handoffSlots[0]);
  const scheduled = store.finishCalendarSuccess("exec_demo", "event_demo");
  assert.equal(scheduled.request.state, "scheduled");
  assert.throws(() => store.beginCalendar("foster_luna_001", approved.request.handoffSlots[0]), FosterDomainError);
  assert.equal(store.confirmHandoff("foster_luna_001").request.state, "placed");
  const closed = store.close("foster_luna_001", "SL-DEMO-LUNA-1042");
  assert.equal(closed.request.state, "closed");
  assert.equal(closed.receipts.at(-2)?.result, "manual");
  assert.match(closed.receipts.at(-2)?.summary ?? "", /not connected/i);
});

test("invalid transitions do not mutate state", () => {
  const store = makeStore();
  const before = store.snapshot();
  assert.throws(() => store.approveOutreach("foster_luna_001"), FosterDomainError);
  assert.deepEqual(store.snapshot(), before);
});

test("closure requires a scheduled handoff and a manual record reference", () => {
  const store = makeStore();
  assert.throws(() => store.close("foster_luna_001", "SL-DEMO"), FosterDomainError);

  store.createRequest();
  assert.throws(() => store.confirmHandoff("foster_luna_001"), FosterDomainError);
  assert.throws(() => store.close("foster_luna_001", ""), FosterDomainError);
});

function calendarReadyStore() {
  const store = makeStore();
  store.createRequest();
  store.refreshAvailability("priya");
  store.prepareOutreach("foster_luna_001", ["maya", "priya"], { maya: "Hello", priya: "Hello" });
  const approved = store.approveOutreach("foster_luna_001");
  store.submitResponse(approved.outreach[0].responseToken!, { answer: "yes" });
  store.submitResponse(approved.outreach[1].responseToken!, { answer: "maybe" });
  store.selectPlacement("foster_luna_001", "maya", "priya");
  return store;
}

test("Calendar executor is gated, retryable, and deduplicated", async () => {
  const requestId = "foster_luna_001";
  const store = calendarReadyStore();
  const slot = store.snapshot().request.handoffSlots[0];
  let executions = 0;
  const success = async () => {
    executions += 1;
    return { executionId: "exec_stub", eventReference: "event_stub" };
  };

  await assert.rejects(
    performCalendarAction(store, requestId, slot, false, success),
    (error: unknown) => error instanceof FosterDomainError && error.code === "approval_required",
  );
  assert.equal(executions, 0);

  const result = await performCalendarAction(store, requestId, slot, true, success);
  assert.equal(result.state.request.state, "scheduled");
  assert.equal(executions, 1);
  await assert.rejects(performCalendarAction(store, requestId, slot, true, success), FosterDomainError);
  assert.equal(executions, 1);
});

test("Calendar authorization and provider failures retain scheduling state", async () => {
  for (const message of ["authorization required", "provider unavailable"]) {
    const store = calendarReadyStore();
    const slot = store.snapshot().request.handoffSlots[0];
    await assert.rejects(
      performCalendarAction(store, "foster_luna_001", slot, true, async () => {
        throw new Error(message);
      }),
      (error: unknown) => error instanceof FosterCalendarExecutionError && error.message === message,
    );
    const state = store.snapshot();
    assert.equal(state.request.state, "awaiting_schedule");
    assert.equal(state.placement.calendarAction?.status, "failed");
    assert.equal(state.receipts.at(-1)?.result, "failed");
  }
});
