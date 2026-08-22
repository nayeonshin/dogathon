import assert from "node:assert/strict";
import test from "node:test";
import {
  ActionExecutor,
  type HumanApproval,
  type ProposedAction,
  type ToolInvocationContext,
  type ToolInvocationResult,
  type ToolInvoker,
} from "../src/platform/integrations/index.js";
import { InMemoryReminderStore, ReminderService } from "../src/platform/reminders.js";
import { PlatformActionExecutorAdapter } from "../src/platform/integrations/platform-adapter.js";
import type {
  Approval as PlatformApproval,
  ProposedAction as PlatformProposedAction,
} from "../src/platform/types.js";

class FakeInvoker implements ToolInvoker {
  calls: Array<{ toolName: string; input: Record<string, unknown>; context: ToolInvocationContext }> = [];
  result: ToolInvocationResult = { ok: true, value: { messageId: "msg-1" }, externalId: "msg-1" };

  async invoke(toolName: string, input: Record<string, unknown>, context: ToolInvocationContext) {
    this.calls.push({ toolName, input, context });
    return this.result;
  }
}

const baseAction = (overrides: Partial<ProposedAction> = {}): ProposedAction => ({
  id: "action-1",
  organizationId: "rescue-a",
  caseId: "case-1",
  kind: "gmail.send",
  input: { recipient: "foster@example.test", subject: "Luna", body: "Can you help?" },
  idempotencyKey: "case-1:foster-outreach:1",
  proposedBy: "workflow:foster",
  proposedAt: "2026-08-22T21:00:00.000Z",
  reason: "Qualified foster outreach",
  ...overrides,
});

const approvalFor = (action: ProposedAction): HumanApproval => ({
  actionId: action.id,
  organizationId: action.organizationId,
  status: "approved",
  decidedBy: "staff:jill",
  decidedAt: "2026-08-22T21:01:00.000Z",
});

test("persistent platform actions bridge into the provider-neutral executor", async () => {
  const invoker = new FakeInvoker();
  const executor = new ActionExecutor({ invoker, tools: { "gmail.draft": "Gmail_WriteDraftReplyEmail" } });
  const adapter = new PlatformActionExecutorAdapter("gmail", executor);
  const platformAction: PlatformProposedAction = {
    id: "platform-action-1",
    organizationId: "rescue-a",
    caseId: "case-1",
    kind: "email.draft",
    provider: "gmail",
    target: { email: "foster@example.test" },
    payload: { subject: "Can Luna visit today?" },
    reason: "Coordinator approved targeted outreach",
    evidence: [{ label: "availability", source: "coordinator review" }],
    consequence: "consequential",
    requiresApproval: true,
    idempotencyKey: "case-1:gmail-draft:1",
    status: "approved",
    latestApprovalId: "approval-1",
    source: { system: "rescueops" },
    createdAt: "2026-08-22T21:00:00.000Z",
    updatedAt: "2026-08-22T21:01:00.000Z",
  };
  const platformApproval: PlatformApproval = {
    id: "approval-1",
    organizationId: "rescue-a",
    caseId: "case-1",
    actionId: platformAction.id,
    decision: "approved",
    decidedByMembershipId: "member-jill",
    decidedByDisplayName: "Jill Coordinator",
    decidedAt: "2026-08-22T21:01:00.000Z",
    source: { system: "rescueops" },
    createdAt: "2026-08-22T21:00:30.000Z",
    updatedAt: "2026-08-22T21:01:00.000Z",
  };

  const result = await adapter.execute(platformAction, {
    actor: { organizationId: "rescue-a", membershipId: "member-jill", displayName: "Jill Coordinator" },
    approval: platformApproval,
  });
  assert.equal(result.status, "succeeded");
  assert.equal(invoker.calls.length, 1);
  assert.equal(invoker.calls[0].toolName, "Gmail_WriteDraftReplyEmail");
  assert.equal(invoker.calls[0].context.idempotencyKey, platformAction.idempotencyKey);
});

test("consequential actions fail closed without named matching approval", async () => {
  const invoker = new FakeInvoker();
  const executor = new ActionExecutor({
    invoker,
    tools: { "gmail.send": "Configured_Gmail_Send" },
    now: () => new Date("2026-08-22T21:02:00.000Z"),
  });
  const receipt = await executor.execute(baseAction());
  assert.equal(receipt.status, "failed");
  assert.match(receipt.error ?? "", /Human approval required/);
  assert.equal(receipt.providerDispatched, false);
  assert.equal(invoker.calls.length, 0);

  const approved = await executor.execute(baseAction(), approvalFor(baseAction()));
  assert.equal(approved.status, "succeeded");
  assert.equal(invoker.calls.length, 1);
});

test("approved action uses injected tool name and propagates idempotency context", async () => {
  const invoker = new FakeInvoker();
  const executor = new ActionExecutor({
    invoker,
    tools: { "gmail.send": "TenantConfigured_Send" },
    now: () => new Date("2026-08-22T21:02:00.000Z"),
  });
  const action = baseAction();
  const receipt = await executor.execute(action, approvalFor(action));
  assert.equal(receipt.status, "succeeded");
  assert.equal(receipt.externalId, "msg-1");
  assert.deepEqual(receipt.output, { messageId: "msg-1" });
  assert.equal(invoker.calls[0]?.toolName, "TenantConfigured_Send");
  assert.equal(invoker.calls[0]?.context.idempotencyKey, action.idempotencyKey);
  assert.equal(invoker.calls[0]?.context.organizationId, "rescue-a");
});

test("same organization and idempotency key returns prior receipt without dispatch", async () => {
  const invoker = new FakeInvoker();
  const executor = new ActionExecutor({ invoker, tools: { "gmail.send": "Gmail_Send" } });
  const action = baseAction();
  const first = await executor.execute(action, approvalFor(action));
  const replay = { ...action, id: "action-replayed" };
  const second = await executor.execute(replay, approvalFor(replay));
  assert.deepEqual(second, first);
  assert.equal(invoker.calls.length, 1);
});

test("concurrent execution of the same key dispatches once", async () => {
  const invoker = new FakeInvoker();
  let release: (() => void) | undefined;
  const waiting = new Promise<void>((resolve) => { release = resolve; });
  const originalInvoke = invoker.invoke.bind(invoker);
  invoker.invoke = async (...args) => {
    const result = originalInvoke(...args);
    await waiting;
    return result;
  };
  const executor = new ActionExecutor({ invoker, tools: { "gmail.send": "Gmail_Send" } });
  const action = baseAction();
  const first = executor.execute(action, approvalFor(action));
  const second = executor.execute(action, approvalFor(action));
  release?.();
  const [firstReceipt, secondReceipt] = await Promise.all([first, second]);
  assert.deepEqual(secondReceipt, firstReceipt);
  assert.equal(invoker.calls.length, 1);
});

test("provider ambiguity produces an uncertain receipt", async () => {
  const invoker = new FakeInvoker();
  invoker.result = { ok: false, error: "timeout after dispatch", uncertain: true };
  const executor = new ActionExecutor({ invoker, tools: { "calendar.create": "Calendar_Create" } });
  const action = baseAction({ kind: "calendar.create" });
  const receipt = await executor.execute(action, approvalFor(action));
  assert.equal(receipt.status, "uncertain");
  assert.match(receipt.error ?? "", /timeout/);
});

test("unsupported optional Slack fails closed and manual Shelterluv stays simulated", async () => {
  const invoker = new FakeInvoker();
  const executor = new ActionExecutor({ invoker, tools: {} });
  const slack = baseAction({ kind: "slack.send", idempotencyKey: "slack-1" });
  const failed = await executor.execute(slack, approvalFor(slack));
  assert.equal(failed.status, "failed");
  assert.match(failed.error ?? "", /no tool configured/);

  const shelterluv = baseAction({
    kind: "shelterluv.manual_reconciliation",
    idempotencyKey: "shelterluv-1",
    input: { animalId: "luna", instruction: "Mark foster placement confirmed" },
  });
  const simulated = await executor.execute(shelterluv);
  assert.equal(simulated.status, "simulated");
  assert.equal(simulated.simulated, true);
  assert.equal(invoker.calls.length, 0);
});

test("reminders are idempotent, ordered, cancellable, and deterministic", async () => {
  let now = new Date("2026-08-22T21:00:00.000Z");
  const store = new InMemoryReminderStore();
  const reminders = new ReminderService(store, () => now);
  const later = await reminders.schedule({
    organizationId: "rescue-a", caseId: "case-1", idempotencyKey: "later",
    kind: "no_response", dueAt: "2026-08-22T21:20:00.000Z", payload: { candidateId: "foster-2" },
  });
  const earlierInput = {
    organizationId: "rescue-a", caseId: "case-1", idempotencyKey: "earlier",
    kind: "no_response", dueAt: "2026-08-22T21:10:00.000Z", payload: { candidateId: "foster-1" },
  };
  const earlier = await reminders.schedule(earlierInput);
  assert.equal((await reminders.schedule(earlierInput)).id, earlier.id);
  await reminders.cancel(later.id);
  now = new Date("2026-08-22T21:30:00.000Z");
  const handled: string[] = [];
  const results = await reminders.dispatchDue(async (reminder) => { handled.push(reminder.id); });
  assert.deepEqual(handled, [earlier.id]);
  assert.equal(results[0]?.status, "completed");
  assert.equal((await store.get(later.id))?.status, "cancelled");
  assert.equal((await reminders.dispatchDue(async () => {})).length, 0);
});

test("failed reminder is recorded and not silently retried", async () => {
  let now = new Date("2026-08-22T21:00:00.000Z");
  const reminders = new ReminderService(new InMemoryReminderStore(), () => now);
  await reminders.schedule({
    organizationId: "rescue-a", caseId: "case-1", idempotencyKey: "approval-stale",
    kind: "approval_stale", dueAt: "2026-08-22T21:01:00.000Z", payload: {},
  });
  now = new Date("2026-08-22T21:02:00.000Z");
  const [failed] = await reminders.dispatchDue(async () => { throw new Error("delivery unavailable"); });
  assert.equal(failed?.status, "failed");
  assert.equal(failed?.error, "delivery unavailable");
  assert.equal((await reminders.listDue()).length, 0);
});
