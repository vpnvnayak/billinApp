const db = require('../src/db')
const bcrypt = require('bcrypt')

(async function(){
  try{
    const email = process.argv[2] || 'admin@local'
    const pass = process.argv[3] || 'Admin123!'
    const r = await db.query('SELECT id, email, password_hash FROM users WHERE email = $1', [email])
    if (r.rows.length === 0) { console.log('user not found'); process.exit(1) }
    const user = r.rows[0]
    console.log('Found user', user.id, user.email)
    const ok = await bcrypt.compare(pass, user.password_hash)
    console.log('password match:', ok)
    process.exit(0)
  } catch (e) { console.error(e && e.message); process.exit(2) }
})()
