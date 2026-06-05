#!/usr/bin/env bash
# =============================================================================
# autoconfig.sh — idempotent, zero-intervention deploy of dmj.one Trust Services
# to Google Cloud Run (asia-east1, scale-to-zero). Safe to re-run.
#
#   PROJECT=dmjone ./infra/autoconfig.sh
#
# Re-running reconciles: enables APIs, ensures Firestore + service accounts +
# IAM, rebuilds images, redeploys both services, ensures domain mappings, and
# prints the exact CNAMEs to add in Cloudflare.
# =============================================================================
set -euo pipefail

PROJECT="${PROJECT:-dmjone}"
REGION="${REGION:-asia-east1}"
REPO="${REPO:-trust}"
ISSUER_DOMAIN="${ISSUER_DOMAIN:-issue.dmj.one}"
VERIFY_DOMAIN="${VERIFY_DOMAIN:-verify.dmj.one}"
AR="${REGION}-docker.pkg.dev/${PROJECT}/${REPO}"
log() { printf '\n\033[1;33m▶ %s\033[0m\n' "$*"; }

gcloud config set project "$PROJECT" >/dev/null

log "Enabling APIs"
gcloud services enable run.googleapis.com firestore.googleapis.com \
  secretmanager.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com

log "Artifact Registry"
gcloud artifacts repositories create "$REPO" --repository-format=docker \
  --location="$REGION" 2>/dev/null || true

log "Firestore (Native, $REGION)"
gcloud firestore databases create --location="$REGION" --type=firestore-native 2>/dev/null || true

log "Service accounts + IAM"
for SA in issuer-sa verify-sa; do
  gcloud iam service-accounts create "$SA" 2>/dev/null || true
  gcloud projects add-iam-policy-binding "$PROJECT" --condition=None \
    --member="serviceAccount:${SA}@${PROJECT}.iam.gserviceaccount.com" \
    --role="roles/datastore.user" >/dev/null
done
gcloud projects add-iam-policy-binding "$PROJECT" --condition=None \
  --member="serviceAccount:issuer-sa@${PROJECT}.iam.gserviceaccount.com" \
  --role="roles/secretmanager.admin" >/dev/null

log "Build images (Cloud Build)"
gcloud builds submit --region="$REGION" \
  --substitutions=_IMG="${AR}/issuer:latest",_DF="infra/Dockerfile.issuer" \
  --config=infra/cloudbuild.yaml .
gcloud builds submit --region="$REGION" \
  --substitutions=_IMG="${AR}/verify:latest",_DF="infra/Dockerfile.verify" \
  --config=infra/cloudbuild.yaml .

COMMON_ENV="GCP_PROJECT_ID=${PROJECT},GCP_REGION=${REGION},ISSUER_PUBLIC_URL=https://${ISSUER_DOMAIN},VERIFY_PUBLIC_URL=https://${VERIFY_DOMAIN}"

log "Deploy issuer"
gcloud run deploy issuer --image="${AR}/issuer:latest" --region="$REGION" \
  --service-account="issuer-sa@${PROJECT}.iam.gserviceaccount.com" \
  --min-instances=0 --max-instances=2 --cpu=1 --memory=1Gi --concurrency=4 \
  --allow-unauthenticated \
  --set-env-vars="SERVICE_ROLE=issuer,${COMMON_ENV},WEBAUTHN_RP_ID=${ISSUER_DOMAIN},WEBAUTHN_ORIGIN=https://${ISSUER_DOMAIN}"

log "Deploy verify"
gcloud run deploy verify --image="${AR}/verify:latest" --region="$REGION" \
  --service-account="verify-sa@${PROJECT}.iam.gserviceaccount.com" \
  --min-instances=0 --max-instances=4 --cpu=1 --memory=512Mi --concurrency=80 \
  --allow-unauthenticated \
  --set-env-vars="SERVICE_ROLE=verify,${COMMON_ENV}"

log "Domain mappings"
gcloud beta run domain-mappings create --service=issuer --domain="$ISSUER_DOMAIN" --region="$REGION" 2>/dev/null || true
gcloud beta run domain-mappings create --service=verify --domain="$VERIFY_DOMAIN" --region="$REGION" 2>/dev/null || true

log "DONE. Add these CNAMEs in Cloudflare (DNS only / grey cloud):"
printf '  CNAME  %-8s  ->  ghs.googlehosted.com\n' "${ISSUER_DOMAIN%%.*}"
printf '  CNAME  %-8s  ->  ghs.googlehosted.com\n' "${VERIFY_DOMAIN%%.*}"
