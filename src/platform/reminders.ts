import { createHash } from "node:crypto";

export type ReminderStatus = "scheduled" | "processing" | "completed" | "failed" | "cancelled";

export type Reminder = {
  id: string;
  organizationId: string;
  caseId: string;
  idempotencyKey: string;
  kind: string;
  dueAt: string;
  payload: Record<string, unknown>;
  status: ReminderStatus;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  cancelledAt?: string;
  error?: string;
};

export type ScheduleReminderInput = Pick<
  Reminder,
  "organizationId" | "caseId" | "idempotencyKey" | "kind" | "dueAt" | "payload"
>;

export interface ReminderStore {
  getByIdempotencyKey(organizationId: string, idempotencyKey: string): Promise<Reminder | null>;
  get(id: string): Promise<Reminder | null>;
  save(reminder: Reminder): Promise<void>;
  list(): Promise<Reminder[]>;
}

export class InMemoryReminderStore implements ReminderStore {
  private readonly records = new Map<string, Reminder>();

  async getByIdempotencyKey(organizationId: string, idempotencyKey: string) {
    return [...this.records.values()].find(
      (item) => item.organizationId === organizationId && item.idempotencyKey === idempotencyKey,
    ) ?? null;
  }

  async get(id: string) {
    return this.records.get(id) ?? null;
  }

  async save(reminder: Reminder) {
    this.records.set(reminder.id, reminder);
  }

  async list() {
    return [...this.records.values()];
  }
}

export type ReminderHandler = (reminder: Reminder) => Promise<void>;

export class ReminderService {
  constructor(
    private readonly store: ReminderStore = new InMemoryReminderStore(),
    private readonly now: () => Date = () => new Date(),
  ) {}

  async schedule(input: ScheduleReminderInput): Promise<Reminder> {
    validateSchedule(input);
    const existing = await this.store.getByIdempotencyKey(
      input.organizationId,
      input.idempotencyKey,
    );
    if (existing) {
      if (!sameSchedule(existing, input)) {
        throw new Error("Reminder idempotency key already exists with different content");
      }
      return existing;
    }

    const timestamp = this.now().toISOString();
    const reminder: Reminder = {
      ...input,
      id: reminderId(input.organizationId, input.idempotencyKey),
      status: "scheduled",
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    await this.store.save(reminder);
    return reminder;
  }

  async cancel(id: string): Promise<Reminder> {
    const reminder = await this.store.get(id);
    if (!reminder) throw new Error(`Reminder not found: ${id}`);
    if (reminder.status === "completed" || reminder.status === "processing") {
      throw new Error(`Cannot cancel reminder in ${reminder.status} state`);
    }
    if (reminder.status === "cancelled") return reminder;
    const now = this.now().toISOString();
    const cancelled = { ...reminder, status: "cancelled" as const, cancelledAt: now, updatedAt: now };
    await this.store.save(cancelled);
    return cancelled;
  }

  /** Returns due reminders in stable chronological/id order. */
  async listDue(at: Date = this.now()): Promise<Reminder[]> {
    const cutoff = at.getTime();
    return (await this.store.list())
      .filter((item) => item.status === "scheduled" && Date.parse(item.dueAt) <= cutoff)
      .sort((a, b) => Date.parse(a.dueAt) - Date.parse(b.dueAt) || a.id.localeCompare(b.id));
  }

  /**
   * Dispatches a fixed due snapshot sequentially. This is intentionally clock-
   * driven rather than setTimeout-based, making restarts and tests deterministic.
   */
  async dispatchDue(handler: ReminderHandler, at: Date = this.now()): Promise<Reminder[]> {
    const results: Reminder[] = [];
    for (const due of await this.listDue(at)) {
      const processingAt = this.now().toISOString();
      const processing = { ...due, status: "processing" as const, updatedAt: processingAt };
      await this.store.save(processing);
      try {
        await handler(processing);
        const completedAt = this.now().toISOString();
        const completed = {
          ...processing,
          status: "completed" as const,
          completedAt,
          updatedAt: completedAt,
        };
        await this.store.save(completed);
        results.push(completed);
      } catch (error) {
        const failedAt = this.now().toISOString();
        const failed = {
          ...processing,
          status: "failed" as const,
          error: error instanceof Error ? error.message : String(error),
          updatedAt: failedAt,
        };
        await this.store.save(failed);
        results.push(failed);
      }
    }
    return results;
  }
}

function validateSchedule(input: ScheduleReminderInput) {
  if (!input.organizationId || !input.caseId || !input.idempotencyKey || !input.kind) {
    throw new Error("Reminder organizationId, caseId, idempotencyKey, and kind are required");
  }
  if (!Number.isFinite(Date.parse(input.dueAt))) throw new Error("Reminder dueAt must be an ISO date");
}

function sameSchedule(reminder: Reminder, input: ScheduleReminderInput) {
  return reminder.caseId === input.caseId
    && reminder.kind === input.kind
    && reminder.dueAt === input.dueAt
    && JSON.stringify(reminder.payload) === JSON.stringify(input.payload);
}

function reminderId(organizationId: string, idempotencyKey: string) {
  return `reminder_${createHash("sha256")
    .update(`${organizationId}\u0000${idempotencyKey}`)
    .digest("hex")
    .slice(0, 20)}`;
}
