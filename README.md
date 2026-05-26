# ◤ NEON.IMG ◢

> 赛博朋克风格图床服务 · Cyberpunk Image Hosting Service  
> "Wake up, samurai. We have images to host."

---

## 项目简介

NEON.IMG 是一个基于 Node.js + Express 的轻量级图床服务，支持多用户注册、图片上传、在线预览、一键复制链接和批量管理。前端采用赛博朋克霓虹美学 UI，支持拖拽、点击、粘贴三种上传方式。

- **后端**：Express 5 + Multer 2 + nanoid 3 + sharp + bcryptjs（CommonJS）
- **前端**：原生 HTML + CSS + JS（无框架 / 无构建工具）
- **存储**：本地文件系统 + JSON 元数据（无需数据库）
- **鉴权**：JWT 会话 + API Token 双轨鉴权，多用户数据隔离
- **部署**：PM2 + Nginx 反向代理

### 核心功能

| 模块 | 功能 |
|------|------|
| 上传 | 拖拽 / 点击 / 粘贴 / Ctrl+V，进度条反馈，单文件上限 10MB |
| 图库 | 缩略图网格/列表视图，搜索、排序、格式筛选，Lightbox 全屏预览 |
| 链接 | 一键复制 URL / Markdown / HTML，自动记忆偏好格式 |
| 回收站 | 30 天软删除，支持恢复 / 永久删除 / 一键清空 |
| 批量 | 长按进入批量模式，全选 / 批量复制 / 批量删除，Ctrl+A / Esc |
| 账号 | 开放注册，JWT 登录 + API Token，多用户数据隔离 |
| 管理员 | 用户管理面板，查看统计，一键删除用户及其全部数据 |
| 快捷键 | `/` 搜索 `?` 帮助 `G` 切换视图 `←→` 切换图片 `Esc` 关闭 |

---

## 快速启动

### 环境配置

```bash
cp .env.example .env
# 编辑 .env，至少修改 JWT_SECRET 和 ADMIN_USERNAME
```

`.env` 必填项：

| 变量 | 说明 |
|------|------|
| `JWT_SECRET` | JWT 签名密钥（必填，随机长字符串） |
| `ADMIN_USERNAME` | 管理员用户名（注册时自动识别为管理员） |
| `PORT` | 服务端口（默认 3000） |
| `RATE_LIMIT_WINDOW_MS` | 限流窗口（默认 60000） |
| `RATE_LIMIT_MAX` | 窗口内最大请求数（默认 30） |

### 本地开发（Windows）

```powershell
cd server
npm install
npm run dev
```

浏览器打开 **http://localhost:3000**，首次使用需注册账号。

### 冒烟测试

```powershell
cd server/test
pwsh -ExecutionPolicy Bypass -File .\smoke-test.ps1
```

> 要求 PowerShell 7+，服务已运行在 localhost:3000

---

## 部署

### Linux 生产环境

```bash
cd /opt/image-host/server
npm install --production
pm2 start ../ecosystem.config.js
pm2 save && pm2 startup
```

### Docker

```bash
docker build -t neon-img .
docker run -d -p 3000:3000 --name neon-img \
  -v $(pwd)/server/uploads:/app/server/uploads \
  -v $(pwd)/server/data:/app/server/data \
  neon-img
```

### Nginx 反向代理

参考 `图床项目搭建文档.md` §10，配置域名 + HTTPS。

---

## 项目结构

```
image-host/
├── server/
│   ├── app.js                    # Express 入口
│   ├── routes/
│   │   ├── upload.js             # 上传/列表/删除/回收站/恢复路由
│   │   ├── auth.js               # 注册/登录/用户信息/重置 Token
│   │   └── admin.js              # 管理员用户管理
│   ├── middleware/
│   │   ├── auth.js               # JWT + API Token + Admin 鉴权中间件 + 限流
│   │   └── multerConfig.js       # 上传文件校验（类型/大小/随机名）
│   ├── utils/
│   │   ├── meta.js               # images.json / trash.json 读写
│   │   ├── userMeta.js           # users.json 读写 + 查询
│   │   └── imageProcess.js       # sharp 缩略图生成（WebP 300x300）
│   ├── uploads/                  # 图片存储（运行时生成，勿提交）
│   ├── data/                     # JSON 元数据（运行时生成，勿提交）
│   └── test/                     # 冒烟测试脚本 + 测试文件
├── public/
│   ├── index.html                # 前端骨架 + HUD + 上传区 + 画廊
│   ├── style.css                 # 赛博朋克样式（CSS 变量 + 响应式）
│   ├── app.js                    # 前端交互（~1900 行原生 JS）
│   └── video/                    # 背景视频
├── ecosystem.config.js           # PM2 配置
├── Dockerfile                    # 容器化
├── CLAUDE.md                     # 项目宪法（开发规范）
├── 图床项目搭建文档.md            # 完整搭建指南
└── 图床项目搭建文档2.md           # 产品优化建议 + 账号系统设计
```

---

## API

返回格式：`{ code: 0|1, msg: "...", data: ... }`，`code: 0` 成功。

### 图片接口

| 方法 | 路径 | 鉴权 | 说明 |
|------|------|------|------|
| POST | `/api/upload` | verifyAuth | 上传图片（字段 `files`，最多 10 个） |
| GET | `/api/list` | verifyJWT | 当前用户图片列表 |
| DELETE | `/api/image/:id` | verifyAuth | 软删除（移入回收站，校验 userId） |
| GET | `/api/trash` | verifyJWT | 回收站列表（自动清理过期） |
| POST | `/api/restore/:id` | verifyAuth | 从回收站恢复 |
| DELETE | `/api/purge/:id` | verifyAuth | 永久删除 |
| GET | `/i/<filename>` | 无 | 访问原图 / 缩略图 |

### 账号接口

| 方法 | 路径 | 鉴权 | 说明 |
|------|------|------|------|
| POST | `/api/auth/register` | 无 | 注册（username 3-20 字符，password ≥ 6） |
| POST | `/api/auth/login` | 无 | 登录，返回 JWT + apiToken + isAdmin |
| GET | `/api/auth/me` | verifyJWT | 当前用户信息 |
| POST | `/api/auth/reset-token` | verifyJWT | 重新生成 API Token |

### 管理员接口

| 方法 | 路径 | 鉴权 | 说明 |
|------|------|------|------|
| GET | `/api/admin/users` | verifyAdmin | 用户列表（含统计，脱敏） |
| DELETE | `/api/admin/users/:id` | verifyAdmin | 删除用户及其全部数据 |

### 鉴权方式

```
浏览器前端：Authorization: Bearer <jwt>
外部工具：  x-upload-token: <api_token>
```

> API Token 可在登录后的用户面板中复制，用于 PicGo、Typora、curl 等外部工具。

---

## 技术栈

| 层 | 技术 | 版本 |
|------|------|------|
| 运行时 | Node.js | v22 |
| 后端 | Express | 5.2.1 |
| 上传 | Multer | 2.1.1 |
| 图片处理 | sharp | 0.33.x |
| ID 生成 | nanoid | 3.3.x |
| 密码加密 | bcryptjs | 2.4.x |
| 会话 | jsonwebtoken | 9.0.x |
| 限流 | express-rate-limit | 7.5.x |
| 进程管理 | PM2 | — |
| 反向代理 | Nginx | — |
| 前端 | 原生 HTML + CSS + JS | — |

---

## 截图

> TODO: 添加上传界面、画廊、Lightbox、批量管理、登录页、管理面板的截图

---

## License

MIT

---

> 🌃 Stay sharp, samurai.
