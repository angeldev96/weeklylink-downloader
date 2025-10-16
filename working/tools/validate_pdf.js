const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function hex(bytes) {
  return bytes.toString('hex');
}

function fileExists(p) {
  try { return fs.existsSync(p); } catch (e) { return false; }
}

function readMetadata(cacheDir) {
  const metaPath = path.join(cacheDir, 'metadata.json');
  if (!fileExists(metaPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(metaPath, 'utf8'));
  } catch (e) {
    console.error('Failed to read metadata.json:', e.message);
    return null;
  }
}

function checksumFile(filePath) {
  const hash = crypto.createHash('sha256');
  const data = fs.readFileSync(filePath);
  hash.update(data);
  return hash.digest('hex');
}

function magicHeaderMatches(filePath) {
  const fd = fs.openSync(filePath, 'r');
  const buf = Buffer.alloc(4);
  fs.readSync(fd, buf, 0, 4, 0);
  fs.closeSync(fd);
  return buf.toString('utf8').startsWith('%PDF');
}

function validateCachedPdf() {
  const cacheDir = path.join(__dirname, '..', 'cache');
  const meta = readMetadata(cacheDir);
  if (!meta) {
    console.error('No metadata.json found in cache.');
    process.exit(2);
  }

  const filePath = path.join(cacheDir, meta.fileName);
  if (!fileExists(filePath)) {
    console.error('Cached file not found:', filePath);
    process.exit(2);
  }

  const stats = fs.statSync(filePath);
  console.log('File:', filePath);
  console.log('Size (bytes):', stats.size);
  console.log('Size (MB):', (stats.size / 1024 / 1024).toFixed(2));

  const matchesMagic = magicHeaderMatches(filePath);
  console.log('Magic header starts with %PDF:', matchesMagic);

  const computed = checksumFile(filePath);
  console.log('Computed sha256:', computed);
  if (meta.checksum) {
    console.log('Metadata checksum:', meta.checksum);
    console.log('Checksum matches metadata:', computed === meta.checksum);
  } else {
    console.log('No checksum in metadata to compare.');
  }

  if (!matchesMagic) {
    console.error('\nThe file does not start with %PDF. It may be corrupted or not a PDF.');
    process.exit(3);
  }

  console.log('\nValidation completed.');
}

if (require.main === module) {
  validateCachedPdf();
}
