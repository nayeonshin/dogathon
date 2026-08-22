import { createHash } from "node:crypto";
import type { ToolInvoker, ToolInvocationResult } from "./tool-invoker.js";
import {
  CONSEQUENTIAL_ACTIONS,
  type ActionReceipt,
  type HumanApproval,
  type IntegrationToolNames,
  type ProposedAction,
} from "./action-types.js";

export interface ReceiptStore {
  getByIdempotencyKey(organizationId: string, idempotencyKey: string): Promise<ActionReceipt | null>;
  save(receipt: ActionReceipt): Promise<void>;
}

export class InMemoryReceiptStore implements ReceiptStore {
  private readonly receipts = new Map<string, ActionReceipt>();

  async getByIdempotencyKey(organizationId: string, idempotencyKey: string) {
    return this.receipts.get(keyFor(organizationId, idempotencyKey)) ?? null;
  }

  async save(receipt: ActionReceipt) {
    this.receipts.set(keyFor(receipt.organizationId, receipt.idempotencyKey), receipt);
  }
}

export type ActionExecutorOptions = {
  invoker: ToolInvoker;
  tools: IntegrationToolNames;
  inputMappers?: Partial<Record<ProposedAction["kind"], (
    input: Record<string, unknown>,
    action: ProposedAction,
  ) => Record<string, unknown>>>;
  receipts?: ReceiptStore;
  now?: () => Date;
};

export class ActionExecutor {
  private readonly receipts: ReceiptStore;
  private readonly now: () => Date;
  private readonly inFlight = new Map<string, Promise<ActionReceipt>>();

  constructor(private readonly options: ActionExecutorOptions) {
    this.receipts = options.receipts ?? new InMemoryReceiptStore();
    this.now = options.now ?? (() => new Date());
  }

  async execute(action: ProposedAction, approval?: HumanApproval): Promise<ActionReceipt> {
    validateAction(action);
    const key = keyFor(action.organizationId, action.idempotencyKey);
    const active = this.inFlight.get(key);
    if (active) return active;

    const execution = this.executeOnce(action, approval);
    this.inFlight.set(key, execution);
    try {
      return await execution;
    } finally {
      if (this.inFlight.get(key) === execution) this.inFlight.delete(key);
    }
  }

  private async executeOnce(action: ProposedAction, approval?: HumanApproval): Promise<ActionReceipt> {
    const prior = await this.receipts.getByIdempotencyKey(
      action.organizationId,
      action.idempotencyKey,
    );
    // A pre-dispatch rejection must not poison the key: the same proposal can
    // legitimately be retried after a human approves it or configuration loads.
    if (prior && (prior.providerDispatched || prior.status !== "failed")) return prior;

    const attemptedAt = this.now().toISOString();
    const approvalError = validateApproval(action, approval);
    if (approvalError) {
      return this.store(action, attemptedAt, {
        ok: false,
        error: approvalError,
        providerDispatched: false,
      });
    }

    if (action.kind === "simulation") {
      return this.store(action, attemptedAt, {
        ok: true,
        simulated: true,
        output: action.input,
        approvedBy: approval?.decidedBy,
        providerDispatched: false,
      });
    }

    if (action.kind === "shelterluv.manual_reconciliation") {
      return this.store(action, attemptedAt, {
        ok: true,
        simulated: true,
        output: {
          mode: "manual_reconciliation",
          message: "Reconciliation packet prepared; no Shelterluv write was attempted.",
          packet: action.input,
        },
        approvedBy: approval?.decidedBy,
        providerDispatched: false,
      });
    }

    const toolName = this.options.tools[action.kind];
    if (!toolName) {
      return this.store(action, attemptedAt, {
        ok: false,
        error: `Unsupported action: no tool configured for ${action.kind}`,
        approvedBy: approval?.decidedBy,
        providerDispatched: false,
      });
    }

    let result: ToolInvocationResult;
    try {
      const input = this.options.inputMappers?.[action.kind]?.(action.input, action) ?? action.input;
      result = await this.options.invoker.invoke(toolName, input, {
        organizationId: action.organizationId,
        actionId: action.id,
        idempotencyKey: action.idempotencyKey,
        actorId: approval?.decidedBy ?? action.proposedBy,
      });
    } catch (error) {
      // Invokers should return typed errors, but an unexpected throw is ambiguous.
      result = {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
        uncertain: true,
      };
    }

    return this.store(action, attemptedAt, {
      ...(result.ok
        ? { ok: true as const, output: result.value, externalId: result.externalId }
        : result),
      toolName,
      approvedBy: approval?.decidedBy,
      providerDispatched: true,
    });
  }

  private async store(
    action: ProposedAction,
    attemptedAt: string,
    result:
      | {
          ok: true;
          simulated?: boolean;
          output?: unknown;
          externalId?: string;
          toolName?: string;
          approvedBy?: string;
          providerDispatched: boolean;
        }
      | {
          ok: false;
          error: string;
          uncertain?: boolean;
          toolName?: string;
          approvedBy?: string;
          providerDispatched: boolean;
        },
  ): Promise<ActionReceipt> {
    const receipt: ActionReceipt = {
      id: receiptId(action.organizationId, action.idempotencyKey),
      actionId: action.id,
      caseId: action.caseId,
      organizationId: action.organizationId,
      kind: action.kind,
      idempotencyKey: action.idempotencyKey,
      status: result.ok
        ? result.simulated ? "simulated" : "succeeded"
        : result.uncertain ? "uncertain" : "failed",
      attemptedAt,
      completedAt: this.now().toISOString(),
      toolName: result.toolName,
      approvedBy: result.approvedBy,
      externalId: result.ok ? result.externalId : undefined,
      output: result.ok ? result.output : undefined,
      error: result.ok ? undefined : result.error,
      simulated: result.ok ? !!result.simulated : false,
      providerDispatched: result.providerDispatched,
    };
    await this.receipts.save(receipt);
    return receipt;
  }
}

function validateAction(action: ProposedAction) {
  if (!action.id || !action.organizationId || !action.caseId || !action.idempotencyKey) {
    throw new Error("Action id, organizationId, caseId, and idempotencyKey are required");
  }
}

function validateApproval(action: ProposedAction, approval?: HumanApproval): string | null {
  if (!CONSEQUENTIAL_ACTIONS.has(action.kind)) return null;
  if (!approval) return `Human approval required before ${action.kind}`;
  if (approval.status !== "approved") return `Action ${action.id} is not approved`;
  if (!approval.decidedBy.trim()) return "Approval must name the human approver";
  if (approval.actionId !== action.id) return "Approval belongs to a different action";
  if (approval.organizationId !== action.organizationId) {
    return "Approval belongs to a different organization";
  }
  return null;
}

function receiptId(organizationId: string, idempotencyKey: string): string {
  return `receipt_${createHash("sha256")
    .update(`${organizationId}\u0000${idempotencyKey}`)
    .digest("hex")
    .slice(0, 20)}`;
}

function keyFor(organizationId: string, idempotencyKey: string) {
  return `${organizationId}\u0000${idempotencyKey}`;
}
