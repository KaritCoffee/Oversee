$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$resourceDir = Join-Path $repoRoot "src-tauri\resources"
$nodeTarget = Join-Path $resourceDir "node.exe"
$localConfig = Join-Path $repoRoot "config.local.json"
$resourceConfig = Join-Path $resourceDir "config.local.json"

$nodeCommand = Get-Command "node.exe" -ErrorAction SilentlyContinue
if (-not $nodeCommand) {
  throw "node.exe was not found. Install Node.js before building the Windows desktop app."
}

New-Item -ItemType Directory -Force -Path $resourceDir | Out-Null
Copy-Item -LiteralPath $nodeCommand.Source -Destination $nodeTarget -Force

if (Test-Path $localConfig) {
  Copy-Item -LiteralPath $localConfig -Destination $resourceConfig -Force
  Write-Host "Prepared local config at $resourceConfig"
}

Write-Host "Prepared bundled Node runtime at $nodeTarget"
