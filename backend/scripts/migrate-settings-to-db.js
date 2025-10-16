#!/usr/bin/env node
// Simple migration script: read data/settings.json and upsert into store_settings (id=1)
const fs = require('fs')
const path = require('path')
const db = require('../src/db')

const DATA_DIR = path.join(__dirname, '..', 'data')
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json')

async function run() {
  if (!fs.existsSync(SETTINGS_FILE)) {
    console.log('No settings.json found, nothing to migrate')
    process.exit(0)
  }
  const raw = fs.readFileSync(SETTINGS_FILE, 'utf8')
  let obj = {}
  try { obj = JSON.parse(raw) } catch (e) { console.error('failed to parse settings.json', e); process.exit(1) }

  const createQ = `
    CREATE TABLE IF NOT EXISTS store_settings (
      id integer PRIMARY KEY,
      name text,
      address text,
      contact text,
      gst_id text,
      website text,
      tax_rate numeric,
      timezone text,
      hours jsonb,
      logo_url text,
      created_at timestamptz DEFAULT now(),
      updated_at timestamptz DEFAULT now()
    );
  `

  const upsertQ = `
    INSERT INTO store_settings (id,name,address,contact,gst_id,website,tax_rate,timezone,hours,logo_url,updated_at)
    VALUES (1,$1,$2,$3,$4,$5,$6,$7,$8,$9,now())
    ON CONFLICT (id) DO UPDATE SET
      name=EXCLUDED.name, address=EXCLUDED.address, contact=EXCLUDED.contact,
      gst_id=EXCLUDED.gst_id, website=EXCLUDED.website, tax_rate=EXCLUDED.tax_rate,
      timezone=EXCLUDED.timezone, hours=EXCLUDED.hours, logo_url=EXCLUDED.logo_url,
      updated_at=now()
  `
  const params = [
    obj.name || null,
    obj.address || null,
    obj.contact || null,
    obj.gst_id || null,
    obj.website || null,
    obj.tax_rate || null,
    obj.timezone || null,
    obj.hours ? JSON.stringify(obj.hours) : null,
    obj.logo_url || null
  ]
  try {
    await db.query(createQ)
    await db.query(upsertQ, params)
    console.log('Migration complete')
    process.exit(0)
  } catch (e) {
    console.error('Migration failed', e)
    process.exit(2)
  }
}

run()
