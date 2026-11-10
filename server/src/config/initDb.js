const fs = require('fs');
const path = require('path');
const db = require('./db');

const SCHEMA_MIGRATIONS = [
  '001_initial_schema.sql',
  '003_invitations_and_departments.sql',
  '004_v2_features.sql',
];

/**
 * Ensure required schema migrations exist on fresh or upgraded databases.
 * Demo seed data (002_seed_data.sql) only runs when explicitly requested in non-production.
 */
async function ensureDatabaseReady() {
  const check = await db.query(
    `SELECT to_regclass('public.users') AS users_tbl,
            to_regclass('public.invitations') AS invitations_tbl,
            to_regclass('public.document_snapshots') AS snapshots_tbl`
  );
  const { users_tbl, invitations_tbl, snapshots_tbl } = check.rows[0] || {};
  if (users_tbl && invitations_tbl && snapshots_tbl) {
    return false;
  }

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const migrationsDir = path.resolve(__dirname, '../../migrations');

    if (!users_tbl) {
      for (const file of SCHEMA_MIGRATIONS) {
        const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
        await client.query(sql);
      }
      console.log('🗄️ Initialized database schema (001 + 003 + 004).');

      if (process.env.NODE_ENV !== 'production' && process.env.SEED_DEMO_DATA === 'true') {
        const seedSql = fs.readFileSync(path.join(migrationsDir, '002_seed_data.sql'), 'utf8');
        await client.query(seedSql);
        console.log('🌱 Seeded local demo data (SEED_DEMO_DATA=true).');
      }
    } else {
      if (!invitations_tbl) {
        const sql003 = fs.readFileSync(
          path.join(migrationsDir, '003_invitations_and_departments.sql'),
          'utf8'
        );
        await client.query(sql003);
        console.log('🗄️ Applied 003_invitations_and_departments.sql migration.');
      }
      if (!snapshots_tbl) {
        const sql004 = fs.readFileSync(
          path.join(migrationsDir, '004_v2_features.sql'),
          'utf8'
        );
        await client.query(sql004);
        console.log('🗄️ Applied 004_v2_features.sql migration.');
      }
    }

    await client.query('COMMIT');
    return true;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = {
  ensureDatabaseReady,
};
