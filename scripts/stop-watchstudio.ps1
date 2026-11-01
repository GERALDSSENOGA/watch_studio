# WatchStudio stop script.
# Stops the Next.js app and WebSocket server started by start-watchstudio.ps1
# (development or production). Falls back to stopping whatever listens on
# ports 3000/3001 if no PID record exists (e.g. after starting with npm run dev).
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File scripts\stop-watchstudio.ps1

$ErrorActionPreference = "Continue"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
$logDir = Join-Path $root ".logs"
$pidFile = Join-Path $logDir "pids.json"

function Kill-Tree([int]$processId, [string]$label) {
  if ($processId -le 0) { return }
  $alive = Get-Process -Id $processId -ErrorAction SilentlyContinue
  if (-not $alive) { Write-Host "[watchstudio] $label (pid $processId) already stopped."; return }
  # /T kills the whole tree (npm -> next/node children), /F forces.
  & taskkill /PID $processId /T /F | Out-Null
  Start-Sleep -Milliseconds 400
  if (Get-Process -Id $processId -ErrorAction SilentlyContinue) {
    Write-Host "[watchstudio] $label (pid $processId) could not be stopped." -ForegroundColor Red
  } else {
    Write-Host "[watchstudio] $label (pid $processId) stopped."
  }
}

$stoppedAny = $false

# 1. Stop the recorded process trees.
if (Test-Path $pidFile) {
  try {
    $record = Get-Content $pidFile -Raw | ConvertFrom-Json
    Kill-Tree $record.webPid "web server"
    Kill-Tree $record.wsPid "websocket server"
    $stoppedAny = $true
    Remove-Item $pidFile -Force -ErrorAction SilentlyContinue
  } catch {
    Write-Host "[watchstudio] Could not read $pidFile - falling back to port lookup."
  }
}

# 2. Fallback / verification: free the WatchStudio ports.
foreach ($port in @(3000, 3001)) {
  $listeners = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
  foreach ($conn in $listeners) {
    $owner = $conn.OwningProcess
    if ($owner -and $owner -ne 0) {
      Kill-Tree $owner "listener on port $port"
      $stoppedAny = $true
    }
  }
}

if (-not $stoppedAny) {
  Write-Host "[watchstudio] Nothing was running (ports 3000 and 3001 are free)."
} else {
  Write-Host "[watchstudio] WatchStudio stopped."
}
