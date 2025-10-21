const SMTP_HOST = process.env.SMTP_HOST
const SMTP_PORT = process.env.SMTP_PORT
const SMTP_USER = process.env.SMTP_USER
const SMTP_PASS = process.env.SMTP_PASS

let transporter = null
if (SMTP_HOST && SMTP_PORT) {
  // require nodemailer lazily only when needed to avoid adding it as a test dependency
  const nodemailer = require('nodemailer')
  transporter = nodemailer.createTransport({ host: SMTP_HOST, port: Number(SMTP_PORT), secure: false, auth: SMTP_USER ? { user: SMTP_USER, pass: SMTP_PASS } : undefined })
}

async function sendPasswordResetEmail(to, otp) {
  const subject = 'Your password reset code'
  const text = `Your password reset code is: ${otp}. It expires in 15 minutes.`
  if (transporter) {
    await transporter.sendMail({ from: process.env.SMTP_FROM || 'no-reply@local', to, subject, text })
    return
  }
  // fallback: log
  console.log(`Password reset OTP for ${to}: ${otp}`)
}

module.exports = { sendPasswordResetEmail }
