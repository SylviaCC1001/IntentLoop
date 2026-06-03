param(
  [string]$ProjectDir = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..\..")).Path,
  [string]$DataDir = "D:\intentloop-data",
  [int]$Port = 3123,
  [string]$InviteCode = $env:INVITE_CODE,
  [string]$CookieSecure = $(if ($env:COOKIE_SECURE) { $env:COOKIE_SECURE } else { "false" }),
  [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"

function Require-Command {
  param([string]$Name)

  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "Required command '$Name' was not found. Install it first and reopen PowerShell."
  }
}

Require-Command "node"
Require-Command "npm"

$ProjectDir = (Resolve-Path -LiteralPath $ProjectDir).Path
New-Item -ItemType Directory -Force -Path $DataDir | Out-Null
$DataDir = (Resolve-Path -LiteralPath $DataDir).Path

$env:NODE_ENV = "production"
$env:DATA_DIR = $DataDir
$env:DATABASE_URL = Join-Path $DataDir "prd.db"
$env:COOKIE_SECURE = $CookieSecure

if (-not $env:MAX_UPLOAD_SIZE_MB) {
  $env:MAX_UPLOAD_SIZE_MB = "100"
}

if ($InviteCode) {
  $env:INVITE_CODE = $InviteCode
} else {
  Write-Warning "INVITE_CODE is empty. Set it before exposing this service to other devices."
}

Set-Location -LiteralPath $ProjectDir

if (-not (Test-Path -LiteralPath (Join-Path $ProjectDir "node_modules"))) {
  npm ci
}

npm run db:migrate

if ((-not $SkipBuild) -or (-not (Test-Path -LiteralPath (Join-Path $ProjectDir ".next")))) {
  npm run build
}

Write-Host "Starting IntentLoop on 0.0.0.0:$Port"
Write-Host "DATA_DIR=$env:DATA_DIR"
Write-Host "DATABASE_URL=$env:DATABASE_URL"
Write-Host "COOKIE_SECURE=$env:COOKIE_SECURE"

npm run start -- -H 0.0.0.0 -p $Port
