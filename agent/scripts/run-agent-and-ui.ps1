Param(
  [string]$AgentDir = (Resolve-Path (Join-Path $PSScriptRoot "..")),
  [string]$UiDir = (Resolve-Path (Join-Path $PSScriptRoot "..\\ui"))
)

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\\..")
$debugLog = Join-Path $repoRoot ".cursor\\debug.log"

function Stop-ProcessesByCommandLine {
  param(
    [string]$Label,
    [string]$CommandPattern,
    [string]$PathPattern
  )

  $procs = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object {
    $_.CommandLine -match $CommandPattern -and $_.CommandLine -match $PathPattern
  }

  if (-not $procs) {
    Write-Host "No $Label processes found."
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

if (Test-Path $debugLog) {
  Remove-Item -Force $debugLog
  Write-Host "Deleted debug log: $debugLog"
} else {
  Write-Host "Debug log not found: $debugLog"
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

$agentCmdPattern = "(?i)go(\.exe)?\s+run\s+\.\s+run"
$agentPathPattern = [Regex]::Escape($AgentDir)
Stop-ProcessesByCommandLine -Label "agent" -CommandPattern $agentCmdPattern -PathPattern $agentPathPattern

$uiCmdPattern = "(?i)wails(\.exe)?\s+dev"
$uiPathPattern = [Regex]::Escape($UiDir)
Stop-ProcessesByCommandLine -Label "UI" -CommandPattern $uiCmdPattern -PathPattern $uiPathPattern

Write-Host "Starting agent from: $AgentDir"
Write-Host "Starting UI from: $UiDir"

Start-Process -WorkingDirectory $AgentDir -FilePath "go" -ArgumentList "run . run" -WindowStyle Normal
$wailsCmd = Get-Command "wails" -ErrorAction SilentlyContinue
if (-not $wailsCmd) {
  Write-Error "Wails is not installed or not on PATH. Install it and re-run: go install github.com/wailsapp/wails/v2/cmd/wails@latest"
  return
}
Start-Process -WorkingDirectory $UiDir -FilePath "wails" -ArgumentList "dev" -WindowStyle Normal

