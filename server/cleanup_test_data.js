// Safe cleanup script for leftover automated-test users, organizations, and uploaded test files.
// Runs in DRY-RUN mode by default. Pass `--apply` to actually delete.
// Always take a backup first: pg_dump -U postgres workspace_app > backup.sql
const fs = require('fs');
const path = require('path');
const db = require('./src/config/db');

const TEST_EMAIL_PATTERNS = [
  'auth_test_%',
  'lead_%',
  'alice_%',
  'bob_%',
  'analyst_%',
  'tenant_a_%',
  'tenant_b_%',
];

const PROTECTED_EMAILS = [
  'admin@workspace.local',
  'priya@workspace.local',
  'rahul@workspace.local',
];

async function runCleanup() {
  const applyChanges = process.argv.includes('--apply');
  console.log('==================================================');
  console.log(`  DEMO DATABASE CLEANUP (${applyChanges ? 'APPLY MODE' : 'DRY-RUN PREVIEW'})`);
  console.log('==================================================\n');

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Identify matching test users while explicitly protecting demo accounts
    const usersRes = await client.query(
      `SELECT id, name, email
       FROM users
       WHERE email LIKE ANY($1::text[])
         AND email != ALL($2::text[])
       ORDER BY id ASC`,
      [TEST_EMAIL_PATTERNS, PROTECTED_EMAILS]
    );
    const testUsers = usersRes.rows;
    const testUserIds = testUsers.map((u) => u.id);

    // 2. Identify test organizations created by those users (never touching Org 1)
    let testOrgs = [];
    if (testUserIds.length > 0) {
      const orgsRes = await client.query(
        `SELECT id, name, slug, created_by
         FROM organizations
         WHERE id != 1 AND created_by = ANY($1::int[])
         ORDER BY id ASC`,
        [testUserIds]
      );
      testOrgs = orgsRes.rows;
    }
    const testOrgIds = testOrgs.map((o) => o.id);

    // 3. Identify uploaded files from test users/orgs or repeated test_files.js runs
    const filesRes = await client.query(
      `SELECT id, org_id, name, path, uploaded_by
       FROM files
       WHERE org_id = ANY($1::int[])
          OR uploaded_by = ANY($2::int[])
          OR name = 'project_specification.txt'
       ORDER BY id ASC`,
      [testOrgIds, testUserIds]
    );
    const testFiles = filesRes.rows;

    // Show preserved core demo accounts
    const keptRes = await client.query(
      `SELECT id, name, email FROM users WHERE email = ANY($1::text[]) ORDER BY id ASC`,
      [PROTECTED_EMAILS]
    );
    console.log('Preserved core demo accounts:');
    keptRes.rows.forEach((u) => console.log(`  [KEEP] ID ${u.id}: ${u.name} (${u.email})`));

    console.log(`\nMatched test users to remove (${testUsers.length}):`);
    testUsers.forEach((u) => console.log(`  [DEL]  ID ${u.id}: ${u.name} (${u.email})`));

    console.log(`\nMatched test organizations to remove (${testOrgs.length}):`);
    testOrgs.forEach((o) => console.log(`  [DEL]  ID ${o.id}: ${o.name} (${o.slug})`));

    console.log(`\nMatched uploaded test files to remove (${testFiles.length}):`);
    testFiles.forEach((f) => console.log(`  [DEL]  ID ${f.id}: ${f.name} (${f.path}, org_id=${f.org_id})`));

    if (!applyChanges) {
      await client.query('ROLLBACK');
      console.log('\nDry run complete (no rows modified).');
      console.log('To execute after taking pg_dump backup, run: node cleanup_test_data.js --apply');
      return;
    }

    // Delete in FK-safe order
    if (testFiles.length > 0) {
      const fileIds = testFiles.map((f) => f.id);
      await client.query('DELETE FROM files WHERE id = ANY($1::int[])', [fileIds]);
    }
    if (testOrgIds.length > 0) {
      await client.query('DELETE FROM organizations WHERE id = ANY($1::int[])', [testOrgIds]);
    }
    if (testUserIds.length > 0) {
      await client.query('DELETE FROM users WHERE id = ANY($1::int[])', [testUserIds]);
    }

    await client.query('COMMIT');
    console.log('\n✅ Database cleanup committed.');

    // Remove physical upload files only after DB commit succeeds
    let removedDiskFiles = 0;
    for (const f of testFiles) {
      if (!f.path) continue;
      const diskPath = path.join(__dirname, 'uploads', path.basename(f.path));
      if (fs.existsSync(diskPath)) {
        fs.unlinkSync(diskPath);
        removedDiskFiles++;
      }
    }
    console.log(`✅ Removed ${removedDiskFiles} physical test file(s) from server/uploads/.`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Cleanup failed (rolled back):', err);
    process.exitCode = 1;
  } finally {
    client.release();
    await db.pool.end();
  }
}

runCleanup();
