// Small shared validation helpers for email and phone used across forms
export function isValidEmail(v) {
  if (!v) return true
  const s = String(v).trim()
  if (!s) return true
  // simple, pragmatic regex covering common email addresses
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)
}

export function isValidPhone(v) {
  if (!v) return true
  const s = String(v).trim()
  if (!s) return true
  // allow digits, spaces, +, -, parentheses; require 7-15 digits total
  const digits = (s.match(/\d/g) || []).length
  if (digits < 7 || digits > 15) return false
  return /^[0-9+()\-\s]+$/.test(s)
}

export function requirePhone(v) {
  const s = String(v || '').trim()
  if (!s) return false
  return isValidPhone(s)
}

export default { isValidEmail, isValidPhone, requirePhone }
