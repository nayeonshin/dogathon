import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  ApprovalRequiredError,
  ConflictError,
  IntegrationRegistry,
  JsonPlatformStore,
  NotFoundError,
  OrganizationScopeError,
  RescueOpsPlatformService,
  ValidationError,
  type PlatformActor,
  type ProposedAction,
} from "../src/platform/index.js";

async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), "rescueops-platform-"));
  const filePath = join(directory, "platform.json");
  const store = new JsonPlatformStore(filePath);
  const service = new RescueOpsPlatformService(store);
  await store.initialize();
  return {
    directory,
    filePath,
    store,
    service,
    cleanup: () => rm(directory, { recursive: true, force: true }),
  };
}

async function organizationWithAdmin(
  service: RescueOpsPlatformService,
  name: string,
  slug: string,
): Promise<{ actor: PlatformActor; organizationId: string }> {
  const organization = await service.createOrganization({ name, slug });
  const membership = await service.createMembership(
    { organizationId: organization.id },
    { userId: `${slug}-admin`, role: "organization_admin" },
  );
  return {
    organizationId: organization.id,
    actor: {
      organizationId: organization.id,
      membershipId: membership.id,
      displayName: `${name} Admin`,
    },
  };
}

test("file store persists records and organization-scoped reads fail closed", async () => {
  const context = await fixture();
  try {
    const rescueA = await organizationWithAdmin(context.service, "Rescue A", "rescue-a");
    const rescueB = await organizationWithAdmin(context.service, "Rescue B", "rescue-b");
    const luna = await context.service.createAnimal(rescueA.actor, {
      name: "Luna",
      species: "dog",
      status: "active",
    });

    await assert.rejects(
      context.store.get("animals", luna.id, rescueB.organizationId),
      (error: unknown) => error instanceof NotFoundError && error.code === "NOT_FOUND",
    );
    assert.deepEqual(await context.store.list("animals", rescueB.organizationId), []);

    const reopened = new JsonPlatformStore(context.filePath);
    const persisted = await reopened.get("animals", luna.id, rescueA.organizationId);
    assert.equal(persisted.name, "Luna");

    const parsed = JSON.parse(await readFile(context.filePath, "utf8")) as { schemaVersion: number };
    assert.equal(parsed.schemaVersion, 1);
  } finally {
    await context.cleanup();
  }
});

test("actions are idempotent, require named approval, dispatch once, and retain receipts", async () => {
  const context = await fixture();
  try {
    const rescue = await organizationWithAdmin(context.service, "Copper's Dream", "coppers-dream");
    const workflowCase = await context.service.createCase(rescue.actor, {
      workflowType: "adoption",
      title: "Review Taylor's application",
    });

    let executions = 0;
    context.service.integrations.register({
      provider: "gmail",
      async execute(action: ProposedAction) {
        executions += 1;
        return { status: "simulated", externalId: `draft-${action.id}`, message: "Demo draft prepared" };
      },
    });

    const proposed = await context.service.proposeAction(rescue.actor, {
      caseId: workflowCase.id,
      kind: "email.send",
      provider: "gmail",
      target: { email: "taylor@example.test" },
      payload: { subject: "Meet Luna" },
      reason: "Application passed initial review",
      idempotencyKey: `adoption:${workflowCase.id}:email:taylor`,
    });
    const repeated = await context.service.proposeAction(rescue.actor, {
      caseId: workflowCase.id,
      kind: "email.send",
      provider: "gmail",
      target: { email: "different-payload-does-not-create-a-duplicate@example.test" },
      payload: { subject: "Duplicate attempt" },
      reason: "Retry",
      idempotencyKey: `adoption:${workflowCase.id}:email:taylor`,
    });
    assert.equal(proposed.created, true);
    assert.equal(repeated.created, false);
    assert.equal(repeated.record.id, proposed.record.id);
    assert.equal((await context.store.list("actions", rescue.organizationId)).length, 1);

    await assert.rejects(
      context.service.dispatchApprovedAction(rescue.actor, proposed.record.id),
      ApprovalRequiredError,
    );
    const approval = await context.service.requestApproval(rescue.actor, proposed.record.id);
    const duplicateRequest = await context.service.requestApproval(rescue.actor, proposed.record.id);
    assert.equal(duplicateRequest.id, approval.id);
    const decided = await context.service.decideApproval(rescue.actor, approval.id, "approved", "Coordinator reviewed it");
    assert.equal(decided.decidedByMembershipId, rescue.actor.membershipId);
    assert.equal(decided.decidedByDisplayName, "Copper's Dream Admin");

    const receipt = await context.service.dispatchApprovedAction(rescue.actor, proposed.record.id);
    assert.equal(receipt.status, "simulated");
    assert.equal(executions, 1);
    const repeatedDispatch = await context.service.dispatchApprovedAction(rescue.actor, proposed.record.id);
    assert.equal(repeatedDispatch.id, receipt.id);
    assert.equal(executions, 1);
    await assert.rejects(
      context.service.requestApproval(rescue.actor, proposed.record.id),
      ConflictError,
    );

    const reminder = await context.service.scheduleReminder(rescue.actor, {
      caseId: workflowCase.id,
      type: "appointment.confirmation",
      dueAt: "2026-08-23T16:00:00.000Z",
      message: "Confirm tomorrow's meet-and-greet",
    });
    const triggered = await context.service.updateReminderStatus(rescue.actor, reminder.id, "triggered");
    const completed = await context.service.updateReminderStatus(rescue.actor, reminder.id, "completed");
    assert.equal(triggered.status, "triggered");
    assert.equal(completed.status, "completed");

    const events = await context.service.listEvents(rescue.actor, workflowCase.id);
    assert.ok(events.some((event) => event.type === "action.approved"));
    assert.ok(events.some((event) => event.type === "action.simulated"));
  } finally {
    await context.cleanup();
  }
});

test("limited network exchange, explicit grants, and human-accepted handoff preserve privacy", async () => {
  const context = await fixture();
  try {
    const rescueA = await organizationWithAdmin(context.service, "Rescue A", "rescue-a");
    const shelterB = await organizationWithAdmin(context.service, "Shelter B", "shelter-b");
    const rescueC = await organizationWithAdmin(context.service, "Rescue C", "rescue-c");

    const luna = await context.service.createAnimal(rescueA.actor, {
      name: "Luna",
      species: "dog",
      breed: "mixed",
      ageMonths: 24,
      status: "active",
      attributes: { medicalNotes: "Private source detail", publicTemperament: "Gentle" },
    });
    const workflowCase = await context.service.createCase(rescueA.actor, {
      workflowType: "foster",
      title: "Urgent foster for Luna",
      priority: "urgent",
      animalIds: [luna.id],
      dueAt: "2026-08-23T21:00:00.000Z",
    });
    const request = await context.service.publishNetworkRequest(rescueA.actor, {
      caseId: workflowCase.id,
      summary: {
        title: "Temporary foster needed",
        need: "Four-night foster within 24 hours",
        animal: { displayName: "Luna", species: "dog", approximateAge: "about 2 years" },
      },
      targetOrganizationIds: [shelterB.organizationId],
    });

    const limited = await context.service.getPublishedNetworkRequest(
      shelterB.actor,
      rescueA.organizationId,
      request.id,
    );
    assert.equal(limited.summary.animal?.displayName, "Luna");
    assert.equal("caseId" in limited, false);
    await assert.rejects(
      context.service.getPublishedNetworkRequest(rescueC.actor, rescueA.organizationId, request.id),
      OrganizationScopeError,
    );
    await assert.rejects(context.store.get("animals", luna.id, shelterB.organizationId), NotFoundError);

    const offer = await context.service.submitCapacityOffer(shelterB.actor, {
      requestId: request.id,
      requestOrganizationId: rescueA.organizationId,
      summary: "One trained foster home is available",
    });
    const acceptedOffer = await context.service.acceptCapacityOffer(
      rescueA.actor,
      shelterB.organizationId,
      offer.id,
    );
    assert.equal(acceptedOffer.status, "accepted");

    await assert.rejects(
      context.service.grantResourceAccess(rescueA.actor, {
        resourceType: "animal",
        resourceId: luna.id,
        granteeOrganizationId: shelterB.organizationId,
        allowedFields: ["*"],
        purpose: "Handoff review",
      }),
      ValidationError,
    );
    const grant = await context.service.grantResourceAccess(rescueA.actor, {
      resourceType: "animal",
      resourceId: luna.id,
      granteeOrganizationId: shelterB.organizationId,
      allowedFields: ["name", "species", "breed"],
      purpose: "Evaluate and perform the accepted handoff",
    });
    const shared = await context.service.readSharedResource(shelterB.actor, rescueA.organizationId, grant.id);
    assert.deepEqual(shared.fields, { name: "Luna", species: "dog", breed: "mixed" });
    assert.equal("attributes" in shared.fields, false);
    await assert.rejects(
      context.service.readSharedResource(rescueC.actor, rescueA.organizationId, grant.id),
      OrganizationScopeError,
    );

    const handoff = await context.service.createHandoff(rescueA.actor, {
      caseId: workflowCase.id,
      requestId: request.id,
      offerId: offer.id,
      offerOrganizationId: shelterB.organizationId,
      shareGrantIds: [grant.id],
    });
    const acceptedHandoff = await context.service.acceptHandoff(
      shelterB.actor,
      rescueA.organizationId,
      handoff.id,
    );
    assert.equal(acceptedHandoff.acceptedByMembershipId, shelterB.actor.membershipId);
    const completed = await context.service.completeHandoff(rescueA.actor, handoff.id);
    assert.equal(completed.status, "completed");
    assert.ok(completed.completedAt);

    const events = await context.service.listEvents(rescueA.actor, workflowCase.id);
    assert.ok(events.some((event) => event.type === "network.handoff_completed"));
  } finally {
    await context.cleanup();
  }
});
