const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function run(){
  try{
    const r = await pool.query(`SELECT column_name FROM information_schema.columns WHERE table_name='customers' AND column_name='disabled'`);
    if(r.rows.length){
      console.log('disabled column exists in customers table')
      process.exit(0)
    } else {
      console.log('disabled column DOES NOT exist in customers table')
      process.exit(2)
    }
  } catch(err){
    console.error('error checking column:', err)
    process.exit(3)
  } finally {
    await pool.end()
  }
}

run();
