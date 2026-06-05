# Deploying dmj.one Trust Services

Two Cloud Run services in **`asia-east1`**, both scale-to-zero (₹0 idle), fronted
by two `ghs.googlehosted.com` domain mappings. Data in Firestore, keys in Secret
Manager. Everything below is also scripted in [`autoconfig.sh`](./autoconfig.sh).

| Service | Domain (you map) | Holds private key? |
|---|---|---|
| `issuer` (admin, Chromium, signing) | `issue.dmj.one` | yes |
| `verify` (public, keyless) | `verify.dmj.one` | no |

---

## 0. Prerequisites (once)

```bash
gcloud auth login
gcloud config set project dmjone
gcloud services enable run.googleapis.com firestore.googleapis.com \
  secretmanager.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com
```

## 1. Firestore (Native, asia-east1) — $0 idle

```bash
gcloud firestore databases create --location=asia-east1 --type=firestore-native
gcloud firestore indexes composite create --collection-group=credentials \
  --field-config field-path=createdAt,order=descending || true   # see firestore.indexes.json
```
Apply security rules (locks all client access — only the service accounts touch data):
```bash
gcloud firestore databases update --rules=infra/firestore.rules   # or via console
```

## 2. Service accounts (defense-in-depth: verify never sees the private keys)

```bash
gcloud iam service-accounts create issuer-sa --display-name="Trust issuer"
gcloud iam service-accounts create verify-sa --display-name="Trust verify (keyless)"

# Firestore for both
for SA in issuer-sa verify-sa; do
  gcloud projects add-iam-policy-binding dmjone \
    --member="serviceAccount:${SA}@dmjone.iam.gserviceaccount.com" \
    --role="roles/datastore.user"
done

# Secret Manager: issuer can manage all secrets; verify only accesses public-key secrets
gcloud projects add-iam-policy-binding dmjone \
  --member="serviceAccount:issuer-sa@dmjone.iam.gserviceaccount.com" \
  --role="roles/secretmanager.admin"
# verify gets read on individual *public* secrets only (granted after first run creates them):
#   gcloud secrets add-iam-policy-binding MLDSA_PUBLIC_KEY --member=...verify-sa... --role=roles/secretmanager.secretAccessor
```
> On first boot the issuer generates the ML-DSA + PAdES + log keys, encrypts them
> with `MASTER_ENCRYPTION_KEY`, and writes them to Secret Manager. The verify SA is
> then granted accessor on the **public** secrets only.

## 3. Build + deploy both services

```bash
# Build images (Cloud Build, from the repo root)
gcloud builds submit --tag=asia-east1-docker.pkg.dev/dmjone/trust/issuer:latest \
  --config=/dev/stdin <<'EOF'
steps:
  - name: gcr.io/cloud-builders/docker
    args: ['build','-f','infra/Dockerfile.issuer','-t','asia-east1-docker.pkg.dev/dmjone/trust/issuer:latest','.']
images: ['asia-east1-docker.pkg.dev/dmjone/trust/issuer:latest']
EOF
# (verify built the same way with infra/Dockerfile.verify)

# Deploy issuer (admin — public URL but every route is behind WebAuthn)
gcloud run deploy issuer \
  --image=asia-east1-docker.pkg.dev/dmjone/trust/issuer:latest \
  --region=asia-east1 --platform=managed \
  --service-account=issuer-sa@dmjone.iam.gserviceaccount.com \
  --min-instances=0 --max-instances=2 --cpu=1 --memory=1Gi --concurrency=4 \
  --allow-unauthenticated \
  --set-env-vars=SERVICE_ROLE=issuer,GCP_PROJECT_ID=dmjone,GCP_REGION=asia-east1,ISSUER_PUBLIC_URL=https://issue.dmj.one,VERIFY_PUBLIC_URL=https://verify.dmj.one,WEBAUTHN_RP_ID=issue.dmj.one,WEBAUTHN_ORIGIN=https://issue.dmj.one

# Deploy verify (public, keyless, lean)
gcloud run deploy verify \
  --image=asia-east1-docker.pkg.dev/dmjone/trust/verify:latest \
  --region=asia-east1 --platform=managed \
  --service-account=verify-sa@dmjone.iam.gserviceaccount.com \
  --min-instances=0 --max-instances=4 --cpu=1 --memory=512Mi --concurrency=80 \
  --allow-unauthenticated \
  --set-env-vars=SERVICE_ROLE=verify,GCP_PROJECT_ID=dmjone,GCP_REGION=asia-east1,ISSUER_PUBLIC_URL=https://issue.dmj.one,VERIFY_PUBLIC_URL=https://verify.dmj.one
```

## 3.5 Secrets + first-admin bootstrap

Two issuer secrets, each its OWN Secret Manager entry (never reuse one for another):

```bash
printf '%s' "$(openssl rand -base64 32)" | gcloud secrets create master-encryption-key --data-file=-
printf '%s' "$(openssl rand -base64 24)" | gcloud secrets create admin-setup-token   --data-file=-
for S in master-encryption-key admin-setup-token; do
  gcloud secrets add-iam-policy-binding "$S" \
    --member="serviceAccount:issuer-sa@dmjone.iam.gserviceaccount.com" \
    --role="roles/secretmanager.secretAccessor"
done
```
Mount them into the issuer (add to its `gcloud run deploy`):
```
  --set-secrets=MASTER_ENCRYPTION_KEY=master-encryption-key:latest,ADMIN_SETUP_TOKEN=admin-setup-token:latest  # pragma: allowlist secret
```

**Bootstrap your admin (once).** The first passkey registration is gated by
`ADMIN_SETUP_TOKEN` (fail-closed in production — the issuer refuses to bootstrap if
it's unset). After deploy:

1. `gcloud secrets versions access latest --secret=admin-setup-token` → copy it. <!-- pragma: allowlist secret -->
2. Open `https://issue.dmj.one`, register your passkey, supplying that token.
3. The instant your passkey is enrolled the bootstrap window **closes** — adding
   more passkeys then requires your session. A factory reset re-opens it **only**
   with a fresh token. This is what enforces "only you can issue."

## 4. Domain mappings → the CNAMEs you add in Cloudflare

First verify domain ownership once (`gcloud domains verify dmj.one` → follow the TXT step), then:

```bash
gcloud beta run domain-mappings create --service=issuer --domain=issue.dmj.one  --region=asia-east1
gcloud beta run domain-mappings create --service=verify --domain=verify.dmj.one --region=asia-east1
gcloud beta run domain-mappings describe --domain=issue.dmj.one --region=asia-east1 --format="value(status.resourceRecords)"
```

Each mapping returns a record to add. **Add these in Cloudflare DNS:**

| Type | Name | Target | Proxy |
|---|---|---|---|
| CNAME | `issue` | `ghs.googlehosted.com` | **DNS only (grey cloud)** |
| CNAME | `verify` | `ghs.googlehosted.com` | **DNS only (grey cloud)** |

> Keep the proxy **off (grey cloud)** so Google can provision the managed TLS cert
> for the mapping. You can switch Cloudflare proxy on later with an origin cert if
> you want the WAF/CDN in front; not required for v1. Google issues the cert in a
> few minutes; `https://issue.dmj.one` and `https://verify.dmj.one` go live once DNS
> propagates.

## 5. Verify the deploy

```bash
curl -fsS https://verify.dmj.one/health        # shallow
curl -fsS https://verify.dmj.one/health/ready   # deep (Firestore reachable)
```

---

### Cost posture
Both services `min-instances=0` → **₹0 when idle**. Firestore Native free tier
(1 GiB, 50K reads/20K writes per day) covers a credentialing workload comfortably.
Secret Manager free tier covers the handful of keys. No Load Balancer, no always-on
compute. The only standing item is Firestore storage, which is effectively ₹0 at
this scale.
