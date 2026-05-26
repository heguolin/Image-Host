# CLAUDE.md

> 项目宪法。Claude 每次回复前必须完整阅读并严格遵守。

## 1. 项目概述

- **名称**：NEON.IMG（赛博朋克风格图床）
- **功能**：图片上传 / 查看 / 删除 / 生成 URL·MD·HTML 链接
- **阶段**：MVP 基础版，本地 Windows 开发 → Linux 服务器部署
- **详细文档**：参见 `图床项目搭建文档.md`（冲突时以本文件为准）

## 2. 技术栈（强约束，禁止擅自更换）

| 层 | 技术 | 版本 |
| --- | --- | --- |
| 运行时 | Node.js | v22.21.0 |
| 后端 | Express | express@5.2.1 |
| 上传 | Multer | multer@2.1.1 |
| ID | **nanoid ^3.x（CommonJS，禁止 5.x ESM）** | ^3 |
| 其他 | cors ^2.8 / dotenv ^16 / nodemon ^3（dev） | - |
| 前端 | **原生 HTML + CSS + JS**（禁止 React/Vue/构建工具） | - |
| 存储 | 本地文件 `server/uploads/` + JSON `server/data/images.json`（**不引入数据库**） | - |
| 部署 | PM2 + Nginx | - |

> ⚠️ 新增依赖前必须先说明：用途 / 替代方案 / 体积，等我确认。

## 3. 目录结构

```
image-host/
├── CLAUDE.md
├── node_modules
├── CLAUDE.md
├── 图床项目搭建文档.md
├── .env / .gitignore / ecosystem.config.js
├── server/
│   ├── app.js
│   ├── package.json
│   ├── routes/upload.js
│   ├── middleware/multerConfig.js
│   ├── utils/meta.js
│   ├── uploads/   # 运行时生成，勿提交
│   └── data/      # 运行时生成，勿提交
└── public/
    ├── index.html
    ├── style.css
    └── app.js
```

新文件归类：路由→`routes/`、工具→`utils/`、中间件→`middleware/`。禁止在根目录散建文件。

## 4. 代码规范

- **语言**：注释、commit、文档全用中文
- **格式**：2 空格缩进；JS 用单引号 + 分号；HTML/JSON 用双引号；UTF-8 无 BOM；文件末尾留空行
- **后端 JS**：CommonJS（`require`/`module.exports`），禁止混用 ESM；统一 `async/await`；路径用 `path.join(__dirname, ...)`
- **前端 JS**：原生，禁 jQuery/Lodash；用 `addEventListener`，禁 inline `onclick`；用 `fetch + async/await`
- **CSS**：**必须用 `:root` 变量**（见 §5.1），禁硬编码颜色；动画考虑 `prefers-reduced-motion`
- **HTML**：语义化标签；`<img>` 必带 `alt` 和 `loading="lazy"`
- **统一 API 返回**：`{ code: 0|1, msg: '...', data: ... }`

## 5. 赛博朋克设计规范（UI 改动必须遵循）

### 5.1 颜色变量（禁止新增颜色）

```css
--neon-cyan:#00F0FF;  --neon-magenta:#FF2E97;  --neon-yellow:#F9F002;
--neon-red:#FF003C;   --neon-purple:#B026FF;
--bg-void:#0A0E1A;    --bg-indigo:#11132B;    --bg-surface:#1A1F3A;  --grid-line:#1F2A4A;
--text-main:#E6F1FF;  --text-sub:#7A8CA8;     --text-mute:#3D4A6B;
```

### 5.2 字体

- 标题：`Orbitron` 700/900
- 数据/链接/终端：`JetBrains Mono`
- 正文：`Rajdhani`

### 5.3 视觉必备

深色底（禁纯白）+ 霓虹点缀 + `text-shadow` 发光 + `box-shadow` 外发光边框 + 扫描线/网格 + 文案英文化全大写带 `[ ]` 或 `//`。

### 5.4 文案对照（必须沿用此风格）

| 普通 | 赛博朋克 |
| --- | --- |
| 上传成功 | `[ SUCCESS ] DATA PACKET RECEIVED` |
| 上传失败 | `[ ERROR ] CONNECTION LOST // RETRY?` |
| 已复制 | `[ COPIED TO CLIPBOARD ]` |
| 删除确认 | `! WARNING: PURGE THIS DATA?` |
| 已删除 | `[ DATA PURGED ]` |
| 空状态 | `// NO DATA FOUND IN VAULT` |

## 6. API 约定

- 前缀：`/api`；图片访问：`/i/<filename>`
- 返回：`{ code, msg, data }`；`code:0` 成功，`code:1` 业务失败

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/api/upload` | 字段 `files`，最多 10 个 |
| GET | `/api/list` | 列表 |
| DELETE | `/api/image/:id` | 删除 |

新增接口前先给出设计稿（路径/方法/入参/出参），等我确认。

## 7. 安全约束

- 密钥/Token 必须走 `.env`，**禁止硬编码**
- `.env` 必须在 `.gitignore`
- 上传保持：白名单 + 大小限制 + 随机重命名（**禁止弱化**）
- 新增对外写接口必须配套鉴权
- 用户输入输出到 HTML 必须转义防 XSS

## 8. Git 规范

- 分支：`main` / `feat/xxx` / `fix/xxx`
- Commit（Conventional Commits）：
  ```
  feat(upload): 增加 webp 支持
  fix(ui): 修复移动端卡片溢出
  docs / style / refactor / chore
  ```
- 禁止提交：`node_modules/` `uploads/` `data/` `.env` `*.log` `.DS_Store`

## 9. Claude 行为约束 ⭐

### ✅ 必须

1. 改代码前**先说思路**，确认方向再动手
2. **小步迭代**，一次只改一个关注点
3. 多方案时**先列对比**让我选
4. 多步任务用 **TODO 列表**逐项推进
5. 代码改动同步更新 `图床项目搭建文档.md` 对应章节
6. UI 改动必须符合 §5 规范

### ❌ 禁止

1. ❌ 擅自引入新依赖 / 新框架 / 构建工具
2. ❌ 把原生前端改写成 React/Vue
3. ❌ 把本地存储改成数据库（除非我明确要求）
4. ❌ 一次性大改多文件 / 重写项目
5. ❌ 删除已有注释和文档
6. ❌ 使用未定义的颜色 / 字体
7. ❌ 未确认就执行破坏性操作（`rm -rf` / `git push -f` / 删文件）
8. ❌ 使用 `nanoid@5+`（与 CommonJS 冲突）
9. ❌ UI 文案不参考 §5.4 风格

## 10. 当前 TODO（按优先级）

- [x] **P0** MVP 基础版（上传/查看/删除/复制链接 · 赛博朋克 UI · 冒烟测试）
- [x] **P0** PM2 部署配置 + Dockerfile
- [ ] **P1** 上传接口加 Token 鉴权
- [ ] **P1** 上传进度条（XHR 替代 fetch）
- [ ] **P2** sharp 生成缩略图
- [ ] **P2** 批量删除 / 批量复制
- [ ] **P3** SQLite 替代 JSON
- [ ] **P3** Docker Compose 部署
- [ ] **P4** 多主题切换

## 11. 沟通偏好

- 回复 / 注释：**中文**
- 长方案用 Markdown 表格/列表
- **不确定先问，不要猜**
- 不可逆操作**必须先确认**

---

> 📌 本文件即"项目宪法"，冲突以此为准。修改需 commit：`docs(claude): 更新 xx 约束`  
> 🌃 Stay sharp, samurai.
