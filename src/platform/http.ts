import { join } from "node:path";
import { Hono, type Context } from "hono";
import { DEMO_ORGANIZATIONS, createDemoPlatform, type DemoOrganizationKey } from "./demo.js";
import { PlatformError, ValidationError } from "./errors.js";

export type PlatformHttpOptions = { filePath?: string };

export function createPlatformHttpApp(options: PlatformHttpOptions = {}) {
  const app = new Hono();
  const filePath = options.filePath ?? process.env.RESCUEOPS_PLATFORM_DB
    ?? join(process.cwd(), ".rescueops-platform-demo.json");
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

  return app;
}

function actorFromRequest(organizationId?: string) {
  const entry = Object.entries(DEMO_ORGANIZATIONS).find(([, value]) => value.id === organizationId)
    ?? Object.entries(DEMO_ORGANIZATIONS).find(([key]) => key === organizationId)
    ?? ["harbor", DEMO_ORGANIZATIONS.harbor];
  const key = entry[0] as DemoOrganizationKey;
  const organization = entry[1];
  return {
    key,
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
