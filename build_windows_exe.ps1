$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$BuilderRoot = Join-Path $ProjectRoot ".windows-builder"
$UvExe = Join-Path $BuilderRoot "uv.exe"
$VenvRoot = Join-Path $BuilderRoot "venv"
$PythonExe = Join-Path $VenvRoot "Scripts\python.exe"
$OutputRoot = Join-Path $ProjectRoot "READY_TO_TEST"
$DashboardRoot = Join-Path $ProjectRoot "dashboard"
$DashboardIndex = Join-Path $DashboardRoot "dist\index.html"
$NodeVersion = "22.12.0"
$NodeFolder = "node-v$NodeVersion-win-x64"
$NodeRoot = Join-Path $BuilderRoot $NodeFolder
$NodeExe = Join-Path $NodeRoot "node.exe"
$NpmCmd = Join-Path $NodeRoot "npm.cmd"
$ShortBuildRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("MTQ-Build-0101-" + [guid]::NewGuid().ToString('N').Substring(0,8))
$ShortSourceRoot = Join-Path $ShortBuildRoot "src"
$ShortDistRoot = Join-Path $ShortBuildRoot "dist"
$ShortWorkRoot = Join-Path $ShortBuildRoot "work"
$ShortSpecRoot = Join-Path $ShortBuildRoot "spec"

Write-Host "Macrotech Quotation Pilot Demo v0.10.1 online alpha - isolated Windows build" -ForegroundColor Cyan
Write-Host "This process does not deploy or connect to Google Sheets."

$RequiredPaths = @(
    "VERSION",
    "START_HERE.md",
    "README - WINDOWS DEMO.txt",
    "build-requirements.txt",
    "requirements.txt",
    "web_app.pyw",
    "assets\macrotech_quotation.ico",
    "assets\macrotech_logo.png",
    "assets\macrotech_full_logo.jpg",
    "dashboard\package.json",
    "dashboard\package-lock.json",
    "dashboard\tsconfig.json",
    "dashboard\src\App.tsx",
    "macrotech_demo\__init__.py",
    "tests\test_demo.py"
)
$MissingPaths = @($RequiredPaths | Where-Object { -not (Test-Path (Join-Path $ProjectRoot $_) -PathType Leaf) })
if ($MissingPaths.Count -gt 0) {
    Write-Host "PACKAGE INCOMPLETE. These required files are missing:" -ForegroundColor Red
    $MissingPaths | ForEach-Object { Write-Host " - $_" -ForegroundColor Red }
    throw "This package cannot be built safely. Re-extract the complete official ZIP."
}
$ReleaseVersion = (Get-Content (Join-Path $ProjectRoot "VERSION") -Raw).Trim()
if ($ReleaseVersion -ne "0.10.1-online-alpha.1") { throw "Release identity mismatch. Expected 0.10.1-online-alpha.1 but found '$ReleaseVersion'." }
Write-Host "Package integrity preflight passed for $ReleaseVersion." -ForegroundColor Green

New-Item -ItemType Directory -Force -Path $BuilderRoot | Out-Null
if (-not (Test-Path $UvExe)) {
    Write-Host "Downloading the Python environment builder..."
    Invoke-WebRequest -Uri "https://github.com/astral-sh/uv/releases/latest/download/uv-x86_64-pc-windows-msvc.zip" -OutFile (Join-Path $BuilderRoot "uv.zip")
    Expand-Archive -Path (Join-Path $BuilderRoot "uv.zip") -DestinationPath $BuilderRoot -Force
}

if (-not (Test-Path $PythonExe)) {
    & $UvExe venv --python 3.12 $VenvRoot
    if ($LASTEXITCODE -ne 0) { throw "Could not create the private Python environment." }
}
& $UvExe pip install --python $PythonExe -r (Join-Path $ProjectRoot "build-requirements.txt")
if ($LASTEXITCODE -ne 0) { throw "Could not install the version-bounded application build dependencies." }

$PreviousBuildPath = $env:PATH
Push-Location $ProjectRoot
try {
    Write-Host "Building the React + TypeScript dashboard from this version's source..." -ForegroundColor Cyan
    if (-not (Test-Path $NodeExe)) {
        $NodeZip = Join-Path $BuilderRoot "node.zip"
        Write-Host "Downloading the private Node.js dashboard builder..."
        Invoke-WebRequest -Uri "https://nodejs.org/dist/v$NodeVersion/$NodeFolder.zip" -OutFile $NodeZip
        Expand-Archive -Path $NodeZip -DestinationPath $BuilderRoot -Force
    }
    if (-not (Test-Path $NpmCmd)) { throw "Could not prepare the private Node.js dashboard builder." }
    $env:PATH = "$NodeRoot;$PreviousBuildPath"
    Push-Location $DashboardRoot
    try {
        & $NpmCmd ci --no-audit --no-fund
        if ($LASTEXITCODE -ne 0) { throw "Could not install the pinned dashboard build dependencies." }
        & $NpmCmd run build
        if ($LASTEXITCODE -ne 0) { throw "The React + TypeScript dashboard build failed." }
    }
    finally { Pop-Location }
    if (-not (Test-Path $DashboardIndex)) { throw "The dashboard build did not create dist\index.html." }
    if ((Get-Item $DashboardIndex).Length -lt 200) { throw "The dashboard build is incomplete." }
    # Tests use disposable local data, never the user's pilot drafts or tokens.
    $PreviousAppData = $env:LOCALAPPDATA
    $TestDataRoot = Join-Path $BuilderRoot ("test-data-" + [guid]::NewGuid().ToString("N"))
    New-Item -ItemType Directory -Force -Path $TestDataRoot | Out-Null
    try {
        $env:LOCALAPPDATA = $TestDataRoot
        & $PythonExe -B evidence/run_offline.py .
        if ($LASTEXITCODE -ne 0) { throw "The application tests failed. No Windows application was packaged." }
        & $PythonExe web_app.pyw --self-test
        if ($LASTEXITCODE -ne 0) { throw "The unpackaged application self-test failed." }
    }
    finally {
        $env:LOCALAPPDATA = $PreviousAppData
        Remove-Item -Recurse -Force $TestDataRoot -ErrorAction SilentlyContinue
    }
    # Build from a short path. Deep Downloads paths can make the Windows resource
    # API fail with EndUpdateResourceW error 122 while PyInstaller embeds the icon.
    # Keep any prior READY_TO_TEST build until the replacement passes self-test.
    if (Test-Path $ShortBuildRoot) { Remove-Item -Recurse -Force $ShortBuildRoot }
    New-Item -ItemType Directory -Force -Path $ShortSourceRoot, $ShortDistRoot, $ShortWorkRoot, $ShortSpecRoot | Out-Null
    Copy-Item (Join-Path $ProjectRoot "web_app.pyw") $ShortSourceRoot
    Copy-Item (Join-Path $ProjectRoot "assets") $ShortSourceRoot -Recurse
    Copy-Item (Join-Path $ProjectRoot "data") $ShortSourceRoot -Recurse
    Copy-Item (Join-Path $ProjectRoot "templates") $ShortSourceRoot -Recurse
    Copy-Item (Join-Path $ProjectRoot "macrotech_demo") $ShortSourceRoot -Recurse
    New-Item -ItemType Directory -Force -Path (Join-Path $ShortSourceRoot "ui") | Out-Null
    Copy-Item (Join-Path $DashboardRoot "dist\*") (Join-Path $ShortSourceRoot "ui") -Recurse

    $Separator = ";"
    $PyInstallerArgs = @(
        "--noconfirm", "--clean", "--onedir", "--windowed", "--noupx",
        "--name", "Macrotech Quotation Pilot Demo",
        "--icon", (Join-Path $ShortSourceRoot "assets\macrotech_quotation.ico"),
        "--paths", $ShortSourceRoot,
        "--add-data", ((Join-Path $ShortSourceRoot "assets") + $Separator + "assets"),
        "--add-data", ((Join-Path $ShortSourceRoot "data") + $Separator + "data"),
        "--add-data", ((Join-Path $ShortSourceRoot "templates") + $Separator + "templates"),
        "--add-data", ((Join-Path $ShortSourceRoot "ui") + $Separator + "ui"),
        "--collect-all", "googleapiclient",
        "--collect-all", "reportlab",
        "--collect-all", "webview",
        "--hidden-import", "google_auth_oauthlib.flow",
        "--hidden-import", "webview.platforms.edgechromium",
        "--hidden-import", "webview.platforms.winforms"
    )
    $Packaged = $false
    $SuccessfulDist = ""
    $TemporaryExe = ""
    for ($Attempt = 1; $Attempt -le 3; $Attempt++) {
        Write-Host "Packaging Windows application (attempt $Attempt of 3)..." -ForegroundColor Cyan
        $AttemptDist = Join-Path $ShortDistRoot "try$Attempt"
        $AttemptWork = Join-Path $ShortWorkRoot "try$Attempt"
        $AttemptSpec = Join-Path $ShortSpecRoot "try$Attempt"
        New-Item -ItemType Directory -Force -Path $AttemptDist, $AttemptWork, $AttemptSpec | Out-Null
        $AttemptArgs = $PyInstallerArgs + @("--distpath", $AttemptDist, "--workpath", $AttemptWork, "--specpath", $AttemptSpec, (Join-Path $ShortSourceRoot "web_app.pyw"))
        & $PythonExe -m PyInstaller @AttemptArgs
        $TemporaryExe = Join-Path $AttemptDist "Macrotech Quotation Pilot Demo\Macrotech Quotation Pilot Demo.exe"
        if (($LASTEXITCODE -eq 0) -and (Test-Path $TemporaryExe)) {
            $Packaged = $true
            $SuccessfulDist = $AttemptDist
            break
        }
        if ($Attempt -lt 3) {
            Write-Host "Windows resource packaging was interrupted. Retrying from a clean short path..." -ForegroundColor Yellow
            Start-Sleep -Seconds (2 * $Attempt)
        }
    }
    if (-not $Packaged) {
        throw "PyInstaller could not finish after 3 clean short-path attempts. Save the full error and inspect Windows Security Protection History. Do not disable protection or add exclusions."
    }
    New-Item -ItemType Directory -Force -Path $TestDataRoot | Out-Null
    try {
        $env:LOCALAPPDATA = $TestDataRoot
        $SelfTest = Start-Process -FilePath $TemporaryExe -ArgumentList "--self-test" -Wait -PassThru
    }
    finally {
        $env:LOCALAPPDATA = $PreviousAppData
        Remove-Item -Recurse -Force $TestDataRoot -ErrorAction SilentlyContinue
    }
    if ($SelfTest.ExitCode -ne 0) { throw "The packaged executable failed its offline self-test." }
    if (Test-Path $OutputRoot) { Remove-Item -Recurse -Force $OutputRoot }
    New-Item -ItemType Directory -Force -Path $OutputRoot | Out-Null
    Copy-Item (Join-Path $SuccessfulDist "*") $OutputRoot -Recurse
    $BuiltExe = Join-Path $OutputRoot "Macrotech Quotation Pilot Demo\Macrotech Quotation Pilot Demo.exe"
    $Hash = (Get-FileHash -Algorithm SHA256 $BuiltExe).Hash
    "SHA256  $Hash  Macrotech Quotation Pilot Demo\Macrotech Quotation Pilot Demo.exe" | Set-Content -Encoding ASCII (Join-Path $OutputRoot "SHA256.txt")
    Copy-Item (Join-Path $ProjectRoot "README - WINDOWS DEMO.txt") $OutputRoot
    Write-Host "Verified executable: $BuiltExe" -ForegroundColor Green
    Write-Host "SHA256: $Hash"
}
finally {
    $env:PATH = $PreviousBuildPath
    Pop-Location
    if (Test-Path $ShortBuildRoot) {
        Remove-Item -Recurse -Force $ShortBuildRoot -ErrorAction SilentlyContinue
    }
}
