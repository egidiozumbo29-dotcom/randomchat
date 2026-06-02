const express = require('express');
const db = require('../db');
const router = express.Router();

const ADMIN_PASSWORD = 'admin123'; // hardcoded per MVP

function authMiddleware(req, res, next) {
  const auth = req.headers['x-admin-password'] || req.query.password;
  if (auth !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

// Lista utenti attivi (ultimi 10 minuti)
router.get('/users', authMiddleware, (req, res) => {
  const cutoff = Date.now() - 10 * 60 * 1000;
  const rows = db.prepare('SELECT id, ip_hash, created_at, last_active, room_id FROM sessions WHERE last_active > ? ORDER BY last_active DESC').all(cutoff);
  res.json(rows);
});

// Lista ban attivi
router.get('/bans', authMiddleware, (req, res) => {
  const rows = db.prepare('SELECT * FROM bans WHERE is_active = 1 ORDER BY banned_at DESC').all();
  res.json(rows);
});

// Lista report
router.get('/reports', authMiddleware, (req, res) => {
  const rows = db.prepare('SELECT * FROM reports ORDER BY created_at DESC LIMIT 200').all();
  res.json(rows);
});

// Ban manuale
router.post('/ban', authMiddleware, (req, res) => {
  const { session_id, ip_hash, minutes = 60, reason = 'manual' } = req.body;
  const now = Date.now();
  const expires = now + minutes * 60 * 1000;
  db.prepare('INSERT INTO bans (session_id, ip_hash, reason, banned_at, expires_at) VALUES (?, ?, ?, ?, ?)')
    .run(session_id || null, ip_hash, reason, now, expires);
  if (session_id) {
    db.prepare('UPDATE sessions SET is_banned = 1, ban_until = ? WHERE id = ?').run(expires, session_id);
  }
  res.json({ success: true });
});

// Unban
router.post('/unban', authMiddleware, (req, res) => {
  const { ban_id } = req.body;
  db.prepare('UPDATE bans SET is_active = 0 WHERE id = ?').run(ban_id);
  res.json({ success: true });
});

module.exports = router;
