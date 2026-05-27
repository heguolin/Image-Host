# NEON.IMG // LINUX INSTALLATION GUIDE

> Ubuntu / Debian 裸机部署完整流程

---

## Step 1 // INSTALL NODE.JS

推荐通过 nvm 安装，便于版本管理：

```bash
# 安装 nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash

# 重新加载 shell 配置
source ~/.bashrc

# 安装 Node.js LTS
nvm install 22
nvm use 22
nvm alias default 22

# 验证
node -v   # v22.x.x
npm -v    # 10.x.x
```

---

## Step 2 // CLONE REPOSITORY

```bash
git clone https://github.com/your-org/neon-img.git /opt/neon-img
cd /opt/neon-img
```

---

## Step 3 // INSTALL DEPENDENCIES

```bash
cd /opt/neon-img/server
npm install --production
```

> 如果 `sharp` 安装失败，见 [troubleshooting.md](troubleshooting.md) 第 5 条。

---

## Step 4 // CONFIGURE .ENV

```bash
cp /opt/neon-img/.env.example /opt/neon-img/.env
nano /opt/neon-img/.env
```

**最少需要修改：**

```env
JWT_SECRET=你的随机字符串（openssl rand -hex 32 生成）
ADMIN_USERNAME=你的管理员用户名
```

---

## Step 5 // INSTALL PM2 & START

```bash
# 安装 PM2
npm install -g pm2

# 启动服务
pm2 start /opt/neon-img/server/app.js --name neon-img

# 设置开机自启
pm2 save
pm2 startup
# 执行输出的 sudo 命令
```

常用 PM2 命令：

```bash
pm2 status          # 查看状态
pm2 logs neon-img   # 查看日志
pm2 restart neon-img --update-env  # 修改 .env 后重启
pm2 stop neon-img   # 停止
```

---

## Step 6 // INSTALL NGINX & REVERSE PROXY

```bash
# 安装 Nginx
sudo apt update && sudo apt install nginx -y

# 创建站点配置
sudo nano /etc/nginx/sites-available/neon-img
```

**完整 Nginx 配置示例：**

```nginx
# /etc/nginx/sites-available/neon-img
server {
    listen 80;
    server_name img.example.com;  # 替换为实际域名

    # 上传大小限制（需大于 MAX_FILE_SIZE）
    client_max_body_size 25m;

    # 安全头
    add_header X-Content-Type-Options nosniff;
    add_header X-Frame-Options DENY;

    # 静态资源直出（public/ 目录）
    location / {
        root /opt/neon-img/public;
        try_files $uri $uri/ @node;
    }

    # 图片文件（/i/<filename>）
    location /i/ {
        alias /opt/neon-img/server/uploads/;
        expires 30d;
        add_header Cache-Control "public, immutable";
    }

    # API 请求反代到 Node.js
    location @node {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 120s;
        proxy_send_timeout 120s;
    }

    # API 路径直接反代
    location /api/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 120s;
    }
}
```

启用站点：

```bash
sudo ln -s /etc/nginx/sites-available/neon-img /etc/nginx/sites-enabled/
sudo rm /etc/nginx/sites-enabled/default  # 移除默认站点（可选）

# 测试配置
sudo nginx -t

# 重载
sudo systemctl reload nginx
```

---

## Step 7 // HTTPS WITH CERTBOT

```bash
# 安装 Certbot
sudo apt install certbot python3-certbot-nginx -y

# 申请证书（交互式）
sudo certbot --nginx -d img.example.com

# 验证自动续期
sudo certbot renew --dry-run
```

> Certbot 会自动续期。证书有效期 90 天。

---

## Step 8 // VERIFY & USEFUL COMMANDS

```bash
# 服务状态检查
pm2 status
sudo systemctl status nginx

# 访问验证
curl -I https://img.example.com

# 修改 .env 后重启
cd /opt/neon-img
nano .env
pm2 restart neon-img --update-env

# 查看实时日志
pm2 logs neon-img --lines 50

# PM2 进程异常时手动重启
pm2 restart neon-img
pm2 flush           # 清空日志

# Nginx 配置测试 + 重载
sudo nginx -t && sudo systemctl reload nginx
```

---

### 下一步

- [backup-restore.md](backup-restore.md) — 配置自动备份
- [configuration.md](configuration.md) — 查看全部环境变量
- [troubleshooting.md](troubleshooting.md) — 遇到问题先看这里

---

> 🌃 Stay sharp, samurai.
