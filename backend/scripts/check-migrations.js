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
  const files = fs.readdirSync(MIGRATIONS_DIR).filter(f => f.endsWith('.sql')).sort()
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
