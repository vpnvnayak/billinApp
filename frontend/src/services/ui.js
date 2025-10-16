export function showAlert(message, title) {
  try {
    if (typeof window !== 'undefined' && window.__ui && window.__ui.alert) {
      return window.__ui.alert(message, title)
    }
  } catch (e) { /* ignore */ }
  try { window.alert(message) } catch (e) { console.log(message) }
  return Promise.resolve(true)
}

export function showConfirm(message, title) {
  try {
    if (typeof window !== 'undefined' && window.__ui && window.__ui.confirm) {
      return window.__ui.confirm(message, title)
    }
  } catch (e) { /* ignore */ }
  try { const ok = window.confirm(message); return Promise.resolve(!!ok) } catch (e) { console.log(message); return Promise.resolve(false) }
}

export function showSnackbar(message, type = 'info') {
  try {
    if (typeof window !== 'undefined' && window.__ui && window.__ui.snackbar) {
      return window.__ui.snackbar(message, type)
    }
  } catch (e) { /* ignore */ }
  // fallback: log to console (non-blocking)
  try { console.log('SNACK:', type, message) } catch (e) {}
}

export default { showAlert, showConfirm, showSnackbar }
