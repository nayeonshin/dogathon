export type ActionKind =
  | "gmail.draft"
  | "gmail.send"
  | "calendar.check_availability"
  | "calendar.create"
  | "calendar.update"
  | "calendar.cancel"
  | "sheets.update"
  | "slack.send"
  | "shelterluv.manual_reconciliation"
  | "simulation";

export type ProposedAction = {
  id: string;
  organizationId: string;
  caseId: string;
  kind: ActionKind;
  /** Provider-shaped input, prepared by the integration adapter rather than policy prompts. */
  input: Record<string, unknown>;
  idempotencyKey: string;
  proposedBy: string;
  proposedAt: string;
  reason: string;
  evidence?: Array<{ label: string; source: string }>;
};

export type HumanApproval = {
  actionId: string;
  organizationId: string;
  status: "approved" | "rejected";
  decidedBy: string;
  decidedAt: string;
  note?: string;
};

export type ReceiptStatus = "succeeded" | "failed" | "uncertain" | "simulated";

export type ActionReceipt = {
  id: string;
  actionId: string;
  caseId: string;
  organizationId: string;
  kind: ActionKind;
  idempotencyKey: string;
  status: ReceiptStatus;
  attemptedAt: string;
  completedAt: string;
  toolName?: string;
  approvedBy?: string;
  externalId?: string;
  output?: unknown;
  error?: string;
  /** True when no live provider call was attempted. */
  simulated: boolean;
  /** False for approval/configuration failures and explicit simulations. */
  providerDispatched: boolean;
};

export type IntegrationToolNames = Partial<Record<Exclude<ActionKind,
  "shelterluv.manual_reconciliation" | "simulation">, string>>;

/**
 * Names present in the current demo configuration. Other operations deliberately
 * have no default until their live gateway tools are verified and injected.
 */
export const CURRENT_DEMO_TOOL_NAMES: Readonly<IntegrationToolNames> = {
  "gmail.draft": "Gmail_WriteDraftReplyEmail",
  "gmail.send": "Gmail_SendEmail",
  "calendar.create": "GoogleCalendar_CreateEvent",
  "sheets.update": "GoogleSheets_CreateOrEditSpreadsheet",
  "slack.send": "Slack_SendMessage",
};

/** Operations that mutate an external system or send information to people. */
export const CONSEQUENTIAL_ACTIONS: ReadonlySet<ActionKind> = new Set([
  "gmail.draft",
  "gmail.send",
  "calendar.create",
  "calendar.update",
  "calendar.cancel",
  "sheets.update",
  "slack.send",
]);
