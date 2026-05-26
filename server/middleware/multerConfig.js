const multer = require('multer');
const path = require('path');
const { nanoid } = require('nanoid');

const ALLOWED = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'];
const MAX_SIZE = 10 * 1024 * 1024; // 10MB

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, '../uploads'));
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${Date.now()}-${nanoid(8)}${ext}`);
  }
});

const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  if (!ALLOWED.includes(ext)) {
    return cb(new Error(`不支持的文件类型: ${ext}`));
  }
  cb(null, true);
};

module.exports = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_SIZE }
});