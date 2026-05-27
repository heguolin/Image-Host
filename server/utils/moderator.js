const fs = require('fs');
const path = require('path');

// 已知图片文件魔数（前 N 字节）
const MAGIC = {
  jpg:  { bytes: [0xFF, 0xD8, 0xFF],       label: 'JPEG' },
  png:  { bytes: [0x89, 0x50, 0x4E, 0x47], label: 'PNG'  },
  gif:  { bytes: [0x47, 0x49, 0x46],       label: 'GIF'  },
  webp: { bytes: [0x52, 0x49, 0x46, 0x46], label: 'WEBP' }
};

// 扩展名到魔数类型的映射
const EXT_MAP = {
  '.jpg':  'jpg',
  '.jpeg': 'jpg',
  '.png':  'png',
  '.gif':  'gif',
  '.webp': 'webp'
};

/** 读取文件前 N 字节并返回魔数匹配结果 */
function checkMagic(filePath) {
  const fd = fs.openSync(filePath, 'r');
  const buf = Buffer.alloc(8);
  fs.readSync(fd, buf, 0, 8, 0);
  fs.closeSync(fd);

  for (var key in MAGIC) {
    var magic = MAGIC[key];
    var match = true;
    for (var i = 0; i < magic.bytes.length; i++) {
      if (buf[i] !== magic.bytes[i]) {
        match = false;
        break;
      }
    }
    if (match) return key;
  }
  return null;
}

/** 本地预检 */
function localCheck(filePath, originalName) {
  // 1. 文件魔数校验
  var magicType = checkMagic(filePath);
  if (!magicType) {
    return { status: 'REJECT', score: 1.0, tags: ['MAGIC_MISMATCH'] };
  }

  // 2. 扩展名与魔数一致性校验
  var ext = path.extname(originalName).toLowerCase();
  var expectedType = EXT_MAP[ext];
  if (!expectedType || expectedType !== magicType) {
    return { status: 'REJECT', score: 1.0, tags: ['EXT_MISMATCH'] };
  }

  return null; // 本地预检通过
}

/** 审核主函数 */
async function moderate(filePath, originalName) {
  try {
    if (process.env.MODERATION_ENABLED !== 'true') {
      return { status: 'PASS', score: 0, tags: [] };
    }

    // 本地预检（始终执行）
    var localResult = localCheck(filePath, originalName);
    if (localResult) {
      return localResult;
    }

    // 根据 MODERATION_PROVIDER 选择审核策略
    var provider = (process.env.MODERATION_PROVIDER || 'local').toLowerCase();
    var score;

    if (provider === 'local') {
      return { status: 'PASS', score: 0, tags: [] };
    } else if (provider === 'mock') {
      // 模拟返回随机分数（0.1 ~ 0.5），用于测试阈值逻辑
      score = 0.1 + Math.random() * 0.4;
    } else {
      // 未知 provider，降级为 local 模式
      console.warn('[NEON.IMG] Unknown MODERATION_PROVIDER:', provider, '— falling back to local');
      return { status: 'PASS', score: 0, tags: [] };
    }

    // 根据阈值判定状态
    var rejectThreshold = parseFloat(process.env.MODERATION_THRESHOLD_REJECT) || 0.9;
    var reviewThreshold = parseFloat(process.env.MODERATION_THRESHOLD_REVIEW) || 0.6;
    var status;

    if (score >= rejectThreshold) {
      status = 'REJECT';
    } else if (score >= reviewThreshold) {
      status = 'NEED_REVIEW';
    } else {
      status = 'PASS';
    }

    return { status: status, score: Math.round(score * 1000) / 1000, tags: [] };
  } catch (e) {
    // 任何异常降级为 PASS，不影响上传主流程
    console.warn('[NEON.IMG] Moderation error, falling back to PASS:', e.message);
    return { status: 'PASS', score: 0, tags: [] };
  }
}

module.exports = { moderate };
