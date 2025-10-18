// Small debug script that POSTs to /api/auth/login using native https to avoid external deps
const https = require('https');

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const postData = JSON.stringify({ email: 'admin@local', password: 'd/MxgfQcuc8=' });

const options = {
  hostname: 'localhost',
  port: 4000,
  path: '/api/auth/login',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(postData),
  },
  rejectUnauthorized: false,
};

const req = https.request(options, (res) => {
  console.log('STATUS', res.statusCode);
  console.log('HEADERS', res.headers);
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    try { console.log('BODY', JSON.parse(data)); } catch (e) { console.log('BODY', data); }
  });
});

req.on('error', (e) => {
  console.error('Request error', e && e.message);
});

req.write(postData);
req.end();
