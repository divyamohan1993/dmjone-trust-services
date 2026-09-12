# Administrator access and recovery

Use https://issue.dmj.one/admin for passkeys. A passkey belongs to its relying-party
ID; the Cloud Run service URL and verify.dmj.one are not interchangeable sign-in
origins. If the prompt cannot find the key, use **Try another key or device** and
the browser profile/device where it was registered. This retry changes browser
transport hints only; credential allowlists and signature verification remain.

Keep two working passkeys on separate devices. Test the backup in a separate
browser session before signing out of the working session. Save recovery codes
in a password manager or securely offline; **Generate recovery codes** replaces
the entire previous set, and **Download recovery codes** saves the new set.
A recovery code always requires the currently enrolled TOTP authenticator.
After recovery, use **Account security → Add another passkey**.

Authenticator replacement is staged for ten minutes. The existing authenticator
continues working until a code from the replacement is confirmed. Recovery
failures cause exponential cooldowns; at MAX_AUTH_FAILURES the cooldown is at
least one hour after the last failure. Legacy permanent locks expire under this
same rule. A working passkey can still sign in during a recovery cooldown.

## Lost all recovery codes and access to passkeys

A Google Cloud administrator with permission to read/update the named Firestore
database can replace recovery codes using the authenticated operator procedure.
This requires cloud IAM authentication; TOTP alone does not grant this power.
No account deletion, factory reset, TOTP reset, or signing-key rotation is needed.

Run from this repository after `pnpm install --frozen-lockfile` and `pnpm -r build`:

```sh
gcloud auth login
install -d -m 700 /private/path
node services/issuer/scripts/restore-recovery.mjs dmjone trust /private/path/recovery-codes.txt
```

Use a private directory outside the repository. The command creates the output
exclusively with mode 0600 and never prints secrets. It replaces only recovery
hashes and recovery-lock fields, and appends a tamper-evident audit event in the
same atomic Firestore commit. Update-time preconditions prevent stale writes.
If a concurrent update causes a conflict, inspect the audit event before retrying
with a new output filename. A network failure after commit is ambiguous; the
private file is retained so newly installed codes cannot be lost.

Transfer the file securely to the owner, use one code with the existing
six-digit authenticator at the issuer, and enroll/test backup passkeys. Remove
the temporary operator copy once the owner has stored it securely. Never paste
cloud access tokens, TOTP secrets, or recovery codes into logs or tickets.

## Cryptographic scope

New recovery codes contain 260 uniformly random bits and are stored as Argon2id
hashes. Previously generated codes remain compatible until replaced. Atomic
account updates prevent concurrent recovery-code reuse and stale account writes.
Responses from the issuer have `Cache-Control: no-store`.

Document signing already uses ML-DSA-87, standardized in
[NIST FIPS 204](https://csrc.nist.gov/pubs/fips/204/final). This does not make every
part of the service post-quantum: WebAuthn authenticators, TLS negotiation,
cloud IAM, and client devices have separate capabilities and trust assumptions.
No claim of universal or “maximum” quantum security is made. Existing passkey
algorithms remain compatible; a post-quantum authenticator migration needs
verified browser/hardware support and a separate rollout.
