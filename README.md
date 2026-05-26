# ◤ NEON.IMG ◢

> 赛博朋克风格图床服务 · Cyberpunk Image Hosting Service  
> "Wake up, samurai. We have images to host."

---

## 项目简介

NEON.IMG 是一个基于 Node.js + Express 的轻量级图床服务，提供图片上传、在线查看、一键复制链接（URL / Markdown / HTML）和删除功能。前端采用赛博朋克霓虹美学 UI，支持拖拽、点击、粘贴三种上传方式。

- **后端**：Express 5 + Multer 2 + nanoid 3（CommonJS）
- **前端**：原生 HTML + CSS + JS（无框架 / 无构建工具）
- **存储**：本地文件系统 + JSON 元数据（无需数据库）
- **部署**：PM2 + Nginx 反向代理

---

## 快速启动

### 本地开发（Windows）

```powershell
cd server
npm install
npm run dev
```

浏览器打开 **http://localhost:3000**

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
docker run -d -p 3000:3000 --name neon-img -v $(pwd)/server/uploads:/app/server/uploads -v $(pwd)/server/data:/app/server/data neon-img
```

### Nginx 反向代理

参考 `图床项目搭建文档.md` §10，配置域名 + HTTPS。

---

## 项目结构

```
image-host/
├── server/
│   ├── app.js                # Express 入口
│   ├── routes/upload.js      # 上传/删除/列表路由
│   ├── middleware/multerConfig.js  # 上传校验
│   ├── utils/meta.js         # JSON 元数据读写
│   ├── uploads/              # 图片存储（运行时生成）
│   ├── data/                 # 元数据（运行时生成）
│   └── test/                 # 冒烟测试脚本
├── public/
│   ├── index.html            # 前端骨架
│   ├── style.css             # 赛博朋克样式
│   ├── app.js                # 前端交互
│   └── video/                # 背景视频
├── ecosystem.config.js       # PM2 配置
├── Dockerfile                # 容器化
├── CLAUDE.md                 # 项目宪法
└── 图床项目搭建文档.md        # 完整搭建指南
```

---

## API

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/upload` | 上传图片（字段 `files`，最多 10 个） |
| GET | `/api/list` | 获取图片列表 |
| DELETE | `/api/image/:id` | 删除指定图片 |
| GET | `/i/<filename>` | 访问图片 |

返回格式：`{ code: 0|1, msg: "...", data: ... }`

---

## 技术栈

| 层 | 技术 | 版本 |
|---|---|---|
| 运行时 | Node.js | v22 |
| 后端 | Express | 5.2.1 |
| 上传 | Multer | 2.1.1 |
| ID 生成 | nanoid | 3.3.x |
| 进程管理 | PM2 | — |
| 反向代理 | Nginx | — |

---

## 截图

> TODO: 添加上传界面、画廊、删除确认的截图

---

## License

MIT

---

> 🌃 Stay sharp, samurai.
