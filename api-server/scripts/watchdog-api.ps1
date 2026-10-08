# Restart the staging/home API if /health fails. No visitor data.
# Env: PGCR_HEALTH_URL (default http://127.0.0.1:3001/health), PGCR_START_CMD, USAGE_OUT_DIR
$health = if ($env:PGCR_HEALTH_URL) { $env:PGCR_HEALTH_URL } else { 'http://127.0.0.1:3001/health' }
$start = $env:PGCR_START_CMD
$out = if ($env:USAGE_OUT_DIR) { $env:USAGE_OUT_DIR } else { 'D:\DestinyChronicleDB\usage' }
New-Item -ItemType Directory -Force -Path $out | Out-Null
$log = Join-Path $out 'HEALTH_LOG.md'
$ok = $false
try {
  $r = Invoke-WebRequest -UseBasicParsing $health -TimeoutSec 15
  if ($r.StatusCode -eq 200 -and $r.Content -match '"status"\s*:\s*"ok"') { $ok = $true }
} catch {}
$stamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
if ($ok) {
  Add-Content $log "- $stamp health ok"
  exit 0
}
Add-Content $log "- $stamp health FAILED; restart requested"
if (-not $start) {
  Add-Content $log "- $stamp no PGCR_START_CMD set; not restarted"
  exit 1
}
# Start script is a local cmd the operator sets. Do not kill :3001 from this copy
# unless PGCR_WATCH_KILL_PORT is set (home PC task only).
if ($env:PGCR_WATCH_KILL_PORT) {
  $port = [int]$env:PGCR_WATCH_KILL_PORT
  Get-NetTCPConnection -LocalPort $port -State Listen -EA SilentlyContinue |
    ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -EA SilentlyContinue }
}
Start-Process -FilePath 'cmd.exe' -ArgumentList '/c', $start -WindowStyle Hidden
Add-Content $log "- $stamp start issued"
