const express = require('express');
const fs = require('fs');
const path = require('path');
const { verifyAdmin } = require('../middleware/auth');
const { readUsers, writeUsers } = require('../utils/userMeta');
const { readMeta, writeMeta, readTrash, writeTrash } = require('../utils/meta');

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

module.exports = router;
