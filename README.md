# ◤ NEON.IMG ◢

> 赛博朋克风格图床服务 · Cyberpunk Image Hosting Service  
> "Wake up, samurai. We have images to host."

---

## 项目简介

NEON.IMG 是一个基于 Node.js + Express 的轻量级图床服务，支持多用户注册、游客匿名上传、图片审核、在线预览、一键复制链接和批量管理。前端采用赛博朋克霓虹美学 UI，支持拖拽、点击、粘贴三种上传方式。

- **后端**：Express 5 + Multer 2 + nanoid 3 + sharp + bcryptjs（CommonJS）
- **前端**：原生 HTML + CSS + JS（无框架 / 无构建工具）
- **存储**：本地文件系统 + JSON 元数据（无需数据库）
- **鉴权**：JWT 会话 + API Token 双轨鉴权，多用户数据隔离
- **审核**：魔数校验 + 可插拔审核 Provider，三级管线（预检→AI→人工复审）
- **部署**：PM2 + Nginx 反向代理 + 一键部署脚本

### 核心功能

| 模块 | 功能 |
|------|------|
| 上传 | 拖拽 / 点击 / 粘贴 / Ctrl+V，进度条反馈，单文件上限 20MB |
| 图库 | 缩略图网格/列表视图，搜索、排序、格式筛选，Lightbox 全屏预览 |
| 链接 | 一键复制 URL / Markdown / HTML，自动记忆偏好格式 |
| 游客 | 匿名上传通道，独立画廊，IP 限流，30 天保留，格式/大小/张数限制 |
| 审核 | 魔数校验 + AI 评分 + 管理员复审面板，审核状态徽章 |
| 回收站 | 30 天软删除，支持恢复 / 永久删除 / 一键清空 |
| 批量 | 长按进入批量模式，全选 / 批量复制 / 批量删除，Ctrl+A / Esc |
| 账号 | 开放注册，JWT 登录 + API Token，多用户数据隔离 |
| 管理员 | 用户管理 + 审核复审，查看统计，一键删除用户及其全部数据 |
| 快捷键 | `/` 搜索 `?` 帮助 `G` 切换视图 `←→` 切换图片 `Esc` 关闭 |

---

## 快速启动

### 环境配置

```bash
cp .env.example .env
# 编辑 .env，至少修改 JWT_SECRET 和 ADMIN_USERNAME
```

`.env` 配置项（共 17 个变量，分 5 组）：

| 分组 | 变量 | 说明 |
|------|------|------|
| 基础 | `PORT` | 服务端口（默认 3000） |
| 基础 | `JWT_SECRET` | JWT 签名密钥（**必填**，随机长字符串） |
| 基础 | `ADMIN_USERNAME` | 管理员用户名（**必填**，注册时自动匹配） |
| 上传 | `MAX_FILE_SIZE` | 单文件最大字节数（默认 20MB） |
| 上传 | `MAX_BATCH_SIZE` | 单次上传队列总上限（默认 100MB，预留） |
| 游客 | `GUEST_ENABLED` | 是否开放游客上传（默认 true） |
| 游客 | `GUEST_DAILY_LIMIT` | 每 IP 每日上传次数（默认 20） |
| 游客 | `GUEST_MAX_FILE_SIZE` | 游客单文件上限（默认 10MB） |
| 游客 | `GUEST_RETENTION_DAYS` | 游客图片保留天数（默认 30） |
| 游客 | `GUEST_MAX_BATCH` | 游客单次最大上传张数（默认 3） |
| 审核 | `MODERATION_ENABLED` | 审核总开关（默认 true） |
| 审核 | `MODERATION_PROVIDER` | 审核提供方：local / mock（默认 local） |
| 审核 | `MODERATION_THRESHOLD_REJECT` | AI 评分 ≥ 此值自动拒绝（默认 0.9） |
| 审核 | `MODERATION_THRESHOLD_REVIEW` | AI 评分 ≥ 此值进入人工复审（默认 0.6） |
| 审核 | `MODERATION_LOG_RETENTION_DAYS` | 审核日志保留天数（默认 180） |
| 限流 | `RATE_LIMIT_WINDOW_MS` | 限流时间窗口（默认 60000ms） |
| 限流 | `RATE_LIMIT_MAX` | 窗口内最大请求数（默认 30） |

> 完整说明见 [docs/self-hosting/configuration.md](docs/self-hosting/configuration.md)

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

### 一键部署（推荐）

```bash
chmod +x install.sh && ./install.sh
```

> 交互式引导：检查环境 → 安装依赖 → 配置 .env → 启动 PM2 → 保存配置

### Linux 生产环境

完整部署指南见 [docs/self-hosting/install-linux.md](docs/self-hosting/install-linux.md)，包含 Nginx 反代、HTTPS、防火墙等 8 步详细说明。

### Docker

```bash
docker build -t neon-img .
docker run -d -p 3000:3000 --name neon-img \
  -v $(pwd)/server/uploads:/app/server/uploads \
  -v $(pwd)/server/data:/app/server/data \
  neon-img
```

### 配套文档

| 文档 | 说明 |
|------|------|
| [requirements.md](docs/self-hosting/requirements.md) | 硬件/软件/网络前置要求 |
| [install-linux.md](docs/self-hosting/install-linux.md) | Ubuntu/Debian 裸机部署完整流程 |
| [configuration.md](docs/self-hosting/configuration.md) | 全部 17 个环境变量详解 |
| [backup-restore.md](docs/self-hosting/backup-restore.md) | 备份策略与灾难恢复 |
| [troubleshooting.md](docs/self-hosting/troubleshooting.md) | 常见问题排查（19 个条目） |

---

## 项目结构

```
image-host/
├── server/
│   ├── app.js                    # Express 入口
│   ├── routes/
│   │   ├── upload.js             # 上传/列表/删除/回收站/恢复 + 游客上传
│   │   ├── auth.js               # 注册/登录/用户信息/重置 Token
│   │   └── admin.js              # 管理员用户管理 + 审核复审
│   ├── middleware/
│   │   ├── auth.js               # JWT + API Token + Admin 鉴权中间件 + 限流
│   │   └── multerConfig.js       # 上传文件校验（类型/大小/随机名）
│   ├── utils/
│   │   ├── meta.js               # images.json / trash.json 读写
│   │   ├── userMeta.js           # users.json 读写 + 查询
│   │   ├── imageProcess.js       # sharp 缩略图生成（WebP 300x300）
│   │   ├── moderator.js          # 审核引擎（魔数校验 + 可插拔 Provider）
│   │   └── moderationMeta.js     # 审核日志读写 + 过期清理
│   ├── uploads/                  # 图片存储（运行时生成，勿提交）
│   ├── data/                     # JSON 元数据（运行时生成，勿提交）
│   └── test/                     # 冒烟测试脚本 + 测试文件
├── public/
│   ├── index.html                # 前端骨架 + HUD + 上传区 + 画廊
│   ├── style.css                 # 赛博朋克样式（CSS 变量 + 响应式）
│   ├── app.js                    # 前端交互（~2400 行原生 JS）
│   └── video/                    # 背景视频
├── docs/
│   └── self-hosting/             # 自托管部署文档
│       ├── README.md             # 5 分钟快速开始
│       ├── requirements.md       # 服务器前置要求
│       ├── configuration.md      # 环境变量完整说明
│       ├── install-linux.md      # Linux 裸机部署指南
│       ├── backup-restore.md     # 备份与恢复
│       └── troubleshooting.md    # 常见问题排查
├── .env.example                  # 环境变量模板（17 个变量 + 中文注释）
├── install.sh                    # 一键部署脚本（交互式 7 步引导）
├── ecosystem.config.js           # PM2 配置
├── Dockerfile                    # 容器化
├── CLAUDE.md                     # 项目宪法（开发规范）
└── 图床项目搭建文档.md            # 完整搭建指南
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

### 游客接口

| 方法 | 路径 | 鉴权 | 说明 |
|------|------|------|------|
| POST | `/api/guest/upload` | 无 | 游客上传（IP 限流，格式/大小/张数限制） |
| DELETE | `/api/guest/image/:id` | guestToken | 游客删除（需上传时返回的 token） |

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
| GET | `/api/admin/moderation` | verifyAdmin | 待复审图片列表 |
| POST | `/api/admin/moderation/:imageId/pass` | verifyAdmin | 审核通过 |
| POST | `/api/admin/moderation/:imageId/reject` | verifyAdmin | 审核拒绝 |

### 鉴权方式

```
浏览器前端：Authorization: Bearer <jwt>
外部工具：  x-upload-token: <api_token>
游客管理：  ?guestToken=<token>
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

## License

MIT

---

> 🌃 Stay sharp, samurai.
