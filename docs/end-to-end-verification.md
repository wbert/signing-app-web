# End-to-end verification run

**Purpose:** prove the implemented frontend works against the deployed API, not
against mocks. Every phase's status says "connected acceptance coverage
pending"; this checklist is how that pending state is cleared.

**Why it matters:** the unit and component suites mock `apiRequest`, so nothing
in them has ever reached the API, Cloudinary, or a real PDF. A React Strict Mode
defect once put every valid signing link on an error screen while 81 tests
passed. Mocks cannot find that class of fault.

## How to use this

Work top to bottom in one sitting; each step depends on the one before it. After
each step, run its query and compare against **Expect**. A mismatch is a real
finding — record the step number, what you saw, and the `request_id` from any
support reference shown in the UI.

Set the connection string once:

```bash
cd ../signingapp-api
DB=$(grep -m1 '^DATABASE_URL=' .env | cut -d= -f2- | sed 's/^"//; s/"$//')
```

Then each query below runs as `psql "$DB" -X -c "<query>"`.

Run both servers, and note that `APP_ORIGIN` in the API's `.env` must match the
frontend's origin exactly, because it builds the emailed signing link:

```bash
# frontend
npm run dev          # http://localhost:3000
# api
bun run dev          # http://localhost:3001
```

---

## 1. Sign in and capabilities

**Do:** open `/login`, sign in, complete the TOTP challenge.

**Expect:** you land on `/dashboard`, and the module tiles match your roles. A
Sender sees Documents and Workflows; an Administrator sees User administration
and Document configuration; a Viewer sees Archive and Audit trail.

**Watch for:** a tile that 404s, or a tile missing for a role that should hold
it. Navigation comes from `/api/me` capabilities, so a wrong tile means the
capability gate is wrong, not the route.

```sql
select id, username, account_status from "user" order by created_at desc limit 5;
```

## 2. Document type is usable

**Do:** as an Administrator, open `/admin/document-types`. Confirm the type you
will use is active, has a current template, and has an approval matrix whose
mandatory steps all have a role holder.

**Expect:** the type reports no blockers for either drafting or submission.

**Watch for:** `isUsableForSubmission` false while the UI offers submission
anyway — that would let step 4 fail confusingly.

## 3. Create a draft

**Do:** `/documents/new`. Upload a real multi-page PDF, add at least one
signatory with an address you can read, place a signature field on the **last**
page, attach anything the type requires, save.

**Expect:** the draft reopens with fields in the same positions after a refresh.

```sql
select d.id, d.title, d.approval_status, d.page_count,
       (select count(*) from document_signatories s where s.source_document_id = d.id) as signatories,
       (select count(*) from document_fields f where f.source_document_id = d.id) as fields
from source_documents d order by d.updated_at desc limit 3;
```

**Expect:** `approval_status = DRAFT`, signatory and field counts matching what
you entered.

**Watch for:** field coordinates drifting between save and reload, or between
browser zoom levels. Coordinates are normalized fractions; a drift means the
rendered surface and the stored geometry disagree.

## 4. Submit for approval

**Do:** submit the draft.

```sql
select approval_status, approval_round, workflow_version
from source_documents order by updated_at desc limit 1;

select step_number, approver_role, status, approval_round
from approval_steps where source_document_id = '<document id>'
order by approval_round, position;
```

**Expect:** document `IN_APPROVAL`; step 1 `PENDING`, later steps `WAITING`.

## 5. Approve every mandatory step

**Do:** sign in as each approver in turn and approve from `/approvals`.

**After the final mandatory approval:**

```sql
select d.approval_status, s.status as signal_status
from source_documents d
left join approval_completion_signals s on s.source_document_id = d.id
where d.id = '<document id>';
```

**Expect:** `APPROVED` and signal `CONSUMED`.

**Watch for:** a signal stuck at `PENDING`. That means issuance threw and was
swallowed (`approval.service.ts:181`). Nothing retries it on a timer — it clears
only when another document is approved, or via
`POST /api/signing-requests/issue-pending`.

## 6. Invitation issued and delivered

```sql
select id, status, expires_at from signing_requests order by created_at desc limit 1;

select a.id, a.status, a.signing_order, a.token_expires_at, ds.email_address
from signing_assignments a
join document_signatories ds on ds.id = a.document_signatory_id
order by a.signing_order;

select message_type, delivery_status, attempt_count, last_error_code,
       provider_message_id, sent_at, recipient_address
from signing_notifications order by created_at desc limit 5;
```

**Expect:** request `SENT`; first assignment `ACTIVE` with a future
`token_expires_at`; notification `SIGNING_INVITATION` with
`delivery_status = SENT` and a non-null `provider_message_id`.

Under `SEQUENTIAL`, only the lowest `signing_order` is `ACTIVE`; the rest are
`WAITING` and have no token at all.

**Watch for:** `delivery_status` of `FAILED`/`BOUNCED`, or
`last_error_code = EMAIL_PROVIDER_UNAVAILABLE` (no SMTP configured). Check the
invitation email's link starts with your actual frontend origin.

## 7. Open the signing link

**Do:** open the emailed link. Do **not** reload the page afterwards — the token
is stripped from the URL by design and a reload cannot recover it.

**Expect:** the OTP screen if the type requires a passcode, otherwise the
document. The address bar shows `/sign` with no fragment.

```sql
select status, viewed_at, otp_verified_at, otp_failed_attempts, locked_at
from signing_assignments where id = '<assignment id>';
```

**Expect:** `viewed_at` set.

**Watch for:** "This page needs the link from your email" on a link you just
clicked — that is the Strict Mode class of defect and means the token claim
regressed. Three wrong passcodes set `locked_at` and close the link for good.

## 8. Read, consent, sign

**Do:** scroll to the final page, accept the consent notice, sign with each of
the three methods in turn if you can (draw, type, upload), then submit.

```sql
select last_page_viewed_at, consent_accepted, consent_version
from signing_assignments where id = '<assignment id>';

select capture_method, applied_at, idempotency_key
from signatures order by created_at desc limit 3;
```

**Expect:** `last_page_viewed_at` set and `consent_accepted = true` **before**
signing is permitted; then exactly one `signatures` row per assignment.

**Watch for:** more than one signature row for one assignment — the idempotency
key failed to hold. Also verify the typed method is fully usable with the
keyboard alone, since it is the designated non-pointer alternative.

## 9. Execution and archiving

Triggered by the **last** signatory signing, in one transaction.

```sql
select e.file_name, e.certificate_no, e.byte_length, left(e.document_hash, 16) as hash_head,
       a.retention_end_date, a.retention_period_months, a.disposal_action, a.legal_basis
from executed_documents e
join archive_records a on a.executed_document_id = e.id
order by e.created_at desc limit 1;

select status, completed_at from signing_requests order by created_at desc limit 1;
```

**Expect:** one `executed_documents` row, one `archive_records` row, request
`COMPLETED`, and a `SIGNING_COMPLETED` notification per recipient with both PDFs
attached.

**Watch for:** an executed row with no archive row — that would mean the
transaction was not atomic, and is a serious finding.

## 10. Workflow tracking

**Do:** as the Sender, open `/workflows`.

**Expect:** the document shows **Signed and archived**; the detail page shows
each signatory with signed timestamps, the approval history, and no withdraw
action (the request has finished).

**Also test on a second, still-open document:** withdraw it, and confirm the
reason is recorded, the status becomes Voided, and its signing link stops
working when opened.

## 11. Archive, retrieval, authenticity

**Do:** as a Viewer, open `/archive`, find the record, open it with a purpose,
then Retrieve and Verify.

**Expect:** Verify reports **Authentic**. Retrieve opens the executed document
and the certificate in new tabs. Stamped signatures appear in the positions you
placed in step 3.

```sql
select event_type, actor_label, occurred_at, data ->> 'purpose' as purpose
from audit_events where category = 'ACCESS'
order by occurred_at desc limit 5;
```

**Expect:** one row per action you just took, each carrying the purpose you
typed. The purpose is stored inside the `data` payload, not in its own column.

**Watch for:** Verify reporting **Does not match**. That means the stored bytes
no longer hash to the recorded value — treat it as an incident, not a UI bug.

**Then test the export:** filter to a small set, preview it, create it with a
purpose, and download. Confirm the saved filename is the server's, and that any
missing items are listed rather than silently dropped.

## 12. Audit trail

**Do:** open `/audit`, filter by the document's ID in Target ID.

**Expect:** the full chain in order — submitted, approved, issued, viewed,
signed, completed, and your archive access from step 11. Open one event on its
own page and confirm the URL is citable.

```sql
select event_type, actor_label, occurred_at
from audit_events where target_id = '<document id>' order by occurred_at;
```

**Watch for:** any gap in the chain, and any mutation control anywhere in the
audit UI (there should be none).

---

## Cross-role checks

Run these after the happy path, signed in as the wrong role each time. All
should be refused by the API, not merely hidden by the UI.

| As            | Try                                      | Expect                                   |
| ------------- | ---------------------------------------- | ---------------------------------------- |
| Approver      | open `/documents`                        | redirected to dashboard                  |
| Sender        | open `/audit`                            | redirected to dashboard                  |
| Viewer        | open `/workflows`                        | redirected to dashboard                  |
| Sender B      | open Sender A's `/workflows/<requestId>` | not found, no title leaked               |
| Sender        | open another sender's `/documents/<id>`  | not found                                |
| Administrator | open `/workflows`                        | currently refused — see the blocker note |

## Recording results

For each failure capture: step number, what you expected, what happened, the
support reference shown in the UI, and the matching `request_id` in
`audit_events`. That pairing is what makes a frontend fault distinguishable from
an API fault.
