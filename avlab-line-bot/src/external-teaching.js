'use strict';

const crypto = require('crypto');
const { ids } = require('./config');
const { parseWorkbook, parseDateCell } = require('./external-schedule-parser');
const { parseRegistrationRows } = require('./external-registration-parser');

const SHEETS = {
  tasks: '對外任務', students: '任務學生', attendance: 'LINE點名紀錄', groups: 'LINE群組設定',
  depositReminders: '保證金提醒紀錄'
};
const MANAGERS = ['徐嘉翔', '蔡季妍', '吳欣芸'];
const SOURCE_TABS = ['教學週分班表I', '教學週分班表II', '考試週分班表I', '考試週分班表II', '第一次補考週分班表', '第二次補考週分班表'];
const REMINDER_LEAD_MINUTES = 60;
const ROSTER_SHEET = process.env.EXTERNAL_ROSTER_SHEET_NAME || '1151修課名單';
const REGISTRATION_TASK_ID = 'REGISTRATION-1151';
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
function editDistance(left, right) {
  const a = norm(left).toLowerCase(), b = norm(right).toLowerCase();
  const row = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i++) {
    let previous = row[0]; row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const current = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1));
      previous = current;
    }
  }
  return row[b.length];
}
function namesSimilar(left, right) {
  const a = norm(left).toLowerCase(), b = norm(right).toLowerCase();
  if (!a || !b) return false;
  if (a === b) return true;
  return Math.min(a.length, b.length) >= 3 && editDistance(a, b) <= 1;
}
function equipmentKey(value) {
  const key = String(value || '').toLowerCase().replace(/考試|課程|器材|無線追焦|無線追/g, match => match.startsWith('無線追') ? '無線追' : '').replace(/[^a-z0-9\u3400-\u9fff]/g, '');
  if (/par.*200|200.*par/.test(key)) return 'par200w';
  return key;
}
function dateKey(value) {
  const date = value instanceof Date ? new Date(value) : (() => {
    const raw = String(value || '').trim();
    const full = raw.match(/(\d{4})\s*[/-]\s*(\d{1,2})\s*[/-]\s*(\d{1,2})/);
    return full ? new Date(Number(full[1]), Number(full[2]) - 1, Number(full[3])) : parseDateCell(raw, process.env.ACADEMIC_TERM || '1151');
  })();
  return date && !Number.isNaN(date.getTime()) ? Utilities.formatDate(date, Session.getScriptTimeZone(), 'yyyy-MM-dd') : '';
}
function replaceExaminerName(value, originalName, substituteName) {
  const current = String(value || '').trim();
  if (norm(current) === norm(substituteName)) return current;
  if (namesSimilar(current, originalName)) return substituteName;
  const pieces = current.split(/([,，、/&+＋])/);
  let changed = false;
  const replaced = pieces.map(piece => {
    if (!namesSimilar(piece, originalName)) return piece;
    changed = true;
    return substituteName;
  }).join('');
  if (!changed && pieces.some(piece => norm(piece) === norm(substituteName))) return current;
  return changed ? replaced : '';
}
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

function userIdForName(name, number = '') {
  const bindSheet = SpreadsheetApp.openById(ids.master).getSheetByName('用戶綁定');
  if (!bindSheet || !name) return '';
  const rows = bindSheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (norm(rows[i][1]) !== norm(name)) continue;
    if (number && norm(rows[i][3]) !== norm(number)) continue;
    return String(rows[i][0] || '');
  }
  return '';
}

function userIdForExaminerName(name) {
  const bindSheet = SpreadsheetApp.openById(ids.master).getSheetByName('用戶綁定');
  if (!bindSheet || !name) return '';
  const rows = bindSheet.getDataRange().getValues().slice(1).filter(row => row[0] && row[1]);
  const exact = rows.find(row => norm(row[1]) === norm(name));
  if (exact) return String(exact[0]);
  const candidates = rows.filter(row => namesSimilar(row[1], name));
  return candidates.length === 1 ? String(candidates[0][0]) : '';
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
  return { row: rowNumber, taskId: String(row[0] || '').trim(), id: String(row[1] || '').trim(), name: row[2], number: row[3], order: Number(row[4] || 0), attendance: String(row[5] || '未點名'), result: String(row[6] || '未記錄'), scheduledStart: row[8] || '', scheduledEnd: row[9] || '', reminderSentAt: row[10] || '', sourceCell: String(row[11] || '').trim() };
}

function studentsFor(taskId, { includeDisqualified = false } = {}) {
  const target = sheet(SHEETS.students);
  if (!target) return [];
  const active = activeStudentsByTask.get(taskId);
  const students = target.getDataRange().getValues().slice(1).map((row, index) => studentFromRow(row, index + 2))
    .filter(student => student.taskId === taskId && student.id && !isTemplate(student.id) && (!active || active.has(student.id)) && (includeDisqualified || student.attendance !== '取消資格'))
    .sort((a, b) => a.order - b.order || String(a.name).localeCompare(String(b.name), 'zh-Hant'));
  const seen = new Set();
  return students.filter(student => {
    const key = `${norm(student.name)}|${norm(student.number)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function rosterStudents(rows) {
  const result = [], seen = new Set();
  for (const row of rows || []) for (const column of [0, 5, 10, 15, 20, 25]) {
    const name = String(row?.[column] || '').trim();
    const number = String(row?.[column + 1] || '').trim();
    if (!name || !number || /組$/.test(name) || /^(TRUE|FALSE|報名)$/i.test(number)) continue;
    const key = `${norm(name)}|${norm(number)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({ name, number });
  }
  return result;
}

function enrichStudentsFromRoster(tasks, roster) {
  const byName = new Map();
  for (const student of roster) {
    const key = norm(student.name);
    if (!byName.has(key)) byName.set(key, []);
    byName.get(key).push(student);
  }
  for (const task of tasks) {
    const seen = new Set();
    task.students = task.students.filter(student => {
      const matches = byName.get(norm(student.name)) || [];
      if (!student.number && matches.length === 1) student.number = matches[0].number;
      const key = `${norm(student.name)}|${norm(student.number)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
}

function registrationRows() {
  const target = SpreadsheetApp.openById(ids.externalRegistration).getSheetByName('表單回覆 1');
  return target ? parseRegistrationRows(target.getDataRange().getValues()) : [];
}

function depositRows() {
  const target = SpreadsheetApp.openById(ids.deposit).getSheetByName('考試週保證金');
  if (!target) return [];
  return target.getDataRange().getValues().slice(3).map((row, index) => ({
    phase: '考試', row: index + 4, name: String(row[0] || '').trim(), department: String(row[1] || '').trim(), number: String(row[2] || '').trim(),
    items: row[3], itemCount: row[4], requiredAmount: row[5], paidRaw: row[6], paid: paidFlag(row[6]), paidAmount: row[7],
    processed: row[8], captainNote: row[9], teachingNote: row[10]
  })).filter(row => row.name || row.number);
}

function syncDepositFromRegistrations(registrations) {
  if (!registrations.length) return { rows: 0, updated: false, skipped: true, reason: 'empty-registration-source' };
  const target = SpreadsheetApp.openById(ids.deposit).getSheetByName('考試週保證金');
  if (!target) throw new Error('找不到「考試週保證金」分頁');
  const existing = depositRows();
  const existingFor = registration => existing.find(row => norm(row.number) === norm(registration.number))
    || (existing.filter(row => norm(row.name) === norm(registration.name)).length === 1
      ? existing.find(row => norm(row.name) === norm(registration.name)) : null);
  const desired = registrations.map(registration => {
    const current = existingFor(registration);
    return [registration.name, registration.department, registration.number, registration.equipment.join('、'),
      registration.equipment.length, registration.equipment.length * 50, current?.paidRaw ?? false,
      current?.paidAmount ?? '', current?.processed ?? '', current?.captainNote ?? '', current?.teachingNote ?? ''];
  });
  const rowsToWrite = Math.max(existing.length, desired.length);
  const padded = [...desired, ...Array.from({ length: rowsToWrite - desired.length }, () => Array(11).fill(''))];
  const current = target.getDataRange().getValues().slice(3, 3 + rowsToWrite);
  const changed = padded.some((row, index) => rowChanged(current[index] || [], row));
  if (changed && rowsToWrite) target.getRange(4, 1, rowsToWrite, 11).setValues(padded);
  return { rows: desired.length, updated: changed, skipped: false };
}

function registrationStudentId(student) {
  return `STU-REG-${crypto.createHash('sha1').update(`${norm(student.name)}|${norm(student.number)}`).digest('hex').slice(0, 10).toUpperCase()}`;
}

function backfillBindingNumbers(roster) {
  const target = SpreadsheetApp.openById(ids.master).getSheetByName('用戶綁定');
  if (!target) return 0;
  const rows = target.getDataRange().getValues();
  if (!rows.length) return 0;
  if (rows[0][3] !== '學號') target.getRange(1, 4).setValue('學號');
  const numbersByName = new Map();
  for (const student of roster) {
    const key = norm(student.name);
    if (!numbersByName.has(key)) numbersByName.set(key, new Set());
    numbersByName.get(key).add(student.number);
  }
  let updated = 0;
  for (let index = 1; index < rows.length; index++) {
    if (!rows[index][1] || rows[index][3]) continue;
    const numbers = numbersByName.get(norm(rows[index][1]));
    if (numbers?.size !== 1) continue;
    target.getRange(index + 1, 4).setValue([...numbers][0]);
    updated++;
  }
  return updated;
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
  const rosterSheet = SpreadsheetApp.openById(ids.externalResults).getSheetByName(ROSTER_SHEET);
  const roster = rosterStudents(rosterSheet ? rosterSheet.getDataRange().getValues() : []);
  const registrations = registrationRows();
  const depositIdentities = depositRows().map(row => ({ name: row.name, number: row.number }));
  // Registration is authoritative. Roster and existing deposit rows only fill
  // a missing student number during the empty-source migration period.
  enrichStudentsFromRoster(parsed, registrations);
  enrichStudentsFromRoster(parsed, roster);
  enrichStudentsFromRoster(parsed, depositIdentities);
  if (registrations.length) {
    const byNumber = new Map(registrations.map(item => [norm(item.number), item]));
    const byName = new Map(registrations.map(item => [norm(item.name), item]));
    for (const task of parsed.filter(task => task.phase === '考試')) {
      const taskEquipment = equipmentKey(task.equipment);
      task.students = task.students.filter(student => {
        const registration = norm(student.number) ? byNumber.get(norm(student.number)) : byName.get(norm(student.name));
        return registration && registration.equipment.some(item => equipmentKey(item) === taskEquipment);
      });
    }
  }
  const bindingsBackfilled = backfillBindingNumbers([...registrations, ...roster, ...depositIdentities]);
  const taskSheet = sheet(SHEETS.tasks), studentSheet = sheet(SHEETS.students);
  if (!taskSheet || !studentSheet) throw new Error('找不到對外任務或任務學生工作表');

  const taskRows = taskSheet.getDataRange().getValues();
  const existingTasks = new Map();
  for (let i = 1; i < taskRows.length; i++) if (taskRows[i][0] && !isTemplate(taskRows[i][0])) existingTasks.set(String(taskRows[i][0]), { row: i + 1, values: taskRows[i], task: taskFromRow(taskRows[i], i + 1) });
  const parsedIds = new Set();
  let tasksAdded = 0, tasksUpdated = 0, studentsAdded = 0, studentsUpdated = 0, duplicateStudentsCleared = 0, staleStudentsCleared = 0, registrationStudentsAdded = 0;

  for (const incoming of parsed) {
    parsedIds.add(incoming.id);
    const existing = existingTasks.get(incoming.id);
    const currentStatus = existing?.task.status;
    const scheduleChanged = Boolean(existing) && [
      [existing.task.date, incoming.date, 3],
      [existing.task.start, incoming.start, 4],
      [existing.task.end, incoming.end, 5]
    ].some(([current, desired, index]) => comparable(current, index) !== comparable(desired, index));
    const examinerChanged = Boolean(existing) && norm(existing.task.examiner) !== norm(incoming.examiner);
    const status = !scheduleChanged && ['點名中', '已完成'].includes(currentStatus) ? currentStatus : '已排定';
    const oneHourSentAt = !scheduleChanged && !examinerChanged && reminderBelongsToSchedule(existing?.task.twoHoursSentAt, incoming.date, incoming.start)
      ? existing.task.twoHoursSentAt : '';
    const incomingExaminerUserId = userIdForExaminerName(incoming.examiner);
    const desired = [incoming.id, incoming.term, incoming.phase, incoming.date, incoming.start, incoming.end, incoming.equipment, incoming.location,
      incoming.examiner, incomingExaminerUserId || (!examinerChanged ? existing?.task.examinerUserId : '') || '', existing?.task.groupId || '', status,
      existing ? existing.task.dayBefore : true, existing ? existing.task.twoHours : true,
      existing?.task.dayBeforeSentAt || '', oneHourSentAt, incoming.sourceSheet, incoming.sourceRange];
    if (!existing) { taskSheet.appendRow(desired); tasksAdded++; }
    else if (rowChanged(existing.values, desired)) { taskSheet.getRange(existing.row, 1, 1, desired.length).setValues([desired]); tasksUpdated++; }
  }
  for (const existing of existingTasks.values()) {
    if (SOURCE_TABS.includes(String(existing.task.sourceSheet)) && !parsedIds.has(existing.task.id)) {
      taskSheet.getRange(existing.row, 1, 1, 18).setValues([Array(18).fill('')]); tasksUpdated++;
    }
  }

  const studentRows = studentSheet.getDataRange().getValues();
  const studentHeaders = ['任務ID','學生ID','學生姓名','學號','點名順序','出席狀態','考試結果','更新時間','個別開始時間','個別結束時間','考生提醒時間','來源儲存格'];
  if (!studentRows.length) studentSheet.appendRow(studentHeaders);
  else if (studentHeaders.some((header, index) => studentRows[0][index] !== header)) studentSheet.getRange(1, 1, 1, studentHeaders.length).setValues([studentHeaders]);
  const existingStudents = new Map();
  const duplicateStudentRows = [];
  const desiredStudentIds = new Set(parsed.flatMap(task => task.students.map(student => `${task.id}|${student.id}`)));
  const studentCandidates = [];
  const rosterNumbersByName = new Map();
  for (const rosterStudent of roster) {
    const key = norm(rosterStudent.name);
    if (!rosterNumbersByName.has(key)) rosterNumbersByName.set(key, new Set());
    rosterNumbersByName.get(key).add(rosterStudent.number);
  }
  for (let i = 1; i < studentRows.length; i++) {
    const student = studentFromRow(studentRows[i], i + 1);
    if (!student.taskId || !student.id || isTemplate(student.id)) continue;
    const rosterNumbers = rosterNumbersByName.get(norm(student.name));
    if (!student.number && rosterNumbers?.size === 1) {
      student.number = [...rosterNumbers][0];
      studentRows[i][3] = student.number;
      studentSheet.getRange(student.row, 4).setValue(student.number);
      studentsUpdated++;
    }
    studentCandidates.push({ student, values: studentRows[i] });
  }
  const candidatesByPerson = new Map();
  for (const candidate of studentCandidates) {
    const key = `${candidate.student.taskId}|${norm(candidate.student.name)}`;
    if (!candidatesByPerson.has(key)) candidatesByPerson.set(key, []);
    candidatesByPerson.get(key).push(candidate);
  }
  for (const candidates of candidatesByPerson.values()) {
    const nonblankNumbers = new Set(candidates.map(candidate => norm(candidate.student.number)).filter(Boolean));
    const buckets = new Map();
    for (const candidate of candidates) {
      const number = norm(candidate.student.number);
      const bucketKey = nonblankNumbers.size <= 1 ? 'same-person' : number || `missing:${candidate.student.id}`;
      if (!buckets.has(bucketKey)) buckets.set(bucketKey, []);
      buckets.get(bucketKey).push(candidate);
    }
    for (const bucket of buckets.values()) {
      bucket.sort((a, b) => {
        const score = candidate => (desiredStudentIds.has(`${candidate.student.taskId}|${candidate.student.id}`) ? 100 : 0)
          + (candidate.student.attendance !== '未點名' ? 10 : 0)
          + (candidate.student.result !== '未記錄' ? 5 : 0)
          + (candidate.student.number ? 1 : 0);
        return score(b) - score(a) || a.student.row - b.student.row;
      });
      const canonical = bucket[0];
      existingStudents.set(`${canonical.student.taskId}|${canonical.student.id}`, canonical);
      duplicateStudentRows.push(...bucket.slice(1).map(candidate => candidate.student.row));
    }
  }
  for (const row of duplicateStudentRows) {
    studentSheet.getRange(row, 1, 1, studentHeaders.length).setValues([Array(studentHeaders.length).fill('')]);
    duplicateStudentsCleared++;
  }
  activeStudentsByTask = new Map();
  for (const incoming of parsed) {
    const active = new Set(); activeStudentsByTask.set(incoming.id, active);
    for (const student of incoming.students) {
      active.add(student.id);
      const key = `${incoming.id}|${student.id}`, existing = existingStudents.get(key);
      if (!existing) {
        studentSheet.appendRow([incoming.id, student.id, student.name, student.number, student.order, '未點名', '未記錄', '', student.scheduledStart || incoming.start, student.scheduledEnd || incoming.end, '', student.sourceCell || '']); studentsAdded++;
      } else {
        const desiredIdentity = [incoming.id, student.id, student.name, existing.student.number || student.number, student.order];
        const identityChanged = rowChanged(existing.values.slice(0, 5), desiredIdentity);
        const desiredTimes = [student.scheduledStart || incoming.start, student.scheduledEnd || incoming.end];
        const timesChanged = rowChanged(existing.values.slice(8, 10), desiredTimes);
        const sourceChanged = comparable(existing.student.sourceCell) !== comparable(student.sourceCell || '');
        if (identityChanged) studentSheet.getRange(existing.student.row, 1, 1, 5).setValues([desiredIdentity]);
        if (timesChanged) studentSheet.getRange(existing.student.row, 9, 1, 3).setValues([[...desiredTimes, '']]);
        if (sourceChanged) studentSheet.getRange(existing.student.row, 12).setValue(student.sourceCell || '');
        if (identityChanged || timesChanged || sourceChanged) studentsUpdated++;
      }
    }
  }
  for (const candidate of studentCandidates) {
    const taskId = candidate.student.taskId;
    const scheduleManaged = parsedIds.has(taskId) || SOURCE_TABS.includes(String(existingTasks.get(taskId)?.task.sourceSheet || ''));
    if (!scheduleManaged || desiredStudentIds.has(`${taskId}|${candidate.student.id}`) || duplicateStudentRows.includes(candidate.student.row)) continue;
    studentSheet.getRange(candidate.student.row, 1, 1, studentHeaders.length).setValues([Array(studentHeaders.length).fill('')]);
    staleStudentsCleared++;
  }
  const scheduledPeople = new Set(parsed.flatMap(task => task.students.map(student => `${norm(student.name)}|${norm(student.number)}`)));
  const registrationPoolRows = new Map();
  const legacyRosterRows = [];
  for (const existing of existingStudents.values()) {
    if (existing.student.taskId === REGISTRATION_TASK_ID) registrationPoolRows.set(`${norm(existing.student.name)}|${norm(existing.student.number)}`, existing);
    if (existing.student.taskId === 'ROSTER-1151') legacyRosterRows.push(existing);
  }
  for (const student of registrations) {
    const personKey = `${norm(student.name)}|${norm(student.number)}`;
    if (scheduledPeople.has(personKey) || registrationPoolRows.has(personKey)) continue;
    studentSheet.appendRow([REGISTRATION_TASK_ID, registrationStudentId(student), student.name, student.number, 0, '報名', '不適用', '', '', '', '', '']);
    registrationStudentsAdded++; studentsAdded++;
  }
  const desiredRegistrationOnly = new Set(registrations.filter(student => !scheduledPeople.has(`${norm(student.name)}|${norm(student.number)}`))
    .map(student => `${norm(student.name)}|${norm(student.number)}`));
  for (const existing of registrationPoolRows.values()) {
    const key = `${norm(existing.student.name)}|${norm(existing.student.number)}`;
    if (!registrations.length || (existing.student.taskId === REGISTRATION_TASK_ID && desiredRegistrationOnly.has(key)) || duplicateStudentRows.includes(existing.student.row)) continue;
    studentSheet.getRange(existing.student.row, 1, 1, studentHeaders.length).setValues([Array(studentHeaders.length).fill('')]);
    staleStudentsCleared++;
  }
  if (registrations.length) for (const existing of legacyRosterRows) {
    if (duplicateStudentRows.includes(existing.student.row)) continue;
    studentSheet.getRange(existing.student.row, 1, 1, studentHeaders.length).setValues([Array(studentHeaders.length).fill('')]);
    staleStudentsCleared++;
  }
  const depositRegistration = syncDepositFromRegistrations(registrations);
  return { tasks: parsed.length, tasksAdded, tasksUpdated, students: [...activeStudentsByTask.values()].reduce((sum, set) => sum + set.size, 0), studentsAdded, studentsUpdated, duplicateStudentsCleared, staleStudentsCleared, registrationStudentsAdded, bindingsBackfilled, depositRegistration };
}

function replaceExternalExaminer(submission) {
  const targetDate = dateKey(submission.date);
  if (!targetDate || !norm(submission.originalName) || !norm(submission.substituteName) || !equipmentKey(submission.equipment)) return [];
  const sourceBook = SpreadsheetApp.openById(ids.externalClassSchedule);
  const changes = [];
  for (const sheetName of SOURCE_TABS) {
    const sourceSheet = sourceBook.getSheetByName(sheetName);
    if (!sourceSheet) continue;
    const data = sourceSheet.getDataRange().getValues();
    const dateHeaders = [];
    let currentDate = null;
    const width = data.reduce((max, row) => Math.max(max, row?.length || 0), 0);
    for (let column = 1; column < width; column++) {
      const candidate = parseDateCell(data[1]?.[column], process.env.ACADEMIC_TERM || '1151');
      if (candidate) currentDate = candidate;
      dateHeaders[column] = currentDate;
    }
    for (let itemRow = 0; itemRow < data.length; itemRow++) {
      if (String(data[itemRow]?.[0] || '').trim() !== '項目') continue;
      const examinerRow = itemRow + 2;
      for (let column = 1; column < width; column++) {
        if (dateKey(dateHeaders[column]) !== targetDate || equipmentKey(data[itemRow]?.[column]) !== equipmentKey(submission.equipment)) continue;
        const replacement = replaceExaminerName(data[examinerRow]?.[column], submission.originalName, submission.substituteName);
        if (!replacement) continue;
        sourceSheet.getRange(examinerRow + 1, column + 1).setValue(replacement);
        data[examinerRow][column] = replacement;
        changes.push({ sheetName, itemRow, column, equipment: data[itemRow][column] });
      }
    }
  }
  return changes;
}

function finishExaminerChange(event, outcome) {
  const row = Number(event?.range?.getRow?.() || 0);
  const responseSheet = event?.range?.getSheet?.();
  if (responseSheet && row > 1) {
    const status = outcome.updated
      ? `已同步（${outcome.updated} 格／${outcome.tasks || 0} 任務）`
      : outcome.reason === 'no-substitute' ? '略過：未提供代班人'
        : outcome.reason === 'substitute-not-certified' ? '略過：代班人未通過認證'
          : '失敗：找不到對應場次';
    responseSheet.getRange(1, 8, 1, 2).setValues([['同步狀態', '同步時間']]);
    responseSheet.getRange(row, 8, 1, 2).setValues([[status, new Date()]]);
  }
  return outcome;
}

function onExaminerChangeFormSubmit(event) {
  const values = event?.values || [];
  const submission = {
    originalName: String(values[1] || '').trim(),
    date: values[2],
    equipment: String(values[3] || '').trim(),
    hasSubstitute: String(values[4] || '').trim(),
    substituteName: String(values[5] || '').trim(),
    certified: String(values[6] || '').trim()
  };
  if (!submission.substituteName || /^(?:無|沒有|否)$/.test(submission.hasSubstitute)) return finishExaminerChange(event, { updated: 0, skipped: true, reason: 'no-substitute' });
  if (/^(?:無|沒有|否|未通過)$/.test(submission.certified)) return finishExaminerChange(event, { updated: 0, skipped: true, reason: 'substitute-not-certified' });
  const changes = replaceExternalExaminer(submission);
  const originalUserId = userIdForExaminerName(submission.originalName);
  if (!changes.length) {
    if (originalUserId) queuePush(originalUserId, reply(`⚠️ 找不到可更動的對外任務\n\n日期：${String(submission.date || '')}\n器材：${submission.equipment}\n原考官：${submission.originalName}\n請檢查表單內容是否與分班表一致。`));
    return finishExaminerChange(event, { updated: 0, skipped: false, reason: 'task-not-found' });
  }
  syncFromSchedule();
  const changedSheets = new Set(changes.map(change => change.sheetName));
  const tasks = allTasks().filter(task => changedSheets.has(task.sourceSheet)
    && dateKey(task.date) === dateKey(submission.date)
    && equipmentKey(task.equipment) === equipmentKey(submission.equipment)
    && norm(task.examiner) === norm(submission.substituteName));
  const substituteUserId = userIdForExaminerName(submission.substituteName);
  if (substituteUserId) for (const task of tasks) {
    queuePush(substituteUserId, reply(`🔔 你已接下一項對外代班任務\n\n原考官：${submission.originalName}\n${taskText(task)}\n\n已替你更新分班表，可直接由下方開始點名。`, [
      { label: '開始聊天室點名', text: `開始點名 ${task.id}` },
      { label: '查看任務', text: `查看任務 ${task.id}` }
    ]));
  }
  if (originalUserId) queuePush(originalUserId, reply(`✅ 對外考官更動已完成\n\n日期：${String(submission.date || '')}\n器材：${submission.equipment}\n新考官：${submission.substituteName}${substituteUserId ? '\n已將點名入口傳給新考官。' : '\n⚠️ 新考官尚未綁定 LINE，目前無法傳送點名入口。'}`));
  return finishExaminerChange(event, { updated: changes.length, tasks: tasks.length, notified: Boolean(substituteUserId) });
}

function processPendingExaminerChanges() {
  const responseSheet = SpreadsheetApp.openById(ids.external).getSheetByName('表單回覆 1');
  if (!responseSheet) return 0;
  responseSheet.getRange(1, 8, 1, 2).setValues([['同步狀態', '同步時間']]);
  const rows = responseSheet.getDataRange().getValues();
  let processed = 0;
  for (let index = 1; index < rows.length; index++) {
    if (!rows[index][0] || String(rows[index][7] || '').trim()) continue;
    onExaminerChangeFormSubmit({
      values: rows[index].slice(0, 7),
      range: responseSheet.getRange(index + 1, 1)
    });
    processed++;
  }
  return processed;
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
  const existing = groups().find(group => group.id === context.chatId && group.scope === '對外教學');
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
  const existing = groups().find(group => group.id === chatId && group.scope === '對外教學');
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
    { label: '✅ 考生已到', postback: `到場判定 ${task.id} ${student.id}` }
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
  const pageSize = 10, totalPages = Math.max(1, Math.ceil(students.length / pageSize));
  const currentPage = Math.min(Math.max(1, Number(page) || 1), totalPages);
  const visible = students.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const postbackAction = (label, data) => ({ type: 'postback', label, data });
  const columns = visible.map((student, index) => ({
    title: String(student.name || '未填姓名').slice(0, 40),
    text: `${(currentPage - 1) * pageSize + index + 1}/${students.length}｜${task.equipment}\n時間 ${formatTime(student.scheduledStart || task.start)}｜${student.attendance}`.slice(0, 60),
    actions: isExam(task) ? [
      postbackAction('考生已到', `到場判定 ${task.id} ${student.id}`),
      postbackAction('查看／評分', `查看考生 ${task.id} ${student.id}`)
    ] : [
      postbackAction('學生已到（自動判定）', `到場判定 ${task.id} ${student.id}`),
      postbackAction('請假', `點名狀態 ${task.id} ${student.id} 請假`),
      postbackAction('缺席', `點名狀態 ${task.id} ${student.id} 缺席`)
    ]
  }));
  const navActions = [];
  if (currentPage > 1) navActions.push({ label: '⬅️ 上一頁名單', postback: `考生名單 ${task.id} ${currentPage - 1}` });
  if (currentPage < totalPages) navActions.push({ label: '下一頁名單 ➡️', postback: `考生名單 ${task.id} ${currentPage + 1}` });
  const rows = visible.map((student, index) => `${(currentPage - 1) * pageSize + index + 1}. ${student.name}｜${student.attendance}`).join('\n');
  const fallbackText = `${notice ? `${notice}\n\n` : ''}【${task.equipment} 考生名單｜${currentPage}/${totalPages}】\n${rows}\n\n請左右滑動卡片並直接點選考生。`;
  const fallbackItems = visible.slice(0, 9).map(student => ({ label: `查看 ${String(student.name).slice(0, 12)}`, postback: `查看考生 ${task.id} ${student.id}` }));
  return {
    text: fallbackText,
    fallbackQuickReply: qr(externalNav(fallbackItems, `查看任務 ${task.id}`, '回任務')),
    lineMessage: {
      type: 'template',
      altText: `${task.equipment} 考生卡片名單（${students.length} 人）`,
      template: { type: 'carousel', columns },
      quickReply: qr(externalNav([
        ...navActions,
        { label: '查看點名結果', postback: `查看點名結果 ${task.id}` }
      ], `查看任務 ${task.id}`, '回任務'))
    }
  };
}

function attendanceBoard(task) {
  return candidateMenu(task);
}

function resultParts(result) {
  return {
    '全部通過': ['通過', '通過'], '僅簡答通過': ['通過', '未通過'],
    '僅簡答題通過': ['通過', '未通過'], '僅口頭問答通過': ['通過', '未通過'],
    '僅上機通過': ['未通過', '通過'], '未通過': ['未通過', '未通過'],
    '簡答通過': ['通過', '未記錄'], '簡答未通過': ['未通過', '未記錄'],
    '簡答題通過': ['通過', '未記錄'], '簡答題未通過': ['未通過', '未記錄'],
    '口頭問答通過': ['通過', '未記錄'], '口頭問答未通過': ['未通過', '未記錄'],
    '上機通過': ['未記錄', '通過'], '上機未通過': ['未記錄', '未通過'],
    '不適用': ['不適用', '不適用']
  }[result] || ['未記錄', '未記錄'];
}

const ATTENDANCE_HEADERS = ['紀錄ID','任務ID','日期','開始時間','階段','器材','學生ID','學生姓名','學號','出席狀態','簡答題結果','上機結果','總結果','操作考官','考官LINE User ID','記錄時間','累計簡答題結果','累計上機結果','保證金狀態'];

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
  const result = `累計結果：簡答題 ${certification.shortAnswer ? '✅ 通過' : '❌ 未通過'}｜上機 ${certification.practical ? '✅ 通過' : '❌ 未通過'}`;
  if (!showDeposit) return result;
  return `${result}\n保證金：${certification.refundable ? '✅ 可退保證金' : '❌ 不可退保證金'}`;
}

function examProgress(task, student) {
  const previous = certificationForStudent(task, student, `${task.id}:${student.id}`);
  const [sessionShort, sessionPractical] = resultParts(student.result);
  const shortRecorded = previous.shortAnswer || ['通過', '未通過'].includes(sessionShort);
  const shortPassed = previous.shortAnswer || sessionShort === '通過';
  const shortFailed = shortRecorded && !shortPassed;
  const practicalRecorded = shortFailed || previous.practical || ['通過', '未通過'].includes(sessionPractical);
  return {
    step: !shortRecorded ? 'short' : !practicalRecorded ? 'practical' : 'done',
    previous, sessionShort, sessionPractical, shortRecorded, practicalRecorded,
    shortPassed,
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
  if (shortAnswer === '通過' && practical === '未通過') return '僅簡答題通過';
  if (shortAnswer === '未通過' && practical === '通過') return '僅上機通過';
  if (shortAnswer === '未通過' && practical === '未通過') return '未通過';
  if (shortAnswer !== '未記錄') return shortAnswer === '通過' ? '簡答題通過' : '簡答題未通過';
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
  const shortFailed = shortEvaluated && !cumulativeShort;
  const disqualified = student.attendance === '取消資格';
  const depositStatus = disqualified ? '不可退保證金（取消資格）'
    : shortEvaluated && (practicalEvaluated || shortFailed) ? (refundable ? '可退保證金' : '不可退保證金') : '待兩項評分完成';
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
    { label: '簡答題 ✅', postback: `簡答登記 ${task.id} ${student.id} 通過` },
    { label: '簡答題 ❌', postback: `簡答登記 ${task.id} ${student.id} 未通過` }
  );
  if (progress.shortPassed && !progress.practicalRecorded) actions.push(
    { label: '上機 ✅', postback: `上機登記 ${task.id} ${student.id} 通過` },
    { label: '上機 ❌', postback: `上機登記 ${task.id} ${student.id} 未通過` }
  );
  actions.push(
    { label: '修改出席', postback: `修改出席 ${task.id} ${student.id}` },
    { label: '回考生名單', postback: `考生名單 ${task.id} 1` }
  );
  const stateText = (recorded, passed) => !recorded ? '⏳ 尚未評分' : passed ? '✅ 通過' : '❌ 未通過';
  const practicalText = progress.shortRecorded && !progress.shortPassed ? '⛔ 簡答題未通過，無上機資格' : stateText(progress.practicalRecorded, progress.practicalPassed);
  const depositText = progress.shortRecorded && progress.practicalRecorded
    ? `\n保證金：${progress.shortPassed && progress.practicalPassed ? '✅ 可退保證金' : '❌ 不可退保證金'}` : '';
  return reply(`【${task.equipment}｜第 ${position}/${total} 位】\n學生：${student.name}${student.number ? `（${student.number}）` : ''}\n出席：${student.attendance}\n\n簡答題：${stateText(progress.shortRecorded, progress.shortPassed)}\n上機：${practicalText}${depositText}\n\n${progress.step === 'done' ? '本次評分已完成。' : '請直接選擇簡答題或上機結果。'}`,
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
  const previousProgress = examProgress(task, student);
  if (part === 'practical' && previousProgress.shortRecorded && !previousProgress.shortPassed) return reply('這位考生的簡答題未通過，沒有上機考試資格。', externalNav([
    { label: '查看這位考生', postback: `查看考生 ${task.id} ${student.id}` },
    { label: '回考生名單', postback: `考生名單 ${task.id} 1` }
  ], `查看任務 ${task.id}`, '回任務'));
  const result = mergeExamPart(student.result, part, value === '通過');
  updateStudent(student, student.attendance, result);
  const certification = upsertAttendance(task, student, permission.name, context.userId);
  const progress = examProgress(task, student);
  if (progress.step === 'done') {
    const failedParts = !progress.shortPassed ? ['簡答題'] : !progress.practicalPassed ? ['上機'] : [];
    const needsRetest = failedParts.length > 0;
    const retest = retestForm(task);
    const notification = needsRetest && previousProgress.step !== 'done' ? notifyStudentForRetest(task, student, failedParts) : { sent: false, configured: Boolean(retest.url), finalAttempt: retest.finalAttempt };
    const feeReminder = retest.label === '第二次補考'
      ? '\n💰 第二次補考須繳交 100 元，且不退費；請考官一併提醒考生。'
      : retest.label === '第一次補考'
        ? '\n提醒：若第一次補考仍未通過，第二次補考須繳交 100 元且不退費。'
        : '';
    const examinerReminder = needsRetest
      ? `\n\n⚠️ 請考官務必提醒考生${retest.finalAttempt ? '本次為第二次補考，請依規定處理' : `填寫${retest.label}表單`}。\n未通過項目：${failedParts.join('、')}${feeReminder}\n${notification.sent ? '✅ 已私訊已綁定的考生。' : notification.finalAttempt ? 'ℹ️ 已是第二次補考，不再傳送補考表單。' : notification.configured ? 'ℹ️ 考生尚未完成 LINE 姓名綁定，請考官現場提醒。' : '⚠️ 尚未設定補考表單網址，暫時無法傳送表單。'}` : '';
    const formActions = needsRetest && retest.url ? [{ label: `開啟${retest.label}表單`, uri: retest.url }] : [];
    const practicalSummary = progress.shortPassed ? (progress.practicalPassed ? '✅ 通過' : '❌ 未通過') : '⛔ 無上機資格';
    return reply(`✅ ${student.name}本次評分完成\n\n簡答題：${progress.shortPassed ? '✅ 通過' : '❌ 未通過'}\n上機：${practicalSummary}\n\n保證金：${certification.refundable ? '✅ 可退保證金' : '❌ 不可退保證金'}${examinerReminder}`, externalNav([
      ...formActions,
      { label: '回考生卡片', postback: `考生名單 ${task.id} 1` },
      { label: '查看這位考生', postback: `查看考生 ${task.id} ${student.id}` }
    ], `查看任務 ${task.id}`, '回任務'));
  }
  const next = resultPrompt(task, student);
  next.text = `✅ ${student.name}的${part === 'short' ? '簡答題' : '上機'}已登記：${value}\n\n${next.text}`;
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
  return String(text || '').trim() === '我的任務';
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

function validFormUrl(value) {
  const url = String(value || '').trim();
  return /^https:\/\/(?:forms\.gle\/|docs\.google\.com\/forms\/)/.test(url) ? url : '';
}

function retestForm(task) {
  const phase = String(task?.phase || '');
  if (phase.includes('第二次補考')) return { url: '', label: '', finalAttempt: true };
  if (phase.includes('第一次補考')) {
    return { url: validFormUrl(process.env.EXTERNAL_SECOND_RETEST_FORM_URL || 'https://forms.gle/t1vrm4U43xMhoWxD9'), label: '第二次補考', finalAttempt: false };
  }
  return { url: validFormUrl(process.env.EXTERNAL_FIRST_RETEST_FORM_URL || process.env.EXTERNAL_RETEST_FORM_URL || 'https://forms.gle/3be87wRzRBKvdkFb6'), label: '第一次補考', finalAttempt: false };
}

function retestMessage(task, student, failedParts, label, url) {
  const feeNotice = label === '第二次補考'
    ? '\n\n💰 第二次補考須繳交 100 元，且不退費。'
    : '\n\n提醒：若第一次補考仍未通過，申請第二次補考須繳交 100 元，且不退費。';
  return `【${label}提醒】\n${student.name}你好，你的 ${task.equipment} 考試尚有項目未通過：${failedParts.join('、')}。\n\n請填寫${label}表單並留意後續分班通知。${feeNotice}\n報名連結：${url}`;
}

function notifyStudentForRetest(task, student, failedParts) {
  const form = retestForm(task);
  if (!form.url) return { sent: false, configured: false, finalAttempt: form.finalAttempt };
  const studentUserId = userIdForName(student.name, student.number);
  if (!studentUserId) return { sent: false, configured: true, finalAttempt: false };
  queuePush(studentUserId, reply(retestMessage(task, student, failedParts, form.label, form.url), [{ label: `填寫${form.label}表單`, uri: form.url }]));
  return { sent: true, configured: true, finalAttempt: false };
}

function studentRosterText(task) {
  const students = studentsFor(task.id);
  if (!students.length) return '考生：尚未安排';
  return `考生（${students.length} 人）：${students.map(student => student.name).join('、')}`;
}

function studentReminderText(task, student) {
  const time = `${formatTime(student.scheduledStart || task.start)}-${formatTime(student.scheduledEnd || task.end)}`;
  const attendanceRule = isExam(task)
    ? '⚠️ 請依個別時間準時到場；超過 5 分鐘將取消本次考試資格。'
    : '⚠️ 請依個別時間準時到場；開始後超過 15 分鐘完成點名將記為遲到。';
  return `⏰ 你的對外${task.phase}將於 1 小時內開始\n\n👤 ${student.name}\n📅 ${formatDate(task.date)} ${time}\n📝 ${task.equipment}\n📍 ${task.location || '地點未填'}\n\n${attendanceRule}`;
}

const DEPOSIT_LOG_HEADERS = ['提醒鍵','類型','學生姓名','學號','任務ID','提醒時間','狀態'];

function paidFlag(value) {
  if (value === true) return true;
  return /^(?:TRUE|是|已繳|已繳交|Y|YES|1)$/i.test(String(value ?? '').trim());
}

function depositRecordFor(student, phase = '考試', rows = depositRows()) {
  const phaseRows = rows.filter(row => row.phase === phase);
  const number = norm(student.number);
  if (number) return phaseRows.find(row => norm(row.number) === number) || null;
  const matches = phaseRows.filter(row => norm(row.name) === norm(student.name));
  return matches.length === 1 ? matches[0] : null;
}

function depositLogSheet() {
  const book = SpreadsheetApp.openById(ids.externalResults);
  let target = book.getSheetByName(SHEETS.depositReminders);
  if (!target) target = book.insertSheet(SHEETS.depositReminders);
  const rows = target.getDataRange().getValues();
  if (!rows.length || DEPOSIT_LOG_HEADERS.some((header, index) => rows[0][index] !== header)) {
    target.getRange(1, 1, 1, DEPOSIT_LOG_HEADERS.length).setValues([DEPOSIT_LOG_HEADERS]);
  }
  return target;
}

function depositLogKeys(target = depositLogSheet()) {
  return new Set(target.getDataRange().getValues().slice(1).map(row => String(row[0] || '')).filter(Boolean));
}

function logDepositAction(target, key, type, student, task, now, status) {
  target.appendRow([key, type, student.name, student.number, task?.id || '', now, status]);
}

function taipeiDate(value) {
  return Utilities.formatDate(value, Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

function dateAtTaipeiMidnight(value) {
  const raw = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const date = new Date(`${raw}T00:00:00+08:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function dayBeforeDate(value) {
  const date = new Date(value);
  date.setUTCDate(date.getUTCDate() - 1);
  return taipeiDate(date);
}

function earliestInitialExams() {
  const people = new Map();
  for (const task of allTasks().filter(task => task.phase === '考試' && ['已排定', '點名中'].includes(task.status))) {
    for (const student of studentsFor(task.id)) {
      const start = studentTaskStart(task, student);
      if (!start) continue;
      const key = norm(student.number) || `NAME:${norm(student.name)}`;
      const previous = people.get(key);
      if (!previous || start < previous.start) people.set(key, { task, student, start });
    }
  }
  return [...people.values()];
}

function depositReminderText(kind, task, student, deadline) {
  if (kind === 'deadline') return `【考試保證金提醒】\n${student.name}你好，目前對帳表仍顯示尚未繳交考試保證金。\n\n繳費期限：${formatDate(deadline)}\n最早考試：${formatDate(task.date)} ${formatTime(student.scheduledStart || task.start)}｜${task.equipment}\n\n請於期限內完成繳費；未繳者將取消考試資格。`;
  return `【考試前保證金提醒】\n${student.name}你好，目前對帳表仍顯示尚未繳交考試保證金。\n\n你的最早考試：${formatDate(task.date)} ${formatTime(student.scheduledStart || task.start)}｜${task.equipment}\n請最遲於考試前一天完成繳費；若考試開始前仍未繳交，將取消考試資格。`;
}

function setScheduleStudentStrikethrough(task, student, struck) {
  const match = String(student.sourceCell || '').match(/^([A-Z]+)(\d+)$/i);
  if (!match || !task.sourceSheet) return false;
  let column = 0;
  for (const character of match[1].toUpperCase()) column = column * 26 + character.charCodeAt(0) - 64;
  const sourceSheet = SpreadsheetApp.openById(ids.externalClassSchedule).getSheetByName(task.sourceSheet);
  if (!sourceSheet) return false;
  sourceSheet.getRange(Number(match[2]), column).setFontLine(struck ? 'line-through' : 'none');
  return true;
}

function restorePaidDepositCancellations(records, logSheet, logged, now) {
  const attendanceSheet = sheet(SHEETS.attendance);
  if (!attendanceSheet) return 0;
  const attendanceRows = attendanceSheet.getDataRange().getValues();
  const operatorByRecord = new Map(attendanceRows.slice(1).map(row => [String(row[0] || ''), String(row[13] || '')]));
  let restored = 0;
  for (const task of allTasks().filter(task => task.phase === '考試')) {
    for (const student of studentsFor(task.id, { includeDisqualified: true })) {
      if (student.attendance !== '取消資格' || operatorByRecord.get(`${task.id}:${student.id}`) !== '保證金未繳') continue;
      if (!depositRecordFor(student, '考試', records)?.paid) continue;
      const key = `DEPOSIT-RESTORE:${task.id}:${student.id}`;
      if (logged.has(key)) continue;
      updateStudent(student, '未點名', '未記錄');
      upsertAttendance(task, student, '保證金已確認', 'SYSTEM');
      setScheduleStudentStrikethrough(task, student, false);
      logDepositAction(logSheet, key, '恢復資格', student, task, now, '已繳交');
      logged.add(key); restored++;
    }
  }
  return restored;
}

function processDepositRequirements(now = new Date()) {
  const configuredDeadline = process.env.EXTERNAL_DEPOSIT_DEADLINE;
  const deadlineValue = !configuredDeadline || configuredDeadline === '2026-09-03' ? '2026-10-09' : configuredDeadline;
  const deadline = dateAtTaipeiMidnight(deadlineValue);
  if (!deadline) return { reminders: 0, canceled: 0 };
  const registrations = registrationRows();
  // A newly connected/temporarily empty response sheet must never wipe or
  // disqualify current students.
  if (!registrations.length) return { reminders: 0, canceled: 0, restored: 0, skipped: true };
  const registeredNumbers = new Set(registrations.map(item => norm(item.number)).filter(Boolean));
  const registeredNames = new Set(registrations.map(item => norm(item.name)).filter(Boolean));
  const isRegistered = student => norm(student.number)
    ? registeredNumbers.has(norm(student.number))
    : registeredNames.has(norm(student.name));
  const today = taipeiDate(now);
  const records = depositRows();
  const logSheet = depositLogSheet();
  const logged = depositLogKeys(logSheet);
  let reminders = 0, canceled = 0;
  const restored = restorePaidDepositCancellations(records, logSheet, logged, now);

  for (const entry of earliestInitialExams()) {
    const { task, student, start } = entry;
    if (!isRegistered(student)) continue;
    const record = depositRecordFor(student, '考試', records);
    if (record?.paid) continue;
    const personKey = norm(student.number) || `NAME-${norm(student.name)}`;
    const studentUserId = userIdForName(student.name, student.number);
    const remindersDue = [];
    if (today === dayBeforeDate(deadline)) remindersDue.push(['deadline', `DEPOSIT-DEADLINE:${personKey}:${taipeiDate(deadline)}`]);
    if (today === dayBeforeDate(start)) remindersDue.push(['exam-day-before', `DEPOSIT-EXAM:${personKey}:${taipeiDate(start)}`]);
    const pendingReminders = remindersDue.filter(([, key]) => !logged.has(key));
    if (pendingReminders.length && studentUserId) {
      const messageKind = pendingReminders.some(([kind]) => kind === 'exam-day-before') ? 'exam-day-before' : 'deadline';
      queuePush(studentUserId, reply(depositReminderText(messageKind, task, student, deadline)));
      for (const [kind, key] of pendingReminders) {
        logDepositAction(logSheet, key, kind, student, task, now, '已合併推播');
        logged.add(key);
      }
      reminders++;
    }
  }

  if (now < deadline) return { reminders, canceled, restored };
  for (const task of allTasks().filter(task => task.phase === '考試' && ['已排定', '點名中'].includes(task.status))) {
    for (const student of studentsFor(task.id)) {
      if (!isRegistered(student) || student.attendance !== '未點名') continue;
      if (depositRecordFor(student, '考試', records)?.paid) continue;
      const key = `DEPOSIT-CANCEL:${task.id}:${student.id}`;
      if (logged.has(key)) continue;
      updateStudent(student, '取消資格', '不適用');
      upsertAttendance(task, student, '保證金未繳', 'SYSTEM');
      setScheduleStudentStrikethrough(task, student, true);
      const studentUserId = userIdForName(student.name, student.number);
      const message = `【考試資格取消】\n${student.name}你好，因考試開始前對帳表仍顯示未繳交保證金，本次 ${task.equipment} 考試資格已取消。\n\n如仍需參加考試，請直接聯絡影音實驗室。`;
      if (studentUserId) queuePush(studentUserId, reply(message));
      const examinerUserId = userIdForName(task.examiner) || task.examinerUserId;
      if (examinerUserId) queuePush(examinerUserId, reply(`🚫 ${student.name} 因未繳交保證金，已取消 ${task.equipment} 考試資格。若學生仍需考試，請其聯絡影音實驗室。`));
      logDepositAction(logSheet, key, '取消資格', student, task, now, '保證金未繳');
      logged.add(key); canceled++;
    }
  }
  return { reminders, canceled, restored };
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
  const deposit = processDepositRequirements(now);
  expireExamQualifications(now);
  const activeGroups = groups().filter(group => group.enabled === '是' && group.scope === '對外教學');
  let sent = 0;
  for (const task of allTasks()) {
    if (!['已排定', '點名中'].includes(task.status)) continue;
    const start = parseTaskStart(task); if (!start) continue;
    if (!enabledFlag(task.twoHours)) continue;
    const reminderDue = new Date(start.getTime() - REMINDER_LEAD_MINUTES * 60000);

    const buttons = [
      { label: '開始聊天室點名', text: `開始點名 ${task.id}` },
      { label: '查看任務', text: `查看任務 ${task.id}` }
    ];
    const roster = studentRosterText(task);
    const examinerUserId = userIdForName(task.examiner) || task.examinerUserId;
    const targetGroups = task.groupId ? activeGroups.filter(group => group.id === task.groupId) : activeGroups;
    let taskSent = false;

    if (!task.twoHoursSentAt && start > now && now >= reminderDue) {
      if (examinerUserId) {
        queuePush(examinerUserId, reply(`⏰ 你的對外任務將於 1 小時內開始\n\n${taskText(task)}\n\n${roster}`, buttons));
        sent++; taskSent = true;
      }
      for (const group of targetGroups) {
        queuePush(group.id, reply(`📣 對外工作坊將於 1 小時內開始\n\n${taskText(task)}\n\n${roster}\n\n請考生準時到場；考官可由下方按鈕開始點名。`, buttons));
        sent++; taskSent = true;
      }
      if (taskSent) sheet(SHEETS.tasks).getRange(task.row, 16).setValue(now);
    }

    for (const student of studentsFor(task.id)) {
      const studentStart = studentTaskStart(task, student);
      if (!studentStart || studentStart <= now || student.reminderSentAt || now < new Date(studentStart.getTime() - REMINDER_LEAD_MINUTES * 60000)) continue;
      const studentUserId = userIdForName(student.name, student.number);
      if (!studentUserId) continue;
      queuePush(studentUserId, reply(studentReminderText(task, student)));
      sheet(SHEETS.students).getRange(student.row, 11).setValue(now);
      sent++;
    }
  }
  return sent + deposit.reminders;
}

function joinReply() {
  return reply('👋 我可以提供兩種群組提醒：\n\n1️⃣ 對外教學／考試與點名\n輸入「綁定群組 群組名稱」\n\n2️⃣ 1151 教學總排程\n輸入「綁定教學群組 群組名稱」');
}

module.exports = { handleCommand, sendExternalReminders, disableGroup, joinReply, syncFromSchedule, onExaminerChangeFormSubmit, processPendingExaminerChanges, isExternalCommand, requiresFreshData, isCombinedTaskQuery, _test: { comparable, rowChanged, reminderBelongsToSchedule, parseTaskStart, automaticArrivalStatus, retestForm, retestMessage, studentReminderText, rosterStudents, enrichStudentsFromRoster, paidFlag, depositRecordFor, syncDepositFromRegistrations, dayBeforeDate, processDepositRequirements, setScheduleStudentStrikethrough, studentsFor, dateKey, editDistance, namesSimilar, replaceExaminerName, replaceExternalExaminer, userIdForExaminerName } };
