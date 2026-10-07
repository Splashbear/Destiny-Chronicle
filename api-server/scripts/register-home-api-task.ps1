# Register Task Scheduler job: start API at logon/boot, restart on failure.
# Run elevated. Paths are taken from the start-api-home.cmd beside this script.
# Hardware-agnostic: does not embed drive letters beyond the repo location.

param(
  [string]$TaskName = "DestinyChroniclePgcrApi",
  [string]$RepoApiServer = ""
)

$ErrorActionPreference = "Stop"
if (-not $RepoApiServer) {
  $RepoApiServer = Split-Path -Parent $PSScriptRoot
  if ((Split-Path -Leaf $RepoApiServer) -ne "api-server") {
    $RepoApiServer = $PSScriptRoot + "\.."
  }
  $RepoApiServer = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
}

$starter = Join-Path $PSScriptRoot "start-api-home.cmd"
if (-not (Test-Path $starter)) { throw "Missing $starter" }
if (-not (Test-Path (Join-Path $PSScriptRoot "home-pc.env"))) {
  Write-Warning "home-pc.env not found — copy home-pc.env.example before first run."
}

$action = New-ScheduledTaskAction -Execute "cmd.exe" -Argument "/c `"$starter`"" -WorkingDirectory $RepoApiServer
$triggerBoot = New-ScheduledTaskTrigger -AtStartup
$triggerLogon = New-ScheduledTaskTrigger -AtLogOn
$settings = New-ScheduledTaskSettingsSet -RestartCount 5 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Highest

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger @($triggerBoot, $triggerLogon) -Settings $settings -Principal $principal -Force | Out-Null
Write-Host "Registered task '$TaskName' -> $starter"
Write-Host "Ensure home-pc.env is configured. Start now: Start-ScheduledTask -TaskName '$TaskName'"
