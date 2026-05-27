# NEON.IMG // TROUBLESHOOTING

> 常见问题及解决方案 · 遇到错误先查这里

---

## 上传问题

| 问题 | 原因 | 解决方案 |
|------|------|----------|
| 上传返回 `413 Request Entity Too Large` | Nginx `client_max_body_size` 小于文件大小 | 修改 Nginx 配置：`client_max_body_size 25m;` 并 `nginx -t && systemctl reload nginx` |
| 上传返回 `400 不支持的文件类型` | 文件扩展名不在白名单中（支持：JPG/PNG/GIF/WEBP/SVG） | 检查文件格式，游客模式额外限制仅 PNG/JPG/WEBP |
| 上传返回 `401 SESSION EXPIRED` | JWT 过期（7 天有效）或未携带 Authorization 头 | 重新登录获取新 JWT，检查前端请求是否带 `Authorization: Bearer <token>` |
| 上传返回 `400 NO VALID FILES`（游客） | 游客上传的文件格式/大小不符合要求 | 游客仅支持 PNG/JPG/WEBP ≤ 10MB，单次 ≤ 3 张 |
| 上传返回 `429 GUEST LIMIT EXCEEDED` | 该 IP 当日游客上传次数已达上限 | 等待次日重置，或登录账号后无限制上传 |
| 上传成功但不显示在画廊 | 图片被审核管线 REJECT（魔数 / 扩展名不匹配） | 检查 `moderation_log.json` 确认审核结果 |

---

## 图片访问问题

| 问题 | 原因 | 解决方案 |
|------|------|----------|
| 图片返回 404 | Nginx `/i/` location 配置错误或文件不存在 | 确认 Nginx 配置中有 `alias /opt/neon-img/server/uploads/;`，检查 `uploads/` 目录是否存在该文件 |
| 图片显示但缩略图不显示 | sharp 处理失败或缩略图文件丢失 | 检查 `uploads/` 目录中是否有 `*_thumb.webp` 文件，重新上传测试 |
| Nginx 静态资源不更新 | 浏览器缓存 | `Ctrl+F5` 强制刷新，或在 Nginx 中调整 Cache-Control |

---

## 服务运行问题

| 问题 | 原因 | 解决方案 |
|------|------|----------|
| `pm2 status` 显示 `errored` | 进程崩溃 | `pm2 logs neon-img --lines 50` 查看错误日志，常见原因：.env 缺少 JWT_SECRET、端口被占用 |
| `Error: listen EADDRINUSE :::3000` | 端口 3000 被占用 | `lsof -i :3000` 查看占用进程，`kill <pid>` 或更改 .env 中 PORT |
| `ERR_ERL_UNEXPECTED_X_FORWARDED_FOR` | Express 5 信任代理设置问题 | 在 Nginx 配置中确保设置了 `proxy_set_header X-Forwarded-For`，或在 app.js 中设置 `app.set('trust proxy', 1)` |
| 启动后无法从外网访问 | 防火墙未开放端口 | `sudo ufw allow 80/tcp && sudo ufw allow 443/tcp` 开放 HTTP/HTTPS 端口 |

---

## 安装与依赖问题

| 问题 | 原因 | 解决方案 |
|------|------|----------|
| sharp 安装失败（`ERR! sharp`） | 缺少 libvips 系统库或 Node.js 版本不兼容 | `sudo apt install libvips-dev -y` 后重新 `npm install`；或降级 sharp 版本 |
| `npm install` 报 `nanoid` 版本冲突 | nanoid 5.x 是 ESM only，项目需要 3.x（CommonJS） | 确认 `package.json` 中 nanoid 版本为 `^3.3.7`，删除 `node_modules/` 重新安装 |
| bcryptjs 或其他模块找不到 | `npm install` 未在 server/ 目录执行 | 确认当前在 `server/` 目录：`cd /opt/neon-img/server && npm install --production` |

---

## 鉴权与安全

| 问题 | 原因 | 解决方案 |
|------|------|----------|
| 登录返回 `500 JWT_SECRET NOT CONFIGURED` | .env 中未设置 JWT_SECRET | 编辑 .env 设置 `JWT_SECRET=随机字符串`，重启服务 |
| 注册后不是管理员 | 注册用户名与 `ADMIN_USERNAME` 不匹配 | 检查 .env 中 `ADMIN_USERNAME` 的值，重新注册匹配的用户名 |
| 管理员面板返回 403 | 当前用户 `isAdmin` 不为 true | 确认登录用户的用户名与 `ADMIN_USERNAME` 一致；如之前注册时未匹配，需要重新注册或手动修改 `users.json` |

---

## 其他问题

| 问题 | 原因 | 解决方案 |
|------|------|----------|
| 游客上传突然返回 403 | `GUEST_ENABLED` 被设为 `false` | 检查 .env 确认 `GUEST_ENABLED=true` |
| 审核状态一直 PENDING | MODERATION_PROVIDER 设置的 provider 未响应 | 检查 .env 中 `MODERATION_PROVIDER`，本地模式默认直接 PASS |
| JSON 元数据损坏 | 手动编辑 data/*.json 格式错误 | 用 `node -e "JSON.parse(require('fs').readFileSync(...))"` 验证 JSON 格式，从备份恢复 |

---

## 收集诊断信息

反馈问题时请提供以下信息：

```bash
# 系统信息
uname -a && cat /etc/os-release | head -5

# Node 版本
node -v && npm -v

# PM2 状态 + 最近日志
pm2 status
pm2 logs neon-img --lines 100 --nostream

# .env（脱敏）
grep -v 'SECRET\|PASSWORD\|TOKEN' /opt/neon-img/.env
```

---

> 🌃 Stay sharp, samurai.
