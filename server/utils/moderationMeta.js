const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const LOG_PATH = path.join(DATA_DIR, 'moderation_log.json');

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function readModerationLog() {
  ensureDir();
  try {
    if (fs.existsSync(LOG_PATH)) {
      const raw = fs.readFileSync(LOG_PATH, 'utf8');
      return JSON.parse(raw);
    }
  } catch (e) {
    console.warn('[NEON.IMG] Failed to read moderation log:', e.message);
  }
  return [];
}

function writeModerationLog(list) {
  ensureDir();
  fs.writeFileSync(LOG_PATH, JSON.stringify(list, null, 2), 'utf8');
}

function appendModerationLog(entry) {
  const list = readModerationLog();
  list.unshift(entry);

  // 清理过期日志
  const retentionDays = parseInt(process.env.MODERATION_LOG_RETENTION_DAYS, 10) || 180;
  const cutoff = new Date(Date.now() - retentionDays * 86400000);
  const valid = list.filter(function (item) {
    return new Date(item.createdAt) > cutoff;
  });

  writeModerationLog(valid);
}

module.exports = { readModerationLog, writeModerationLog, appendModerationLog };
