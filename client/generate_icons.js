// Generate valid 192x192 and 512x512 PNG app icons for PWA using Node.js built-in zlib
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Standard CRC32 implementation for PNG chunks
function crc32(buf) {
  let table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c;
  }

  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function makeChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);

  const typeBuf = Buffer.from(type, 'ascii');
  const crcInput = Buffer.concat([typeBuf, data]);
  const crcVal = crc32(crcInput);

  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crcVal, 0);

  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function createPng(size, primaryColor = [2, 132, 199], accentColor = [255, 255, 255]) {
  const width = size;
  const height = size;

  // Raw uncompressed bitmap: each row has 1 filter byte (0) + width * 4 bytes (RGBA)
  const rowLength = 1 + width * 4;
  const rawData = Buffer.alloc(height * rowLength);

  const center = size / 2;
  const radius = size * 0.45;
  const innerRadius = size * 0.25;

  for (let y = 0; y < height; y++) {
    const rowOffset = y * rowLength;
    rawData[rowOffset] = 0; // Filter byte 0 (None)

    for (let x = 0; x < width; x++) {
      const pxOffset = rowOffset + 1 + x * 4;
      const dx = x - center;
      const dy = y - center;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist <= radius) {
        if (Math.abs(dx) < size * 0.15 && Math.abs(dy) < size * 0.15) {
          // Center W/logo motif
          rawData[pxOffset] = accentColor[0];
          rawData[pxOffset + 1] = accentColor[1];
          rawData[pxOffset + 2] = accentColor[2];
          rawData[pxOffset + 3] = 255;
        } else {
          // Primary circle background
          rawData[pxOffset] = primaryColor[0];
          rawData[pxOffset + 1] = primaryColor[1];
          rawData[pxOffset + 2] = primaryColor[2];
          rawData[pxOffset + 3] = 255;
        }
      } else {
        // Transparent corner outside circle
        rawData[pxOffset] = 0;
        rawData[pxOffset + 1] = 0;
        rawData[pxOffset + 2] = 0;
        rawData[pxOffset + 3] = 0;
      }
    }
  }

  const compressedData = zlib.deflateSync(rawData);

  // PNG Signature
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  // IHDR chunk: width(4), height(4), bit depth(1=8), color type(1=6 RGBA), comp(1=0), filter(1=0), interlace(1=0)
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8;  // 8-bit
  ihdrData[9] = 6;  // RGBA
  ihdrData[10] = 0; // Deflate
  ihdrData[11] = 0; // Filter
  ihdrData[12] = 0; // No interlace
  const ihdrChunk = makeChunk('IHDR', ihdrData);

  // IDAT chunk
  const idatChunk = makeChunk('IDAT', compressedData);

  // IEND chunk
  const iendChunk = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

const publicDir = path.join(__dirname, 'public');
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

fs.writeFileSync(path.join(publicDir, 'icon-192.png'), createPng(192));
fs.writeFileSync(path.join(publicDir, 'icon-512.png'), createPng(512));
console.log('Successfully generated public/icon-192.png and public/icon-512.png');
