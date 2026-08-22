# RescueOps shared-platform contract

This branch adds a reusable platform beneath the existing adoption intake and the parallel foster-placement workflow. It must not contain adoption or foster policy decisions.

## Ownership boundaries

- `src/platform/**`: shared records, persistence, actions, approvals, receipts, reminders, events, organization scope, network exchange, and integration contracts.
- `src/workflows/adoption/**`: adoption-specific intake, screening, and next-action logic.
- `src/workflows/foster/**`: foster-specific matching, outreach, and placement logic.
- `public/platform.html`: shared operator surface.
- Existing `src/server.ts` and `public/index.html`: changed only during final integration.

## Required shared records

Every persisted record has a stable ID, `organizationId`, source metadata, created and updated timestamps, and an explicit status where applicable.

- Organization and membership
- Animal and person
- Workflow case
- Task and appointment
- Proposed action and approval
- Action receipt and workflow event
- Reminder
- Network request, capacity offer, share grant, and handoff

## Common case states

`new`, `reviewing`, `needs_information`, `ready_for_approval`, `approved`, `in_progress`, `waiting_for_response`, `completed`, `failed`, `cancelled`.

## Common action lifecycle

1. A workflow proposes a structured action.
2. The platform stores the proposal with evidence and an idempotency key.
3. Consequential actions require a named human approval.
4. The platform dispatches the approved action through a provider adapter.
5. The platform stores a typed receipt: `succeeded`, `failed`, `uncertain`, or `simulated`.
6. A workflow event is appended to the case timeline.

## Workflow adapter contract

Each workflow module must expose equivalents of:

- `createCase`
- `getCaseContext`
- `proposeNextActions`
- `handleExternalResponse`
- `completeCase`

The platform owns persistence, approvals, dispatch, reminders, events, receipts, and organization scope.

## Organization boundary

- Records are private to one organization by default.
- Cross-organization requests publish only an explicit limited summary.
- Additional information requires a recorded share grant.
- Foster personal data is never globally searchable.
- The demo may use synthetic organization switching, but must not claim production tenant security.

## Integration boundary

- Gmail, Google Calendar, Google Sheets, and optional Slack run behind shared adapters.
- Shelterluv is the current interview-reported system. The demo uses an approved export/manual reconciliation boundary unless live access is provided.
- PetPoint and 24PetShelter remain future adapters.
- Provider SDK credentials never enter workflow policy code.

## Demonstration acceptance

- Existing adoption intake still compiles and runs.
- A foster case can use the same action, approval, receipt, event, and reminder primitives.
- Two synthetic organizations can exchange a limited capacity request and produce a handoff receipt.
- Repeating the same idempotency key does not create a second action.
- Slack is optional.
- No automatic final adoption, foster, medical, behavior, or cross-organization sharing decision is claimed.
