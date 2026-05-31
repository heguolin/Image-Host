const express = require('express');
const fs = require('fs');
const path = require('path');
const { nanoid } = require('nanoid');
const upload = require('../middleware/multerConfig');
const processImage = require('../utils/imageProcess');
const { readMeta, writeMeta, appendMeta, readTrash, writeTrash, readTags, appendTag } = require('../utils/meta');
const { verifyJWT, verifyAuth } = require('../middleware/auth');
const { moderate } = require('../utils/moderator');
const { appendModerationLog } = require('../utils/moderationMeta');

const router = express.Router();

/** 删除缩略图文件（如果存在） */
function deleteThumb(item) {
  const thumbName = item.thumbFilename || item.id.replace(/\.\w+$/, '') + '_thumb.webp';
  const thumbPath = path.join(__dirname, '../uploads', thumbName);
  if (fs.existsSync(thumbPath)) fs.unlinkSync(thumbPath);
}

// ---------- 游客 IP 限流（内存 Map，服务重启后重置）----------
const guestIpMap = new Map();

function getTodayKey() {
  const now = new Date();
  return now.getFullYear() + '-' + (now.getMonth() + 1) + '-' + now.getDate();
}

function checkGuestIpLimit(ip) {
  const dailyLimit = parseInt(process.env.GUEST_DAILY_LIMIT, 10) || 20;
  const today = getTodayKey();
  const record = guestIpMap.get(ip);
  if (!record || record.date !== today) {
    guestIpMap.set(ip, { date: today, count: 0 });
    return true;
  }
  return record.count < dailyLimit;
}

function incGuestIp(ip) {
  const today = getTodayKey();
  const record = guestIpMap.get(ip);
  if (!record || record.date !== today) {
    guestIpMap.set(ip, { date: today, count: 1 });
  } else {
    record.count++;
  }
}

/** 懒清理过期游客图片 */
function cleanExpiredGuest(list) {
  const now = new Date();
  const valid = [];
  const expired = [];
  list.forEach(function (item) {
    if (item.isGuest && item.expiresAt && new Date(item.expiresAt) <= now) {
      expired.push(item);
    } else {
      valid.push(item);
    }
  });
  expired.forEach(function (item) {
    const filePath = path.join(__dirname, '../uploads', item.id);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    deleteThumb(item);
  });
  return valid;
}

// 上传（支持多文件，字段名 files）
router.post('/upload', verifyAuth, upload.array('files', 10), async (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ code: 1, msg: '没有上传文件' });
  }

  const host = `${req.protocol}://${req.get('host')}`;

  const results = [];
  for (const f of req.files) {
    const result = await processImage(f.buffer, f.originalname);
    const filePath = path.join(__dirname, '../uploads', result.filename);

    // 审核管线
    const modResult = await moderate(filePath, f.originalname);

    const item = {
      id: result.filename,
      userId: req.user.id,
      name: f.originalname,
      size: result.size,
      width: result.width,
      height: result.height,
      url: `${host}/i/${result.filename}`,
      uploadedAt: new Date().toISOString(),
      moderationStatus: modResult.status,
      moderationScore: modResult.score,
      moderationTags: modResult.tags,
      moderationAt: new Date().toISOString()
    };
    if (result.thumbFilename) {
      item.thumbUrl = `${host}/i/${result.thumbFilename}`;
      item.thumbFilename = result.thumbFilename;
    }

    // 审核日志
    var logAction = modResult.status === 'PASS' ? 'AUTO_PASS'
      : modResult.status === 'REJECT' ? 'AUTO_REJECT' : 'NEED_REVIEW';
    appendModerationLog({
      id: nanoid(10),
      imageId: item.id,
      action: logAction,
      operator: 'system',
      score: modResult.score,
      tags: modResult.tags,
      reason: '',
      createdAt: new Date().toISOString()
    });

    // REJECT 不入库，但仍返回给前端标记 rejected
    if (modResult.status === 'REJECT') {
      results.push({ rejected: true, name: f.originalname, reason: modResult.tags.join(', ') });
    } else {
      appendMeta(item);
      results.push(item);
    }
  }

  res.json({ code: 0, msg: 'ok', data: results });
});

// 列表（仅返回当前用户数据，顺带清理过期游客图片，过滤 REJECT 条目）
router.get('/list', verifyJWT, (req, res) => {
  var all = readMeta();
  // 懒清理过期游客图片
  var before = all.length;
  all = cleanExpiredGuest(all);
  if (all.length !== before) writeMeta(all);
  const data = all.filter(function (x) {
    return x.userId === req.user.id && x.moderationStatus !== 'REJECT';
  }).map(function (item) {
    item.tags = item.tags || [];
    return item;
  });
  res.json({ code: 0, data });
});

// 删除（软删除 → 移入回收站，校验 userId）
router.delete('/image/:id', verifyAuth, (req, res) => {
  const { id } = req.params;
  const list = readMeta();
  const idx = list.findIndex(x => x.id === id);
  if (idx === -1) return res.status(404).json({ code: 1, msg: '不存在' });
  if (list[idx].userId !== req.user.id) {
    return res.status(403).json({ code: 403, msg: '// ACCESS DENIED // NOT YOUR PACKET' });
  }

  const [item] = list.splice(idx, 1);
  writeMeta(list);

  item.deletedAt = new Date().toISOString();
  const trash = readTrash();
  trash.unshift(item);
  writeTrash(trash);

  res.json({ code: 0, msg: '已移入回收站' });
});

// 回收站列表（仅返回当前用户数据，仅清理当前用户过期条目）
router.get('/trash', verifyJWT, (req, res) => {
  const all = readTrash();
  const now = new Date();
  const valid = [];
  const expired = [];

  all.forEach(item => {
    if (item.userId !== req.user.id) return; // 跳过他人数据
    const deletedAt = new Date(item.deletedAt);
    const daysPassed = (now - deletedAt) / (1000 * 60 * 60 * 24);
    if (daysPassed >= 30) {
      expired.push(item);
    } else {
      item.daysLeft = Math.ceil(30 - daysPassed);
      valid.push(item);
    }
  });

  if (expired.length > 0) {
    expired.forEach(item => {
      const filePath = path.join(__dirname, '../uploads', item.id);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      deleteThumb(item);
    });
    // 写回：保留他人数据 + 当前用户有效数据
    const others = all.filter(x => x.userId !== req.user.id);
    writeTrash(others.concat(valid));
  }

  res.json({ code: 0, data: valid });
});

// 恢复（校验 userId）
router.post('/restore/:id', verifyAuth, (req, res) => {
  const { id } = req.params;
  const trash = readTrash();
  const idx = trash.findIndex(x => x.id === id);
  if (idx === -1) return res.status(404).json({ code: 1, msg: '不存在' });
  if (trash[idx].userId !== req.user.id) {
    return res.status(403).json({ code: 403, msg: '// ACCESS DENIED // NOT YOUR PACKET' });
  }

  const [item] = trash.splice(idx, 1);
  writeTrash(trash);

  delete item.deletedAt;
  delete item.daysLeft;

  const list = readMeta();
  list.unshift(item);
  writeMeta(list);

  res.json({ code: 0, msg: '已恢复' });
});

// 重命名（校验 userId）
router.patch('/image/:id/rename', verifyAuth, (req, res) => {
  const { id } = req.params;
  const { name } = req.body;

  // 校验
  if (!name || name.trim() === '') {
    return res.status(400).json({ code: 1, msg: '// 文件名不能为空' });
  }
  if (name.trim().length > 100) {
    return res.status(400).json({ code: 1, msg: '// 文件名不能超过 100 字符' });
  }
  if (!/^[一-龥a-zA-Z0-9 _\-\.]{1,100}$/.test(name.trim())) {
    return res.status(400).json({ code: 1, msg: '// 文件名含非法字符' });
  }

  const list = readMeta();
  const idx = list.findIndex(x => x.id === id);
  if (idx === -1) return res.status(404).json({ code: 1, msg: '// 图片不存在' });
  if (list[idx].userId !== req.user.id) {
    return res.status(403).json({ code: 403, msg: '// ACCESS DENIED // NOT YOUR PACKET' });
  }

  list[idx].name = name.trim();
  writeMeta(list);

  res.json({ code: 0, data: { id: list[idx].id, name: list[idx].name } });
});

// 永久删除（校验 userId）
router.delete('/purge/:id', verifyAuth, (req, res) => {
  const { id } = req.params;
  const trash = readTrash();
  const idx = trash.findIndex(x => x.id === id);
  if (idx === -1) return res.status(404).json({ code: 1, msg: '不存在' });
  if (trash[idx].userId !== req.user.id) {
    return res.status(403).json({ code: 403, msg: '// ACCESS DENIED // NOT YOUR PACKET' });
  }

  const [item] = trash.splice(idx, 1);
  writeTrash(trash);

  const filePath = path.join(__dirname, '../uploads', id);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  deleteThumb(item);

  res.json({ code: 0, msg: '已永久删除' });
});

// ---------- 游客上传 ----------

const GUEST_FORMATS = ['.jpg', '.jpeg', '.png', '.webp'];

router.post('/guest/upload', upload.array('files', 3), async (req, res) => {
  // 游客模式开关
  if (process.env.GUEST_ENABLED !== 'true') {
    return res.status(403).json({ code: 403, msg: '// GUEST MODE DISABLED' });
  }

  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ code: 1, msg: '没有上传文件' });
  }

  const ip = req.ip || req.socket.remoteAddress || 'unknown';

  // IP 每日限流
  if (!checkGuestIpLimit(ip)) {
    return res.status(429).json({ code: 429, msg: '// GUEST LIMIT EXCEEDED // 20 UPLOADS PER DAY' });
  }

  const guestMaxSize = parseInt(process.env.GUEST_MAX_FILE_SIZE, 10) || 10 * 1024 * 1024;
  const retentionDays = parseInt(process.env.GUEST_RETENTION_DAYS, 10) || 30;
  const host = `${req.protocol}://${req.get('host')}`;

  const results = [];
  for (const f of req.files) {
    // 格式限制
    const ext = path.extname(f.originalname).toLowerCase();
    if (!GUEST_FORMATS.includes(ext)) {
      continue; // 跳过不支持的格式
    }
    // 大小限制
    if (f.size > guestMaxSize) {
      continue;
    }

    const result = await processImage(f.buffer, f.originalname);
    const filePath = path.join(__dirname, '../uploads', result.filename);

    // 审核管线
    const modResult = await moderate(filePath, f.originalname);

    const item = {
      id: result.filename,
      userId: 'guest',
      isGuest: true,
      guestToken: nanoid(24),
      name: f.originalname,
      size: result.size,
      width: result.width,
      height: result.height,
      url: `${host}/i/${result.filename}`,
      uploadedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + retentionDays * 86400000).toISOString(),
      moderationStatus: modResult.status,
      moderationScore: modResult.score,
      moderationTags: modResult.tags,
      moderationAt: new Date().toISOString()
    };
    if (result.thumbFilename) {
      item.thumbUrl = `${host}/i/${result.thumbFilename}`;
      item.thumbFilename = result.thumbFilename;
    }

    // 审核日志
    var logAction = modResult.status === 'PASS' ? 'AUTO_PASS'
      : modResult.status === 'REJECT' ? 'AUTO_REJECT' : 'NEED_REVIEW';
    appendModerationLog({
      id: nanoid(10),
      imageId: item.id,
      action: logAction,
      operator: 'system',
      score: modResult.score,
      tags: modResult.tags,
      reason: '',
      createdAt: new Date().toISOString()
    });

    if (modResult.status === 'REJECT') {
      results.push({ rejected: true, name: f.originalname, reason: modResult.tags.join(', ') });
    } else {
      appendMeta(item);
      results.push(item);
    }
  }

  if (results.length === 0) {
    return res.status(400).json({ code: 1, msg: '// NO VALID FILES // USE PNG JPG WEBP ≤10MB' });
  }

  incGuestIp(ip);
  res.json({ code: 0, msg: 'ok', data: results });
});

// 游客删除（需要 guestToken）
router.delete('/guest/image/:id', (req, res) => {
  const { id } = req.params;
  const token = req.query.guestToken || (req.body && req.body.guestToken) || '';

  const list = readMeta();
  const idx = list.findIndex(x => x.id === id);
  if (idx === -1) return res.status(404).json({ code: 1, msg: '不存在' });

  const item = list[idx];
  if (!item.isGuest || item.guestToken !== token) {
    return res.status(403).json({ code: 403, msg: '// INVALID GUEST TOKEN' });
  }

  list.splice(idx, 1);
  writeMeta(list);

  // 软删除移入回收站
  item.deletedAt = new Date().toISOString();
  const trash = readTrash();
  trash.unshift(item);
  writeTrash(trash);

  res.json({ code: 0, msg: '已移入回收站' });
});

// ---------- 标签 ----------

// 获取当前用户的标签列表（去重汇总）
router.get('/tags', verifyJWT, (req, res) => {
  const all = readMeta();
  const tagSet = new Set();
  all.forEach(function (item) {
    if (item.userId !== req.user.id) return;
    if (Array.isArray(item.tags)) {
      item.tags.forEach(function (t) { tagSet.add(t); });
    }
  });
  res.json({ code: 0, data: Array.from(tagSet) });
});

// 用户统计
router.get('/stats/me', verifyJWT, (req, res) => {
  const all = readMeta();
  const trash = readTrash();
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  var totalImages = 0;
  var totalSize = 0;
  var monthImages = 0;
  var dailyMap = {};

  // 初始化最近 7 天
  for (var i = 6; i >= 0; i--) {
    var d = new Date(now);
    d.setDate(d.getDate() - i);
    var key = d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0');
    dailyMap[key] = 0;
  }

  all.forEach(function (item) {
    if (item.userId !== req.user.id) return;
    if (item.moderationStatus === 'REJECT') return;
    totalImages++;
    totalSize += item.size || 0;

    var ud = new Date(item.uploadedAt);
    if (ud >= monthStart) monthImages++;

    var dk = ud.getFullYear() + '-' +
      String(ud.getMonth() + 1).padStart(2, '0') + '-' +
      String(ud.getDate()).padStart(2, '0');
    if (dailyMap.hasOwnProperty(dk)) {
      dailyMap[dk]++;
    }
  });

  var trashCount = trash.filter(function (x) { return x.userId === req.user.id; }).length;

  var daily = Object.keys(dailyMap).map(function (k) {
    return { date: k, count: dailyMap[k] };
  });

  res.json({
    code: 0,
    data: { totalImages: totalImages, totalSize: totalSize, trashCount: trashCount, monthImages: monthImages, daily: daily }
  });
});

// 服务信息（公开）
router.get('/info', function (req, res) {
  res.json({
    code: 0,
    data: {
      version: '1.4.0',
      maxFileSize: parseInt(process.env.MAX_FILE_SIZE, 10) || 20971520,
      maxBatchSize: parseInt(process.env.MAX_BATCH_SIZE, 10) || 104857600,
      guestEnabled: process.env.GUEST_ENABLED === 'true',
      guestMaxFileSize: parseInt(process.env.GUEST_MAX_FILE_SIZE, 10) || 10485760,
      guestRetentionDays: parseInt(process.env.GUEST_RETENTION_DAYS, 10) || 30,
      moderationEnabled: process.env.MODERATION_ENABLED === 'true',
      registerEnabled: process.env.REGISTER_ENABLED !== 'false',
      supportedFormats: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg']
    }
  });
});

// 设置图片标签（覆盖式）
router.post('/image/:id/tags', verifyAuth, (req, res) => {
  const { id } = req.params;
  const { tags } = req.body || {};

  if (!Array.isArray(tags)) {
    return res.status(400).json({ code: 1, msg: '// 标签格式错误' });
  }
  if (tags.length > 10) {
    return res.status(400).json({ code: 1, msg: '// 标签最多 10 个' });
  }
  for (var i = 0; i < tags.length; i++) {
    if (typeof tags[i] !== 'string' || !/^[一-龥a-zA-Z0-9_\-]{1,20}$/.test(tags[i])) {
      return res.status(400).json({ code: 1, msg: '// 标签格式不合法: ' + tags[i] });
    }
  }

  const list = readMeta();
  const idx = list.findIndex(function (x) { return x.id === id; });
  if (idx === -1) return res.status(404).json({ code: 1, msg: '// 图片不存在' });
  if (list[idx].userId !== req.user.id) {
    return res.status(403).json({ code: 403, msg: '// ACCESS DENIED // NOT YOUR PACKET' });
  }

  list[idx].tags = tags;
  writeMeta(list);

  tags.forEach(function (t) { appendTag(t); });

  res.json({ code: 0, data: { id: id, tags: tags } });
});

// 删除图片单个标签
router.delete('/image/:id/tags/:tag', verifyAuth, (req, res) => {
  const { id, tag } = req.params;
  const decodedTag = decodeURIComponent(tag);

  const list = readMeta();
  const idx = list.findIndex(function (x) { return x.id === id; });
  if (idx === -1) return res.status(404).json({ code: 1, msg: '// 图片不存在' });
  if (list[idx].userId !== req.user.id) {
    return res.status(403).json({ code: 403, msg: '// ACCESS DENIED // NOT YOUR PACKET' });
  }

  if (!Array.isArray(list[idx].tags)) {
    list[idx].tags = [];
  }
  var tagIdx = list[idx].tags.indexOf(decodedTag);
  if (tagIdx === -1) {
    return res.status(404).json({ code: 1, msg: '// 标签不存在' });
  }

  list[idx].tags.splice(tagIdx, 1);
  writeMeta(list);

  res.json({ code: 0 });
});

// 错误处理（Multer 等）
router.use((err, req, res, next) => {
  res.status(400).json({ code: 1, msg: err.message });
});

module.exports = router;
