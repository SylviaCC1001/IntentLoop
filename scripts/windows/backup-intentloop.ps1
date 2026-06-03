param(
  [string]$DataDir = "D:\intentloop-data",
  [string]$BackupDir = "D:\intentloop-backups"
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path -LiteralPath $DataDir)) {
  throw "Data directory '$DataDir' does not exist."
}

New-Item -ItemType Directory -Force -Path $BackupDir | Out-Null

$DataDir = (Resolve-Path -LiteralPath $DataDir).Path
$BackupDir = (Resolve-Path -LiteralPath $BackupDir).Path
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$zipPath = Join-Path $BackupDir "intentloop-$timestamp.zip"

Compress-Archive -Path (Join-Path $DataDir "*") -DestinationPath $zipPath -Force

Write-Host "Backup created: $zipPath"
