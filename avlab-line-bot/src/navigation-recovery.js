'use strict';

const clean = value => String(value ?? '').trim();
const norm = value => clean(value).replace(/\s+/g, '');

function timeValue(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.getTime();
  const parsed = Date.parse(clean(value));
  return Number.isNaN(parsed) ? 0 : parsed;
}

function bindingRank(row, index) {
  const confirmed = row[5];
  return (confirmed ? 2_000_000_000_000_000 : 0)
    + timeValue(confirmed || row[2])
    + index;
}

function selectNavigationRecoveryRecipients(bindingRows, assistantRows) {
  const activeAssistants = new Set((assistantRows || []).slice(1).flatMap(row => {
    const name = norm(row[0]), number = clean(row[1]);
    return name && (/^\d{9}$/.test(number) || number === '助教') ? [name] : [];
  }));
  const identities = new Map();
  (bindingRows || []).slice(1).forEach((row, index) => {
    const userId = clean(row[0]), name = norm(row[1]), number = clean(row[3]), declaredRole = clean(row[4]);
    if (!/^U\S+/.test(userId) || !name) return;
    const role = declaredRole === 'external' && number ? 'external'
      : activeAssistants.has(name) ? 'assistant' : '';
    if (!role) return;
    const identityKey = role === 'external' ? `external:${number}` : `assistant:${name}`;
    const candidate = { userId, name, number, role, rank: bindingRank(row, index) };
    if (!identities.has(identityKey) || identities.get(identityKey).rank < candidate.rank) identities.set(identityKey, candidate);
  });
  const byUserId = new Map();
  for (const candidate of identities.values()) {
    if (!byUserId.has(candidate.userId) || byUserId.get(candidate.userId).rank < candidate.rank) byUserId.set(candidate.userId, candidate);
  }
  return [...byUserId.values()].map(({ rank, ...recipient }) => recipient);
}

module.exports = { selectNavigationRecoveryRecipients };
