const thresholds = {
  txWarningMs: Number(process.env.TX_WARNING_MS || 500)
}

function recordTransaction(durationMs, info = {}) {
  if (durationMs >= thresholds.txWarningMs) {
    console.warn('Long-running transaction', { durationMs, ...info })
  }
  // could emit to Prometheus/pushgateway or another monitoring system
}

module.exports = { recordTransaction, thresholds }
