// scripts/check-migrations.js
// Scan migrations for potentially destructive SQL and report them.
const fs = require('fs')
const path = require('path')

const MIGRATIONS_DIR = path.join(__dirname, '..', 'migrations')
const destructivePatterns = [
  /\bDROP\s+TABLE\b/gi,
  /\bDROP\s+COLUMN\b/gi,
  /\bTRUNCATE\b/gi,
  /\bDELETE\s+FROM\b/gi,
  /\bALTER\s+TABLE\s+.*\bDROP\b/gi
]

function scan() {
  // Prefer scanning only migrations changed in this branch (compare with base ref)
  let files = []
  try {
    const { execSync } = require('child_process')
    const baseCandidates = Array.from(new Set([process.env.GITHUB_BASE_REF, 'main', 'Main'].filter(Boolean)))
    for (const baseRef of baseCandidates) {
      try {
        // try to fetch the base ref (ignore failures)
        try { execSync(`git fetch origin ${baseRef} --quiet --depth=1`) } catch (e) { /* ignore */ }
        // compute diff against baseRef
        let diff = ''
        try { diff = execSync(`git diff --name-only origin/${baseRef}...HEAD`, { encoding: 'utf8' }) || '' } catch (e) { diff = '' }
        const changed = diff.split(/\r?\n/).map(s => s.trim()).filter(Boolean)
        const migrated = changed.filter(p => p.startsWith('backend/migrations/') && p.endsWith('.sql')).map(p => path.basename(p)).sort()
        if (migrated && migrated.length > 0) { files = migrated; break }
      } catch (e) {
        // try next candidate
      }
    }
  } catch (e) {
    // ignore and fallback below
  }

  // If no changed migration files were found via git diff, scan all migrations as a fallback to be safe
  if (!files || files.length === 0) {
    files = fs.readdirSync(MIGRATIONS_DIR).filter(f => f.endsWith('.sql')).sort()
  }
  let found = false
  for (const f of files) {
    const p = path.join(MIGRATIONS_DIR, f)
    const txt = fs.readFileSync(p, 'utf8')
    const hits = []
    for (const pat of destructivePatterns) {
      if (pat.test(txt)) hits.push(pat.toString())
    }
    if (hits.length) {
      found = true
      console.warn('Destructive SQL found in migration:', f)
      console.warn('  Patterns:', hits.join(', '))
      console.warn('  First 200 characters of file for context:')
      console.warn('---')
      console.warn(txt.slice(0, 200).replace(/\n/g, ' '))
      console.warn('---')
    }
  }
  if (!found) console.log('No destructive SQL patterns detected in migrations')
  return found ? 1 : 0
}

if (require.main === module) process.exit(scan())
module.exports = { scan }
