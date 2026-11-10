const path = require('path');
const fs = require('fs');
const multer = require('multer');
const db = require('../config/db');
const { resolveAuthorizedResource } = require('../utils/tenantAccess');
const {
  UPLOADS_DIR,
  saveUploadedFile,
  sendStoredFile,
  deleteStoredFile,
} = require('../utils/fileStorage');

const cleanupTempUpload = (file) => {
  if (file && file.path && fs.existsSync(file.path)) {
    try {
      fs.unlinkSync(file.path);
    } catch (unlinkErr) {
      console.warn('Temp upload cleanup notice:', unlinkErr.message);
    }
  }
};

// Storage configuration with sanitized filenames
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `file-${uniqueSuffix}${ext}`);
  },
});

// File filter whitelist
const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'text/csv',
  'application/json',
  'application/zip',
];

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB limit
  fileFilter: (req, file, cb) => {
    if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`File type ${file.mimetype} is not supported.`));
    }
  },
});

// Upload a new file
const uploadFile = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded.' });
    }

    const { workspaceId } = req.body;
    if (!workspaceId) {
      cleanupTempUpload(req.file);
      return res.status(400).json({ error: 'Workspace ID is required.' });
    }

    const workspace = await resolveAuthorizedResource('workspace', workspaceId, req.user.id);
    if (!workspace) {
      cleanupTempUpload(req.file);
      return res.status(404).json({ error: 'Workspace not found.' });
    }

    const storedPath = await saveUploadedFile(req.file, workspace.resolved_org_id);

    const result = await db.query(
      `INSERT INTO files (workspace_id, org_id, name, path, mime_type, size, uploaded_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        workspace.id,
        workspace.resolved_org_id,
        req.file.originalname,
        storedPath,
        req.file.mimetype,
        req.file.size,
        req.user.id,
      ]
    );

    res.status(201).json({
      message: 'File uploaded successfully.',
      file: result.rows[0],
    });
  } catch (error) {
    cleanupTempUpload(req.file);
    console.error('File upload error:', error);
    res.status(500).json({ error: 'Failed to record uploaded file.' });
  }
};

// List files for a workspace
const getWorkspaceFiles = async (req, res) => {
  try {
    const workspace = await resolveAuthorizedResource('workspace', req.params.workspaceId, req.user.id);
    if (!workspace) {
      return res.status(404).json({ error: 'Workspace not found.' });
    }

    const result = await db.query(
      `SELECT f.*, u.name as uploader_name, u.email as uploader_email
       FROM files f
       LEFT JOIN users u ON f.uploaded_by = u.id
       WHERE f.workspace_id = $1 AND f.org_id = $2
       ORDER BY f.created_at DESC`,
      [workspace.id, workspace.resolved_org_id]
    );

    res.json({ files: result.rows });
  } catch (error) {
    console.error('Get files error:', error);
    res.status(500).json({ error: 'Failed to retrieve files.' });
  }
};

// Authenticated download & inline preview endpoint
const downloadFile = async (req, res) => {
  try {
    const fileRecord = await resolveAuthorizedResource('file', req.params.fileId, req.user.id);
    if (!fileRecord) {
      return res.status(404).json({ error: 'File not found or access denied.' });
    }

    const disposition = req.query.inline === '1' ? 'inline' : 'attachment';
    res.setHeader('Content-Type', fileRecord.mime_type || 'application/octet-stream');
    res.setHeader('Content-Disposition', `${disposition}; filename="${encodeURIComponent(fileRecord.name)}"`);
    await sendStoredFile(fileRecord.path, res);
  } catch (error) {
    if (error.code === 'FILE_MISSING') {
      return res.status(404).json({ error: 'Physical file not found in storage.' });
    }
    console.error('Download file error:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to download file.' });
    }
  }
};

// Delete file (uploader, manager, or admin only)
const deleteFile = async (req, res) => {
  try {
    const fileRecord = await resolveAuthorizedResource('file', req.params.fileId, req.user.id);
    if (!fileRecord) {
      return res.status(404).json({ error: 'File not found or access denied.' });
    }

    const canDelete =
      fileRecord.uploaded_by === req.user.id ||
      fileRecord.member_role === 'admin' ||
      fileRecord.member_role === 'manager';

    if (!canDelete) {
      return res.status(403).json({
        error: 'Only the uploader, a manager, or an admin can delete this file.',
      });
    }

    await deleteStoredFile(fileRecord.path);
    await db.query('DELETE FROM files WHERE id = $1', [fileRecord.id]);

    res.json({ deleted: true, id: fileRecord.id });
  } catch (error) {
    console.error('Delete file error:', error);
    res.status(500).json({ error: 'Failed to delete file.' });
  }
};

module.exports = {
  upload,
  uploadFile,
  getWorkspaceFiles,
  downloadFile,
  deleteFile,
};
