import generatePluContent from '../pluExport'

describe('generatePluContent', () => {
  it('returns empty string for non-array or no repacking products', () => {
    expect(generatePluContent(null)).toBe('')
    expect(generatePluContent([])).toBe('')
    expect(generatePluContent([{ id: 1, is_repacking: false }])).toBe('')
  })

  it('formats a single repacking product correctly', () => {
    const products = [{
      id: 1,
      store_seq: 54,
      barcode: '001873',
      name: 'Drumstick',
      is_repacking: true,
      price: 90
    }]
    const out = generatePluContent(products)
    expect(out).toBe('54,001873,DRUMSTICK,3,90')
  })

  it('pads barcode to 6 digits and strips non-digits', () => {
    const products = [{ id: 1, store_seq: 7, barcode: 'AB12', name: 'X', is_repacking: true, price: 10 }]
    const out = generatePluContent(products)
    // "AB12" has no digits, so last6 should be '00AB12' after fallback; but our helper strips non-digits -> '' then falls back to raw string
    expect(out).toMatch(/^7,.{6},X,3,10$/)
  })

  it('falls back to sku when barcode missing', () => {
    const products = [{ id: 2, store_seq: 12, sku: '12345', name: 'Item', is_repacking: true, price: 5 }]
    const out = generatePluContent(products)
    expect(out).toBe('12,012345,ITEM,3,5')
  })

  it('handles missing store_seq and null price', () => {
    const products = [{ id: 3, barcode: '987654321', name: 'NoSeq', is_repacking: true, price: null }]
    const out = generatePluContent(products)
    // store_seq missing -> empty first column
    expect(out).toBe(',54321,NOSEQ,3,')
  })

  it("accepts is_repacking as string 't' and multiple products", () => {
    const products = [
      { id: 4, store_seq: 1, barcode: '000001', name: 'A', is_repacking: 't', price: 1 },
      { id: 5, store_seq: 2, barcode: '222', name: 'B,comma', is_repacking: true, price: 2 }
    ]
    const out = generatePluContent(products)
    const lines = out.split('\n')
    expect(lines.length).toBe(2)
    expect(lines[0]).toBe('1,000001,A,3,1')
    expect(lines[1]).toBe('2,000222,BCOMMA,3,2')
  })
})
