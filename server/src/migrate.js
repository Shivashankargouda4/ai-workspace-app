const fs = require('fs');
const path = require('path');
const { pool } = require('./config/db');

async function runMigrations() {
  console.log('🔄 Connecting to PostgreSQL database...');
  const client = await pool.connect();
  try {
    console.log('✅ Connected successfully!');

    // Read and run schema
    const schemaPath = path.join(__dirname, '..', 'migrations', '001_initial_schema.sql');
    const schemaSql = fs.readFileSync(schemaPath, 'utf8');
    console.log('📦 Executing 001_initial_schema.sql (16 tables)...');
    await client.query(schemaSql);
    console.log('✅ 16 Tables and indexes created successfully!');

    // Read and run seed data
    const seedPath = path.join(__dirname, '..', 'migrations', '002_seed_data.sql');
    const seedSql = fs.readFileSync(seedPath, 'utf8');
    console.log('🌱 Executing 002_seed_data.sql...');
    await client.query(seedSql);
    console.log('✅ Seed data inserted successfully!');

    console.log('🎉 Database migration complete!');
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
  } finally {
    client.release();
    await pool.end();
  }
}

runMigrations();
