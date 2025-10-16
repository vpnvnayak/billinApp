<#
Import the mkcert root CA into the Windows Trusted Root store.
Run as Administrator.

Usage (Admin PowerShell):
  .\scripts\import-cert.ps1

#>
param()

$ErrorActionPreference = 'Stop'

$certDir = Join-Path $PSScriptRoot '..\certs'
if (-not (Test-Path $certDir)) {
  Write-Error "Certs directory not found. Run scripts/setup-mkcert.ps1 first.";
  exit 1
}
$certDir = Resolve-Path -LiteralPath $certDir
$mkcertRoot = Join-Path $certDir 'rootCA.pem'
if (-not (Test-Path $mkcertRoot)) {
  # mkcert may have stored CA elsewhere; try mkcert -CAROOT
  $caroot = mkcert -CAROOT 2>$null
  if ($caroot) { $mkcertRoot = Join-Path $caroot 'rootCA.pem' }
}

if (-not (Test-Path $mkcertRoot)) {
  Write-Error "rootCA.pem not found. Run scripts/setup-mkcert.ps1 first or install mkcert.";
  exit 1
}

Write-Host "Importing $mkcertRoot into LocalMachine\Root" -ForegroundColor Green
Import-Certificate -FilePath $mkcertRoot -CertStoreLocation Cert:\LocalMachine\Root

Write-Host "Imported to Trusted Root. Close and reopen browsers if needed." -ForegroundColor Green
