const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '../data/neon.db');

let SQL = null;
let _db = null;
let _inTransaction = false;

function saveDb() {
  const data = _db.export();
  fs.writeFileSync(DB_PATH, Buffer.from(data));
}

function initDb(sqlInstance) {
  SQL = sqlInstance;
  const dataDir = path.join(__dirname, '../data');
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

  if (fs.existsSync(DB_PATH)) {
    _db = new SQL.Database(fs.readFileSync(DB_PATH));
  } else {
    _db = new SQL.Database();
  }

  _db.run('CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL, passwordHash TEXT NOT NULL, token TEXT NOT NULL, isAdmin INTEGER DEFAULT 0, createdAt TEXT NOT NULL)');

  _db.run('CREATE TABLE IF NOT EXISTS images (id TEXT PRIMARY KEY, userId TEXT NOT NULL DEFAULT \'\', name TEXT NOT NULL, size INTEGER NOT NULL DEFAULT 0, url TEXT NOT NULL, thumbUrl TEXT DEFAULT \'\', thumbFilename TEXT DEFAULT \'\', width INTEGER DEFAULT 0, height INTEGER DEFAULT 0, uploadedAt TEXT NOT NULL, isGuest INTEGER DEFAULT 0, guestToken TEXT DEFAULT \'\', expiresAt TEXT DEFAULT \'\', moderationStatus TEXT DEFAULT \'PASS\', moderationScore REAL DEFAULT 0, moderationTags TEXT DEFAULT \'[]\', moderationAt TEXT DEFAULT \'\', tags TEXT DEFAULT \'[]\')');

  _db.run('CREATE INDEX IF NOT EXISTS idx_images_userId ON images(userId)');
  _db.run('CREATE INDEX IF NOT EXISTS idx_images_uploadedAt ON images(uploadedAt DESC)');

  _db.run('CREATE TABLE IF NOT EXISTS trash (id TEXT PRIMARY KEY, userId TEXT NOT NULL DEFAULT \'\', name TEXT NOT NULL, size INTEGER NOT NULL DEFAULT 0, url TEXT NOT NULL, thumbUrl TEXT DEFAULT \'\', thumbFilename TEXT DEFAULT \'\', uploadedAt TEXT NOT NULL, deletedAt TEXT NOT NULL, isGuest INTEGER DEFAULT 0, guestToken TEXT DEFAULT \'\', moderationStatus TEXT DEFAULT \'PASS\', moderationScore REAL DEFAULT 0, moderationTags TEXT DEFAULT \'[]\', tags TEXT DEFAULT \'[]\')');

  _db.run('CREATE INDEX IF NOT EXISTS idx_trash_userId ON trash(userId)');

  try { _db.run('PRAGMA foreign_keys = ON'); } catch (e) { /* sql.js 不支持此 pragma */ }

  saveDb();
}

function getDb() {
  if (!_db) throw new Error('// DATABASE NOT INITIALIZED');

  return {
    prepare(sql) {
      const stmt = _db.prepare(sql);
      return {
        run(params) {
          stmt.bind(params || {});
          stmt.step();
          if (!_inTransaction) saveDb();
        },
        get(params) {
          stmt.bind(params || {});
          var ok = stmt.step();
          return ok ? stmt.getAsObject() : null;
        },
        all(params) {
          stmt.bind(params || {});
          var rows = [];
          while (stmt.step()) rows.push(stmt.getAsObject());
          return rows;
        }
      };
    },
    exec(sql) {
      _db.exec(sql);
      if (!_inTransaction) saveDb();
    },
    transaction(fn) {
      return function () {
        _db.run('BEGIN');
        _inTransaction = true;
        try {
          fn.apply(null, arguments);
          _db.run('COMMIT');
          saveDb();
        } catch (e) {
          _db.run('ROLLBACK');
          throw e;
        } finally {
          _inTransaction = false;
        }
      };
    },
    _raw: _db
  };
}

module.exports = { initDb, getDb, saveDb, DB_PATH };
