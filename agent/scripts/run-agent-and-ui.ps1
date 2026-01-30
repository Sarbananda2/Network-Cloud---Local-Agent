Param(
  [string]$AgentDir = (Resolve-Path (Join-Path $PSScriptRoot "..")),
  [string]$UiDir = (Resolve-Path (Join-Path $PSScriptRoot "..\\ui"))
)

Write-Host "Starting agent from: $AgentDir"
Write-Host "Starting UI from: $UiDir"

Start-Process -WorkingDirectory $AgentDir -FilePath "go" -ArgumentList "run . run" -WindowStyle Normal
$wailsCmd = Get-Command "wails" -ErrorAction SilentlyContinue
if (-not $wailsCmd) {
  Write-Error "Wails is not installed or not on PATH. Install it and re-run: go install github.com/wailsapp/wails/v2/cmd/wails@latest"
  return
}
Start-Process -WorkingDirectory $UiDir -FilePath "wails" -ArgumentList "dev" -WindowStyle Normal

