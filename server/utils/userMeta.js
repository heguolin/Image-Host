const { getDb } = require('./db');

function userRow(u) {
  if (!u) return null;
  return { ...u, isAdmin: !!u.isAdmin };
}

const INSERT_USER = 'INSERT OR REPLACE INTO users (id, username, passwordHash, token, isAdmin, createdAt) VALUES (@id, @username, @passwordHash, @token, @isAdmin, @createdAt)';

function userParams(u) {
  return {
    '@id': u.id,
    '@username': u.username,
    '@passwordHash': u.passwordHash,
    '@token': u.token,
    '@isAdmin': u.isAdmin ? 1 : 0,
    '@createdAt': u.createdAt
  };
}

function readUsers() {
  return getDb().prepare('SELECT * FROM users').all().map(userRow);
}

function writeUsers(list) {
  var db = getDb();
  var insertOne = db.prepare(INSERT_USER);
  var replaceAll = db.transaction(function (items) {
    db.prepare('DELETE FROM users').run();
    for (var i = 0; i < items.length; i++) {
      insertOne.run(userParams(items[i]));
    }
  });
  replaceAll(list);
}

function findUserByUsername(username) {
  var row = getDb().prepare('SELECT * FROM users WHERE LOWER(username) = LOWER(?)').get([username]);
  return userRow(row);
}

function findUserById(id) {
  var row = getDb().prepare('SELECT * FROM users WHERE id = ?').get([id]);
  return userRow(row);
}

function findUserByToken(token) {
  var row = getDb().prepare('SELECT * FROM users WHERE token = ?').get([token]);
  return userRow(row);
}

module.exports = { readUsers, writeUsers, findUserByUsername, findUserById, findUserByToken };
