param(
  [string]$ServerUrl = "",
  [int]$UiPort = 5173
)

$ErrorActionPreference = "Stop"

$agentRoot = Split-Path -Parent $PSScriptRoot
$agentExe = Join-Path $agentRoot "agent.exe"
$uiRoot = Join-Path $agentRoot "ui"

if ($ServerUrl -ne "") {
  $configDir = Join-Path $env:APPDATA "NetworkCloud"
  $configPath = Join-Path $configDir "agent.yaml"
  if (-not (Test-Path $configDir)) { New-Item -ItemType Directory -Path $configDir | Out-Null }
  @"
server_url: "$ServerUrl"
heartbeat_interval: 30
sync_interval: 300
network_check_interval: 60
log_level: "info"
log_file: ""
auto_start: true
"@ | Set-Content -Path $configPath -Encoding UTF8
  Write-Host "Config written: $configPath"
}

if (-not (Test-Path $agentExe)) {
  throw "agent.exe not found. Run 'go build -o agent.exe' in $agentRoot"
}

Write-Host "Starting agent (foreground background process)..."
$agentProc = Start-Process -FilePath $agentExe -ArgumentList "run" -WorkingDirectory $agentRoot -PassThru

if (!(Get-Command wails -ErrorAction SilentlyContinue)) {
  Write-Host "Wails CLI not found. Installing..."
  go install github.com/wailsapp/wails/v2/cmd/wails@latest
}

Write-Host "Starting Wails UI (dev)..."
Push-Location $uiRoot
wails dev
Pop-Location

if ($agentProc -and !$agentProc.HasExited) {
  Write-Host "Stopping agent..."
  Stop-Process -Id $agentProc.Id -ErrorAction SilentlyContinue
}

