const jwt = require('jsonwebtoken')

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret'

// Middleware: if Authorization: Bearer <token> is present, verify and populate req.user
// Does NOT return 401 on missing/invalid token — it's optional auth for public endpoints
function optionalAuth(req, res, next) {
  try {
    const auth = req.headers && req.headers.authorization
    if (!auth) return next()
    const parts = auth.split(' ')
    if (parts.length !== 2 || parts[0] !== 'Bearer') return next()
    const token = parts[1]
    try {
      const payload = jwt.verify(token, JWT_SECRET)
      // payload expected to contain { sub, email, roles, store_id }
      req.user = payload
    } catch (e) {
      // invalid token — silently ignore for optional auth
    }
  } catch (e) {
    // defensive: never crash the request pipeline
  }
  return next()
}

module.exports = optionalAuth
