const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'data', 'randomchat.db'));

db.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    ip_hash TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    last_active INTEGER NOT NULL,
    is_banned INTEGER DEFAULT 0,
    ban_until INTEGER,
    room_id TEXT
  );

  CREATE TABLE IF NOT EXISTS reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    reporter_session TEXT NOT NULL,
    reported_session TEXT NOT NULL,
    reason TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS bans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT,
    ip_hash TEXT NOT NULL,
    reason TEXT,
    banned_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    is_active INTEGER DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS message_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    room_id TEXT NOT NULL,
    sender_session TEXT NOT NULL,
    content TEXT NOT NULL,
    flagged INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL
  );
`);

module.exports = db;
