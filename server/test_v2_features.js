// Integration & Multi-Tenant Security Test Suite for v2 Features (Features 1-8)
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');
const Y = require('../client/node_modules/yjs');
const {
  HocuspocusProvider,
} = require('../client/node_modules/@hocuspocus/provider/dist/hocuspocus-provider.cjs');
const { io } = require('../client/node_modules/socket.io-client');
const db = require('./src/config/db');

const PORT = process.env.TEST_V2_PORT || '5000';
const API = `http://127.0.0.1:${PORT}/api`;
const WS_BASE = `http://127.0.0.1:${PORT}`;
const COLLAB_WS = `ws://127.0.0.1:${PORT}/collab`;

async function req(method, endpoint, body = null, token = null, isForm = false) {
  const headers = {};
  if (!isForm) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API}${endpoint}`, {
    method,
    headers,
    body: isForm ? body : body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let data = {};
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }
  return { status: res.status, data, headers: res.headers };
}

function connectSocket(token) {
  return new Promise((resolve, reject) => {
    const socket = io(WS_BASE, {
      auth: { token },
      transports: ['websocket'],
      reconnection: false,
    });
    const timer = setTimeout(() => {
      socket.disconnect();
      reject(new Error('Socket timeout'));
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

function connectHocuspocus(documentName, token) {
  return new Promise((resolve, reject) => {
    const ydoc = new Y.Doc();
    let provider;
    const timer = setTimeout(() => {
      try {
        provider?.destroy();
        ydoc.destroy();
      } catch {
        // ignore
      }
      reject(new Error(`Collab sync timeout for ${documentName}`));
    }, 6000);

    provider = new HocuspocusProvider({
      url: COLLAB_WS,
      WebSocketPolyfill: WebSocket,
      name: documentName,
      document: ydoc,
      token,
      onSynced: ({ state }) => {
        if (state) {
          clearTimeout(timer);
          resolve({ ydoc, provider });
        }
      },
    });
  });
}

function getFragmentText(ydoc) {
  return ydoc
    .getXmlFragment('default')
    .toArray()
    .map((el) =>
      typeof el.toArray === 'function'
        ? el
            .toArray()
            .map((c) =>
              typeof c.toDelta === 'function'
                ? c
                    .toDelta()
                    .map((op) => (typeof op.insert === 'string' ? op.insert : ''))
                    .join('')
                : String(c)
            )
            .join('')
        : ''
    )
    .filter(Boolean)
    .join('\n');
}

async function runTests() {
  console.log('==================================================');
  console.log('  V2 FEATURES INTEGRATION & SECURITY SUITE');
  console.log('==================================================\n');

  let failed = 0;
  let userAId = null;
  let userBId = null;
  let userCId = null;
  let userDId = null;
  let orgAId = null;
  let orgBId = null;
  let socketC = null;
  let socketD = null;
  let hpClient = null;
  const leftoverDiskPaths = [];

  try {
    const ts = Date.now();
    const pw = 'Password@123';

    const regA = await req('POST', '/auth/register', { name: 'V2 Alice', email: `v2_a_${ts}@example.com`, password: pw });
    const regB = await req('POST', '/auth/register', { name: 'V2 Bob', email: `v2_b_${ts}@example.com`, password: pw });
    const regC = await req('POST', '/auth/register', { name: 'V2 Charlie', email: `v2_c_${ts}@example.com`, password: pw });
    const regD = await req('POST', '/auth/register', { name: 'V2 Dave', email: `v2_d_${ts}@example.com`, password: pw });
    userAId = regA.data.user.id;
    userBId = regB.data.user.id;
    userCId = regC.data.user.id;
    userDId = regD.data.user.id;

    let tokenA = regA.data.accessToken;
    const tokenB = regB.data.accessToken;
    const tokenC = regC.data.accessToken;
    const tokenD = regD.data.accessToken;

    const orgA = await req('POST', '/orgs', { name: 'V2 Org A', slug: `v2-org-a-${ts}` }, tokenA);
    const orgB = await req('POST', '/orgs', { name: 'V2 Org B', slug: `v2-org-b-${ts}` }, tokenB);
    orgAId = orgA.data.organization.id;
    orgBId = orgB.data.organization.id;
    const wsAId = orgA.data.defaultWorkspace.id;
    const projAId = orgA.data.defaultProject.id;

    await db.query(
      'INSERT INTO organization_members (org_id, user_id, role) VALUES ($1, $2, $3), ($1, $4, $3)',
      [orgAId, userCId, 'member', userDId]
    );

    // Check 1: Editable Profile (PATCH /api/auth/me)
    const badPwRes = await req(
      'PATCH',
      '/auth/me',
      { currentPassword: 'WrongPassword', newPassword: 'NewPassword@1' },
      tokenA
    );
    const goodProfile = await req(
      'PATCH',
      '/auth/me',
      { name: 'V2 Alice Updated', currentPassword: pw, newPassword: 'NewPassword@1' },
      tokenA
    );
    const relogin = await req('POST', '/auth/login', {
      email: `v2_a_${ts}@example.com`,
      password: 'NewPassword@1',
    });
    if (
      badPwRes.status === 401 &&
      goodProfile.status === 200 &&
      goodProfile.data.user.name === 'V2 Alice Updated' &&
      relogin.status === 200
    ) {
      tokenA = relogin.data.accessToken;
      console.log('1. Editable profile & password change (PATCH /api/auth/me): ✅ PASSED');
    } else {
      failed++;
      console.log('1. Editable profile: ❌ FAILED', { bad: badPwRes.status, good: goodProfile.status });
    }

    // Check 2: Socket notifications + Task Assignees/Comments/Update/Delete/Audit Trail
    socketC = await connectSocket(tokenC);
    const receivedNotifsC = [];
    socketC.on('notification:new', (n) => receivedNotifsC.push(n));

    const outsiderAssign = await req(
      'POST',
      '/tasks',
      { project_id: projAId, title: 'Bad Assign', assignee_ids: [userBId] },
      tokenA
    );
    const createdTask = await req(
      'POST',
      '/tasks',
      {
        project_id: projAId,
        title: `Live ML Task ${ts}`,
        priority: 'high',
        complexity: 9,
        estimated_days: 10,
        assignee_ids: [userCId],
      },
      tokenA
    );
    const taskId = createdTask.data.task.id;

    await req('PATCH', `/tasks/${taskId}/status`, { status: 'in_progress', progress: 15 }, tokenA);
    await req('POST', `/tasks/${taskId}/comments`, { content: 'Please review ASAP' }, tokenA);
    await req('PATCH', `/tasks/${taskId}`, { title: `Updated Task ${ts}`, complexity: 8 }, tokenA);

    await new Promise((r) => setTimeout(r, 400));

    const detailsA = await req('GET', `/tasks/${taskId}`, null, tokenA);
    const detailsB = await req('GET', `/tasks/${taskId}`, null, tokenB);
    const commentB = await req('POST', `/tasks/${taskId}/comments`, { content: 'Hacked' }, tokenB);
    const auditA = await req('GET', `/analytics/audit/${orgAId}`, null, tokenA);
    const auditB = await req('GET', `/analytics/audit/${orgAId}`, null, tokenB);

    if (
      outsiderAssign.status === 400 &&
      createdTask.status === 201 &&
      detailsA.status === 200 &&
      detailsA.data.assignees.some((a) => a.id === userCId) &&
      detailsA.data.comments.length === 1 &&
      detailsA.data.history.length >= 2 &&
      detailsB.status === 404 &&
      commentB.status === 404 &&
      auditA.status === 200 &&
      auditA.data.history.length >= 2 &&
      auditB.status === 403 &&
      receivedNotifsC.some((n) => n.type === 'task_assigned') &&
      receivedNotifsC.some((n) => n.type === 'task_comment')
    ) {
      console.log('2. Task detail/assignees/comments/audit + live Socket notifications + tenant isolation: ✅ PASSED');
    } else {
      failed++;
      console.log('2. Task CRUD/Notifications: ❌ FAILED', {
        outsiderAssign: outsiderAssign.status,
        detailsB: detailsB.status,
        auditB: auditB.status,
        notifs: receivedNotifsC.map((n) => n.type),
      });
    }

    const delTask = await req('DELETE', `/tasks/${taskId}`, null, tokenA);
    const afterDelTask = await req('GET', `/tasks/${taskId}`, null, tokenA);
    if (delTask.status !== 200 || afterDelTask.status !== 404) {
      failed++;
      console.log('2b. Task delete failed');
    }

    // Check 3: Custom Public Channels + Private 1-on-1 DM Isolation (3rd member Dave blocked)
    const chRes = await req('POST', '/chat/channels', { workspace_id: wsAId, name: 'qa team' }, tokenA);
    const dmRes = await req('POST', '/chat/dm', { org_id: orgAId, recipient_user_id: userCId }, tokenA);
    const dmId = dmRes.data.channel.id;

    socketD = await connectSocket(tokenD);
    let daveDmBlocked = false;
    socketD.on('error', () => {
      daveDmBlocked = true;
    });
    socketD.emit('channel:join', { channelId: dmId });
    await new Promise((r) => setTimeout(r, 300));

    const channelsD = await req('GET', `/chat/channels/${wsAId}`, null, tokenD);
    const dmMsgsD = await req('GET', `/chat/messages/${dmId}`, null, tokenD);

    if (
      chRes.status === 201 &&
      chRes.data.channel.name === 'qa-team' &&
      dmRes.status === 201 &&
      !channelsD.data.channels.some((c) => c.id === dmId) &&
      dmMsgsD.status === 404 &&
      daveDmBlocked
    ) {
      console.log('3. Custom public channels + private DM isolation against 3rd org member: ✅ PASSED');
    } else {
      failed++;
      console.log('3. Channels/DM isolation: ❌ FAILED', {
        ch: chRes.status,
        dm: dmRes.status,
        dmMsgsD: dmMsgsD.status,
        daveDmBlocked,
      });
    }

    // Check 4: Files ?inline=1 Preview + Delete RBAC (Member cannot delete Admin's file)
    const fFormA = new FormData();
    fFormA.append('file', new Blob(['Admin Secret'], { type: 'text/plain' }), 'admin_note.txt');
    fFormA.append('workspaceId', String(wsAId));
    const upA = await req('POST', '/files/upload', fFormA, tokenA, true);
    const fileAId = upA.data.file.id;
    leftoverDiskPaths.push(upA.data.file.path);

    const inlineDl = await req('GET', `/files/${fileAId}/download?inline=1`, null, tokenA);
    const charlieDelAdminFile = await req('DELETE', `/files/${fileAId}`, null, tokenC);
    const aliceDelAdminFile = await req('DELETE', `/files/${fileAId}`, null, tokenA);

    if (
      inlineDl.status === 200 &&
      (inlineDl.headers.get('content-disposition') || '').startsWith('inline') &&
      charlieDelAdminFile.status === 403 &&
      aliceDelAdminFile.status === 200 &&
      !fs.existsSync(path.join(__dirname, 'uploads', upA.data.file.path))
    ) {
      console.log('4. File inline preview + delete role enforcement + disk cleanup: ✅ PASSED');
    } else {
      failed++;
      console.log('4. Files inline/delete: ❌ FAILED', {
        inlineStatus: inlineDl.status,
        charlieDel: charlieDelAdminFile.status,
        aliceDel: aliceDelAdminFile.status,
      });
    }

    // Check 5: Document Version Snapshots + Live CRDT Restore
    const docRes = await req(
      'POST',
      '/docs',
      { workspace_id: wsAId, title: `Snapshot Doc ${ts}`, content: 'Version One Base' },
      tokenA
    );
    const docId = docRes.data.document.id;
    hpClient = await connectHocuspocus(`doc:${docId}`, tokenA);

    const snap1 = await req('POST', `/docs/${docId}/snapshots`, { label: 'Checkpoint V1' }, tokenA);
    const snap1Id = snap1.data.snapshot.id;

    // Mutate document live
    hpClient.ydoc.transact(() => {
      const frag = hpClient.ydoc.getXmlFragment('default');
      frag.delete(0, frag.length);
      const p = new Y.XmlElement('paragraph');
      p.insert(0, [new Y.XmlText('Corrupted Version Two')]);
      frag.insert(0, [p]);
    });
    await new Promise((r) => setTimeout(r, 250));

    // Restore V1 snapshot and verify live client reverts cleanly
    const restoreRes = await req('POST', `/docs/${docId}/snapshots/${snap1Id}/restore`, {}, tokenA);
    await new Promise((r) => setTimeout(r, 400));
    const restoredText = getFragmentText(hpClient.ydoc);
    const snapsB = await req('GET', `/docs/${docId}/snapshots`, null, tokenB);

    if (
      snap1.status === 201 &&
      restoreRes.status === 200 &&
      restoredText.includes('Version One Base') &&
      !restoredText.includes('Corrupted Version Two') &&
      snapsB.status === 404
    ) {
      console.log('5. Document snapshot capture, cross-org 404 & live CRDT restore: ✅ PASSED');
    } else {
      failed++;
      console.log('5. Doc snapshots: ❌ FAILED', {
        snapStatus: snap1.status,
        restoreStatus: restoreRes.status,
        restoredText,
        snapsB: snapsB.status,
      });
    }

    console.log('\n==================================================');
    console.log(`  V2 SUITE RESULT: ${5 - failed}/5 checks passed (${failed} failed)`);
    console.log('==================================================');
    if (failed > 0) process.exitCode = 1;
  } catch (err) {
    console.error('V2 test error:', err);
    process.exitCode = 1;
  } finally {
    try {
      hpClient?.provider?.destroy();
      hpClient?.ydoc?.destroy();
    } catch {
      // ignore
    }
    if (socketC) socketC.disconnect();
    if (socketD) socketD.disconnect();
    try {
      const oIds = [orgAId, orgBId].filter(Boolean);
      if (oIds.length) await db.query('DELETE FROM organizations WHERE id = ANY($1::int[])', [oIds]);
      const uIds = [userAId, userBId, userCId, userDId].filter(Boolean);
      if (uIds.length) await db.query('DELETE FROM users WHERE id = ANY($1::int[])', [uIds]);
      for (const p of leftoverDiskPaths) {
        const full = path.join(__dirname, 'uploads', path.basename(p));
        if (fs.existsSync(full)) fs.unlinkSync(full);
      }
    } catch (e) {
      console.warn('Cleanup notice:', e.message);
    }
    await db.pool.end();
  }
}

runTests();
