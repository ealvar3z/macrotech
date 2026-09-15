param(
  [Parameter(Mandatory=$true)][string]$ProjectId,
  [string]$Region = "asia-east1",
  [string]$QuotationBucket = "",
  [string]$OutputDirectory = "continuity-evidence"
)

$ErrorActionPreference = "Stop"
if (-not $QuotationBucket) { $QuotationBucket = "$ProjectId-quotations" }

foreach ($cmd in @("gcloud")) {
  if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) { throw "Required command '$cmd' not found." }
}

$activeProject = (gcloud config get-value project 2>$null).Trim()
if ($activeProject -ne $ProjectId) {
  throw "Safety stop: active gcloud project '$activeProject' does not match expected '$ProjectId'."
}

$stamp = (Get-Date).ToUniversalTime().ToString("yyyyMMddTHHmmssZ")
$dir = Join-Path $OutputDirectory "$ProjectId-$stamp"
New-Item -ItemType Directory -Path $dir -Force | Out-Null

function Capture([string]$Name, [scriptblock]$Action) {
  $path = Join-Path $dir $Name
  try {
    & $Action | Out-File -FilePath $path -Encoding UTF8
  } catch {
    "ERROR: $($_.Exception.Message)" | Out-File -FilePath $path -Encoding UTF8
  }
}

Capture "00-context.txt" {
  "Generated UTC: $((Get-Date).ToUniversalTime().ToString('o'))"
  "Expected project: $ProjectId"
  "Active project: $activeProject"
  "Active account(s):"
  gcloud auth list --filter=status:ACTIVE --format="value(account)"
  "Local VERSION:"
  if (Test-Path "VERSION") { Get-Content VERSION }
}

Capture "10-enabled-services.txt" { gcloud services list --enabled --project $ProjectId --format="table(config.name)" }
Capture "20-cloud-run-api.yaml" { gcloud run services describe macrotech-approval-api --region $Region --project $ProjectId --format=export }
Capture "21-cloud-run-revisions.txt" { gcloud run revisions list --service macrotech-approval-api --region $Region --project $ProjectId --format="table(metadata.name,status.conditions[0].status,metadata.creationTimestamp,spec.containers[0].image,status.logUrl)" }
Capture "30-api-service-account.txt" { gcloud iam service-accounts describe "macrotech-approval-api@$ProjectId.iam.gserviceaccount.com" --project $ProjectId --format=yaml }
Capture "31-api-project-iam.txt" { gcloud projects get-iam-policy $ProjectId --flatten="bindings[].members" --filter="bindings.members:serviceAccount:macrotech-approval-api@$ProjectId.iam.gserviceaccount.com" --format="table(bindings.role,bindings.members)" }
Capture "40-bucket-describe.txt" { gcloud storage buckets describe "gs://$QuotationBucket" --format=yaml }
Capture "41-bucket-iam.txt" { gcloud storage buckets get-iam-policy "gs://$QuotationBucket" --format=yaml }
Capture "50-firestore-database.txt" { gcloud firestore databases describe --database="(default)" --project $ProjectId --format=yaml }
Capture "60-secret-names.txt" { gcloud secrets list --project $ProjectId --format="table(name,replication.automatic,createTime)" }
Capture "70-eventarc-triggers.txt" { gcloud eventarc triggers list --location $Region --project $ProjectId --format="table(name,destination.cloudRun.service,eventFilters,type,serviceAccount)" }

Write-Host "Continuity snapshot written to $dir" -ForegroundColor Green
Write-Host "Review before sharing: this script is designed to avoid secret payloads, but cloud metadata can still be operationally sensitive." -ForegroundColor Yellow
