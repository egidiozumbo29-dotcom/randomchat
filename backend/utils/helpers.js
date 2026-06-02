const crypto = require('crypto');

function hashIP(ip) {
  return crypto.createHash('sha256').update(ip).digest('hex').substring(0, 16);
}

function generateSessionId() {
  return crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex');
}

const OFFENSIVE_WORDS = [
  'merda', 'cazzo', 'fanculo', 'puttana', 'stronzo', 'bastardo', 'negro', 'ebreo', 'omosessuale',
  'nigger', 'fuck', 'shit', 'bitch', 'asshole', 'cunt', 'dick', 'fag', 'retard',
  'kill yourself', 'kys', 'die', 'suicide'
];

function containsBadWords(text) {
  const lower = text.toLowerCase();
  return OFFENSIVE_WORDS.some(word => lower.includes(word));
}

function isSuspicious(text) {
  const urlPattern = /(https?:\/\/|www\.)[^\s]+/i;
  const excessiveCaps = /[A-Z]{5,}/;
  return urlPattern.test(text) || excessiveCaps.test(text);
}

module.exports = { hashIP, generateSessionId, containsBadWords, isSuspicious };
