// Cross-tenant isolation security test for Tasks, Chat REST, Files, and Socket.IO
const fs = require('fs');
const path = require('path');
const { io } = require('../client/node_modules/socket.io-client');
const db = require('./src/config/db');

const API = 'http://localhost:5000/api';
const SOCKET_URL = 'http://localhost:5000';

async function req(method, endpoint, body = null, token = null, isFormData = false) {
  const headers = {};
  if (!isFormData) headers['Content-Type'] = 'application/json';
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API}${endpoint}`, {
    method,
    headers,
    body: isFormData ? body : (body ? JSON.stringify(body) : undefined),
  });

  const text = await res.text();
  let data = {};
  try {
    data = JSON.parse(text);
  } catch (e) {
    data = { raw: text };
  }
  return { status: res.status, data, text };
}

function connectSocket(token) {
  return new Promise((resolve, reject) => {
    const socket = io(SOCKET_URL, {
      auth: { token },
      transports: ['websocket'],
      reconnection: false,
    });
    const timer = setTimeout(() => {
      socket.disconnect();
      reject(new Error('Socket connection timed out'));
    }, 5000);
    socket.on('connect', () => {
      clearTimeout(timer);
      resolve(socket);
    });
    socket.on('connect_error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

async function runCrossTenantTests() {
  console.log('==================================================');
  console.log('  CROSS-TENANT ISOLATION TESTS (TASKS, CHAT, FILES, SOCKET)');
  console.log('==================================================\n');

  let failed = 0;
  let userAId = null;
  let userBId = null;
  let orgAId = null;
  let orgBId = null;
  let uploadedFilename = null;
  let socketA = null;
  let socketB = null;

  try {
    const ts = Date.now();

    // 1. Register User A & User B
    console.log('1. Registering User A and User B...');
    const regA = await req('POST', '/auth/register', {
      name: 'Tenant Test Alice',
      email: `tenant_a_${ts}@example.com`,
      password: 'Password@123',
    });
    if (regA.status !== 201) throw new Error('User A register failed: ' + JSON.stringify(regA.data));
    const tokenA = regA.data.accessToken;
    userAId = regA.data.user.id;

    const regB = await req('POST', '/auth/register', {
      name: 'Tenant Test Bob',
      email: `tenant_b_${ts}@example.com`,
      password: 'Password@123',
    });
    if (regB.status !== 201) throw new Error('User B register failed: ' + JSON.stringify(regB.data));
    const tokenB = regB.data.accessToken;
    userBId = regB.data.user.id;
    console.log(`   ✅ Registered User A (ID: ${userAId}) and User B (ID: ${userBId}).`);

    // 2. Create Organization A (for User A) and Organization B (for User B)
    console.log('2. Creating Org A (User A) and Org B (User B)...');
    const orgA = await req('POST', '/orgs', { name: 'Tenant Org A', slug: `tenant-org-a-${ts}` }, tokenA);
    if (orgA.status !== 201) throw new Error('Org A create failed: ' + JSON.stringify(orgA.data));
    orgAId = orgA.data.organization.id;
    const wsAId = orgA.data.defaultWorkspace.id;

    const orgB = await req('POST', '/orgs', { name: 'Tenant Org B', slug: `tenant-org-b-${ts}` }, tokenB);
    if (orgB.status !== 201) throw new Error('Org B create failed: ' + JSON.stringify(orgB.data));
    orgBId = orgB.data.organization.id;
    console.log(`   ✅ Created Org A (ID: ${orgAId}, Workspace: ${wsAId}) and Org B (ID: ${orgBId}).`);

    // Create a project in Org A workspace and find its default channel
    const projRes = await db.query(
      'INSERT INTO projects (workspace_id, org_id, name, created_by) VALUES ($1, $2, $3, $4) RETURNING id',
      [wsAId, orgAId, 'Org A Secret Project', userAId]
    );
    const projectAId = projRes.rows[0].id;

    const chanRes = await db.query(
      'SELECT id FROM channels WHERE workspace_id = $1 AND org_id = $2 ORDER BY id ASC LIMIT 1',
      [wsAId, orgAId]
    );
    const channelAId = chanRes.rows[0].id;
    console.log(`   ✅ Setup Org A Project ID: ${projectAId}, Channel ID: ${channelAId}.\n`);

    // 3. User A creates a Task, uploads a File, and sends a Socket Chat Message
    console.log('3. User A creating task, file, and chat message in Org A...');
    const taskRes = await req(
      'POST',
      '/tasks',
      {
        project_id: projectAId,
        title: `Secret Org A Task ${ts}`,
        priority: 'high',
        complexity: 5,
        estimated_days: 3,
      },
      tokenA
    );
    if (taskRes.status !== 201) throw new Error('Task create failed: ' + JSON.stringify(taskRes.data));
    const taskAId = taskRes.data.task.id;
    console.log(`   ✅ User A created Task ID: ${taskAId}`);

    const form = new FormData();
    const fileBody = `Confidential Org A Document ${ts}`;
    form.append('file', new Blob([fileBody], { type: 'text/plain' }), 'secret_org_a.txt');
    form.append('workspaceId', String(wsAId));
    form.append('orgId', String(orgAId));
    const fileRes = await req('POST', '/files/upload', form, tokenA, true);
    if (fileRes.status !== 201) throw new Error('File upload failed: ' + JSON.stringify(fileRes.data));
    const fileAId = fileRes.data.file.id;
    uploadedFilename = fileRes.data.file.path;
    console.log(`   ✅ User A uploaded File ID: ${fileAId} (org_id: ${fileRes.data.file.org_id})`);

    // Connect Socket A (User A) & Socket B (User B)
    socketA = await connectSocket(tokenA);
    socketB = await connectSocket(tokenB);

    let bobReceivedMessage = null;
    socketB.on('message:new', (msg) => {
      bobReceivedMessage = msg;
    });

    // User B tries to join User A's channel via Socket.IO
    socketA.emit('channel:join', { channelId: channelAId });
    socketB.emit('channel:join', { channelId: channelAId });
    await new Promise((r) => setTimeout(r, 300));

    const secretText = `Confidential Org A Socket Message ${ts}`;
    socketA.emit('message:send', { channelId: channelAId, content: secretText });
    await new Promise((r) => setTimeout(r, 800));

    const msgCheck = await db.query(
      'SELECT id, content FROM messages WHERE channel_id = $1 ORDER BY id DESC LIMIT 1',
      [channelAId]
    );
    if (msgCheck.rows.length === 0) throw new Error('User A socket message was not saved to DB');
    console.log(`   ✅ User A sent Chat Message ID: ${msgCheck.rows[0].id}\n`);

    // 4. Security Assertions: User B tries accessing User A's resources
    console.log('--- SECURITY CHECKS: User B (Org B) accessing Org A resources ---\n');

    // Check 1: Read User A's project tasks
    const readTasks = await req('GET', `/tasks/project/${projectAId}`, null, tokenB);
    if (readTasks.status === 403 || readTasks.status === 404) {
      console.log(`1. Read A's tasks (GET /api/tasks/project/${projectAId}): ✅ PASSED (HTTP ${readTasks.status})`);
    } else {
      failed++;
      const count = Array.isArray(readTasks.data.tasks) ? readTasks.data.tasks.length : '?';
      console.log(`1. Read A's tasks (GET /api/tasks/project/${projectAId}): ❌ FAILED (HTTP ${readTasks.status}, leaked ${count} task(s))`);
    }

    // Check 2: Create task in A's project & update A's task status
    const createTaskB = await req('POST', '/tasks', { project_id: projectAId, title: 'Injected Task' }, tokenB);
    const updateTask = await req('PATCH', `/tasks/${taskAId}/status`, { status: 'review' }, tokenB);
    if ((createTaskB.status === 403 || createTaskB.status === 404) && (updateTask.status === 403 || updateTask.status === 404)) {
      console.log(`2. Write A's tasks (POST=${createTaskB.status}, PATCH=${updateTask.status}): ✅ PASSED`);
    } else {
      failed++;
      console.log(`2. Write A's tasks: ❌ FAILED (POST=${createTaskB.status}, PATCH=${updateTask.status})`);
    }

    // Check 3: Read A's workspace channels & channel messages
    const listChans = await req('GET', `/chat/channels/${wsAId}`, null, tokenB);
    const readMsgs = await req('GET', `/chat/messages/${channelAId}`, null, tokenB);
    if ((listChans.status === 403 || listChans.status === 404) && (readMsgs.status === 403 || readMsgs.status === 404)) {
      console.log(`3. Read A's chat (channels=${listChans.status}, messages=${readMsgs.status}): ✅ PASSED`);
    } else {
      failed++;
      console.log(`3. Read A's chat: ❌ FAILED (channels=${listChans.status}, messages=${readMsgs.status})`);
    }

    // Check 4: File upload/list/download isolation (spoofing orgId=orgBId must also fail)
    const badForm = new FormData();
    badForm.append('file', new Blob(['malicious'], { type: 'text/plain' }), 'spoof.txt');
    badForm.append('workspaceId', String(wsAId));
    badForm.append('orgId', String(orgBId));
    const uploadB = await req('POST', '/files/upload', badForm, tokenB, true);
    const listFilesB = await req('GET', `/files/workspace/${wsAId}`, null, tokenB);
    const dlA = await req('GET', `/files/${fileAId}/download`, null, tokenA);
    const dlB = await req('GET', `/files/${fileAId}/download`, null, tokenB);
    if (
      (uploadB.status === 403 || uploadB.status === 404) &&
      (listFilesB.status === 403 || listFilesB.status === 404) &&
      (dlB.status === 403 || dlB.status === 404) &&
      dlA.status === 200
    ) {
      console.log(`4. File isolation (uploadB=${uploadB.status}, listB=${listFilesB.status}, dlA=${dlA.status}, dlB=${dlB.status}): ✅ PASSED`);
    } else {
      failed++;
      console.log(`4. File isolation: ❌ FAILED (uploadB=${uploadB.status}, listB=${listFilesB.status}, dlA=${dlA.status}, dlB=${dlB.status})`);
    }

    // Check 5: Socket.IO join receive & message:send isolation
    socketB.emit('message:send', { channelId: channelAId, content: `Injected by Bob ${ts}` });
    await new Promise((r) => setTimeout(r, 500));
    const msgCountAfter = await db.query('SELECT COUNT(*)::int AS cnt FROM messages WHERE channel_id = $1', [channelAId]);
    if (!bobReceivedMessage && msgCountAfter.rows[0].cnt === 1) {
      console.log(`5. Socket.IO isolation (channel ${channelAId}, join blocked & message:send blocked): ✅ PASSED`);
    } else {
      failed++;
      console.log(`5. Socket.IO isolation: ❌ FAILED (received=${Boolean(bobReceivedMessage)}, msgCount=${msgCountAfter.rows[0].cnt})`);
    }

    console.log('\n==================================================');
    console.log(`  RESULT: ${5 - failed}/5 checks passed (${failed} failed)`);
    console.log('==================================================');
    if (failed > 0) process.exitCode = 1;
  } catch (err) {
    console.error('Test execution error:', err);
    process.exitCode = 1;
  } finally {
    if (socketA) socketA.disconnect();
    if (socketB) socketB.disconnect();
    try {
      if (orgAId || orgBId) {
        await db.query('DELETE FROM organizations WHERE id = ANY($1::int[])', [[orgAId, orgBId].filter(Boolean)]);
      }
      if (userAId || userBId) {
        await db.query('DELETE FROM users WHERE id = ANY($1::int[])', [[userAId, userBId].filter(Boolean)]);
      }
      if (uploadedFilename) {
        const p = path.join(__dirname, 'uploads', uploadedFilename);
        if (fs.existsSync(p)) fs.unlinkSync(p);
      }
    } catch (cleanupErr) {
      console.warn('Cleanup notice:', cleanupErr.message);
    }
    await db.pool.end();
  }
}

runCrossTenantTests();
