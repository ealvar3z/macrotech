param(
  [Parameter(Mandatory=$true)][string]$ProjectId,
  [string]$QuotationBucket = "",
  [string]$ApiServiceAccountName = "macrotech-approval-api"
)

$ErrorActionPreference = "Stop"
if (-not $QuotationBucket) { $QuotationBucket = "$ProjectId-quotations" }

$apiServiceAccount = "$ApiServiceAccountName@$ProjectId.iam.gserviceaccount.com"

Write-Host "Configuring least-privilege API identity: $apiServiceAccount" -ForegroundColor Cyan

# Creation is safe to re-run: if the account already exists, continue.
$exists = gcloud iam service-accounts list --project $ProjectId --filter="email=$apiServiceAccount" --format="value(email)"
if (-not $exists) {
  gcloud iam service-accounts create $ApiServiceAccountName --project $ProjectId --display-name="Macrotech Approval API" | Out-Host
}

gcloud projects add-iam-policy-binding $ProjectId `
  --member="serviceAccount:$apiServiceAccount" `
  --role="roles/datastore.user" | Out-Host

# Required because the API intentionally verifies Firebase ID-token revocation.
gcloud projects add-iam-policy-binding $ProjectId `
  --member="serviceAccount:$apiServiceAccount" `
  --role="roles/firebaseauth.viewer" | Out-Host

gcloud storage buckets add-iam-policy-binding "gs://$QuotationBucket" `
  --member="serviceAccount:$apiServiceAccount" `
  --role="roles/storage.objectViewer" | Out-Host

Write-Host "API IAM setup complete." -ForegroundColor Green
