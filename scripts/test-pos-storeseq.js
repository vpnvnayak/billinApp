const https = require('https')

const options = {
  hostname: 'localhost',
  port: 4000,
  path: '/api/pos/products?store_seq=4&limit=5',
  method: 'GET',
  rejectUnauthorized: false,
}

const req = https.request(options, (res) => {
  let data = ''
  console.log('statusCode:', res.statusCode)
  res.on('data', (chunk) => { data += chunk })
  res.on('end', () => {
    try {
      const out = { statusCode: res.statusCode, body: JSON.parse(data) }
      require('fs').writeFileSync(__dirname + '/test-pos-storeseq-out.json', JSON.stringify(out, null, 2))
      console.log('Wrote output to', __dirname + '/test-pos-storeseq-out.json')
    } catch (e) {
      const out = { statusCode: res.statusCode, bodyRaw: data }
      require('fs').writeFileSync(__dirname + '/test-pos-storeseq-out.json', JSON.stringify(out, null, 2))
      console.log('Wrote raw output to', __dirname + '/test-pos-storeseq-out.json')
    }
  })
})

req.on('error', (e) => { console.error('request error', e) })
req.end()
