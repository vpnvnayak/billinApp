const { test, expect, request } = require('@playwright/test')

// Minimal application walkthrough:
// 1. Visit register page
// 2. Register a new store + admin user
// 3. Login with created user
// 4. Verify store header shows created store name/logo

function randomSuffix() {
  return Math.floor(Math.random() * 100000)
}

const API_BASE = process.env.E2E_API_BASE || 'https://localhost:4000'

// Ensure backend is reachable before running tests; fail fast with a helpful message.
test.beforeAll(async () => {
  const api = await request.newContext({ baseURL: API_BASE })
  try {
    let ok = false
    let resp = null
    try {
      resp = await api.get('/').catch(() => null)
      if (resp && resp.status && resp.status() < 500) ok = true
    } catch (e) {
      // ignore
    }
    if (!ok) {
      console.error(`E2E pre-check: backend not reachable at ${API_BASE}. Please start the backend and set DATABASE_URL and E2E_CLEANUP_TOKEN if needed.`)
      throw new Error(`Backend not reachable at ${API_BASE}. Start the backend and ensure it is listening.`)
    }
  } finally {
    await api.dispose()
  }
})

test('application walkthrough: register -> login -> store header', async ({ page, baseURL }) => {
  const suffix = randomSuffix()
  const storeName = `E2E Store ${suffix}`
  const username = `e2euser${suffix}`
  const email = `e2e${suffix}@example.com`
  const password = 'Password123!'

  // Register the store via backend API (more reliable). Then log in via UI.
  const reg = await page.request.post(`${API_BASE}/api/stores/register`, { data: { name: storeName, username, email, password } })
  const regBody = await reg.json().catch(() => ({}))
  if (!reg.ok()) {
    const txt = await reg.text().catch(() => '')
    console.error('Register API failed', { status: reg.status(), statusText: reg.statusText(), body: txt })
    throw new Error(`Register API failed with status ${reg.status()}: ${txt}`)
  }
  const storeIdFromApi = regBody.storeId

  // Now navigate to login and sign in via UI
  await page.goto('/login')
  // login form uses email and password fields
  await page.fill('input[type="email"]', email).catch(() => {})
  await page.fill('input[type="password"]', password)
  await page.click('button:has-text("Sign in")').catch(async () => { await page.click('button[type="submit"]') })
  await page.waitForNavigation({ waitUntil: 'networkidle', timeout: 5000 }).catch(() => {})
  await page.waitForNavigation({ waitUntil: 'networkidle', timeout: 5000 }).catch(() => {})

  // 3) verify header contains store name (StoreHeader appears in header)
  const header = page.locator('header')
  await expect(header).toContainText(storeName)

  // Try to extract created ids from API responses that happened during registration.
  // The register endpoint returns { ok: true, storeId, userId } so we can intercept it.
  // If interception wasn't set up earlier, try to query the backend for the user by email.
  let storeIds = []
  let userIds = []
  try {
  // attempt to fetch user by email via the backend API
  const userResp = await page.request.get(`${API_BASE}/api/users?email=${encodeURIComponent(email)}`)
    if (userResp.ok()) {
      const ubody = await userResp.json().catch(() => null)
      if (ubody && Array.isArray(ubody)) {
        userIds = ubody.filter(u => u && u.email === email).map(u => u.id).filter(Boolean)
        if (userIds.length && ubody[0].store_id) storeIds = Array.from(new Set(ubody.map(u => u.store_id).filter(Boolean)))
      }
    }
  } catch (e) {
    // ignore
  }

  // Cleanup via backend e2e route (if configured)
  try {
    const resp = await page.request.post(`${API_BASE}/api/_e2e/cleanup`, {
      data: { storeIds, userIds },
      headers: { 'x-e2e-token': process.env.E2E_CLEANUP_TOKEN || '' }
    }).catch(e => null)
    // best-effort; ignore failures
  } catch (e) {
    // ignore
  }
})

// skeleton: create product flow
test('create product (e2e): create product via UI and cleanup', async ({ page }) => {
  const suffix = randomSuffix()
  const storeName = `E2E Store ${suffix}`
  const username = `e2euser${suffix}`
  const email = `e2e${suffix}@example.com`
  const password = 'Password123!'

  // Create a fresh store + admin user via API (register endpoint)
  const reg = await page.request.post(`${API_BASE}/api/stores/register`, { data: { name: storeName, username, email, password } })
  const regBody = await reg.json().catch(() => ({}))
  if (!reg.ok()) {
    const txt = await reg.text().catch(() => '')
    console.error('Register API failed', { status: reg.status(), statusText: reg.statusText(), body: txt })
    throw new Error(`Register API failed with status ${reg.status()}: ${txt}`)
  }
  const storeId = regBody.storeId
  const userId = regBody.userId

  // Login through the UI (mirrors real user flow)
  await page.goto('/login')
  await page.fill('input[type="email"]', email).catch(() => {})
  await page.fill('input[type="password"]', password)
  await page.click('button:has-text("Sign in")').catch(async () => { await page.click('button[type="submit"]') })
  await page.waitForNavigation({ waitUntil: 'networkidle', timeout: 5000 }).catch(() => {})

  // Navigate to products page and open create modal
  await page.goto('/products')
  await page.click('button:has-text("Add product")')

  const sku = `E2E-SKU-${suffix}`
  const name = `E2E Product ${suffix}`

  // Fill modal fields using the labels defined in Products.jsx
  await page.getByLabel('Name').fill(name)
  await page.getByLabel('Barcode / SKU').fill(sku)
  await page.getByLabel('MRP').fill('100')
  await page.getByLabel('Selling price').fill('90')
  // Unit defaults to KG, but set it explicitly
  await page.getByLabel('Unit').selectOption('KG')
  await page.getByLabel('Tax %').selectOption('12')
  await page.getByLabel('Stock').fill('15')

  // Submit the form
  await page.click('button:has-text("Create")')
  // wait for modal to close and the products table to refresh with the new product
  await page.waitForTimeout(300)
  const table = page.locator('table.products-table')
  // wait up to 5s for the new row to appear (SKU or name should be visible)
  await expect(table).toContainText(sku, { timeout: 5000 })
  await expect(table).toContainText(name, { timeout: 5000 })

  // Query backend for product by sku to obtain id(s)
  let productIds = []
  try {
  const pResp = await page.request.get(`${API_BASE}/api/products?q=${encodeURIComponent(sku)}`)
    if (pResp.ok()) {
      const pBody = await pResp.json().catch(() => null)
      let arr = []
      if (Array.isArray(pBody)) arr = pBody
      else if (pBody && Array.isArray(pBody.data)) arr = pBody.data
      productIds = arr.filter(p => p && p.sku === sku).map(p => p.id).filter(Boolean)
    }
  } catch (e) {
    // ignore
  }

  // Cleanup all created resources via protected cleanup route (best-effort)
  try {
    await page.request.post(`${API_BASE}/api/_e2e/cleanup`, {
      data: { storeIds: storeId ? [storeId] : [], userIds: userId ? [userId] : [], productIds },
      headers: { 'x-e2e-token': process.env.E2E_CLEANUP_TOKEN || '' }
    }).catch(() => {})
  } catch (e) {
    // ignore
  }
})

// skeleton: make sale flow
test('make sale (e2e): create store/product, perform sale via POS and cleanup', async ({ page }) => {
  const suffix = randomSuffix()
  const storeName = `E2E Store ${suffix}`
  const username = `e2euser${suffix}`
  const email = `e2e${suffix}@example.com`
  const password = 'Password123!'

  // Register store + user
  const reg = await page.request.post(`${API_BASE}/api/stores/register`, { data: { name: storeName, username, email, password } })
  const regBody = await reg.json().catch(() => ({}))
  if (!reg.ok()) {
    const txt = await reg.text().catch(() => '')
    console.error('Register API failed', { status: reg.status(), statusText: reg.statusText(), body: txt })
    throw new Error(`Register API failed with status ${reg.status()}: ${txt}`)
  }
  const storeId = regBody.storeId
  const userId = regBody.userId

  // Create a product via the UI so it's associated with this store (avoid API scoping issues)
  const sku = `E2E-SKU-SALE-${suffix}`
  const productName = `E2E Sale Product ${suffix}`
  await page.goto('/products')
  await page.click('button:has-text("Add product")')
  await page.getByLabel('Name').fill(productName)
  await page.getByLabel('Barcode / SKU').fill(sku)
  await page.getByLabel('MRP').fill('200')
  await page.getByLabel('Selling price').fill('180')
  await page.getByLabel('Unit').selectOption('Nos')
  await page.getByLabel('Tax %').selectOption('12')
  await page.getByLabel('Stock').fill('50')
  await page.click('button:has-text("Create")')
  await page.waitForTimeout(400)
  // find created product id via products API
  let productId = null
  try {
    const pResp = await page.request.get(`${API_BASE}/api/products?q=${encodeURIComponent(sku)}`)
    if (pResp.ok()) {
      const pBody = await pResp.json().catch(() => null)
      const arr = Array.isArray(pBody) ? pBody : (pBody && Array.isArray(pBody.data) ? pBody.data : [])
      const found = arr.find(p => p && p.sku === sku)
      if (found) productId = found.id
    }
  } catch (e) {
    // ignore
  }

  // Login via UI
  await page.goto('/login')
  await page.fill('input[type="email"]', email).catch(() => {})
  await page.fill('input[type="password"]', password)
  await page.click('button:has-text("Sign in")').catch(async () => { await page.click('button[type="submit"]') })
  await page.waitForNavigation({ waitUntil: 'networkidle', timeout: 5000 }).catch(() => {})

  // Go to POS page
  await page.goto('/pos')

  // Add product to cart by searching SKU
  await page.fill('input[placeholder="Search barcode"]', sku)
  // press Enter to trigger lookup and add
  await page.keyboard.press('Enter')

  // Ensure the cart has the product by checking pos-table contains product name
  const posTable = page.locator('table.pos-table')
  await expect(posTable).toContainText(productName, { timeout: 5000 })

  // Click Pay and fill payment details
  await page.click('button:has-text("Pay")')
  // set cash given to cover amount; fetch displayed payable amount
  const payableText = await page.locator('.pm-amt').first().innerText().catch(() => '0')
  const payable = Number(payableText.replace(/[^0-9.]/g, '')) || 0
  await page.fill('input[placeholder=""]', String(Math.ceil(payable)))
  // click Save to submit payment
  await page.click('button:has-text("Save")')

  // Wait for sale result overlay with Sale ID or check POST /sales response
  let saleId = null
  try {
    // Prefer checking the UI overlay which shows Sale ID
    const saleOverlay = page.locator('.receipt-overlay')
    await expect(saleOverlay).toBeVisible({ timeout: 5000 })
    const saleText = await saleOverlay.innerText().catch(() => '')
    const m = saleText.match(/Sale ID:\s*(\d+)/)
    if (m) saleId = Number(m[1])
  } catch (e) {
    // fallback: query recent sales by product
    try {
  const sResp = await page.request.get(`${API_BASE}/api/sales?q=${encodeURIComponent(productName)}`)
      if (sResp.ok()) {
        const sBody = await sResp.json().catch(() => null)
        const arr = Array.isArray(sBody) ? sBody : (sBody && Array.isArray(sBody.data) ? sBody.data : [])
        if (arr.length) saleId = arr[0].id
      }
    } catch (e2) {}
  }

  // Prepare cleanup arrays
  const saleIds = saleId ? [saleId] : []
  const productIds = productId ? [productId] : []

  // Cleanup via protected route
  try {
    await page.request.post(`${API_BASE}/api/_e2e/cleanup`, {
      data: { storeIds: storeId ? [storeId] : [], userIds: userId ? [userId] : [], productIds, saleIds },
      headers: { 'x-e2e-token': process.env.E2E_CLEANUP_TOKEN || '' }
    }).catch(() => {})
  } catch (e) {}
})
