param(
  [string]$ProjectDir = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..\..")).Path,
  [string]$DataDir = "D:\intentloop-data",
  [int]$Port = 3123,
  [string]$CookieSecure = "false",
  [string]$TaskName = "IntentLoop"
)

$ErrorActionPreference = "Stop"

$ProjectDir = (Resolve-Path -LiteralPath $ProjectDir).Path
$startScript = Join-Path $ProjectDir "scripts\windows\start-intentloop.ps1"

if (-not (Test-Path -LiteralPath $startScript)) {
  throw "Start script not found: $startScript"
}

$argument = @(
  "-NoProfile",
  "-ExecutionPolicy Bypass",
  "-File `"$startScript`"",
  "-ProjectDir `"$ProjectDir`"",
  "-DataDir `"$DataDir`"",
  "-Port $Port",
  "-CookieSecure `"$CookieSecure`"",
  "-SkipBuild"
) -join " "

$action = New-ScheduledTaskAction `
  -Execute "powershell.exe" `
  -Argument $argument `
  -WorkingDirectory $ProjectDir

$trigger = New-ScheduledTaskTrigger -AtLogOn
$principal = New-ScheduledTaskPrincipal `
  -UserId ([System.Security.Principal.WindowsIdentity]::GetCurrent().Name) `
  -LogonType Interactive `
  -RunLevel LeastPrivilege

Register-ScheduledTask `
  -TaskName $TaskName `
  -Action $action `
  -Trigger $trigger `
  -Principal $principal `
  -Description "Start IntentLoop when this Windows user logs on." `
  -Force | Out-Null

Write-Host "Registered startup task: $TaskName"
Write-Host "Task action: powershell.exe $argument"
