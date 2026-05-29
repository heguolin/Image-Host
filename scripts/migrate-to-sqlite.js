const initSqlJs = require('../server/node_modules/sql.js');
const fs = require('fs');
const path = require('path');

const { initDb } = require('../server/utils/db');
const { writeMeta, writeTrash } = require('../server/utils/meta');
const { writeUsers } = require('../server/utils/userMeta');

async function migrate() {
  const SQL = await initSqlJs();
  initDb(SQL);

  const dataDir = path.join(__dirname, '..', 'server', 'data');

  // 备份 JSON 文件
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDir = path.join(dataDir, 'backup_' + ts);
  fs.mkdirSync(backupDir, { recursive: true });

  ['images.json', 'trash.json', 'users.json'].forEach(function (f) {
    var src = path.join(dataDir, f);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, path.join(backupDir, f));
      console.log('[ BACKUP ] ' + f + ' → ' + backupDir);
    }
  });

  // 读取 JSON
  var images = [], trash = [], users = [];
  try { images = JSON.parse(fs.readFileSync(path.join(dataDir, 'images.json'), 'utf-8')); } catch (e) {}
  try { trash = JSON.parse(fs.readFileSync(path.join(dataDir, 'trash.json'), 'utf-8')); } catch (e) {}
  try { users = JSON.parse(fs.readFileSync(path.join(dataDir, 'users.json'), 'utf-8')); } catch (e) {}

  // 迁移
  writeMeta(images);
  console.log('[ MIGRATE ] images: ' + images.length + ' 条');

  writeTrash(trash);
  console.log('[ MIGRATE ] trash: ' + trash.length + ' 条');

  writeUsers(users);
  console.log('[ MIGRATE ] users: ' + users.length + ' 条');

  console.log('\n// MIGRATION COMPLETE //');
  console.log('// neon.db 已生成，JSON 文件未删除');
  console.log('// 确认无误后可手动备份 JSON 后删除');
}

migrate().catch(function (e) {
  console.error('[ ERROR ] 迁移失败:', e);
  process.exit(1);
});
