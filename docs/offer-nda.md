# Offer letters, NDA attachments and signed returns

In Letterhead, an offer title (the word “offer”) or the **This is an offer letter**
option enables the offer/NDA packet. The **Offer and NDA** section shows editable
NDA paragraphs and a separate **Preview NDA** button. Saving a review draft freezes
those paragraphs with the offer. Review both PDFs, then choose Schedule send.

At issuance the standard letter pipeline creates an independently signed NDA
first, without sending it separately. The offer's signed body includes that NDA's
identifier and SHA-256 hash. Both documents use the same letterhead styling,
detached ML-DSA signatures, timestamps, transparency log and verification service.
Certificates retain their existing design and verification mechanism. An uploaded
PDF remains an uploaded document; use Letterhead for this automatic offer packet.

The single offer email contains the password-protected offer download link and
an actual NDA PDF attachment. The NDA also has its own verification link. The
password is included in the same email, with records@dmj.one in CC. The transport attaches only stored bytes
matching the NDA hash bound in the offer, at most 400 KiB. Attachment bytes are
supplied to the adapter at send time and are not copied into the frozen encrypted
mail payload. The transactional mail claim also checks that the linked NDA remains valid. Retries check the same bytes; SMTP uncertainty still cannot trigger
a duplicate submission. Missing, revoked, changed or oversized NDAs fail closed.
Legacy scheduled drafts without reviewed NDA terms are paused for review. Older offer records without an NDA must be replaced through the review flow before
emailing. Erasing an offer also erases its associated NDA and PDF artifacts.

Offer and NDA PDFs reserve a footer with applicant signature, date, document ID
and Page N of M on **every page**, plus a final applicant acceptance section. These
fields do not change the certificate renderer. Signing/marking the returned copy
changes its bytes: retain both the issuer's verifiable original and the applicant's
executed copy. The QR verifies the issued original; it does not authenticate the
applicant's handwriting or prove that returned pages were all signed.

The email and PDFs instruct the applicant to:

1. Read the offer, NDA and linked website policies.
2. Sign and date every page of both documents.
3. Email both signed copies to contact@dmj.one.
4. Then enroll at https://timesheet.dmj.one to begin.

Cloudflare inbound forwarding remains in place. Receipt, identity and completeness
of signed returns require the owner's review of the incoming email; this change
does not claim to inspect Gmail attachments or enforce Timesheet enrollment rules.
Keep signed returns, actual start/end dates, weekly reports and evidence of completed
work for factual completion certificates and subsequent background verification.

## Legal review notes

The default NDA protects confidential project material, permits general learning
and future work, and provides a three-year post-engagement confidentiality period
(with longer statutory protection where applicable). It is an editable draft,
not a legal-compliance certification. There is no non-compete or automatic penalty.

The owner requested that https://dmj.one/tos and https://dmj.one/privacy also govern.
Both were read on 13 September 2026 and displayed “Updated in June 2024”. References
appear in the offer, NDA, acceptance panel and email. Review these real policy issues
with an Indian lawyer before relying on the packet:

- The website terms broadly classify submissions as non-confidential and claim
  ownership of suggestions; align those clauses with confidential assigned work.
- They specify American Arbitration Association procedures and a one-year claims
  limitation. Check their application and enforceability for this engagement.
- The privacy policy describes dmj.one as incorporated, while the issuer describes
  an independent educational initiative represented by Divya Mohan.
- Unpaid or nominal-pay proposals remain subject to any legally required remuneration
  and benefits. Refusing a higher offer does not waive applicable employee wage rights. The actual
  work arrangement and applicable jurisdiction determine obligations.

No template, per-page signature or cryptographic verification can guarantee legal
protection in every jurisdiction or compel an employer to accept a certificate.
Certificates should state verified facts about the actual association and completed
work, without unsupported affiliation, employment or qualification claims.

Sources: [dmj.one terms](https://dmj.one/tos), [privacy policy](https://dmj.one/privacy),
[Code on Wages, sections 5 and 60](https://www.indiacode.nic.in/bitstream/123456789/15793/1/A2019-29.pdf),
[Indian Contract Act](https://www.indiacode.nic.in/bitstream/123456789/2187/2/A187209.pdf).

New letter and section 63 PDFs place their paper background across the full A4
page before signing, preserving text margins, links and per-page signatures.
Physical edge-to-edge printing requires a printer supporting borderless A4.
Letter punctuation uses a plain hyphen in place of an em dash; credentials such
as passwords are preserved exactly. Certificate rendering remains unchanged.
