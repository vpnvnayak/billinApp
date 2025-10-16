// Small shared validation helpers used across routes

function isValidInt32(v) {
  if (v === null || v === undefined) return false
  const n = Number(v)
  return Number.isInteger(n) && n >= -2147483648 && n <= 2147483647
}

function isNonNegativeNumber(v) {
  if (v === null || v === undefined) return false
  const n = Number(v)
  return Number.isFinite(n) && !Number.isNaN(n) && n >= 0
}

function isPositiveNumber(v) {
  if (v === null || v === undefined) return false
  const n = Number(v)
  return Number.isFinite(n) && !Number.isNaN(n) && n > 0
}

function isNonNegativeInteger(v) {
  if (v === null || v === undefined) return false
  const n = Number(v)
  return Number.isInteger(n) && n >= 0
}

function isValidUsername(u) {
  return typeof u === 'string' && u.length >= 3 && u.length <= 64 && /^[a-zA-Z0-9_.-]+$/.test(u)
}

function isValidEmail(e) {
  return typeof e === 'string' && e.length <= 254 && /^[^@\s]+@[^@\s]+$/.test(e)
}

function isValidQueryLength(q, max = 200) {
  if (!q) return true
  return String(q).length <= max
}

function escapeLike(term) {
  if (term === null || term === undefined) return term
  return String(term).replace(/%/g, '\\%').replace(/_/g, '\\_')
}

function normalizeUserId(u) {
  if (u === null || u === undefined) return null
  const n = Number(u)
  if (!Number.isFinite(n) || !Number.isInteger(n)) return null
  if (n < -2147483648 || n > 2147483647) return null
  return n
}

module.exports = {
  isValidInt32,
  isNonNegativeNumber,
  isPositiveNumber,
  isNonNegativeInteger,
  isValidUsername,
  isValidEmail,
  isValidQueryLength,
  escapeLike,
  normalizeUserId,
}
