const jwt = require('jsonwebtoken');
const { URL } = require('url');
const { WebSocketServer } = require('ws');
const { Hocuspocus } = require('@hocuspocus/server');
const Y = require('yjs');
const db = require('../config/db');
const { resolveAuthorizedResource } = require('../utils/tenantAccess');

const JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'super_secret_access_token_key';

/**
 * Parse canonical Hocuspocus document names of the form `doc:<positiveInt>`.
 */
function parseDocumentId(documentName) {
  if (typeof documentName !== 'string') return null;
  const match = documentName.match(/^doc:(\d+)$/);
  if (!match) return null;
  const id = Number(match[1]);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

/**
 * Normalize Node IncomingMessage headers into a Web API Headers instance.
 */
function toWebHeaders(rawHeaders = {}) {
  const headers = new Headers();
  for (const [key, value] of Object.entries(rawHeaders)) {
    if (value === undefined) continue;
    headers.set(key, Array.isArray(value) ? value.join(', ') : String(value));
  }
  return headers;
}

/**
 * Convert ws binary message payloads (`Buffer`, `Buffer[]`, `ArrayBuffer`) into a `Uint8Array`.
 */
function toUint8Array(data) {
  if (Buffer.isBuffer(data)) {
    return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  }
  if (Array.isArray(data)) {
    const joined = Buffer.concat(data);
    return new Uint8Array(joined.buffer, joined.byteOffset, joined.byteLength);
  }
  if (data instanceof ArrayBuffer) {
    return new Uint8Array(data);
  }
  return new Uint8Array(data);
}

/**
 * Extract plain text from TipTap's default Yjs XmlFragment so AI summaries and previews stay synced.
 */
function extractNodeText(node) {
  if (!node) return '';
  if (typeof node === 'string') return node;
  if (typeof node.toDelta === 'function') {
    return node
      .toDelta()
      .map((op) => (typeof op.insert === 'string' ? op.insert : ''))
      .join('');
  }
  if (typeof node.toArray === 'function') {
    return node.toArray().map(extractNodeText).join('');
  }
  return '';
}

function extractPlainText(ydoc) {
  const fragment = ydoc.getXmlFragment('default');
  const lines = fragment.toArray().map((child) => extractNodeText(child));
  // Preserve multi-line spacing except trailing empty block noise
  while (lines.length > 1 && lines[lines.length - 1] === '') {
    lines.pop();
  }
  return lines.join('\n').trim();
}

/**
 * Seed TipTap's default XmlFragment from plain text when a document has never been edited via Yjs yet.
 */
function seedDocumentContent(ydoc, content) {
  if (!content || !content.trim()) return;
  const fragment = ydoc.getXmlFragment('default');
  if (fragment.length > 0) return;

  ydoc.transact(() => {
    const lines = content.split(/\r?\n/);
    for (const line of lines) {
      const paragraph = new Y.XmlElement('paragraph');
      if (line.length > 0) {
        paragraph.insert(0, [new Y.XmlText(line)]);
      }
      fragment.insert(fragment.length, [paragraph]);
    }
  }, { source: 'local', skipStoreHooks: true });
}

/**
 * Verify JWT access token and confirm document tenant membership via `organization_members`.
 */
async function authenticateDocConnection({ token, documentName }) {
  if (!token || typeof token !== 'string') {
    const err = new Error('Authentication token is required');
    err.reason = 'Authentication required';
    throw err;
  }

  const rawToken = token.startsWith('Bearer ') ? token.slice(7).trim() : token.trim();
  let decoded;
  try {
    decoded = jwt.verify(rawToken, JWT_ACCESS_SECRET);
  } catch (jwtErr) {
    const reason = jwtErr.name === 'TokenExpiredError' ? 'TOKEN_EXPIRED' : 'Invalid authentication token';
    const err = new Error(reason);
    err.reason = reason;
    throw err;
  }

  const docId = parseDocumentId(documentName);
  if (!docId) {
    const err = new Error('Invalid document identifier');
    err.reason = 'Invalid document identifier';
    throw err;
  }

  const userRes = await db.query('SELECT id, name, email FROM users WHERE id = $1', [decoded.userId]);
  if (userRes.rows.length === 0) {
    const err = new Error('User not found');
    err.reason = 'User not found';
    throw err;
  }
  const user = userRes.rows[0];

  const docRecord = await resolveAuthorizedResource('document', docId, user.id);
  if (!docRecord) {
    const err = new Error('Access denied to document');
    err.reason = 'Access denied to document';
    throw err;
  }

  return {
    user,
    docId: docRecord.id,
    orgId: docRecord.resolved_org_id,
    workspaceId: docRecord.workspace_id,
    role: docRecord.member_role,
  };
}

const pendingSavePromises = new Set();

function trackSave(promise) {
  pendingSavePromises.add(promise);
  promise.finally(() => pendingSavePromises.delete(promise));
  return promise;
}

const hocuspocus = new Hocuspocus({
  name: 'workspace-collab',
  debounce: 1000,
  maxDebounce: 5000,
  unloadImmediately: true,
  quiet: true,

  async onAuthenticate(data) {
    return authenticateDocConnection(data);
  },

  async onTokenSync(data) {
    return authenticateDocConnection(data);
  },

  async onLoadDocument(data) {
    const docId = data.context?.docId ?? parseDocumentId(data.documentName);
    if (!docId) {
      throw new Error('Invalid document identifier');
    }

    const result = await db.query('SELECT yjs_state, content FROM documents WHERE id = $1', [docId]);
    if (result.rows.length === 0) {
      throw new Error('Document not found');
    }

    const row = result.rows[0];
    if (row.yjs_state && row.yjs_state.length > 0) {
      Y.applyUpdate(data.document, new Uint8Array(row.yjs_state));
    } else if (row.content) {
      seedDocumentContent(data.document, row.content);
    }
  },

  async onStoreDocument(data) {
    const docId = data.lastContext?.docId ?? parseDocumentId(data.documentName);
    if (!docId) return;

    const encodedState = Buffer.from(Y.encodeStateAsUpdate(data.document));
    const plainText = extractPlainText(data.document);

    await trackSave(
      db.query(
        'UPDATE documents SET yjs_state = $1, content = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3',
        [encodedState, plainText, docId]
      )
    );
  },
});

/**
 * Attach `/collab` WebSocket upgrades to the shared Express HTTP server without interfering with Socket.IO.
 */
function attachCollabServer(httpServer) {
  const wss = new WebSocketServer({ noServer: true });

  wss.on('connection', (ws, req) => {
    const requestLike = {
      url: req.url || '/collab',
      headers: toWebHeaders(req.headers),
    };
    const clientConnection = hocuspocus.handleConnection(ws, requestLike);

    ws.on('message', (data) => {
      clientConnection.handleMessage(toUint8Array(data));
    });

    ws.on('close', (code, reason) => {
      clientConnection.handleClose({
        code,
        reason: reason ? reason.toString() : '',
      });
    });

    ws.on('pong', () => {
      clientConnection.touch();
    });

    ws.on('error', (err) => {
      console.error('Collab WebSocket error:', err.message);
    });
  });

  httpServer.on('upgrade', (req, socket, head) => {
    let pathname = '';
    try {
      pathname = new URL(req.url || '/', 'http://localhost').pathname;
    } catch {
      return;
    }

    if (pathname !== '/collab' && pathname !== '/collab/') {
      return;
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req);
    });
  });

  return wss;
}

function closeDocumentConnections(docId) {
  hocuspocus.closeConnections(`doc:${docId}`);
}

function getLiveDocumentSnapshot(docId) {
  const liveDoc = hocuspocus.documents.get(`doc:${docId}`);
  if (!liveDoc) return null;
  return {
    yjsState: Buffer.from(Y.encodeStateAsUpdate(liveDoc)),
    content: extractPlainText(liveDoc),
  };
}

function cloneXmlNode(node) {
  if (node instanceof Y.XmlText) {
    const copy = new Y.XmlText();
    copy.applyDelta(node.toDelta());
    return copy;
  }
  if (node instanceof Y.XmlElement) {
    const copy = new Y.XmlElement(node.nodeName);
    const attrs = node.getAttributes();
    for (const [k, v] of Object.entries(attrs)) {
      copy.setAttribute(k, v);
    }
    const children = node.toArray().map(cloneXmlNode).filter(Boolean);
    if (children.length > 0) {
      copy.insert(0, children);
    }
    return copy;
  }
  return null;
}

async function restoreDocumentSnapshot(docId, snapshotStateBuffer) {
  const snapDoc = new Y.Doc();
  Y.applyUpdate(snapDoc, new Uint8Array(snapshotStateBuffer));
  const plainText = extractPlainText(snapDoc);

  const docKey = `doc:${docId}`;
  if (hocuspocus.documents.has(docKey)) {
    const directConn = await hocuspocus.openDirectConnection(docKey);
    try {
      await directConn.transact((liveDoc) => {
        const targetFrag = liveDoc.getXmlFragment('default');
        if (targetFrag.length > 0) {
          targetFrag.delete(0, targetFrag.length);
        }
        const sourceChildren = snapDoc.getXmlFragment('default').toArray().map(cloneXmlNode).filter(Boolean);
        if (sourceChildren.length > 0) {
          targetFrag.insert(0, sourceChildren);
        }
      });
    } finally {
      await directConn.disconnect({ unloadImmediately: false });
    }
    return { yjsState: Buffer.from(Y.encodeStateAsUpdate(snapDoc)), content: plainText };
  }

  await db.query(
    'UPDATE documents SET yjs_state = $1, content = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3',
    [Buffer.from(snapshotStateBuffer), plainText, docId]
  );
  return { yjsState: Buffer.from(snapshotStateBuffer), content: plainText };
}

async function flushCollabStores() {
  hocuspocus.closeConnections();
  hocuspocus.flushPendingStores();
  if (pendingSavePromises.size > 0) {
    await Promise.allSettled([...pendingSavePromises]);
  }
}

module.exports = {
  attachCollabServer,
  closeDocumentConnections,
  getLiveDocumentSnapshot,
  restoreDocumentSnapshot,
  flushCollabStores,
  parseDocumentId,
  extractPlainText,
  seedDocumentContent,
};
