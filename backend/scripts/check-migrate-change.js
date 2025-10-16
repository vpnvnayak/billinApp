// scripts/check-migrate-change.js
// Fail if backend/scripts/migrate.js changed in the PR and does not contain MIGRATE_SAFE marker.
const { execSync } = require('child_process')
const fs = require('fs')

function main() {
  try {
    // Ensure we have origin/main fetched in CI
    try { execSync('git fetch origin main', { stdio: 'ignore' }) } catch (e) {}
    const diff = execSync('git diff --name-only origin/main...HEAD', { encoding: 'utf8' })
    const changed = diff.split(/\r?\n/).map(s => s.trim()).filter(Boolean)
    const target = 'backend/scripts/migrate.js'
    if (!changed.includes(target)) {
      console.log('migrate.js not changed in PR; OK')
      process.exit(0)
    }
    const content = fs.readFileSync(target, 'utf8')
    if (content.includes('MIGRATE_SAFE')) {
      console.log('migrate.js changed but contains MIGRATE_SAFE marker; OK')
      process.exit(0)
    }
    console.error('ERROR: migrate.js changed in this PR but does not contain MIGRATE_SAFE marker.\nPlease add a line containing `MIGRATE_SAFE` to the file or coordinate with reviewers to approve migration runner changes.')
    process.exit(1)
  } catch (e) {
    console.error('check-migrate-change failed', e && e.message)
    process.exit(1)
  }
}

if (require.main === module) main()
module.exports = { main }
