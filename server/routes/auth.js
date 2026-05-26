const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { nanoid } = require('nanoid');
const { readUsers, writeUsers, findUserByUsername, findUserById } = require('../utils/userMeta');
const { verifyJWT } = require('../middleware/auth');

const router = express.Router();

// 注册
router.post('/register', (req, res) => {
  const { username, password } = req.body || {};

  if (!username || !/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
    return res.status(400).json({ code: 1, msg: '// ERROR // USERNAME: 3-20 chars, a-z 0-9 _' });
  }
  if (!password || password.length < 6) {
    return res.status(400).json({ code: 1, msg: '// ERROR // PASSWORD: min 6 chars' });
  }
  if (findUserByUsername(username)) {
    return res.status(409).json({ code: 409, msg: '// USERNAME TAKEN' });
  }

  const hash = bcrypt.hashSync(password, 10);
  const user = {
    id: nanoid(10),
    username: username,
    passwordHash: hash,
    token: nanoid(32),
    isAdmin: username === (process.env.ADMIN_USERNAME || ''),
    createdAt: new Date().toISOString()
  };
  const users = readUsers();
  users.push(user);
  writeUsers(users);

  res.json({ code: 0, data: { username: user.username, apiToken: user.token } });
});

// 登录
router.post('/login', (req, res) => {
  const { username, password } = req.body || {};
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    return res.status(500).json({ code: 1, msg: '// ERROR // JWT_SECRET NOT CONFIGURED' });
  }

  const user = findUserByUsername(username || '');
  if (!user || !bcrypt.compareSync(password || '', user.passwordHash)) {
    return res.status(401).json({ code: 401, msg: '// AUTH FAILED // WRONG CREDENTIALS' });
  }

  const token = jwt.sign({ id: user.id, username: user.username }, secret, { expiresIn: '7d' });

  res.json({ code: 0, data: { jwt: token, username: user.username, apiToken: user.token, isAdmin: user.isAdmin } });
});

// 获取当前用户信息
router.get('/me', verifyJWT, (req, res) => {
  const user = findUserById(req.user.id);
  if (!user) {
    return res.status(404).json({ code: 1, msg: '// USER NOT FOUND' });
  }
  res.json({ code: 0, data: { username: user.username, apiToken: user.token } });
});

// 重置 API Token
router.post('/reset-token', verifyJWT, (req, res) => {
  const users = readUsers();
  const user = users.find(u => u.id === req.user.id);
  if (!user) {
    return res.status(404).json({ code: 1, msg: '// USER NOT FOUND' });
  }
  user.token = nanoid(32);
  writeUsers(users);
  res.json({ code: 0, data: { apiToken: user.token } });
});

module.exports = router;
