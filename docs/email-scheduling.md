# Document email scheduling

In Documents, choose **Letterhead → Internship offer letter** for an internship
*offer*. Fill or remove all template placeholders, enter the recipient address,
set the private download password, and preview the letter. In **Email delivery**:

- **Automatic — next working time**: sends during Monday–Friday, 09:00–17:00 IST.
  Before 09:00, it waits until 09:00 that day; at/after 17:00 or on a weekend, it
  waits until 09:00 the next weekday. Public holidays are not excluded.
- **Choose a date and time (IST)**: choose a future weekday time from 09:00 up to
  (but excluding) 17:00. This is always Asia/Kolkata, even on a device abroad.
  For example, 14 September 2026 at 09:15 IST is `2026-09-14T03:45:00Z`.

Generate the document to commit its schedule. The issued table shows the due
time and offers **Cancel email** while it is queued. Cancelling email keeps the
signed document; revoking or erasing prevents subsequent queued dispatch. Mail
already submitted cannot be recalled. Changing a form after generation does not
change its queued message. Email is enabled by default; disabling it generates
without delivery. These rules cover certificates, letters and uploaded PDFs.
The recipient gets a secure download link from contact@dmj.one; share the
password separately.

The chosen time is the earliest submission time, not a guaranteed inbox arrival
instant. A one-minute trigger, cold starts, queue backlog, provider/network
latency and submission quotas may delay delivery. If work is delayed beyond the
working window, it resumes the next weekday. To keep SMTP within the window,
submissions with fewer than 35 seconds remaining before 17:00 are deferred.

## Durable outbox and security

`credentials/{id}.emailDelivery` is committed with the encrypted recipient when
the document is stored. No in-process timer or open browser is needed. The
worker checks both PDF artifacts before dispatch; incomplete generation is
retried after five minutes. A single-field Firestore index on
`emailDelivery.nextAttemptAt` finds due work; no composite index is required.
The dispatcher handles four records per call, at most two concurrently, within
the Cloud Run 120-second request deadline. Transactional compare-and-set leases
prevent concurrent triggers or browser retries from submitting the same mail.

Explicit scheduled times are validated server-side before issuance. Retry calls
also obey the working window and cannot bypass a future schedule. The mail
payload is encrypted and frozen on its first submission. First-submission time,
not queue-creation time, starts the Resend idempotency retry window. OCI SMTP
uncertainty or an expired in-flight lease is terminal `outcome_unknown`; it is
never automatically retransmitted. Confirmed rejection requires manual retry.
Quota exhaustion stays queued for another check in 15 minutes within working
hours. Terminal outcomes remove the outbox cursor. No historical unsent records
are backfilled automatically.

## Cloud setup

The deployment workflow preserves these issuer environment variables:

- `EMAIL_SCHEDULER_ACCOUNT=trust-email-scheduler@dmjone.iam.gserviceaccount.com`
- `EMAIL_SCHEDULER_AUDIENCE=<issuer's stable Cloud Run service URL>`

After deploying, run `scripts/configure-email-scheduler.sh` as a project
operator. It creates/updates the dedicated `trust-email-dispatch` job in
`asia-east1`, using cron `* 9-16 * * 1-5` with timezone `Asia/Kolkata`. It grants
the dedicated account only Cloud Run invocation permission on the issuer, with
no signing-secret, mail-secret or Firestore access. No account key is created.
The public issuer authenticates `/api/internal/email/dispatch` separately from
admin cookies: Google's OIDC signature, issuer, expiry and audience are verified,
and the verified email must match this dedicated service account. A caller's
claimed Cloud Scheduler headers alone never authorize dispatch.

Monitor Cloud Scheduler executions and issuer `document.email.*` audit events.
A manual `gcloud scheduler jobs run trust-email-dispatch --location=asia-east1
--project=dmjone` still respects the working window. An unauthenticated POST must
return 403. Review the private issued table for provider rejections or unknown
outcomes. Provider acceptance is not a guarantee of delivery or inbox placement.

Google provides three Scheduler jobs per billing account free; this project
already had three jobs when this fourth job was added. The additional job costs
US$0.10 per 31 days at current list pricing; Cloud Run/Firestore billing is
separate. OCI's existing free-allowance submission guards still apply.

References: [Scheduler pricing](https://cloud.google.com/scheduler/pricing),
[OIDC authentication](https://docs.cloud.google.com/scheduler/docs/http-target-auth),
[timezones and cron](https://docs.cloud.google.com/scheduler/docs/configuring/cron-job-schedules).
