param(
  [Parameter(Mandatory=$true)]
  [string]$ServerUrl,
  [int]$RunSeconds = 10,
  [switch]$SkipLink,
  [switch]$SkipRun,
  [switch]$SkipScan
)

$ErrorActionPreference = "Stop"

$agentRoot = Split-Path -Parent $PSScriptRoot
$agentExe = Join-Path $agentRoot "agent.exe"

Write-Host "== NetworkCloud Agent Test ==" -ForegroundColor Cyan

$configDir = Join-Path $env:APPDATA "NetworkCloud"
$configPath = Join-Path $configDir "agent.yaml"

if (-not (Test-Path $configDir)) {
  New-Item -ItemType Directory -Path $configDir | Out-Null
}

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

Write-Host "Running go fmt / vet / test / build..."
Push-Location $agentRoot
go fmt ./...
if ($LASTEXITCODE -ne 0) { throw "go fmt failed" }
go vet ./...
if ($LASTEXITCODE -ne 0) { throw "go vet failed" }
go test ./...
if ($LASTEXITCODE -ne 0) { throw "go test failed" }
go build -o agent.exe
if ($LASTEXITCODE -ne 0) { throw "go build failed" }
Pop-Location

if (-not $SkipLink) {
  Write-Host "Starting device link flow..." -ForegroundColor Yellow
  & $agentExe --config $configPath --link
  Write-Host "Complete browser authorization, then press Enter to continue."
  Read-Host | Out-Null
}

Write-Host "Status:"
& $agentExe --config $configPath --status

if (-not $SkipScan) {
  Write-Host "Running adapter scan..."
  & $agentExe --config $configPath scan
}

if (-not $SkipRun) {
  Write-Host "Running agent for $RunSeconds seconds..."
  $p = Start-Process -FilePath $agentExe -ArgumentList "--config", $configPath, "run" -PassThru
  Start-Sleep -Seconds $RunSeconds
  Stop-Process -Id $p.Id -ErrorAction SilentlyContinue
}

Write-Host "Done." -ForegroundColor Green

