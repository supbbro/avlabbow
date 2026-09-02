'use strict';

const crypto = require('crypto');
const { ids } = require('./config');

const TASK_SHEET = '1151 對內教學官／考官安排';
const BIND_SHEET = '用戶綁定';
const LOG_SHEET = 'LINE對內紀錄';
const ATTENDANCE_SHEET = '教學考試點名和通過情況總表';
const CERT_SHEET = '工作表1';
const ATTENDANCE_GID = '653206596';
const COMMAND = /^(點名$|對內近期任務$|對內任務\s)/;

const clean = value => String(value ?? '').trim();
const norm = value => clean(value).replace(/[（(][^）)]*[）)]/g, '').replace(/\s+/g, '');
const shortHash = value => crypto.createHash('sha1').update(String(value)).digest('hex').slice(0, 12);
const sheet = (id, name) => SpreadsheetApp.openById(id).getSheetByName(name);
const qr = items => ({ items: items.slice(0, 13).map(item => ({
  type: 'action', action: item.uri
    ? { type: 'uri', label: item.label.slice(0, 20), uri: item.uri }
    : item.postback
      ? { type: 'postback', label: item.label.slice(0, 20), data: item.postback }
      : { type: 'message', label: item.label.slice(0, 20), text: item.text }
})) });
const reply = (text, items = []) => ({ text, ...(items.length ? { quickReply: qr(items) } : {}) });

function attendanceUrl() {
  return `https://docs.google.com/spreadsheets/d/${ids.internalAttendance}/edit#gid=${ATTENDANCE_GID}`;
}

function dateKey(value) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? '' : Utilities.formatDate(date, Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

function displayDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? clean(value) : Utilities.formatDate(date, Session.getScriptTimeZone(), 'MM/dd');
}

function allTasks() {
  const target = sheet(ids.task, TASK_SHEET);
  if (!target) return [];
  return target.getDataRange().getValues().slice(1).flatMap(row => {
    const date = row[0] instanceof Date ? row[0] : new Date(row[0]);
    const examiner = clean(row[4]);
    if (Number.isNaN(date.getTime()) || !examiner) return [];
    const phase = clean(row[1]), level = clean(row[2]), equipment = clean(row[3]);
    return [{
      id: `INT-${dateKey(date).replaceAll('-', '')}-${shortHash(`${phase}|${level}|${equipment}|${examiner}`)}`,
      date, phase, level, equipment, examiner, location: clean(row[5])
    }];
  });
}

function findTask(id) { return allTasks().find(task => task.id === id); }

function bindingRows() {
  return [sheet(ids.master, BIND_SHEET), sheet(ids.internalAttendance, BIND_SHEET)]
    .filter(Boolean).flatMap(target => target.getDataRange().getValues().slice(1));
}

function boundName(userId) {
  const row = bindingRows().find(item => clean(item[0]) === clean(userId) && item[1]);
  return row ? clean(row[1]) : '';
}

function userIdForName(name) {
  const row = bindingRows().find(item => item[0] && norm(item[1]) === norm(name));
  return row ? clean(row[0]) : '';
}

function taskText(task) {
  return `📅 ${displayDate(task.date)}\n${clean(task.phase).includes('教學') ? '📚 教學' : '📝 檢定'}｜${task.level}｜${task.equipment}\n📍 ${task.location || '未填'}\n👤 ${task.examiner}`;
}

function equipmentKey(value) {
  const key = clean(value).replace(/結果$/, '').toLowerCase().replace(/[^a-z0-9\u3400-\u9fff]/g, '');
  if (/par.*200|200.*par/.test(key)) return 'par200w';
  return key;
}

function syncInternalCertifications() {
  const attendance = sheet(ids.internalAttendance, ATTENDANCE_SHEET);
  const certification = sheet(ids.internalCertification, CERT_SHEET);
  if (!attendance || !certification) return 0;
  const attendanceData = attendance.getDataRange().getValues();
  const certificationData = certification.getDataRange().getValues();
  if (attendanceData.length < 2 || certificationData.length < 3) return 0;
  const resultColumns = attendanceData[0].map((header, index) => ({ header: clean(header), index }))
    .filter(column => column.header !== '考試結果' && column.header !== '加開結果' && /結果$/.test(column.header));
  const certificationColumns = new Map(certificationData[1].map((header, index) => [equipmentKey(header), index]).filter(([key]) => key));
  const certificationRows = new Map();
  certificationData.slice(2).forEach((row, index) => {
    if (row[0] && row[1]) certificationRows.set(`${norm(row[0])}|${norm(row[1])}`, index + 2);
  });
  let updated = 0;
  attendanceData.slice(1).forEach(row => {
    if (!row[0] || !row[1]) return;
    const certificationRow = certificationRows.get(`${norm(row[0])}|${norm(row[1])}`);
    if (certificationRow == null) return;
    resultColumns.forEach(column => {
      if (clean(row[column.index]) !== '通過') return;
      const certificationColumn = certificationColumns.get(equipmentKey(column.header));
      if (certificationColumn == null) return;
      const current = clean(certificationData[certificationRow][certificationColumn]).toUpperCase();
      if (['V', '✓', 'TRUE'].includes(current)) return;
      certification.getRange(certificationRow + 1, certificationColumn + 1).setValue('V');
      certificationData[certificationRow][certificationColumn] = 'V';
      updated++;
    });
  });
  return updated;
}

function sheetLinkReply(prefix = '請直接開啟試算表進行對內點名與檢定結果登記。') {
  return reply(prefix, [
    { label: '📋 開啟對內點名表', uri: attendanceUrl() },
    { label: '🔙 回助理首頁', text: '中心助理' },
    { label: '🏠 回首頁', text: '主選單' }
  ]);
}

function listRecent(context) {
  const name = boundName(context.userId);
  if (!name) return reply('請先輸入「我是 姓名」完成綁定。', [
    { label: '🔙 回助理首頁', text: '中心助理' }, { label: '🏠 回首頁', text: '主選單' }
  ]);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const end = new Date(today); end.setDate(end.getDate() + 14);
  const tasks = allTasks().filter(task => {
    const date = new Date(task.date); date.setHours(0, 0, 0, 0);
    return norm(task.examiner) === norm(name) && date >= today && date <= end;
  }).sort((a, b) => a.date - b.date);
  const body = tasks.length ? tasks.map(taskText).join('\n\n') : '未來 14 天沒有你的對內教學／檢定任務。';
  return sheetLinkReply(`【我的近期對內任務】\n\n${body}\n\n其他時間也可按下方按鈕開啟點名表。`);
}

function handleCommand(text, context) {
  const command = clean(text);
  if (command === '點名') return sheetLinkReply();
  if (command === '對內近期任務') return listRecent(context);
  const match = command.match(/^對內任務\s+(\S+)$/);
  if (match) {
    const task = findTask(match[1]);
    return task ? sheetLinkReply(`${taskText(task)}\n\n請直接開啟試算表操作。`) : sheetLinkReply('找不到這項對內任務，仍可開啟點名表確認。');
  }
  return null;
}

function ensureLogSheet() {
  let target = sheet(ids.internalAttendance, LOG_SHEET);
  if (!target) {
    target = SpreadsheetApp.openById(ids.internalAttendance).insertSheet(LOG_SHEET);
    target.appendRow(['類型', '紀錄鍵', '任務ID', '考官／教學官', 'LINE User ID', '時間', '備註']);
  }
  return target;
}

function mondayReminderDate(value) {
  const date = value instanceof Date ? new Date(value) : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
  date.setHours(9, 0, 0, 0);
  return date;
}

function eventReminderDate(value) {
  const date = value instanceof Date ? new Date(value) : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  date.setHours(18, 0, 0, 0);
  return date;
}

function reminderDue(now, due) {
  return Boolean(due && now >= due && dateKey(now) === dateKey(due));
}

function queuePush(userId, text) {
  const message = reply(text, [
    { label: '📋 開啟點名表', uri: attendanceUrl() },
    { label: '查看近期任務', text: '對內近期任務' }
  ]);
  UrlFetchApp.fetch('https://api.line.me/v2/bot/message/push', {
    method: 'post', headers: { Authorization: `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}` },
    contentType: 'application/json', payload: JSON.stringify({
      to: userId, messages: [{ type: 'text', text: message.text, quickReply: message.quickReply }]
    }), muteHttpExceptions: true
  });
}

function sendInternalReminders(now = new Date()) {
  syncInternalCertifications();
  const log = ensureLogSheet();
  const sent = new Set(log.getDataRange().getValues().slice(1).map(row => clean(row[1])).filter(Boolean));
  let count = 0;
  for (const task of allTasks()) {
    const userId = userIdForName(task.examiner);
    if (!userId) continue;
    const reminders = [
      { type: '週一提醒', due: mondayReminderDate(task.date), intro: '本週有你的對內教學／檢定任務；若有加開或名單調整，請再確認點名表。' },
      { type: '當日提醒', due: eventReminderDate(task.date), intro: '今天有你的對內教學／檢定任務，請開啟點名表進行登記。' }
    ];
    for (const reminder of reminders) {
      const key = `${reminder.type}:${task.id}:${dateKey(reminder.due)}`;
      if (sent.has(key) || !reminderDue(now, reminder.due)) continue;
      queuePush(userId, `⏰ ${reminder.intro}\n\n${taskText(task)}`);
      log.appendRow([reminder.type, key, task.id, task.examiner, userId, now, task.equipment]);
      sent.add(key); count++;
    }
  }
  return count;
}

function isInternalCommand(text) { return COMMAND.test(clean(text)); }

module.exports = {
  handleCommand, isInternalCommand, requiresFreshData: () => true, sendInternalReminders, syncInternalCertifications,
  _test: { allTasks, mondayReminderDate, eventReminderDate, reminderDue, attendanceUrl, equipmentKey }
};
