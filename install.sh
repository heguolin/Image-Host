#!/usr/bin/env bash
# ============================================================
# NEON.IMG // INSTALL SCRIPT
# 交互式部署引导 · 适用于 Ubuntu / Debian
# 用法: chmod +x install.sh && ./install.sh
# ============================================================
set -euo pipefail

# ---- 颜色 ----
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
NC='\033[0m' # No Color

# ---- 项目路径（脚本所在目录） ----
PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
SERVER_DIR="$PROJECT_DIR/server"
ENV_FILE="$PROJECT_DIR/.env"
NEED_RESTART=false

# ---- 日志函数 ----
log_info()  { echo -e "${CYAN}[NEON]${NC} $1"; }
log_ok()    { echo -e "${GREEN}[NEON]${NC} $1 ${GREEN}✓${NC}"; }
log_warn()  { echo -e "${YELLOW}[NEON]${NC} $1"; }
log_err()   { echo -e "${RED}[NEON]${NC} $1 ${RED}✗${NC}"; }

banner() {
  echo ""
  echo -e "${MAGENTA}  ███╗   ██╗███████╗ ██████╗ ███╗   ██╗   ██╗███╗   ███╗ ██████╗ "
  echo "  ████╗  ██║██╔════╝██╔═══██╗████╗  ██║   ██║████╗ ████║██╔════╝ "
  echo "  ██╔██╗ ██║█████╗  ██║   ██║██╔██╗ ██║   ██║██╔████╔██║██║  ███╗"
  echo "  ██║╚██╗██║██╔══╝  ██║   ██║██║╚██╗██║   ██║██║╚██╔╝██║██║   ██║"
  echo "  ██║ ╚████║███████╗╚██████╔╝██║ ╚████║   ██║██║ ╚═╝ ██║╚██████╔╝"
  echo "  ╚═╝  ╚═══╝╚══════╝ ╚═════╝ ╚═╝  ╚═══╝   ╚═╝╚═╝     ╚═╝ ╚═════╝ ${NC}"
  echo -e "                      ${CYAN}// SELF-HOSTING INSTALLER //${NC}"
  echo ""
}

# ---- 步骤 1：检查运行环境 ----
step1_check_env() {
  log_info "STEP 1/7 // CHECKING ENVIRONMENT..."

  # 检查 Node.js
  if ! command -v node &>/dev/null; then
    log_err "Node.js 未安装，请先安装 Node.js >= 18"
    echo "  推荐: curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash"
    echo "  然后: nvm install 22"
    exit 1
  fi
  local node_ver
  node_ver=$(node -v | sed 's/v//' | cut -d. -f1)
  if [ "$node_ver" -lt 18 ]; then
    log_err "Node.js 版本过低 (当前: $(node -v))，需要 >= 18"
    exit 1
  fi
  log_ok "Node.js $(node -v)"

  # 检查 npm
  if ! command -v npm &>/dev/null; then
    log_err "npm 未安装"
    exit 1
  fi
  log_ok "npm $(npm -v)"

  # 检查 Git
  if ! command -v git &>/dev/null; then
    log_warn "Git 未安装，跳过版本检查"
  else
    log_ok "Git $(git --version | awk '{print $3}')"
  fi
}

# ---- 步骤 2：安装依赖 ----
step2_install_deps() {
  log_info "STEP 2/7 // INSTALLING DEPENDENCIES..."

  if [ ! -f "$SERVER_DIR/package.json" ]; then
    log_err "找不到 $SERVER_DIR/package.json，请确认项目结构完整"
    exit 1
  fi

  cd "$SERVER_DIR"

  if [ -d "node_modules" ] && [ -f "node_modules/.package-lock.json" ]; then
    log_info "检测到已有 node_modules，是否重新安装？[y/N]"
    read -r answer
    if [ "$answer" != "y" ] && [ "$answer" != "Y" ]; then
      log_ok "跳过安装"
      return
    fi
  fi

  log_info "执行 npm install --production..."
  if npm install --production; then
    log_ok "依赖安装完成"
  else
    log_err "依赖安装失败，请检查网络或尝试: sudo apt install libvips-dev -y"
    exit 1
  fi
}

# ---- 步骤 3：检查/创建 .env ----
step3_check_env() {
  log_info "STEP 3/7 // CONFIGURING .ENV..."

  if [ -f "$ENV_FILE" ]; then
    log_info "已存在 .env 文件"
    # 检查关键变量
    local jwt_secret
    jwt_secret=$(grep "^JWT_SECRET=" "$ENV_FILE" | cut -d= -f2- || true)
    if [ -z "$jwt_secret" ] || [ "$jwt_secret" = "change_me_to_a_random_string_32_chars_min" ]; then
      log_warn "JWT_SECRET 未修改，正在生成随机密钥..."
      local new_secret
      new_secret=$(openssl rand -hex 32 2>/dev/null || node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
      if [[ "$OSTYPE" == "darwin"* ]]; then
        sed -i '' "s/^JWT_SECRET=.*/JWT_SECRET=$new_secret/" "$ENV_FILE"
      else
        sed -i "s/^JWT_SECRET=.*/JWT_SECRET=$new_secret/" "$ENV_FILE"
      fi
      log_ok "JWT_SECRET 已自动生成"
    else
      log_ok "JWT_SECRET 已配置"
    fi
  else
    log_warn "未找到 .env 文件，正在从 .env.example 创建..."
    if [ -f "$PROJECT_DIR/.env.example" ]; then
      cp "$PROJECT_DIR/.env.example" "$ENV_FILE"
      # 自动生成 JWT_SECRET
      local new_secret
      new_secret=$(openssl rand -hex 32 2>/dev/null || node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
      if [[ "$OSTYPE" == "darwin"* ]]; then
        sed -i '' "s/^JWT_SECRET=.*/JWT_SECRET=$new_secret/" "$ENV_FILE"
      else
        sed -i "s/^JWT_SECRET=.*/JWT_SECRET=$new_secret/" "$ENV_FILE"
      fi
      log_ok ".env 已从模板创建，JWT_SECRET 已自动生成"
    else
      log_err "找不到 .env.example 模板文件"
      exit 1
    fi
  fi

  echo ""
  echo -e "  ${YELLOW}→ 请检查 .env 中的以下关键配置:${NC}"
  echo -e "    ADMIN_USERNAME = $(grep "^ADMIN_USERNAME=" "$ENV_FILE" | cut -d= -f2)"
  echo -e "    PORT           = $(grep "^PORT=" "$ENV_FILE" | cut -d= -f2)"
  echo -e "    GUEST_ENABLED  = $(grep "^GUEST_ENABLED=" "$ENV_FILE" | cut -d= -f2)"
  echo ""
  echo -e "  确认无误？[Y/n]"
  read -r answer
  if [ "$answer" = "n" ] || [ "$answer" = "N" ]; then
    log_info "请手动编辑 .env 后重新运行此脚本"
    exit 0
  fi
}

# ---- 步骤 4：检查 PM2 ----
step4_check_pm2() {
  log_info "STEP 4/7 // CHECKING PM2..."

  if ! command -v pm2 &>/dev/null; then
    log_warn "PM2 未安装，正在全局安装..."
    if npm install -g pm2; then
      log_ok "PM2 安装完成"
    else
      log_err "PM2 安装失败，请手动执行: npm install -g pm2"
      exit 1
    fi
  else
    log_ok "PM2 $(pm2 -v)"
  fi

  # 检查是否已有 neon-img 进程
  if pm2 list 2>/dev/null | grep -q "neon-img"; then
    log_info "检测到已有 neon-img 进程，将执行 restart（而非 start）"
    NEED_RESTART=true
  fi
}

# ---- 步骤 5：创建运行时目录 ----
step5_create_dirs() {
  log_info "STEP 5/7 // CREATING RUNTIME DIRECTORIES..."

  mkdir -p "$SERVER_DIR/uploads" "$SERVER_DIR/data"
  log_ok "uploads/ 和 data/ 目录已就绪"
}

# ---- 步骤 6：启动/重启服务 ----
step6_start_service() {
  log_info "STEP 6/7 // STARTING SERVICE..."

  if [ "$NEED_RESTART" = true ]; then
    log_info "重启 neon-img..."
    pm2 restart neon-img --update-env
    log_ok "服务已重启"
  else
    log_info "启动 neon-img..."
    pm2 start "$SERVER_DIR/app.js" --name neon-img
    log_ok "服务已启动"
  fi

  # 等待服务就绪
  sleep 2
  if pm2 list 2>/dev/null | grep -q "neon-img.*online"; then
    log_ok "neon-img 运行中 (online)"
  else
    log_warn "服务状态异常，请检查日志: pm2 logs neon-img --lines 20"
  fi
}

# ---- 步骤 7：保存 PM2 配置 + 输出提示 ----
step7_save_and_hint() {
  log_info "STEP 7/7 // SAVING PM2 CONFIG & OUTPUTTING HINTS..."

  pm2 save
  log_ok "PM2 进程列表已保存"

  # 检查 pm2 startup 是否已配置
  if ! pm2 startup 2>/dev/null | grep -q "already"; then
    log_warn "开机自启未配置，请手动执行: pm2 startup"
    echo "  $(pm2 startup 2>&1 | grep 'sudo' || true)"
  else
    log_ok "开机自启已配置"
  fi

  echo ""
  echo -e "${MAGENTA}============================================================${NC}"
  echo -e "${MAGENTA}  NEON.IMG // INSTALLATION COMPLETE${NC}"
  echo -e "${MAGENTA}============================================================${NC}"
  echo ""
  echo -e "  ${CYAN}服务地址:${NC}   http://localhost:3000"
  echo -e "  ${CYAN}PM2 状态:${NC}   pm2 status"
  echo -e "  ${CYAN}查看日志:${NC}   pm2 logs neon-img --lines 50"
  echo -e "  ${CYAN}重启服务:${NC}   pm2 restart neon-img --update-env"
  echo ""
  echo -e "  ${YELLOW}▸ 生产部署建议继续完成以下步骤:${NC}"
  echo -e "    1. 安装并配置 Nginx 反向代理 → 参考 docs/self-hosting/install-linux.md"
  echo -e "    2. 配置 HTTPS 证书 → sudo certbot --nginx -d your-domain.com"
  echo -e "    3. 设置自动备份 → 参考 docs/self-hosting/backup-restore.md"
  echo -e "    4. 检查安全配置 → 参考 docs/self-hosting/configuration.md"
  echo ""
  echo -e "  ${GREEN}🌃 Stay sharp, samurai.${NC}"
  echo ""
}

# ---- 主流程 ----
main() {
  banner

  # 确认安装目录
  echo -e "  项目目录: ${CYAN}$PROJECT_DIR${NC}"
  echo -e "  确认在此目录安装？[Y/n]"
  read -r answer
  if [ "$answer" = "n" ] || [ "$answer" = "N" ]; then
    log_info "已取消安装"
    exit 0
  fi
  echo ""

  step1_check_env
  echo ""
  step2_install_deps
  echo ""
  step3_check_env
  echo ""
  step4_check_pm2
  echo ""
  step5_create_dirs
  echo ""
  step6_start_service
  echo ""
  step7_save_and_hint
}

main "$@"
