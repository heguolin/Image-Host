const express = require('express');
const fs = require('fs');
const path = require('path');
const upload = require('../middleware/multerConfig');
const processImage = require('../utils/imageProcess');
const { readMeta, writeMeta, readTrash, writeTrash } = require('../utils/meta');
const { verifyJWT, verifyAuth } = require('../middleware/auth');

const router = express.Router();

/** 删除缩略图文件（如果存在） */
function deleteThumb(item) {
  const thumbName = item.thumbFilename || item.id.replace(/\.\w+$/, '') + '_thumb.webp';
  const thumbPath = path.join(__dirname, '../uploads', thumbName);
  if (fs.existsSync(thumbPath)) fs.unlinkSync(thumbPath);
}

// 上传（支持多文件，字段名 files）
router.post('/upload', verifyAuth, upload.array('files', 10), async (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ code: 1, msg: '没有上传文件' });
  }

  const host = `${req.protocol}://${req.get('host')}`;
  const list = readMeta();

  const results = [];
  for (const f of req.files) {
    const result = await processImage(f.buffer, f.originalname);
    const item = {
      id: result.filename,
      userId: req.user.id,
      name: f.originalname,
      size: result.size,
      width: result.width,
      height: result.height,
      url: `${host}/i/${result.filename}`,
      uploadedAt: new Date().toISOString()
    };
    if (result.thumbFilename) {
      item.thumbUrl = `${host}/i/${result.thumbFilename}`;
      item.thumbFilename = result.thumbFilename;
    }
    list.unshift(item);
    results.push(item);
  }

  writeMeta(list);
  res.json({ code: 0, msg: 'ok', data: results });
});

// 列表（仅返回当前用户数据）
router.get('/list', verifyJWT, (req, res) => {
  const all = readMeta();
  const data = all.filter(x => x.userId === req.user.id);
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

// 错误处理（Multer 等）
router.use((err, req, res, next) => {
  res.status(400).json({ code: 1, msg: err.message });
});

module.exports = router;
