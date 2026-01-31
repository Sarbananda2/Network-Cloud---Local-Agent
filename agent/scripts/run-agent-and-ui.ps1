param(
  [string]$AgentDir = (Resolve-Path (Join-Path $PSScriptRoot "..")),
  [string]$UiDir = (Resolve-Path (Join-Path $PSScriptRoot "..\\ui"))
)

$ErrorActionPreference = "Stop"

function Stop-ProcessesByPathPattern {
  param(
    [string]$Label,
    [string]$PathPattern
  )

  $procs = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object {
    $_.CommandLine -match $PathPattern
  }

  if (-not $procs) {
    return
  }

  foreach ($proc in $procs) {
    Write-Host "Stopping $Label process PID $($proc.ProcessId)..."
    try {
      Stop-Process -Id $proc.ProcessId -Force -ErrorAction Stop
    } catch {
      Write-Warning "Failed to stop $Label process PID $($proc.ProcessId): $($_.Exception.Message)"
    }
  }
}

if (-not (Test-Path $AgentDir)) {
  throw "Agent directory not found: $AgentDir"
}

if (-not (Test-Path $UiDir)) {
  throw "UI directory not found: $UiDir"
}

$serviceName = "NetworkCloudAgent"
$service = Get-Service -Name $serviceName -ErrorAction SilentlyContinue
if ($service -and $service.Status -eq "Running") {
  Write-Host "Stopping service: $serviceName"
  Stop-Service -Name $serviceName -Force -ErrorAction SilentlyContinue
  $service.WaitForStatus("Stopped", "00:00:15") | Out-Null
} elseif ($service) {
  Write-Host "Service already stopped: $serviceName"
} else {
  Write-Host "Service not found: $serviceName"
}

Write-Host "Preparing agent config with console logging..."
$configSource = Join-Path $AgentDir "agent.yaml"
if (-not (Test-Path $configSource)) {
  $configSource = Join-Path $AgentDir "config.example.yaml"
}

$serverUrl = "https://network-cloud.replit.app"
$serverLine = Get-Content $configSource -ErrorAction SilentlyContinue | Where-Object { $_ -match '^\s*server_url\s*:' } | Select-Object -First 1
if ($serverLine) {
  $serverUrl = ($serverLine -split ":", 2)[1].Trim()
}

$tempConfigDir = Join-Path $env:TEMP "NetworkCloud"
if (-not (Test-Path $tempConfigDir)) {
  New-Item -ItemType Directory -Path $tempConfigDir | Out-Null
}
$tempConfigPath = Join-Path $tempConfigDir "agent.local.yaml"
@"
server_url: $serverUrl
heartbeat_interval: 30
sync_interval: 300
network_check_interval: 60
log_level: "debug"
log_file: ""
auto_start: true
"@ | Set-Content -Path $tempConfigPath -Encoding UTF8

Write-Host "Starting agent (go run . run) from: $AgentDir"
Write-Host "Using config: $tempConfigPath"
$agentCmd = "cd /d `"$AgentDir`" && go run . run --config `"$tempConfigPath`" --verbose"
$agentProc = Start-Process -FilePath "cmd.exe" -ArgumentList "/k $agentCmd" -PassThru

if (-not (Get-Command wails -ErrorAction SilentlyContinue)) {
  Write-Host "Wails CLI not found. Installing..."
  go install github.com/wailsapp/wails/v2/cmd/wails@latest
}

Write-Host "Building Wails UI (clean) from: $UiDir"
$uiBinDir = Join-Path $UiDir "build\\bin"
$uiPathPattern = [Regex]::Escape($UiDir)
Stop-ProcessesByPathPattern -Label "UI" -PathPattern $uiPathPattern

Push-Location $UiDir
try {
  wails build --clean
  if ($LASTEXITCODE -ne 0) {
    throw "Wails build failed with exit code $LASTEXITCODE"
  }
} finally {
  Pop-Location
}

$uiExe = Get-ChildItem -Path $uiBinDir -Filter *.exe -ErrorAction SilentlyContinue |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 1

if (-not $uiExe) {
  throw "UI executable not found in $uiBinDir. Build may have failed."
}

Write-Host "Starting Wails UI: $($uiExe.FullName)"
Start-Process -FilePath $uiExe.FullName -WorkingDirectory $uiBinDir | Out-Null

Write-Host "Agent and UI launched. This script will now exit."

