import { join } from "node:path";
import { Hono, type Context } from "hono";
import { DEMO_ORGANIZATIONS, createDemoPlatform, type DemoOrganizationKey } from "./demo.js";
import { PlatformError, ValidationError } from "./errors.js";
import { RUNTIME_DATA_DIR } from "../config.js";

export type PlatformHttpOptions = { filePath?: string };

export function createPlatformHttpApp(options: PlatformHttpOptions = {}) {
  const app = new Hono();
  const filePath = options.filePath ?? process.env.RESCUEOPS_PLATFORM_DB
    ?? join(RUNTIME_DATA_DIR, ".rescueops-platform-demo.json");
  const platform = createDemoPlatform(filePath);

  app.get("/health", async (c) => {
    await platform;
    return c.json({
      ok: true,
      mode: "synthetic-demo",
      persistence: "plaintext-single-process-json",
      productionTenantSecurity: false,
      liveProviderActions: false,
    });
  });

  app.get("/organizations", async (c) => {
    await platform;
    return c.json({
      organizations: Object.entries(DEMO_ORGANIZATIONS).map(([key, value]) => ({
        key,
        id: value.id,
        name: value.name,
      })),
    });
  });

  app.get("/snapshot", async (c) => withErrors(c, async () => {
    const context = await platform;
    const { key, actor } = actorFromRequest(c.req.query("organizationId"));
    const cases = await context.service.listCases(actor);
    const events = (await Promise.all(cases.map((item) => context.service.listEvents(actor, item.id)))).flat();
    const incomingCapacityOffers = key === "harbor"
      ? await context.store.list("capacityOffers", DEMO_ORGANIZATIONS.mission.id)
      : [];
    const publishedRequests = key === "mission"
      ? (await context.store.list("networkRequests", DEMO_ORGANIZATIONS.harbor.id))
        .filter((request) => request.openToNetwork || request.targetOrganizationIds.includes(actor.organizationId))
        .map((request) => ({
          id: request.id,
          organizationId: request.organizationId,
          status: request.status,
          summary: request.summary,
          expiresAt: request.expiresAt,
        }))
      : [];
    return c.json({
      mode: "synthetic-demo",
      organization: { key, ...DEMO_ORGANIZATIONS[key] },
      cases,
      animals: await context.store.list("animals", actor.organizationId),
      people: await context.store.list("people", actor.organizationId),
      actions: await context.store.list("actions", actor.organizationId),
      approvals: await context.store.list("approvals", actor.organizationId),
      receipts: await context.store.list("receipts", actor.organizationId),
      reminders: await context.store.list("reminders", actor.organizationId),
      events,
      networkRequests: await context.store.list("networkRequests", actor.organizationId),
      capacityOffers: await context.store.list("capacityOffers", actor.organizationId),
      incomingCapacityOffers,
      publishedRequests,
      shareGrants: await context.store.list("shareGrants", actor.organizationId),
      handoffs: await context.store.list("handoffs", actor.organizationId),
      boundaries: {
        syntheticRecords: true,
        productionTenantSecurity: false,
        liveProviderActions: false,
        fosterDirectory: false,
      },
    });
  }));

  app.post("/actions/:actionId/decision", async (c) => withErrors(c, async () => {
    const context = await platform;
    const { actor } = actorFromRequest(c.req.query("organizationId"));
    const body = await c.req.json<{ decision?: "approved" | "rejected"; rationale?: string }>();
    if (body.decision !== "approved" && body.decision !== "rejected") {
      throw new ValidationError("decision must be approved or rejected");
    }
    const approval = await context.service.requestApproval(actor, c.req.param("actionId"));
    const decided = await context.service.decideApproval(actor, approval.id, body.decision, body.rationale);
    return c.json({ approval: decided });
  }));

  app.post("/actions/:actionId/dispatch", async (c) => withErrors(c, async () => {
    const context = await platform;
    const { actor } = actorFromRequest(c.req.query("organizationId"));
    const receipt = await context.service.dispatchApprovedAction(actor, c.req.param("actionId"));
    return c.json({ receipt });
  }));

  app.post("/reminders", async (c) => withErrors(c, async () => {
    const context = await platform;
    const { actor } = actorFromRequest(c.req.query("organizationId"));
    const body = await c.req.json<{
      caseId?: string;
      type?: string;
      dueAt?: string;
      message?: string;
      actionId?: string;
    }>();
    if (!body.caseId || !body.type || !body.dueAt || !body.message) {
      throw new ValidationError("caseId, type, dueAt, and message are required");
    }
    const reminder = await context.service.scheduleReminder(actor, {
      caseId: body.caseId,
      type: body.type,
      dueAt: body.dueAt,
      message: body.message,
      actionId: body.actionId,
    });
    return c.json({ reminder }, 201);
  }));

  app.post("/reminders/run", async (c) => withErrors(c, async () => {
    const context = await platform;
    const { actor } = actorFromRequest(c.req.query("organizationId"));
    const body = await c.req.json<{ at?: string }>().catch((): { at?: string } => ({}));
    const at = body.at ? Date.parse(body.at) : Date.now();
    if (!Number.isFinite(at)) throw new ValidationError("at must be an ISO-compatible date-time");
    const due = (await context.store.list("reminders", actor.organizationId))
      .filter((reminder) => reminder.status === "scheduled" && Date.parse(reminder.dueAt) <= at);
    const triggered = [];
    for (const reminder of due) {
      triggered.push(await context.service.updateReminderStatus(actor, reminder.id, "triggered"));
      await context.service.appendEvent(actor, {
        caseId: reminder.caseId,
        type: "reminder.triggered",
        summary: reminder.message,
        data: { reminderId: reminder.id },
      });
    }
    return c.json({ triggered });
  }));

  app.post("/network/demo-handoff", async (c) => withErrors(c, async () => {
    const context = await platform;
    const { key, actor } = actorFromRequest(c.req.query("organizationId"));
    if (key !== "harbor") throw new ValidationError("The requesting organization must advance this demo handoff");
    const request = (await context.store.list("networkRequests", actor.organizationId))[0];
    if (!request) throw new ValidationError("No demo network request exists");
    let offer = (await context.store.list("capacityOffers", DEMO_ORGANIZATIONS.mission.id))
      .find((candidate) => candidate.requestId === request.id);
    if (!offer) throw new ValidationError("No demo capacity offer exists");
    if (offer.status === "offered") {
      offer = await context.service.acceptCapacityOffer(actor, DEMO_ORGANIZATIONS.mission.id, offer.id);
    }

    const fosterCase = await context.service.getCase(actor, request.caseId);
    const animalId = fosterCase.animalIds[0];
    if (!animalId) throw new ValidationError("The demo foster case has no animal");
    let grant = (await context.store.list("shareGrants", actor.organizationId))
      .find((candidate) => candidate.resourceId === animalId && candidate.granteeOrganizationId === DEMO_ORGANIZATIONS.mission.id);
    if (!grant) {
      grant = await context.service.grantResourceAccess(actor, {
        resourceType: "animal",
        resourceId: animalId,
        granteeOrganizationId: DEMO_ORGANIZATIONS.mission.id,
        allowedFields: ["name", "species", "breed"],
        purpose: "Evaluate and complete the approved temporary handoff",
      });
    }

    let handoff = (await context.store.list("handoffs", actor.organizationId))
      .find((candidate) => candidate.requestId === request.id && candidate.offerId === offer.id);
    if (!handoff) {
      handoff = await context.service.createHandoff(actor, {
        caseId: fosterCase.id,
        requestId: request.id,
        offerId: offer.id,
        offerOrganizationId: DEMO_ORGANIZATIONS.mission.id,
        shareGrantIds: [grant.id],
      });
    }
    if (handoff.status === "proposed") {
      handoff = await context.service.acceptHandoff(
        context.actors.mission,
        actor.organizationId,
        handoff.id,
      );
    }
    if (handoff.status === "accepted" || handoff.status === "scheduled") {
      handoff = await context.service.completeHandoff(actor, handoff.id);
    }
    return c.json({
      request: await context.store.get("networkRequests", request.id, actor.organizationId),
      offer,
      grant,
      handoff,
      receipt: {
        id: `sim-handoff-${handoff.id}`,
        status: "simulated",
        message: "Service state completed; no external record or live provider was updated.",
      },
    });
  }));

  return app;
}

function actorFromRequest(organizationId?: string) {
  const key = organizationId
    ? Object.keys(DEMO_ORGANIZATIONS).find((candidate) =>
      candidate === organizationId
      || DEMO_ORGANIZATIONS[candidate as DemoOrganizationKey].id === organizationId)
    : "harbor";
  if (!key) throw new ValidationError(`Unknown synthetic organization: ${organizationId}`);
  const typedKey = key as DemoOrganizationKey;
  const organization = DEMO_ORGANIZATIONS[typedKey];
  return {
    key: typedKey,
    actor: {
      organizationId: organization.id,
      membershipId: organization.membershipId,
      displayName: organization.actorName,
    },
  };
}

async function withErrors(c: Context, operation: () => Promise<Response>): Promise<Response> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof PlatformError) {
      const status = error.code === "NOT_FOUND" ? 404
        : error.code === "ORGANIZATION_SCOPE_VIOLATION" ? 403
          : error.code === "CONFLICT" || error.code === "APPROVAL_REQUIRED" ? 409
            : 400;
      return c.json({ ok: false, error: error.message, code: error.code }, status);
    }
    const message = error instanceof Error ? error.message : String(error);
    return c.json({ ok: false, error: message, code: "INTERNAL_ERROR" }, 500);
  }
}
