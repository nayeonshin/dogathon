import {
  FosterDomainError,
  type CalendarIntent,
  type FosterPlacementStore,
} from "./foster.js";

export type CalendarExecution = {
  executionId: string;
  eventReference?: string;
  attendee?: string;
};

export class FosterCalendarExecutionError extends Error {
  constructor(message: string) {
    super(message);
  }
}

/** Coordinates the state gate and an injected Calendar executor.
 *
 * Keeping the provider call injectable lets tests prove authorization failures,
 * provider failures, retry behavior, and deduplication without creating events. */
export async function performCalendarAction(
  store: FosterPlacementStore,
  requestId: string,
  slot: string,
  approved: boolean,
  execute: (intent: CalendarIntent) => Promise<CalendarExecution>,
  actor?: string,
) {
  if (!approved) {
    throw new FosterDomainError(
      "Staff must explicitly approve the Calendar action",
      400,
      "approval_required",
    );
  }

  const intent = store.beginCalendar(requestId, slot);
  try {
    const receipt = await execute(intent);
    const state = store.finishCalendarSuccess(receipt.executionId, receipt.eventReference, actor);
    return { ...receipt, state };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    store.finishCalendarFailure(message, actor);
    throw new FosterCalendarExecutionError(message);
  }
}
