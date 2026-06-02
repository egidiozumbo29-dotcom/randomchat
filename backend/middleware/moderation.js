const db = require('../db');
const { containsBadWords, isSuspicious } = require('../utils/helpers');

const rateLimits = new Map(); // sessionId -> { count, resetTime }
const suspiciousCounts = new Map(); // sessionId -> count

const RATE_LIMIT_WINDOW = 10000; // 10 secondi
const RATE_LIMIT_MAX = 8; // max messaggi per finestra
const SUSPICIOUS_THRESHOLD = 5; // dopo 5 comportamenti sospetti -> timeout
const REPORTS_THRESHOLD = 3; // report per auto-ban
const AUTO_BAN_MINUTES = 30;

function checkRateLimit(sessionId) {
  const now = Date.now();
  let record = rateLimits.get(sessionId);
  if (!record || now > record.resetTime) {
    record = { count: 1, resetTime: now + RATE_LIMIT_WINDOW };
    rateLimits.set(sessionId, record);
    return { allowed: true };
  }
  if (record.count >= RATE_LIMIT_MAX) {
    return { allowed: false, reason: 'rate_limit' };
  }
  record.count++;
  return { allowed: true };
}

function moderateMessage(sessionId, text) {
  // Rate limit
  const rate = checkRateLimit(sessionId);
  if (!rate.allowed) {
    return { allowed: false, reason: 'rate_limit', action: 'timeout' };
  }

  // Blacklist parole offensive
  if (containsBadWords(text)) {
    return { allowed: false, reason: 'blacklist', action: 'block' };
  }

  // Comportamento sospetto (link, caps)
  if (isSuspicious(text)) {
    let count = (suspiciousCounts.get(sessionId) || 0) + 1;
    suspiciousCounts.set(sessionId, count);
    if (count >= SUSPICIOUS_THRESHOLD) {
      return { allowed: false, reason: 'suspicious', action: 'timeout' };
    }
    return { allowed: true, warning: 'warning_suspicious' };
  }

  return { allowed: true };
}

function checkAutoBan(sessionId, ipHash) {
  const count = db.prepare('SELECT COUNT(*) as c FROM reports WHERE reported_session = ?').get(sessionId).c;
  if (count >= REPORTS_THRESHOLD) {
    const now = Date.now();
    const expires = now + AUTO_BAN_MINUTES * 60 * 1000;
    db.prepare('INSERT INTO bans (session_id, ip_hash, reason, banned_at, expires_at) VALUES (?, ?, ?, ?, ?)')
      .run(sessionId, ipHash, 'auto_ban_reports', now, expires);
    db.prepare('UPDATE sessions SET is_banned = 1, ban_until = ? WHERE id = ?').run(expires, sessionId);
    return true;
  }
  return false;
}

function isBanned(sessionId, ipHash) {
  const row = db.prepare(
    'SELECT * FROM bans WHERE (session_id = ? OR ip_hash = ?) AND is_active = 1 AND expires_at > ?'
  ).get(sessionId, ipHash, Date.now());
  if (row) return { banned: true, until: row.expires_at };

  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId);
  if (session && session.is_banned && session.ban_until > Date.now()) {
    return { banned: true, until: session.ban_until };
  }
  return { banned: false };
}

function cleanOldBans() {
  const now = Date.now();
  db.prepare('UPDATE bans SET is_active = 0 WHERE expires_at <= ?').run(now);
  db.prepare('UPDATE sessions SET is_banned = 0, ban_until = NULL WHERE ban_until <= ?').run(now);
}

module.exports = { moderateMessage, checkAutoBan, isBanned, cleanOldBans };
