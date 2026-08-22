# RescueOps shared-platform demo

This branch adds a reusable, multi-organization operating layer beneath the existing adoption intake and the parallel foster-placement workflow. It is not a chat product, a global foster directory, or a replacement for Shelterluv.

## Run the synthetic demo

```bash
npm ci
npm run platform:demo
```

Open `http://localhost:4222/platform`.

The standalone demo does not need Arcade, Google, Slack, Anthropic, or Shelterluv credentials. It uses synthetic records, a local plaintext JSON store, and simulated provider receipts. The existing adoption intake remains available through `npm start`; when its environment is configured, the same platform surface is mounted at `/platform` and its API at `/api/platform`.

## Five-minute flow

1. Open Harbor Hope Rescue. The platform starts on the urgent foster case: “Get Luna a qualified 4-hour outing today.” Point out the stale Shelterluv export, evidence, idempotency keys, and named-human approval boundary.
2. Approve the targeted Gmail draft. The decision and simulated receipt are persisted. Refresh the page to show that the approval and receipt survive.
3. Add a two-hour coordinator checkpoint. The reminder record is persisted. The demo API can deterministically trigger due reminders with `POST /api/platform/reminders/run`.
4. Open Partner network. Review Mission Valley’s persisted capacity offer, approve the explicit `name`, `species`, and `breed` share grant, and complete the handoff. Refresh to show the completed service state and simulated handoff receipt.
5. Switch to Mission Valley, then between Foster and Adoption. The same case, approval, receipt, event, reminder, and organization-boundary primitives support both workflows.

## What is real in this branch

- Atomic file-backed JSON persistence for the synthetic demo
- Organization-scoped records and fail-closed reads
- Adoption and foster cases on one shared platform
- Idempotent action proposals and duplicate-dispatch protection
- Named approvals, rejections, receipts, and event histories
- Provider-neutral executor with succeeded, failed, uncertain, and simulated outcomes
- Reminder persistence and deterministic due-reminder triggering
- Limited network request, capacity offer, explicit field-level share grant, and handoff
- API-backed operator surface; approval and handoff state survive refresh
- Existing adoption application flow still compiles

## Explicitly simulated or deferred

- Gmail, Calendar, Sheets, Slack, and Shelterluv actions are simulated in the standalone demo. No live provider call is made.
- Shelterluv is represented as an export/manual-reconciliation boundary. No Shelterluv API availability is claimed.
- The organization switcher is demo isolation, not authenticated production tenant security.
- The JSON store is plaintext, single-process, and not transactionally safe across multi-record operations.
- Foster qualification/matching and adoption screening remain workflow-owned. This branch provides their shared platform primitives and demo proposals; it does not claim completed domain policy modules.
- PetPoint and 24PetShelter are future adapters.

## Verification

```bash
npm run typecheck
npm run test:platform
node --check public/platform.js
```

The integrated test suite covers persistence, organization scope, action idempotency, approval and dispatch, simulated provider safety, reminders, limited sharing, handoffs, HTTP endpoints, and operator-surface boundaries.
