const https = require('https')

function req(method, path, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null
    const options = {
      hostname: 'localhost',
      port: 4000,
      path,
      method,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': data ? Buffer.byteLength(data) : 0
      },
      agent: new https.Agent({ rejectUnauthorized: false })
    }
    const r = https.request(options, (res) => {
      let buf = ''
      res.setEncoding('utf8')
      res.on('data', d => buf += d)
      res.on('end', () => {
        try {
          const parsed = buf ? JSON.parse(buf) : null
          resolve({ statusCode: res.statusCode, body: parsed })
        } catch (e) {
          resolve({ statusCode: res.statusCode, body: buf })
        }
      })
    })
    r.on('error', reject)
    if (data) r.write(data)
    r.end()
  })
}

async function run() {
  try {
    console.log('Posting test purchase...')
    const payload = {
      supplier_id: null,
      total_amount: 7500,
      metadata: {},
      items: [
        {
          product_id: null,
          sku: 'TEST-SKU-001',
          name: 'Test Product',
          qty: 100,
          price: 75,
          line_total: 7500,
          gross_amount: 7500,
          tax_pct: 12,
          cess_pct: 0,
          unit: 'pcs'
        }
      ]
    }
    const post = await req('POST', '/api/purchases', payload)
    console.log('POST result status:', post.statusCode)
    console.log('POST body:', JSON.stringify(post.body, null, 2))
    const createdId = post.body && post.body.id
    if (!createdId) {
      console.error('No created id returned; aborting')
      process.exit(1)
    }
    console.log('Created purchase id:', createdId)

    const get = await req('GET', `/api/purchases/${createdId}`)
    console.log('GET status:', get.statusCode)
    console.log('GET body:', JSON.stringify(get.body, null, 2))
    // Print item fields of interest
    const items = get.body && get.body.items
    if (Array.isArray(items) && items.length) {
      for (const it of items) {
        console.log('Stored item fields:')
        console.log(' qty=', it.qty, ' price=', it.price || it.unit_price, ' line_total=', it.line_total, ' gross_amount=', it.gross_amount, ' tax_pct=', it.tax_pct, ' tax_percent=', it.tax_percent, ' cess_pct=', it.cess_pct)
      }
    }
  } catch (err) {
    console.error('Test failed', err)
    process.exit(2)
  }
}

run()
