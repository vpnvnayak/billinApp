// Helper to generate PLU.txt content from products array
// Exports a pure function: generatePluContent(products)
// Each line: product_store_seq,last6(barcode padded),NAME,3,price
export function generatePluContent(products) {
  if (!Array.isArray(products)) return ''
  const rows = products.filter(p => p && (p.is_repacking === true || p.is_repacking === 't'))
  if (!rows.length) return ''
  const lines = rows.map(r => {
    const productId = (r.store_seq !== undefined && r.store_seq !== null) ? String(r.store_seq) : ''
    const rawBarcode = (r.barcode || r.sku || '')
    const digits = (rawBarcode || '').toString().replace(/\D/g, '')
    let last6 = ''
    if (digits.length > 0) {
      last6 = digits.slice(-6).padStart(6, '0')
    } else {
      const s = (rawBarcode || '').toString()
      last6 = s.slice(-6).padStart(6, '0')
    }
    const name = (r.name || '').toString().replace(/,/g, '').toUpperCase()
    const fixedThree = '3'
    const price = (r.price == null) ? '' : String(r.price)
    return [productId, last6, name, fixedThree, price].join(',')
  })
  return lines.join('\n')
}

export default generatePluContent
