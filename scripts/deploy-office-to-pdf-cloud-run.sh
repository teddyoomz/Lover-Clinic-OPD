#!/usr/bin/env bash
# scripts/deploy-office-to-pdf-cloud-run.sh
#
# (2026-05-22 EOD+2) Deploys the officeToPdf service as a Cloud Run container
# (Dockerfile-respecting) + wires the Eventarc Storage onFinalize trigger.
#
# WHY THIS SCRIPT (not `firebase deploy --only functions`):
# Firebase Functions 2nd Gen with `runtime: nodejs20` IGNORES the Dockerfile —
# it uses Cloud Build buildpacks instead. The Gotenberg base image in our
# Dockerfile would never make it into the deployed container via Firebase
# Functions deploy. The canonical workaround is `gcloud run deploy --source`
# which honors the Dockerfile + builds via Cloud Build correctly.
#
# PREREQUISITES (one-time, user runs):
#   gcloud auth login                              # browser OAuth as the Project Owner
#   gcloud config set project loverclinic-opd-4c39b
#   gcloud auth application-default login          # for Eventarc trigger creation
#
# USAGE (after the one-time auth):
#   bash scripts/deploy-office-to-pdf-cloud-run.sh
#
# Idempotent: safe to re-run; re-deploys the Cloud Run service + reuses the
# existing trigger if present.

set -euo pipefail

PROJECT_ID="loverclinic-opd-4c39b"
SERVICE_NAME="office-to-pdf"
REGION="asia-southeast1"
TRIGGER_NAME="office-to-pdf-onfinalize"
SOURCE_DIR="functions/officeToPdf"

echo "═══════════════════════════════════════════════════════════════════"
echo "  Deploying $SERVICE_NAME → $PROJECT_ID / $REGION"
echo "═══════════════════════════════════════════════════════════════════"
echo

# 0. Sanity — gcloud auth + project
if ! gcloud auth list --filter=status:ACTIVE --format="value(account)" | grep -q '@'; then
  echo "✗ gcloud not authenticated. Run:"
  echo "    gcloud auth login"
  echo "    gcloud auth application-default login"
  echo "    gcloud config set project $PROJECT_ID"
  exit 1
fi
gcloud config set project "$PROJECT_ID" >/dev/null

PROJECT_NUMBER=$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')
echo "✓ Project number: $PROJECT_NUMBER"

# 1. Inspect Storage bucket region (Eventarc trigger must be in a compatible
#    region — global, OR same multi-region as the bucket).
BUCKET="$PROJECT_ID.firebasestorage.app"
BUCKET_LOCATION=$(gcloud storage buckets describe "gs://$BUCKET" --format='value(location)' 2>/dev/null | tr 'A-Z' 'a-z' || echo "unknown")
echo "✓ Storage bucket location: $BUCKET_LOCATION"
echo

# 2. Enable required APIs (idempotent)
echo "── Enabling required APIs ─────────────────────────────────────────"
gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  eventarc.googleapis.com \
  storage.googleapis.com \
  --project="$PROJECT_ID"
echo "✓ APIs enabled"
echo

# 3. Grant Eventarc service account permissions
#    The Eventarc SA needs storage.buckets.get on the bucket to verify the
#    trigger source. Per the failed firebase deploy error message.
echo "── Granting Eventarc + Compute SA permissions ─────────────────────"
EVENTARC_SA="service-${PROJECT_NUMBER}@gcp-sa-eventarc.iam.gserviceaccount.com"
COMPUTE_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"

# Eventarc SA: read bucket metadata (storage.buckets.get)
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:$EVENTARC_SA" \
  --role="roles/storage.objectViewer" \
  --condition=None --quiet >/dev/null

# Eventarc SA: receive events (canonical role for the SA)
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:$EVENTARC_SA" \
  --role="roles/eventarc.eventReceiver" \
  --condition=None --quiet >/dev/null

# Compute default SA (runs the Cloud Run service): read Storage + write Firestore
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:$COMPUTE_SA" \
  --role="roles/storage.objectAdmin" \
  --condition=None --quiet >/dev/null
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:$COMPUTE_SA" \
  --role="roles/datastore.user" \
  --condition=None --quiet >/dev/null
# Compute SA: be invokable by Eventarc trigger
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:$COMPUTE_SA" \
  --role="roles/run.invoker" \
  --condition=None --quiet >/dev/null

# Storage service agent: publish Pub/Sub messages (Eventarc plumbing)
STORAGE_SA="service-${PROJECT_NUMBER}@gs-project-accounts.iam.gserviceaccount.com"
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:$STORAGE_SA" \
  --role="roles/pubsub.publisher" \
  --condition=None --quiet >/dev/null

echo "✓ IAM grants applied"
echo

# 4. Cloud Run deploy from source (Dockerfile honored)
echo "── Deploying Cloud Run service (this takes ~10-15 min first time) ─"
gcloud run deploy "$SERVICE_NAME" \
  --source="$SOURCE_DIR" \
  --region="$REGION" \
  --project="$PROJECT_ID" \
  --no-allow-unauthenticated \
  --memory=1Gi \
  --cpu=1 \
  --timeout=540 \
  --concurrency=1 \
  --max-instances=10 \
  --min-instances=0 \
  --quiet
SERVICE_URL=$(gcloud run services describe "$SERVICE_NAME" --region="$REGION" --format='value(status.url)')
echo "✓ Cloud Run service deployed: $SERVICE_URL"
echo

# 5. Eventarc trigger — Storage onFinalize → Cloud Run service
echo "── Wiring Eventarc trigger ────────────────────────────────────────"
if gcloud eventarc triggers describe "$TRIGGER_NAME" --location="$REGION" >/dev/null 2>&1; then
  echo "✓ Trigger $TRIGGER_NAME already exists (idempotent skip)"
else
  gcloud eventarc triggers create "$TRIGGER_NAME" \
    --location="$REGION" \
    --destination-run-service="$SERVICE_NAME" \
    --destination-run-region="$REGION" \
    --event-filters="type=google.cloud.storage.object.v1.finalized" \
    --event-filters="bucket=$BUCKET" \
    --service-account="$COMPUTE_SA" \
    --quiet
  echo "✓ Trigger $TRIGGER_NAME created"
fi
echo

echo "═══════════════════════════════════════════════════════════════════"
echo "  Deploy complete."
echo "  Service: $SERVICE_URL"
echo "  Trigger: $TRIGGER_NAME → onFinalize bucket=$BUCKET"
echo "  Next: upload a .docx to staff chat; spinner should flip to 👁 within ~10-30s."
echo "  L2 verify: node scripts/e2e-staff-chat-office-preview.mjs"
echo "═══════════════════════════════════════════════════════════════════"
