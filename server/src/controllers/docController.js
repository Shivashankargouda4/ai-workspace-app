const { z } = require('zod');
const Y = require('yjs');
const db = require('../config/db');
const { resolveAuthorizedResource } = require('../utils/tenantAccess');
const {
  closeDocumentConnections,
  getLiveDocumentSnapshot,
  restoreDocumentSnapshot,
  seedDocumentContent,
} = require('../collab/hocuspocusServer');

const createDocSchema = z.object({
  workspace_id: z.coerce.number().int().positive(),
  title: z.string().trim().min(1, 'Document title is required').max(255),
  content: z.string().max(100000).optional().default(''),
});

const renameDocSchema = z.object({
  title: z.string().trim().min(1, 'Document title is required').max(255),
});

function parsePositiveInt(value) {
  const num = Number(value);
  return Number.isInteger(num) && num > 0 ? num : null;
}

/**
 * List all collaborative documents in a workspace accessible to the current user.
 */
const listWorkspaceDocs = async (req, res) => {
  try {
    const workspaceId = parsePositiveInt(req.params.workspaceId);
    if (!workspaceId) {
      return res.status(400).json({ error: 'Invalid workspace ID.' });
    }

    const workspace = await resolveAuthorizedResource('workspace', workspaceId, req.user.id);
    if (!workspace) {
      return res.status(404).json({ error: 'Workspace not found.' });
    }

    const result = await db.query(
      `SELECT d.id, d.workspace_id, d.org_id, d.title, d.content,
              (d.yjs_state IS NOT NULL) AS has_yjs_state,
              d.created_by, d.updated_at, u.name AS author_name
       FROM documents d
       LEFT JOIN users u ON d.created_by = u.id
       WHERE d.workspace_id = $1 AND d.org_id = $2
       ORDER BY d.updated_at DESC, d.id DESC`,
      [workspace.id, workspace.resolved_org_id]
    );

    res.json({ documents: result.rows });
  } catch (error) {
    console.error('List workspace docs error:', error);
    res.status(500).json({ error: 'Failed to retrieve documents.' });
  }
};

/**
 * Create a collaborative document inside an authorized workspace.
 */
const createDoc = async (req, res) => {
  try {
    const parsed = createDocSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid document payload.' });
    }

    const { workspace_id, title, content } = parsed.data;
    const workspace = await resolveAuthorizedResource('workspace', workspace_id, req.user.id);
    if (!workspace) {
      return res.status(404).json({ error: 'Workspace not found.' });
    }

    const result = await db.query(
      `INSERT INTO documents (workspace_id, org_id, title, content, created_by)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, workspace_id, org_id, title, content, created_by, updated_at`,
      [workspace.id, workspace.resolved_org_id, title, content, req.user.id]
    );

    const createdDoc = {
      ...result.rows[0],
      author_name: req.user.name,
    };

    req.app.get('io')?.to(`workspace:${workspace.id}`).emit('docs:changed', {
      action: 'created',
      workspaceId: workspace.id,
      document: createdDoc,
    });

    res.status(201).json({
      document: createdDoc,
    });
  } catch (error) {
    console.error('Create doc error:', error);
    res.status(500).json({ error: 'Failed to create document.' });
  }
};

/**
 * Fetch metadata and text mirror for a single authorized document.
 */
const getDoc = async (req, res) => {
  try {
    const docId = parsePositiveInt(req.params.docId);
    if (!docId) {
      return res.status(400).json({ error: 'Invalid document ID.' });
    }

    const docRecord = await resolveAuthorizedResource('document', docId, req.user.id);
    if (!docRecord) {
      return res.status(404).json({ error: 'Document not found.' });
    }

    const result = await db.query(
      `SELECT d.id, d.workspace_id, d.org_id, d.title, d.content,
              (d.yjs_state IS NOT NULL) AS has_yjs_state,
              d.created_by, d.updated_at, u.name AS author_name
       FROM documents d
       LEFT JOIN users u ON d.created_by = u.id
       WHERE d.id = $1`,
      [docRecord.id]
    );

    res.json({ document: result.rows[0] });
  } catch (error) {
    console.error('Get doc error:', error);
    res.status(500).json({ error: 'Failed to load document.' });
  }
};

/**
 * Rename an authorized document.
 */
const renameDoc = async (req, res) => {
  try {
    const docId = parsePositiveInt(req.params.docId);
    if (!docId) {
      return res.status(400).json({ error: 'Invalid document ID.' });
    }

    const parsed = renameDocSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid document title.' });
    }

    const docRecord = await resolveAuthorizedResource('document', docId, req.user.id);
    if (!docRecord) {
      return res.status(404).json({ error: 'Document not found.' });
    }

    const result = await db.query(
      `UPDATE documents
       SET title = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2
       RETURNING id, workspace_id, org_id, title, content, created_by, updated_at`,
      [parsed.data.title, docRecord.id]
    );

    req.app.get('io')?.to(`workspace:${docRecord.workspace_id}`).emit('docs:changed', {
      action: 'renamed',
      workspaceId: docRecord.workspace_id,
      document: result.rows[0],
    });

    res.json({ document: result.rows[0] });
  } catch (error) {
    console.error('Rename doc error:', error);
    res.status(500).json({ error: 'Failed to update document title.' });
  }
};

/**
 * Delete an authorized document and close any active collaboration sockets for it.
 */
const deleteDoc = async (req, res) => {
  try {
    const docId = parsePositiveInt(req.params.docId);
    if (!docId) {
      return res.status(400).json({ error: 'Invalid document ID.' });
    }

    const docRecord = await resolveAuthorizedResource('document', docId, req.user.id);
    if (!docRecord) {
      return res.status(404).json({ error: 'Document not found.' });
    }

    closeDocumentConnections(docRecord.id);
    await db.query('DELETE FROM documents WHERE id = $1', [docRecord.id]);

    req.app.get('io')?.to(`workspace:${docRecord.workspace_id}`).emit('docs:changed', {
      action: 'deleted',
      workspaceId: docRecord.workspace_id,
      docId: docRecord.id,
    });

    res.json({ deleted: true, id: docRecord.id });
  } catch (error) {
    console.error('Delete doc error:', error);
    res.status(500).json({ error: 'Failed to delete document.' });
  }
};

const snapshotLabelSchema = z.object({
  label: z.string().trim().min(1).max(255).optional(),
});

/**
 * List saved version snapshots for an authorized document.
 */
const listSnapshots = async (req, res) => {
  try {
    const docId = parsePositiveInt(req.params.docId);
    if (!docId) {
      return res.status(400).json({ error: 'Invalid document ID.' });
    }

    const docRecord = await resolveAuthorizedResource('document', docId, req.user.id);
    if (!docRecord) {
      return res.status(404).json({ error: 'Document not found.' });
    }

    const result = await db.query(
      `SELECT s.id, s.document_id, s.label, s.content, s.created_by, s.created_at,
              u.name AS author_name
       FROM document_snapshots s
       LEFT JOIN users u ON s.created_by = u.id
       WHERE s.document_id = $1
       ORDER BY s.created_at DESC, s.id DESC
       LIMIT 30`,
      [docRecord.id]
    );

    res.json({ snapshots: result.rows });
  } catch (error) {
    console.error('List snapshots error:', error);
    res.status(500).json({ error: 'Failed to load snapshots.' });
  }
};

/**
 * Save a point-in-time Yjs binary + plain-text snapshot of a document.
 */
const createSnapshot = async (req, res) => {
  try {
    const docId = parsePositiveInt(req.params.docId);
    if (!docId) {
      return res.status(400).json({ error: 'Invalid document ID.' });
    }

    const parsed = snapshotLabelSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid snapshot label.' });
    }

    const docRecord = await resolveAuthorizedResource('document', docId, req.user.id);
    if (!docRecord) {
      return res.status(404).json({ error: 'Document not found.' });
    }

    const liveState = getLiveDocumentSnapshot(docRecord.id);
    let stateBuf = liveState?.yjsState || docRecord.yjs_state;
    let plainContent = liveState ? liveState.content : (docRecord.content || '');

    if (!stateBuf || stateBuf.length === 0) {
      const tmpDoc = new Y.Doc();
      if (plainContent) seedDocumentContent(tmpDoc, plainContent);
      stateBuf = Buffer.from(Y.encodeStateAsUpdate(tmpDoc));
      tmpDoc.destroy();
    }

    const label =
      parsed.data.label ||
      `Snapshot (${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})`;

    const inserted = await db.query(
      `INSERT INTO document_snapshots (document_id, label, content, yjs_state, created_by)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, document_id, label, content, created_by, created_at`,
      [docRecord.id, label, plainContent, stateBuf, req.user.id]
    );

    res.status(201).json({
      snapshot: { ...inserted.rows[0], author_name: req.user.name },
    });
  } catch (error) {
    console.error('Create snapshot error:', error);
    res.status(500).json({ error: 'Failed to save snapshot.' });
  }
};

/**
 * Restore a document's Yjs state from a saved snapshot and sync live connected clients.
 */
const restoreSnapshot = async (req, res) => {
  try {
    const docId = parsePositiveInt(req.params.docId);
    const snapshotId = parsePositiveInt(req.params.snapshotId);
    if (!docId || !snapshotId) {
      return res.status(400).json({ error: 'Invalid document or snapshot ID.' });
    }

    const docRecord = await resolveAuthorizedResource('document', docId, req.user.id);
    if (!docRecord) {
      return res.status(404).json({ error: 'Document not found.' });
    }

    const snapRes = await db.query(
      'SELECT * FROM document_snapshots WHERE id = $1 AND document_id = $2',
      [snapshotId, docRecord.id]
    );
    if (snapRes.rows.length === 0) {
      return res.status(404).json({ error: 'Snapshot not found.' });
    }

    const snap = snapRes.rows[0];
    const restored = await restoreDocumentSnapshot(docRecord.id, snap.yjs_state);

    res.json({
      restored: true,
      snapshot_id: snap.id,
      content: restored.content,
    });
  } catch (error) {
    console.error('Restore snapshot error:', error);
    res.status(500).json({ error: 'Failed to restore snapshot.' });
  }
};

module.exports = {
  listWorkspaceDocs,
  createDoc,
  getDoc,
  renameDoc,
  deleteDoc,
  listSnapshots,
  createSnapshot,
  restoreSnapshot,
};
