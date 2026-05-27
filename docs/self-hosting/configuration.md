# NEON.IMG // CONFIGURATION REFERENCE

> 所有环境变量完整说明 · `.env` 文件配置指南

---

## 基础配置

| 变量 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `PORT` | number | `3000` | 服务监听端口，与 Nginx `proxy_pass` 保持一致 |
| `JWT_SECRET` | string | — | **必填**。JWT 签名密钥，建议 32 位以上随机字符串。不设置时所有鉴权接口返回 401 |
| `ADMIN_USERNAME` | string | — | **必填**。管理员用户名。注册时用户名与此值匹配的用户自动获得管理员权限 |

```env
PORT=3000
JWT_SECRET=aB3xK9mP2vR7wQ6nF8jL5tY1cH4dG0sA
ADMIN_USERNAME=admin
```

---

## 上传限制

| 变量 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `MAX_FILE_SIZE` | number | `20971520`（20MB） | 单文件最大字节数，前端 + Multer 双重校验 |
| `MAX_BATCH_SIZE` | number | `104857600`（100MB） | 单次上传队列总上限（预留字段，当前版本未强制校验） |

```env
MAX_FILE_SIZE=20971520
MAX_BATCH_SIZE=104857600
```

---

## 游客模式

| 变量 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `GUEST_ENABLED` | boolean | `true` | 是否开放游客匿名上传通道。`false` 时游客接口返回 403 |
| `GUEST_DAILY_LIMIT` | number | `20` | 每 IP 每日最大上传次数（内存计数，重启重置） |
| `GUEST_MAX_FILE_SIZE` | number | `10485760`（10MB） | 游客单文件上限（字节） |
| `GUEST_RETENTION_DAYS` | number | `30` | 游客图片保留天数，过期后懒清理 |
| `GUEST_MAX_BATCH` | number | `3` | 游客单次最大上传张数 |

```env
GUEST_ENABLED=true
GUEST_DAILY_LIMIT=20
GUEST_MAX_FILE_SIZE=10485760
GUEST_RETENTION_DAYS=30
GUEST_MAX_BATCH=3
```

---

## 图片审核

| 变量 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `MODERATION_ENABLED` | boolean | `true` | 总开关。`false` 时跳过所有审核，直接 PASS |
| `MODERATION_PROVIDER` | string | `local` | 审核服务提供方：`local`（仅本地预检）、`mock`（测试用随机分数）、自定义（预留扩展） |
| `MODERATION_THRESHOLD_REJECT` | number | `0.9` | AI 评分 ≥ 此值时自动拒绝 |
| `MODERATION_THRESHOLD_REVIEW` | number | `0.6` | AI 评分 ≥ 此值且 < REJECT 阈值时进入人工复审 |
| `MODERATION_LOG_RETENTION_DAYS` | number | `180` | 审核操作日志保留天数 |

```env
MODERATION_ENABLED=true
MODERATION_PROVIDER=local
MODERATION_THRESHOLD_REJECT=0.9
MODERATION_THRESHOLD_REVIEW=0.6
MODERATION_LOG_RETENTION_DAYS=180
```

**阈值判定逻辑：**

```
score >= REJECT_THRESHOLD    → REJECT（隔离，不对外提供链接）
score >= REVIEW_THRESHOLD    → NEED_REVIEW（外链可用，等待人工复审）
score < REVIEW_THRESHOLD     → PASS（正常）
```

---

## 限流

| 变量 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `RATE_LIMIT_WINDOW_MS` | number | `60000`（1 分钟） | 限流时间窗口（毫秒） |
| `RATE_LIMIT_MAX` | number | `30` | 窗口内最大请求数（基于 IP） |

```env
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX=30
```

> 限流中间件对所有 `/api` 路由生效。超出限制返回 429 `// RATE LIMITED // SLOW DOWN SAMURAI`

---

## 完整配置模板

复制以下内容为 `.env` 并修改敏感项：

```env
# ============================================================
# NEON.IMG // ENVIRONMENT CONFIGURATION
# ============================================================

# ---------- 基础 ----------
PORT=3000
JWT_SECRET=change_me_to_a_random_string_32_chars_min
ADMIN_USERNAME=admin

# ---------- 上传 ----------
MAX_FILE_SIZE=20971520
MAX_BATCH_SIZE=104857600

# ---------- 游客 ----------
GUEST_ENABLED=true
GUEST_DAILY_LIMIT=20
GUEST_MAX_FILE_SIZE=10485760
GUEST_RETENTION_DAYS=30
GUEST_MAX_BATCH=3

# ---------- 审核 ----------
MODERATION_ENABLED=true
MODERATION_PROVIDER=local
MODERATION_THRESHOLD_REJECT=0.9
MODERATION_THRESHOLD_REVIEW=0.6
MODERATION_LOG_RETENTION_DAYS=180

# ---------- 限流 ----------
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX=30
```

---

> 🌃 Stay sharp, samurai.
