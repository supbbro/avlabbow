'use strict';

const crypto = require('crypto');
const { ids } = require('./config');
const { parseRegistrationRows } = require('./external-registration-parser');
const { namesMatch, norm } = require('./external-identity');

const LOG_SHEET = '報名成功通知紀錄';
const HEADERS = ['通知鍵', '學號', '姓名', 'LINE User ID', '通知時間', '狀態'];
const keyFor = (number, userId) => `REG:${process.env.ACADEMIC_TERM || '1151'}:${norm(number)}:${userId}`;

function retryUuid(key) {
  const bytes = crypto.createHash('sha256').update(key).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function confirmationCandidates(runtime) {
  const response = runtime.openById(ids.externalRegistration).getSheetByName('表單回覆 1');
  const bindings = runtime.openById(ids.master).getSheetByName('用戶綁定');
  if (!response || !bindings) return [];
  const registrations = new Map(parseRegistrationRows(response.getDataRange().getValues())
    .map(registration => [norm(registration.number), registration]));
  return bindings.getDataRange().getValues().slice(1).flatMap(row => {
    const [userId, boundName, , number, role] = row;
    const registration = registrations.get(norm(number));
    if (!userId || role !== 'external' || !registration || !namesMatch(boundName, registration.name)) return [];
    return [{ key: keyFor(number, userId), userId: String(userId), registration }];
  });
}

function confirmationText(registration) {
  return `✅ 對外教學報名成功！\n\n${registration.name}（${registration.number}）的報名資料已收到。\n報名項目：${registration.equipment.join('、')}\n\n後續教學與考試資訊會再由機器人通知。`;
}

async function sendOne(candidate, fetchImpl) {
  const response = await fetchImpl('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
      'X-Line-Retry-Key': retryUuid(candidate.key)
    },
    body: JSON.stringify({ to: candidate.userId, messages: [{ type: 'text', text: confirmationText(candidate.registration) }] }),
    signal: AbortSignal.timeout(8000)
  });
  if (!response.ok && response.status !== 409) throw new Error(`LINE registration confirmation HTTP ${response.status}`);
}

async function sendRegistrationConfirmations(runtime, { fetchImpl = fetch, limit = 20 } = {}) {
  const book = runtime.openById(ids.externalResults);
  let log = book.getSheetByName(LOG_SHEET);
  const candidates = confirmationCandidates(runtime);
  if (!log || !log.getLastRow()) {
    // Existing registrations predate this feature. Baseline only those already
    // bound now; a student who binds later still receives their confirmation.
    if (!log) log = book.insertSheet(LOG_SHEET);
    log.appendRow(HEADERS);
    for (const candidate of candidates) log.appendRow([candidate.key, candidate.registration.number, candidate.registration.name, candidate.userId, new Date(), '上線前既有報名']);
    return { initialized: true, baseline: candidates.length, sent: 0, failed: 0 };
  }
  const existingRows = log.getDataRange().getValues();
  if (HEADERS.some((header, index) => existingRows[0][index] !== header)) throw new Error(`Invalid ${LOG_SHEET} header; refusing to send duplicate confirmations`);
  const logged = new Set(existingRows.slice(1).map(row => String(row[0] || '')));
  const pending = candidates.filter(candidate => !logged.has(candidate.key)).slice(0, limit);
  let sent = 0, failed = 0;
  for (let start = 0; start < pending.length; start += 10) {
    const batch = pending.slice(start, start + 10);
    const results = await Promise.allSettled(batch.map(candidate => sendOne(candidate, fetchImpl)));
    results.forEach((result, index) => {
      const candidate = batch[index];
      if (result.status === 'fulfilled') {
        log.appendRow([candidate.key, candidate.registration.number, candidate.registration.name, candidate.userId, new Date(), '已接受']);
        sent++;
      } else {
        console.error('Registration confirmation failed:', result.reason);
        failed++;
      }
    });
  }
  return { initialized: false, sent, failed };
}

module.exports = { sendRegistrationConfirmations, confirmationCandidates, confirmationText, retryUuid };
