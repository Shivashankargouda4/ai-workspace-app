const fs = require('fs');
const path = require('path');
const {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} = require('@aws-sdk/client-s3');

const UPLOADS_DIR = path.join(__dirname, '../../uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

function isS3Configured() {
  return Boolean(
    process.env.S3_BUCKET &&
      process.env.S3_ACCESS_KEY_ID &&
      process.env.S3_SECRET_ACCESS_KEY
  );
}

let s3ClientInstance = null;
function getS3Client() {
  if (s3ClientInstance) return s3ClientInstance;
  s3ClientInstance = new S3Client({
    region: process.env.S3_REGION || 'auto',
    ...(process.env.S3_ENDPOINT ? { endpoint: process.env.S3_ENDPOINT } : {}),
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY_ID,
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
    },
    forcePathStyle: Boolean(process.env.S3_ENDPOINT),
  });
  return s3ClientInstance;
}

/**
 * Persist an uploaded Multer file to S3/Cloudflare R2 when configured,
 * or retain cleanly on local `server/uploads/` disk when S3 is not configured.
 */
async function saveUploadedFile(multerFile, orgId) {
  if (!isS3Configured()) {
    return multerFile.filename;
  }

  const key = `org-${orgId}/${multerFile.filename}`;
  const buffer = fs.readFileSync(multerFile.path);
  await getS3Client().send(
    new PutObjectCommand({
      Bucket: process.env.S3_BUCKET,
      Key: key,
      Body: buffer,
      ContentType: multerFile.mimetype || 'application/octet-stream',
    })
  );

  // Remove local Multer temp file after uploading to object storage
  if (fs.existsSync(multerFile.path)) {
    fs.unlinkSync(multerFile.path);
  }
  return key;
}

/**
 * Resolve and send a stored file from local disk or S3/R2 object storage.
 */
async function sendStoredFile(storageKey, res) {
  const localPath = path.join(UPLOADS_DIR, path.basename(storageKey));
  if (fs.existsSync(localPath) && !storageKey.startsWith('org-')) {
    return res.sendFile(localPath);
  }

  if (isS3Configured()) {
    const obj = await getS3Client().send(
      new GetObjectCommand({
        Bucket: process.env.S3_BUCKET,
        Key: storageKey,
      })
    );
    const bytes = await obj.Body.transformToByteArray();
    return res.send(Buffer.from(bytes));
  }

  if (fs.existsSync(localPath)) {
    return res.sendFile(localPath);
  }

  const err = new Error('Physical file not found');
  err.code = 'FILE_MISSING';
  throw err;
}

/**
 * Delete a stored file from local disk and/or S3/R2 object storage.
 */
async function deleteStoredFile(storageKey) {
  if (!storageKey) return;

  if (isS3Configured() && storageKey.includes('/')) {
    try {
      await getS3Client().send(
        new DeleteObjectCommand({
          Bucket: process.env.S3_BUCKET,
          Key: storageKey,
        })
      );
    } catch (err) {
      console.warn('S3 delete notice:', err.message);
    }
  }

  const localPath = path.join(UPLOADS_DIR, path.basename(storageKey));
  if (fs.existsSync(localPath)) {
    fs.unlinkSync(localPath);
  }
}

module.exports = {
  UPLOADS_DIR,
  isS3Configured,
  saveUploadedFile,
  sendStoredFile,
  deleteStoredFile,
};
