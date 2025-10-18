const db = require('../src/db')
const bcrypt = require('bcrypt')

async function run() {
  const args = process.argv.slice(2)
  if (args.length < 2) {
    console.error('Usage: node reset-password.js <email> <newPassword>')
    process.exit(2)
  }
  const [email, newPassword] = args
  try {
    const hash = await bcrypt.hash(newPassword, 10)
    const r = await db.query('UPDATE users SET password_hash = $1 WHERE email = $2 RETURNING id, email', [hash, email])
    if (r.rows.length === 0) {
      console.error('No user found with email', email)
      process.exit(1)
    }
    const userId = r.rows[0].id
    // delete existing refresh tokens for the user to invalidate old sessions
    await db.query('DELETE FROM refresh_tokens WHERE user_id = $1', [userId])
    console.log(`Password for ${email} updated (id=${userId}). Removed existing refresh tokens.`)
    try { await db.pool.end() } catch (e) {}
    process.exit(0)
  } catch (e) {
    console.error('Error resetting password', e && e.message)
    try { await db.pool.end() } catch (e) {}
    process.exit(1)
  }
}

run()
