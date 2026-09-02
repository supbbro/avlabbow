'use strict';

const crypto = require('crypto');
const { ids } = require('./config');

const TASK_SHEET = '1151 對內教學官／考官安排';
const ATTENDANCE_SHEET = '教學考試點名和通過情況總表';
const ASSIGNMENT_SHEET = '考生分配';
const CERT_SHEET = '工作表1';
const BIND_SHEET = '用戶綁定';
const LOG_SHEET = 'LINE對內紀錄';
const MANAGERS = ['徐嘉翔', '蔡季妍', '吳欣芸'];
const COMMAND = /^(對內近期任務$|對內任務\s|對內點名\s|對內考生\s|對內出席\s|對內結果\s)/;

const norm = value => String(value ?? '').replace(/[（(][^）)]*[）)]/g, '').replace(/\s+/g, '');
const clean = value => String(value ?? '').trim();
const shortHash = value => crypto.createHash('sha1').update(String(value)).digest('hex').slice(0, 12);
const qr = items => ({ items: items.slice(0, 13).map(item => ({
  type: 'action', action: item.uri
    ? { type: 'uri', label: item.label.slice(0, 20), uri: item.uri }
    : item.postback
      ? { type: 'postback', label: item.label.slice(0, 20), data: item.postback }
      : { type: 'message', label: item.label.slice(0, 20), text: item.text }
})) });
const nav = (items = [], parent = '中心助理', parentLabel = '回助理首頁') => [
  ...items.slice(0, 11),
  { label: `🔙 ${parentLabel}`, text: parent },
  { label: '🏠 回首頁', text: '主選單' }
];
const reply = (text, items = []) => ({ text, ...(items.length ? { quickReply: qr(items) } : {}) });
const sheet = (id, name) => SpreadsheetApp.openById(id).getSheetByName(name);

function dateKey(value) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? '' : Utilities.formatDate(date, Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

function displayDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? clean(value) : Utilities.formatDate(date, Session.getScriptTimeZone(), 'MM/dd');
}

function clock(value = process.env.INTERNAL_SESSION_START_TIME || '18:00') {
  const match = clean(value).match(/(\d{1,2}):(\d{2})/);
  return match ? { hour: Number(match[1]), minute: Number(match[2]) } : { hour: 18, minute: 0 };
}

function taskStart(task) {
  const date = task.date instanceof Date ? new Date(task.date) : new Date(task.date);
  if (Number.isNaN(date.getTime())) return null;
  const time = clock(task.start);
  date.setHours(time.hour, time.minute, 0, 0);
  return date;
}

function isExam(task) { return !clean(task.phase).includes('教學'); }
function phaseKind(value) { return clean(value).includes('教學') ? '教學' : '檢定'; }

function allTasks() {
  const target = sheet(ids.task, TASK_SHEET);
  if (!target) return [];
  return target.getDataRange().getValues().slice(1).flatMap((row, index) => {
    const date = row[0] instanceof Date ? row[0] : new Date(row[0]);
    const examiner = clean(row[4]);
    if (Number.isNaN(date.getTime()) || !examiner) return [];
    const phase = clean(row[1]);
    const level = clean(row[2]);
    const equipment = clean(row[3]);
    const id = `INT-${dateKey(date).replaceAll('-', '')}-${shortHash(`${phase}|${level}|${equipment}|${examiner}`)}`;
    return [{ id, row: index + 2, date, phase, level, equipment, examiner, location: clean(row[5]), start: process.env.INTERNAL_SESSION_START_TIME || '18:00' }];
  });
}

function findTask(id) { return allTasks().find(task => task.id === id); }

function bindingRows() {
  const books = [sheet(ids.master, BIND_SHEET), sheet(ids.internalAttendance, BIND_SHEET)].filter(Boolean);
  return books.flatMap(target => target.getDataRange().getValues().slice(1));
}

function boundName(userId) {
  const row = bindingRows().find(item => clean(item[0]) === clean(userId) && item[1]);
  return row ? clean(row[1]) : '';
}

function userIdForName(name) {
  const target = norm(name);
  const row = bindingRows().find(item => norm(item[1]) === target && item[0]);
  return row ? clean(row[0]) : '';
}

function canOperate(task, context) {
  const name = boundName(context.userId);
  if (!name) return { ok: false, message: '請先私訊機器人輸入「我是 姓名」完成綁定。' };
  if (norm(name) === norm(task.examiner) || MANAGERS.map(norm).includes(norm(name))) return { ok: true, name };
  return { ok: false, message: `這項對內任務由 ${task.examiner} 負責；目前綁定身分 ${name} 無法操作。` };
}

function activityLabel(task) { return `${displayDate(task.date)} ${clean(task.phase) || phaseKind(task.phase)}`; }
function headerMatchesTask(header, task) {
  const raw = clean(header);
  const date = displayDate(task.date).replace(/^0/, '').replace('/0', '/');
  const rawDate = raw.replace(/^0/, '').replace('/0', '/');
  return rawDate.includes(date) && raw.includes(phaseKind(task.phase));
}

function ensureActivityColumns(task) {
  const target = sheet(ids.internalAttendance, ATTENDANCE_SHEET);
  if (!target) throw new Error(`找不到「${ATTENDANCE_SHEET}」分頁`);
  const width = Math.max(2, target.getLastColumn());
  const headers = target.getRange(1, 1, 1, width).getValues()[0];
  let activity = headers.findIndex(value => headerMatchesTask(value, task)) + 1;
  if (!activity) {
    activity = width + 1;
    const additions = isExam(task) ? [activityLabel(task), '考試結果', '通過器材'] : [activityLabel(task)];
    target.getRange(1, activity, 1, additions.length).setValues([additions]);
    headers.push(...additions);
  }
  let result = 0, equipment = 0;
  if (isExam(task)) {
    for (let column = activity + 1; column <= headers.length; column++) {
      const header = clean(headers[column - 1]);
      if (/\d{1,2}\s*\/\s*\d{1,2}/.test(header)) break;
      if (!result && header.includes('考試結果')) result = column;
      if (!equipment && header.includes('通過器材')) equipment = column;
    }
    if (!result || !equipment) {
      const start = headers.length + 1;
      const additions = [];
      if (!result) { result = start + additions.length; additions.push('考試結果'); }
      if (!equipment) { equipment = start + additions.length; additions.push('通過器材'); }
      target.getRange(1, start, 1, additions.length).setValues([additions]);
    }
  }
  return { target, activity, result, equipment };
}

function certificationNames() {
  const target = sheet(ids.internalCertification, CERT_SHEET);
  if (!target) return new Set();
  return new Set(target.getDataRange().getValues().slice(2).map(row => norm(row[0])).filter(Boolean));
}

function parseAssignmentDate(value) {
  if (value instanceof Date) return dateKey(value);
  const match = clean(value).match(/(?:(\d{4})[\/-])?(\d{1,2})[\/-](\d{1,2})/);
  if (!match) return '';
  const year = Number(match[1] || 2026);
  return `${year}-${String(match[2]).padStart(2, '0')}-${String(match[3]).padStart(2, '0')}`;
}

function assignedStudents(task) {
  const target = sheet(ids.internalAttendance, ASSIGNMENT_SHEET);
  if (!target) return [];
  const rows = target.getDataRange().getValues();
  if (rows.length < 2) return [];
  const headers = rows[0].map(clean);
  const column = patterns => headers.findIndex(header => patterns.some(pattern => pattern.test(header)));
  const dateCol = column([/^日期$/]);
  const itemCol = column([/項目/, /器材/]);
  const nameCol = column([/考生姓名/, /^姓名$/]);
  const numberCol = column([/學號/]);
  const examinerCol = column([/考官/, /教學官/]);
  if (dateCol < 0 || nameCol < 0) return [];
  return rows.slice(1).filter(row => {
    if (parseAssignmentDate(row[dateCol]) !== dateKey(task.date) || !row[nameCol]) return false;
    if (itemCol >= 0 && row[itemCol] && equipmentKeys(row[itemCol]).every(key => !equipmentKeys(task.equipment).includes(key))) return false;
    if (examinerCol >= 0 && row[examinerCol] && norm(row[examinerCol]) !== norm(task.examiner)) return false;
    return true;
  }).map(row => ({ name: clean(row[nameCol]), number: numberCol >= 0 ? clean(row[numberCol]) : '' }));
}

function rosterStudents(task) {
  const columns = ensureActivityColumns(task);
  const data = columns.target.getDataRange().getValues();
  const activeNames = certificationNames();
  const exact = assignedStudents(task);
  let group = '';
  const byName = new Map();
  data.slice(1).forEach((row, index) => {
    const first = clean(row[0]);
    const heading = first.match(/^(一級|二級|見習)/);
    if (heading && !row[1]) { group = heading[1]; return; }
    const name = first;
    if (!name || !row[1] || (activeNames.size && !activeNames.has(norm(name)))) return;
    byName.set(`${norm(name)}|${norm(row[1])}`, {
      row: index + 2, name, number: clean(row[1]), level: group,
      attendance: clean(row[columns.activity - 1]) || '未點名'
    });
  });
  let students;
  if (exact.length) {
    const exactKeys = new Set(exact.map(student => `${norm(student.name)}|${norm(student.number)}`));
    students = [...byName.values()].filter(student => exactKeys.has(`${norm(student.name)}|${norm(student.number)}`) || exact.some(item => norm(item.name) === norm(student.name)));
  } else {
    students = [...byName.values()].filter(student => student.level === task.level);
  }
  return students.filter(student => norm(student.name) !== norm(task.examiner)).map(student => ({
    ...student, id: `STU-${shortHash(`${student.name}|${student.number}`)}`
  }));
}

function findStudent(task, id) { return rosterStudents(task).find(student => student.id === id); }

function equipmentKeys(value) {
  const raw = clean(value);
  const keys = [];
  if (/CX\s*350|棚內機/i.test(raw)) keys.push('cx350');
  if (/導播台/.test(raw)) keys.push('導播台');
  if (/錄放/.test(raw)) keys.push('錄放影機');
  if (/200\s*w.*par|par.*200\s*w/i.test(raw)) keys.push('par200w');
  if (!keys.length) keys.push(raw.toLowerCase().replace(/課程|考試|器材/g, '').replace(/[^a-z0-9\u3400-\u9fff]/g, ''));
  return [...new Set(keys.filter(Boolean))];
}

function headerEquipmentKey(value) { return equipmentKeys(value)[0] || ''; }

function appendPassedEquipment(current, equipment) {
  const values = clean(current).split(/[,，、/／]+/).map(clean).filter(Boolean);
  if (!values.some(value => equipmentKeys(value).some(key => equipmentKeys(equipment).includes(key)))) values.push(equipment);
  return values.join('、');
}

function updateCertification(student, equipment) {
  const target = sheet(ids.internalCertification, CERT_SHEET);
  if (!target) return [];
  const data = target.getDataRange().getValues();
  const row = data.findIndex((item, index) => index >= 2 && norm(item[0]) === norm(student.name) && (!student.number || !item[1] || norm(item[1]) === norm(student.number)));
  if (row < 0) return [];
  const wanted = equipmentKeys(equipment);
  const updated = [];
  data[1].forEach((header, index) => {
    if (index < 3 || !wanted.includes(headerEquipmentKey(header))) return;
    const current = clean(data[row][index]).toUpperCase();
    if (!['V', '✓', 'TRUE'].includes(current)) target.getRange(row + 1, index + 1).setValue('V');
    updated.push(clean(header));
  });
  return updated;
}

function taskText(task) {
  return `📅 ${displayDate(task.date)} ${clean(task.start)}\n${isExam(task) ? '📝 檢定' : '📚 教學'}｜${task.level}｜${task.equipment}\n📍 ${task.location || '未填'}\n👤 ${task.examiner}`;
}

function candidateMenu(task, page = 1, notice = '') {
  const students = rosterStudents(task);
  if (!students.length) return reply(`目前在「${ATTENDANCE_SHEET}」找不到 ${task.level} 的有效考生。`, nav([], '對內近期任務', '回近期任務'));
  const pageSize = 10, pages = Math.max(1, Math.ceil(students.length / pageSize));
  const current = Math.min(Math.max(1, Number(page) || 1), pages);
  const visible = students.slice((current - 1) * pageSize, current * pageSize);
  const columns = visible.map((student, index) => ({
    title: student.name.slice(0, 40),
    text: `${(current - 1) * pageSize + index + 1}/${students.length}｜${task.equipment}\n${student.number || '無學號'}｜${student.attendance}`.slice(0, 60),
    actions: isExam(task) ? [
      { type: 'postback', label: '考生已到／評分', data: `對內出席 ${task.id} ${student.id} 到` },
      { type: 'postback', label: '缺席', data: `對內出席 ${task.id} ${student.id} 缺席` }
    ] : [
      { type: 'postback', label: '到', data: `對內出席 ${task.id} ${student.id} 到` },
      { type: 'postback', label: '遲到', data: `對內出席 ${task.id} ${student.id} 遲到` },
      { type: 'postback', label: '請假／缺席', data: `對內考生 ${task.id} ${student.id}` }
    ]
  }));
  const pageActions = [];
  if (current > 1) pageActions.push({ label: '⬅️ 上一頁名單', postback: `對內點名 ${task.id} ${current - 1}` });
  if (current < pages) pageActions.push({ label: '下一頁名單 ➡️', postback: `對內點名 ${task.id} ${current + 1}` });
  const rows = visible.map((student, index) => `${(current - 1) * pageSize + index + 1}. ${student.name}｜${student.attendance}`).join('\n');
  const text = `${notice ? `${notice}\n\n` : ''}【${task.equipment} 對內點名｜${current}/${pages}】\n${rows}`;
  return {
    text,
    fallbackQuickReply: qr(nav(visible.slice(0, 9).map(student => ({ label: `查看 ${student.name}`, postback: `對內考生 ${task.id} ${student.id}` })), '對內近期任務', '回近期任務')),
    lineMessage: {
      type: 'template', altText: `${task.equipment} 對內考生卡片（${students.length} 人）`,
      template: { type: 'carousel', columns },
      quickReply: qr(nav(pageActions, '對內近期任務', '回近期任務'))
    }
  };
}

function resultPrompt(task, student, notice = '') {
  return reply(`${notice ? `${notice}\n\n` : ''}【${task.equipment} 檢定】\n考生：${student.name}（${student.number}）\n出席：${student.attendance}\n\n請登記本次檢定結果。`, nav([
    { label: '✅ 通過', postback: `對內結果 ${task.id} ${student.id} 通過` },
    { label: '❌ 未通過', postback: `對內結果 ${task.id} ${student.id} 未通過` },
    { label: '回考生名單', postback: `對內點名 ${task.id} 1` }
  ], '對內近期任務', '回近期任務'));
}

function showStudent(task, student) {
  if (isExam(task) && ['到', '遲到'].includes(student.attendance)) return resultPrompt(task, student);
  const actions = isExam(task) ? [
    { label: '✅ 考生已到', postback: `對內出席 ${task.id} ${student.id} 到` },
    { label: '❌ 缺席', postback: `對內出席 ${task.id} ${student.id} 缺席` }
  ] : [
    { label: '✅ 到', postback: `對內出席 ${task.id} ${student.id} 到` },
    { label: '⏰ 遲到', postback: `對內出席 ${task.id} ${student.id} 遲到` },
    { label: '📝 請假', postback: `對內出席 ${task.id} ${student.id} 請假` },
    { label: '❌ 缺席', postback: `對內出席 ${task.id} ${student.id} 缺席` }
  ];
  return reply(`【${task.equipment}】\n考生：${student.name}（${student.number}）\n目前出席：${student.attendance}`, nav([
    ...actions, { label: '回考生名單', postback: `對內點名 ${task.id} 1` }
  ], '對內近期任務', '回近期任務'));
}

function recordAttendance(task, student, status, context) {
  const permission = canOperate(task, context);
  if (!permission.ok) return reply(permission.message, nav());
  const columns = ensureActivityColumns(task);
  columns.target.getRange(student.row, columns.activity).setValue(status);
  student.attendance = status;
  if (isExam(task) && status === '到') return resultPrompt(task, student, `✅ 已登記 ${student.name}：到`);
  return candidateMenu(task, 1, `✅ 已登記 ${student.name}：${status}`);
}

function recordResult(task, student, result, context) {
  const permission = canOperate(task, context);
  if (!permission.ok) return reply(permission.message, nav());
  const columns = ensureActivityColumns(task);
  if (!['到', '遲到'].includes(clean(columns.target.getRange(student.row, columns.activity).getValue()))) {
    return reply('請先登記這位考生已到，再填寫檢定結果。', nav([{ label: '查看考生', postback: `對內考生 ${task.id} ${student.id}` }], '對內近期任務', '回近期任務'));
  }
  columns.target.getRange(student.row, columns.result).setValue(result);
  let updated = [];
  if (result === '通過') {
    const current = columns.target.getRange(student.row, columns.equipment).getValue();
    columns.target.getRange(student.row, columns.equipment).setValue(appendPassedEquipment(current, task.equipment));
    updated = updateCertification(student, task.equipment);
  }
  const detail = result === '通過'
    ? `✅ 已登記 ${student.name}：通過\n認證表已開通：${updated.join('、') || '找不到相符器材欄，請檢查器材名稱'}`
    : `❌ 已登記 ${student.name}：未通過\n既有認證沒有被刪除。`;
  return candidateMenu(task, 1, detail);
}

function listRecent(context) {
  const name = boundName(context.userId);
  if (!name) return reply('請先輸入「我是 姓名」完成綁定。', nav());
  const now = new Date();
  const end = new Date(now.getTime() + 14 * 86400000);
  const tasks = allTasks().filter(task => norm(task.examiner) === norm(name) && taskStart(task) >= now && taskStart(task) <= end).sort((a, b) => taskStart(a) - taskStart(b));
  if (!tasks.length) return reply('未來 14 天沒有你的對內教學／檢定任務。', nav());
  return reply(`【我的近期對內任務】\n\n${tasks.map(task => taskText(task)).join('\n\n')}`, nav(tasks.slice(0, 9).map(task => ({ label: `點名 ${task.equipment}`, postback: `對內點名 ${task.id} 1` }))));
}

function handleCommand(text, context) {
  const command = clean(text);
  let match;
  if (command === '對內近期任務') return listRecent(context);
  if ((match = command.match(/^對內任務\s+(\S+)$/))) {
    const task = findTask(match[1]);
    return task ? reply(taskText(task), nav([{ label: '開始點名', postback: `對內點名 ${task.id} 1` }], '對內近期任務', '回近期任務')) : reply('找不到這項對內任務。', nav());
  }
  if ((match = command.match(/^對內點名\s+(\S+)(?:\s+(\d+))?$/))) {
    const task = findTask(match[1]);
    if (!task) return reply('找不到這項對內任務。', nav());
    const permission = canOperate(task, context);
    return permission.ok ? candidateMenu(task, match[2] || 1) : reply(permission.message, nav());
  }
  if ((match = command.match(/^對內考生\s+(\S+)\s+(\S+)$/))) {
    const task = findTask(match[1]);
    const student = task && findStudent(task, match[2]);
    if (!task || !student) return reply('找不到指定考生，請重新開啟點名名單。', nav());
    const permission = canOperate(task, context);
    return permission.ok ? showStudent(task, student) : reply(permission.message, nav());
  }
  if ((match = command.match(/^對內出席\s+(\S+)\s+(\S+)\s+(到|遲到|請假|缺席)$/))) {
    const task = findTask(match[1]);
    const student = task && findStudent(task, match[2]);
    return task && student ? recordAttendance(task, student, match[3], context) : reply('找不到指定考生，請重新開啟點名名單。', nav());
  }
  if ((match = command.match(/^對內結果\s+(\S+)\s+(\S+)\s+(通過|未通過)$/))) {
    const task = findTask(match[1]);
    const student = task && findStudent(task, match[2]);
    return task && student ? recordResult(task, student, match[3], context) : reply('找不到指定考生，請重新開啟點名名單。', nav());
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

function sentKeys(target) {
  return new Set(target.getDataRange().getValues().slice(1).filter(row => row[0] === '一小時提醒').map(row => clean(row[1])));
}

function queuePush(userId, message) {
  const lineMessage = { type: 'text', text: message.text.slice(0, 5000) };
  if (message.quickReply?.items?.length) lineMessage.quickReply = message.quickReply;
  UrlFetchApp.fetch('https://api.line.me/v2/bot/message/push', {
    method: 'post', headers: { Authorization: `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}` },
    contentType: 'application/json', payload: JSON.stringify({ to: userId, messages: [lineMessage] }), muteHttpExceptions: true
  });
}

function sendInternalReminders(now = new Date()) {
  const log = ensureLogSheet();
  const sent = sentKeys(log);
  let count = 0;
  for (const task of allTasks()) {
    const start = taskStart(task);
    if (!start || start <= now || now < new Date(start.getTime() - 60 * 60000)) continue;
    const key = `ONE-HOUR:${task.id}:${clean(task.start)}`;
    if (sent.has(key)) continue;
    const userId = userIdForName(task.examiner);
    if (!userId) continue;
    const students = rosterStudents(task);
    const roster = students.length ? students.map(student => student.name).join('、') : '目前尚無考生';
    queuePush(userId, reply(`⏰ 你的對內${isExam(task) ? '檢定' : '教學'}任務將於 1 小時內開始\n\n${taskText(task)}\n\n考生（${students.length} 人）：${roster}`, [
      { label: '開始點名', postback: `對內點名 ${task.id} 1` },
      { label: '查看近期任務', text: '對內近期任務' }
    ]));
    log.appendRow(['一小時提醒', key, task.id, task.examiner, userId, now, `${students.length} 位考生`]);
    sent.add(key); count++;
  }
  return count;
}

function isInternalCommand(text) { return COMMAND.test(clean(text)); }
function requiresFreshData() { return true; }

module.exports = {
  handleCommand, isInternalCommand, requiresFreshData, sendInternalReminders,
  _test: { allTasks, taskStart, rosterStudents, equipmentKeys, appendPassedEquipment, updateCertification, ensureActivityColumns }
};
