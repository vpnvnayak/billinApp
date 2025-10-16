const express = require('express')
const router = express.Router()
const fs = require('fs')
const os = require('os')
const path = require('path')

// optional external modules: require them safely so this file can be loaded
let multer = null
let upload = null
try {
  multer = require('multer')
  upload = multer({ dest: os.tmpdir(), limits: { fileSize: 25 * 1024 * 1024 } })
} catch (e) {
  console.warn('optional dependency multer not available — uploads will return an instructive error', e && e.message)
  // fallback upload stub that returns a middleware which responds with 503
  upload = { single: (_fieldName) => (req, res, next) => res.status(503).json({ success: false, error: 'server missing multipart parser (multer). Please run `npm install` in backend and restart.' }) }
}

let pdf = null
try { pdf = require('pdf-parse') } catch (e) { console.warn('optional dependency pdf-parse not available; PDF parsing will be skipped', e && e.message) }

let Tesseract = null
try { Tesseract = require('tesseract.js') } catch (e) { console.warn('optional dependency tesseract.js not available; image OCR will be skipped', e && e.message) }

// sharp is optional because it may require native build tools on Windows.
let sharp = null
try {
  sharp = require('sharp')
} catch (e) {
  console.warn('optional dependency sharp not available, image preprocessing will be skipped', e && e.message)
}

let openai = null
let openaiClientShape = null // 'old' | 'new' | null
try {
  const openaiPkg = require('openai')
  const openaiKey = process.env.OPENAI_API_KEY || null
  if (openaiKey) {
    // New SDK: package exports OpenAI (class) or default class
    if (typeof openaiPkg === 'function') {
      try {
        openai = new openaiPkg({ apiKey: openaiKey })
        openaiClientShape = 'new'
      } catch (e) {
        console.warn('failed to instantiate new-style openai default export', e && e.message)
      }
    } else if (openaiPkg && typeof openaiPkg.OpenAI === 'function') {
      openai = new openaiPkg.OpenAI({ apiKey: openaiKey })
      openaiClientShape = 'new'
    } else if (openaiPkg && openaiPkg.Configuration && openaiPkg.OpenAIApi) {
      // older SDK shape
      const { Configuration, OpenAIApi } = openaiPkg
      const cfg = new Configuration({ apiKey: openaiKey })
      openai = new OpenAIApi(cfg)
      openaiClientShape = 'old'
    } else {
      console.warn('unrecognized openai package shape; AI parsing disabled')
    }
  }
} catch (e) {
  console.warn('optional dependency openai not available; AI parsing will be disabled', e && e.message)
}

function safeUnlink(p) {
  try { if (p && fs.existsSync(p)) fs.unlinkSync(p) } catch (e) { console.warn('unlink failed', e) }
}

async function extractTextFromPdf(filePath) {
  const dataBuffer = fs.readFileSync(filePath)
  if (!pdf) {
    console.warn('pdf-parse not available; skipping PDF text extraction')
    return ''
  }
  try {
    const res = await pdf(dataBuffer)
    return (res && res.text) ? res.text : ''
  } catch (e) {
    console.warn('pdf parse failed', e)
    return ''
  }
}

async function extractTextFromImage(filePath) {
  try {
    // If sharp is available, use it to normalize the image first
    let buf
    if (!Tesseract) {
      console.warn('tesseract.js not available; skipping image OCR')
      return ''
    }
    if (sharp) {
      try {
        buf = await sharp(filePath).ensureAlpha().png().toBuffer()
      } catch (e) {
        console.warn('sharp preprocessing failed, falling back to raw file buffer', e && e.message)
        buf = fs.readFileSync(filePath)
      }
    } else {
      // fallback: pass raw file buffer to tesseract
      buf = fs.readFileSync(filePath)
    }
    const { data } = await Tesseract.recognize(buf, 'eng', { logger: m => {} })
    return data && data.text ? data.text : ''
  } catch (e) {
    console.warn('image OCR failed', e && e.message)
    return ''
  }
}

function basicHeuristicParse(text) {
  // Very small heuristic parser: find invoice no, date, totals, and attempt to extract line-like rows
  const out = { supplier_name: null, invoice_no: null, invoice_date: null, invoice_date_raw: null, lines: [], subtotal: null, tax_total: null, total: null, currency: null, warnings: [] }
  if (!text || !text.trim()) {
    out.warnings.push('Empty OCR text')
    return out
  }
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
  // heuristics
  for (const l of lines) {
    // invoice number
    const mInv = l.match(/invoice\s*no\.?\s*[:\-\s]*([A-Za-z0-9\-\/]+)/i)
    if (mInv && !out.invoice_no) out.invoice_no = mInv[1]
    // date
    const mDate = l.match(/(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/) || l.match(/(\d{4}[\-/]\d{1,2}[\-/]\d{1,2})/)
    if (mDate && !out.invoice_date_raw) out.invoice_date_raw = mDate[1]
    // totals
    const mTotal = l.match(/(?:total|grand total|amount due)[:\s]*₹?\s*([0-9,]+(?:\.[0-9]{1,2})?)/i)
    if (mTotal && !out.total) out.total = Number(mTotal[1].replace(/,/g, ''))
    const mSub = l.match(/(?:subtotal|sub total)[:\s]*₹?\s*([0-9,]+(?:\.[0-9]{1,2})?)/i)
    if (mSub && !out.subtotal) out.subtotal = Number(mSub[1].replace(/,/g, ''))
    const mTax = l.match(/(?:tax total|tax)[:\s]*₹?\s*([0-9,]+(?:\.[0-9]{1,2})?)/i)
    if (mTax && !out.tax_total) out.tax_total = Number(mTax[1].replace(/,/g, ''))
  }
  // naive lines detection: lines containing 2+ numbers (qty, rate, total)
  for (const l of lines) {
    const nums = l.match(/\d+[\d,]*\.?\d*/g) || []
    if (nums.length >= 2 && /\d/.test(l)) {
      // try split by multiple spaces to find columns
      const cols = l.split(/\s{2,}/).map(c => c.trim()).filter(Boolean)
      if (cols.length >= 2) {
        // last numeric token is likely total
        const lastNum = cols[cols.length - 1].match(/([0-9,]+(?:\.[0-9]{1,2})?)/)
        const qtyNum = cols[0].match(/^(\d+)/)
        out.lines.push({ sku: null, name: cols.slice(0, cols.length - 2).join(' ') || cols[0], qty: qtyNum ? Number(qtyNum[1]) : null, rate: null, tax_percent: null, line_total: lastNum ? Number(lastNum[1].replace(/,/g, '')) : null })
      }
    }
  }
  // supplier heuristics: first non-empty line might be supplier
  if (lines.length) out.supplier_name = lines[0]
  // try parse invoice_date into ISO
  if (out.invoice_date_raw) {
    const dt = new Date(out.invoice_date_raw)
    if (isFinite(dt.getTime())) out.invoice_date = dt.toISOString().split('T')[0]
  }
  return out
}

async function callOpenAIParser(rawText) {
  if (!openai) return null
  // simple prompt asking for strict JSON
  const prompt = `You are an invoice parser. Given the raw OCR text below, extract supplier_name, invoice_no, invoice_date (ISO yyyy-mm-dd), lines (array of {name, qty, rate, line_total}), subtotal, tax_total, total, currency. Output ONLY a JSON object with these keys and no additional text. If a value can't be found, use null. Raw text:\n\n${rawText}\n\nRespond with JSON.`
  try {
    let txt = null
    if (openaiClientShape === 'old' && typeof openai.createChatCompletion === 'function') {
      const resp = await openai.createChatCompletion({ model: 'gpt-4o-mini', messages: [{ role: 'system', content: 'You are a JSON-only parser' }, { role: 'user', content: prompt }], max_tokens: 800, temperature: 0 })
      txt = resp.data && resp.data.choices && resp.data.choices[0] && resp.data.choices[0].message && resp.data.choices[0].message.content
    } else if (openaiClientShape === 'new') {
      // new SDK: openai.chat.completions.create
      if (openai.chat && openai.chat.completions && typeof openai.chat.completions.create === 'function') {
        const resp = await openai.chat.completions.create({ model: 'gpt-4o-mini', messages: [{ role: 'system', content: 'You are a JSON-only parser' }, { role: 'user', content: prompt }], max_tokens: 800, temperature: 0 })
        // resp.choices[0].message.content
        txt = resp && resp.choices && resp.choices[0] && resp.choices[0].message && resp.choices[0].message.content
      } else if (typeof openai.createChatCompletion === 'function') {
        // some new clients may still expose the old method
        const resp = await openai.createChatCompletion({ model: 'gpt-4o-mini', messages: [{ role: 'system', content: 'You are a JSON-only parser' }, { role: 'user', content: prompt }], max_tokens: 800, temperature: 0 })
        txt = resp.data && resp.data.choices && resp.data.choices[0] && resp.data.choices[0].message && resp.data.choices[0].message.content
      } else {
        console.warn('openai client does not support chat completions in known shapes')
      }
    } else {
      // fallback attempt: try createChatCompletion if present
      if (typeof openai.createChatCompletion === 'function') {
        const resp = await openai.createChatCompletion({ model: 'gpt-4o-mini', messages: [{ role: 'system', content: 'You are a JSON-only parser' }, { role: 'user', content: prompt }], max_tokens: 800, temperature: 0 })
        txt = resp.data && resp.data.choices && resp.data.choices[0] && resp.data.choices[0].message && resp.data.choices[0].message.content
      } else if (openai.chat && openai.chat.completions && typeof openai.chat.completions.create === 'function') {
        const resp = await openai.chat.completions.create({ model: 'gpt-4o-mini', messages: [{ role: 'system', content: 'You are a JSON-only parser' }, { role: 'user', content: prompt }], max_tokens: 800, temperature: 0 })
        txt = resp && resp.choices && resp.choices[0] && resp.choices[0].message && resp.choices[0].message.content
      } else {
        console.warn('openai client does not expose a chat completion method')
      }
    }

    if (!txt) return null
    // attempt to extract a balanced JSON object from the model reply (handles trailing text)
    function extractBalancedJson(s) {
      const start = s.indexOf('{')
      if (start === -1) return null
      let i = start
      let depth = 0
      let inString = false
      let escape = false
      for (; i < s.length; i++) {
        const ch = s[i]
        if (inString) {
          if (escape) { escape = false } else if (ch === '\\') { escape = true } else if (ch === '"') { inString = false }
        } else {
          if (ch === '"') { inString = true }
          else if (ch === '{') { depth++ }
          else if (ch === '}') { depth--; if (depth === 0) { return s.slice(start, i + 1) } }
        }
      }
      return null
    }

    const jsonText = extractBalancedJson(txt)
    if (!jsonText) {
      console.warn('openai parse failed: no balanced JSON found in model reply; reply snippet:', (txt || '').slice(0, 200))
      return null
    }
    try {
      return JSON.parse(jsonText)
    } catch (e) {
      console.warn('openai parse failed JSON.parse error', e && e.message, 'jsonText snippet:', (jsonText || '').slice(0, 300))
      return null
    }
  } catch (e) {
    console.warn('openai call failed', e && e.message)
    return null
  }
}

router.post('/parse-invoice', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'file required' })
  const tmp = req.file.path
  let text = ''
  try {
    const mime = req.file.mimetype || ''
    if (mime === 'application/pdf' || path.extname(req.file.originalname).toLowerCase() === '.pdf') {
      text = await extractTextFromPdf(tmp)
    } else {
      text = await extractTextFromImage(tmp)
    }

    // basic heuristic parse
    let parsed = basicHeuristicParse(text)

    // if OpenAI is configured, call it to improve parsing
    if (openai) {
      // limit how much text we send to the model to avoid large payloads
      const maxSend = 100000 // characters
      const toSend = text && text.length > maxSend ? text.slice(0, maxSend) : text
      const ai = await callOpenAIParser(toSend)
      if (ai) {
        // merge ai into parsed but keep warnings
        parsed = Object.assign(parsed, ai)
      }
    }

    // attach a small raw_text snippet for debugging and delete file
    const rawSnippet = text ? text.slice(0, 2000) : ''
    const response = { success: true, parsed, metadata: { raw_text_snippet: rawSnippet, warnings: parsed.warnings || [] } }
    res.json(response)
  } catch (e) {
    console.error('parse failed', e)
    const detail = (e && e.message) ? e.message : String(e)
    res.status(500).json({ success: false, error: 'parse failed', detail })
  } finally {
    safeUnlink(tmp)
  }
})

module.exports = router
