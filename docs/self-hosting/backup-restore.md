# NEON.IMG // BACKUP & RESTORE

> 数据备份策略与灾难恢复指南

---

## 需要备份的内容

| 路径 | 内容 | 重要性 |
|------|------|--------|
| `/opt/neon-img/.env` | 环境变量配置 | 低（可重新填写） |
| `/opt/neon-img/server/data/` | JSON 元数据（users.json / images.json / trash.json / moderation_log.json） | **高** |
| `/opt/neon-img/server/uploads/` | 图片文件（原图 + 缩略图） | **高** |

> `server/node_modules/` 不需要备份，`npm install` 可恢复。

---

## 手动备份

```bash
# 建议先暂停服务（可选，非必须）
pm2 stop neon-img

# 打包备份
BACKUP_FILE="neon-img-backup-$(date +%Y%m%d-%H%M%S).tar.gz"
sudo tar -czf "$BACKUP_FILE" \
  -C /opt/neon-img \
  .env \
  server/data/ \
  server/uploads/

echo "Backup created: $BACKUP_FILE"
ls -lh "$BACKUP_FILE"

# 恢复服务
pm2 start neon-img
```

---

## 自动备份（Cron）

编辑 crontab：

```bash
sudo crontab -e
```

添加以下行（每天凌晨 3 点执行）：

```cron
0 3 * * * tar -czf /backup/neon-img-$(date +\%Y\%m\%d).tar.gz -C /opt/neon-img .env server/data/ server/uploads/ && find /backup/ -name "neon-img-*.tar.gz" -mtime +30 -delete
```

> 每周保留，超过 30 天自动清理。备份目录需预先创建：`sudo mkdir -p /backup`

---

## 恢复步骤

```bash
# 1. 停止服务
pm2 stop neon-img

# 2. 解压备份到临时目录
mkdir /tmp/neon-restore
tar -xzf neon-img-backup-20260527-030000.tar.gz -C /tmp/neon-restore

# 3. 覆盖恢复
sudo cp -r /tmp/neon-restore/server/data/* /opt/neon-img/server/data/
sudo cp -r /tmp/neon-restore/server/uploads/* /opt/neon-img/server/uploads/
# .env 按需恢复，建议对比后再覆盖

# 4. 修正权限
sudo chown -R $USER:$USER /opt/neon-img/server/data/
sudo chown -R $USER:$USER /opt/neon-img/server/uploads/

# 5. 启动服务
pm2 start neon-img

# 6. 验证
curl http://localhost:3000/api/list -H "Authorization: Bearer <your-jwt>"
```

---

## 注意事项

- **恢复前建议备份当前状态**，先 `mv` 再 `cp`，避免覆盖导致二次损失
- JSON 文件和图片文件需保持对应关系，仅恢复其一会导致"幽灵条目"或"孤儿文件"
- 跨版本恢复时，JSON 数据结构可能不兼容，优先在同版本间恢复
- 备份文件建议异地存储（rsync 到另一台机器、云存储等），防止磁盘故障
- 定期测试恢复流程，避免"备份成功但恢复失败"

---

## 使用 rsync 异地备份

```bash
# 同步到远程服务器
rsync -avz --delete \
  /opt/neon-img/server/data/ \
  /opt/neon-img/server/uploads/ \
  user@backup-server:/backup/neon-img/
```

---

> 🌃 Stay sharp, samurai.
