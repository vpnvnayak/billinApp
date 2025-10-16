<#
run-migrations.ps1
Usage: Run this from the `backend` folder in PowerShell. It will:
  - ensure a backup is created
  - prompt for confirmation
  - run `node ./scripts/migrate.js`

This is a helper for interactive usage. Always review the migration files and the output before proceeding in production.
#>

param(
  [switch]$Force
)

# Ensure backups dir exists
$backupDir = Join-Path -Path (Get-Location) -ChildPath 'backups'
if (!(Test-Path $backupDir)) { New-Item -ItemType Directory -Path $backupDir | Out-Null }

$ts = Get-Date -Format yyyyMMddHHmmss
$dumpFile = Join-Path $backupDir "pre_migrations_$ts.dump"

if (-not $env:DATABASE_URL) {
  Write-Error "DATABASE_URL environment variable not set. Aborting."
  exit 1
}

Write-Host "Creating DB backup to $dumpFile ..."
$pgDump = "pg_dump `"$env:DATABASE_URL`" -Fc -f `"$dumpFile`""
# Execute pg_dump; allow user to abort
if (-not $Force) {
  Read-Host "About to run pg_dump. Press Enter to continue or Ctrl+C to abort"
}

Invoke-Expression $pgDump
if ($LASTEXITCODE -ne 0) {
  Write-Error "pg_dump failed with exit code $LASTEXITCODE. Aborting."
  exit $LASTEXITCODE
}

Write-Host "Backup complete. Reviewing migrations for destructive SQL..."
node ./scripts/check-migrations.js
if ($LASTEXITCODE -ne 0) {
  Write-Warning "Destructive SQL detected in migrations. Please review the flagged files before proceeding."
  if (-not $Force) {
    $resp = Read-Host "Proceed anyway? (yes/no)"
    if ($resp -ne 'yes') { Write-Host "Aborting as requested"; exit 1 }
  }
}

Write-Host "Running migrations..."
node ./scripts/migrate.js
if ($LASTEXITCODE -ne 0) {
  Write-Error "Migration runner failed with exit code $LASTEXITCODE"
  exit $LASTEXITCODE
}

Write-Host "Migrations complete."
