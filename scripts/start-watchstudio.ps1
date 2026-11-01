# WatchStudio launcher (development by default, -Production for production mode)
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File scripts\start-watchstudio.ps1
#   powershell -ExecutionPolicy Bypass -File scripts\start-watchstudio.ps1 -Production
#   powershell -ExecutionPolicy Bypass -File scripts\start-watchstudio.ps1 -Production -Rebuild
#
# Checks prerequisites, starts the Next.js app and the WebSocket server,
# waits until both respond, and prints the URL. Stops stale WatchStudio
# servers from previous runs automatically; refuses to touch foreign
# processes. Logs are written to .logs\. Stop with scripts\stop-watchstudio.ps1.

param(
  [switch]$Production,
  [switch]$Rebuild
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
$logDir = Join-Path $root ".logs"

function Say($msg) { Write-Host "[watchstudio] $msg" }
function Fail($msg) { Write-Host "[watchstudio] ERROR: $msg" -ForegroundColor Red; exit 1 }

if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir | Out-Null }

# 1. Node.js
try {
  $nodeVersion = (& node -v 2>$null)
  if (-not $nodeVersion) { throw "node not found" }
  $major = [int]($nodeVersion -replace "^v", "").Split(".")[0]
  if ($major -lt 20) { Fail "Node.js $nodeVersion found, but version 20+ is required." }
  Say "Node.js $nodeVersion"
} catch {
  Fail "Node.js was not found on PATH. Install Node.js 20+ from https://nodejs.org and reopen the terminal."
}

# 2. Dependencies
if (-not (Test-Path (Join-Path $root "node_modules"))) {
  Say "node_modules missing - running npm install (one time)..."
  $installOut = cmd /c "npm install 2>&1"
  if ($LASTEXITCODE -ne 0) {
    Write-Host ($installOut | Out-String)
    Fail "npm install failed."
  }
} else {
  Say "Dependencies present (node_modules)."
}

# 3. PostgreSQL service
$pgService = $null
foreach ($name in @("postgresql-x64-18", "postgresql-x64-17")) {
  $svc = Get-Service -Name $name -ErrorAction SilentlyContinue
  if ($svc) { $pgService = $svc; break }
}
if (-not $pgService) {
  Fail "No PostgreSQL Windows service found (expected postgresql-x64-18 or -17). Install PostgreSQL and create the watchstudio database, then retry."
}
if ($pgService.Status -ne "Running") {
  Write-Host ""
  Write-Host "[watchstudio] ERROR: PostgreSQL service '$($pgService.Name)' is $($pgService.Status), not Running." -ForegroundColor Red
  Write-Host "[watchstudio] Start it as Administrator with:  net start $($pgService.Name)" -ForegroundColor Yellow
  exit 1
}
Say "PostgreSQL service '$($pgService.Name)' is running."

# 4. Database reachable with the application's authenticated connection
Say "Checking database connection (npx prisma migrate status)..."
$prismaOut = cmd /c "npx prisma migrate status 2>&1"
$prismaExit = $LASTEXITCODE
if ($prismaExit -ne 0) {
  Write-Host ($prismaOut | Out-String)
  Fail "Database check failed. Is PostgreSQL running and does .env DATABASE_URL contain the correct password?"
}
$upToDate = ($prismaOut | Out-String) -match "Database schema is up to date"
if ($upToDate) { Say "Database reachable; schema up to date." }
else { Say "Database reachable. NOTE: migrations are pending - run 'npx prisma migrate dev' once." }

# 5. Port checks.
#    - If the web port is listening AND responds as WatchStudio, the app is
#      already running: report and exit (never start duplicates).
#    - A listener on 3000/3001 that is a `node` process but does NOT respond
#      as WatchStudio is a stale server from a previous run (nothing else uses
#      these ports): stop it automatically and continue.
#    - Any other process on these ports is foreign: fail with guidance.
$wantWebPort = 3000
$wantWsPort = 3001

function Get-Listener([int]$port) {
  return Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
}

function Test-WatchStudioWeb {
  try { (Invoke-WebRequest -Uri "http://localhost:$wantWebPort/register" -UseBasicParsing -TimeoutSec 5).StatusCode -eq 200 } catch { $false }
}

$conn = Get-Listener $wantWebPort
if ($conn -and (Test-WatchStudioWeb)) {
  $mode = if ($Production) { "PRODUCTION" } else { "DEVELOPMENT" }
  Say "WatchStudio is already running ($mode). Open http://localhost:$wantWebPort - nothing started."
  exit 0
}

foreach ($port in @($wantWebPort, $wantWsPort)) {
  $conn = Get-Listener $port
  if (-not $conn) { continue }
  $ownerPid = $conn.OwningProcess
  $proc = Get-CimInstance Win32_Process -Filter "ProcessId = $ownerPid" -ErrorAction SilentlyContinue
  if ($proc -and $proc.Name -eq "node.exe") {
    Say "Port $port has a stale WatchStudio server (node pid $ownerPid) - stopping it..."
    & taskkill /PID $ownerPid /T /F | Out-Null
    Start-Sleep -Milliseconds 800
    if (Get-Listener $port) {
      Fail "Port $port is still in use after stopping the stale node process (pid $ownerPid)."
    }
    Say "Stale server on port $port stopped."
  } else {
    Fail "Port $port is in use by process $ownerPid ($($proc.Name)) which is not WatchStudio. Free the port and retry."
  }
}
Say "Ports $wantWebPort and $wantWsPort are free."

# 6. Production build (production mode only)
if ($Production) {
  $buildId = Join-Path $root ".next\BUILD_ID"
  if ($Rebuild -or -not (Test-Path $buildId)) {
    Say "Building production bundle (npm run build)..."
    $buildOut = cmd /c "npm run build 2>&1"
    if ($LASTEXITCODE -ne 0) {
      Write-Host ($buildOut | Out-String)
      Fail "Production build failed."
    }
  } else {
    Say "Existing production build found (use -Rebuild to force a rebuild)."
  }
}

# 7. Start the two services
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$webLog = Join-Path $logDir ("{0}-web.log" -f $stamp)
$wsLog = Join-Path $logDir ("{0}-ws.log" -f $stamp)

if ($Production) {
  Say "Starting WebSocket server (node server/ws.mts)..."
  $ws = Start-Process -FilePath "node" -ArgumentList "server/ws.mts" -WorkingDirectory $root -WindowStyle Hidden -PassThru -RedirectStandardOutput $wsLog -RedirectStandardError (Join-Path $logDir ("{0}-ws.err.log" -f $stamp))
  Say "Starting Next.js production server (npm start)..."
  $web = Start-Process -FilePath "npm.cmd" -ArgumentList "start" -WorkingDirectory $root -WindowStyle Hidden -PassThru -RedirectStandardOutput $webLog -RedirectStandardError (Join-Path $logDir ("{0}-web.err.log" -f $stamp))
} else {
  Say "Starting WebSocket server (npm run dev:ws)..."
  $ws = Start-Process -FilePath "npm.cmd" -ArgumentList "run", "dev:ws" -WorkingDirectory $root -WindowStyle Hidden -PassThru -RedirectStandardOutput $wsLog -RedirectStandardError (Join-Path $logDir ("{0}-ws.err.log" -f $stamp))
  Say "Starting Next.js dev server (npm run dev)..."
  $web = Start-Process -FilePath "npm.cmd" -ArgumentList "run", "dev" -WorkingDirectory $root -WindowStyle Hidden -PassThru -RedirectStandardOutput $webLog -RedirectStandardError (Join-Path $logDir ("{0}-web.err.log" -f $stamp))
}

# Record PIDs so stop-watchstudio.ps1 can stop exactly these process trees.
@{ webPid = $web.Id; wsPid = $ws.Id; started = (Get-Date -Format o); production = [bool]$Production } |
  ConvertTo-Json | Set-Content (Join-Path $logDir "pids.json")
Say "Started web (pid $($web.Id)) and websocket (pid $($ws.Id)). Logs: .logs\"

# 8. Wait for health
$deadline = (Get-Date).AddSeconds(90)
$webUp = $false
$wsUp = $false
while ((Get-Date) -lt $deadline -and (-not ($webUp -and $wsUp))) {
  Start-Sleep -Milliseconds 700
  if (-not $webUp) {
    $code = try { (Invoke-WebRequest -Uri "http://localhost:$wantWebPort/register" -UseBasicParsing -TimeoutSec 3).StatusCode } catch { $null }
    if ($code -eq 200) { $webUp = $true }
  }
  if (-not $wsUp) {
    $tcp = Test-NetConnection -ComputerName localhost -Port $wantWsPort -WarningAction SilentlyContinue -InformationLevel Quiet
    if ($tcp) { $wsUp = $true }
  }
  if ($web.Id -and (Get-Process -Id $web.Id -ErrorAction SilentlyContinue) -eq $null) {
    Fail "The web process exited during startup. Check the newest .logs\*-web.log / -web.err.log"
  }
}
if (-not $webUp) { Fail "The web server did not become healthy within 90s. Check the newest .logs\*-web.log" }
if (-not $wsUp) { Fail "The WebSocket server did not open port $wantWsPort within 90s. Check the newest .logs\*-ws.log" }

Write-Host ""
Write-Host "=============================================================" -ForegroundColor Green
if ($Production) {
  Write-Host " WatchStudio is running in PRODUCTION mode" -ForegroundColor Green
} else {
  Write-Host " WatchStudio is running in DEVELOPMENT mode" -ForegroundColor Green
}
Write-Host " Open:  http://localhost:$wantWebPort" -ForegroundColor Green
Write-Host " Stop:  powershell -ExecutionPolicy Bypass -File scripts\stop-watchstudio.ps1"
Write-Host " Logs:  .logs\$stamp-*.log"
Write-Host "=============================================================" -ForegroundColor Green
exit 0
