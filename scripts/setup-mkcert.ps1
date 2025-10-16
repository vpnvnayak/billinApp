<#
Generates a local CA and certificates for localhost using mkcert.
Requires: mkcert available on PATH. If not installed, install via choco or scoop.

This script will create certs in the repo folder ./certs:
- certs/localhost.pem
- certs/localhost-key.pem

Usage (PowerShell):
  .\scripts\setup-mkcert.ps1

#>
param()

$ErrorActionPreference = 'Stop'

$certDir = Join-Path $PSScriptRoot '..\certs'
if (-not (Test-Path $certDir)) {
  New-Item -ItemType Directory -Path $certDir | Out-Null
}
$certDir = Resolve-Path -LiteralPath $certDir

function Ensure-Mkcert {
  if (Get-Command mkcert -ErrorAction SilentlyContinue) { return $true }
  Write-Host "mkcert not found on PATH." -ForegroundColor Yellow
  Write-Host "You can install mkcert via Chocolatey: choco install mkcert -y" -ForegroundColor Cyan
  Write-Host "Or via scoop: scoop install mkcert" -ForegroundColor Cyan
  return $false
}

if (-not (Ensure-Mkcert)) { exit 1 }

Push-Location $certDir
try {
  Write-Host "Installing local CA (mkcert -install)" -ForegroundColor Green
  mkcert -install

  $certPath = Join-Path $certDir 'localhost.pem'
  $keyPath = Join-Path $certDir 'localhost-key.pem'
  Write-Host "Generating cert for localhost -> $certPath, $keyPath" -ForegroundColor Green
  mkcert -cert-file $certPath -key-file $keyPath localhost 127.0.0.1 ::1
  Write-Host "Created cert and key in $certDir" -ForegroundColor Green
} finally { Pop-Location }

Write-Host "Done. You can now set SSL_CERT_PATH and SSL_KEY_PATH in backend/.env to point to these files." -ForegroundColor Green
Write-Host "To trust the cert in Windows (if mkcert didn't already), run scripts\import-cert.ps1 as Administrator." -ForegroundColor Green
