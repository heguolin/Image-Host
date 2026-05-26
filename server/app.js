require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const uploadRouter = require('./routes/upload');
const authRouter = require('./routes/auth');
const adminRouter = require('./routes/admin');
const { rateLimiter } = require('./middleware/auth');

const app = express();
const PORT = process.env.PORT || 3000;

// 确保目录存在
['uploads', 'data'].forEach(dir => {
  const p = path.join(__dirname, dir);
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
});

app.use(cors());
app.use(express.json());

// 静态资源：前端页面
app.use(express.static(path.join(__dirname, '../public')));
// 静态资源：图片访问
app.use('/i', express.static(path.join(__dirname, 'uploads'), {
  maxAge: '7d', // 浏览器缓存 7 天
}));

// API 限流
app.use('/api', rateLimiter);
// 账号路由
app.use('/api/auth', authRouter);
// 图床路由
app.use('/api', uploadRouter);
// 管理员路由
app.use('/api/admin', adminRouter);

app.listen(PORT, () => {
  console.log(`🚀 图床服务已启动: http://localhost:${PORT}`);
});