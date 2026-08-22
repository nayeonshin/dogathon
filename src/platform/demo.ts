import type { PlatformActor } from "./types.js";
import { NotFoundError } from "./errors.js";
import { RescueOpsPlatformService } from "./service.js";
import { JsonPlatformStore } from "./store.js";

export const DEMO_ORGANIZATIONS = {
  harbor: {
    id: "org-harbor",
    membershipId: "member-harbor-admin",
    name: "Harbor Hope Rescue",
    slug: "harbor-hope",
    actorName: "Rahul · Harbor Hope",
  },
  mission: {
    id: "org-mission",
    membershipId: "member-mission-admin",
    name: "Mission Valley Shelter",
    slug: "mission-valley",
    actorName: "Ari · Mission Valley",
  },
} as const;

export type DemoOrganizationKey = keyof typeof DEMO_ORGANIZATIONS;

export type DemoPlatform = {
  store: JsonPlatformStore;
  service: RescueOpsPlatformService;
  actors: Record<DemoOrganizationKey, PlatformActor>;
};

export async function createDemoPlatform(filePath: string): Promise<DemoPlatform> {
  const store = new JsonPlatformStore(filePath);
  await store.initialize();
  const service = new RescueOpsPlatformService(store);

  for (const provider of ["gmail", "calendar", "sheets", "slack", "shelterluv"]) {
    service.integrations.register({
      provider,
      async execute(action) {
        return {
          status: "simulated",
          externalId: `sim-${action.id}`,
          message: `Demo receipt only; no live ${provider} action was executed.`,
          details: { provider, mode: "synthetic-demo" },
        };
      },
    });
  }

  const actors: Record<DemoOrganizationKey, PlatformActor> = {
    harbor: {
      organizationId: DEMO_ORGANIZATIONS.harbor.id,
      membershipId: DEMO_ORGANIZATIONS.harbor.membershipId,
      displayName: DEMO_ORGANIZATIONS.harbor.actorName,
    },
    mission: {
      organizationId: DEMO_ORGANIZATIONS.mission.id,
      membershipId: DEMO_ORGANIZATIONS.mission.membershipId,
      displayName: DEMO_ORGANIZATIONS.mission.actorName,
    },
  };

  try {
    await store.get("organizations", DEMO_ORGANIZATIONS.harbor.id, DEMO_ORGANIZATIONS.harbor.id);
  } catch (error) {
    if (!(error instanceof NotFoundError)) throw error;
    await seedDemo(service, store, actors);
  }

  return { store, service, actors };
}

async function seedDemo(
  service: RescueOpsPlatformService,
  store: JsonPlatformStore,
  actors: Record<DemoOrganizationKey, PlatformActor>,
) {
  const now = "2026-08-22T21:00:00.000Z";
  for (const organization of Object.values(DEMO_ORGANIZATIONS)) {
    await store.create("organizations", {
      id: organization.id,
      organizationId: organization.id,
      name: organization.name,
      slug: organization.slug,
      status: "active",
      settings: { syntheticDemo: true },
      source: { system: "rescueops-demo" },
      createdAt: now,
      updatedAt: now,
    });
    await store.create("memberships", {
      id: organization.membershipId,
      organizationId: organization.id,
      userId: `${organization.slug}-admin`,
      role: "organization_admin",
      status: "active",
      source: { system: "rescueops-demo" },
      createdAt: now,
      updatedAt: now,
    });
  }

  const luna = await service.createAnimal(actors.harbor, {
    name: "Luna",
    species: "dog",
    breed: "mixed breed",
    ageMonths: 30,
    status: "active",
    attributes: {
      publicTemperament: "Calm on walks",
      sourceFreshness: "Shelterluv export · 3 hours old",
    },
    source: { system: "shelterluv-export", importedAt: now },
  });
  const fosterCoordinator = await service.createPerson(actors.harbor, {
    displayName: "Foster response pool",
    status: "active",
    roles: ["foster-candidate"],
    source: { system: "gmail" },
  });
  const fosterCase = await service.createCase(actors.harbor, {
    workflowType: "foster",
    title: "Get Luna a qualified 4-hour outing today",
    priority: "urgent",
    animalIds: [luna.id],
    personIds: [fosterCoordinator.id],
    dueAt: "2026-08-23T01:00:00.000Z",
    data: {
      sourceFreshness: "stale",
      planningWindowHours: 4,
      systemOfRecordMode: "manual-reconciliation",
    },
    source: { system: "shelterluv-export", importedAt: now },
  });
  await service.transitionCase(actors.harbor, fosterCase.id, "reviewing");
  await service.transitionCase(actors.harbor, fosterCase.id, "ready_for_approval");

  const outreach = await service.proposeAction(actors.harbor, {
    caseId: fosterCase.id,
    kind: "email.draft",
    provider: "gmail",
    target: { audience: "four-qualified-recently-available-fosters" },
    payload: { template: "urgent-outing-outreach", animalName: "Luna" },
    reason: "Coordinator needs fast, targeted outreach without exposing the full foster roster.",
    evidence: [
      { label: "roster freshness", source: "Shelterluv export", observedAt: now, value: "3 hours old" },
      { label: "placement window", source: "coordinator instruction", value: "today" },
    ],
    idempotencyKey: `foster:${fosterCase.id}:gmail-outreach:v1`,
  });
  await service.requestApproval(actors.harbor, outreach.record.id);

  const calendar = await service.proposeAction(actors.harbor, {
    caseId: fosterCase.id,
    kind: "calendar.create",
    provider: "calendar",
    target: { calendar: "foster-coordinator" },
    payload: { proposedWindows: ["4:30 PM", "5:15 PM"], invitationStatus: "not-sent" },
    reason: "Offer handoff windows only after a foster is selected and the coordinator approves.",
    evidence: [{ label: "staff availability", source: "synthetic demo calendar" }],
    idempotencyKey: `foster:${fosterCase.id}:calendar-handoff:v1`,
  });
  await service.requestApproval(actors.harbor, calendar.record.id);
  await service.scheduleReminder(actors.harbor, {
    caseId: fosterCase.id,
    type: "outreach.no_response",
    dueAt: "2026-08-22T22:00:00.000Z",
    message: "Review replies before expanding foster outreach.",
    actionId: outreach.record.id,
  });

  const juniper = await service.createAnimal(actors.harbor, {
    name: "Juniper",
    species: "dog",
    status: "active",
    source: { system: "shelterluv-export", importedAt: now },
  });
  const maya = await service.createPerson(actors.harbor, {
    displayName: "Maya Chen",
    status: "active",
    roles: ["adoption-applicant"],
    source: { system: "gmail-application" },
  });
  const adoptionCase = await service.createCase(actors.harbor, {
    workflowType: "adoption",
    title: "Maya Chen + Juniper",
    animalIds: [juniper.id],
    personIds: [maya.id],
    data: { finalDecisionAutomated: false },
    source: { system: "gmail-application", importedAt: now },
  });
  await service.transitionCase(actors.harbor, adoptionCase.id, "ready_for_approval");
  const sheetAction = await service.proposeAction(actors.harbor, {
    caseId: adoptionCase.id,
    kind: "sheet.append",
    provider: "sheets",
    target: { workbook: "adoption-pipeline" },
    payload: { applicant: "Maya Chen", animal: "Juniper", decision: "staff-review-required" },
    reason: "Keep the shared operations queue current without making an adoption decision.",
    idempotencyKey: `adoption:${adoptionCase.id}:sheet:v1`,
  });
  await service.requestApproval(actors.harbor, sheetAction.record.id);

  const missionAnimal = await service.createAnimal(actors.mission, {
    name: "Biscuit",
    species: "dog",
    status: "active",
    source: { system: "google-form" },
  });
  const missionCase = await service.createCase(actors.mission, {
    workflowType: "foster",
    title: "Biscuit · weekend foster",
    priority: "high",
    animalIds: [missionAnimal.id],
    source: { system: "google-form", importedAt: now },
  });
  await service.transitionCase(actors.mission, missionCase.id, "needs_information");

  const request = await service.publishNetworkRequest(actors.harbor, {
    caseId: fosterCase.id,
    summary: {
      title: "Temporary capacity for Luna",
      need: "Four-hour supervised outing today",
      animal: {
        displayName: "Luna",
        species: "dog",
        approximateAge: "about 2 years",
        publicAttributes: { size: "medium" },
      },
      deadline: "2026-08-23T01:00:00.000Z",
      constraints: ["quiet handoff", "East Bay"],
    },
    targetOrganizationIds: [DEMO_ORGANIZATIONS.mission.id],
  });
  await service.submitCapacityOffer(actors.mission, {
    requestId: request.id,
    requestOrganizationId: actors.harbor.organizationId,
    summary: "One quiet-room placement is available; named coordinator review required.",
    availableFrom: "2026-08-22T23:00:00.000Z",
    availableUntil: "2026-08-23T03:00:00.000Z",
  });
}
