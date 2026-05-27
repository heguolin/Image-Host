# NEON.IMG // SERVER REQUIREMENTS

> 硬件、系统、网络前置条件

---

## 硬件要求

| 场景 | CPU | 内存 | 磁盘 | 说明 |
|------|-----|------|------|------|
| 个人轻量使用（< 1000 张/月） | 1 核 | 1 GB | 20 GB SSD | 适合个人图床 |
| 小团队（< 10000 张/月） | 2 核 | 2 GB | 50 GB SSD | 支持多用户 |
| 推荐配置（多用户生产） | 2 核 | 4 GB | 100 GB SSD | 开启审核 + 高并发 |

磁盘空间估算：
- 每张原图按 2MB 计，缩略图约 30KB
- `server/data/` 目录 JSON 文件极小（每千条约 500KB）
- 建议预留 3 倍于预期的存储空间

---

## 软件依赖

| 软件 | 最低版本 | 用途 | 安装方式 |
|------|----------|------|----------|
| Node.js | ≥ 18.0 | 运行时 | [nvm](https://github.com/nvm-sh/nvm) 推荐 |
| npm | ≥ 9.0 | 包管理 | 随 Node.js 附带 |
| Git | ≥ 2.0 | 代码部署 | `apt install git` |
| PM2 | ≥ 5.0 | 进程守护 | `npm install -g pm2` |
| Nginx | ≥ 1.18 | 反向代理 | `apt install nginx` |
| Certbot | ≥ 2.0 | HTTPS 证书 | `apt install certbot python3-certbot-nginx` |

> sharp（图片处理）依赖 libvips，通常 npm install 时自动下载预编译二进制，详见 [troubleshooting.md](troubleshooting.md)。

---

## 网络要求

| 端口 | 协议 | 用途 | 是否必须对外开放 |
|------|------|------|------------------|
| 80 | HTTP | Nginx 反代 + Certbot 验证 | 是 |
| 443 | HTTPS | 加密传输 | 是 |
| 3000 | HTTP | Node.js 本地端口 | 否（仅 localhost） |

> 生产环境 Node.js 只监听 `127.0.0.1:3000`，由 Nginx 反代对外暴露。

---

## 域名（建议）

- 建议配置独立域名（如 `img.example.com`）
- 用于 HTTPS 证书申请和防盗链 Referer 校验
- 无域名时可使用 IP + HTTP，但功能受限（无法 HTTPS、部分 CDN 不可用）

---

## 操作系统

| OS | 版本 | 支持状态 |
|----|------|----------|
| Ubuntu Server | 20.04 / 22.04 / 24.04 | 推荐 |
| Debian | 11 / 12 | 推荐 |
| CentOS / Rocky | 7 / 8 / 9 | 支持 |
| Windows Server | 2019+ | 仅开发环境 |

> 生产部署仅推荐 Linux。Windows 可用 WSL2。

---

> 🌃 Stay sharp, samurai.
