#!/usr/bin/env bash
# Run once as a project operator, after deploying the scheduling code.
# No service-account keys are created. Scheduler supplies a Google-signed OIDC token.
set -euo pipefail
project="${GCP_PROJECT_ID:-dmjone}"
region="${GCP_REGION:-asia-east1}"
account="trust-email-scheduler@$project.iam.gserviceaccount.com"
job="trust-email-dispatch"
issuer_url=$(gcloud run services describe issuer --project="$project" --region="$region" --format='value(status.url)')
if ! gcloud iam service-accounts describe "$account" --project="$project" >/dev/null 2>&1; then
  gcloud iam service-accounts create trust-email-scheduler --project="$project" --display-name='Trust document email scheduler'
fi
gcloud run services add-iam-policy-binding issuer --project="$project" --region="$region" \
  --member="serviceAccount:$account" --role=roles/run.invoker --condition=None --quiet >/dev/null
operation=create
if gcloud scheduler jobs describe "$job" --project="$project" --location="$region" >/dev/null 2>&1; then
  operation=update
fi
gcloud scheduler jobs "$operation" http "$job" --project="$project" --location="$region" \
  --schedule='* 9-16 * * 1-5' --time-zone=Asia/Kolkata \
  --uri="$issuer_url/api/internal/email/dispatch" --http-method=POST \
  --oidc-service-account-email="$account" --oidc-token-audience="$issuer_url" \
  --attempt-deadline=120s --max-retry-attempts=0 \
  --description='Drain due document emails on weekdays 09:00–16:59 IST; persistent outbox handles retries.' \
  --quiet --format='yaml(name,schedule,timeZone,state)'
