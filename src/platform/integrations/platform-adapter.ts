import type {
  ActionProviderAdapter,
  ProviderExecutionResult,
} from "../integrations.js";
import type {
  Approval,
  JsonValue,
  PlatformActor,
  ProposedAction as PlatformProposedAction,
} from "../types.js";
import { ActionExecutor } from "./action-executor.js";
import type {
  ActionKind,
  HumanApproval,
  ProposedAction as IntegrationProposedAction,
} from "./action-types.js";

const ACTION_KIND_MAP: Partial<Record<PlatformProposedAction["kind"], ActionKind>> = {
  "email.draft": "gmail.draft",
  "email.send": "gmail.send",
  "calendar.create": "calendar.create",
  "calendar.update": "calendar.update",
  "calendar.cancel": "calendar.cancel",
  "sheet.append": "sheets.update",
  "sheet.update": "sheets.update",
  "staff.notify": "slack.send",
  "shelter_record.prepare_update": "shelterluv.manual_reconciliation",
};

/**
 * Bridges the persistent platform action lifecycle to the provider-neutral tool
 * executor. The core owns approval state and durable receipts; this adapter
 * owns only a single provider dispatch.
 */
export class PlatformActionExecutorAdapter implements ActionProviderAdapter {
  constructor(
    readonly provider: string,
    private readonly executor: ActionExecutor,
  ) {}

  async execute(
    action: PlatformProposedAction,
    context: { actor: PlatformActor; approval?: Approval },
  ): Promise<ProviderExecutionResult> {
    const kind = ACTION_KIND_MAP[action.kind];
    if (!kind) {
      return { status: "failed", message: `No shared executor mapping for ${action.kind}` };
    }

    const proposed: IntegrationProposedAction = {
      id: action.id,
      organizationId: action.organizationId,
      caseId: action.caseId,
      kind,
      input: { target: action.target, payload: action.payload },
      idempotencyKey: action.idempotencyKey,
      proposedBy: context.actor.membershipId ?? context.actor.displayName ?? "platform",
      proposedAt: action.createdAt,
      reason: action.reason,
      evidence: action.evidence.map((item) => ({ label: item.label, source: item.source })),
    };
    const receipt = await this.executor.execute(proposed, toHumanApproval(action, context.approval));
    return {
      status: receipt.status,
      externalId: receipt.externalId,
      message: receipt.error ?? `${kind} ${receipt.status}`,
      details: {
        toolName: receipt.toolName ?? null,
        providerDispatched: receipt.providerDispatched,
        simulated: receipt.simulated,
        executorReceiptId: receipt.id,
        output: toJsonValue(receipt.output),
      },
    };
  }
}

function toHumanApproval(
  action: PlatformProposedAction,
  approval?: Approval,
): HumanApproval | undefined {
  if (!action.requiresApproval) return undefined;
  if (!approval || approval.decision !== "approved" || !approval.decidedByDisplayName || !approval.decidedAt) {
    return undefined;
  }
  return {
    actionId: action.id,
    organizationId: action.organizationId,
    status: "approved",
    decidedBy: approval.decidedByDisplayName,
    decidedAt: approval.decidedAt,
    note: approval.rationale,
  };
}

function toJsonValue(value: unknown): JsonValue {
  if (value === undefined) return null;
  try {
    return JSON.parse(JSON.stringify(value)) as JsonValue;
  } catch {
    return String(value);
  }
}
