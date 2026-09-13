# OCI email delivery for Trust Services

The selected provider is OCI Email Delivery in **us-phoenix-1**, the tenancy's
confirmed home region. Oracle documents 3,000 emails/month in the Always Free
resources. The application deliberately reserves fewer submission attempts:

- **90 per rolling 24-hour window**;
- **2,700 per UTC calendar month**;
- one recipient per message, secure download links only, no PDF attachments and
  no download passwords in email.

Reservations include failed submissions and races, so the guard is conservative.
The counters live in Firestore (`email_quotas/oci-trust`) and survive Cloud Run
instance changes. Missing/corrupt quota state fails closed. A reached limit stops
email submission, but the signed document remains available. Quotas are not reset
by credential erasure or normal application backup/restore operations.

These are application limits, not a tenancy-wide billing guarantee. OCI's free
allowance is shared with any other OCI email usage. Existing Google Cloud hosting,
Firestore and Secret Manager billing are separate. No OCI paid-tier upgrade,
limit increase, dedicated IP, or extra compute instance was provisioned.

## Sender and credentials

- Sender and reply-to: `contact@dmj.one`.
- SMTP endpoint: `smtp.email.us-phoenix-1.oci.oraclecloud.com:587`.
- STARTTLS is mandatory, certificate/hostname validation is enabled, and the
  minimum TLS version is 1.2. SMTP debugging and protocol logging are disabled.
- Dedicated OCI identity: `dmj-trust-mail-sender`.
- Group: `dmj-trust-mail-senders`, permitted only to use approved senders inside
  the `dmj-trust-mail` compartment. Only `contact@dmj.one` was approved there.
- The identity has SMTP credential capability; console passwords, API keys,
  auth tokens, database credentials, customer secret keys, and OAuth2 client
  credentials are disabled.
- The generated SMTP credentials were transferred directly into the Google
  Secret Manager secret `trust-oci-smtp-credentials`, version **1**, as a JSON
  object with `username` and `password`. No plaintext credential file was made.
- `issuer-sa@dmjone.iam.gserviceaccount.com` has secret-level accessor permission.
  The new secret-level accessor binding was added only for the issuer.

The deployment workflow sets `MAIL_PROVIDER=oci` and mounts the secret as
`OCI_SMTP_CREDENTIALS`. Local development remains disabled by default. There is
no automatic fallback to Resend or Pactmail.

## DNS and inbound mail

Cloudflare remains authoritative and continues routing incoming `*@dmj.one`
mail to the existing Gmail destination. The root MX records and routing rules
must remain unchanged.

| Type | Name | Value |
|---|---|---|
| CNAME (DNS only) | `dmjtrust-phx-20260912._domainkey` | `dmjtrust-phx-20260912.dmj.one.dkim.phx1.oracleemaildelivery.com` |
| TXT | `@` | `v=spf1 include:_spf.firebasemail.com include:_spf.mx.cloudflare.net include:rp.oracleemaildelivery.com ~all` |

The single SPF policy replaces the previous two SPF policies. It retains the
existing Firebase and Cloudflare authorizations and adds OCI's Americas sender
range. At setup its recursive worst-case DNS mechanism count was seven, below
SPF's ten-lookup limit. Existing DKIM records and the DMARC policy are preserved.
OCI's default return path handles bounces; no new root MX records are needed.

Run `node scripts/check-oci-email-dns.mjs` to validate the public records. This
check also runs before deployments. Initial activation additionally requires the
OCI DKIM resource to report **ACTIVE**, not just a publicly visible CNAME.

## Delivery semantics

Generation signs and stores both the primary PDF and its supporting artifact
before attempting email. The durable outbox is created with the record, and delivery follows [the weekday IST schedule](email-scheduling.md). The recipient and frozen message are encrypted at rest
and excluded from public verification responses. Email failures never require
regenerating the signed document.

SMTP has no provider idempotency guarantee. A stable Message-ID is used for
correlation only. A disconnect/timeout or expired sending lease is marked
`outcome_unknown`, and the application will not automatically retransmit it.
Check OCI Email Delivery logs before arranging any manual resend. Explicit
permanent SMTP rejections can be retried up to the existing attempt cap and
within the free-budget guard. Provider acceptance does not establish delivery or
inbox placement. No provider guarantees avoiding spam.

OCI DKIM signing was confirmed ACTIVE after the DNS records were published.
SMTP authentication and mandatory TLS were tested without transmitting an email.
End-to-end generation, encrypted delivery state, quota handling, and SMTP outcome
handling are covered with isolated test transports; no real recipient test email
is sent without the owner's selected recipient and authorization.

References:

- [Oracle Always Free resources](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm)
- [OCI Email Delivery setup](https://docs.oracle.com/en-us/iaas/Content/Email/Reference/gettingstarted.htm)
- [OCI DKIM setup](https://docs.oracle.com/en-us/iaas/Content/Email/Tasks/managing_dkim-create_dkim_record.htm)
- [Nodemailer SMTP transport](https://nodemailer.com/smtp)
