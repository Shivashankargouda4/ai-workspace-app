const path = require('path');
const fs = require('fs');
const multer = require('multer');
const db = require('../config/db');

// Ensure upload directory exists
const UPLOADS_DIR = path.join(__dirname, '../../uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

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

    const { workspaceId, orgId } = req.body;
    const finalOrgId = orgId || req.orgId || 1;
    const finalWorkspaceId = workspaceId || 1;

    const result = await db.query(
      `INSERT INTO files (workspace_id, org_id, name, path, mime_type, size, uploaded_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        finalWorkspaceId,
        finalOrgId,
        req.file.originalname,
        req.file.filename,
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
    console.error('File upload error:', error);
    res.status(500).json({ error: 'Failed to record uploaded file.' });
  }
};

// List files for a workspace
const getWorkspaceFiles = async (req, res) => {
  try {
    const { workspaceId } = req.params;
    const orgId = req.orgId || 1;

    const result = await db.query(
      `SELECT f.*, u.name as uploader_name, u.email as uploader_email
       FROM files f
       LEFT JOIN users u ON f.uploaded_by = u.id
       WHERE f.workspace_id = $1 AND f.org_id = $2
       ORDER BY f.created_at DESC`,
      [workspaceId, orgId]
    );

    res.json({ files: result.rows });
  } catch (error) {
    console.error('Get files error:', error);
    res.status(500).json({ error: 'Failed to retrieve files.' });
  }
};

// Authenticated download endpoint
const downloadFile = async (req, res) => {
  try {
    const { fileId } = req.params;
    const orgId = req.orgId || 1;

    const result = await db.query(
      `SELECT * FROM files WHERE id = $1 AND org_id = $2`,
      [fileId, orgId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'File not found or access denied.' });
    }

    const fileRecord = result.rows[0];
    const filePath = path.join(UPLOADS_DIR, fileRecord.path);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Physical file not found on disk.' });
    }

    res.setHeader('Content-Type', fileRecord.mime_type || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileRecord.name)}"`);
    res.sendFile(filePath);
  } catch (error) {
    console.error('Download file error:', error);
    res.status(500).json({ error: 'Failed to download file.' });
  }
};

module.exports = {
  upload,
  uploadFile,
  getWorkspaceFiles,
  downloadFile,
};
