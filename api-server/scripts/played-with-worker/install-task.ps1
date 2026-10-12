# Registers the Played With summary worker as a scheduled task that starts at boot and restarts on failure.
# Run from an elevated PowerShell:  .\install-task.ps1 -EnvFile <path to worker.env>
param([Parameter(Mandatory)][string]$EnvFile, [string]$TaskName = 'DestinyChronicle-PlayedWithWorker')
$runner = Join-Path $PSScriptRoot 'run-worker.cmd'
$action = New-ScheduledTaskAction -Execute 'cmd.exe' -Argument "/c `"$runner`" `"$EnvFile`""
$trigger = New-ScheduledTaskTrigger -AtStartup
$trigger.Delay = 'PT2M'   # give the drives and the API a moment after boot
$settings = New-ScheduledTaskSettingsSet -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) `
  -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
$principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Force | Out-Null
Write-Host "Registered $TaskName (at startup, SYSTEM, restart on failure). Start now: Start-ScheduledTask $TaskName"