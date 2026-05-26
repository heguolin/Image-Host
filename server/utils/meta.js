const fs = require('fs');
const path = require('path');

const META_FILE = path.join(__dirname, '../data/images.json');

function readMeta() {
  if (!fs.existsSync(META_FILE)) return [];
  try {
    return JSON.parse(fs.readFileSync(META_FILE, 'utf-8'));
  } catch {
    return [];
  }
}

function writeMeta(list) {
  fs.writeFileSync(META_FILE, JSON.stringify(list, null, 2));
}

module.exports = { readMeta, writeMeta };