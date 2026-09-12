# Document email integration

Status: issuer-side sending and retry support is implemented. Production sending
remains disabled until the outbound provider is chosen and configured. The
existing Pactmail deployment supports only authenticated self-link emails; the
integration endpoint below is a proposed contract, not an existing API.

Incoming email must remain Cloudflare Email Routing: `*@dmj.one` continues
forwarding to the existing Gmail inbox. Do not change the root-domain MX records or forwarding
rules when setting up an outbound provider.

## Application behavior

Certificates and letters can specify `recipientEmail` at generation time. The
address is encrypted at rest and excluded from signed content, public responses,
and email/audit logs. Sending starts only after the signed document and its
supporting artifact are stored. Email contains a verification/download link;
share the existing download password separately. No plaintext PDF attachment or
password is sent. An email failure returns the generated document ID and a
separate email status, so retrying delivery does not regenerate the document.

Email delivery leases and outcomes are persisted on the private document record.
The first provider request body is encrypted and reused byte-for-byte with the
same idempotency key on retries. A maximum of three attempts is allowed within
23 hours; accepted mail is never resent. Unknown outcomes outside the deduplication
window need provider reconciliation. Provider acceptance does not prove inbox
placement or delivery. Revoked, erased, and incomplete documents cannot be mailed;
erasure purges both the address and encrypted request body. A network failure of
the generation request itself requires checking the issued-document list before
trying generation again; generation POST requests are not automatically retried.

## Option A: Pactmail service API

Add a dedicated integration endpoint outside the existing Firebase/self-link
preview API. This does not require making Pactmail's user-facing mail endpoint an
arbitrary-recipient relay.

Proposed URL:
`POST https://pactmail-azjqpkmlpa-de.a.run.app/api/integrations/trust-documents/send`

Authenticate the request using a Google-signed OIDC ID token:

- audience: `https://pactmail-azjqpkmlpa-de.a.run.app`
- permitted caller: `issuer-sa@dmjone.iam.gserviceaccount.com`
- validate issuer, signature, expiry, audience, verified service-account identity,
  and sender-specific authorization on every call; an arbitrary Firebase user
  token must not grant this capability.
- retain the provider key in Pactmail's Secret Manager binding. The issuer needs
  no Resend key for this option. Use scoped Cloud Run invocation permission if
  the integration is hosted on an IAM-protected service.

Request:

```json
{
  "documentId": "DMJ-LTR-20260912-01",
  "kind": "letter",
  "to": "recipient@example.com",
  "downloadUrl": "https://verify.dmj.one/v/UNGUESSABLE_DOCUMENT_TOKEN"
}
```

Headers: `Content-Type: application/json` and
`Idempotency-Key: dmj-trust-v1/DMJ-LTR-20260912-01`.

Requirements:

- Fix the sender and reply-to to `contact@dmj.one` server-side.
- Accept one validated recipient and only `certificate`/`letter` kinds.
- Validate the exact allowed verification origin and `/v/<token>` path; never
  accept arbitrary destination links, HTML, attachments, or sender overrides.
- Generate the transactional message without copying document contents.
- Persist the canonical request digest, recipient, sending lease, provider key,
  and outcome atomically. Return the original result for identical retries;
  reject the same key with different content. Preserve deduplication for at
  least 24 hours, including uncertain provider responses, across instances.
- Apply the provider's quotas, bounce/suppression rules, per-caller rate limits,
  and audit requirements. Keep recipients, tokens, bodies and credentials out
  of ordinary logs. Encrypt retained recipient/request data and define erasure.
- Return provider acceptance only after an actual provider acceptance response.
  Do not report queued work as accepted by the provider.

Successful response:

```json
{"status":"accepted","providerId":"provider-message-id"}
```

Return an appropriate non-2xx status for rejection, throttling or service failure.
The issuer conservatively treats ambiguous responses as unconfirmed and only
retries the identical request inside its bounded deduplication window.

Once this API is deployed, configure the issuer:

```text
MAIL_PROVIDER=pactmail
PACTMAIL_SEND_URL=https://pactmail-azjqpkmlpa-de.a.run.app/api/integrations/trust-documents/send
PACTMAIL_AUDIENCE=https://pactmail-azjqpkmlpa-de.a.run.app
```

## Option B: use Pactmail's existing Resend provider directly

This is a different integration route and requires the owner's selection. Grant
`issuer-sa` secret-level access to `pactmail-resend-api-key`, mount the approved
version as `MAIL_API_KEY`, and set `MAIL_PROVIDER=resend`. Confirm that `dmj.one`
and `contact@dmj.one` are authorized by the provider. Preserve these settings in
the deployment workflow; its current `--set-env-vars` / `--set-secrets` commands
replace previous settings. The issuer sends from `dmj.one <contact@dmj.one>`.

Do not copy a provider key into source, a chat, an ordinary configuration file,
or a service-account JSON key. No live sending is enabled by this code change.

## OCI alternative under consideration

OCI Email Delivery supports SMTP and HTTPS submission with custom domains and
attachments. It can be used for outbound delivery while keeping Cloudflare's
inbound routing unchanged. Approve `contact@dmj.one`, configure OCI-generated DKIM
records and the appropriate SPF/DMARC authentication, and use a separate bounce
subdomain if a custom return path is wanted. Never add a second SPF policy at the
same DNS name or replace Cloudflare's root MX records.

The OCI region and sending interface must be selected before providing exact
DNS and credential configuration. An OCI adapter is not configured here. Do not
reuse Resend-specific idempotency assumptions for SMTP; an uncertain SMTP outcome
needs reconciliation before another send. No provider guarantees avoiding spam.

References:

- [Google service identity authentication](https://docs.cloud.google.com/run/docs/authenticating/service-to-service)
- [Resend idempotency](https://resend.com/docs/dashboard/emails/idempotency-keys)
- [OCI Email Delivery setup](https://docs.oracle.com/en-us/iaas/Content/Email/Reference/gettingstarted.htm)
- [OCI domain and bounce DNS](https://docs.oracle.com/en-us/iaas/Content/Email/Reference/gettingstarted_topic-create-email-domain.htm)

## DNS observation — 2026-09-12

Read-only DNS lookup found Cloudflare MX records and two separate SPF TXT policies
at `dmj.one`: Firebase and Cloudflare. Consolidate these into ONE SPF TXT record,
retaining both existing authorizations:

```text
v=spf1 include:_spf.firebasemail.com include:_spf.mx.cloudflare.net ~all
```

Add any required OCI authorization only after selecting its region and return-path
configuration, while respecting SPF's lookup limit. Do not change the existing MX
records or catch-all forwarding rule. This change has been proposed, not applied.
See [RFC 7208 section 4.5](https://www.rfc-editor.org/rfc/rfc7208.html#section-4.5).
