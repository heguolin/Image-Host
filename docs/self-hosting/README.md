# NEON.IMG // SELF-HOSTING QUICK START

> 5 分钟内在你的服务器上跑起来 · Powered by Night City

---

## 前置要求

| 项目 | 最低版本 |
|------|----------|
| Node.js | ≥ 18.x |
| npm | ≥ 9.x |
| Git | ≥ 2.x |
| OS | Ubuntu 20.04+ / Debian 11+ / CentOS 7+ |

> 详细硬件要求见 [requirements.md](requirements.md)

---

## 5 分钟快速开始

### Step 1 // CLONE REPOSITORY

```bash
git clone https://github.com/your-org/neon-img.git /opt/neon-img
cd /opt/neon-img
```

### Step 2 // CONFIGURE ENVIRONMENT

```bash
cp .env.example .env
nano .env
```

**至少填写两项：**

```env
JWT_SECRET=你的随机长字符串（建议 32 位以上）
ADMIN_USERNAME=你的管理员用户名
```

> 注册时用户名匹配 `ADMIN_USERNAME` 即自动成为管理员。

完整配置项见 [configuration.md](configuration.md)

### Step 3 // RUN INSTALLER

```bash
chmod +x install.sh
./install.sh
```

脚本会自动：检查环境 → 安装依赖 → 提示 PM2 安装 → 启动服务

### Step 4 // VERIFY

```bash
# 检查服务状态
pm2 status

# 浏览器访问
curl http://localhost:3000
```

看到 `◤ NEON.IMG ◢` 的登录页即部署成功。

---

## 手动安装（不使用 install.sh）

```bash
cd /opt/neon-img/server
npm install --production
cp ../.env.example ../.env
# 编辑 ../.env 填写 JWT_SECRET 和 ADMIN_USERNAME
pm2 start app.js --name neon-img
pm2 save && pm2 startup
```

---

## 配置反向代理

生产环境建议通过 Nginx 反代并开启 HTTPS，详见 [install-linux.md](install-linux.md) Step 6-7。

---

## 下一步

| 文档 | 说明 |
|------|------|
| [configuration.md](configuration.md) | 全部环境变量说明 |
| [install-linux.md](install-linux.md) | 完整部署流程（含 Nginx + HTTPS） |
| [backup-restore.md](backup-restore.md) | 数据备份与恢复 |
| [troubleshooting.md](troubleshooting.md) | 常见问题排查 |

---

> 🌃 Stay sharp, samurai.
