# Starts all backend services + web (each in a new PowerShell window)
$root = Split-Path -Parent $PSScriptRoot
if (-not $root) { $root = Get-Location }

Write-Host "Starting Career Copilot services from $root"

$services = @(
  @{ Name = "auth"; Cmd = "npm run dev:auth" },
  @{ Name = "profile"; Cmd = "npm run dev:profile" },
  @{ Name = "job"; Cmd = "npm run dev:job" },
  @{ Name = "agent"; Cmd = "npm run dev:agent" },
  @{ Name = "notification"; Cmd = "npm run dev:notification" },
  @{ Name = "gateway"; Cmd = "npm run dev:gateway" },
  @{ Name = "web"; Cmd = "npm run dev:web" }
)

foreach ($s in $services) {
  Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd `"$root`"; $($s.Cmd)"
  Start-Sleep -Milliseconds 400
}

Write-Host "Launched. UI: http://localhost:5173  Gateway: http://localhost:4000"
