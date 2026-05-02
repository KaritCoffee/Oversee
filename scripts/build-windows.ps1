param(
  [switch]$SkipInstall
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

$cargoBin = Join-Path $env:USERPROFILE ".cargo\bin"
if (Test-Path $cargoBin) {
  $env:Path = "$cargoBin;$env:Path"
}

function Require-Command {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Name,
    [Parameter(Mandatory = $true)]
    [string]$InstallHint
  )

  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "$Name was not found. $InstallHint"
  }
}

Require-Command -Name "node" -InstallHint "Install Node.js 20 or newer, then reopen PowerShell."
Require-Command -Name "npm" -InstallHint "Install Node.js 20 or newer, then reopen PowerShell."
Require-Command -Name "rustc" -InstallHint "Install Rust from https://rustup.rs/, then reopen PowerShell."
Require-Command -Name "cargo" -InstallHint "Install Rust from https://rustup.rs/, then reopen PowerShell."

if (-not $SkipInstall -and -not (Test-Path (Join-Path $repoRoot "node_modules"))) {
  npm install
}

npm run check
npm run desktop:build
