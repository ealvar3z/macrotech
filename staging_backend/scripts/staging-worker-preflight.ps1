param(
  [string]$ProjectId = "macrotech-approval-production",
  [string]$Region = "asia-east1",
  [string]$ExpectedAccount = "macrotech.quotations@gmail.com",
  [string]$WorkerService = "macrotech-approval-worker-test",
  [string]$WorkerServiceAccountName = "macrotech-approval-worker-test",
  [string]$EventarcServiceAccountName = "macrotech-approval-eventarc-test",
  [string]$TriggerName = "macrotech-approval-outbox-test",
  [string]$ApprovalSheetId = "1pJjmnVuS8RGncfzX11iM4ASVx-_i_9UPmb5lWf-y4IM",
  [string]$ApprovalSheetName = "Approval Test"
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function Require-Command([string]$Name) {
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "Required command '$Name' was not found in PATH."
  }
}

function Require-Exact([string]$Actual, [string]$Expected, [string]$Label) {
  if ($Actual.Trim() -ne $Expected) {
    throw "$Label mismatch. Expected '$Expected' but found '$Actual'."
  }
}

Require-Command "gcloud"
Require-Command "node"
Require-Command "npm"

if ($ProjectId -ne "macrotech-approval-production") {
  throw "This staging package is locked to project 'macrotech-approval-production'."
}

$activeAccount = (gcloud auth list --filter=status:ACTIVE --format="value(account)").Trim()
Require-Exact $activeAccount $ExpectedAccount "Active Google account"

$activeProject = (gcloud config get-value project 2>$null).Trim()
Require-Exact $activeProject $ProjectId "Active Google Cloud project"

$projectNumber = (gcloud projects describe $ProjectId --format="value(projectNumber)").Trim()
if (-not $projectNumber) { throw "Could not resolve the Google Cloud project number." }

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

$enabledApis = @(gcloud services list --enabled --project $ProjectId --format="value(config.name)")
$missingApis = @($requiredApis | Where-Object { $_ -notin $enabledApis })

$workerServiceAccount = "$WorkerServiceAccountName@$ProjectId.iam.gserviceaccount.com"
$eventarcServiceAccount = "$EventarcServiceAccountName@$ProjectId.iam.gserviceaccount.com"
$serviceAccounts = @(gcloud iam service-accounts list --project $ProjectId --format="value(email)")

$requiredSecrets = @(
  "macrotech-gmail-client-id",
  "macrotech-gmail-client-secret",
  "macrotech-gmail-refresh-token"
)
$secretNames = @(gcloud secrets list --project $ProjectId --format="value(name)" 2>$null)
$missingSecrets = @($requiredSecrets | Where-Object { $_ -notin $secretNames })
$secretsWithoutEnabledVersion = @()
foreach ($secret in $requiredSecrets) {
  if ($secret -in $secretNames) {
    $enabledVersion = (gcloud secrets versions list $secret --project $ProjectId --filter="state=ENABLED" --limit=1 --format="value(name)" 2>$null).Trim()
    if (-not $enabledVersion) { $secretsWithoutEnabledVersion += $secret }
  }
}

$workerUrl = (gcloud run services describe $WorkerService --project $ProjectId --region $Region --format="value(status.url)" 2>$null).Trim()
$triggerDestination = (gcloud eventarc triggers describe $TriggerName --project $ProjectId --location $Region --format="value(destination.cloudRun.service)" 2>$null).Trim()

Write-Host "Macrotech staging worker preflight" -ForegroundColor Cyan
Write-Host "Project: $ProjectId ($projectNumber)"
Write-Host "Account: $activeAccount"
Write-Host "Region: $Region"
Write-Host "Reporting Sheet: $ApprovalSheetId / $ApprovalSheetName"
Write-Host "Worker service: $(if ($workerUrl) { $workerUrl } else { 'NOT DEPLOYED' })"
Write-Host "Eventarc trigger destination: $(if ($triggerDestination) { $triggerDestination } else { 'NOT CONFIGURED' })"
Write-Host "Worker identity: $(if ($workerServiceAccount -in $serviceAccounts) { 'EXISTS' } else { 'MISSING' }) - $workerServiceAccount"
Write-Host "Eventarc identity: $(if ($eventarcServiceAccount -in $serviceAccounts) { 'EXISTS' } else { 'MISSING' }) - $eventarcServiceAccount"

if ($missingApis.Count -gt 0) {
  Write-Host "Missing APIs: $($missingApis -join ', ')" -ForegroundColor Yellow
}
if ($missingSecrets.Count -gt 0) {
  Write-Host "Missing secret containers: $($missingSecrets -join ', ')" -ForegroundColor Yellow
}
if ($secretsWithoutEnabledVersion.Count -gt 0) {
  Write-Host "Secrets without an enabled version: $($secretsWithoutEnabledVersion -join ', ')" -ForegroundColor Yellow
}

if ($missingApis.Count -eq 0 -and $missingSecrets.Count -eq 0 -and $secretsWithoutEnabledVersion.Count -eq 0) {
  Write-Host "Preflight prerequisites passed." -ForegroundColor Green
} else {
  Write-Host "Preflight found prerequisites that the deployment script must resolve." -ForegroundColor Yellow
}
