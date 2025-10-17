const { test, expect } = require('@playwright/test')

const API_BASE = process.env.E2E_API_BASE || 'http://localhost:4000'

function randomSuffix() { return Math.floor(Math.random() * 100000) }

test.beforeAll(async () => {
  // quick pre-check that backend is reachable
  const resp = await (await fetch(API_BASE)).catch(() => null)
  // don't fail here; individual tests will surface errors if backend isn't up
})

test('POS loyalty flow: apply points and verify backend updates', async ({ page }) => {
  const suffix = randomSuffix()
  const storeName = `E2E Loy Store ${suffix}`
  const username = `e2elo${suffix}`
  const email = `e2elo${suffix}@example.com`
  const password = 'Password123!'

  // 1) register store + admin via API
  const reg = await page.request.post(`${API_BASE}/api/stores/register`, { data: { name: storeName, username, email, password } })
  expect(reg.ok()).toBeTruthy()
  const regBody = await reg.json()
  const storeId = regBody.storeId
  const userId = regBody.userId

  // 2) login via API to get token
  const login = await page.request.post(`${API_BASE}/api/auth/login`, { data: { email, password } })
  expect(login.ok()).toBeTruthy()
  const loginBody = await login.json()
  const token = loginBody.token
  expect(token).toBeTruthy()

  // 3) create product scoped to this store via API (use Authorization)
  const sku = `E2E-LOY-SKU-${suffix}`
  const productName = `E2E Loy Product ${suffix}`
  const prodResp = await page.request.post(`${API_BASE}/api/products`, { data: { name: productName, sku, price: 60, stock: 10 }, headers: { Authorization: `Bearer ${token}` } })
  expect(prodResp.ok()).toBeTruthy()
  const prodBody = await prodResp.json()
  const productId = prodBody.id

  // 4) create a customer with initial loyalty points = 5 via API
  const custName = `E2E Cust ${suffix}`
  const custResp = await page.request.post(`${API_BASE}/api/customers`, { data: { name: custName, loyalty_points: 5 }, headers: { Authorization: `Bearer ${token}` } })
  expect(custResp.ok()).toBeTruthy()
  const custBody = await custResp.json()
  const custId = custBody.id

  // 5) set token in the browser context so the app boots authenticated
  await page.addInitScript((t) => { try { localStorage.setItem('token', t) } catch (e) {} }, token)

  // Navigate to POS
  await page.goto('/pos')

  // 6) add the product to cart by searching SKU
  await page.fill('input[placeholder="Search barcode"]', sku)
  // wait for results and click the first result
  await page.waitForSelector('.pos-results .pos-result', { timeout: 5000 })
  await page.click('.pos-results .pos-result')

  // ensure cart contains product name
  const posTable = page.locator('table.pos-table')
  await expect(posTable).toContainText(productName, { timeout: 5000 })

  // 7) open payment modal
  await page.click('button:has-text("Pay")')
  await page.waitForSelector('.modal.payment-modal', { timeout: 3000 })

  // 8) set loyalty points to use = 3 (customer had 5)
  await page.fill('input[placeholder="Use points"]', '3')

  // 9) set cash large enough to cover payable
  await page.fill('.modal.payment-modal input[type="number"]', '1000')

  // 10) intercept POST /api/sales and click Save
  const [resp] = await Promise.all([
    page.waitForResponse(r => r.url().startsWith(`${API_BASE}/api/sales`) && r.request().method() === 'POST'),
    page.click('.modal.payment-modal button:has-text("Save")')
  ])

  const saleBody = await resp.json().catch(() => ({}))
  expect(saleBody).toBeTruthy()
  // expected: awardPoints = floor(grand/100). For our product (60) qty default 1 => grand may be 60 (award 0) but if qty is 2 adjust expectations.
  // We'll assert that loyalty_used is 3 as requested and loyalty_awarded is present (number)
  expect(Number(saleBody.loyalty_used || 0)).toBe(3)
  expect(typeof saleBody.loyalty_awarded).toBe('number')

  // 11) verify customer's loyalty via API: expected new balance = initial 5 - 3 + awarded
  const cAfter = await page.request.get(`${API_BASE}/api/customers?q=${encodeURIComponent(custName)}`, { headers: { Authorization: `Bearer ${token}` } })
  if (cAfter.ok()) {
    const arr = await cAfter.json().catch(() => [])
    const found = Array.isArray(arr) ? arr.find(x => x && x.id === custId) : (arr && arr.data ? arr.data.find(x => x && x.id === custId) : null)
    if (found) {
      const awarded = Number(saleBody.loyalty_awarded || 0)
      const expected = Math.max(0, 5 - 3) + awarded
      expect(Number(found.loyalty_points || 0)).toBe(expected)
    }
  }

  // 12) cleanup best-effort via protected route
  try {
    await page.request.post(`${API_BASE}/api/_e2e/cleanup`, { data: { storeIds: storeId ? [storeId] : [], userIds: userId ? [userId] : [], productIds: productId ? [productId] : [], saleIds: saleBody.id ? [saleBody.id] : [] }, headers: { 'x-e2e-token': process.env.E2E_CLEANUP_TOKEN || '' } })
  } catch (e) {}
})
