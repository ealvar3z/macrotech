param(
  [switch]$Apply,
  [string]$ProjectId = "macrotech-approval-production",
  [string]$Region = "asia-east1",
  [string]$ExpectedAccount = "macrotech.quotations@gmail.com",
  [string]$PublicAppUrl = "https://macrotech-approval-production--approval-test-u6o9b4i4.web.app",
  [string]$ApprovalSheetId = "1pJjmnVuS8RGncfzX11iM4ASVx-_i_9UPmb5lWf-y4IM",
  [string]$ApprovalSheetName = "Approval Test"
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$workerService = "macrotech-approval-worker-test"
$workerServiceAccountName = "macrotech-approval-worker-test"
$eventarcServiceAccountName = "macrotech-approval-eventarc-test"
$triggerName = "macrotech-approval-outbox-test"
$workerServiceAccount = "$workerServiceAccountName@$ProjectId.iam.gserviceaccount.com"
$eventarcServiceAccount = "$eventarcServiceAccountName@$ProjectId.iam.gserviceaccount.com"
$secretNames = @(
  "macrotech-gmail-client-id",
  "macrotech-gmail-client-secret",
  "macrotech-gmail-refresh-token"
)
$requiredApis = @(
  "run.googleapis.com",
  "cloudbuild.googleapis.com",
  "artifactregistry.googleapis.com",
  "firestore.googleapis.com",
  "eventarc.googleapis.com",
  "pubsub.googleapis.com",
  "secretmanager.googleapis.com",
  "gmail.googleapis.com",
  "sheets.googleapis.com"
)

function Require-Command([string]$Name) {
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "Required command '$Name' was not found in PATH."
  }
}

function Add-ProjectRole([string]$Member, [string]$Role) {
  gcloud projects add-iam-policy-binding $ProjectId `
    --member=$Member `
    --role=$Role `
    --condition=None `
    --quiet | Out-Host
}

Require-Command "gcloud"
Require-Command "node"
Require-Command "npm"

if ($ProjectId -ne "macrotech-approval-production") {
  throw "This staging package is locked to project 'macrotech-approval-production'."
}
if ($Region -ne "asia-east1") {
  throw "The existing Firestore database is in asia-east1; this worker package refuses a different region."
}

$activeAccount = (gcloud auth list --filter=status:ACTIVE --format="value(account)").Trim()
if ($activeAccount -ne $ExpectedAccount) {
  throw "Wrong Google account. Expected '$ExpectedAccount' but found '$activeAccount'."
}
$activeProject = (gcloud config get-value project 2>$null).Trim()
if ($activeProject -ne $ProjectId) {
  throw "Wrong Google Cloud project. Expected '$ProjectId' but found '$activeProject'."
}

Write-Host "Macrotech staging notification worker" -ForegroundColor Cyan
Write-Host "Account: $activeAccount"
Write-Host "Project: $ProjectId"
Write-Host "Region: $Region"
Write-Host "Worker: $workerService"
Write-Host "Reporting target: $ApprovalSheetId / $ApprovalSheetName"
Write-Host "Public approval URL: $PublicAppUrl"

if (-not $Apply) {
  Write-Host "PLAN ONLY. No cloud resources were changed." -ForegroundColor Yellow
  Write-Host "Re-run with -Apply after reviewing these exact targets."
  exit 0
}

Write-Host "Enabling only the required staging APIs..." -ForegroundColor Cyan
gcloud services enable $requiredApis --project $ProjectId --quiet | Out-Host

$serviceAccounts = @(gcloud iam service-accounts list --project $ProjectId --format="value(email)")
if ($workerServiceAccount -notin $serviceAccounts) {
  gcloud iam service-accounts create $workerServiceAccountName `
    --project $ProjectId `
    --display-name="Macrotech Approval Worker (Staging)" | Out-Host
}
if ($eventarcServiceAccount -notin $serviceAccounts) {
  gcloud iam service-accounts create $eventarcServiceAccountName `
    --project $ProjectId `
    --display-name="Macrotech Approval Eventarc (Staging)" | Out-Host
}

Add-ProjectRole "serviceAccount:$workerServiceAccount" "roles/datastore.user"
Add-ProjectRole "serviceAccount:$eventarcServiceAccount" "roles/eventarc.eventReceiver"

foreach ($secret in $secretNames) {
  $exists = (gcloud secrets list --project $ProjectId --filter="name=$secret" --format="value(name)").Trim()
  if (-not $exists) {
    throw "Secret '$secret' does not exist. Run configure-gmail-oauth.mjs first."
  }
  $enabledVersion = (gcloud secrets versions list $secret --project $ProjectId --filter="state=ENABLED" --limit=1 --format="value(name)").Trim()
  if (-not $enabledVersion) {
    throw "Secret '$secret' has no enabled version. Run configure-gmail-oauth.mjs first."
  }
  gcloud secrets add-iam-policy-binding $secret `
    --project $ProjectId `
    --member="serviceAccount:$workerServiceAccount" `
    --role="roles/secretmanager.secretAccessor" `
    --condition=None `
    --quiet | Out-Host
}

Write-Host "Verifying source before deployment..." -ForegroundColor Cyan
npm ci
npm run typecheck
npm test
npm run build

$releaseVersion = if (Test-Path "VERSION") { (Get-Content "VERSION" -Raw).Trim() } else { "unknown" }
$buildId = "$releaseVersion-worker-$(Get-Date -Format 'yyyyMMddHHmmss')"

Write-Host "Deploying private Cloud Run worker..." -ForegroundColor Cyan
gcloud run deploy $workerService `
  --project $ProjectId `
  --source worker `
  --region $Region `
  --no-allow-unauthenticated `
  --ingress internal `
  --service-account $workerServiceAccount `
  --min 0 `
  --max 3 `
  --memory 512Mi `
  --cpu 1 `
  --concurrency 10 `
  --timeout 60 `
  --set-env-vars "PUBLIC_APP_URL=$PublicAppUrl,SYSTEM_EMAIL=$ExpectedAccount,APPROVAL_SHEET_ID=$ApprovalSheetId,APPROVAL_SHEET_NAME=$ApprovalSheetName,BUILD_ID=$buildId" `
  --set-secrets "GMAIL_CLIENT_ID=macrotech-gmail-client-id:latest,GMAIL_CLIENT_SECRET=macrotech-gmail-client-secret:latest,GMAIL_REFRESH_TOKEN=macrotech-gmail-refresh-token:latest" `
  --update-labels "app=macrotech-approval,component=worker,environment=staging" `
  --quiet | Out-Host

gcloud run services add-iam-policy-binding $workerService `
  --project $ProjectId `
  --region $Region `
  --member="serviceAccount:$eventarcServiceAccount" `
  --role="roles/run.invoker" `
  --condition=None `
  --quiet | Out-Host

$existingDestination = (gcloud eventarc triggers describe $triggerName --project $ProjectId --location $Region --format="value(destination.cloudRun.service)" 2>$null).Trim()
if ($existingDestination) {
  if ($existingDestination -ne $workerService) {
    throw "Existing trigger '$triggerName' targets '$existingDestination', not '$workerService'. Review it manually; this script will not replace it."
  }
  Write-Host "Existing Eventarc trigger targets the expected worker; it was not replaced." -ForegroundColor Green
} else {
  Write-Host "Creating Firestore outbox Eventarc trigger..." -ForegroundColor Cyan
  gcloud eventarc triggers create $triggerName `
    --project $ProjectId `
    --location $Region `
    --destination-run-service $workerService `
    --destination-run-region $Region `
    --event-filters "type=google.cloud.firestore.document.v1.created" `
    --event-filters "database=(default)" `
    --event-filters "namespace=(default)" `
    --event-filters-path-pattern "document=outbox/{eventId}" `
    --service-account $eventarcServiceAccount `
    --quiet | Out-Host
}

$deployedUrl = (gcloud run services describe $workerService --project $ProjectId --region $Region --format="value(status.url)").Trim()
$deployedBuildId = (gcloud run services describe $workerService --project $ProjectId --region $Region --format="value(spec.template.spec.containers[0].env[?name='BUILD_ID'].value)").Trim()
$triggerDestination = (gcloud eventarc triggers describe $triggerName --project $ProjectId --location $Region --format="value(destination.cloudRun.service)").Trim()

if (-not $deployedUrl) { throw "Cloud Run did not return a worker URL." }
if ($deployedBuildId -ne $buildId) { throw "Worker build ID verification failed." }
if ($triggerDestination -ne $workerService) { throw "Eventarc destination verification failed." }

Write-Host "Worker and Eventarc configuration completed." -ForegroundColor Green
Write-Host "Build ID: $buildId"
Write-Host "Create a new internal approval test. Existing outbox documents will not emit a new document-created event."
