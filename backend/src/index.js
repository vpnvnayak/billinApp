const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const cookieParser = require('cookie-parser');
const path = require('path');

dotenv.config();

// Startup safety checks
const NODE_ENV = process.env.NODE_ENV || 'development'
const JWT_SECRET = process.env.JWT_SECRET || ''
if (NODE_ENV === 'production') {
	if (!JWT_SECRET || JWT_SECRET === 'dev-secret') {
		console.error('FATAL: JWT_SECRET must be set to a secure value in production. Aborting startup.')
		process.exit(1)
	}
	// enforce secure cookies in production
	if (process.env.COOKIE_SECURE !== 'true') {
		console.error('FATAL: COOKIE_SECURE must be set to "true" in production to ensure cookies are only sent over HTTPS. Aborting startup.')
		process.exit(1)
	}
	// require ALLOWED_ORIGINS in production to avoid accidental wide-open CORS
	if (!process.env.ALLOWED_ORIGINS) {
		console.error('FATAL: ALLOWED_ORIGINS must be set in production (comma-separated list). Aborting startup.')
		process.exit(1)
	}
}

const app = express();
// Allow configurable origins via ALLOWED_ORIGINS (comma-separated). Defaults to localhost http/https dev ports.
const allowed = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

// Fallback: allow Render preview subdomains in non-prod if you want
const extraDevPatterns = [
  /\.onrender\.com$/i,   // any *.onrender.com
  /^http:\/\/localhost(?::\d+)?$/i
];

app.use(cors({
  origin(origin, cb) {
    if (!origin) return cb(null, true); // curl/postman/no-origin
    if (allowed.includes(origin)) return cb(null, true);
    // allow *.onrender.com and localhost in non-production if you like:
    if (process.env.NODE_ENV !== 'production' &&
        extraDevPatterns.some(rx => rx.test(origin))) {
      return cb(null, true);
    }
    return cb(new Error('Not allowed by CORS: ' + origin));
  },
  methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization'],
  credentials: true
}));

// VERY IMPORTANT: respond to preflight quickly
app.options('*', cors());
app.use(express.json());
app.use(cookieParser());

// Simple E2E cleanup endpoint (only enabled when E2E_CLEANUP_TOKEN is set)
if (process.env.E2E_CLEANUP_TOKEN) {
	app.post('/api/_e2e/cleanup', async (req, res) => {
		try {
			const token = req.headers['x-e2e-token'] || req.body && req.body.token
			if (token !== process.env.E2E_CLEANUP_TOKEN) return res.status(403).json({ ok: false, error: 'forbidden' })
			const { storeIds = [], userIds = [], productIds = [], saleIds = [] } = req.body || {}
			const client = await pool.connect()
			try {
				await client.query('BEGIN')
				if (productIds && productIds.length) await client.query('DELETE FROM products WHERE id = ANY($1::int[])', [productIds])
				// remove sale items and sales when saleIds provided
				if (saleIds && saleIds.length) {
					await client.query('DELETE FROM sale_items WHERE sale_id = ANY($1::int[])', [saleIds])
					await client.query('DELETE FROM sales WHERE id = ANY($1::int[])', [saleIds])
				}
				if (userIds && userIds.length) await client.query('DELETE FROM users WHERE id = ANY($1::int[])', [userIds])
				if (storeIds && storeIds.length) {
					await client.query('DELETE FROM store_settings WHERE store_id = ANY($1::int[])', [storeIds])
					await client.query('DELETE FROM stores WHERE id = ANY($1::int[])', [storeIds])
				}
				await client.query('COMMIT')
				return res.json({ ok: true })
			} catch (e) {
				await client.query('ROLLBACK')
				console.error('E2E cleanup failed', e)
				return res.status(500).json({ ok: false, error: 'cleanup failed' })
			} finally {
				client.release()
			}
		} catch (e) {
			console.error('E2E cleanup route error', e)
			return res.status(500).json({ ok: false, error: 'error' })
		}
	})
}

// optional authentication: populate req.user when a valid Bearer token is present
const optionalAuth = require('./middleware/optionalAuth')
app.use(optionalAuth)

// If a superadmin has selected a store from the UI, frontend sets a non-HttpOnly
// cookie named 'selectedStore'. For convenience, map that into req.user.store_id
// for the duration of the request so existing route logic that checks
// req.user.store_id will automatically scope queries to the selected store.
app.use((req, res, next) => {
	try {
		const sel = req.cookies && req.cookies.selectedStore
		if (sel && req.user && Array.isArray(req.user.roles) && req.user.roles.includes('superadmin')) {
			const sid = Number(sel)
			if (!Number.isNaN(sid)) {
				// set on the request user object only for this request
				req.user.store_id = sid
			}
		}
	} catch (e) {
		// ignore errors and continue
	}
	next()
})

// initialize schema cache once at startup (best-effort)
const schemaCache = require('./schemaCache')
schemaCache.init().then(() => {
	if (process.env.NODE_ENV !== 'test') console.log('schema cache initialized')
}).catch(() => {})

const productsRouter = require('./routes/products');
const posRouter = require('./routes/pos');
const salesRouter = require('./routes/sales');
const authRouter = require('./routes/auth');
const adminRouter = require('./routes/admin');
const usersRouter = require('./routes/users');
const customersRouter = require('./routes/customers');
const suppliersRouter = require('./routes/suppliers');
const supplierAggregatesRouter = require('./routes/supplierAggregates');
const purchasesRouter = require('./routes/purchases');
let purchaseParseRouter = null
try {
	purchaseParseRouter = require('./routes/purchaseParse');
} catch (e) {
	console.warn('purchaseParse route not loaded (optional dependencies missing). To enable invoice parsing run `npm install` in backend and restart.');
	// console.warn(e)
}
const settingsRouter = require('./routes/settings')
const registerRouter = require('./routes/register')

app.use('/api/auth', authRouter);
app.use('/api/products', productsRouter);
app.use('/api/pos', posRouter);
app.use('/api/sales', salesRouter);
app.use('/api/admin', adminRouter);
app.use('/api/users', usersRouter);
app.use('/api/customers', customersRouter);
app.use('/api/suppliers', suppliersRouter);
app.use('/api/suppliers/aggregates', supplierAggregatesRouter);
app.use('/api/purchases', purchasesRouter);
if (purchaseParseRouter) app.use('/api/purchases/parse', purchaseParseRouter);
// settings and uploads
app.use('/api', settingsRouter);
app.use('/api/stores', registerRouter);
// legacy stores registration route removed; registration handled via users/store flow
// serve uploaded assets
app.use('/uploads', express.static(path.join(__dirname, '..', 'public', 'uploads')))


const fs = require('fs');
const https = require('https');

const PORT = process.env.PORT || 4000;
const SSL_CERT = process.env.SSL_CERT_PATH;
const SSL_KEY = process.env.SSL_KEY_PATH;

// If this module is the entry point, start the server. Otherwise export app for tests.
if (require.main === module) {
	// Try to initialize schema cache before accepting requests, but don't block startup indefinitely.
	const initPromise = schemaCache.init()
	const timeoutMs = Number(process.env.SCHEMA_CACHE_INIT_TIMEOUT_MS) || 5000
	const timeout = new Promise((resolve) => setTimeout(resolve, timeoutMs))
	Promise.race([initPromise, timeout]).then(() => {
		if (SSL_CERT && SSL_KEY && fs.existsSync(SSL_CERT) && fs.existsSync(SSL_KEY)) {
			const cert = fs.readFileSync(SSL_CERT);
			const key = fs.readFileSync(SSL_KEY);
			https.createServer({ key, cert }, app).listen(PORT, () => console.log(`Backend (HTTPS) listening on port ${PORT}`));
		} else {
			app.listen(PORT, () => console.log(`Backend listening on port ${PORT}`));
		}
	}).catch((e) => {
		console.warn('schemaCache.init() failed during startup:', e && e.message)
		// start anyway
		if (SSL_CERT && SSL_KEY && fs.existsSync(SSL_CERT) && fs.existsSync(SSL_KEY)) {
			const cert = fs.readFileSync(SSL_CERT);
			const key = fs.readFileSync(SSL_KEY);
			https.createServer({ key, cert }, app).listen(PORT, () => console.log(`Backend (HTTPS) listening on port ${PORT}`));
		} else {
			app.listen(PORT, () => console.log(`Backend listening on port ${PORT}`));
		}
	})
}

// preserve backward-compatible default export (app) but also expose schemaCache for tests/tools
module.exports = app;
module.exports.schemaCache = schemaCache;
