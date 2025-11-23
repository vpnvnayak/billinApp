import React, { useEffect, useState } from 'react'
import api from '../services/api'
import { PlusIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline'
import ListControls from './ui/ListControls'
import PaginationFooter from './ui/PaginationFooter'

export default function Products() {
  const [products, setProducts] = useState([])
  const [query, setQuery] = useState('')
  const [repackOnly, setRepackOnly] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [showCreate, setShowCreate] = useState(false)
  const [editing, setEditing] = useState(null)
  const [expanded, setExpanded] = useState({}) // map productId -> boolean
  const [variantsMap, setVariantsMap] = useState({}) // map productId -> [variants]
  const [entries, setEntries] = useState(10)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [previewRows, setPreviewRows] = useState([])
  const [showImport, setShowImport] = useState(false)

  useEffect(() => {
    fetchProducts()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => { fetchProducts() }, [page, entries, query])

  async function fetchProducts() {
    setLoading(true)
    setError(null)
    try {
      const params = { page, limit: entries }
      if (query) params.q = query
      const r = await api.get('/products', { params })
      if (r.data && Array.isArray(r.data.data)) {
        setProducts(r.data.data)
        setTotal(r.data.total || 0)
      } else {
        setProducts(r.data || [])
        setTotal((r.data && r.data.length) || 0)
      }
    } catch (err) {
      setError('Failed to load products')
    } finally {
      setLoading(false)
    }
  }

  // Toggle expand/collapse for product variants and fetch variants lazily
  async function toggleVariants(product) {
    if (!product || !product.id) return
    const pid = product.id
    const cur = !!expanded[pid]
    if (cur) { setExpanded(es => ({ ...es, [pid]: false })); return }
    if (!variantsMap[pid]) {
      try {
        const r = await api.get(`/products/${pid}/variants`)
        setVariantsMap(m => ({ ...m, [pid]: Array.isArray(r.data) ? r.data : [] }))
      } catch (e) {
        setVariantsMap(m => ({ ...m, [pid]: [] }))
      }
    }
    setExpanded(es => ({ ...es, [pid]: true }))
  }

  // Use the server-returned page of products directly. The server already
  // handles `page` and `limit` (entries) so we must not slice again here.
  // We still apply a small client-side filter for the repackOnly toggle
  // (server doesn't support that filter yet) and fallback search when
  // server-side search isn't used.
  const filtered = (() => {
    const q = (query || '').trim().toLowerCase()
    let res = products || []
    // When query is present we already send it to the server in fetchProducts.
    // As a defensive fallback apply the filter on the returned page too.
    if (q) {
      res = res.filter(
        p =>
          String(p.sku).toLowerCase().includes(q) ||
          (p.name || '').toLowerCase().includes(q)
      )
    }
    if (repackOnly) res = res.filter(p => p.is_repacking === true)
    return res
  })()

  return (
    <div className="products-page">
      <div className="page-header products-header">
        <div className="search">
          <MagnifyingGlassIcon style={{ width: 18, height: 18 }} aria-hidden />
          <input
            placeholder="Search SKU or name"
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
        </div>

        {/* FIX: consolidate header actions into a single flex container */}
        <div className="page-header-actions" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            id="product-json-file"
            type="file"
            accept="application/json"
            style={{ display: 'none' }}
            onChange={async (e) => {
              const f = e.target.files && e.target.files[0]
              if (!f) return
              try {
                const text = await f.text()
                const parsed = JSON.parse(text)
                const items = Array.isArray(parsed) ? parsed : (parsed.products || parsed.items || parsed.rows || [])
                if (!Array.isArray(items)) throw new Error('No array found in JSON')
                const mapped = items.map((it) => ({
                  // best-effort automatic mapping
                  name: it.name || it.product_name || it.title || it.label || '',
                  sku: it.sku || it.barcode || it.code || it.upc || it.id || '',
                  barcode: it.barcode || it.sku || '',
                  mrp: it.mrp != null ? Number(it.mrp) : (it.price || null),
                  price: it.price != null ? Number(it.price) : (it.mrp || null),
                  tax_percent: it.taxRate != null ? Number(it.taxRate) : (it.tax_percent != null ? Number(it.tax_percent) : 0),
                  unit: it.unit || it.uom || it.unit_of_measure || 'Nos',
                  stock: it.stock != null ? Number(it.stock) : (it.qty != null ? Number(it.qty) : 0),
                  hsn: it.hsn || it.hsn_code || null,
                  is_repacking: !!it.is_repacking || !!it.repacking
                }))
                console.log('Parsed product JSON, rows=', mapped.length)
                // give immediate visible feedback in UI
                setPreviewRows(mapped)
                setShowImport(true)
                try { alert(`Loaded ${mapped.length} product rows for import`) } catch (e) { /* ignore if alert blocked */ }
                // Show preview modal; user must confirm import using the Import button below.
              } catch (err) {
                console.error('Failed to parse product JSON', err)
                alert('Failed to parse JSON file: ' + (err && err.message ? err.message : 'invalid file'))
              } finally {
                // reset the input so same file can be reselected later
                e.target.value = ''
              }
            }}
          />
          <button
            className="btn small"
            onClick={() => {
              try {
                const rows = filtered || []
                // Only include products marked for repacking
                const exportRows = rows.filter(r => !!r.is_repacking)
                if (!exportRows.length) return
                // Build PLU.txt: each row per product with format:
                // store_seq,product_store_seq_padded6,NAME_UPPER,3,MRP
                const lines = []
                for (const r of exportRows) {
                  const storeId = r.store_seq != null ? String(r.store_seq) : ''
                  // use internal product id (store-wise) padded to 6 chars as the second field
                  const storeSeqStr = r.store_seq != null ? String(r.store_seq) : ''
                  const storeSeqPadded = storeSeqStr ? storeSeqStr.padStart(6, '0') : ''.padStart(6, '0')
                  // sanitize name: remove commas/newlines and uppercase
                  const name = String(r.name || '').replace(/[\n\r,]+/g, ' ').trim().toUpperCase()
                  const mrp = (r.mrp == null || r.mrp === '') ? 0 : Number(r.mrp)
                  const mrpFmt = Number.isFinite(mrp) ? mrp.toFixed(2) : '0.00'
                  // constant '3' as the fourth field per spec
                  const rowLine = `${storeId},${storeSeqPadded},${name},3,${mrpFmt}`
                  lines.push(rowLine)
                }
                const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8;' })
                const url = URL.createObjectURL(blob)
                const a = document.createElement('a')
                a.href = url
                a.download = `PLU.txt`
                document.body.appendChild(a)
                a.click()
                a.remove()
                URL.revokeObjectURL(url)
              } catch (e) {
                console.error('Export failed', e)
              }
            }}
            title="Download weighing scale CSV"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              marginRight: 8,
              background: 'transparent',
              border: 'none',
              padding: 0,
              color: '#0366d6',
              textDecoration: 'underline',
              cursor: 'pointer'
            }}
          >
            {/* simple weighing scale icon */}
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M3 21h18" />
              <path d="M12 3v6" />
              <path d="M5 9a7 7 0 0 0 14 0" />
            </svg>
            <span style={{ fontSize: 13 }}>weighing scale</span>
          </button>

          <label className="lc-toggle" style={{ cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={repackOnly}
              onChange={e => setRepackOnly(!!e.target.checked)}
            />
            <span
              className={repackOnly ? 'active' : 'inactive'}
              style={{ padding: '6px 8px', borderRadius: 8 }}
            >
              {repackOnly ? 'Repack: On' : 'Repack: Off'}
            </span>
          </label>

          <button className="btn small" onClick={() => setShowCreate(true)}>
            <PlusIcon style={{ width: 14, height: 14, marginRight: 8 }} aria-hidden /> Add product
          </button>
          <button
            className="btn small"
            onClick={() => document.getElementById('product-json-file').click()}
            title="Upload products JSON"
            style={{ marginLeft: 6 }}
          >
            Upload products (JSON)
          </button>
        </div>
      </div>

      <div className="kpi-row">
        <div className="kpi-card">
          <div className="kpi-label">Total Products</div>
          <div className="kpi-value">{total}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Total Stock Value</div>
          <div className="kpi-value">
            {(() => {
              const totalVal = (products || []).reduce(
                (s, p) => s + ((Number(p.price) || 0) * (Number(p.stock) || 0)),
                0
              )
              return `₹ ${Number(totalVal).toLocaleString('en-IN', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
              })}`
            })()}
          </div>
          <div className="kpi-meta">inventory value</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Average Price</div>
          <div className="kpi-value">
            {(() => {
              const totalVal = (products || []).reduce((s, p) => s + (Number(p.price) || 0), 0)
              const avg = products.length ? totalVal / products.length : 0
              return `₹ ${Number(avg).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
            })()}
          </div>
          <div className="kpi-meta">per product</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">New Products</div>
          <div className="kpi-value">
            {(() => {
              try {
                const now = Date.now()
                const days30 = 1000 * 60 * 60 * 24 * 30
                const count = (products || []).filter(
                  it => it.created_at && (now - new Date(it.created_at).getTime()) <= days30
                ).length
                return count
              } catch (e) { return 0 }
            })()}
          </div>
          <div className="kpi-meta">last 30 days</div>
        </div>
      </div>

      {loading && (
        <div className="app-loader">
          <div>
            <div className="loader" aria-hidden></div>
            <div className="loader-text">Loading products…</div>
          </div>
        </div>
      )}
      {error && <div className="error">{error}</div>}

      {!loading && !error && (
        <div className="card">
          <div style={{ padding: '12px 16px' }}>
            <ListControls
              searchValue={query}
              onSearchChange={v => { setQuery(v); setPage(1) }}
            />
          </div>
          <div className="table-wrap">
            <table className="products-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>SL</th>
                  <th>Product ID</th>
                  <th>SKU</th>
                  <th>HSN</th>
                  <th>Name</th>
                  <th>MRP</th>
                  <th>Selling Price</th>
                  <th>Tax %</th>
                  <th>Stock</th>
                  <th>Unit</th>
                  <th>Repack</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && (
                  <tr><td colSpan={13}>No products found</td></tr>
                )}
                {filtered.map((p, i) => (
                  <React.Fragment key={p.id}>
                    <tr>
                      <td style={{ textAlign: 'center' }}>
                        {p && (
                          <button className="btn small" onClick={() => toggleVariants(p)}>
                            {expanded[p.id] ? '▾' : '▸'}
                          </button>
                        )}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        {((page || 1) - 1) * (entries || 10) + i + 1}
                      </td>
                      <td style={{ fontSize: 12, color: 'var(--color-muted)' }}>{p.store_seq ?? ''}</td>
                      <td>{p.sku}</td>
                      <td>{p.hsn ?? ''}</td>
                      <td>{p.name}</td>
                      <td>{p.mrp ?? ''}</td>
                      <td>{p.price ?? ''}</td>
                      <td>{p.tax_percent != null ? `${p.tax_percent}%` : ''}</td>
                      <td>{p.stock ?? 0}</td>
                      <td>{p.unit ?? ''}</td>
                      <td style={{ textAlign: 'center' }}>
                        {p.is_repacking ? <span className="badge-repack">Yes</span> : ''}
                      </td>
                      <td>
                        <button className="btn small" onClick={() => setEditing(p)}>Edit</button>
                      </td>
                    </tr>
                    {expanded[p.id] && (variantsMap[p.id] || []).map((v) => (
                      <tr key={`v-${v.id}`} className="variant-row">
                        <td></td>
                        <td></td>
                        <td></td>
                        <td style={{ paddingLeft: 24 }}>{p.sku}</td>
                        <td>{p.hsn ?? ''}</td>
                        <td>{p.name}</td>
                        <td>{v.mrp == null ? '' : v.mrp}</td>
                        <td>{v.price ?? ''}</td>
                        <td>{v.tax_percent != null ? `${v.tax_percent}%` : ''}</td>
                        <td>{v.stock ?? 0}</td>
                        <td>{v.unit ?? ''}</td>
                        <td></td>
                        <td>
                          <button
                            className="btn small"
                            onClick={() =>
                              setEditing(Object.assign({}, p, {
                                variant_id: v.id,
                                mrp: v.mrp,
                                price: v.price,
                                tax_percent: v.tax_percent,
                                stock: v.stock,
                                unit: v.unit,
                                barcode: v.barcode
                              }))
                            }
                          >
                            Edit
                          </button>
                        </td>
                      </tr>
                    ))}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ padding: '8px 16px' }}>
            <PaginationFooter
              total={total}
              page={page}
              pageSize={entries}
              onPageChange={p => setPage(p)}
              onPageSizeChange={s => { setEntries(s); setPage(1) }}
            />
          </div>
        </div>
      )}

      {/* Create product modal */}
      {showCreate && (
        <ProductModal
          onClose={() => setShowCreate(false)}
          onCreated={async (created) => {
            setShowCreate(false)
            if (created && created.id) { setProducts(ps => [created, ...ps]) }
            else { await fetchProducts() }
          }}
        />
      )}

      {/* Edit product modal */}
      {editing && (
        <ProductModal
          product={editing}
          onClose={() => setEditing(null)}
          onCreated={async (updated) => {
            setEditing(null)
            if (updated && updated.id) {
              setProducts(ps => ps.map(p => p.id === updated.id ? updated : p))
            } else {
              await fetchProducts()
            }
          }}
        />
      )}

      {/* Import preview modal */}
      {showImport && (
        <ImportPreviewModal
          rows={previewRows}
          onClose={() => { setShowImport(false); setPreviewRows([]) }}
          onImported={async (result) => {
            setShowImport(false)
            setPreviewRows([])
            await fetchProducts()
            try { alert('Import completed: ' + (result && result.summary ? JSON.stringify(result.summary) : 'done')) } catch (e) {}
          }}
        />
      )}
    </div>
  )
}

function ProductModal({ onClose, onCreated, product }) {
  const [name, setName] = useState(product?.name || '')
  const [sku, setSku] = useState(product?.sku || '')
  const [mrp, setMrp] = useState(product?.mrp ?? '')
  const [price, setPrice] = useState(product?.price ?? '')
  const [unit, setUnit] = useState(product?.unit || 'KG')
  const [taxPercent, setTaxPercent] = useState(product?.tax_percent ?? 0)
  const [stock, setStock] = useState(product?.stock ?? 0)
  const [hsn, setHsn] = useState(product?.hsn || '')
  const [isRepacking, setIsRepacking] = useState(!!product?.is_repacking)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [skuExists, setSkuExists] = useState(false)
  const skuTimer = React.useRef()

  async function save() {
    setError(null)
    if (!name) return setError('Name is required')
    if (skuExists) return setError('Barcode/SKU already exists')
    setSaving(true)
    try {
      let r
      if (product && product.id) {
        if (product.variant_id) {
          r = await api.put(`/products/variants/${product.variant_id}`, {
            mrp: mrp || null, price: price || null, unit, tax_percent: taxPercent, stock, barcode: sku || null
          })
        } else {
          r = await api.put(`/products/${product.id}`, {
            name, sku, mrp: mrp || null, price: price || null, unit, tax_percent: taxPercent, stock, is_repacking: isRepacking, hsn: hsn || null
          })
        }
      } else {
        r = await api.post('/products', {
          name, sku, mrp: mrp || null, price: price || null, unit, tax_percent: taxPercent, stock, is_repacking: isRepacking, hsn: hsn || null
        })
      }
      if (onCreated) {
        if (r && r.data) await onCreated(r.data)
        else await onCreated()
      }
    } catch (err) {
      setError(product ? 'Failed to update product/variant' : 'Failed to create product')
    } finally {
      setSaving(false)
    }
  }

  useEffect(() => {
    // debounce sku existence check
    clearTimeout(skuTimer.current)
    const s = (sku || '').toString().trim()
    if (!s) { setSkuExists(false); return }
    skuTimer.current = setTimeout(async () => {
      try {
        const r = await api.get('/products', { params: { q: s, limit: 10 } })
        const list = (r.data && Array.isArray(r.data.data)) ? r.data.data : (Array.isArray(r.data) ? r.data : [])
        const found = list.find(p => (p.sku || '').toString().toLowerCase() === s.toLowerCase())
        if (found && (!product || found.id !== product.id)) setSkuExists(true)
        else setSkuExists(false)
      } catch (e) { setSkuExists(false) }
    }, 300)
    return () => clearTimeout(skuTimer.current)
  }, [sku, product])

  return (
    <div className="modal-backdrop">
      <div className="modal">
        <h3>{product ? 'Edit product' : 'Create product'}</h3>
        {error && <div className="error">{error}</div>}

        <label className="field">
          <span className="field-label">Name</span>
          <input type="text" value={name} onChange={e => setName(e.target.value)} />
        </label>

        <label className="field">
          <span className="field-label">Barcode / SKU</span>
          <input type="text" value={sku} onChange={e => setSku(e.target.value)} />
        </label>
        {skuExists && <div className="error">Barcode/SKU already exists</div>}

        <label className="field">
          <span className="field-label">HSN</span>
          <input type="text" value={hsn} onChange={e => setHsn(e.target.value)} />
        </label>

        <div className="row">
          <div className="col">
            <label className="field">
              <span className="field-label">MRP</span>
              <input value={mrp} onChange={e => setMrp(e.target.value)} type="number" step="0.01" />
            </label>
          </div>
          <div className="col">
            <label className="field">
              <span className="field-label">Selling price</span>
              <input value={price} onChange={e => setPrice(e.target.value)} type="number" step="0.01" />
            </label>
          </div>
        </div>

        <div className="row">
          <div className="col">
            <label className="field">
              <span className="field-label">Unit</span>
              <select value={unit} onChange={e => setUnit(e.target.value)}>
                <option>KG</option>
                <option>G</option>
                <option>Nos</option>
                <option>L</option>
                <option>ML</option>
              </select>
            </label>
          </div>
          <div className="col">
            <label className="field">
              <span className="field-label">Tax %</span>
              <select value={taxPercent} onChange={e => setTaxPercent(Number(e.target.value))}>
                <option value={0}>0%</option>
                <option value={5}>5%</option>
                <option value={12}>12%</option>
                <option value={18}>18%</option>
                <option value={28}>28%</option>
                <option value={40}>40%</option>
              </select>
            </label>
          </div>
        </div>

        <label className="field">
          <span className="field-label">Stock</span>
          <input value={stock} onChange={e => setStock(Number(e.target.value))} type="number" min="0" />
        </label>

        <label className="field">
          <span className="field-label" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            Repacking item?
            <input
              type="checkbox"
              style={{ width: 14, height: 14, margin: 0, verticalAlign: 'middle', transform: 'scale(0.92)' }}
              checked={isRepacking}
              onChange={e => setIsRepacking(!!e.target.checked)}
            />
          </span>
        </label>

        <div className="actions">
          <button className="btn cancel" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="btn primary" onClick={save} disabled={saving}>
            {saving ? 'Saving…' : (product ? 'Save' : 'Create')}
          </button>
        </div>
      </div>
    </div>
  )
}

function ImportPreviewModal({ rows, onClose, onImported }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [jobId, setJobId] = useState(null)
  const [progress, setProgress] = useState({ percent: 0, processed: 0, total: rows.length, success: 0, errors: 0, status: null })
  const pollRef = React.useRef(null)

  async function doImport() {
    setError(null)
    setLoading(true)
    try {
      const r = await api.post('/products/import-json', { items: rows })
      if (!r || !r.data || !r.data.jobId) {
        throw new Error('No jobId returned')
      }
      const id = r.data.jobId
      setJobId(id)
      // start polling
      pollRef.current = setInterval(async () => {
        try {
          const s = await api.get(`/products/import-status/${id}`)
          if (s && s.data && s.data.ok) {
            const d = s.data
            setProgress({ percent: d.percent || 0, processed: d.processed || 0, total: d.total || rows.length, success: d.success || 0, errors: d.errors || 0, status: d.status })
            if (d.status && d.status !== 'running') {
              clearInterval(pollRef.current)
              pollRef.current = null
              setLoading(false)
              // return final job data
              if (onImported) onImported({ summary: { total: d.total, processed: d.processed, success: d.success, errors: d.errors }, results: d.results, status: d.status })
            }
          }
        } catch (e) {
          // keep polling; if persistent error, show message
          console.error('poll error', e)
        }
      }, 800)
    } catch (e) {
      console.error('Import failed', e)
      setError((e && e.response && e.response.data && e.response.data.error) || (e && e.message) || 'Import failed')
      setLoading(false)
    } finally { setLoading(false) }
  }

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [])

  return (
    <div className="modal-backdrop">
      <div className="modal large">
        <h3>Preview product import ({rows.length} rows)</h3>
        {error && <div className="error">{error}</div>}
        <div style={{ maxHeight: 320, overflow: 'auto', border: '1px solid #eee', padding: 8 }}>
          <table className="products-table" style={{ width: '100%' }}>
            <thead>
              <tr><th>#</th><th>SKU</th><th>Name</th><th>MRP</th><th>Price</th><th>Tax%</th><th>Stock</th></tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}><td>{i+1}</td><td>{r.sku}</td><td>{r.name}</td><td>{r.mrp}</td><td>{r.price}</td><td>{r.tax_percent}</td><td>{r.stock}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ marginTop: 12 }}>
          {jobId ? (
            <div>
              <div style={{ marginBottom: 8 }}>Import progress: {progress.percent}% — {progress.processed}/{progress.total} processed</div>
              <div style={{ height: 10, background: '#eee', borderRadius: 4 }}>
                <div style={{ width: `${progress.percent}%`, height: '100%', background: '#06f', borderRadius: 4 }} />
              </div>
              <div style={{ marginTop: 8 }}>Succeeded: {progress.success} • Errors: {progress.errors}</div>
              <div className="actions" style={{ marginTop: 10 }}>
                <button className="btn cancel" onClick={() => { if (pollRef.current) clearInterval(pollRef.current); onClose && onClose() }} disabled={loading}>Close</button>
              </div>
            </div>
          ) : (
            <div className="actions">
              <button className="btn cancel" onClick={onClose} disabled={loading}>Cancel</button>
              <button className="btn primary" onClick={doImport} disabled={loading}>{loading ? 'Starting…' : 'Import'}</button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
