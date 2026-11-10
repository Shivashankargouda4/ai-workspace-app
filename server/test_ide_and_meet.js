// Integration & Multi-Tenant Security Test Suite for Collaborative Code Studio & WebRTC Meetings
const WebSocket = require('ws');
const Y = require('../client/node_modules/yjs');
const {
  HocuspocusProvider,
} = require('../client/node_modules/@hocuspocus/provider/dist/hocuspocus-provider.cjs');
const { io } = require('../client/node_modules/socket.io-client');
const db = require('./src/config/db');

const PORT = process.env.TEST_IDE_PORT || '5000';
const API = `http://127.0.0.1:${PORT}/api`;
const WS_BASE = `http://127.0.0.1:${PORT}`;
const COLLAB_WS = `ws://127.0.0.1:${PORT}/collab`;

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

function connectHocuspocus(documentName, token, timeoutMs = 6000) {
  return new Promise((resolve, reject) => {
    const ydoc = new Y.Doc();
    let provider;
    let settled = false;
    const cleanup = () => {
      try {
        provider?.destroy();
        ydoc.destroy();
      } catch {
        // ignore
      }
    };
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        cleanup();
        reject(new Error(`Timeout connecting ${documentName}`));
      }
    }, timeoutMs);

    provider = new HocuspocusProvider({
      url: COLLAB_WS,
      WebSocketPolyfill: WebSocket,
      name: documentName,
      document: ydoc,
      token,
      onAuthenticationFailed: ({ reason }) => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          cleanup();
          reject(new Error(`AUTH_FAILED:${reason || 'denied'}`));
        }
      },
      onSynced: ({ state }) => {
        if (state && !settled) {
          settled = true;
          clearTimeout(timer);
          resolve({ ydoc, provider });
        }
      },
    });
  });
}

async function waitForCondition(fn, timeoutMs = 5000, label = 'condition') {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await fn()) return;
    await new Promise((r) => setTimeout(r, 70));
  }
  throw new Error(`Timed out waiting for ${label}`);
}

async function runTests() {
  console.log('==================================================');
  console.log('  CODE STUDIO (MONACO YJS) & WEBRTC MEET TESTS');
  console.log('==================================================\n');

  let failed = 0;
  let userAId = null;
  let userBId = null;
  let userCId = null;
  let orgAId = null;
  let orgBId = null;
  const activeHp = [];
  const activeSockets = [];

  try {
    const ts = Date.now();
    const pw = 'Password@123';

    const regA = await req('POST', '/auth/register', { name: 'IDE Alice', email: `ide_a_${ts}@example.com`, password: pw });
    const regB = await req('POST', '/auth/register', { name: 'IDE Bob', email: `ide_b_${ts}@example.com`, password: pw });
    const regC = await req('POST', '/auth/register', { name: 'IDE Charlie', email: `ide_c_${ts}@example.com`, password: pw });
    userAId = regA.data.user.id;
    userBId = regB.data.user.id;
    userCId = regC.data.user.id;
    const tokenA = regA.data.accessToken;
    const tokenB = regB.data.accessToken;
    const tokenC = regC.data.accessToken;

    const orgA = await req('POST', '/orgs', { name: 'IDE Org A', slug: `ide-org-a-${ts}` }, tokenA);
    const orgB = await req('POST', '/orgs', { name: 'IDE Org B', slug: `ide-org-b-${ts}` }, tokenB);
    orgAId = orgA.data.organization.id;
    orgBId = orgB.data.organization.id;
    const wsAId = orgA.data.defaultWorkspace.id;

    await db.query(
      'INSERT INTO organization_members (org_id, user_id, role) VALUES ($1, $2, $3)',
      [orgAId, userCId, 'member']
    );

    // 1. Starter code files + CRUD + cross-tenant 404 isolation
    const starterList = await req('GET', `/code/workspace/${wsAId}`, null, tokenA);
    const createFile = await req(
      'POST',
      '/code',
      { workspace_id: wsAId, path: 'src/algo.py', content: 'print("base")' },
      tokenA
    );
    const fileId = createFile.data?.file?.id;
    const dupFile = await req(
      'POST',
      '/code',
      { workspace_id: wsAId, path: 'src/algo.py', content: 'dup' },
      tokenA
    );
    const listB = await req('GET', `/code/workspace/${wsAId}`, null, tokenB);
    const getB = await req('GET', `/code/${fileId}`, null, tokenB);
    const delB = await req('DELETE', `/code/${fileId}`, null, tokenB);

    if (
      starterList.status === 200 &&
      starterList.data.files.some((f) => f.path === 'src/main.js') &&
      createFile.status === 201 &&
      createFile.data.file.language === 'python' &&
      dupFile.status === 409 &&
      listB.status === 404 &&
      getB.status === 404 &&
      delB.status === 404
    ) {
      console.log(`1. Code files REST CRUD, starter files & cross-org 404 (file ${fileId}): ✅ PASSED`);
    } else {
      failed++;
      console.log('1. Code files REST: ❌ FAILED', {
        starter: starterList.status,
        create: createFile.status,
        dup: dupFile.status,
        listB: listB.status,
        getB: getB.status,
      });
    }

    // 2. Hocuspocus code:<id> outsider block + live Y.Text('monaco') sync & Postgres yjs_state persistence
    let outsiderRejected = false;
    try {
      await connectHocuspocus(`code:${fileId}`, tokenB, 4000);
    } catch (err) {
      outsiderRejected = err.message.startsWith('AUTH_FAILED:');
    }

    const hpA = await connectHocuspocus(`code:${fileId}`, tokenA);
    const hpC = await connectHocuspocus(`code:${fileId}`, tokenC);
    activeHp.push(hpA, hpC);

    hpA.ydoc.transact(() => {
      hpA.ydoc.getText('monaco').insert(hpA.ydoc.getText('monaco').length, '\nprint("alice_edit")');
    });
    await waitForCondition(
      () => hpC.ydoc.getText('monaco').toString().includes('alice_edit'),
      4000,
      'code sync A -> C'
    );

    hpC.ydoc.transact(() => {
      hpC.ydoc.getText('monaco').insert(hpC.ydoc.getText('monaco').length, '\nprint("charlie_edit")');
    });
    await waitForCondition(
      () => hpA.ydoc.getText('monaco').toString().includes('charlie_edit'),
      4000,
      'code sync C -> A'
    );

    hpA.provider.destroy();
    hpC.provider.destroy();
    activeHp.length = 0;

    await waitForCondition(
      async () => {
        const r = await db.query('SELECT yjs_state, content FROM code_files WHERE id = $1', [fileId]);
        return (
          r.rows[0] &&
          Buffer.isBuffer(r.rows[0].yjs_state) &&
          r.rows[0].yjs_state.length > 0 &&
          r.rows[0].content.includes('charlie_edit')
        );
      },
      5000,
      'Postgres code_files yjs_state save'
    );

    const hpFresh = await connectHocuspocus(`code:${fileId}`, tokenA);
    activeHp.push(hpFresh);
    const freshCode = hpFresh.ydoc.getText('monaco').toString();
    hpFresh.provider.destroy();
    activeHp.length = 0;

    if (
      outsiderRejected &&
      freshCode.includes('print("base")') &&
      freshCode.includes('alice_edit') &&
      freshCode.includes('charlie_edit')
    ) {
      console.log('2. Hocuspocus code:<id> auth, live Y.Text convergence & Postgres persistence: ✅ PASSED');
    } else {
      failed++;
      console.log('2. Hocuspocus code collab: ❌ FAILED', { outsiderRejected, freshCode });
    }

    // 3. AI Explain & Review Code Endpoint
    const explainRes = await req(
      'POST',
      '/ai/explain-code',
      { code: 'async function load() { return await fetch("/api/health"); }', language: 'javascript', mode: 'review' },
      tokenA
    );
    if (explainRes.status === 200 && typeof explainRes.data.analysis === 'string' && explainRes.data.analysis.length > 10) {
      console.log(`3. AI Code Review/Explain endpoint (${explainRes.data.source}): ✅ PASSED`);
    } else {
      failed++;
      console.log('3. AI Code Explain: ❌ FAILED', explainRes);
    }

    // 4. Meeting Rooms REST + Cross-Tenant Isolation + ICE Config
    const iceRes = await req('GET', '/meetings/ice-config', null, tokenA);
    const meetCreate = await req('POST', '/meetings', { workspace_id: wsAId, title: `Standup ${ts}` }, tokenA);
    const meetingId = meetCreate.data?.meeting?.id;
    const roomCode = meetCreate.data?.meeting?.room_code;
    const resolveA = await req('GET', `/meetings/code/${roomCode}`, null, tokenA);
    const resolveB = await req('GET', `/meetings/code/${roomCode}`, null, tokenB);
    const listMeetB = await req('GET', `/meetings/workspace/${wsAId}`, null, tokenB);

    if (
      iceRes.status === 200 &&
      Array.isArray(iceRes.data.iceServers) &&
      meetCreate.status === 201 &&
      resolveA.status === 200 &&
      resolveB.status === 404 &&
      listMeetB.status === 404
    ) {
      console.log(`4. Meetings REST, ICE config & cross-tenant 404 (${roomCode}): ✅ PASSED`);
    } else {
      failed++;
      console.log('4. Meetings REST: ❌ FAILED', {
        ice: iceRes.status,
        create: meetCreate.status,
        resolveB: resolveB.status,
        listMeetB: listMeetB.status,
      });
    }

    // 5. Socket.IO WebRTC Mesh Signaling (join, offer, answer, ICE, media-state, chat, transcript, outsider block)
    const sockA = await connectSocket(tokenA);
    const sockC = await connectSocket(tokenC);
    const sockB = await connectSocket(tokenB);
    activeSockets.push(sockA, sockC, sockB);

    let bBlocked = false;
    sockB.on('error', () => {
      bBlocked = true;
    });
    const bAck = await new Promise((res) => {
      sockB.emit('meeting:join', { meetingId }, (ack) => res(ack));
    });

    const aSawJoined = [];
    const cSawPeers = [];
    const aGotOffer = [];
    const cGotAnswer = [];
    const aGotIce = [];
    const cGotChat = [];
    const aGotTranscript = [];

    sockA.on('meeting:peer-joined', (d) => aSawJoined.push(d));
    sockA.on('webrtc:offer', (d) => aGotOffer.push(d));
    sockA.on('webrtc:ice-candidate', (d) => aGotIce.push(d));
    sockA.on('meeting:transcript-sync', (d) => aGotTranscript.push(d));

    sockC.on('meeting:peers', (d) => cSawPeers.push(d));
    sockC.on('webrtc:answer', (d) => cGotAnswer.push(d));
    sockC.on('meeting:chat', (d) => cGotChat.push(d));

    await new Promise((res) => sockA.emit('meeting:join', { meetingId, micMuted: false, camOff: true }, res));
    const cJoinAck = await new Promise((res) =>
      sockC.emit('meeting:join', { meetingId, micMuted: true, camOff: false }, res)
    );

    await waitForCondition(() => aSawJoined.length === 1 && cSawPeers.length === 1, 3000, 'meeting peer handshake');
    const aSocketId = cJoinAck.peers[0].socketId;
    const cSocketId = aSawJoined[0].peer.socketId;

    // Cross-tenant spoof attempt from Bob must be dropped cleanly
    sockB.emit('webrtc:offer', { meetingId, targetSocketId: aSocketId, sdp: { type: 'offer', sdp: 'evil' } });

    sockC.emit('webrtc:offer', { meetingId, targetSocketId: aSocketId, sdp: { type: 'offer', sdp: 'v=0-offer' } });
    sockC.emit('webrtc:ice-candidate', { meetingId, targetSocketId: aSocketId, candidate: { candidate: 'cand:1' } });
    sockA.emit('webrtc:answer', { meetingId, targetSocketId: cSocketId, sdp: { type: 'answer', sdp: 'v=0-answer' } });
    sockA.emit('meeting:chat', { meetingId, content: `Call chat ${ts}` });
    sockC.emit('meeting:transcript-sync', { meetingId, transcript: `Notes line ${ts}` });

    await waitForCondition(
      () =>
        aGotOffer.length === 1 &&
        cGotAnswer.length === 1 &&
        aGotIce.length === 1 &&
        cGotChat.length === 1 &&
        aGotTranscript.length === 1,
      4000,
      'WebRTC signal relay & chat/transcript'
    );

    const patchNotes = await req('PATCH', `/meetings/${meetingId}`, { transcript: `Saved notes ${ts}` }, tokenA);
    let cSawEnd = false;
    sockC.on('meeting:ended', () => {
      cSawEnd = true;
    });
    const delMeet = await req('DELETE', `/meetings/${meetingId}`, null, tokenA);
    await waitForCondition(() => cSawEnd, 3000, 'meeting:ended broadcast');

    if (
      bBlocked &&
      bAck?.ok === false &&
      aGotOffer[0].sdp.sdp === 'v=0-offer' &&
      cGotAnswer[0].sdp.sdp === 'v=0-answer' &&
      aGotIce[0].candidate.candidate === 'cand:1' &&
      cGotChat[0].content === `Call chat ${ts}` &&
      aGotTranscript[0].transcript === `Notes line ${ts}` &&
      patchNotes.status === 200 &&
      delMeet.status === 200
    ) {
      console.log('5. WebRTC Socket.IO signaling, outsider rejection, in-call chat & notes: ✅ PASSED');
    } else {
      failed++;
      console.log('5. WebRTC signaling: ❌ FAILED', {
        bBlocked,
        bAck,
        offers: aGotOffer.length,
        answers: cGotAnswer.length,
        ice: aGotIce.length,
        chat: cGotChat.length,
        transcript: aGotTranscript.length,
      });
    }

    console.log('\n==================================================');
    console.log(`  IDE & MEET SUITE RESULT: ${5 - failed}/5 checks passed (${failed} failed)`);
    console.log('==================================================');
    if (failed > 0) process.exitCode = 1;
  } catch (err) {
    console.error('IDE/Meet test error:', err);
    process.exitCode = 1;
  } finally {
    activeHp.forEach((h) => {
      try {
        h.provider?.destroy();
        h.ydoc?.destroy();
      } catch {
        // ignore
      }
    });
    activeSockets.forEach((s) => s.disconnect());
    try {
      const oIds = [orgAId, orgBId].filter(Boolean);
      if (oIds.length) await db.query('DELETE FROM organizations WHERE id = ANY($1::int[])', [oIds]);
      const uIds = [userAId, userBId, userCId].filter(Boolean);
      if (uIds.length) await db.query('DELETE FROM users WHERE id = ANY($1::int[])', [uIds]);
    } catch (e) {
      console.warn('Cleanup notice:', e.message);
    }
    await db.pool.end();
  }
}

runTests();
