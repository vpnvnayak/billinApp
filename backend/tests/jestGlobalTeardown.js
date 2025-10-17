module.exports = async () => {
  try {
    const db = require('../src/db')
    if (db && db.pool && typeof db.pool.end === 'function') {
      await db.pool.end()
      // small delay to ensure underlying sockets close
      await new Promise(r => setTimeout(r, 50))
    }
  } catch (e) {
    // ignore
    console.warn('globalTeardown error', e && e.message)
  }
  // force exit to ensure CI/Jest doesn't hang on unexpected handles
  try { process.exit(0) } catch (e) {}
}
