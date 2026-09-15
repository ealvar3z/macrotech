param(
  [Parameter(Mandatory=$true)][string]$ProjectId,
  [Parameter(Mandatory=$true)][string]$QuotationBucket,
  [string]$ApiServiceAccount = ""
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

$nodeMajor = [int]((node --version).TrimStart('v').Split('.')[0])
if ($nodeMajor -lt 24) { throw "Node 24 or newer is required." }

$activeProject = (gcloud config get-value project 2>$null).Trim()
if ($activeProject -ne $ProjectId) {
  throw "Wrong gcloud project. Expected '$ProjectId' but active project is '$activeProject'."
}

$activeAccount = (gcloud auth list --filter=status:ACTIVE --format="value(account)").Trim()
if (-not $activeAccount) { throw "No active gcloud account was found." }

$sa = (gcloud iam service-accounts describe $ApiServiceAccount --project $ProjectId --format="value(email)" 2>$null).Trim()
if ($sa -ne $ApiServiceAccount) { throw "API service account '$ApiServiceAccount' was not found." }

$projectPolicy = gcloud projects get-iam-policy $ProjectId --flatten="bindings[].members" --filter="bindings.members:serviceAccount:$ApiServiceAccount" --format="value(bindings.role)"
$roles = @($projectPolicy)
foreach ($requiredRole in @("roles/datastore.user", "roles/firebaseauth.viewer")) {
  if ($roles -notcontains $requiredRole) {
    throw "Missing API IAM role: $requiredRole"
  }
}

$bucketPolicy = gcloud storage buckets get-iam-policy "gs://$QuotationBucket" --format=json | ConvertFrom-Json
$viewerBinding = @($bucketPolicy.bindings | Where-Object { $_.role -eq "roles/storage.objectViewer" })
$member = "serviceAccount:$ApiServiceAccount"
if (-not ($viewerBinding.members -contains $member)) {
  throw "Missing bucket-level roles/storage.objectViewer for $ApiServiceAccount"
}

Write-Host "Preflight passed." -ForegroundColor Green
Write-Host "Project: $ProjectId"
Write-Host "Active account: $activeAccount"
Write-Host "API service account: $ApiServiceAccount"
Write-Host "Bucket: $QuotationBucket"
Write-Host "Node: $((node --version).Trim())"
Write-Host "npm: $((npm --version).Trim())"
