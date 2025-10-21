#!/usr/bin/env node
// migrate-products-to-variants.js
// Safe, idempotent helper to convert existing products into product_variants.
// Usage:
//   node migrate-products-to-variants.js          # dry-run (no DB writes)
//   node migrate-products-to-variants.js --apply  # apply changes
//   node migrate-products-to-variants.js --limit 10  # limit groups processed (dry-run unless --apply)

const { Pool } = require('pg')
const yargs = require('yargs')
const path = require('path')
require('dotenv').config({ path: path.join(__dirname, '..', '.env') })

const argv = yargs.option('apply', { type: 'boolean', description: 'Apply changes (default: dry-run)' })
  .option('limit', { type: 'number', description: 'Limit number of SKU groups processed (for staged runs)' })
  .help().argv

const APPLY = !!argv.apply
const LIMIT = argv.limit || null

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set. Aborting.')
  process.exit(1)
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL })

async function run() {
  const client = await pool.connect()
  try {
    console.log('Starting migrate-products-to-variants', APPLY ? '(APPLY MODE)' : '(dry-run)')

    // Ensure product_variants table exists
    const pvExists = await client.query("SELECT to_regclass('public.product_variants') as exists")
    if (!pvExists.rows[0].exists) {
      throw new Error('product_variants table does not exist. Please run schema migrations first.')
    }

    // First handle products with non-null SKU grouped by store + lower(sku)
    const groupsQ = `
      SELECT store_id, lower(sku) AS sku_key, array_agg(id ORDER BY id) AS ids, count(*) as cnt
      FROM products
      WHERE sku IS NOT NULL
      GROUP BY store_id, lower(sku)
      ORDER BY store_id NULLS FIRST, sku_key
    `
    let groups = (await client.query(groupsQ)).rows
    if (LIMIT) groups = groups.slice(0, LIMIT)

    console.log(`Found ${groups.length} SKU groups to process (sku != null).`)

    let totalVariantsCreated = 0
    let totalItemsUpdated = 0

    for (const g of groups) {
      const ids = g.ids.map(Number)
      const masterId = ids[0]
      console.log(`\nProcessing SKU group store_id=${g.store_id} sku_key=${g.sku_key} master=${masterId} count=${ids.length}`)

      for (const pid of ids) {
        // process each product row: create or upsert a variant on masterId + mrp
        await client.query('BEGIN')
        try {
          const pr = await client.query('SELECT id, sku, mrp, price, unit, tax_percent, stock, store_id FROM products WHERE id = $1 FOR UPDATE', [pid])
          if (pr.rows.length === 0) {
            console.warn('Product not found', pid)
            await client.query('ROLLBACK')
            continue
          }
          const p = pr.rows[0]
          const mrp = p.mrp === null ? null : Number(p.mrp)
          const price = p.price === null ? null : Number(p.price)
          const unit = p.unit || null
          const tax = p.tax_percent != null ? Number(p.tax_percent) : null
          const stock = Number(p.stock || 0)

          console.log(` Product ${pid}: mrp=${mrp} price=${price} stock=${stock}`)

          if (!APPLY) {
            // dry-run: show what we'd do
            console.log(`  DRY-RUN: would upsert variant for master=${masterId}, mrp=${mrp}, stock=${stock}`)
            console.log(`  DRY-RUN: would update purchase_items/sale_items replacing product_id ${pid} -> variant_id(lookup)`) 
            await client.query('ROLLBACK')
            continue
          }

          // Apply: create/upsert variant and capture its id
          // Determine insStock: include product.stock (legacy) so variant starts with existing stock
          const insStock = stock

          const insSql = `
            INSERT INTO product_variants (product_id, mrp, price, unit, tax_percent, stock)
            VALUES ($1,$2,$3,$4,$5,$6)
            ON CONFLICT (product_id, mrp) DO UPDATE
              SET price = COALESCE(product_variants.price, EXCLUDED.price),
                  unit = COALESCE(product_variants.unit, EXCLUDED.unit),
                  tax_percent = COALESCE(product_variants.tax_percent, EXCLUDED.tax_percent),
                  stock = product_variants.stock + EXCLUDED.stock
            RETURNING id
          `
          const insRes = await client.query(insSql, [masterId, mrp, price, unit, tax, insStock])
          const variantId = insRes.rows[0].id
          totalVariantsCreated++

          // Update purchase_items and sale_items rows that reference this old product id
          const updPurch = await client.query('UPDATE purchase_items SET variant_id = $1 WHERE product_id = $2 RETURNING id', [variantId, pid])
          // Conditionally update sale_items.variant_id if the column exists in the schema
          let updSales = { rowCount: 0 }
          const saleVariantCol = await client.query("SELECT to_regclass('public.sale_items') IS NOT NULL AS table_exists, EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='sale_items' AND column_name='variant_id') AS has_variant_col")
          if (saleVariantCol.rows[0].table_exists && saleVariantCol.rows[0].has_variant_col) {
            updSales = await client.query('UPDATE sale_items SET variant_id = $1 WHERE product_id = $2 RETURNING id', [variantId, pid])
          }

          // Zero out product.stock now that its quantity moved into variant
          await client.query('UPDATE products SET stock = 0 WHERE id = $1', [pid])

          await client.query('COMMIT')

          console.log(`  Applied: created/updated variant ${variantId} for product ${pid}. purchase_items updated: ${updPurch.rowCount} sale_items updated: ${updSales.rowCount}`)
          totalItemsUpdated += updPurch.rowCount + updSales.rowCount
        } catch (err) {
          console.error('  Error processing product', pid, err && err.message)
          try { await client.query('ROLLBACK') } catch (e) {}
          // continue with next product
        }
      }
    }

    // Handle products with NULL SKU individually (treat each product as its own group)
    const nullSkuRes = await client.query('SELECT id FROM products WHERE sku IS NULL')
    if (nullSkuRes.rows.length > 0) {
      console.log(`\nFound ${nullSkuRes.rows.length} products with NULL SKU. Processing individually.`)
      for (const r of nullSkuRes.rows) {
        const pid = r.id
        await client.query('BEGIN')
        try {
          const pr = await client.query('SELECT id, mrp, price, unit, tax_percent, stock FROM products WHERE id = $1 FOR UPDATE', [pid])
          if (pr.rows.length === 0) { await client.query('ROLLBACK'); continue }
          const p = pr.rows[0]
          const mrp = p.mrp === null ? null : Number(p.mrp)
          const price = p.price === null ? null : Number(p.price)
          const unit = p.unit || null
          const tax = p.tax_percent != null ? Number(p.tax_percent) : null
          const stock = Number(p.stock || 0)

          if (!APPLY) {
            console.log(`  DRY-RUN product ${pid}: would upsert variant (master=${pid}) mrp=${mrp} stock=${stock}`)
            await client.query('ROLLBACK')
            continue
          }

          const insRes = await client.query(
            `INSERT INTO product_variants (product_id, mrp, price, unit, tax_percent, stock)
             VALUES ($1,$2,$3,$4,$5,$6)
             ON CONFLICT (product_id, mrp) DO UPDATE SET stock = product_variants.stock + EXCLUDED.stock
             RETURNING id`,
            [pid, mrp, price, unit, tax, stock]
          )
          const vid = insRes.rows[0].id
          await client.query('UPDATE products SET stock = 0 WHERE id = $1', [pid])
          await client.query('UPDATE purchase_items SET variant_id = $1 WHERE product_id = $2', [vid, pid])
          await client.query('COMMIT')
          console.log(`  Applied: variant ${vid} created for product ${pid}`)
          totalVariantsCreated++
        } catch (err) {
          console.error('  Error processing null-sku product', pid, err && err.message)
          try { await client.query('ROLLBACK') } catch (e) {}
        }
      }
    }

    console.log('\nMigration summary:')
    console.log(' totalVariantsTouched:', totalVariantsCreated)
    console.log(' totalPurchaseItemsUpdated:', totalItemsUpdated)
    console.log('\nDone.')
  } finally {
    client.release()
    await pool.end()
  }
}

run().catch((err) => {
  console.error('Fatal error', err)
  process.exit(1)
})
