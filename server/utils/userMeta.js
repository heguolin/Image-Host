const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '../data/users.json');

function readUsers() {
  if (!fs.existsSync(FILE)) return [];
  try {
    return JSON.parse(fs.readFileSync(FILE, 'utf-8'));
  } catch {
    return [];
  }
}

function writeUsers(list) {
  fs.writeFileSync(FILE, JSON.stringify(list, null, 2));
}

function findUserByUsername(username) {
  const lower = username.toLowerCase();
  return readUsers().find(u => u.username.toLowerCase() === lower);
}

function findUserById(id) {
  return readUsers().find(u => u.id === id);
}

function findUserByToken(token) {
  return readUsers().find(u => u.token === token);
}

module.exports = { readUsers, writeUsers, findUserByUsername, findUserById, findUserByToken };
