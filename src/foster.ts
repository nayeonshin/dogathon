import { randomUUID } from "node:crypto";

export type RequestState =
  | "draft"
  | "ready_to_match"
  | "awaiting_outreach_approval"
  | "awaiting_responses"
  | "awaiting_staff_selection"
  | "awaiting_schedule"
  | "scheduled"
  | "placed"
  | "closed";

export type AvailabilityStatus = "available" | "unavailable" | "maybe_available" | "stale" | "unknown";
export type MatchResult = "eligible" | "excluded" | "needs_review";
export type FosterAnswer = "yes" | "no" | "maybe";

export type FosterProfile = {
  id: string;
  displayName: string;
  contactRef: string;
  location: { label: string; distanceMiles: number };
  availability: {
    status: AvailabilityStatus;
    start: string;
    end: string;
    lastConfirmedAt: string;
    expiresAt: string;
  };
  capacity: { maximum: number; current: number };
  preferences: { sizeBands: string[]; durationDays: number[] };
  household: { hasCats: boolean; hasDogs: boolean; childrenAges: number[] };
  qualifications: { handlingLevel: number; medicationCapable: boolean };
};

export type UrgentFosterRequest = {
  id: string;
  dog: {
    id: string;
    name: string;
    breed: string;
    age: string;
    sizeBand: string;
    photoUrl: string;
    summary: string;
    careNotes: string[];
  };
  state: RequestState;
  deadline: string;
  start: string;
  end: string;
  durationDays: number;
  handoffLocation: string;
  handoffSlots: string[];
  constraints: {
    minimumHandlingLevel: number;
    catFreeHousehold: boolean;
    medicationCapable: boolean;
  };
  createdAt?: string;
};

export type RuleCheck = {
  rule: string;
  result: "pass" | "fail" | "review";
  reason: string;
  evidence: string;
};

export type EligibilityEvaluation = {
  fosterId: string;
  result: MatchResult;
  score: number;
  checks: RuleCheck[];
  summary: string;
};

export type OutreachPreview = {
  fosterId: string;
  message: string;
  approved: boolean;
  responseToken?: string;
  responsePath?: string;
};

export type FosterResponse = {
  fosterId: string;
  answer: FosterAnswer;
  preferredSlot?: string;
  question?: string;
  submittedAt: string;
};

export type PlacementSelection = {
  primaryFosterId?: string;
  backupFosterId?: string;
  selectedSlot?: string;
  calendarAction?: {
    status: "pending" | "succeeded" | "failed";
    executionId?: string;
    eventReference?: string;
    error?: string;
  };
};

export type ActionReceipt = {
  id: string;
  requestId: string;
  type: string;
  actor: string;
  at: string;
  result: "success" | "failed" | "prepared" | "manual";
  summary: string;
  details?: Record<string, unknown>;
};

export type FosterState = {
  request: UrgentFosterRequest;
  profiles: FosterProfile[];
  evaluations: EligibilityEvaluation[];
  outreach: OutreachPreview[];
  responses: FosterResponse[];
  placement: PlacementSelection;
  receipts: ActionReceipt[];
};

export class FosterDomainError extends Error {
  constructor(
    message: string,
    public readonly status = 409,
    public readonly code = "invalid_transition",
  ) {
    super(message);
  }
}

const plusHours = (date: Date, hours: number) => new Date(date.getTime() + hours * 3_600_000).toISOString();
const plusDays = (date: Date, days: number) => plusHours(date, days * 24);

function initialState(now: Date): FosterState {
  const request: UrgentFosterRequest = {
    id: "foster_luna_001",
    dog: {
      id: "dog_luna",
      name: "Luna",
      breed: "Shepherd mix",
      age: "4 years",
      sizeBand: "large",
      photoUrl: "https://images.unsplash.com/photo-1552053831-71594a27632d?auto=format&fit=crop&w=900&q=80",
      summary: "A thoughtful, people-oriented dog who settles quickly outside the kennel.",
      careNotes: [
        "Cat-free home required",
        "Handling level 2 or higher",
        "Medication given with food",
        "Use distance from unfamiliar dogs on walks",
      ],
    },
    state: "draft",
    deadline: plusHours(now, 3),
    start: plusHours(now, 5),
    end: plusDays(now, 3),
    durationDays: 3,
    handoffLocation: "Copper's Dream intake, Oakland",
    handoffSlots: [plusHours(now, 4), plusHours(now, 5), plusHours(now, 6)],
    constraints: {
      minimumHandlingLevel: 2,
      catFreeHousehold: true,
      medicationCapable: true,
    },
  };

  const profiles: FosterProfile[] = [
    {
      id: "maya",
      displayName: "Maya Chen",
      contactRef: "demo-contact:maya",
      location: { label: "Oakland", distanceMiles: 4 },
      availability: {
        status: "available",
        start: plusHours(now, 2),
        end: plusDays(now, 5),
        lastConfirmedAt: plusHours(now, -1),
        expiresAt: plusDays(now, 1),
      },
      capacity: { maximum: 2, current: 0 },
      preferences: { sizeBands: ["medium", "large"], durationDays: [2, 3, 4, 5] },
      household: { hasCats: false, hasDogs: false, childrenAges: [] },
      qualifications: { handlingLevel: 2, medicationCapable: true },
    },
    {
      id: "jordan",
      displayName: "Jordan Lee",
      contactRef: "demo-contact:jordan",
      location: { label: "Berkeley", distanceMiles: 7 },
      availability: {
        status: "available",
        start: plusHours(now, 1),
        end: plusDays(now, 6),
        lastConfirmedAt: plusHours(now, -2),
        expiresAt: plusDays(now, 1),
      },
      capacity: { maximum: 2, current: 0 },
      preferences: { sizeBands: ["small", "medium", "large"], durationDays: [1, 2, 3, 4, 5, 7] },
      household: { hasCats: true, hasDogs: false, childrenAges: [] },
      qualifications: { handlingLevel: 3, medicationCapable: true },
    },
    {
      id: "priya",
      displayName: "Priya Shah",
      contactRef: "demo-contact:priya",
      location: { label: "Alameda", distanceMiles: 9 },
      availability: {
        status: "stale",
        start: plusHours(now, 2),
        end: plusDays(now, 4),
        lastConfirmedAt: plusDays(now, -14),
        expiresAt: plusDays(now, -7),
      },
      capacity: { maximum: 1, current: 0 },
      preferences: { sizeBands: ["medium", "large"], durationDays: [2, 3, 4] },
      household: { hasCats: false, hasDogs: false, childrenAges: [12] },
      qualifications: { handlingLevel: 2, medicationCapable: true },
    },
  ];

  return { request, profiles, evaluations: [], outreach: [], responses: [], placement: {}, receipts: [] };
}

function evaluateProfile(request: UrgentFosterRequest, profile: FosterProfile, now: Date): EligibilityEvaluation {
  const checks: RuleCheck[] = [];
  const add = (rule: string, result: RuleCheck["result"], reason: string, evidence: string) =>
    checks.push({ rule, result, reason, evidence });

  if (profile.availability.status === "stale" || profile.availability.status === "unknown" || new Date(profile.availability.expiresAt) <= now) {
    add("Current availability", "review", "Availability must be reconfirmed", `Last confirmed ${profile.availability.lastConfirmedAt}`);
  } else if (profile.availability.status !== "available") {
    add("Current availability", profile.availability.status === "unavailable" ? "fail" : "review", `Status is ${profile.availability.status.replaceAll("_", " ")}`, `Signal expires ${profile.availability.expiresAt}`);
  } else if (new Date(profile.availability.start) > new Date(request.start) || new Date(profile.availability.end) < new Date(request.end)) {
    add("Placement window", "fail", "Availability does not cover the full placement", `${profile.availability.start} to ${profile.availability.end}`);
  } else {
    add("Placement window", "pass", "Current availability covers the requested window", `${profile.availability.start} to ${profile.availability.end}`);
  }

  add(
    "Capacity",
    profile.capacity.current < profile.capacity.maximum ? "pass" : "fail",
    profile.capacity.current < profile.capacity.maximum ? "Has open foster capacity" : "Foster capacity is full",
    `${profile.capacity.current} of ${profile.capacity.maximum} occupied`,
  );
  add(
    "Cat-free household",
    !request.constraints.catFreeHousehold || !profile.household.hasCats ? "pass" : "fail",
    !request.constraints.catFreeHousehold || !profile.household.hasCats ? "Household meets cat restriction" : "Household has cats",
    `hasCats=${profile.household.hasCats}`,
  );
  add(
    "Handling qualification",
    profile.qualifications.handlingLevel >= request.constraints.minimumHandlingLevel ? "pass" : "fail",
    profile.qualifications.handlingLevel >= request.constraints.minimumHandlingLevel ? "Meets handling requirement" : "Handling level is too low",
    `level ${profile.qualifications.handlingLevel}; required ${request.constraints.minimumHandlingLevel}`,
  );
  add(
    "Medication capability",
    !request.constraints.medicationCapable || profile.qualifications.medicationCapable ? "pass" : "fail",
    !request.constraints.medicationCapable || profile.qualifications.medicationCapable ? "Can administer medication" : "Medication experience required",
    `medicationCapable=${profile.qualifications.medicationCapable}`,
  );

  const hasFailure = checks.some((check) => check.result === "fail");
  const hasReview = checks.some((check) => check.result === "review");
  const result: MatchResult = hasFailure ? "excluded" : hasReview ? "needs_review" : "eligible";
  let score = result === "eligible" ? 50 : 0;
  if (result === "eligible") {
    if (profile.preferences.sizeBands.includes(request.dog.sizeBand)) score += 15;
    if (profile.preferences.durationDays.includes(request.durationDays)) score += 15;
    if (profile.location.distanceMiles <= 10) score += 15;
    if (profile.capacity.maximum - profile.capacity.current > 0) score += 5;
  }
  const summary = result === "eligible"
    ? `${score}% fit · all hard requirements pass`
    : result === "excluded"
      ? checks.find((check) => check.result === "fail")?.reason ?? "Excluded by policy"
      : checks.find((check) => check.result === "review")?.reason ?? "Staff review required";
  return { fosterId: profile.id, result, score, checks, summary };
}

export type CalendarIntent = {
  requestId: string;
  fosterId: string;
  fosterName: string;
  slot: string;
  end: string;
  summary: string;
  description: string;
  location: string;
};

export class FosterPlacementStore {
  private state: FosterState;

  constructor(private readonly clock: () => Date = () => new Date()) {
    this.state = initialState(clock());
  }

  snapshot(): FosterState {
    return structuredClone(this.state);
  }

  reset(): FosterState {
    this.state = initialState(this.clock());
    return this.snapshot();
  }

  private requireRequest(requestId: string) {
    if (this.state.request.id !== requestId) throw new FosterDomainError("Foster request not found", 404, "not_found");
    return this.state.request;
  }

  private requireState(...states: RequestState[]) {
    if (!states.includes(this.state.request.state)) {
      throw new FosterDomainError(`Action is not allowed while request is ${this.state.request.state}`);
    }
  }

  private receipt(type: string, actor: string, result: ActionReceipt["result"], summary: string, details?: Record<string, unknown>) {
    this.state.receipts.push({
      id: randomUUID(), requestId: this.state.request.id, type, actor,
      at: this.clock().toISOString(), result, summary, details,
    });
  }

  private reevaluate() {
    const now = this.clock();
    this.state.evaluations = this.state.profiles
      .map((profile) => evaluateProfile(this.state.request, profile, now))
      .sort((a, b) => ({ eligible: 0, needs_review: 1, excluded: 2 })[a.result] - ({ eligible: 0, needs_review: 1, excluded: 2 })[b.result] || b.score - a.score);
  }

  createRequest(input: Partial<Pick<UrgentFosterRequest, "deadline" | "start" | "end" | "durationDays" | "handoffLocation">> = {}, actor = "Nayeon · coordinator") {
    this.requireState("draft");
    const merged = { ...this.state.request, ...input };
    const start = new Date(merged.start);
    const end = new Date(merged.end);
    const deadline = new Date(merged.deadline);
    if ([start, end, deadline].some((date) => Number.isNaN(date.getTime()))) throw new FosterDomainError("Dates must be valid ISO datetimes", 400, "invalid_input");
    if (start <= this.clock() || end <= start || deadline > start) throw new FosterDomainError("Deadline must be before a future start, and end must be after start", 400, "invalid_input");
    if (!Number.isInteger(merged.durationDays) || merged.durationDays < 1 || merged.durationDays > 14) throw new FosterDomainError("Duration must be between 1 and 14 days", 400, "invalid_input");
    this.state.request = { ...merged, state: "ready_to_match", createdAt: this.clock().toISOString() };
    this.reevaluate();
    this.receipt("request_created", actor, "success", `Urgent foster request created for ${merged.dog.name}`);
    this.receipt("matching_completed", "RescueOps rules", "success", "Deterministic foster shortlist evaluated", { policy: "foster-demo-v1" });
    return this.snapshot();
  }

  refreshAvailability(profileId: string, actor = "Nayeon · coordinator") {
    this.requireState("ready_to_match", "awaiting_outreach_approval");
    const profile = this.state.profiles.find((item) => item.id === profileId);
    if (!profile) throw new FosterDomainError("Foster profile not found", 404, "not_found");
    const now = this.clock();
    profile.availability = {
      status: "available",
      start: plusHours(now, 1),
      end: plusDays(now, 5),
      lastConfirmedAt: now.toISOString(),
      expiresAt: plusDays(now, 1),
    };
    this.reevaluate();
    this.receipt("availability_refreshed", actor, "success", `${profile.displayName}'s availability was reconfirmed`);
    return this.snapshot();
  }

  prepareOutreach(requestId: string, fosterIds: string[], messages: Record<string, string>, actor = "Nayeon · coordinator") {
    this.requireRequest(requestId);
    this.requireState("ready_to_match");
    const unique = [...new Set(fosterIds)];
    if (!unique.length) throw new FosterDomainError("Select at least one eligible foster", 400, "invalid_input");
    for (const id of unique) {
      const evaluation = this.state.evaluations.find((item) => item.fosterId === id);
      if (evaluation?.result !== "eligible") throw new FosterDomainError("Only eligible fosters can receive outreach", 400, "invalid_recipient");
    }
    this.state.outreach = unique.map((fosterId) => ({ fosterId, message: messages[fosterId] ?? "", approved: false }));
    this.state.request.state = "awaiting_outreach_approval";
    this.receipt("outreach_prepared", "RescueOps copy assistant", "prepared", `${unique.length} personalized outreach preview${unique.length === 1 ? "" : "s"} prepared`);
    return this.snapshot();
  }

  approveOutreach(requestId: string, actor = "Nayeon · coordinator") {
    this.requireRequest(requestId);
    this.requireState("awaiting_outreach_approval");
    if (!this.state.outreach.length) throw new FosterDomainError("No outreach previews are ready");
    this.state.outreach = this.state.outreach.map((preview) => {
      const token = randomUUID();
      return { ...preview, approved: true, responseToken: token, responsePath: `/foster/respond/${token}` };
    });
    this.state.request.state = "awaiting_responses";
    this.receipt("outreach_approved", actor, "success", "Staff approved targeted outreach previews", { externalAction: false });
    return this.snapshot();
  }

  getResponseContext(token: string) {
    const preview = this.state.outreach.find((item) => item.responseToken === token);
    if (!preview) throw new FosterDomainError("This response link is invalid", 404, "invalid_token");
    const foster = this.state.profiles.find((item) => item.id === preview.fosterId)!;
    const response = this.state.responses.find((item) => item.fosterId === foster.id);
    return { request: structuredClone(this.state.request), foster: structuredClone(foster), preview: structuredClone(preview), response: response ? structuredClone(response) : null };
  }

  submitResponse(token: string, input: { answer: FosterAnswer; preferredSlot?: string; question?: string }) {
    const { foster } = this.getResponseContext(token);
    this.requireState("awaiting_responses", "awaiting_staff_selection");
    if (!(["yes", "no", "maybe"] as string[]).includes(input.answer)) throw new FosterDomainError("Answer must be yes, no, or maybe", 400, "invalid_input");
    if (input.preferredSlot && !this.state.request.handoffSlots.includes(input.preferredSlot)) throw new FosterDomainError("Preferred slot is not available", 400, "invalid_input");
    const existing = this.state.responses.find((item) => item.fosterId === foster.id);
    if (existing) {
      const same = existing.answer === input.answer && (existing.preferredSlot ?? "") === (input.preferredSlot ?? "") && (existing.question ?? "") === (input.question?.trim() ?? "");
      if (same) return this.snapshot();
      throw new FosterDomainError("A response was already submitted; contact staff to change it", 409, "response_locked");
    }
    this.state.responses.push({ fosterId: foster.id, answer: input.answer, preferredSlot: input.preferredSlot, question: input.question?.trim() || undefined, submittedAt: this.clock().toISOString() });
    if (input.answer !== "no") this.state.request.state = "awaiting_staff_selection";
    this.receipt("foster_response_received", foster.displayName, "success", `${foster.displayName} responded ${input.answer}`);
    return this.snapshot();
  }

  selectPlacement(requestId: string, primaryFosterId: string, backupFosterId: string, actor = "Nayeon · coordinator") {
    this.requireRequest(requestId);
    this.requireState("awaiting_responses", "awaiting_staff_selection");
    if (!primaryFosterId || !backupFosterId || primaryFosterId === backupFosterId) throw new FosterDomainError("Choose different primary and backup fosters", 400, "invalid_input");
    const primary = this.state.responses.find((item) => item.fosterId === primaryFosterId);
    const backup = this.state.responses.find((item) => item.fosterId === backupFosterId);
    if (primary?.answer !== "yes") throw new FosterDomainError("Primary foster must have answered yes", 400, "invalid_selection");
    if (!backup || backup.answer === "no") throw new FosterDomainError("Backup foster must have answered yes or maybe", 400, "invalid_selection");
    this.state.placement = { primaryFosterId, backupFosterId };
    this.state.request.state = "awaiting_schedule";
    this.receipt("placement_selected", actor, "success", "Staff selected a primary and backup foster", { primaryFosterId, backupFosterId });
    return this.snapshot();
  }

  prepareReminder(requestId: string, kind: "confirmation" | "reminder", message: string, actor = "Nayeon · coordinator") {
    this.requireRequest(requestId);
    this.requireState("awaiting_responses", "awaiting_staff_selection", "awaiting_schedule", "scheduled");
    this.receipt(`${kind}_prepared`, "RescueOps copy assistant", "prepared", `${kind === "confirmation" ? "Confirmation" : "Reminder"} message prepared for staff review`, { message, externalAction: false, requestedBy: actor });
    return this.snapshot();
  }

  beginCalendar(requestId: string, slot: string): CalendarIntent {
    this.requireRequest(requestId);
    this.requireState("awaiting_schedule");
    if (!this.state.request.handoffSlots.includes(slot)) throw new FosterDomainError("Choose an offered handoff slot", 400, "invalid_input");
    if (this.state.placement.calendarAction?.status === "pending" || this.state.placement.calendarAction?.status === "succeeded") throw new FosterDomainError("Calendar action is already pending or complete", 409, "duplicate_action");
    const foster = this.state.profiles.find((item) => item.id === this.state.placement.primaryFosterId)!;
    this.state.placement.selectedSlot = slot;
    this.state.placement.calendarAction = { status: "pending" };
    const start = new Date(slot);
    return {
      requestId,
      fosterId: foster.id,
      fosterName: foster.displayName,
      slot,
      end: new Date(start.getTime() + 30 * 60_000).toISOString(),
      summary: `Foster handoff: ${this.state.request.dog.name} + ${foster.displayName}`,
      description: `${this.state.request.dog.name} foster handoff. Staff-approved demo placement. Care notes: ${this.state.request.dog.careNotes.join("; ")}`,
      location: this.state.request.handoffLocation,
    };
  }

  finishCalendarSuccess(executionId: string, eventReference?: string, actor = "Nayeon · coordinator") {
    if (this.state.placement.calendarAction?.status !== "pending") throw new FosterDomainError("No Calendar action is pending");
    this.state.placement.calendarAction = { status: "succeeded", executionId, eventReference };
    this.state.request.state = "scheduled";
    this.receipt("calendar_event_created", actor, "success", "Arcade created the approved Calendar invitation", { executionId, eventReference });
    return this.snapshot();
  }

  finishCalendarFailure(error: string, actor = "Nayeon · coordinator") {
    this.state.placement.calendarAction = { status: "failed", error };
    this.receipt("calendar_event_failed", actor, "failed", "Calendar action failed; placement remains unscheduled", { error });
    return this.snapshot();
  }

  confirmHandoff(requestId: string, actor = "Nayeon · coordinator") {
    this.requireRequest(requestId);
    this.requireState("scheduled");
    this.state.request.state = "placed";
    this.receipt("handoff_confirmed", actor, "success", `${this.state.request.dog.name} was handed off to the approved foster`);
    return this.snapshot();
  }

  close(requestId: string, shelterluvReference: string, actor = "Nayeon · coordinator") {
    this.requireRequest(requestId);
    this.requireState("placed");
    if (!shelterluvReference.trim()) throw new FosterDomainError("A Shelterluv record reference is required", 400, "invalid_input");
    this.state.request.state = "closed";
    this.receipt("shelterluv_manual_confirmation", actor, "manual", "Manual confirmation — not connected to Shelterluv", { shelterluvReference: shelterluvReference.trim() });
    this.receipt("placement_closed", actor, "success", "Placement campaign closed; reminders stopped");
    return this.snapshot();
  }
}

export function fallbackOutreach(request: UrgentFosterRequest, profile: FosterProfile, responsePath = "") {
  return `Hi ${profile.displayName.split(" ")[0]} — ${request.dog.name} needs a ${request.durationDays}-day foster starting ${new Date(request.start).toLocaleString("en-US", { timeZone: "America/Los_Angeles", dateStyle: "medium", timeStyle: "short" })}. You are on the shortlist because your availability is current, you have capacity, and your qualifications meet her care requirements. Review the details and respond Yes, No, or Maybe${responsePath ? `: ${responsePath}` : "."}`;
}
