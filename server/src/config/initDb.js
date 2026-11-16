const fs = require('fs');
const path = require('path');
const db = require('./db');

const SCHEMA_MIGRATIONS = [
  '001_initial_schema.sql',
  '003_invitations_and_departments.sql',
  '004_v2_features.sql',
  '005_code_and_meetings.sql',
];

/**
 * Ensure required schema migrations exist on fresh or upgraded databases.
 * Demo seed data (002_seed_data.sql) only runs when explicitly requested in non-production.
 */
async function ensureDatabaseReady() {
  const check = await db.query(
    `SELECT to_regclass('public.users') AS users_tbl,
            to_regclass('public.invitations') AS invitations_tbl,
            to_regclass('public.document_snapshots') AS snapshots_tbl,
            to_regclass('public.code_files') AS code_files_tbl,
            to_regclass('public.meetings') AS meetings_tbl`
  );
  const {
    users_tbl,
    invitations_tbl,
    snapshots_tbl,
    code_files_tbl,
    meetings_tbl,
  } = check.rows[0] || {};
  if (users_tbl && invitations_tbl && snapshots_tbl && code_files_tbl && meetings_tbl) {
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
      console.log('🗄️ Initialized database schema (001 + 003 + 004 + 005).');

      if (process.env.SEED_DEMO_DATA === 'true') {
        const seedSql = fs.readFileSync(path.join(migrationsDir, '002_seed_data.sql'), 'utf8');
        await client.query(seedSql);
        console.log('🌱 Seeded demo data (SEED_DEMO_DATA=true).');
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
      if (!code_files_tbl || !meetings_tbl) {
        const sql005 = fs.readFileSync(
          path.join(migrationsDir, '005_code_and_meetings.sql'),
          'utf8'
        );
        await client.query(sql005);
        console.log('🗄️ Applied 005_code_and_meetings.sql migration.');
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
