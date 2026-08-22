import { randomUUID } from "node:crypto";
import {
  ApprovalRequiredError,
  ConflictError,
  OrganizationScopeError,
  ValidationError,
} from "./errors.js";
import { IntegrationRegistry } from "./integrations.js";
import { JsonPlatformStore } from "./store.js";
import type {
  ActionReceipt,
  Animal,
  Approval,
  ApprovalDecision,
  CapacityOffer,
  CaseStatus,
  Handoff,
  IdempotentCreateResult,
  JsonValue,
  LimitedNetworkSummary,
  Membership,
  NetworkRequest,
  Organization,
  Person,
  PlatformActor,
  ProposedAction,
  ReceiptStatus,
  Reminder,
  ReminderStatus,
  ShareGrant,
  ShareableResourceType,
  SourceMetadata,
  WorkflowCase,
  WorkflowEvent,
} from "./types.js";

type Clock = () => Date;
type IdGenerator = () => string;

export interface PlatformServiceOptions {
  clock?: Clock;
  idGenerator?: IdGenerator;
  integrations?: IntegrationRegistry;
}

export interface CreateCaseInput {
  workflowType: WorkflowCase["workflowType"];
  title: string;
  priority?: WorkflowCase["priority"];
  animalIds?: string[];
  personIds?: string[];
  assignedMembershipIds?: string[];
  dueAt?: string;
  data?: Record<string, JsonValue>;
  source?: SourceMetadata;
}

export interface ProposeActionInput {
  caseId: string;
  kind: ProposedAction["kind"];
  provider: string;
  target: Record<string, JsonValue>;
  payload: Record<string, JsonValue>;
  reason: string;
  evidence?: ProposedAction["evidence"];
  consequence?: ProposedAction["consequence"];
  requiresApproval?: boolean;
  idempotencyKey: string;
  source?: SourceMetadata;
}

export interface SharedResourceView {
  id: string;
  ownerOrganizationId: string;
  resourceType: ShareableResourceType;
  fields: Record<string, unknown>;
  grantId: string;
  purpose: string;
}

const CASE_TRANSITIONS: Record<CaseStatus, ReadonlySet<CaseStatus>> = {
  new: new Set(["reviewing", "needs_information", "ready_for_approval", "failed", "cancelled"]),
  reviewing: new Set(["needs_information", "ready_for_approval", "approved", "failed", "cancelled"]),
  needs_information: new Set(["reviewing", "ready_for_approval", "failed", "cancelled"]),
  ready_for_approval: new Set(["approved", "needs_information", "failed", "cancelled"]),
  approved: new Set(["in_progress", "failed", "cancelled"]),
  in_progress: new Set(["waiting_for_response", "completed", "failed", "cancelled"]),
  waiting_for_response: new Set(["in_progress", "completed", "failed", "cancelled"]),
  failed: new Set(["reviewing", "cancelled"]),
  completed: new Set(),
  cancelled: new Set(),
};

const RESOURCE_COLLECTIONS = {
  animal: "animals",
  person: "people",
  case: "cases",
  network_request: "networkRequests",
} as const;

function required(value: string, name: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new ValidationError(`${name} must be a non-empty string`);
  }
  return value.trim();
}

function validDate(value: string | undefined, name: string): void {
  if (value !== undefined && Number.isNaN(Date.parse(value))) {
    throw new ValidationError(`${name} must be an ISO-compatible date-time`, { value });
  }
}

function uniqueNonEmpty(values: string[], name: string): string[] {
  const cleaned = [...new Set(values.map((value) => required(value, name)))];
  return cleaned;
}

export class RescueOpsPlatformService {
  private readonly clock: Clock;
  private readonly idGenerator: IdGenerator;
  readonly integrations: IntegrationRegistry;

  constructor(
    readonly store: JsonPlatformStore,
    options: PlatformServiceOptions = {},
  ) {
    this.clock = options.clock ?? (() => new Date());
    this.idGenerator = options.idGenerator ?? randomUUID;
    this.integrations = options.integrations ?? new IntegrationRegistry();
  }

  async createOrganization(input: {
    name: string;
    slug: string;
    source?: SourceMetadata;
    settings?: Record<string, JsonValue>;
  }): Promise<Organization> {
    const now = this.now();
    const id = this.idGenerator();
    const slug = required(input.slug, "slug").toLowerCase();
    const organization: Organization = {
      id,
      organizationId: id,
      name: required(input.name, "name"),
      slug,
      status: "active",
      source: input.source ?? { system: "rescueops" },
      settings: input.settings,
      createdAt: now,
      updatedAt: now,
    };
    return this.store.create("organizations", organization);
  }

  async createMembership(
    actor: PlatformActor,
    input: Omit<Membership, "id" | "organizationId" | "createdAt" | "updatedAt" | "source" | "status"> & {
      status?: Membership["status"];
      source?: SourceMetadata;
    },
  ): Promise<Membership> {
    await this.requireOrganization(actor.organizationId);
    const now = this.now();
    return this.store.create("memberships", {
      ...input,
      id: this.idGenerator(),
      organizationId: actor.organizationId,
      userId: required(input.userId, "userId"),
      status: input.status ?? "active",
      source: input.source ?? { system: "rescueops" },
      createdAt: now,
      updatedAt: now,
    });
  }

  async createAnimal(
    actor: PlatformActor,
    input: Omit<Animal, "id" | "organizationId" | "createdAt" | "updatedAt" | "source"> & {
      source?: SourceMetadata;
    },
  ): Promise<Animal> {
    await this.requireOrganization(actor.organizationId);
    const now = this.now();
    return this.store.create("animals", {
      ...input,
      id: this.idGenerator(),
      organizationId: actor.organizationId,
      name: required(input.name, "name"),
      species: required(input.species, "species"),
      source: input.source ?? { system: "rescueops" },
      createdAt: now,
      updatedAt: now,
    });
  }

  async createPerson(
    actor: PlatformActor,
    input: Omit<Person, "id" | "organizationId" | "createdAt" | "updatedAt" | "source"> & {
      source?: SourceMetadata;
    },
  ): Promise<Person> {
    await this.requireOrganization(actor.organizationId);
    const now = this.now();
    return this.store.create("people", {
      ...input,
      id: this.idGenerator(),
      organizationId: actor.organizationId,
      displayName: required(input.displayName, "displayName"),
      source: input.source ?? { system: "rescueops" },
      createdAt: now,
      updatedAt: now,
    });
  }

  async createCase(actor: PlatformActor, input: CreateCaseInput): Promise<WorkflowCase> {
    await this.requireOrganization(actor.organizationId);
    validDate(input.dueAt, "dueAt");
    const now = this.now();
    const workflowCase: WorkflowCase = {
      id: this.idGenerator(),
      organizationId: actor.organizationId,
      workflowType: required(input.workflowType, "workflowType"),
      title: required(input.title, "title"),
      status: "new",
      priority: input.priority ?? "normal",
      animalIds: uniqueNonEmpty(input.animalIds ?? [], "animalId"),
      personIds: uniqueNonEmpty(input.personIds ?? [], "personId"),
      assignedMembershipIds: uniqueNonEmpty(input.assignedMembershipIds ?? [], "assignedMembershipId"),
      dueAt: input.dueAt,
      data: input.data,
      source: input.source ?? { system: "rescueops" },
      createdAt: now,
      updatedAt: now,
    };
    const created = await this.store.create("cases", workflowCase);
    await this.appendEvent(actor, {
      caseId: created.id,
      type: "case.created",
      summary: `${created.workflowType} case created`,
    });
    return created;
  }

  getCase(actor: PlatformActor, caseId: string): Promise<WorkflowCase> {
    return this.store.get("cases", caseId, actor.organizationId);
  }

  listCases(actor: PlatformActor): Promise<WorkflowCase[]> {
    return this.store.list("cases", actor.organizationId);
  }

  async transitionCase(
    actor: PlatformActor,
    caseId: string,
    nextStatus: CaseStatus,
    summary?: string,
  ): Promise<WorkflowCase> {
    const now = this.now();
    const updated = await this.store.update("cases", caseId, actor.organizationId, (current) => {
      if (current.status === nextStatus) return current;
      if (!CASE_TRANSITIONS[current.status].has(nextStatus)) {
        throw new ConflictError(`Case cannot transition from ${current.status} to ${nextStatus}`, {
          caseId,
          currentStatus: current.status,
          nextStatus,
        });
      }
      return {
        ...current,
        status: nextStatus,
        closedAt: nextStatus === "completed" || nextStatus === "cancelled" ? now : undefined,
        updatedAt: now,
      };
    });
    await this.appendEvent(actor, {
      caseId,
      type: `case.${nextStatus}`,
      summary: summary ?? `Case moved to ${nextStatus}`,
      data: { status: nextStatus },
    });
    return updated;
  }

  completeCase(actor: PlatformActor, caseId: string, summary?: string): Promise<WorkflowCase> {
    return this.transitionCase(actor, caseId, "completed", summary);
  }

  cancelCase(actor: PlatformActor, caseId: string, summary?: string): Promise<WorkflowCase> {
    return this.transitionCase(actor, caseId, "cancelled", summary);
  }

  async proposeAction(
    actor: PlatformActor,
    input: ProposeActionInput,
  ): Promise<IdempotentCreateResult<ProposedAction>> {
    await this.getCase(actor, input.caseId);
    const consequence = input.consequence ?? "consequential";
    const requiresApproval = consequence === "consequential" ? true : (input.requiresApproval ?? false);
    const now = this.now();
    const action: ProposedAction = {
      id: this.idGenerator(),
      organizationId: actor.organizationId,
      caseId: input.caseId,
      kind: required(input.kind, "kind"),
      provider: required(input.provider, "provider"),
      target: input.target,
      payload: input.payload,
      reason: required(input.reason, "reason"),
      evidence: input.evidence ?? [],
      consequence,
      requiresApproval,
      idempotencyKey: required(input.idempotencyKey, "idempotencyKey"),
      status: requiresApproval ? "pending_approval" : "approved",
      source: input.source ?? { system: "rescueops" },
      createdAt: now,
      updatedAt: now,
    };
    const result = await this.store.createActionIdempotent(action);
    if (result.created) {
      await this.appendEvent(actor, {
        caseId: action.caseId,
        type: "action.proposed",
        summary: `${action.kind} proposed`,
        data: { actionId: action.id, requiresApproval },
      });
    }
    return result;
  }

  async requestApproval(actor: PlatformActor, actionId: string): Promise<Approval> {
    const action = await this.store.get("actions", actionId, actor.organizationId);
    if (!action.requiresApproval) {
      throw new ValidationError(`Action ${actionId} does not require approval`);
    }
    const existing = await this.store.list(
      "approvals",
      actor.organizationId,
      (approval) => approval.actionId === actionId && approval.decision === "pending",
    );
    if (existing[0]) return existing[0];
    const now = this.now();
    const approval: Approval = {
      id: this.idGenerator(),
      organizationId: actor.organizationId,
      caseId: action.caseId,
      actionId,
      decision: "pending",
      requestedByMembershipId: actor.membershipId,
      source: { system: "rescueops" },
      createdAt: now,
      updatedAt: now,
    };
    const created = await this.store.create("approvals", approval);
    await this.store.update("actions", actionId, actor.organizationId, (current) => ({
      ...current,
      latestApprovalId: created.id,
      status: "pending_approval",
      updatedAt: now,
    }));
    return created;
  }

  async decideApproval(
    actor: PlatformActor,
    approvalId: string,
    decision: Extract<ApprovalDecision, "approved" | "rejected">,
    rationale?: string,
  ): Promise<Approval> {
    const membership = await this.requireNamedHuman(actor);
    const now = this.now();
    const approval = await this.store.update("approvals", approvalId, actor.organizationId, (current) => {
      if (current.decision !== "pending") {
        throw new ConflictError(`Approval ${approvalId} has already been decided`, {
          currentDecision: current.decision,
        });
      }
      return {
        ...current,
        decision,
        rationale,
        decidedByMembershipId: membership.id,
        decidedByDisplayName: actor.displayName ?? membership.userId,
        decidedAt: now,
        updatedAt: now,
      };
    });
    await this.store.update("actions", approval.actionId, actor.organizationId, (current) => ({
      ...current,
      status: decision === "approved" ? "approved" : "rejected",
      latestApprovalId: approval.id,
      updatedAt: now,
    }));
    await this.appendEvent(actor, {
      caseId: approval.caseId,
      type: `action.${decision}`,
      summary: `Action ${decision} by ${approval.decidedByDisplayName}`,
      data: { actionId: approval.actionId, approvalId },
    });
    return approval;
  }

  async dispatchApprovedAction(actor: PlatformActor, actionId: string): Promise<ActionReceipt> {
    const action = await this.store.get("actions", actionId, actor.organizationId);
    if (action.status === "completed") {
      const prior = await this.store.list(
        "receipts",
        actor.organizationId,
        (receipt) => receipt.actionId === actionId,
      );
      const latest = prior.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))[0];
      if (latest) return latest;
    }
    if (action.requiresApproval && action.status !== "approved") {
      throw new ApprovalRequiredError(actionId);
    }
    if (action.status !== "approved") {
      throw new ConflictError(`Action ${actionId} is not dispatchable from status ${action.status}`);
    }
    const adapter = this.integrations.get(action.provider);
    if (!adapter) {
      throw new ValidationError(`No integration adapter is registered for provider ${action.provider}`);
    }
    const now = this.now();
    const executing = await this.store.update("actions", actionId, actor.organizationId, (current) => {
      if (current.status !== "approved") {
        throw new ConflictError(`Action ${actionId} is already being or has been dispatched`, {
          currentStatus: current.status,
        });
      }
      return { ...current, status: "executing", updatedAt: now };
    });
    try {
      const result = await adapter.execute(executing);
      return this.recordReceipt(actor, {
        actionId,
        status: result.status,
        externalId: result.externalId,
        message: result.message,
        details: result.details,
      });
    } catch (error) {
      return this.recordReceipt(actor, {
        actionId,
        status: "failed",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async recordReceipt(
    actor: PlatformActor,
    input: {
      actionId: string;
      status: ReceiptStatus;
      externalId?: string;
      message?: string;
      details?: Record<string, JsonValue>;
    },
  ): Promise<ActionReceipt> {
    const action = await this.store.get("actions", input.actionId, actor.organizationId);
    const now = this.now();
    const receipt: ActionReceipt = {
      id: this.idGenerator(),
      organizationId: actor.organizationId,
      caseId: action.caseId,
      actionId: action.id,
      provider: action.provider,
      status: input.status,
      externalId: input.externalId,
      message: input.message,
      details: input.details,
      occurredAt: now,
      source: { system: action.provider },
      createdAt: now,
      updatedAt: now,
    };
    const created = await this.store.create("receipts", receipt);
    const status: ProposedAction["status"] =
      input.status === "succeeded" || input.status === "simulated"
        ? "completed"
        : input.status === "uncertain"
          ? "uncertain"
          : "failed";
    await this.store.update("actions", action.id, actor.organizationId, (current) => ({
      ...current,
      status,
      latestReceiptId: created.id,
      updatedAt: now,
    }));
    await this.appendEvent(actor, {
      caseId: action.caseId,
      type: `action.${input.status}`,
      summary: `${action.kind} ${input.status}`,
      data: { actionId: action.id, receiptId: created.id },
    });
    return created;
  }

  async appendEvent(
    actor: PlatformActor,
    input: Pick<WorkflowEvent, "caseId" | "type" | "summary"> & { data?: Record<string, JsonValue> },
  ): Promise<WorkflowEvent> {
    await this.getCase(actor, input.caseId);
    const now = this.now();
    return this.store.create("events", {
      id: this.idGenerator(),
      organizationId: actor.organizationId,
      caseId: input.caseId,
      type: required(input.type, "event.type"),
      summary: required(input.summary, "event.summary"),
      actorMembershipId: actor.membershipId,
      data: input.data,
      occurredAt: now,
      source: { system: "rescueops" },
      createdAt: now,
      updatedAt: now,
    });
  }

  listEvents(actor: PlatformActor, caseId: string): Promise<WorkflowEvent[]> {
    return this.store.list("events", actor.organizationId, (event) => event.caseId === caseId);
  }

  async scheduleReminder(
    actor: PlatformActor,
    input: Pick<Reminder, "caseId" | "type" | "dueAt" | "message"> & {
      assignedMembershipId?: string;
      actionId?: string;
    },
  ): Promise<Reminder> {
    await this.getCase(actor, input.caseId);
    validDate(input.dueAt, "dueAt");
    const now = this.now();
    return this.store.create("reminders", {
      id: this.idGenerator(),
      organizationId: actor.organizationId,
      caseId: input.caseId,
      type: required(input.type, "reminder.type"),
      status: "scheduled",
      dueAt: input.dueAt,
      assignedMembershipId: input.assignedMembershipId,
      actionId: input.actionId,
      message: required(input.message, "reminder.message"),
      source: { system: "rescueops" },
      createdAt: now,
      updatedAt: now,
    });
  }

  async updateReminderStatus(
    actor: PlatformActor,
    reminderId: string,
    status: Exclude<ReminderStatus, "scheduled">,
  ): Promise<Reminder> {
    const now = this.now();
    return this.store.update("reminders", reminderId, actor.organizationId, (current) => {
      if (current.status !== "scheduled" && current.status !== "triggered") {
        throw new ConflictError(`Reminder ${reminderId} is already terminal`, { currentStatus: current.status });
      }
      return {
        ...current,
        status,
        triggeredAt: status === "triggered" ? now : current.triggeredAt,
        completedAt: status === "completed" ? now : current.completedAt,
        updatedAt: now,
      };
    });
  }

  async publishNetworkRequest(
    actor: PlatformActor,
    input: {
      caseId: string;
      summary: LimitedNetworkSummary;
      targetOrganizationIds?: string[];
      openToNetwork?: boolean;
      expiresAt?: string;
    },
  ): Promise<NetworkRequest> {
    await this.getCase(actor, input.caseId);
    validDate(input.expiresAt, "expiresAt");
    required(input.summary.title, "summary.title");
    required(input.summary.need, "summary.need");
    const targets = uniqueNonEmpty(input.targetOrganizationIds ?? [], "targetOrganizationId").filter(
      (id) => id !== actor.organizationId,
    );
    if (!input.openToNetwork && targets.length === 0) {
      throw new ValidationError("A network request must be open to the network or target another organization");
    }
    await Promise.all(targets.map((organizationId) => this.requireOrganization(organizationId)));
    const now = this.now();
    return this.store.create("networkRequests", {
      id: this.idGenerator(),
      organizationId: actor.organizationId,
      caseId: input.caseId,
      status: "open",
      summary: input.summary,
      targetOrganizationIds: targets,
      openToNetwork: input.openToNetwork ?? false,
      expiresAt: input.expiresAt,
      source: { system: "rescueops" },
      createdAt: now,
      updatedAt: now,
    });
  }

  async getPublishedNetworkRequest(
    viewer: PlatformActor,
    sourceOrganizationId: string,
    requestId: string,
  ): Promise<Pick<NetworkRequest, "id" | "organizationId" | "status" | "summary" | "expiresAt">> {
    const request = await this.store.get("networkRequests", requestId, sourceOrganizationId);
    if (
      viewer.organizationId !== sourceOrganizationId &&
      !request.openToNetwork &&
      !request.targetOrganizationIds.includes(viewer.organizationId)
    ) {
      throw new OrganizationScopeError("This network request was not shared with the viewing organization", {
        requestId,
        viewerOrganizationId: viewer.organizationId,
      });
    }
    return {
      id: request.id,
      organizationId: request.organizationId,
      status: request.status,
      summary: request.summary,
      expiresAt: request.expiresAt,
    };
  }

  async submitCapacityOffer(
    actor: PlatformActor,
    input: {
      requestId: string;
      requestOrganizationId: string;
      summary: string;
      availableFrom?: string;
      availableUntil?: string;
      conditions?: string[];
    },
  ): Promise<CapacityOffer> {
    const request = await this.getPublishedNetworkRequest(actor, input.requestOrganizationId, input.requestId);
    if (request.status !== "open") {
      throw new ConflictError(`Network request ${request.id} is not open`);
    }
    validDate(input.availableFrom, "availableFrom");
    validDate(input.availableUntil, "availableUntil");
    const now = this.now();
    return this.store.create("capacityOffers", {
      id: this.idGenerator(),
      organizationId: actor.organizationId,
      requestId: input.requestId,
      requestOrganizationId: input.requestOrganizationId,
      status: "offered",
      summary: required(input.summary, "summary"),
      availableFrom: input.availableFrom,
      availableUntil: input.availableUntil,
      conditions: input.conditions,
      source: { system: "rescueops" },
      createdAt: now,
      updatedAt: now,
    });
  }

  async acceptCapacityOffer(
    actor: PlatformActor,
    offerOrganizationId: string,
    offerId: string,
  ): Promise<CapacityOffer> {
    const offer = await this.store.get("capacityOffers", offerId, offerOrganizationId);
    if (offer.requestOrganizationId !== actor.organizationId) {
      throw new OrganizationScopeError("Only the organization that created the request can accept this offer");
    }
    const request = await this.store.get("networkRequests", offer.requestId, actor.organizationId);
    if (request.status !== "open" || offer.status !== "offered") {
      throw new ConflictError("The request or capacity offer is no longer open", {
        requestStatus: request.status,
        offerStatus: offer.status,
      });
    }
    const now = this.now();
    const accepted = await this.store.update("capacityOffers", offer.id, offerOrganizationId, (current) => ({
      ...current,
      status: "accepted",
      decidedAt: now,
      updatedAt: now,
    }));
    await this.store.update("networkRequests", request.id, actor.organizationId, (current) => ({
      ...current,
      status: "matched",
      updatedAt: now,
    }));
    return accepted;
  }

  async grantResourceAccess(
    actor: PlatformActor,
    input: {
      resourceType: ShareableResourceType;
      resourceId: string;
      granteeOrganizationId: string;
      allowedFields: string[];
      purpose: string;
      expiresAt?: string;
    },
  ): Promise<ShareGrant> {
    const membership = await this.requireNamedHuman(actor);
    if (input.granteeOrganizationId === actor.organizationId) {
      throw new ValidationError("A cross-organization share grant must name a different organization");
    }
    await this.requireOrganization(input.granteeOrganizationId);
    const collection = RESOURCE_COLLECTIONS[input.resourceType];
    await this.store.get(collection, input.resourceId, actor.organizationId);
    const fields = uniqueNonEmpty(input.allowedFields, "allowedField");
    if (fields.length === 0 || fields.includes("*")) {
      throw new ValidationError("Share grants require explicit top-level field names; wildcards are not allowed");
    }
    for (const field of fields) {
      if (field.includes(".") || ["organizationId", "source"].includes(field)) {
        throw new ValidationError(`Field ${field} cannot be shared through this limited-field API`);
      }
    }
    validDate(input.expiresAt, "expiresAt");
    const now = this.now();
    return this.store.create("shareGrants", {
      id: this.idGenerator(),
      organizationId: actor.organizationId,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      granteeOrganizationId: input.granteeOrganizationId,
      allowedFields: fields,
      purpose: required(input.purpose, "purpose"),
      status: "active",
      grantedByMembershipId: membership.id,
      expiresAt: input.expiresAt,
      source: { system: "rescueops" },
      createdAt: now,
      updatedAt: now,
    });
  }

  async readSharedResource(
    viewer: PlatformActor,
    ownerOrganizationId: string,
    grantId: string,
  ): Promise<SharedResourceView> {
    const grant = await this.store.get("shareGrants", grantId, ownerOrganizationId);
    if (grant.granteeOrganizationId !== viewer.organizationId) {
      throw new OrganizationScopeError("This share grant does not authorize the viewing organization", {
        grantId,
      });
    }
    if (grant.status !== "active" || (grant.expiresAt && Date.parse(grant.expiresAt) <= this.clock().getTime())) {
      throw new OrganizationScopeError("This share grant is not active", { grantId, status: grant.status });
    }
    const collection = RESOURCE_COLLECTIONS[grant.resourceType];
    const resource = await this.store.get(collection, grant.resourceId, ownerOrganizationId);
    const source = resource as unknown as Record<string, unknown>;
    const fields = Object.fromEntries(
      grant.allowedFields.filter((field) => Object.hasOwn(source, field)).map((field) => [field, source[field]]),
    );
    return {
      id: resource.id,
      ownerOrganizationId,
      resourceType: grant.resourceType,
      fields,
      grantId: grant.id,
      purpose: grant.purpose,
    };
  }

  async revokeShareGrant(actor: PlatformActor, grantId: string): Promise<ShareGrant> {
    const now = this.now();
    return this.store.update("shareGrants", grantId, actor.organizationId, (current) => ({
      ...current,
      status: "revoked",
      revokedAt: now,
      updatedAt: now,
    }));
  }

  async createHandoff(
    actor: PlatformActor,
    input: {
      caseId: string;
      requestId: string;
      offerId: string;
      offerOrganizationId: string;
      shareGrantIds: string[];
    },
  ): Promise<Handoff> {
    await this.getCase(actor, input.caseId);
    const request = await this.store.get("networkRequests", input.requestId, actor.organizationId);
    const offer = await this.store.get("capacityOffers", input.offerId, input.offerOrganizationId);
    if (request.status !== "matched" || offer.status !== "accepted" || offer.requestId !== request.id) {
      throw new ConflictError("A handoff requires a matched request and its accepted capacity offer");
    }
    const grantIds = uniqueNonEmpty(input.shareGrantIds, "shareGrantId");
    if (grantIds.length === 0) {
      throw new ValidationError("A handoff requires at least one explicit share grant");
    }
    const grants = await Promise.all(
      grantIds.map((grantId) => this.store.get("shareGrants", grantId, actor.organizationId)),
    );
    if (grants.some((grant) => grant.status !== "active" || grant.granteeOrganizationId !== offer.organizationId)) {
      throw new OrganizationScopeError("Every handoff share grant must be active and target the receiving organization");
    }
    const now = this.now();
    return this.store.create("handoffs", {
      id: this.idGenerator(),
      organizationId: actor.organizationId,
      caseId: input.caseId,
      requestId: request.id,
      offerId: offer.id,
      sourceOrganizationId: actor.organizationId,
      receivingOrganizationId: offer.organizationId,
      shareGrantIds: grantIds,
      status: "proposed",
      source: { system: "rescueops" },
      createdAt: now,
      updatedAt: now,
    });
  }

  async acceptHandoff(
    actor: PlatformActor,
    sourceOrganizationId: string,
    handoffId: string,
  ): Promise<Handoff> {
    const membership = await this.requireNamedHuman(actor);
    const handoff = await this.store.get("handoffs", handoffId, sourceOrganizationId);
    if (handoff.receivingOrganizationId !== actor.organizationId) {
      throw new OrganizationScopeError("Only the receiving organization can accept this handoff");
    }
    const now = this.now();
    return this.store.update("handoffs", handoffId, sourceOrganizationId, (current) => {
      if (current.status !== "proposed") {
        throw new ConflictError(`Handoff ${handoffId} cannot be accepted from status ${current.status}`);
      }
      return {
        ...current,
        status: "accepted",
        acceptedByMembershipId: membership.id,
        acceptedAt: now,
        updatedAt: now,
      };
    });
  }

  async completeHandoff(actor: PlatformActor, handoffId: string): Promise<Handoff> {
    const now = this.now();
    const completed = await this.store.update("handoffs", handoffId, actor.organizationId, (current) => {
      if (current.status !== "accepted" && current.status !== "scheduled") {
        throw new ConflictError(`Handoff ${handoffId} cannot complete from status ${current.status}`);
      }
      return { ...current, status: "completed", completedAt: now, updatedAt: now };
    });
    await this.appendEvent(actor, {
      caseId: completed.caseId,
      type: "network.handoff_completed",
      summary: `Handoff to organization ${completed.receivingOrganizationId} completed`,
      data: { handoffId: completed.id, receivingOrganizationId: completed.receivingOrganizationId },
    });
    return completed;
  }

  private async requireOrganization(organizationId: string): Promise<Organization> {
    return this.store.get("organizations", organizationId, organizationId);
  }

  private async requireNamedHuman(actor: PlatformActor): Promise<Membership> {
    if (!actor.membershipId) {
      throw new ValidationError("A named membership is required for this human decision");
    }
    const membership = await this.store.get("memberships", actor.membershipId, actor.organizationId);
    if (membership.status !== "active") {
      throw new OrganizationScopeError("The acting membership is not active", {
        membershipId: membership.id,
        status: membership.status,
      });
    }
    return membership;
  }

  private now(): string {
    return this.clock().toISOString();
  }
}
