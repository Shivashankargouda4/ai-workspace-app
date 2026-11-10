const path = require('path');
const { z } = require('zod');
const db = require('../config/db');
const { resolveAuthorizedResource } = require('../utils/tenantAccess');
const { closeCodeConnections } = require('../collab/hocuspocusServer');

const EXT_LANG_MAP = {
  '.js': 'javascript',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.jsx': 'javascript',
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.py': 'python',
  '.html': 'html',
  '.htm': 'html',
  '.css': 'css',
  '.json': 'json',
  '.sql': 'sql',
  '.md': 'markdown',
  '.txt': 'plaintext',
};

function inferLanguage(filePath, explicitLanguage) {
  if (explicitLanguage && EXT_LANG_MAP[`.${explicitLanguage}`] !== undefined) {
    return explicitLanguage;
  }
  const allowed = new Set(Object.values(EXT_LANG_MAP));
  if (explicitLanguage && allowed.has(explicitLanguage.toLowerCase())) {
    return explicitLanguage.toLowerCase();
  }
  const ext = path.extname(filePath || '').toLowerCase();
  return EXT_LANG_MAP[ext] || 'javascript';
}

function sanitizeCodePath(rawPath) {
  const normalized = String(rawPath || '')
    .replace(/\\/g, '/')
    .replace(/^\/+|\/+$/g, '')
    .replace(/\/{2,}/g, '/')
    .trim();
  if (!normalized || normalized.includes('..') || normalized.length > 255) {
    return null;
  }
  return normalized;
}

function parsePositiveInt(value) {
  const num = Number(value);
  return Number.isInteger(num) && num > 0 ? num : null;
}

const createCodeFileSchema = z.object({
  workspace_id: z.coerce.number().int().positive(),
  path: z.string().trim().min(1, 'File path is required').max(255),
  language: z.string().trim().max(50).optional(),
  content: z.string().max(200000).optional().default(''),
});

const updateCodeFileSchema = z.object({
  path: z.string().trim().min(1).max(255).optional(),
  language: z.string().trim().max(50).optional(),
  content: z.string().max(200000).optional(),
});

/**
 * List collaborative IDE files in an authorized workspace.
 */
const listWorkspaceCodeFiles = async (req, res) => {
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
      `SELECT cf.id, cf.workspace_id, cf.org_id, cf.path, cf.language, cf.content,
              (cf.yjs_state IS NOT NULL) AS has_yjs_state,
              cf.created_by, cf.updated_at, u.name AS author_name
       FROM code_files cf
       LEFT JOIN users u ON cf.created_by = u.id
       WHERE cf.workspace_id = $1 AND cf.org_id = $2
       ORDER BY cf.path ASC, cf.id ASC`,
      [workspace.id, workspace.resolved_org_id]
    );

    res.json({ files: result.rows });
  } catch (error) {
    console.error('List code files error:', error);
    res.status(500).json({ error: 'Failed to retrieve code files.' });
  }
};

/**
 * Create a new collaborative code file inside an authorized workspace.
 */
const createCodeFile = async (req, res) => {
  try {
    const parsed = createCodeFileSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid file payload.' });
    }

    const cleanPath = sanitizeCodePath(parsed.data.path);
    if (!cleanPath) {
      return res.status(400).json({ error: 'Invalid file path.' });
    }

    const workspace = await resolveAuthorizedResource('workspace', parsed.data.workspace_id, req.user.id);
    if (!workspace) {
      return res.status(404).json({ error: 'Workspace not found.' });
    }

    const language = inferLanguage(cleanPath, parsed.data.language);
    const result = await db.query(
      `INSERT INTO code_files (workspace_id, org_id, path, language, content, created_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, workspace_id, org_id, path, language, content, created_by, updated_at`,
      [workspace.id, workspace.resolved_org_id, cleanPath, language, parsed.data.content, req.user.id]
    );

    const createdFile = {
      ...result.rows[0],
      author_name: req.user.name,
    };

    req.app.get('io')?.to(`workspace:${workspace.id}`).emit('code:changed', {
      action: 'created',
      workspaceId: workspace.id,
      file: createdFile,
    });

    res.status(201).json({ file: createdFile });
  } catch (error) {
    if (error?.code === '23505') {
      return res.status(409).json({ error: 'A file with this path already exists in the workspace.' });
    }
    console.error('Create code file error:', error);
    res.status(500).json({ error: 'Failed to create code file.' });
  }
};

/**
 * Fetch a single authorized code file.
 */
const getCodeFile = async (req, res) => {
  try {
    const fileId = parsePositiveInt(req.params.fileId);
    if (!fileId) {
      return res.status(400).json({ error: 'Invalid code file ID.' });
    }

    const fileRecord = await resolveAuthorizedResource('code_file', fileId, req.user.id);
    if (!fileRecord) {
      return res.status(404).json({ error: 'Code file not found.' });
    }

    const result = await db.query(
      `SELECT cf.id, cf.workspace_id, cf.org_id, cf.path, cf.language, cf.content,
              (cf.yjs_state IS NOT NULL) AS has_yjs_state,
              cf.created_by, cf.updated_at, u.name AS author_name
       FROM code_files cf
       LEFT JOIN users u ON cf.created_by = u.id
       WHERE cf.id = $1`,
      [fileRecord.id]
    );

    res.json({ file: result.rows[0] });
  } catch (error) {
    console.error('Get code file error:', error);
    res.status(500).json({ error: 'Failed to load code file.' });
  }
};

/**
 * Rename path or update language/content metadata of an authorized code file.
 */
const updateCodeFile = async (req, res) => {
  try {
    const fileId = parsePositiveInt(req.params.fileId);
    if (!fileId) {
      return res.status(400).json({ error: 'Invalid code file ID.' });
    }

    const parsed = updateCodeFileSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid update payload.' });
    }

    const fileRecord = await resolveAuthorizedResource('code_file', fileId, req.user.id);
    if (!fileRecord) {
      return res.status(404).json({ error: 'Code file not found.' });
    }

    const nextPath = parsed.data.path ? sanitizeCodePath(parsed.data.path) : fileRecord.path;
    if (!nextPath) {
      return res.status(400).json({ error: 'Invalid file path.' });
    }
    const nextLang = parsed.data.language
      ? inferLanguage(nextPath, parsed.data.language)
      : parsed.data.path
      ? inferLanguage(nextPath)
      : fileRecord.language;
    const nextContent = parsed.data.content !== undefined ? parsed.data.content : fileRecord.content;

    const result = await db.query(
      `UPDATE code_files
       SET path = $1, language = $2, content = $3, updated_at = CURRENT_TIMESTAMP
       WHERE id = $4
       RETURNING id, workspace_id, org_id, path, language, content, created_by, updated_at`,
      [nextPath, nextLang, nextContent, fileRecord.id]
    );

    const updatedFile = result.rows[0];
    req.app.get('io')?.to(`workspace:${fileRecord.workspace_id}`).emit('code:changed', {
      action: 'updated',
      workspaceId: fileRecord.workspace_id,
      file: updatedFile,
    });

    res.json({ file: updatedFile });
  } catch (error) {
    if (error?.code === '23505') {
      return res.status(409).json({ error: 'Another file with that path already exists.' });
    }
    console.error('Update code file error:', error);
    res.status(500).json({ error: 'Failed to update code file.' });
  }
};

/**
 * Delete an authorized code file and close its Hocuspocus collaboration sockets.
 */
const deleteCodeFile = async (req, res) => {
  try {
    const fileId = parsePositiveInt(req.params.fileId);
    if (!fileId) {
      return res.status(400).json({ error: 'Invalid code file ID.' });
    }

    const fileRecord = await resolveAuthorizedResource('code_file', fileId, req.user.id);
    if (!fileRecord) {
      return res.status(404).json({ error: 'Code file not found.' });
    }

    closeCodeConnections(fileRecord.id);
    await db.query('DELETE FROM code_files WHERE id = $1', [fileRecord.id]);

    req.app.get('io')?.to(`workspace:${fileRecord.workspace_id}`).emit('code:changed', {
      action: 'deleted',
      workspaceId: fileRecord.workspace_id,
      fileId: fileRecord.id,
    });

    res.json({ deleted: true, id: fileRecord.id });
  } catch (error) {
    console.error('Delete code file error:', error);
    res.status(500).json({ error: 'Failed to delete code file.' });
  }
};

module.exports = {
  listWorkspaceCodeFiles,
  createCodeFile,
  getCodeFile,
  updateCodeFile,
  deleteCodeFile,
};
