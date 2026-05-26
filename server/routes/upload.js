const express = require('express');
const fs = require('fs');
const path = require('path');
const upload = require('../middleware/multerConfig');
const { readMeta, writeMeta } = require('../utils/meta');

const router = express.Router();

// 上传（支持多文件，字段名 files）
router.post('/upload', upload.array('files', 10), (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ code: 1, msg: '没有上传文件' });
  }

  const host = `${req.protocol}://${req.get('host')}`;
  const list = readMeta();

  const results = req.files.map(f => {
    const item = {
      id: f.filename,
      name: f.originalname,
      size: f.size,
      url: `${host}/i/${f.filename}`,
      uploadedAt: new Date().toISOString()
    };
    list.unshift(item);
    return item;
  });

  writeMeta(list);
  res.json({ code: 0, msg: 'ok', data: results });
});

// 列表
router.get('/list', (req, res) => {
  res.json({ code: 0, data: readMeta() });
});

// 删除
router.delete('/image/:id', (req, res) => {
  const { id } = req.params;
  const list = readMeta();
  const idx = list.findIndex(x => x.id === id);
  if (idx === -1) return res.status(404).json({ code: 1, msg: '不存在' });

  // 删除文件
  const filePath = path.join(__dirname, '../uploads', id);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

  list.splice(idx, 1);
  writeMeta(list);
  res.json({ code: 0, msg: '已删除' });
});

// 错误处理（Multer 等）
router.use((err, req, res, next) => {
  res.status(400).json({ code: 1, msg: err.message });
});

module.exports = router;