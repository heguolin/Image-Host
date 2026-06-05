const { getDb } = require('./db');

// JSON 字段辅助
function parseJson(str, fallback) {
  try { return JSON.parse(str); } catch (e) { return fallback; }
}
function serializeJson(val) {
  return JSON.stringify(val || []);
}

// 行转对象
function rowToImage(row) {
  if (!row) return null;
  return {
    ...row,
    isGuest: !!row.isGuest,
    tags: parseJson(row.tags, []),
    moderationTags: parseJson(row.moderationTags, [])
  };
}

function rowToTrash(row) {
  if (!row) return null;
  return {
    ...row,
    isGuest: !!row.isGuest,
    tags: parseJson(row.tags, []),
    moderationTags: parseJson(row.moderationTags, [])
  };
}

// 把 item 对象转为 SQL 参数
function imageParams(item) {
  return {
    '@id': item.id,
    '@userId': item.userId || '',
    '@name': item.name,
    '@size': item.size || 0,
    '@url': item.url,
    '@thumbUrl': item.thumbUrl || '',
    '@thumbFilename': item.thumbFilename || '',
    '@width': item.width || 0,
    '@height': item.height || 0,
    '@uploadedAt': item.uploadedAt,
    '@isGuest': item.isGuest ? 1 : 0,
    '@guestToken': item.guestToken || '',
    '@expiresAt': item.expiresAt || '',
    '@moderationStatus': item.moderationStatus || 'PASS',
    '@moderationScore': item.moderationScore || 0,
    '@moderationTags': serializeJson(item.moderationTags),
    '@moderationAt': item.moderationAt || '',
    '@tags': serializeJson(item.tags)
  };
}

function trashParams(item) {
  return {
    '@id': item.id,
    '@userId': item.userId || '',
    '@name': item.name,
    '@size': item.size || 0,
    '@url': item.url,
    '@thumbUrl': item.thumbUrl || '',
    '@thumbFilename': item.thumbFilename || '',
    '@uploadedAt': item.uploadedAt,
    '@deletedAt': item.deletedAt,
    '@isGuest': item.isGuest ? 1 : 0,
    '@guestToken': item.guestToken || '',
    '@moderationStatus': item.moderationStatus || 'PASS',
    '@moderationScore': item.moderationScore || 0,
    '@moderationTags': serializeJson(item.moderationTags),
    '@tags': serializeJson(item.tags)
  };
}

// ---- images ----

const INSERT_IMAGE = `INSERT OR REPLACE INTO images
  (id, userId, name, size, url, thumbUrl, thumbFilename,
   width, height, uploadedAt, isGuest, guestToken, expiresAt,
   moderationStatus, moderationScore, moderationTags, moderationAt, tags)
  VALUES
  (@id, @userId, @name, @size, @url, @thumbUrl, @thumbFilename,
   @width, @height, @uploadedAt, @isGuest, @guestToken, @expiresAt,
   @moderationStatus, @moderationScore, @moderationTags, @moderationAt, @tags)`;

function readMeta() {
  return getDb().prepare('SELECT * FROM images ORDER BY uploadedAt DESC')
    .all().map(rowToImage);
}

function writeMeta(list) {
  const db = getDb();
  const insertOne = db.prepare(INSERT_IMAGE);
  const replaceAll = db.transaction(function (items) {
    db.prepare('DELETE FROM images').run();
    for (var i = 0; i < items.length; i++) {
      insertOne.run(imageParams(items[i]));
    }
  });
  replaceAll(list);
}

function appendMeta(item) {
  getDb().prepare(INSERT_IMAGE).run(imageParams(item));
}

// ---- trash ----

const INSERT_TRASH = `INSERT OR REPLACE INTO trash
  (id, userId, name, size, url, thumbUrl, thumbFilename,
   uploadedAt, deletedAt, isGuest, guestToken,
   moderationStatus, moderationScore, moderationTags, tags)
  VALUES
  (@id, @userId, @name, @size, @url, @thumbUrl, @thumbFilename,
   @uploadedAt, @deletedAt, @isGuest, @guestToken,
   @moderationStatus, @moderationScore, @moderationTags, @tags)`;

function readTrash() {
  return getDb().prepare('SELECT * FROM trash ORDER BY deletedAt DESC')
    .all().map(rowToTrash);
}

function writeTrash(list) {
  var db = getDb();
  var insertOne = db.prepare(INSERT_TRASH);
  var replaceAll = db.transaction(function (items) {
    db.prepare('DELETE FROM trash').run();
    for (var i = 0; i < items.length; i++) {
      insertOne.run(trashParams(items[i]));
    }
  });
  replaceAll(list);
}

// ---- tags ----

function readTags() {
  var rows = getDb().prepare('SELECT tags FROM images').all();
  var tagSet = new Set();
  rows.forEach(function (r) {
    parseJson(r.tags, []).forEach(function (t) { tagSet.add(t); });
  });
  return Array.from(tagSet);
}

function writeTags() { /* SQLite 模式：tags 实时从 images 聚合，无需单独写入 */ }

function appendTag(tag) { /* SQLite 模式：tags 通过 appendMeta / 标签接口维护 */ }

// ---- folders ----

const INSERT_FOLDER = 'INSERT OR REPLACE INTO folders (id, userId, name, parentId, sortOrder, createdAt) VALUES (@id, @userId, @name, @parentId, @sortOrder, @createdAt)';

function folderParams(item) {
  return {
    '@id': item.id,
    '@userId': item.userId || '',
    '@name': item.name,
    '@parentId': item.parentId || '',
    '@sortOrder': typeof item.sortOrder === 'number' ? item.sortOrder : 0,
    '@createdAt': item.createdAt
  };
}

function readFolders(userId) {
  return getDb().prepare(
    'SELECT f.*, (SELECT COUNT(*) FROM images WHERE folderId = f.id AND userId = f.userId) AS imageCount FROM folders f WHERE f.userId = ? ORDER BY f.sortOrder, f.name'
  ).all([userId]);
}

function getFolderById(id, userId) {
  return getDb().prepare('SELECT * FROM folders WHERE id = ? AND userId = ?').get([id, userId]);
}

function createFolder(item) {
  getDb().prepare(INSERT_FOLDER).run(folderParams(item));
}

function updateFolder(id, userId, name) {
  getDb().prepare('UPDATE folders SET name = ? WHERE id = ? AND userId = ?').run([name, id, userId]);
}

function deleteFolder(id, userId) {
  var db = getDb();
  var tx = db.transaction(function () {
    // 文件夹内图片移回根目录
    db.prepare('UPDATE images SET folderId = \'\' WHERE folderId = ? AND userId = ?').run([id, userId]);
    db.prepare('DELETE FROM folders WHERE id = ? AND userId = ?').run([id, userId]);
  });
  tx();
}

function moveImage(imageId, userId, folderId) {
  var db = getDb();
  // 校验图片归属
  var img = db.prepare('SELECT id FROM images WHERE id = ? AND userId = ?').get([imageId, userId]);
  if (!img) return false;
  // 如果 folderId 非空，校验文件夹归属
  if (folderId) {
    var folder = db.prepare('SELECT id FROM folders WHERE id = ? AND userId = ?').get([folderId, userId]);
    if (!folder) return false;
  }
  db.prepare('UPDATE images SET folderId = ? WHERE id = ? AND userId = ?').run([folderId, imageId, userId]);
  return true;
}

function batchMoveImages(ids, userId, folderId) {
  var db = getDb();
  // 校验文件夹归属
  if (folderId) {
    var folder = db.prepare('SELECT id FROM folders WHERE id = ? AND userId = ?').get([folderId, userId]);
    if (!folder) return { moved: 0, msg: '// FOLDER NOT FOUND' };
  }
  var moved = 0;
  var tx = db.transaction(function () {
    for (var i = 0; i < ids.length; i++) {
      var img = db.prepare('SELECT id FROM images WHERE id = ? AND userId = ?').get([ids[i], userId]);
      if (!img) continue;
      db.prepare('UPDATE images SET folderId = ? WHERE id = ? AND userId = ?').run([folderId, ids[i], userId]);
      moved++;
    }
  });
  tx();
  return { moved: moved };
}

module.exports = {
  readMeta, writeMeta, appendMeta,
  readTrash, writeTrash,
  readTags, writeTags, appendTag,
  readFolders, createFolder, getFolderById, updateFolder, deleteFolder,
  moveImage, batchMoveImages
};
