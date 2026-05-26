const sharp = require('sharp');
const path = require('path');
const fs = require('fs');
const { nanoid } = require('nanoid');

const UPLOADS_DIR = path.join(__dirname, '../uploads');

/**
 * 处理上传图片：压缩原图 + 生成缩略图
 * @param {Buffer} buffer - 原始文件 buffer
 * @param {string} originalName - 原始文件名
 * @returns {Promise<{filename, thumbFilename, size, width, height, format}>}
 */
async function processImage(buffer, originalName) {
  const ext = path.extname(originalName).toLowerCase();
  const prefix = `${Date.now()}-${nanoid(8)}`;

  // GIF / SVG 不压缩，直接写入
  if (ext === '.gif' || ext === '.svg') {
    const filename = `${prefix}${ext}`;
    const filePath = path.join(UPLOADS_DIR, filename);
    await fs.promises.writeFile(filePath, buffer);
    const meta = await sharp(buffer).metadata().catch(() => ({ width: 0, height: 0, format: ext.slice(1) }));
    return {
      filename,
      thumbFilename: null,
      size: buffer.length,
      width: meta.width || 0,
      height: meta.height || 0,
      format: ext.slice(1)
    };
  }

  // JPG / PNG / WebP：压缩原图 + 生成缩略图
  try {
    const image = sharp(buffer);
    const meta = await image.metadata();
    const format = meta.format;

    // 原图：轻量压缩
    const compressedName = `${prefix}${ext}`;
    const compressedPath = path.join(UPLOADS_DIR, compressedName);

    let pipeline = sharp(buffer);
    switch (ext) {
      case '.jpg':
      case '.jpeg':
        pipeline = pipeline.jpeg({ quality: 85 });
        break;
      case '.png':
        pipeline = pipeline.png({ compressionLevel: 8 });
        break;
      case '.webp':
        pipeline = pipeline.webp({ quality: 85 });
        break;
      default:
        break;
    }
    await pipeline.toFile(compressedPath);

    // 缩略图：400×400 cover，统一 WebP quality 80
    const thumbName = `${prefix}_thumb.webp`;
    const thumbPath = path.join(UPLOADS_DIR, thumbName);
    await sharp(buffer)
      .resize(400, 400, { fit: 'cover', position: 'centre' })
      .webp({ quality: 80 })
      .toFile(thumbPath);

    const stat = await fs.promises.stat(compressedPath);

    return {
      filename: compressedName,
      thumbFilename: thumbName,
      size: stat.size,
      width: meta.width || 0,
      height: meta.height || 0,
      format: format || ext.slice(1)
    };
  } catch (err) {
    // 处理失败时降级：直接写入原始 buffer，不生成缩略图
    console.error('processImage 失败，降级写入:', err.message);
    const filename = `${prefix}${ext}`;
    const filePath = path.join(UPLOADS_DIR, filename);
    await fs.promises.writeFile(filePath, buffer);
    const meta = await sharp(buffer).metadata().catch(() => ({ width: 0, height: 0, format: ext.slice(1) }));
    return {
      filename,
      thumbFilename: null,
      size: buffer.length,
      width: meta.width || 0,
      height: meta.height || 0,
      format: ext.slice(1)
    };
  }
}

module.exports = processImage;
