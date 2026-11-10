// Collaborative Notes & Hocuspocus Integration + Cross-Tenant Security Test
const WebSocket = require('ws');
const Y = require('../client/node_modules/yjs');
const {
  HocuspocusProvider,
} = require('../client/node_modules/@hocuspocus/provider/dist/hocuspocus-provider.cjs');
const db = require('./src/config/db');

const API = 'http://127.0.0.1:5000/api';
const COLLAB_WS_URL = 'ws://127.0.0.1:5000/collab';

async function req(method, endpoint, body = null, token = null) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API}${endpoint}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let data = {};
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }
  return { status: res.status, data };
}

function getFragmentPlainText(ydoc) {
  const fragment = ydoc.getXmlFragment('default');
  return fragment
    .toArray()
    .map((el) => {
      if (typeof el.toArray === 'function') {
        return el
          .toArray()
          .map((child) =>
            typeof child.toDelta === 'function'
              ? child
                  .toDelta()
                  .map((op) => (typeof op.insert === 'string' ? op.insert : ''))
                  .join('')
              : String(child)
          )
          .join('');
      }
      return '';
    })
    .filter(Boolean)
    .join('\n');
}

function appendParagraph(ydoc, text) {
  const fragment = ydoc.getXmlFragment('default');
  ydoc.transact(() => {
    const p = new Y.XmlElement('paragraph');
    p.insert(0, [new Y.XmlText(text)]);
    fragment.insert(fragment.length, [p]);
  });
}

function connectCollabClient({ documentName, token, timeoutMs = 6000 }) {
  return new Promise((resolve, reject) => {
    const ydoc = new Y.Doc();
    let provider;
    let settled = false;
    const cleanupOnReject = () => {
      try {
        provider?.destroy();
        ydoc.destroy();
      } catch {
        // ignore cleanup error
      }
    };

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        cleanupOnReject();
        reject(new Error(`Timed out connecting to ${documentName}`));
      }
    }, timeoutMs);

    provider = new HocuspocusProvider({
      url: COLLAB_WS_URL,
      WebSocketPolyfill: WebSocket,
      name: documentName,
      document: ydoc,
      token,
      onAuthenticationFailed: ({ reason }) => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          cleanupOnReject();
          reject(new Error(`AUTH_FAILED:${reason || 'permission-denied'}`));
        }
      },
      onSynced: ({ state }) => {
        if (state && !settled) {
          settled = true;
          clearTimeout(timer);
          resolve({
            ydoc,
            provider,
            disconnect: () => {
              provider.destroy();
            },
          });
        }
      },
    });
  });
}

async function waitForCondition(predicate, timeoutMs = 5000, label = 'condition') {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await predicate()) return;
    await new Promise((r) => setTimeout(r, 80));
  }
  throw new Error(`Timed out waiting for ${label}`);
}

async function runCollabTests() {
  console.log('==================================================');
  console.log('  COLLABORATIVE DOCUMENTS & HOCUSPOCUS TESTS');
  console.log('==================================================\n');

  let failed = 0;
  let userAId = null;
  let userBId = null;
  let userCId = null;
  let orgAId = null;
  let orgBId = null;
  const activeClients = [];

  try {
    const ts = Date.now();

    // Setup 3 ephemeral users: Alice (Org A owner), Charlie (Org A member), Bob (Org B outsider)
    const regA = await req('POST', '/auth/register', {
      name: 'Collab Alice',
      email: `collab_alice_${ts}@example.com`,
      password: 'Password@123',
    });
    const regB = await req('POST', '/auth/register', {
      name: 'Collab Bob',
      email: `collab_bob_${ts}@example.com`,
      password: 'Password@123',
    });
    const regC = await req('POST', '/auth/register', {
      name: 'Collab Charlie',
      email: `collab_charlie_${ts}@example.com`,
      password: 'Password@123',
    });
    if (regA.status !== 201 || regB.status !== 201 || regC.status !== 201) {
      throw new Error('Failed to register test users');
    }

    const tokenA = regA.data.accessToken;
    const tokenB = regB.data.accessToken;
    const tokenC = regC.data.accessToken;
    userAId = regA.data.user.id;
    userBId = regB.data.user.id;
    userCId = regC.data.user.id;

    const orgA = await req('POST', '/orgs', { name: 'Collab Org A', slug: `collab-org-a-${ts}` }, tokenA);
    const orgB = await req('POST', '/orgs', { name: 'Collab Org B', slug: `collab-org-b-${ts}` }, tokenB);
    if (orgA.status !== 201 || orgB.status !== 201) {
      throw new Error('Failed to create test orgs');
    }
    orgAId = orgA.data.organization.id;
    orgBId = orgB.data.organization.id;
    const wsAId = orgA.data.defaultWorkspace.id;

    // Add Charlie as member of Org A
    await db.query(
      'INSERT INTO organization_members (org_id, user_id, role) VALUES ($1, $2, $3)',
      [orgAId, userCId, 'member']
    );

    // Check 1: Document REST Create & Cross-Tenant Isolation
    const createRes = await req(
      'POST',
      '/docs',
      { workspace_id: wsAId, title: `Sprint Notes ${ts}`, content: 'Initial line' },
      tokenA
    );
    const docId = createRes.data?.document?.id;
    const listA = await req('GET', `/docs/workspace/${wsAId}`, null, tokenA);
    const getA = await req('GET', `/docs/${docId}`, null, tokenA);

    const listB = await req('GET', `/docs/workspace/${wsAId}`, null, tokenB);
    const getB = await req('GET', `/docs/${docId}`, null, tokenB);
    const createBInWsA = await req(
      'POST',
      '/docs',
      { workspace_id: wsAId, title: 'Intruder Doc' },
      tokenB
    );
    const patchB = await req('PATCH', `/docs/${docId}`, { title: 'Hacked Title' }, tokenB);
    const delB = await req('DELETE', `/docs/${docId}`, null, tokenB);

    if (
      createRes.status === 201 &&
      listA.status === 200 &&
      listA.data.documents.some((d) => d.id === docId) &&
      getA.status === 200 &&
      listB.status === 404 &&
      getB.status === 404 &&
      createBInWsA.status === 404 &&
      patchB.status === 404 &&
      delB.status === 404
    ) {
      console.log(`1. REST CRUD & 404 tenant isolation (doc ${docId}): ✅ PASSED`);
    } else {
      failed++;
      console.log('1. REST CRUD & isolation: ❌ FAILED', {
        create: createRes.status,
        listB: listB.status,
        getB: getB.status,
        createB: createBInWsA.status,
        patchB: patchB.status,
        delB: delB.status,
      });
    }

    // Check 2: Hocuspocus rejects cross-tenant User B & bad JWT
    let rejectedCrossTenant = false;
    let rejectedInvalidJwt = false;
    try {
      await connectCollabClient({ documentName: `doc:${docId}`, token: tokenB, timeoutMs: 4000 });
    } catch (err) {
      rejectedCrossTenant = err.message.startsWith('AUTH_FAILED:');
    }
    try {
      await connectCollabClient({
        documentName: `doc:${docId}`,
        token: 'invalid.jwt.token',
        timeoutMs: 4000,
      });
    } catch (err) {
      rejectedInvalidJwt = err.message.startsWith('AUTH_FAILED:');
    }

    if (rejectedCrossTenant && rejectedInvalidJwt) {
      console.log('2. Hocuspocus onAuthenticate rejects outsider & invalid JWT: ✅ PASSED');
    } else {
      failed++;
      console.log('2. Hocuspocus auth rejection: ❌ FAILED', {
        rejectedCrossTenant,
        rejectedInvalidJwt,
      });
    }

    // Check 3: Live Multi-User CRDT Sync & Awareness
    const clientA = await connectCollabClient({ documentName: `doc:${docId}`, token: tokenA });
    const clientC = await connectCollabClient({ documentName: `doc:${docId}`, token: tokenC });
    activeClients.push(clientA, clientC);

    clientA.provider.setAwarenessField('user', { name: 'Collab Alice', color: '#4f46e5' });
    clientC.provider.setAwarenessField('user', { name: 'Collab Charlie', color: '#10b981' });

    await waitForCondition(
      () => {
        const states = Array.from(clientA.provider.awareness.getStates().values());
        return states.some((s) => s?.user?.name === 'Collab Charlie');
      },
      4000,
      'awareness propagation'
    );

    appendParagraph(clientA.ydoc, `Alice edit ${ts}`);
    await waitForCondition(
      () => getFragmentPlainText(clientC.ydoc).includes(`Alice edit ${ts}`),
      4000,
      'Alice -> Charlie Yjs sync'
    );

    appendParagraph(clientC.ydoc, `Charlie edit ${ts}`);
    await waitForCondition(
      () => getFragmentPlainText(clientA.ydoc).includes(`Charlie edit ${ts}`),
      4000,
      'Charlie -> Alice Yjs sync'
    );

    const textA = getFragmentPlainText(clientA.ydoc);
    const textC = getFragmentPlainText(clientC.ydoc);
    if (textA === textC && textA.includes(`Alice edit ${ts}`) && textA.includes(`Charlie edit ${ts}`)) {
      console.log('3. Live multi-user Yjs convergence & awareness: ✅ PASSED');
    } else {
      failed++;
      console.log('3. Live multi-user sync: ❌ FAILED', { textA, textC });
    }

    // Check 4: PostgreSQL yjs_state & content persistence across disconnect/reconnect
    clientA.disconnect();
    clientC.disconnect();
    activeClients.length = 0;

    await waitForCondition(
      async () => {
        const rowRes = await db.query('SELECT yjs_state, content FROM documents WHERE id = $1', [docId]);
        const row = rowRes.rows[0];
        return (
          row &&
          Buffer.isBuffer(row.yjs_state) &&
          row.yjs_state.length > 0 &&
          typeof row.content === 'string' &&
          row.content.includes(`Charlie edit ${ts}`)
        );
      },
      5000,
      'Postgres yjs_state persistence'
    );

    const clientFresh = await connectCollabClient({ documentName: `doc:${docId}`, token: tokenA });
    activeClients.push(clientFresh);
    const freshText = getFragmentPlainText(clientFresh.ydoc);
    clientFresh.disconnect();
    activeClients.length = 0;

    if (
      freshText.includes('Initial line') &&
      freshText.includes(`Alice edit ${ts}`) &&
      freshText.includes(`Charlie edit ${ts}`)
    ) {
      console.log('4. Postgres yjs_state + plain-text mirror survives reconnect: ✅ PASSED');
    } else {
      failed++;
      console.log('4. Postgres reconnect hydration: ❌ FAILED', { freshText });
    }

    // Check 5: Rename + Delete lifecycle
    const renameRes = await req('PATCH', `/docs/${docId}`, { title: `Renamed Notes ${ts}` }, tokenA);
    const delRes = await req('DELETE', `/docs/${docId}`, null, tokenA);
    const afterDelRes = await req('GET', `/docs/${docId}`, null, tokenA);
    if (
      renameRes.status === 200 &&
      renameRes.data.document.title === `Renamed Notes ${ts}` &&
      delRes.status === 200 &&
      afterDelRes.status === 404
    ) {
      console.log('5. Document rename & delete lifecycle: ✅ PASSED');
    } else {
      failed++;
      console.log('5. Document rename & delete: ❌ FAILED', {
        renameStatus: renameRes.status,
        delStatus: delRes.status,
        afterDelStatus: afterDelRes.status,
      });
    }

    console.log('\n==================================================');
    console.log(`  RESULT: ${5 - failed}/5 checks passed (${failed} failed)`);
    console.log('==================================================');
    if (failed > 0) process.exitCode = 1;
  } catch (err) {
    console.error('Collab test execution error:', err);
    process.exitCode = 1;
  } finally {
    for (const c of activeClients) {
      try {
        c.disconnect();
      } catch {
        // ignore
      }
    }
    try {
      if (orgAId || orgBId) {
        await db.query('DELETE FROM organizations WHERE id = ANY($1::int[])', [[orgAId, orgBId].filter(Boolean)]);
      }
      const userIds = [userAId, userBId, userCId].filter(Boolean);
      if (userIds.length > 0) {
        await db.query('DELETE FROM users WHERE id = ANY($1::int[])', [userIds]);
      }
    } catch (cleanupErr) {
      console.warn('Cleanup notice:', cleanupErr.message);
    }
    await db.pool.end();
  }
}

runCollabTests();
