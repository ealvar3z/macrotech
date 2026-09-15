param(
  [Parameter(Mandatory=$true)][string]$ProjectId,
  [string]$Region = "asia-east1",
  [Parameter(Mandatory=$true)][string]$PublicAppUrl,
  [Parameter(Mandatory=$true)][string]$QuotationBucket,
  [string]$ApiServiceAccount = "",
  [string]$BootstrapAdminEmail = "",
  [ValidateRange(0,10)][int]$MinInstances = 0,
  [ValidateRange(1,20)][int]$MaxInstances = 10
)

$ErrorActionPreference = "Stop"

if (-not $ApiServiceAccount) {
  $ApiServiceAccount = "macrotech-approval-api@$ProjectId.iam.gserviceaccount.com"
}

function Require-Command([string]$Name) {
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "Required command '$Name' was not found in PATH."
  }
}

Require-Command "node"
Require-Command "npm"
Require-Command "gcloud"
Require-Command "firebase"

Write-Host "Macrotech Approval Platform - controlled deployment" -ForegroundColor Cyan
Write-Host "Project: $ProjectId"
Write-Host "Region: $Region"
Write-Host "API identity: $ApiServiceAccount"
Write-Host "Cloud Run scale: min=$MinInstances max=$MaxInstances"

Write-Host "`nVerifying local source..." -ForegroundColor Cyan
if (-not (Test-Path "web/.env") -and -not $env:VITE_FIREBASE_API_KEY) {
  throw "Frontend Firebase configuration is missing. Create web/.env from web/.env.example before deployment."
}

npm ci
npm run typecheck
npm test
npm run build

Write-Host "`nSelecting Google Cloud project..." -ForegroundColor Cyan
gcloud config set project $ProjectId | Out-Host
$activeProject = (gcloud config get-value project 2>$null).Trim()
if ($activeProject -ne $ProjectId) {
  throw "gcloud project verification failed. Expected '$ProjectId' but found '$activeProject'."
}

$releaseVersion = if (Test-Path "VERSION") { (Get-Content "VERSION" -Raw).Trim() } else { "unknown" }
$buildId = "$releaseVersion-$(Get-Date -Format 'yyyyMMddHHmmss')"
$envVars = "PUBLIC_APP_URL=$PublicAppUrl,QUOTATION_BUCKET=$QuotationBucket,BUILD_ID=$buildId,BOOTSTRAP_ADMIN_EMAIL=$BootstrapAdminEmail"

Write-Host "`nDeploying API to Cloud Run..." -ForegroundColor Cyan
gcloud run deploy macrotech-approval-api `
  --source api `
  --region $Region `
  --allow-unauthenticated `
  --service-account $ApiServiceAccount `
  --min $MinInstances `
  --max $MaxInstances `
  --memory 512Mi `
  --cpu 1 `
  --concurrency 20 `
  --timeout 60 `
  --set-env-vars $envVars `
  --update-labels "app=macrotech-approval,component=api" | Out-Host

$apiUrl = (gcloud run services describe macrotech-approval-api --region $Region --format="value(status.url)").Trim()
if (-not $apiUrl) { throw "Cloud Run did not return an API service URL." }

Write-Host "`nChecking direct API health..." -ForegroundColor Cyan
$health = Invoke-RestMethod -Uri "$apiUrl/api/health" -Method Get -TimeoutSec 30
if (-not $health.ok -or $health.buildId -ne $buildId) {
  throw "API health check did not return the expected build ID."
}

Write-Host "`nDeploying Firebase Hosting and deny-all Firestore client rules..." -ForegroundColor Cyan
firebase use $ProjectId | Out-Host
firebase deploy --only "firestore:rules,hosting" | Out-Host

Write-Host "`nChecking permanent Hosting URL..." -ForegroundColor Cyan
$hostingHealth = Invoke-RestMethod -Uri "$PublicAppUrl/api/health" -Method Get -TimeoutSec 30
if (-not $hostingHealth.ok -or $hostingHealth.buildId -ne $buildId) {
  throw "Hosting-to-Cloud-Run health check did not return the expected build ID."
}

Write-Host "`nWorker deployment intentionally remains separate." -ForegroundColor Yellow
Write-Host "Configure its service account, Gmail secrets, reporting Sheet, and Eventarc trigger first."
Write-Host "See docs/DEPLOYMENT_CHECKLIST.md."

Write-Host "`nDeployment complete. Build ID: $buildId" -ForegroundColor Green
