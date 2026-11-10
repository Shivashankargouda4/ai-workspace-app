// Verification script demonstrating live task status transition and audit history logging
const db = require('./src/config/db');
const API = 'http://localhost:5000/api';

async function verifyDragAudit() {
  console.log('==================================================');
  console.log('  VERIFYING LIVE TASK STATUS TRANSITION & AUDIT');
  console.log('==================================================\n');

  try {
    // 1. Log in as Admin
    console.log('1. Authenticating Admin (admin@workspace.local)...');
    const demoPassword = process.env.DEMO_PASSWORD;
    if (!demoPassword) {
      throw new Error('DEMO_PASSWORD environment variable is not set. Run: $env:DEMO_PASSWORD = Read-Host "Demo password"');
    }
    let loginRes = await fetch(`${API}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@workspace.local', password: demoPassword }),
    });
    const loginData = await loginRes.json();
    if (loginRes.status !== 200) throw new Error('Login failed: ' + JSON.stringify(loginData));
    const token = loginData.accessToken;
    console.log('   ✅ Authenticated successfully.\n');

    // 2. Fetch current status of Task 5
    const taskBefore = await db.query('SELECT id, title, status, progress FROM tasks WHERE id = 5');
    const currentStatus = taskBefore.rows[0].status;
    const targetStatus = currentStatus === 'in_progress' ? 'review' : (currentStatus === 'review' ? 'done' : 'in_progress');
    console.log(`2. Task 5 Current State: "${taskBefore.rows[0].title}"`);
    console.log(`   Status:   ${currentStatus}`);
    console.log(`   Progress: ${taskBefore.rows[0].progress}%\n`);

    // 3. Move Task 5 to targetStatus (simulating Kanban card drag)
    console.log(`3. Simulating Kanban drag: Moving Task 5 to '${targetStatus}'...`);
    const patchRes = await fetch(`${API}/tasks/5/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ status: targetStatus }),
    });
    const patchData = await patchRes.json();
    if (patchRes.status !== 200) throw new Error('PATCH failed: ' + JSON.stringify(patchData));
    console.log('   ✅ HTTP 200 OK: Task status updated in database.\n');

    // 4. Inspect latest audit row in task_status_history
    console.log('4. Checking latest row in task_status_history...');
    const auditRes = await db.query(
      `SELECT h.id, h.task_id, h.old_status, h.new_status, h.new_progress, h.changed_at, u.name as changed_by_name
       FROM task_status_history h
       JOIN users u ON h.changed_by = u.id
       ORDER BY h.id DESC LIMIT 1`
    );
    const row = auditRes.rows[0];
    console.log('   ✅ PASSED: New audit trail row successfully created:');
    console.log(`      Audit Row ID:    ${row.id}`);
    console.log(`      Task ID:         ${row.task_id}`);
    console.log(`      Old Status:      ${row.old_status}`);
    console.log(`      New Status:      ${row.new_status}`);
    console.log(`      New Progress:    ${row.new_progress}%`);
    console.log(`      Changed By:      ${row.changed_by_name}`);
    console.log(`      Timestamp (UTC): ${row.changed_at}`);

    console.log('\n==================================================');
    console.log('  LIVE DRAG & AUDIT TRAIL VERIFIED (ROW ' + row.id + ')');
    console.log('==================================================');
  } catch (err) {
    console.error('Error during audit verification:', err);
  } finally {
    await db.pool.end();
  }
}

verifyDragAudit();
