(async ()=>{
  try {
    const s = require('../src/routes/settings')
    console.log('module keys', Object.keys(s))
    if (typeof s.writeSettingsToDB !== 'function') {
      console.error('writeSettingsToDB not exported')
      process.exit(2)
    }
    const payload = {
      name: "Nani's Spice Farm",
      address: 'trivandrum',
      contact: '9876543210',
      timezone: 'Asia/Calcutta',
      logo_url: '/uploads/1760605794637-Spice_Farm__2_.png',
      hours: { mon: '9-5' },
      _store_id: null
    }
    const ok = await s.writeSettingsToDB(payload)
    console.log('writeSettingsToDB result:', ok)
    process.exit(0)
  } catch (e) {
    console.error('smoke failed', e)
    process.exit(1)
  }
})()
