import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createPlatformHttpApp } from "../src/platform/http.js";

test("platform API seeds both workflows and states its demo boundaries", async () => {
  const directory = await mkdtemp(join(tmpdir(), "rescueops-http-"));
  try {
    const app = createPlatformHttpApp({ filePath: join(directory, "platform.json") });
    const health = await app.request("/health");
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), {
      ok: true,
      mode: "synthetic-demo",
      persistence: "plaintext-single-process-json",
      productionTenantSecurity: false,
      liveProviderActions: false,
    });

    const response = await app.request("/snapshot?organizationId=harbor");
    assert.equal(response.status, 200);
    const snapshot = await response.json() as any;
    assert.ok(snapshot.cases.some((item: any) => item.workflowType === "adoption"));
    assert.ok(snapshot.cases.some((item: any) => item.workflowType === "foster"));
    assert.ok(snapshot.actions.length >= 3);
    assert.ok(snapshot.reminders.length >= 1);
    assert.ok(snapshot.networkRequests.length >= 1);
    assert.equal(snapshot.boundaries.productionTenantSecurity, false);
    assert.equal(snapshot.boundaries.liveProviderActions, false);
    assert.equal(snapshot.boundaries.fosterDirectory, false);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("approval and dispatch endpoints produce a simulated receipt exactly once", async () => {
  const directory = await mkdtemp(join(tmpdir(), "rescueops-http-action-"));
  try {
    const app = createPlatformHttpApp({ filePath: join(directory, "platform.json") });
    const snapshot = await (await app.request("/snapshot?organizationId=harbor")).json() as any;
    const action = snapshot.actions.find((item: any) => item.status === "pending_approval");
    assert.ok(action);

    const decision = await app.request(`/actions/${action.id}/decision?organizationId=harbor`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ decision: "approved", rationale: "Coordinator reviewed the synthetic proposal" }),
    });
    assert.equal(decision.status, 200);

    const first = await app.request(`/actions/${action.id}/dispatch?organizationId=harbor`, { method: "POST" });
    const second = await app.request(`/actions/${action.id}/dispatch?organizationId=harbor`, { method: "POST" });
    assert.equal(first.status, 200);
    assert.equal(second.status, 200);
    const firstReceipt = (await first.json() as any).receipt;
    const secondReceipt = (await second.json() as any).receipt;
    assert.equal(firstReceipt.status, "simulated");
    assert.equal(firstReceipt.id, secondReceipt.id);

    const repeatedDecision = await app.request(`/actions/${action.id}/decision?organizationId=harbor`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ decision: "approved" }),
    });
    assert.equal(repeatedDecision.status, 409);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("network endpoint persists one limited-field completed handoff", async () => {
  const directory = await mkdtemp(join(tmpdir(), "rescueops-http-network-"));
  try {
    const app = createPlatformHttpApp({ filePath: join(directory, "platform.json") });
    const first = await app.request("/network/demo-handoff?organizationId=harbor", { method: "POST" });
    assert.equal(first.status, 200);
    const firstResult = await first.json() as any;
    assert.equal(firstResult.handoff.status, "completed");
    assert.deepEqual(firstResult.grant.allowedFields, ["name", "species", "breed"]);
    assert.equal(firstResult.receipt.status, "simulated");

    const second = await app.request("/network/demo-handoff?organizationId=harbor", { method: "POST" });
    assert.equal(second.status, 200);
    const secondResult = await second.json() as any;
    assert.equal(secondResult.handoff.id, firstResult.handoff.id);

    const harbor = await (await app.request("/snapshot?organizationId=harbor")).json() as any;
    const mission = await (await app.request("/snapshot?organizationId=mission")).json() as any;
    assert.equal(harbor.incomingCapacityOffers.length, 1);
    assert.equal(mission.publishedRequests.length, 1);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("unknown organization fails closed and due reminders can be triggered", async () => {
  const directory = await mkdtemp(join(tmpdir(), "rescueops-http-reminder-"));
  try {
    const app = createPlatformHttpApp({ filePath: join(directory, "platform.json") });
    const unknown = await app.request("/snapshot?organizationId=typo-org");
    assert.equal(unknown.status, 400);

    const run = await app.request("/reminders/run?organizationId=harbor", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ at: "2026-08-23T03:00:00.000Z" }),
    });
    assert.equal(run.status, 200);
    const result = await run.json() as any;
    assert.equal(result.triggered.length, 1);
    assert.equal(result.triggered[0].status, "triggered");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
