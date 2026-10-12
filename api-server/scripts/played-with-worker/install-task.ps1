# Registers the Played With summary worker as a scheduled task that restarts on failure.
#   Elevated PowerShell:      .\install-task.ps1 -EnvFile <worker.env>            -> at startup, as SYSTEM (no logon needed)
#   Non-elevated (fallback):  .\install-task.ps1 -EnvFile <worker.env> -AtLogon   -> at logon of the current user
param([Parameter(Mandatory)][string]$EnvFile, [string]$TaskName = 'DestinyChronicle-PlayedWithWorker', [switch]$AtLogon)
$runner = Join-Path $PSScriptRoot 'run-worker.cmd'
$action = New-ScheduledTaskAction -Execute 'cmd.exe' -Argument "/c `"`"$runner`" `"$EnvFile`"`""   # outer quotes: cmd /c strips one pair
$settings = New-ScheduledTaskSettingsSet -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) `
  -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -Hidden
if ($AtLogon) {
  $user = "$env:USERDOMAIN\$env:USERNAME"
  $trigger = New-ScheduledTaskTrigger -AtLogOn -User $user
  $principal = New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Limited
} else {
  $trigger = New-ScheduledTaskTrigger -AtStartup
  $principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
}
$trigger.Delay = 'PT2M'   # give the drives and the API a moment
Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Force | Out-Null
Write-Host "Registered $TaskName ($(if ($AtLogon) {'at logon'} else {'at startup, SYSTEM'}), restart on failure). Start now: Start-ScheduledTask $TaskName"