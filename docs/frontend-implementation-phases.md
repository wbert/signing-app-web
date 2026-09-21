# SigningApp frontend implementation phases

**Plan snapshot:** 2026-09-18  
**Frontend:** Next.js 16.3.4 App Router, React 19.2, TypeScript, Tailwind CSS 4  
**Backend contract:** `../signingapp-api`, reviewed at its 2026-09-17 handoff snapshot

## 1. Sources of truth reviewed

Implementation must follow the backend source and tests when documentation and
behavior differ. This plan was derived from:

- `signingapp-api/docs/frontend-handoff.md`
- `signingapp-api/docs/phases/phase-0` through `phase-7`
- `signingapp-api/docs/product-requirements.md`
- `signingapp-api/docs/use-case-map.md` and `use-cases.md`
- identity, document, approval, signing, workflow, archive, and audit route,
  schema, type, and route-test files
- the Next.js 16.3.4 documentation installed in this repository, particularly
  App Router client boundaries, rewrites, authentication, redirects, error
  handling, environment variables, and HTTPS development

## 2. Delivery principles

1. Build vertical, testable journeys rather than a page inventory. The first
   end-to-end internal journey is sign in -> prepare a document -> submit ->
   approve. Public signing follows immediately after it.
2. Browser requests use same-origin relative paths. Next.js rewrites `/api`,
   `/audit-events`, and `/health` to the API URL held in the server-only
   `SIGNINGAPP_API_URL` variable.
3. Internal authentication uses only Better Auth's secure HTTP-only cookie. No
   session, password, OTP, reset token, or signing token may enter local/session
   storage.
4. `/api/me.capabilities`, not role guesses, controls navigation and actions.
   Backend resource authorization remains authoritative.
5. Private API reads are `no-store`. Do not add service-worker caching for API
   responses, PDFs, signatures, certificates, or presigned URLs.
6. Optimistic-concurrency versions come from the newest server response. On
   `409`, reload and explain the conflict rather than resubmitting stale data.
7. Generate an idempotency key once per new action and retain it for retries of
   that action. Disable duplicate submissions while requests are in flight.
8. Every phase includes keyboard, focus, mobile, error, empty, loading, stale,
   and unavailable states. Accessibility is not deferred to Phase 7.

## 3. Proposed route and module map

```text
app/
  login/                       internal username, MFA challenge/enrollment
  set-password/                Better Auth password setup/reset integration
  dashboard/                   capability-driven internal home
  documents/                   sender drafts and creation
  documents/[documentId]/      editor, preview, attachments, submission
  approvals/                   assigned queue
  approvals/[approvalStepId]/  review, approve, return
  workflows/                   sender/admin tracking
  workflows/[requestId]/       assignment progress, recall/reissue/void
  sign/                        public, fragment-token signing journey
  archive/                     compliance search and exports
  archive/[archiveId]/         view, retrieve, verify
  audit/                       filterable append-only events
  admin/users/                 account and role management
  admin/document-types/        type, template, retention, matrix management
  admin/operations/            explicitly labelled recovery operations
components/
  auth/ app-shell/ documents/ approvals/ signing/ workflow/ archive/ admin/
lib/
  api/ auth/ documents/ signing/ validation/ accessibility/
```

Route groups may organize public, authentication, and internal layouts without
changing these URLs. Interactive browser-only behavior should be isolated in
small Client Components; pages and static layout structure remain Server
Components where possible.

## 4. Phase status

| Phase | Frontend outcome                                         | Status                                                     |
| ----- | -------------------------------------------------------- | ---------------------------------------------------------- |
| 0     | Safe API foundation, development topology, global states | In progress; initial foundation implemented                |
| 1     | Internal sign-in/MFA, capability shell, users            | Core UI implemented; connected acceptance coverage pending |
| 2     | Document configuration and draft preparation             | Core UI implemented; connected acceptance coverage pending |
| 3     | Submission and approval routing                          | Core UI implemented; connected acceptance coverage pending |
| 4     | Public review, consent, signature/decline                | Core UI implemented; connected acceptance coverage pending |
| 5     | Workflow tracking and operational actions                | Sender tracking implemented; operations console deferred   |
| 6     | Archive, authenticity, export, and audit                 | Core UI implemented; connected acceptance coverage pending |
| 7     | Production hardening and release evidence                | Code hardening implemented; human gates open               |

A phase is complete only after its UI, integration tests, accessibility checks,
and backend-connected acceptance path pass. A page mockup alone is not complete.

## Phase 0 — Frontend foundation

### Outcome

A secure, testable browser application can reach the deployed API without
cross-origin client code, normalize API failures, expose support references, and
render consistent loading/error/empty states.

### Implementation

- Configure server-only `SIGNINGAPP_API_URL` and same-origin rewrites for the
  three backend prefixes. Add a local HTTPS command because production-mode auth
  cookies are secure.
- Implement one fetch boundary with `credentials: "include"`, `cache:
"no-store"`, JSON/FormData handling, request IDs, stable error normalization,
  binary response support, and optional idempotency keys.
- Define contract types for errors, identity, roles, and capabilities. Grow types
  by feature and verify them against backend route tests; do not create a broad
  speculative model.
- Add root metadata, visual tokens, responsive foundations, app-level error and
  not-found views, and a support-reference pattern.
- Add Vitest + Testing Library for unit/component tests and Playwright for the
  smallest browser acceptance suite. CI can be added once its owner/environment
  is selected, but all commands must run locally first.
- Add a non-production health diagnostic that distinguishes liveness from
  readiness without leaking configuration.

### Acceptance gate

- A fresh checkout can install, type-check, lint, build, and run over local HTTPS.
- The browser calls only relative backend paths and sends cookies.
- JSON, multipart, empty, and binary responses are handled without corrupting
  content headers.
- `401`, `403`, `409`, `410`, `413`, `422`, and `503` have deliberate UI states.
- Returned request IDs are visible in recoverable support errors.
- No secret is bundled through a `NEXT_PUBLIC_` variable.

## Phase 1 — Identity, authorization, and audit foundation

### Outcome

Every internal user signs in with username/password plus TOTP, lands in a
capability-driven shell, and administrators can safely manage internal accounts.

### Implementation

- Complete sign-in, TOTP challenge, mandatory TOTP enrollment, recovery-code
  presentation, sign-out, session expiry, and `/api/me` loading.
- Integrate password setup/reset using Better Auth 1.7.5's verified callback
  contract. Do not add an application-owned reset endpoint.
- Add reusable `RequireCapability` UI boundaries and route-level session guards.
  Hidden UI improves usability but never substitutes for the API check.
- Build the user table with pagination, safe fields only, provision form, role
  replacement, and disable/re-enable confirmation.
- Preserve one UUID per administrative action retry. Refresh on `409` and make
  the last-active-administrator safeguard understandable without exposing
  account internals.
- Do not expose raw Better Auth administrator routes or public registration.

### Acceptance gate

- Unknown username, bad password, bad TOTP, and disabled-account attempts show
  the same public failure copy.
- All roles, including Viewer, are blocked until MFA is complete.
- Navigation and action visibility are derived from returned capabilities.
- A multi-role user receives the union of their allowed modules.
- Provision, role replacement, disable, and re-enable work with idempotent retry.
- Browser storage and logs contain no password, OTP, TOTP URI, backup code, or
  session material.

## Phase 2 — Document configuration and preparation

### Outcome

Administrators can make a document type usable, and Senders can create a valid
PDF draft with signatories, attachments, and accurately positioned fields.

### Implementation

- Build document-type list/editor for active state, file-size policy, retention,
  legal basis, signing mode, expiry, OTP, reminders, and attachment keys.
- Add PDF template upload and version/current-template presentation.
- Build a matrix editor with contiguous numbered steps, parallel/mandatory
  choices, approver roles, role-holder warnings, and prospective-version copy.
- Build the Sender draft wizard: PDF/type -> signatories -> field placement ->
  attachments -> review/save.
- Reject non-PDF and files over the lower of type policy and 4,000,000 bytes
  before upload, while treating server validation as authoritative.
- Render PDF pages using returned one-based `pageGeometry`. Store and convert
  rectangles as normalized fractions; unit-test zoom and resize round trips.
- Support Candidate, Worker, and Client Representative fields without ever
  suggesting that a signatory account will be created.

### Acceptance gate

- Configuration usability and blockers match `/api/document-types`.
- Multipart requests allow the browser to set the boundary.
- Field rectangles stay on-page and do not drift across viewport sizes.
- Required attachments and signatory references are validated accessibly.
- Refreshing a saved Draft reproduces its fields and signatories exactly.
- Another Sender's inaccessible draft never leaks through UI state or errors.

## Phase 3 — Approval routing

### Outcome

Senders submit/recall valid drafts and Approvers safely review, approve, or return
assigned work using the server's instantiated approval path.

### Implementation

- Show the derived matrix and exact submission blockers before submission.
- Submit with current `expectedVersion`; handle stale state by reloading.
- Build an age-ordered approval inbox and detail view containing preview,
  attachments, path, current assignment, and decision history.
- Approve with both document and assignment versions.
- Return with a required reason and an explicit originator or valid earlier-step
  target. Preserve the server's explanation when it falls back to originator.
- Add recall before first approval and administrator reassignment with stale
  decision protection.

### Acceptance gate

- Only an assigned Approver sees decision controls.
- In-flight paths stay understandable after a configuration version changes.
- Parallel and sequential groups render correctly.
- Double-clicks and network retries cannot submit duplicate decisions.
- A `409` never silently overwrites a recall, return, approval, or reassignment.

## Phase 4 — External signing and execution

### Outcome

An accountless signatory can securely review, consent, sign or decline, and reach
a clear terminal state on mobile or desktop.

### Implementation

- On `/sign`, read `#token=...` once, keep it only in component memory, and
  immediately remove the fragment using `history.replaceState`.
- Use `Authorization: Signing <token>` for this feature only. Never use the
  internal cookie client as a token store or transform it into a Bearer token.
- Build three mobile-oriented stages: access/OTP, review/consent, sign/complete.
- Render the full PDF without third-party scripts. Report the last page to the
  API and leave signing disabled until the server confirms review.
- Render the exact server consent text/version and require affirmative consent.
- Provide drawn, typed, and safely validated uploaded-image alternatives.
  Keep partial capture in volatile memory and below the approximately 1.5 MB
  API limit.
- Generate one idempotency key per sign/decline intent and retain it across safe
  retries with the newest request version.

### Acceptance gate

- The raw token never appears in URL history after bootstrap, logs, telemetry,
  storage, referrers, error reports, or server-rendered HTML.
- Invalid/expired/used/voided links show terminal non-technical states.
- OTP lockout, last-page review, consent, and all signature methods work.
- Keyboard-only and touch users can finish the flow; typed signing is a complete
  non-pointer alternative.
- Lost connections persist no partial signature and allow a safe resume only
  while the server session remains valid.

## Phase 5 — Workflow operations and automation visibility

### Outcome

Authorized Senders and administrators can understand each workflow and take only
the safe operational actions supported by its current state.

### Implementation

- Build status-filtered workflow list and detail with signatory assignment
  progress, approval steps, delivery state, and server-localized timestamps.
- Add recall, reissue, and void flows with required reason/confirmation and
  current versions.
- Surface delivery failures without showing tokens, private authentication data,
  or unsafe presigned URLs.
- Keep scheduler execution off the normal frontend. Put scan/drain/replay tools,
  if product owners require them, on a clearly labelled administrator operations
  page with impact warnings and result evidence.

### Acceptance gate

- All ten workflow statuses have distinct copy and allowed actions.
- Sequential workflows do not imply later signatories are active.
- Void confirmation clearly states that outstanding links become unusable.
- Reissue/void retries are safe, and stale state reloads before retry.
- Background-job failures are visible only to authorized users and contain no
  sensitive message body or token.

## Phase 6 — Archive, compliance, and audit

### Outcome

Viewers can find, retrieve, verify, and export authorized records with explicit
purpose and inspect an immutable, filterable audit trail.

### Implementation

- Build server-backed archive filtering with pagination and URL-serializable,
  non-sensitive criteria.
- Require a 3–500 character purpose before view, retrieve, verify, preview, or
  export actions where the API requires it.
- Open short-lived retrieval URLs promptly and never store or send them to
  analytics. Use safe filename parsing for binary export downloads.
- Show authenticity results as verified, mismatch, or unavailable; never turn a
  hash mismatch into a client-side pass/fail guess.
- Preview export count/limits before creation, retain its idempotency key, poll
  boundedly for completion, and report missing items explicitly.
- Build paginated audit list/detail as read-only UI with minimized structured
  metadata and actor/time/request context.
- Show retention review flags; provide no delete/disposal action because the
  backend policy intentionally excludes automatic destruction.

### Acceptance gate

- Search results, totals, URLs, and filters do not leak unauthorized records.
- Retrieval and export actions always capture an acceptable purpose.
- Binary ZIP download honors a safe server filename and handles expiration.
- Missing export objects and hash mismatches are prominent, never silently
  omitted.
- Audit UI offers no mutation path.

## Phase 7 — Production hardening and release

### Outcome

The frontend is releaseable only when its evidence joins the backend's open
legal, privacy, security, recovery, deliverability, accessibility, and pilot
gates.

### Implementation

- Add a restrictive Content Security Policy compatible with self-hosted assets,
  PDF rendering, and no third-party scripts on `/sign`.
- Complete dependency, secret, static, dynamic, cross-role, guessed-ID, and
  stored-XSS testing.
- Run supported-browser, slow-network, interruption, mobile viewport, keyboard,
  screen reader, focus, contrast, and reduced-motion checks.
- Prove the first-time mobile signatory journey can finish within the intended
  three screens with no installation.
- Add privacy-reviewed operational telemetry containing only allow-listed
  metadata; explicitly block credentials, personal document data, tokens,
  signatures, document bytes, and presigned URLs.
- Exercise frontend deploy/rollback, runtime configuration, smoke tests, and the
  controlled pilot. Record accountable owner sign-off; do not infer it from a
  successful build.

### Acceptance gate

- Type-check, lint, unit, component, browser, accessibility, and production build
  checks pass from a clean checkout.
- No unresolved release-blocking security/accessibility issue remains.
- Credential rotation and exact frontend/API origin configuration are verified.
- Production sign/reset links use the reachable HTTPS frontend origin.
- Product, operations, privacy/compliance, and legal owners accept their gates.

## 5. Test matrix

| Layer         | Required coverage                                                                                                                |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Unit          | API error mapping, capabilities, coordinate conversion, token-fragment removal, safe filename parsing, idempotency-key lifetime  |
| Component     | MFA states, duplicate-submit lock, upload limits, version conflicts, return targets, purpose collection, terminal signing states |
| Contract      | Mocked response fixtures copied from route tests and refreshed when backend response types change                                |
| Browser       | One journey per internal role, multi-role navigation, session expiry, and one complete external signatory journey                |
| Accessibility | Automated checks plus manual keyboard, focus, screen-reader, contrast, mobile PDF, and signature-alternative review              |
| Security      | Token/storage/log inspection, cross-user and cross-role access, unsafe file/image input, XSS, referrer and telemetry review      |

## 6. Known blockers and decisions still required

- Rotate the credentials identified in the backend handoff before any real-user
  or real-document test.
- Supply the deployed Lambda Function URL and make `APP_ORIGIN`, Lambda Function
  URL CORS, password setup redirect, and frontend HTTPS origin match exactly.
- Exercise password setup/reset against Better Auth 1.7.5 and the deployed API
  in the integration environment before marking Phase 1 complete.
- Select a PDF renderer and signature-canvas implementation after confirming
  supported-browser, bundle-size, CSP, and accessibility requirements.
- Decide whether administrators should receive a recovery-operations UI at all;
  it is not part of ordinary workflow navigation. Phase 5 shipped without it,
  so `workflow-jobs` scan/drain/failed/replay and delivery bounce recording have
  no frontend and are reachable only by direct API call.
- `/api/workflows` is guarded by `documents:read` and scoped to documents the
  caller owns, so only a Sender can see any workflow. An Administrator holds
  `workflow:manage` but not `documents:read` and is refused. Confirm with the
  product owner whether administrators are meant to have oversight here; if so,
  the backend capability, not the frontend gate, has to change.
- Legal/privacy, email-domain authentication, recovery, load, accessibility,
  pilot, and owner sign-off remain production gates outside frontend code alone.

## 7. Immediate implementation sequence

1. Finish Phase 0 tests and health diagnostics.
2. Complete Phase 1 user administration and Better Auth setup/reset integration.
3. Implement Phase 2 document-type configuration first, then the Sender draft
   wizard against a non-production Lambda.
4. Add Phase 3 approval to complete the first internal end-to-end journey.
5. Build and security-test `/sign` before exposing real invitation links.
6. Add workflow operations, then archive/audit, while accumulating Phase 7
   evidence throughout—not at the end.
