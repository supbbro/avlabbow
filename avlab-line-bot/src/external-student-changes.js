'use strict';

const crypto = require('crypto');
const { ids } = require('./config');
const { parseWorkbook, parseDateCell, parseTimeRange } = require('./external-schedule-parser');

const RESPONSE_SHEET = '表單回覆 1';
const LOG_SHEET = '分班更改同步紀錄';
const LOG_HEADERS = ['處理鍵', '表單列', '送出時間', '姓名', '學號', '項目', '原時段', '新時段', '同步狀態', '最後處理時間'];
const SOURCE_TABS = ['教學週分班表I', '教學週分班表II', '侯班影製提前考試週', '考試週分班表I', '考試週分班表II', '第一次補考週分班表', '第二次補考週分班表'];

const text = value => String(value ?? '').trim();
const norm = value => text(value).replace(/[（(][^）)]*[）)]/g, '').replace(/\s+/g, '').toLowerCase();

function editDistance(left, right) {
  const a = norm(left), b = norm(right);
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
  const a = norm(left), b = norm(right);
  if (!a || !b) return false;
  return a === b || (Math.min(a.length, b.length) >= 3 && editDistance(a, b) <= 1);
}

function equipmentKey(value) {
  const key = text(value).toLowerCase()
    .replace(/新聞館影棚|考試|教學|課程|器材|螢幕|組/g, '')
    .replace(/[^a-z0-9\u3400-\u9fffα]/g, '');
  if (/^(?:a7sii|α7sii|a7s2|α7s2)$/.test(key)) return 'a7sii';
  if (/^(?:a7siii|α7siii|a7s3|α7s3)$/.test(key)) return 'a7s3';
  if (key.includes('atomos')) return 'atomos';
  if (/par.*200|200.*par/.test(key)) return 'par200w';
  if (key.includes('cx350棚內機') || key.includes('棚內機cx350')) return '棚內機';
  if (key.includes('teradek')) return 'teradek';
  if (key.includes('dwarf')) return 'dwarf';
  if (key.includes('vortex')) return 'vortex';
  if (key.includes('arri') || key.includes('s60pro')) return 'arris60pro';
  if (key.includes('flo')) return 'flobox';
  if (key.includes('zoom350')) return 'zoom350';
  if (key.includes('lithled')) return 'lithled';
  return key;
}

function dateKey(value) {
  let date = value instanceof Date ? value : null;
  if (!date) {
    const raw = text(value);
    const full = raw.match(/(\d{4})\s*[/-]\s*(\d{1,2})\s*[/-]\s*(\d{1,2})/);
    date = full ? new Date(Number(full[1]), Number(full[2]) - 1, Number(full[3])) : parseDateCell(raw, process.env.ACADEMIC_TERM || '1151');
  }
  if (!date || Number.isNaN(date.getTime())) return '';
  return Utilities.formatDate(date, Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

function parseSlot(value) {
  const raw = text(value).replace(/[–—]/g, '-');
  const date = parseDateCell(raw, process.env.ACADEMIC_TERM || '1151');
  const time = parseTimeRange(raw);
  if (!date || !time) return null;
  const minutes = clock => {
    const match = String(clock).match(/(\d{1,2}):(\d{2})/);
    return match ? Number(match[1]) * 60 + Number(match[2]) : NaN;
  };
  return { date: dateKey(date), start: minutes(time.start), end: minutes(time.end), raw };
}

function canonicalHeader(value) {
  return text(value).replace(/\s+/g, '').replace(/考試修原時段/g, '考試原時段');
}

function headerIndex(headers, name, start = 0) {
  const target = canonicalHeader(name);
  return headers.findIndex((header, index) => index >= start && canonicalHeader(header) === target);
}

function operationKey(operation) {
  return crypto.createHash('sha1').update([
    operation.timestamp, operation.number, operation.name, operation.label, operation.oldValue, operation.newValue
  ].join('|')).digest('hex').slice(0, 20).toUpperCase();
}

function parseChangeRows(rows) {
  if (!Array.isArray(rows) || rows.length < 2) return [];
  const headers = rows[0] || [];
  const firstName = headerIndex(headers, '姓名');
  const firstNumber = headerIndex(headers, '學號');
  const secondName = headerIndex(headers, '姓名', firstName + 1);
  const secondNumber = headerIndex(headers, '學號', firstNumber + 1);
  const cancelAll = headers.findIndex(header => canonicalHeader(header).startsWith('【取消報名】'));
  const pairs = [];
  headers.forEach((header, index) => {
    const normalized = canonicalHeader(header);
    if (!/(?:原報名時段|原時段)$/.test(normalized)) return;
    const next = canonicalHeader(headers[index + 1]);
    if (!/修改時段$/.test(next)) return;
    const label = normalized.replace(/(?:原報名時段|原時段)$/, '');
    pairs.push({ oldIndex: index, newIndex: index + 1, label });
  });

  const operations = [];
  rows.slice(1).forEach((row, offset) => {
    if (!row?.[0]) return;
    const timestamp = row[0];
    const name = text(row[firstName]) || text(row[secondName]);
    const number = text(row[firstNumber]) || text(row[secondNumber]);
    for (const pair of pairs) {
      const oldValue = text(row[pair.oldIndex]);
      const newValue = text(row[pair.newIndex]);
      if (!oldValue || !newValue) continue;
      const operation = {
        row: offset + 2, timestamp, name, number, label: pair.label,
        phase: /教學|課程/.test(pair.label) && !/考試/.test(pair.label) ? '教學' : '考試',
        equipment: equipmentKey(pair.label), oldValue, newValue,
        cancel: /取消報名/.test(newValue), cancelAll: false
      };
      operation.key = operationKey(operation);
      operations.push(operation);
    }
    if (cancelAll >= 0 && text(row[cancelAll]) && name && !pairs.some(pair => text(row[pair.oldIndex]) && text(row[pair.newIndex]))) {
      const operation = {
        row: offset + 2, timestamp, name, number, label: '全部尚未開始場次', phase: '', equipment: '',
        oldValue: '全部尚未開始場次', newValue: '取消報名', cancel: true, cancelAll: true
      };
      operation.key = operationKey(operation);
      operations.push(operation);
    }
  });
  return operations;
}

function columnIndex(letters) {
  return [...String(letters || '').toUpperCase()].reduce((sum, letter) => sum * 26 + letter.charCodeAt(0) - 64, 0) - 1;
}

function columnName(index) {
  let result = '';
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) result = String.fromCharCode(65 + ((n - 1) % 26)) + result;
  return result;
}

function isLighting(equipment) {
  return /燈|par|flo|arri|vortex|zoom|lith|litepanels|kino/i.test(text(equipment));
}

function scheduleSnapshot() {
  const book = SpreadsheetApp.openById(ids.externalClassSchedule);
  const sheets = {};
  for (const name of SOURCE_TABS) {
    const source = book.getSheetByName(name);
    if (source) sheets[name] = source.getDataRange().getValues();
  }
  return { book, sheets, tasks: parseWorkbook(sheets, process.env.ACADEMIC_TERM || '1151') };
}

function taskColumn(task) {
  const match = text(task.sourceRange).match(/^([A-Z]+)(\d+):/i);
  return match ? { column: columnIndex(match[1]), itemRow: Number(match[2]) } : null;
}

function taskMatches(task, operation, slot) {
  return task.phase === operation.phase
    && equipmentKey(task.equipment) === operation.equipment
    && dateKey(task.date) === slot.date;
}

function validTargetRows(task, data, slot) {
  const position = taskColumn(task);
  if (!position) return [];
  const startRow = position.itemRow + 3;
  let endRow = data.length;
  for (let row = startRow; row <= data.length; row++) {
    if (text(data[row - 1]?.[0]) === '項目') { endRow = row - 1; break; }
  }
  const timeColumn = isLighting(task.equipment) ? 1 : 0;
  const rows = [];
  for (let row = startRow; row <= endRow; row++) {
    const time = parseTimeRange(data[row - 1]?.[timeColumn]);
    if (!time) continue;
    const start = Number(time.start.slice(0, 2)) * 60 + Number(time.start.slice(3));
    const end = Number(time.end.slice(0, 2)) * 60 + Number(time.end.slice(3));
    if (start >= slot.start && end <= slot.end) rows.push(row);
  }
  return rows;
}

function matchingStudent(task, name) {
  return task.students.find(student => namesSimilar(student.name, name)) || null;
}

function updateLog(logSheet, existing, operation, status) {
  const values = [operation.key, operation.row, operation.timestamp, operation.name, operation.number,
    operation.label, operation.oldValue, operation.newValue, status, new Date()];
  if (existing) {
    if (text(existing.status) !== status) logSheet.getRange(existing.row, 1, 1, values.length).setValues([values]);
    existing.status = status;
    return;
  }
  logSheet.appendRow(values);
}

function cancelAllFuture(operation, snapshot) {
  const submittedDate = dateKey(operation.timestamp);
  const removals = [];
  for (const task of snapshot.tasks) {
    if (dateKey(task.date) < submittedDate) continue;
    const student = matchingStudent(task, operation.name);
    if (!student?.sourceCell) continue;
    const match = student.sourceCell.match(/^([A-Z]+)(\d+)$/i);
    if (!match) continue;
    snapshot.book.getSheetByName(task.sourceSheet).getRange(Number(match[2]), columnIndex(match[1]) + 1).setValue('');
    removals.push(`${task.sourceSheet}!${student.sourceCell}`);
  }
  return removals;
}

function applyChange(operation) {
  const snapshot = scheduleSnapshot();
  if (operation.cancelAll) {
    const removals = cancelAllFuture(operation, snapshot);
    return { changed: removals.length > 0, status: removals.length ? `已同步：取消 ${removals.length} 個尚未開始場次` : '略過：未找到尚未開始的場次' };
  }

  const oldSlot = parseSlot(operation.oldValue);
  if (!oldSlot) return { changed: false, status: '待人工處理：無法解析原時段' };
  const oldTasks = snapshot.tasks.filter(task => taskMatches(task, operation, oldSlot));
  const oldMatch = oldTasks.map(task => ({ task, student: matchingStudent(task, operation.name) })).find(item => item.student);

  if (operation.cancel) {
    if (!oldMatch?.student?.sourceCell) return { changed: false, status: '略過：原場次已無此學生' };
    const cell = oldMatch.student.sourceCell.match(/^([A-Z]+)(\d+)$/i);
    snapshot.book.getSheetByName(oldMatch.task.sourceSheet).getRange(Number(cell[2]), columnIndex(cell[1]) + 1).setValue('');
    return { changed: true, status: `已同步：取消 ${oldMatch.task.sourceSheet}!${oldMatch.student.sourceCell}` };
  }

  const newSlot = parseSlot(operation.newValue);
  if (!newSlot) return { changed: false, status: '待人工處理：無法解析新時段' };
  const target = snapshot.tasks.find(task => taskMatches(task, operation, newSlot));
  if (!target) return { changed: false, status: '待人工處理：找不到新場次' };
  const alreadyAtTarget = matchingStudent(target, operation.name);
  if (!oldMatch && alreadyAtTarget) return { changed: false, status: '略過：已人工同步完成' };
  if (!oldMatch?.student?.sourceCell) return { changed: false, status: '待人工處理：找不到原場次中的學生' };

  const targetData = snapshot.sheets[target.sourceSheet];
  const targetPosition = taskColumn(target);
  const candidateRows = validTargetRows(target, targetData, newSlot);
  const targetRow = alreadyAtTarget
    ? Number(alreadyAtTarget.sourceCell.match(/\d+/)?.[0] || 0)
    : candidateRows.find(row => !text(targetData[row - 1]?.[targetPosition.column]));
  if (!targetRow) return { changed: false, status: '待人工處理：新時段已滿' };

  const oldCell = oldMatch.student.sourceCell.match(/^([A-Z]+)(\d+)$/i);
  const targetSheet = snapshot.book.getSheetByName(target.sourceSheet);
  const oldSheet = snapshot.book.getSheetByName(oldMatch.task.sourceSheet);
  if (!alreadyAtTarget) targetSheet.getRange(targetRow, targetPosition.column + 1).setValue(operation.name);
  if (oldMatch.task.sourceSheet !== target.sourceSheet || Number(oldCell[2]) !== targetRow || columnIndex(oldCell[1]) !== targetPosition.column) {
    oldSheet.getRange(Number(oldCell[2]), columnIndex(oldCell[1]) + 1).setValue('');
  }
  const targetCell = `${columnName(targetPosition.column)}${targetRow}`;
  return { changed: true, status: `已同步：${oldMatch.task.sourceSheet}!${oldMatch.student.sourceCell} → ${target.sourceSheet}!${targetCell}` };
}

function processPendingStudentChanges({ syncSchedule } = {}) {
  const response = SpreadsheetApp.openById(ids.externalStudentChange).getSheetByName(RESPONSE_SHEET);
  if (!response) return { processed: 0, changed: 0, waiting: 0 };
  const resultsBook = SpreadsheetApp.openById(ids.externalResults);
  const logSheet = resultsBook.getSheetByName(LOG_SHEET);
  if (!logSheet) throw new Error(`找不到「${LOG_SHEET}」工作表`);
  const logRows = logSheet.getDataRange().getValues();
  if (!logRows.length) logSheet.appendRow(LOG_HEADERS);
  else if (LOG_HEADERS.some((header, index) => logRows[0][index] !== header)) logSheet.getRange(1, 1, 1, LOG_HEADERS.length).setValues([LOG_HEADERS]);
  const logs = new Map(logRows.slice(1).map((row, index) => [text(row[0]), { row: index + 2, status: row[8] }]));
  const operations = parseChangeRows(response.getDataRange().getValues());
  let processed = 0, changed = 0, waiting = 0;
  for (const operation of operations) {
    const existing = logs.get(operation.key);
    if (existing && /^(?:已同步|略過)/.test(text(existing.status))) continue;
    const outcome = applyChange(operation);
    updateLog(logSheet, existing, operation, outcome.status);
    if (!existing) logs.set(operation.key, { row: logSheet.getLastRow(), status: outcome.status });
    processed++;
    if (outcome.changed) changed++;
    if (/^待人工處理/.test(outcome.status)) waiting++;
  }
  if (changed && typeof syncSchedule === 'function') syncSchedule();
  return { processed, changed, waiting };
}

module.exports = {
  processPendingStudentChanges,
  _test: { parseChangeRows, parseSlot, equipmentKey, validTargetRows, namesSimilar, applyChange }
};
