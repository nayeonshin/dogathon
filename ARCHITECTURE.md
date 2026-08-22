# RescueOps architecture and capability audit

## Runtime surfaces

One Hono process on `PORT` (default `4111`) serves every experience and shares
one Arcade/Gmail/Calendar connection:

| Route | Experience |
| --- | --- |
| `/` | Adoption intake operator console |
| `/apply` | Public adoption application |
| `/foster-intake` | Foster-home intake operator console (form samples + Call Slack bot) |
| `/foster-apply` | Public foster-home application |
| `/foster` | Staff foster-placement dashboard |
| `/foster/respond/:token` | Foster-facing response page |
| `/platform` | Shared, multi-organization operations dashboard |
| `/api/platform/*` | Shared platform records, actions, reminders, receipts, and network handoffs |

Adoption and foster-home intake remain mailbox-driven agents. Foster placement
is a deterministic, in-memory state machine with model-assisted copy and one
staff-approved Calendar action. The shared platform is a separate persistent
demo domain with organization-scoped records, explicit approvals, typed action
receipts, reminders, and limited-field rescue-to-rescue handoffs. It is mounted
in the same runtime, but the intake and placement workflows do not yet write to
that shared store.

## Capability status

### Side 1: adoption intake

| Capability | Status | Implementation |
| --- | --- | --- |
| Public adoption application | Implemented | `/apply` |
| Spam-versus-genuine triage | Implemented | `src/triage.ts` |
| Applicant pipeline in Google Sheets | Implemented | Agent through the Arcade MCP gateway |
| Volunteer notification | Implemented | Agent posts to the configured Slack channel |
| Meet-and-greet scheduling | Implemented | Agent selects a time from application context |
| Calendar event creation | Implemented | Agent uses the Calendar MCP tool |
| Personalized reply draft | Implemented | Agent creates a Gmail draft, never sends it |
| Operator activity console | Implemented | `/` with SSE activity |

### Side 2: foster placement

| Capability | Status | Implementation or gap |
| --- | --- | --- |
| Urgent foster request creation | Implemented | One seeded Luna campaign |
| Foster profiles and current availability | Implemented for demo | Three synthetic in-memory profiles |
| Capacity, preferences, restrictions | Implemented | Deterministic profile fields and rules |
| Explainable foster shortlist | Implemented | Every rule exposes result and evidence |
| Staff-approved targeted outreach | Partial | Staff approves personalized previews; no email is sent |
| Foster-facing dog details | Implemented | Tokenized response page |
| Yes/no/maybe response | Implemented | One locked response per token |
| Foster questions or concerns | Implemented | Stored with the response |
| Shared response dashboard | Implemented | SSE updates without reload |
| Backup-foster selection | Implemented | Staff-selected, non-declined eligible backup |
| Visit or handoff scheduling | Implemented for demo | Seeded handoff slots |
| Automatic Calendar invitations | Partial | One approved event to a demo alias; no general invitation service |
| Confirmation and reminder messages | Partial | Model-assisted staff previews; not sent |
| Placement closure | Implemented | Handoff and closure state gates |
| Shelterluv update receipt | Partial/manual | Attestation only; no Shelterluv API adapter |

### Shared platform

| Shared capability | Status | Why |
| --- | --- | --- |
| Organization-scoped animal records | Implemented for shared demo | Persistent records exist, but intake `DOGS` and placement Luna are not yet reconciled into them |
| Organization-scoped people records | Implemented for shared demo | Persistent people records exist, but Gmail/Sheets intake and placement profiles do not yet feed them |
| Cross-rescue capacity exchange | Implemented for shared demo | Offers, explicit field-level grants, and human-accepted handoffs are persisted |
| Gmail connection | Partial | Intake uses Arcade; shared-platform actions default to simulation and are not wired to that live grant |
| Calendar connection | Partial | Intake and foster placement use Arcade; shared-platform Calendar actions default to simulation |
| Human approval controls | Partial | Shared-platform and placement actions are gated; adoption intake remains mostly autonomous |
| Activity timeline | Partial | Shared events persist, while intake SSE and placement events remain separate models |
| Action receipts | Partial | Shared actions have typed persistent receipts and placement has receipts; intake relies on transient agent events |
| Reminders | Implemented for shared demo | Deterministic, idempotent, cancellable reminders persist in the platform store |
| Scheduling engine | Partial | Shared reminders exist, but adoption uses model instructions and placement uses seeded slots |
| Communication templates | Partial | Separate agent prompts and placement fallback copy are not yet one shared template system |
| Shelterluv adapter | Missing | Only a truthful manual placement attestation exists |
| Metrics and reporting | Missing | No shared counters, funnel, or outcome reporting |
| Production tenant security | Missing | Organization switching demonstrates isolation but is not authentication or authorization |

## Two-sided demo status

1. Adopter submits an application: implemented.
2. RescueOps triages and prepares adoption workflow: implemented when providers
   and the gateway are authorized.
3. Staff creates Luna's urgent request: implemented.
4. RescueOps identifies compatible fosters: implemented deterministically.
5. Maya receives an email and opens the response page: **missing delivery**;
   staff currently opens or shares a generated local response link.
6. Maya accepts and selects a visit time: implemented once the link is opened.
7. Staff approves the placement: implemented through primary/backup selection
   and explicit Calendar approval.
8. Both sides receive invitations and reminders: **partial**; the Calendar event
   is live, but reminder and confirmation messages are previews only.
9. Shelterluv reconciliation: **partial**; closure records a manual receipt but
   does not call Shelterluv.

## Why the gaps exist

The two sides were built independently with different system boundaries:

- Intake is event-driven and externally persisted in Gmail, Sheets, Slack, and
  Calendar through an MCP agent.
- Placement is a resettable in-memory state machine designed to demonstrate
  explainability, approval gates, and failure-safe Calendar execution.
- The foster-home intake Sheet is not yet a source for placement profiles.
- The placement scope deliberately constrained outreach/reminders to previews
  and Shelterluv to manual attestation, so those actions have no delivery or
  provider adapter yet.
- A shared JSON-backed demo domain now represents animals, people, cases,
  actions, approvals, receipts, events, reminders, and network handoffs, but the
  two workflow implementations are not yet connected to it.

The next architectural milestone is convergence: make the intake agents and the
placement state machine read and write the existing shared records and receipts,
then remove their duplicate `DOGS`, synthetic-profile, in-memory, and transient
event representations. Production authentication, encrypted durable storage,
and verified provider adapters remain later gates; they should not be inferred
from the synthetic organization switcher or simulated receipts.
