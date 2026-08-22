export type ISODateTime = string;
export type RecordId = string;
export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export interface SourceMetadata {
  system: string;
  externalId?: string;
  importedAt?: ISODateTime;
  recordedBy?: string;
}

export interface BaseRecord {
  id: RecordId;
  organizationId: RecordId;
  source: SourceMetadata;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export type OrganizationStatus = "active" | "inactive";

export interface Organization extends BaseRecord {
  name: string;
  slug: string;
  status: OrganizationStatus;
  settings?: Record<string, JsonValue>;
}

export type MembershipRole =
  | "organization_admin"
  | "coordinator"
  | "staff"
  | "volunteer"
  | "read_only_reviewer"
  | "network_partner";
export type MembershipStatus = "invited" | "active" | "suspended" | "revoked";

export interface Membership extends BaseRecord {
  userId: string;
  personId?: RecordId;
  role: MembershipRole;
  status: MembershipStatus;
  permissions?: string[];
}

export type AnimalStatus = "active" | "placed" | "adopted" | "transferred" | "inactive";

export interface Animal extends BaseRecord {
  name: string;
  species: string;
  breed?: string;
  ageMonths?: number;
  status: AnimalStatus;
  attributes?: Record<string, JsonValue>;
  externalReferences?: Record<string, string>;
}

export type PersonStatus = "active" | "inactive" | "do_not_contact";

export interface Person extends BaseRecord {
  displayName: string;
  status: PersonStatus;
  emails?: string[];
  phoneNumbers?: string[];
  roles?: string[];
  attributes?: Record<string, JsonValue>;
  externalReferences?: Record<string, string>;
}

export const CASE_STATUSES = [
  "new",
  "reviewing",
  "needs_information",
  "ready_for_approval",
  "approved",
  "in_progress",
  "waiting_for_response",
  "completed",
  "failed",
  "cancelled",
] as const;
export type CaseStatus = (typeof CASE_STATUSES)[number];
export type CasePriority = "low" | "normal" | "high" | "urgent";

export interface WorkflowCase extends BaseRecord {
  workflowType: "adoption" | "foster" | "transfer" | (string & {});
  title: string;
  status: CaseStatus;
  priority: CasePriority;
  animalIds: RecordId[];
  personIds: RecordId[];
  assignedMembershipIds: RecordId[];
  dueAt?: ISODateTime;
  closedAt?: ISODateTime;
  data?: Record<string, JsonValue>;
}

export type TaskStatus = "open" | "in_progress" | "blocked" | "completed" | "cancelled";

export interface Task extends BaseRecord {
  caseId: RecordId;
  title: string;
  status: TaskStatus;
  assignedMembershipId?: RecordId;
  dueAt?: ISODateTime;
  completedAt?: ISODateTime;
  details?: string;
}

export type AppointmentStatus =
  | "proposed"
  | "scheduled"
  | "confirmed"
  | "completed"
  | "cancelled"
  | "no_show";

export interface Appointment extends BaseRecord {
  caseId: RecordId;
  title: string;
  status: AppointmentStatus;
  startsAt: ISODateTime;
  endsAt: ISODateTime;
  timeZone: string;
  participantPersonIds: RecordId[];
  participantOrganizationIds?: RecordId[];
  location?: string;
  externalCalendarEventId?: string;
}

export type ActionKind =
  | "email.draft"
  | "email.send"
  | "calendar.create"
  | "calendar.update"
  | "calendar.cancel"
  | "sheet.append"
  | "sheet.update"
  | "reminder.schedule"
  | "staff.notify"
  | "shelter_record.prepare_update"
  | (string & {});
export type ActionStatus =
  | "proposed"
  | "pending_approval"
  | "approved"
  | "rejected"
  | "executing"
  | "completed"
  | "failed"
  | "uncertain"
  | "cancelled";
export type ActionConsequence = "informational" | "reversible" | "consequential";

export interface ActionEvidence {
  label: string;
  source: string;
  observedAt?: ISODateTime;
  value?: JsonValue;
}

export interface ProposedAction extends BaseRecord {
  caseId: RecordId;
  kind: ActionKind;
  provider: string;
  target: Record<string, JsonValue>;
  payload: Record<string, JsonValue>;
  reason: string;
  evidence: ActionEvidence[];
  consequence: ActionConsequence;
  requiresApproval: boolean;
  idempotencyKey: string;
  status: ActionStatus;
  latestApprovalId?: RecordId;
  latestReceiptId?: RecordId;
}

export type ApprovalDecision = "pending" | "approved" | "rejected" | "cancelled";

export interface Approval extends BaseRecord {
  caseId: RecordId;
  actionId: RecordId;
  decision: ApprovalDecision;
  requestedByMembershipId?: RecordId;
  decidedByMembershipId?: RecordId;
  decidedByDisplayName?: string;
  rationale?: string;
  decidedAt?: ISODateTime;
}

export type ReceiptStatus = "succeeded" | "failed" | "uncertain" | "simulated";

export interface ActionReceipt extends BaseRecord {
  caseId: RecordId;
  actionId: RecordId;
  provider: string;
  status: ReceiptStatus;
  externalId?: string;
  message?: string;
  details?: Record<string, JsonValue>;
  occurredAt: ISODateTime;
}

export interface WorkflowEvent extends BaseRecord {
  caseId: RecordId;
  type: string;
  summary: string;
  actorMembershipId?: RecordId;
  data?: Record<string, JsonValue>;
  occurredAt: ISODateTime;
}

export type ReminderStatus = "scheduled" | "triggered" | "completed" | "cancelled" | "failed";

export interface Reminder extends BaseRecord {
  caseId: RecordId;
  type: string;
  status: ReminderStatus;
  dueAt: ISODateTime;
  assignedMembershipId?: RecordId;
  actionId?: RecordId;
  message: string;
  triggeredAt?: ISODateTime;
  completedAt?: ISODateTime;
}

export type NetworkRequestStatus = "draft" | "open" | "matched" | "closed" | "cancelled";

/** Deliberately excludes foster contact details and unrestricted case data. */
export interface LimitedNetworkSummary {
  title: string;
  need: string;
  animal?: {
    displayName?: string;
    species?: string;
    approximateAge?: string;
    publicAttributes?: Record<string, JsonValue>;
  };
  deadline?: ISODateTime;
  constraints?: string[];
}

export interface NetworkRequest extends BaseRecord {
  caseId: RecordId;
  status: NetworkRequestStatus;
  summary: LimitedNetworkSummary;
  targetOrganizationIds: RecordId[];
  openToNetwork: boolean;
  expiresAt?: ISODateTime;
}

export type CapacityOfferStatus = "offered" | "accepted" | "declined" | "withdrawn" | "expired";

export interface CapacityOffer extends BaseRecord {
  requestId: RecordId;
  requestOrganizationId: RecordId;
  status: CapacityOfferStatus;
  summary: string;
  availableFrom?: ISODateTime;
  availableUntil?: ISODateTime;
  conditions?: string[];
  decidedAt?: ISODateTime;
}

export type ShareableResourceType = "animal" | "person" | "case" | "network_request";
export type ShareGrantStatus = "active" | "revoked" | "expired";

export interface ShareGrant extends BaseRecord {
  resourceType: ShareableResourceType;
  resourceId: RecordId;
  granteeOrganizationId: RecordId;
  allowedFields: string[];
  purpose: string;
  status: ShareGrantStatus;
  grantedByMembershipId: RecordId;
  expiresAt?: ISODateTime;
  revokedAt?: ISODateTime;
}

export type HandoffStatus = "proposed" | "accepted" | "scheduled" | "completed" | "cancelled";

export interface Handoff extends BaseRecord {
  caseId: RecordId;
  requestId: RecordId;
  offerId: RecordId;
  sourceOrganizationId: RecordId;
  receivingOrganizationId: RecordId;
  shareGrantIds: RecordId[];
  status: HandoffStatus;
  appointmentId?: RecordId;
  acceptedByMembershipId?: RecordId;
  acceptedAt?: ISODateTime;
  completedAt?: ISODateTime;
}

export interface EntityMap {
  organizations: Organization;
  memberships: Membership;
  animals: Animal;
  people: Person;
  cases: WorkflowCase;
  tasks: Task;
  appointments: Appointment;
  actions: ProposedAction;
  approvals: Approval;
  receipts: ActionReceipt;
  events: WorkflowEvent;
  reminders: Reminder;
  networkRequests: NetworkRequest;
  capacityOffers: CapacityOffer;
  shareGrants: ShareGrant;
  handoffs: Handoff;
}

export type CollectionName = keyof EntityMap;

export interface PlatformDatabase {
  schemaVersion: 1;
  collections: { [K in CollectionName]: Record<RecordId, EntityMap[K]> };
}

export interface PlatformActor {
  organizationId: RecordId;
  membershipId?: RecordId;
  displayName?: string;
}

export interface IdempotentCreateResult<T> {
  record: T;
  created: boolean;
}
