param(
  [string]$OutputDirectory = "release-evidence"
)

$ErrorActionPreference = "Stop"
$repo = (Resolve-Path ".").Path
$version = if (Test-Path "VERSION") { (Get-Content "VERSION" -Raw).Trim() } else { "unknown" }
$timestamp = (Get-Date).ToUniversalTime().ToString("yyyyMMddTHHmmssZ")
New-Item -ItemType Directory -Path $OutputDirectory -Force | Out-Null

function Hash-OrNull([string]$Path) {
  if (Test-Path $Path) { return (Get-FileHash -Algorithm SHA256 $Path).Hash.ToLowerInvariant() }
  return $null
}

$gitCommit = $null
$gitTag = $null
$gitDirty = $null
if (Get-Command git -ErrorAction SilentlyContinue) {
  try {
    $inside = (git rev-parse --is-inside-work-tree 2>$null).Trim()
    if ($inside -eq "true") {
      $gitCommit = (git rev-parse HEAD).Trim()
      $gitTag = (git describe --tags --exact-match 2>$null)
      $status = git status --porcelain
      $gitDirty = [bool]$status
    }
  } catch { }
}

$manifest = [ordered]@{
  schemaVersion = 1
  application = "Macrotech Approval Platform"
  version = $version
  generatedAtUtc = (Get-Date).ToUniversalTime().ToString("o")
  repositoryPath = $repo
  git = [ordered]@{
    commit = $gitCommit
    tag = if ($gitTag) { "$gitTag".Trim() } else { $null }
    dirty = $gitDirty
  }
  tools = [ordered]@{
    node = if (Get-Command node -ErrorAction SilentlyContinue) { (node --version).Trim() } else { $null }
    npm = if (Get-Command npm -ErrorAction SilentlyContinue) { (npm --version).Trim() } else { $null }
    gcloud = if (Get-Command gcloud -ErrorAction SilentlyContinue) { ((gcloud version --format="value(Google Cloud SDK)" 2>$null) -join " ").Trim() } else { $null }
    firebase = if (Get-Command firebase -ErrorAction SilentlyContinue) { (firebase --version).Trim() } else { $null }
  }
  hashes = [ordered]@{
    packageLockSha256 = Hash-OrNull "package-lock.json"
    firebaseJsonSha256 = Hash-OrNull "firebase.json"
    firestoreRulesSha256 = Hash-OrNull "firestore.rules"
    firestoreIndexesSha256 = Hash-OrNull "firestore.indexes.json"
    apiDockerfileSha256 = Hash-OrNull "api/Dockerfile"
    workerDockerfileSha256 = Hash-OrNull "worker/Dockerfile"
  }
}

$path = Join-Path $OutputDirectory "release-manifest-$version-$timestamp.json"
$manifest | ConvertTo-Json -Depth 8 | Set-Content -Path $path -Encoding UTF8
Write-Host "Release manifest written to $path" -ForegroundColor Green
Write-Host "This file contains hashes/config evidence, not secret values."
