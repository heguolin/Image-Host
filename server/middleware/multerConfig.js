const multer = require('multer');

const ALLOWED = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'];
const MAX_SIZE = parseInt(process.env.MAX_FILE_SIZE) || 20 * 1024 * 1024;

const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  const ext = require('path').extname(file.originalname).toLowerCase();
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
