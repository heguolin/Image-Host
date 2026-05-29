const express = require('express');
const fs = require('fs');
const path = require('path');
const { nanoid } = require('nanoid');
const { verifyAdmin } = require('../middleware/auth');
const { readUsers, writeUsers, findUserById } = require('../utils/userMeta');
const { readMeta, writeMeta, readTrash, writeTrash } = require('../utils/meta');
const { appendModerationLog } = require('../utils/moderationMeta');

const router = express.Router();

function deleteThumbFile(item) {
  const thumbName = item.thumbFilename || item.id.replace(/\.\w+$/, '') + '_thumb.webp';
  const thumbPath = path.join(__dirname, '../uploads', thumbName);
  if (fs.existsSync(thumbPath)) fs.unlinkSync(thumbPath);
}

/** 获取所有用户列表（脱敏，不含 passwordHash 和 token） */
router.get('/users', verifyAdmin, (req, res) => {
  const users = readUsers();
  const images = readMeta();
  const trash = readTrash();

  const data = users.map(u => {
    const imageCount = images.filter(x => x.userId === u.id).length;
    const trashCount = trash.filter(x => x.userId === u.id).length;
    return {
      id: u.id,
      username: u.username,
      isAdmin: u.isAdmin,
      createdAt: u.createdAt,
      imageCount,
      trashCount
    };
  });

  res.json({ code: 0, data });
});

/** 管理员删除用户 */
router.delete('/users/:id', verifyAdmin, (req, res) => {
  const { id } = req.params;

  // 不能删除自己
  if (id === req.user.id) {
    return res.status(400).json({ code: 400, msg: '// CANNOT DELETE YOURSELF' });
  }

  const users = readUsers();
  const target = users.find(u => u.id === id);
  if (!target) {
    return res.status(404).json({ code: 1, msg: '// USER NOT FOUND' });
  }

  // 不能删除其他管理员
  if (target.isAdmin) {
    return res.status(403).json({ code: 403, msg: '// CANNOT DELETE ADMIN' });
  }

  // 从 users.json 移除
  const updatedUsers = users.filter(u => u.id !== id);
  writeUsers(updatedUsers);

  // 从 images.json 移除该用户所有条目并删除文件
  const images = readMeta();
  const userImages = images.filter(x => x.userId === id);
  const remainingImages = images.filter(x => x.userId !== id);
  writeMeta(remainingImages);

  userImages.forEach(item => {
    const filePath = path.join(__dirname, '../uploads', item.id);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    deleteThumbFile(item);
  });

  // 从 trash.json 移除该用户所有条目并删除文件
  const trashItems = readTrash();
  const userTrash = trashItems.filter(x => x.userId === id);
  const remainingTrash = trashItems.filter(x => x.userId !== id);
  writeTrash(remainingTrash);

  userTrash.forEach(item => {
    const filePath = path.join(__dirname, '../uploads', item.id);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    deleteThumbFile(item);
  });

  res.json({ code: 0, msg: '// USER PURGED' });
});

/** 审核复审：获取 NEED_REVIEW 图片列表 */
router.get('/moderation', verifyAdmin, (req, res) => {
  const images = readMeta();
  const list = images
    .filter(function (x) { return x.moderationStatus === 'NEED_REVIEW'; })
    .map(function (item) {
      var uploader = 'unknown';
      if (item.userId && item.userId !== 'guest') {
        var user = findUserById(item.userId);
        uploader = user ? user.username : item.userId;
      } else if (item.isGuest) {
        uploader = 'guest';
      }
      return {
        id: item.id,
        name: item.name,
        userId: item.userId,
        uploader: uploader,
        score: item.moderationScore,
        tags: item.moderationTags || [],
        thumbUrl: item.thumbUrl || item.url,
        uploadedAt: item.uploadedAt,
        size: item.size
      };
    });

  res.json({ code: 0, data: list });
});

/** 审核复审：人工通过 */
router.post('/moderation/:imageId/pass', verifyAdmin, (req, res) => {
  const { imageId } = req.params;
  const images = readMeta();
  const idx = images.findIndex(function (x) { return x.id === imageId; });
  if (idx === -1) {
    return res.status(404).json({ code: 1, msg: '// IMAGE NOT FOUND' });
  }

  images[idx].moderationStatus = 'PASS';
  images[idx].moderationAt = new Date().toISOString();
  writeMeta(images);

  appendModerationLog({
    id: nanoid(10),
    imageId: imageId,
    action: 'MANUAL_PASS',
    operator: req.user.username,
    score: images[idx].moderationScore,
    tags: images[idx].moderationTags || [],
    reason: '',
    createdAt: new Date().toISOString()
  });

  res.json({ code: 0, msg: '// MODERATION: PASS' });
});

/** 审核复审：人工拒绝 */
router.post('/moderation/:imageId/reject', verifyAdmin, (req, res) => {
  const { imageId } = req.params;
  const reason = (req.body && req.body.reason) || '';

  const images = readMeta();
  const idx = images.findIndex(function (x) { return x.id === imageId; });
  if (idx === -1) {
    return res.status(404).json({ code: 1, msg: '// IMAGE NOT FOUND' });
  }

  images[idx].moderationStatus = 'REJECT';
  images[idx].moderationAt = new Date().toISOString();
  writeMeta(images);

  appendModerationLog({
    id: nanoid(10),
    imageId: imageId,
    action: 'MANUAL_REJECT',
    operator: req.user.username,
    score: images[idx].moderationScore,
    tags: images[idx].moderationTags || [],
    reason: reason,
    createdAt: new Date().toISOString()
  });

  res.json({ code: 0, msg: '// MODERATION: REJECT' });
});

// 管理员统计数据
router.get('/stats', verifyAdmin, (req, res) => {
  const users = readUsers();
  const images = readMeta();
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  var totalImages = images.length;
  var totalSize = 0;
  var todayUploads = 0;
  var guestUploads = 0;
  var pendingReview = 0;

  images.forEach(function (item) {
    totalSize += item.size || 0;
    if (new Date(item.uploadedAt) >= todayStart) todayUploads++;
    if (item.isGuest) guestUploads++;
    if (item.moderationStatus === 'NEED_REVIEW') pendingReview++;
  });

  res.json({
    code: 0,
    data: {
      totalUsers: users.length,
      totalImages: totalImages,
      totalSize: totalSize,
      todayUploads: todayUploads,
      guestUploads: guestUploads,
      pendingReview: pendingReview
    }
  });
});

module.exports = router;
