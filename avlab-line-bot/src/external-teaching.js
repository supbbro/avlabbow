'use strict';

const { ids } = require('./config');
const { parseWorkbook } = require('./external-schedule-parser');

const SHEETS = {
  tasks: '對外任務', students: '任務學生', attendance: 'LINE點名紀錄', groups: 'LINE群組設定'
};
const MANAGERS = ['徐嘉翔', '蔡季妍', '吳欣芸'];
const SOURCE_TABS = ['教學週分班表I', '教學週分班表II', '考試週分班表I', '考試週分班表II', '第一次補考週分班表', '第二次補考週分班表'];
const REMINDER_LEAD_MINUTES = 60;
const EXTERNAL_COMMAND = /^(綁定群組(?:\s|$)|解除群組$|今日任務$|對外任務$|近期任務$|查看任務\s|開始點名\s|考生名單\s|查看考生\s|查看點名結果\s|修改出席\s|到場判定\s|點名狀態\s|簡答登記\s|上機登記\s|考試登記\s|完成點名\s|同步對外排程$)/;
let activeStudentsByTask = new Map();

const qr = items => ({ items: items.slice(0, 13).map(item => ({
  type: 'action', action: item.uri
    ? { type: 'uri', label: item.label.slice(0, 20), uri: item.uri }
    : item.postback
      ? { type: 'postback', label: item.label.slice(0, 20), data: item.postback }
    : { type: 'message', label: item.label.slice(0, 20), text: item.text }
})) });
const reply = (text, items = []) => ({ text, ...(items.length ? { quickReply: qr(items) } : {}) });
const externalNav = (items = [], parentText = '對外學生', parentLabel = '回對外首頁') => [
  ...items.slice(0, 11),
  { label: `🔙 ${parentLabel}`, text: parentText },
  { label: '🏠 回首頁', text: '主選單' }
];
const norm = value => String(value ?? '').replace(/[（(][^）)]*[）)]/g, '').replace(/\s+/g, '');
const isExam = task => task.phase !== '教學';
const isTemplate = value => String(value || '').startsWith('_TEMPLATE');

function sheet(name) {
  return SpreadsheetApp.openById(ids.externalResults).getSheetByName(name);
}

function boundName(userId) {
  const bindSheet = SpreadsheetApp.openById(ids.master).getSheetByName('用戶綁定');
  if (!bindSheet || !userId) return '';
  const rows = bindSheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) if (rows[i][0] === userId) return String(rows[i][1] || '').trim();
  return '';
}

function userIdForName(name) {
  const bindSheet = SpreadsheetApp.openById(ids.master).getSheetByName('用戶綁定');
  if (!bindSheet || !name) return '';
  const rows = bindSheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) if (norm(rows[i][1]) === norm(name)) return String(rows[i][0] || '');
  return '';
}

function taskFromRow(row, rowNumber) {
  return {
    row: rowNumber, id: String(row[0] || '').trim(), term: row[1], phase: String(row[2] || '').trim(),
    date: row[3], start: row[4], end: row[5], equipment: row[6], location: row[7], examiner: row[8],
    examinerUserId: row[9], groupId: row[10], status: String(row[11] || '').trim(),
    dayBefore: row[12], twoHours: row[13], dayBeforeSentAt: row[14], twoHoursSentAt: row[15],
    sourceSheet: row[16], sourceRange: row[17]
  };
}

function allTasks() {
  const target = sheet(SHEETS.tasks);
  if (!target) return [];
  return target.getDataRange().getValues().slice(1).map((row, index) => taskFromRow(row, index + 2))
    .filter(task => task.id && !isTemplate(task.id));
}

function findTask(taskId) { return allTasks().find(task => task.id === taskId) || null; }

function studentFromRow(row, rowNumber) {
  return { row: rowNumber, taskId: String(row[0] || '').trim(), id: String(row[1] || '').trim(), name: row[2], number: row[3], order: Number(row[4] || 0), attendance: String(row[5] || '未點名'), result: String(row[6] || '未記錄'), scheduledStart: row[8] || '', scheduledEnd: row[9] || '' };
}

function studentsFor(taskId) {
  const target = sheet(SHEETS.students);
  if (!target) return [];
  const active = activeStudentsByTask.get(taskId);
  return target.getDataRange().getValues().slice(1).map((row, index) => studentFromRow(row, index + 2))
    .filter(student => student.taskId === taskId && student.id && !isTemplate(student.id) && (!active || active.has(student.id)))
    .sort((a, b) => a.order - b.order || String(a.name).localeCompare(String(b.name), 'zh-Hant'));
}

function findStudent(taskId, studentId) { return studentsFor(taskId).find(student => student.id === studentId) || null; }

function comparable(value, columnIndex = -1) {
  if (typeof value === 'boolean') return `B:${value}`;
  if (value instanceof Date) {
    const pattern = columnIndex === 3 ? 'yyyy-MM-dd' : 'yyyy-MM-dd HH:mm:ss';
    return `D:${Utilities.formatDate(value, Session.getScriptTimeZone(), pattern)}`;
  }
  const raw = String(value ?? '').trim();
  if (/^(TRUE|FALSE)$/i.test(raw)) return `B:${raw.toUpperCase() === 'TRUE'}`;
  if (raw.includes(':') && !raw.includes('/')) {
    const clock = clockParts(raw);
    if (clock) return `T:${clock.hour}:${clock.minute}`;
  }
  return raw;
}
function rowChanged(current, desired) {
  return desired.some((value, index) => comparable(current[index], index) !== comparable(value, index));
}

function reminderBelongsToSchedule(sentAt, date, startTime) {
  if (!sentAt) return false;
  const sent = sentAt instanceof Date ? new Date(sentAt) : new Date(sentAt);
  const start = parseTaskStart({ date, start: startTime });
  if (!start || Number.isNaN(sent.getTime())) return false;
  const timezone = Session.getScriptTimeZone();
  return Utilities.formatDate(sent, timezone, 'yyyy-MM-dd') === Utilities.formatDate(start, timezone, 'yyyy-MM-dd');
}

function syncFromSchedule() {
  const sourceBook = SpreadsheetApp.openById(ids.externalClassSchedule);
  const source = {};
  SOURCE_TABS.forEach(name => {
    const sourceSheet = sourceBook.getSheetByName(name);
    if (sourceSheet) source[name] = sourceSheet.getDataRange().getValues();
  });
  const parsed = parseWorkbook(source, process.env.ACADEMIC_TERM || '1151');
  const taskSheet = sheet(SHEETS.tasks), studentSheet = sheet(SHEETS.students);
  if (!taskSheet || !studentSheet) throw new Error('找不到對外任務或任務學生工作表');

  const taskRows = taskSheet.getDataRange().getValues();
  const existingTasks = new Map();
  for (let i = 1; i < taskRows.length; i++) if (taskRows[i][0] && !isTemplate(taskRows[i][0])) existingTasks.set(String(taskRows[i][0]), { row: i + 1, values: taskRows[i], task: taskFromRow(taskRows[i], i + 1) });
  const parsedIds = new Set();
  let tasksAdded = 0, tasksUpdated = 0, studentsAdded = 0, studentsUpdated = 0;

  for (const incoming of parsed) {
    parsedIds.add(incoming.id);
    const existing = existingTasks.get(incoming.id);
    const currentStatus = existing?.task.status;
    const scheduleChanged = Boolean(existing) && [
      [existing.task.date, incoming.date, 3],
      [existing.task.start, incoming.start, 4],
      [existing.task.end, incoming.end, 5]
    ].some(([current, desired, index]) => comparable(current, index) !== comparable(desired, index));
    const status = !scheduleChanged && ['點名中', '已完成'].includes(currentStatus) ? currentStatus : '已排定';
    const oneHourSentAt = !scheduleChanged && reminderBelongsToSchedule(existing?.task.twoHoursSentAt, incoming.date, incoming.start)
      ? existing.task.twoHoursSentAt : '';
    const desired = [incoming.id, incoming.term, incoming.phase, incoming.date, incoming.start, incoming.end, incoming.equipment, incoming.location,
      incoming.examiner, userIdForName(incoming.examiner) || existing?.task.examinerUserId || '', existing?.task.groupId || '', status,
      existing ? existing.task.dayBefore : true, existing ? existing.task.twoHours : true,
      existing?.task.dayBeforeSentAt || '', oneHourSentAt, incoming.sourceSheet, incoming.sourceRange];
    if (!existing) { taskSheet.appendRow(desired); tasksAdded++; }
    else if (rowChanged(existing.values, desired)) { taskSheet.getRange(existing.row, 1, 1, desired.length).setValues([desired]); tasksUpdated++; }
  }
  for (const existing of existingTasks.values()) {
    if (SOURCE_TABS.includes(String(existing.task.sourceSheet)) && !parsedIds.has(existing.task.id) && !['已完成', '已取消'].includes(existing.task.status)) {
      taskSheet.getRange(existing.row, 12).setValue('已取消'); tasksUpdated++;
    }
  }

  const studentRows = studentSheet.getDataRange().getValues();
  const studentHeaders = ['任務ID','學生ID','學生姓名','學號','點名順序','出席狀態','考試結果','更新時間','個別開始時間','個別結束時間'];
  if (!studentRows.length) studentSheet.appendRow(studentHeaders);
  else if (studentHeaders.some((header, index) => studentRows[0][index] !== header)) studentSheet.getRange(1, 1, 1, studentHeaders.length).setValues([studentHeaders]);
  const existingStudents = new Map();
  for (let i = 1; i < studentRows.length; i++) {
    const student = studentFromRow(studentRows[i], i + 1);
    if (student.taskId && student.id && !isTemplate(student.id)) existingStudents.set(`${student.taskId}|${student.id}`, { student, values: studentRows[i] });
  }
  activeStudentsByTask = new Map();
  for (const incoming of parsed) {
    const active = new Set(); activeStudentsByTask.set(incoming.id, active);
    for (const student of incoming.students) {
      active.add(student.id);
      const key = `${incoming.id}|${student.id}`, existing = existingStudents.get(key);
      if (!existing) {
        studentSheet.appendRow([incoming.id, student.id, student.name, student.number, student.order, '未點名', '未記錄', '', student.scheduledStart || incoming.start, student.scheduledEnd || incoming.end]); studentsAdded++;
      } else {
        const desiredIdentity = [incoming.id, student.id, student.name, existing.student.number || student.number, student.order];
        const identityChanged = rowChanged(existing.values.slice(0, 5), desiredIdentity);
        const desiredTimes = [student.scheduledStart || incoming.start, student.scheduledEnd || incoming.end];
        const timesChanged = rowChanged(existing.values.slice(8, 10), desiredTimes);
        if (identityChanged) studentSheet.getRange(existing.student.row, 1, 1, 5).setValues([desiredIdentity]);
        if (timesChanged) studentSheet.getRange(existing.student.row, 9, 1, 2).setValues([desiredTimes]);
        if (identityChanged || timesChanged) studentsUpdated++;
      }
    }
  }
  return { tasks: parsed.length, tasksAdded, tasksUpdated, students: [...activeStudentsByTask.values()].reduce((sum, set) => sum + set.size, 0), studentsAdded, studentsUpdated };
}

function groups() {
  const target = sheet(SHEETS.groups);
  if (!target) return [];
  return target.getDataRange().getValues().slice(1).map((row, index) => ({
    row: index + 2, id: String(row[0] || ''), name: row[1], scope: row[2], enabled: row[3],
    dayBeforeTime: String(row[4] || '20:00'), hoursBefore: Number(row[5] || 2), timezone: row[6] || 'Asia/Taipei', admin: row[7]
  })).filter(group => group.id && group.id !== 'DEFAULT');
}

function upsertGroup(context, requestedName) {
  const target = sheet(SHEETS.groups);
  if (!target) throw new Error('找不到 LINE群組設定 工作表');
  const existing = groups().find(group => group.id === context.chatId);
  const now = new Date();
  const name = requestedName || context.groupName || `對外教學群組-${context.chatId.slice(-6)}`;
  if (existing) {
    target.getRange(existing.row, 2, 1, 9).setValues([[name, '對外教學', '是', '20:00', 2, 'Asia/Taipei', boundName(context.userId), now, now]]);
  } else {
    target.appendRow([context.chatId, name, '對外教學', '是', '20:00', 2, 'Asia/Taipei', boundName(context.userId), now, now]);
  }
  return name;
}

function disableGroup(chatId) {
  const target = sheet(SHEETS.groups);
  const existing = groups().find(group => group.id === chatId);
  if (target && existing) { target.getRange(existing.row, 4).setValue('否'); target.getRange(existing.row, 10).setValue(new Date()); }
}

function groupAdmins(chatId) {
  const group = groups().find(item => item.id === chatId);
  return String(group?.admin || '').split(/[,，、]/).map(norm).filter(Boolean);
}

function canOperate(task, context) {
  const name = boundName(context.userId);
  if (!name) return { ok: false, message: '請先私訊機器人輸入「我是 姓名」完成綁定，再回群組操作點名。' };
  const allowed = !task.examiner || norm(task.examiner) === norm(name) || MANAGERS.map(norm).includes(norm(name)) || groupAdmins(context.chatId).includes(norm(name));
  return allowed ? { ok: true, name } : { ok: false, message: `此任務由 ${task.examiner} 負責；目前綁定身分 ${name} 無法操作。` };
}

function formatDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value || '');
  return Utilities.formatDate(date, Session.getScriptTimeZone(), 'MM/dd');
}

function clockParts(value) {
  if (value instanceof Date) return { hour: value.getHours(), minute: value.getMinutes() };
  const raw = String(value || '');
  const match = raw.match(/(\d{1,2}):(\d{2})/);
  if (!match) return null;
  let hour = Number(match[1]);
  if ((raw.includes('下午') || /\bPM\b/i.test(raw)) && hour < 12) hour += 12;
  if ((raw.includes('上午') || /\bAM\b/i.test(raw)) && hour === 12) hour = 0;
  return { hour, minute: Number(match[2]) };
}

function formatTime(value) {
  const clock = clockParts(value);
  return clock ? `${String(clock.hour).padStart(2, '0')}:${String(clock.minute).padStart(2, '0')}` : String(value || '');
}

function taskText(task) {
  return `📅 ${formatDate(task.date)} ${formatTime(task.start)}-${formatTime(task.end)}\n` +
    `${task.phase === '教學' ? '📚' : '📝'} ${task.phase}｜${task.equipment}\n📍 ${task.location || '未填'}\n👤 ${task.examiner || '尚未安排'}`;
}

function listTasks(context, todayOnly) {
  const personalName = context.sourceType === 'user' ? boundName(context.userId) : '';
  if (context.sourceType === 'user' && !personalName) return reply('請先輸入「我是 姓名」完成綁定，才能查看個人的近期對外任務。');
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const end = new Date(today); end.setDate(end.getDate() + (todayOnly ? 1 : 8));
  const tasks = allTasks().filter(task => {
    const date = task.date instanceof Date ? new Date(task.date) : new Date(task.date);
    if (Number.isNaN(date.getTime()) || ['已完成', '已取消'].includes(task.status)) return false;
    date.setHours(0, 0, 0, 0);
    const belongsToContext = context.sourceType === 'user'
      ? norm(task.examiner) === norm(personalName)
      : (!task.groupId || task.groupId === context.chatId);
    return date >= today && date < end && belongsToContext;
  }).sort((a, b) => new Date(a.date) - new Date(b.date));
  if (!tasks.length) return reply(todayOnly ? '今天沒有待執行的對外任務。' : '未來七天沒有待執行的對外任務。', externalNav());
  const body = tasks.map(task => `【${task.id}】\n${taskText(task)}`).join('\n\n');
  return reply(`【${context.sourceType === 'user' ? '我的' : ''}${todayOnly ? '今日' : '近期'}對外任務】\n\n${body}`,
    externalNav(tasks.map(task => ({ label: `點名 ${String(task.equipment).slice(0, 12)}`, text: `開始點名 ${task.id}` }))));
}

function certificationStatusUrl() {
  const target = sheet(SHEETS.attendance);
  const gid = target ? target.getSheetId() : 0;
  return `https://docs.google.com/spreadsheets/d/${ids.externalResults}/edit#gid=${gid}`;
}

function showTask(taskId) {
  const task = findTask(taskId);
  if (!task) return reply(`找不到任務 ${taskId}`);
  const students = studentsFor(taskId);
  const stats = { 未點名: 0, 到場: 0, 遲到: 0, 請假: 0, 缺席: 0, 取消資格: 0 };
  students.forEach(student => { stats[student.attendance] = (stats[student.attendance] || 0) + 1; });
  return reply(`【任務 ${task.id}】\n${taskText(task)}\n👥 學生 ${students.length} 人\n未點名 ${stats.未點名}｜到場 ${stats.到場}｜遲到 ${stats.遲到}｜請假 ${stats.請假}｜缺席 ${stats.缺席}${isExam(task) ? `｜取消資格 ${stats.取消資格}` : ''}`,
    externalNav([{ label: '開始／繼續點名', text: `開始點名 ${task.id}` }], '近期任務', '回近期任務'));
}

function updateTaskStatus(task, status) { sheet(SHEETS.tasks).getRange(task.row, 12).setValue(status); task.status = status; }
function updateStudent(student, attendance, result) {
  const target = sheet(SHEETS.students);
  target.getRange(student.row, 6, 1, 3).setValues([[attendance, result, new Date()]]);
  student.attendance = attendance; student.result = result;
}

function studentPosition(task, student) {
  const students = studentsFor(task.id);
  return { position: Math.max(0, students.findIndex(item => item.id === student.id)) + 1, total: students.length };
}

function studentTaskStart(task, student) {
  return parseTaskStart({ ...task, start: student.scheduledStart || task.start });
}

function automaticArrivalStatus(task, student, now = new Date()) {
  const start = studentTaskStart(task, student);
  if (!start) return '到場';
  const graceMinutes = isExam(task) ? 5 : 15;
  if (now.getTime() <= start.getTime() + graceMinutes * 60000) return '到場';
  return isExam(task) ? '取消資格' : '遲到';
}

function attendancePrompt(task, student) {
  const { position, total } = studentPosition(task, student);
  const attendanceActions = isExam(task) ? [
    { label: '✅ 考生已到', postback: `到場判定 ${task.id} ${student.id}` },
    { label: '🚫 取消資格', postback: `點名狀態 ${task.id} ${student.id} 取消資格` }
  ] : [
    { label: '✅ 學生已到', postback: `到場判定 ${task.id} ${student.id}` },
    { label: '📝 請假', postback: `點名狀態 ${task.id} ${student.id} 請假` },
    { label: '❌ 缺席', postback: `點名狀態 ${task.id} ${student.id} 缺席` }
  ];
  const rule = isExam(task) ? '個別時段開始 5 分鐘後尚未點名，將取消考試資格。' : '系統會依開始時間自動判定：15 分鐘後點名為遲到。';
  return reply(`【${task.equipment}｜第 ${position}/${total} 位】\n學生：${student.name}${student.number ? `（${student.number}）` : ''}\n個別時間：${formatTime(student.scheduledStart || task.start)}\n目前出席：${student.attendance}\n\n${rule}`, externalNav([
    ...attendanceActions,
    { label: '回考生名單', postback: `考生名單 ${task.id} 1` }
  ], `查看任務 ${task.id}`, '回任務'));
}

function candidateMenu(task, page = 1, notice = '') {
  const students = studentsFor(task.id);
  const pageSize = 9, totalPages = Math.max(1, Math.ceil(students.length / pageSize));
  const currentPage = Math.min(Math.max(1, Number(page) || 1), totalPages);
  const visible = students.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const icon = student => student.attendance === '未點名' ? '▫️' : student.attendance === '取消資格' ? '🚫' : '✅';
  const actions = visible.map(student => ({
    label: `${icon(student)} ${String(student.name).slice(0, 14)}`,
    postback: `查看考生 ${task.id} ${student.id}`
  }));
  if (currentPage > 1) actions.push({ label: '⬅️ 上一頁名單', postback: `考生名單 ${task.id} ${currentPage - 1}` });
  if (currentPage < totalPages) actions.push({ label: '下一頁名單 ➡️', postback: `考生名單 ${task.id} ${currentPage + 1}` });
  const rows = visible.map((student, index) => `${(currentPage - 1) * pageSize + index + 1}. ${student.name}｜${student.attendance}`).join('\n');
  return reply(`${notice ? `${notice}\n\n` : ''}【${task.equipment} 考生名單｜${currentPage}/${totalPages}】\n${rows}\n\n請直接點選要登記的考生。`,
    externalNav(actions, `查看任務 ${task.id}`, '回任務'));
}

function attendanceBoard(task) {
  return candidateMenu(task);
}

function resultParts(result) {
  return {
    '全部通過': ['通過', '通過'], '僅簡答通過': ['通過', '未通過'],
    '僅口頭問答通過': ['通過', '未通過'],
    '僅上機通過': ['未通過', '通過'], '未通過': ['未通過', '未通過'],
    '簡答通過': ['通過', '未記錄'], '簡答未通過': ['未通過', '未記錄'],
    '口頭問答通過': ['通過', '未記錄'], '口頭問答未通過': ['未通過', '未記錄'],
    '上機通過': ['未記錄', '通過'], '上機未通過': ['未記錄', '未通過'],
    '不適用': ['不適用', '不適用']
  }[result] || ['未記錄', '未記錄'];
}

const ATTENDANCE_HEADERS = ['紀錄ID','任務ID','日期','開始時間','階段','器材','學生ID','學生姓名','學號','出席狀態','口頭問答結果','上機結果','總結果','操作考官','考官LINE User ID','記錄時間','累計口頭問答結果','累計上機結果','保證金狀態'];

function ensureAttendanceHeaders(target, rows) {
  if (!rows.length) target.appendRow(ATTENDANCE_HEADERS);
  else if (ATTENDANCE_HEADERS.some((header, index) => rows[0][index] !== header)) {
    target.getRange(1, 1, 1, ATTENDANCE_HEADERS.length).setValues([ATTENDANCE_HEADERS]);
  }
}

function sameCertificationStudent(row, task, student) {
  if (norm(row[5]) !== norm(task.equipment)) return false;
  const rowNumber = norm(row[8]), studentNumber = norm(student.number);
  if (rowNumber && studentNumber) return rowNumber === studentNumber;
  return norm(row[7]) === norm(student.name);
}

function certificationForStudent(task, student, excludeRecordId = '') {
  const target = sheet(SHEETS.attendance);
  if (!target) return { shortAnswer: false, practical: false, refundable: false };
  const rows = target.getDataRange().getValues().slice(1);
  let shortAnswer = false, practical = false;
  rows.forEach(row => {
    if (String(row[0] || '') === excludeRecordId || !sameCertificationStudent(row, task, student)) return;
    shortAnswer = shortAnswer || row[10] === '通過' || row[16] === '通過';
    practical = practical || row[11] === '通過' || row[17] === '通過';
  });
  return { shortAnswer, practical, refundable: shortAnswer && practical };
}

function certificationText(certification, showDeposit = true) {
  const result = `累計結果：口頭問答 ${certification.shortAnswer ? '✅ 通過' : '❌ 未通過'}｜上機 ${certification.practical ? '✅ 通過' : '❌ 未通過'}`;
  if (!showDeposit) return result;
  return `${result}\n保證金：${certification.refundable ? '✅ 可退保證金' : '❌ 不可退保證金'}`;
}

function examProgress(task, student) {
  const previous = certificationForStudent(task, student, `${task.id}:${student.id}`);
  const [sessionShort, sessionPractical] = resultParts(student.result);
  const shortRecorded = previous.shortAnswer || ['通過', '未通過'].includes(sessionShort);
  const practicalRecorded = previous.practical || ['通過', '未通過'].includes(sessionPractical);
  return {
    step: !shortRecorded ? 'short' : !practicalRecorded ? 'practical' : 'done',
    previous, sessionShort, sessionPractical, shortRecorded, practicalRecorded,
    shortPassed: previous.shortAnswer || sessionShort === '通過',
    practicalPassed: previous.practical || sessionPractical === '通過'
  };
}

function mergeExamPart(currentResult, part, passed) {
  let [shortAnswer, practical] = resultParts(currentResult);
  if (!['通過', '未通過'].includes(shortAnswer)) shortAnswer = '未記錄';
  if (!['通過', '未通過'].includes(practical)) practical = '未記錄';
  if (part === 'short') shortAnswer = passed ? '通過' : '未通過';
  else practical = passed ? '通過' : '未通過';
  if (shortAnswer === '通過' && practical === '通過') return '全部通過';
  if (shortAnswer === '通過' && practical === '未通過') return '僅口頭問答通過';
  if (shortAnswer === '未通過' && practical === '通過') return '僅上機通過';
  if (shortAnswer === '未通過' && practical === '未通過') return '未通過';
  if (shortAnswer !== '未記錄') return shortAnswer === '通過' ? '口頭問答通過' : '口頭問答未通過';
  return practical === '通過' ? '上機通過' : '上機未通過';
}

function upsertAttendance(task, student, operatorName, operatorId) {
  const target = sheet(SHEETS.attendance);
  const recordId = `${task.id}:${student.id}`;
  const rows = target.getDataRange().getValues();
  ensureAttendanceHeaders(target, rows);
  let rowNumber = -1;
  for (let i = 1; i < rows.length; i++) if (rows[i][0] === recordId) { rowNumber = i + 1; break; }
  const result = (!isExam(task) || ['請假', '缺席'].includes(student.attendance)) ? '不適用' : student.result;
  const [shortAnswer, practical] = resultParts(result);
  const previous = certificationForStudent(task, student, recordId);
  const cumulativeShort = previous.shortAnswer || shortAnswer === '通過';
  const cumulativePractical = previous.practical || practical === '通過';
  const refundable = cumulativeShort && cumulativePractical;
  const shortEvaluated = cumulativeShort || ['通過', '未通過'].includes(shortAnswer);
  const practicalEvaluated = cumulativePractical || ['通過', '未通過'].includes(practical);
  const disqualified = student.attendance === '取消資格';
  const depositStatus = disqualified ? '不可退保證金（取消資格）'
    : shortEvaluated && practicalEvaluated ? (refundable ? '可退保證金' : '不可退保證金') : '待兩項評分完成';
  const cumulative = isExam(task)
    ? [cumulativeShort ? '通過' : '未通過', cumulativePractical ? '通過' : '未通過', depositStatus]
    : ['不適用', '不適用', '不適用'];
  const values = [recordId, task.id, task.date, task.start, task.phase, task.equipment, student.id, student.name, student.number,
    student.attendance, shortAnswer, practical, result, operatorName, operatorId, new Date(), ...cumulative];
  if (rowNumber === -1) target.appendRow(values); else target.getRange(rowNumber, 1, 1, values.length).setValues([values]);
  return { shortAnswer: cumulativeShort, practical: cumulativePractical, refundable, shortEvaluated, practicalEvaluated, depositStatus };
}

function nextPrompt(task, context) {
  const students = studentsFor(task.id);
  const pendingResult = students.find(student => isExam(task) && ['到場', '遲到'].includes(student.attendance) && examProgress(task, student).step !== 'done');
  if (pendingResult) return resultPrompt(task, pendingResult);
  const pending = students.filter(student => student.attendance === '未點名');
  if (!pending.length) {
    return reply(`✅ ${task.equipment} 已完成所有學生的點名與結果登記。`, externalNav([
      { label: '完成點名', text: `完成點名 ${task.id}` },
      { label: '查看認證狀態', uri: certificationStatusUrl() },
      { label: '查看統計', text: `查看任務 ${task.id}` }
    ], `查看任務 ${task.id}`, '回任務'));
  }
  return attendanceBoard(task, pending);
}

function resultPrompt(task, student) {
  const progress = examProgress(task, student);
  const { position, total } = studentPosition(task, student);
  const actions = [];
  if (!progress.shortRecorded) actions.push(
    { label: '口頭問答 ✅', postback: `簡答登記 ${task.id} ${student.id} 通過` },
    { label: '口頭問答 ❌', postback: `簡答登記 ${task.id} ${student.id} 未通過` }
  );
  if (!progress.practicalRecorded) actions.push(
    { label: '上機 ✅', postback: `上機登記 ${task.id} ${student.id} 通過` },
    { label: '上機 ❌', postback: `上機登記 ${task.id} ${student.id} 未通過` }
  );
  actions.push(
    { label: '修改出席', postback: `修改出席 ${task.id} ${student.id}` },
    { label: '回考生名單', postback: `考生名單 ${task.id} 1` }
  );
  const stateText = (recorded, passed) => !recorded ? '⏳ 尚未評分' : passed ? '✅ 通過' : '❌ 未通過';
  const depositText = progress.shortRecorded && progress.practicalRecorded
    ? `\n保證金：${progress.shortPassed && progress.practicalPassed ? '✅ 可退保證金' : '❌ 不可退保證金'}` : '';
  return reply(`【${task.equipment}｜第 ${position}/${total} 位】\n學生：${student.name}${student.number ? `（${student.number}）` : ''}\n出席：${student.attendance}\n\n口頭問答：${stateText(progress.shortRecorded, progress.shortPassed)}\n上機：${stateText(progress.practicalRecorded, progress.practicalPassed)}${depositText}\n\n${progress.step === 'done' ? '兩項評分已完成。' : '請直接選擇口頭問答或上機結果。'}`,
    externalNav(actions, `查看任務 ${task.id}`, '回任務'));
}

function attendanceSummary(taskId) {
  const task = findTask(taskId);
  if (!task) return reply(`找不到任務 ${taskId}`);
  const students = studentsFor(taskId);
  const lines = students.map((student, index) => {
    const result = isExam(task) && ['到場', '遲到'].includes(student.attendance)
      ? `｜${student.result === '未記錄' ? '成績未完成' : student.result}` : '';
    return `${index + 1}. ${student.name}：${student.attendance}${result}`;
  });
  const studentActions = students.slice(0, 10).map(student => ({
    label: `查看 ${String(student.name).slice(0, 12)}`,
    postback: `查看考生 ${task.id} ${student.id}`
  }));
  return reply(`【${task.equipment} 已點名結果】\n${lines.join('\n')}\n\n可點選學生查看或修改目前紀錄。`, externalNav([
    ...studentActions,
    { label: '繼續依序點名', postback: `開始點名 ${task.id}` }
  ], `查看任務 ${task.id}`, '回任務'));
}

function showStudent(taskId, studentId, context) {
  const task = findTask(taskId), student = findStudent(taskId, studentId);
  if (!task || !student) return reply('找不到指定的任務或學生。');
  if (student.attendance === '未點名' && isExam(task) && automaticArrivalStatus(task, student) === '取消資格') {
    return recordAttendance(taskId, studentId, '取消資格', context);
  }
  if (student.attendance === '未點名') return attendancePrompt(task, student);
  if (isExam(task) && ['到場', '遲到'].includes(student.attendance)) return resultPrompt(task, student);
  return reply(`${student.name}目前出席狀態：${student.attendance}`, externalNav([
    { label: '修改出席', postback: `修改出席 ${task.id} ${student.id}` },
    { label: '繼續依序點名', postback: `開始點名 ${task.id}` }
  ], `查看任務 ${task.id}`, '回任務'));
}

function startAttendance(taskId, context) {
  const task = findTask(taskId);
  if (!task) return reply(`找不到任務 ${taskId}`);
  const permission = canOperate(task, context);
  if (!permission.ok) return reply(permission.message);
  if (!studentsFor(taskId).length) return reply('這個任務尚未在「任務學生」分頁安排學生。');
  updateTaskStatus(task, '點名中');
  return candidateMenu(task);
}

function recordAutomaticArrival(taskId, studentId, context, now = new Date()) {
  const task = findTask(taskId), student = findStudent(taskId, studentId);
  if (!task || !student) return reply('找不到指定的任務或學生，請重新開啟任務。');
  const status = automaticArrivalStatus(task, student, now);
  return recordAttendance(taskId, studentId, status, context);
}

function recordAttendance(taskId, studentId, status, context) {
  const task = findTask(taskId), student = findStudent(taskId, studentId);
  if (!task || !student) return reply('找不到指定的任務或學生，請重新開啟任務。');
  const permission = canOperate(task, context); if (!permission.ok) return reply(permission.message);
  const result = (!isExam(task) || ['請假', '缺席', '取消資格'].includes(status)) ? '不適用'
    : student.result === '不適用' ? '未記錄' : student.result;
  updateStudent(student, status, result);
  upsertAttendance(task, student, permission.name, context.userId);
  if (isExam(task) && ['到場', '遲到'].includes(status) && examProgress(task, student).step !== 'done') return resultPrompt(task, student);
  const notice = status === '取消資格' ? `🚫 ${student.name} 已超過個別時段 5 分鐘，取消本次考試資格。` : `✅ 已登記 ${student.name}：${status}`;
  return candidateMenu(task, 1, notice);
}

function recordExamPart(taskId, studentId, part, value, context) {
  const task = findTask(taskId), student = findStudent(taskId, studentId);
  if (!task || !student) return reply('找不到指定的任務或學生，請重新開啟任務。');
  const permission = canOperate(task, context); if (!permission.ok) return reply(permission.message);
  if (!['到場', '遲到'].includes(student.attendance)) return reply('請先登記這位學生的出席狀態。');
  const result = mergeExamPart(student.result, part, value === '通過');
  updateStudent(student, student.attendance, result);
  const certification = upsertAttendance(task, student, permission.name, context.userId);
  const progress = examProgress(task, student);
  if (progress.step === 'done') {
    return candidateMenu(task, 1, `✅ ${student.name}兩項評分完成\n口頭問答：${progress.shortPassed ? '通過' : '未通過'}｜上機：${progress.practicalPassed ? '通過' : '未通過'}\n保證金：${certification.refundable ? '✅ 可退保證金' : '❌ 不可退保證金'}`);
  }
  const next = resultPrompt(task, student);
  next.text = `✅ ${student.name}的${part === 'short' ? '口頭問答' : '上機'}已登記：${value}\n\n${next.text}`;
  return next;
}

function recordResult(taskId, studentId, result, context) {
  const task = findTask(taskId), student = findStudent(taskId, studentId);
  if (!task || !student) return reply('找不到指定的任務或學生，請重新開啟任務。');
  const permission = canOperate(task, context); if (!permission.ok) return reply(permission.message);
  if (!['到場', '遲到'].includes(student.attendance)) return reply('請先登記這位學生的出席狀態。');
  updateStudent(student, student.attendance, result);
  const certification = upsertAttendance(task, student, permission.name, context.userId);
  return candidateMenu(task, 1, `✅ 已登記 ${student.name}：${result}\n${certificationText(certification)}`);
}

function finishAttendance(taskId, context) {
  const task = findTask(taskId); if (!task) return reply(`找不到任務 ${taskId}`);
  const permission = canOperate(task, context); if (!permission.ok) return reply(permission.message);
  const students = studentsFor(taskId);
  const pending = students.filter(student => student.attendance === '未點名' || (isExam(task) && ['到場', '遲到'].includes(student.attendance) && examProgress(task, student).step !== 'done'));
  if (pending.length) return reply(`尚有 ${pending.length} 位學生未完成登記。`, [{ label: '繼續點名', text: `開始點名 ${task.id}` }]);
  updateTaskStatus(task, '已完成');
  const counts = status => students.filter(student => student.attendance === status).length;
  const refundSummary = isExam(task) ? (() => {
    const refundable = students.filter(student => certificationForStudent(task, student).refundable).length;
    return `\n可退保證金 ${refundable}｜尚未符合 ${students.length - refundable}`;
  })() : '';
  return reply(`✅ 任務已完成\n${taskText(task)}\n\n到場 ${counts('到場')}｜遲到 ${counts('遲到')}｜請假 ${counts('請假')}｜缺席 ${counts('缺席')}${isExam(task) ? `｜取消資格 ${counts('取消資格')}` : ''}${refundSummary}\n\n點擊下方可查看考生認證狀態。`, externalNav([
    { label: '查看考生認證狀態', uri: certificationStatusUrl() }
  ], '近期任務', '回近期任務'));
}

function handleCommand(text, context) {
  const command = String(text || '').trim();
  let match;
  if ((match = command.match(/^綁定群組(?:\s+(.+))?$/))) {
    if (!['group', 'room'].includes(context.sourceType)) return reply('請在要接收提醒的 LINE 群組中輸入這個指令。');
    return reply(`✅ 已綁定「${upsertGroup(context, match[1])}」\n將於對外任務開始前 1 小時推播考生名單與點名入口。`);
  }
  if (command === '解除群組') { disableGroup(context.chatId); return reply('已停止此群組的對外任務提醒。'); }
  const scheduleCommand = /^(今日任務|對外任務|近期任務|查看任務\s|開始點名\s|同步對外排程)/.test(command);
  let syncResult = null;
  if (scheduleCommand) {
    try { syncResult = syncFromSchedule(); }
    catch (error) { return reply(`讀取對外分班表失敗：${error.message}`); }
  }
  if (command === '同步對外排程') return reply(`✅ 同步完成\n任務 ${syncResult.tasks} 筆（新增 ${syncResult.tasksAdded}、更新 ${syncResult.tasksUpdated}）\n學生安排 ${syncResult.students} 筆（新增 ${syncResult.studentsAdded}、更新 ${syncResult.studentsUpdated}）`);
  if (command === '今日任務') return listTasks(context, true);
  if (command === '對外任務' || command === '近期任務') return listTasks(context, false);
  if ((match = command.match(/^查看任務\s+(\S+)$/))) return showTask(match[1]);
  if ((match = command.match(/^開始點名\s+(\S+)$/))) return startAttendance(match[1], context);
  if ((match = command.match(/^考生名單\s+(\S+)(?:\s+(\d+))?$/))) {
    const task = findTask(match[1]);
    if (!task) return reply(`找不到任務 ${match[1]}`);
    const permission = canOperate(task, context); if (!permission.ok) return reply(permission.message);
    return candidateMenu(task, match[2] || 1);
  }
  if ((match = command.match(/^查看考生\s+(\S+)\s+(\S+)$/))) return showStudent(match[1], match[2], context);
  if ((match = command.match(/^查看點名結果\s+(\S+)$/))) return attendanceSummary(match[1]);
  if ((match = command.match(/^修改出席\s+(\S+)\s+(\S+)$/))) {
    const task = findTask(match[1]), student = findStudent(match[1], match[2]);
    if (!task || !student) return reply('找不到指定的任務或學生。');
    const permission = canOperate(task, context); if (!permission.ok) return reply(permission.message);
    return attendancePrompt(task, student);
  }
  if ((match = command.match(/^到場判定\s+(\S+)\s+(\S+)$/))) return recordAutomaticArrival(match[1], match[2], context);
  if ((match = command.match(/^點名狀態\s+(\S+)\s+(\S+)\s+(到場|遲到|請假|缺席|取消資格)$/))) return recordAttendance(match[1], match[2], match[3], context);
  if ((match = command.match(/^簡答登記\s+(\S+)\s+(\S+)\s+(通過|未通過)$/))) return recordExamPart(match[1], match[2], 'short', match[3], context);
  if ((match = command.match(/^上機登記\s+(\S+)\s+(\S+)\s+(通過|未通過)$/))) return recordExamPart(match[1], match[2], 'practical', match[3], context);
  if ((match = command.match(/^考試登記\s+(\S+)\s+(\S+)\s+(全部通過|僅簡答通過|僅上機通過|未通過|簡答通過|簡答未通過|上機通過|上機未通過)$/))) return recordResult(match[1], match[2], match[3], context);
  if ((match = command.match(/^完成點名\s+(\S+)$/))) return finishAttendance(match[1], context);
  return null;
}

function isExternalCommand(text) {
  return EXTERNAL_COMMAND.test(String(text || '').trim());
}

function requiresFreshData(text) {
  return /^(同步對外排程$|開始點名\s)/.test(String(text || '').trim());
}

function isCombinedTaskQuery(text) {
  return /^(?:查任務|任務查詢|我的任務|任務)\s+\S/.test(String(text || '').trim());
}

function parseTaskStart(task) {
  const date = task.date instanceof Date ? new Date(task.date) : new Date(task.date);
  if (Number.isNaN(date.getTime())) return null;
  const time = clockParts(task.start);
  if (!time) return null;
  const calendarDate = Utilities.formatDate(date, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  const isoTime = `${String(time.hour).padStart(2, '0')}:${String(time.minute).padStart(2, '0')}:00`;
  return new Date(`${calendarDate}T${isoTime}+08:00`);
}
function enabledFlag(value, defaultValue = true) {
  if (value === '' || value == null) return defaultValue;
  return value === true || ['TRUE', '是', '1'].includes(String(value).toUpperCase());
}
function queuePush(chatId, content) {
  const message = { type: 'text', text: content.text, ...(content.quickReply ? { quickReply: content.quickReply } : {}) };
  UrlFetchApp.fetch('https://api.line.me/v2/bot/message/push', {
    method: 'post', headers: { Authorization: `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
    payload: JSON.stringify({ to: chatId, messages: [message] }), muteHttpExceptions: true
  });
}

function studentRosterText(task) {
  const students = studentsFor(task.id);
  if (!students.length) return '考生：尚未安排';
  return `考生（${students.length} 人）：${students.map(student => student.name).join('、')}`;
}

function expireExamQualifications(now = new Date()) {
  const timezone = Session.getScriptTimeZone();
  const today = Utilities.formatDate(now, timezone, 'yyyy-MM-dd');
  let expired = 0;
  allTasks().filter(task => isExam(task) && ['已排定', '點名中'].includes(task.status)).forEach(task => {
    studentsFor(task.id).filter(student => student.attendance === '未點名').forEach(student => {
      const start = studentTaskStart(task, student);
      if (!start || Utilities.formatDate(start, timezone, 'yyyy-MM-dd') !== today || now.getTime() <= start.getTime() + 5 * 60000) return;
      updateStudent(student, '取消資格', '不適用');
      upsertAttendance(task, student, '系統自動判定', 'SYSTEM');
      expired++;
    });
  });
  return expired;
}

function sendExternalReminders(now = new Date()) {
  syncFromSchedule();
  expireExamQualifications(now);
  const activeGroups = groups().filter(group => group.enabled === '是');
  let sent = 0;
  for (const task of allTasks()) {
    if (!['已排定', '點名中'].includes(task.status)) continue;
    const start = parseTaskStart(task); if (!start || start <= now) continue;
    const reminderDue = new Date(start.getTime() - REMINDER_LEAD_MINUTES * 60000);
    if (!enabledFlag(task.twoHours) || task.twoHoursSentAt || now < reminderDue) continue;

    const buttons = [
      { label: '開始聊天室點名', text: `開始點名 ${task.id}` },
      { label: '查看任務', text: `查看任務 ${task.id}` }
    ];
    const roster = studentRosterText(task);
    const examinerUserId = userIdForName(task.examiner) || task.examinerUserId;
    const targetGroups = task.groupId ? activeGroups.filter(group => group.id === task.groupId) : activeGroups;
    let taskSent = false;

    if (examinerUserId) {
      queuePush(examinerUserId, reply(`⏰ 你的對外任務將於 1 小時後開始\n\n${taskText(task)}\n\n${roster}`, buttons));
      sent++; taskSent = true;
    }
    for (const group of targetGroups) {
      queuePush(group.id, reply(`📣 對外工作坊將於 1 小時後開始\n\n${taskText(task)}\n\n${roster}\n\n請考生準時到場；考官可由下方按鈕開始點名。`, buttons));
      sent++; taskSent = true;
    }
    if (taskSent) sheet(SHEETS.tasks).getRange(task.row, 16).setValue(now);
  }
  return sent;
}

function joinReply() {
  return reply('👋 我可以在群組中提醒對外教學／考試任務並完成點名。\n請由管理員輸入「綁定群組 群組名稱」。');
}

module.exports = { handleCommand, sendExternalReminders, disableGroup, joinReply, syncFromSchedule, isExternalCommand, requiresFreshData, isCombinedTaskQuery, _test: { comparable, rowChanged, reminderBelongsToSchedule, parseTaskStart, automaticArrivalStatus } };
