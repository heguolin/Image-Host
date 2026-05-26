const rateLimit = require('express-rate-limit');
const jwt = require('jsonwebtoken');
const { findUserById, findUserByToken } = require('../utils/userMeta');

/** JWT 会话鉴权（浏览器前端用） */
function verifyJWT(req, res, next) {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    console.warn('[NEON.IMG] JWT_SECRET not set, auth disabled');
    return res.status(401).json({ code: 401, msg: '// SESSION EXPIRED // LOGIN AGAIN' });
  }
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!token) {
    return res.status(401).json({ code: 401, msg: '// SESSION EXPIRED // LOGIN AGAIN' });
  }
  try {
    const payload = jwt.verify(token, secret);
    const user = findUserById(payload.id);
    if (!user) {
      return res.status(401).json({ code: 401, msg: '// SESSION EXPIRED // LOGIN AGAIN' });
    }
    req.user = { id: user.id, username: user.username, isAdmin: user.isAdmin };
    next();
  } catch {
    return res.status(401).json({ code: 401, msg: '// SESSION EXPIRED // LOGIN AGAIN' });
  }
}

/** API Token 鉴权（外部工具 PicGo/Typora 用） */
function verifyApiToken(req, res, next) {
  const token = req.headers['x-upload-token'];
  if (!token) {
    return res.status(401).json({ code: 401, msg: '// AUTH FAILED // INVALID TOKEN' });
  }
  const user = findUserByToken(token);
  if (!user) {
    return res.status(401).json({ code: 401, msg: '// AUTH FAILED // INVALID TOKEN' });
  }
  req.user = { id: user.id, username: user.username, isAdmin: user.isAdmin };
  next();
}

/** 双轨鉴权合并：先 JWT → 再 API Token */
function verifyAuth(req, res, next) {
  // 先尝试 JWT
  const secret = process.env.JWT_SECRET;
  if (secret) {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (token) {
      try {
        const payload = jwt.verify(token, secret);
        const user = findUserById(payload.id);
        if (user) {
          req.user = { id: user.id, username: user.username, isAdmin: user.isAdmin };
          return next();
        }
      } catch {
        // JWT 失败，继续尝试 API Token
      }
    }
  }

  // 再尝试 API Token
  const apiToken = req.headers['x-upload-token'];
  if (apiToken) {
    const user = findUserByToken(apiToken);
    if (user) {
      req.user = { id: user.id, username: user.username, isAdmin: user.isAdmin };
      return next();
    }
  }

  return res.status(401).json({ code: 401, msg: '// AUTH FAILED // IDENTIFY YOURSELF' });
}

/** 管理员鉴权（先 JWT 验证再检查 isAdmin） */
function verifyAdmin(req, res, next) {
  verifyJWT(req, res, function () {
    if (req.user && req.user.isAdmin) {
      return next();
    }
    return res.status(403).json({ code: 403, msg: '// ACCESS DENIED // ADMIN ONLY' });
  });
}

/** 全局限流中间件 */
const rateLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 60000,
  max: parseInt(process.env.RATE_LIMIT_MAX, 10) || 30,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({ code: 429, msg: '// RATE LIMITED // SLOW DOWN SAMURAI' });
  }
});

// 向后兼容：upload.js 引用的 verifyToken → 用 verifyApiToken
const verifyToken = verifyApiToken;

module.exports = { verifyToken, verifyJWT, verifyApiToken, verifyAuth, verifyAdmin, rateLimiter };
