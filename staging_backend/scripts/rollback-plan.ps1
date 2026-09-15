param(
  [Parameter(Mandatory=$true)][string]$ProjectId,
  [string]$Region = "asia-east1",
  [string]$Service = "macrotech-approval-api"
)

$ErrorActionPreference = "Stop"
if (-not (Get-Command gcloud -ErrorAction SilentlyContinue)) { throw "gcloud not found." }
$activeProject = (gcloud config get-value project 2>$null).Trim()
if ($activeProject -ne $ProjectId) { throw "Safety stop: active project '$activeProject' does not match '$ProjectId'." }

Write-Host "READ-ONLY rollback planner. No traffic will be changed." -ForegroundColor Cyan
Write-Host "Project: $ProjectId  Region: $Region  Service: $Service"
Write-Host "`nCurrent service traffic:" -ForegroundColor Cyan
gcloud run services describe $Service --project $ProjectId --region $Region --format="yaml(status.url,status.traffic,metadata.labels)"

Write-Host "`nRecent revisions (newest first):" -ForegroundColor Cyan
gcloud run revisions list --service $Service --project $ProjectId --region $Region --sort-by="~metadata.creationTimestamp" --limit=10 --format="table(metadata.name,metadata.creationTimestamp,status.conditions[0].status,spec.containers[0].image)"

Write-Host "`nBefore any rollback:" -ForegroundColor Yellow
Write-Host "1. Record the current build ID from the permanent Hosting /api/health endpoint."
Write-Host "2. Identify the previous known-good revision AND matching Hosting release/tag."
Write-Host "3. Confirm Firestore schema compatibility."
Write-Host "4. Follow docs/OPERATIONS_RUNBOOK.md and docs/RECOVERY_DRILLS.md."
Write-Host "5. Do not alter Firestore approval data as part of an application rollback."
Write-Host "`nThis script intentionally does not print or execute a traffic-changing command." -ForegroundColor Green
