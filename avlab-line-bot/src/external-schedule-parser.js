'use strict';

const crypto = require('crypto');

const normalizeName = value => String(value || '').replace(/[（(][^）)]*[）)]/g, '').replace(/\s+/g, '').trim();
const text = value => String(value || '').trim();
const usableName = value => {
  const name = text(value);
  return name && !['-', '—', '停開'].includes(name) && !/停課|補假|未通過|未標記/.test(name);
};
const columnName = index => {
  let result = '';
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) result = String.fromCharCode(65 + ((n - 1) % 26)) + result;
  return result;
};
const shortHash = value => crypto.createHash('sha1').update(value).digest('hex').slice(0, 10).toUpperCase();

function termInfo(term) {
  const match = String(term || '').match(/^(\d{3})([12])$/);
  const rocYear = Number(match?.[1] || 115);
  return { term: match ? match[0] : '1151', baseYear: rocYear + 1911, semester: Number(match?.[2] || 1) };
}

function parseDateCell(value, term) {
  if (value instanceof Date) return new Date(value);
  const match = text(value).match(/(\d{1,2})\s*\/\s*(\d{1,2})/);
  if (!match) return null;
  const month = Number(match[1]), day = Number(match[2]);
  const info = termInfo(term);
  const year = info.semester === 1 ? info.baseYear + (month <= 1 ? 1 : 0) : info.baseYear + 1;
  return new Date(year, month - 1, day);
}

function parseTimeRange(value) {
  const matches = [...text(value).matchAll(/(\d{1,2}):(\d{2})/g)];
  if (!matches.length) return null;
  const start = `${matches[0][1].padStart(2, '0')}:${matches[0][2]}`;
  const last = matches[matches.length - 1];
  return { start, end: `${last[1].padStart(2, '0')}:${last[2]}` };
}

function makeTask({ term, sheetName, itemRow, column, phase, date, time, equipment, location, examiner, students }) {
  const id = `EXT-${term}-${shortHash(`${sheetName}|${itemRow}|${column}`)}`;
  return {
    id, term, phase, date, start: time.start, end: time.end, equipment: text(equipment), location: text(location), examiner: text(examiner),
    sourceSheet: sheetName, sourceRange: `${columnName(column)}${itemRow + 1}:${columnName(column)}${itemRow + 1 + students.length + 3}`,
    students: students.map((student, index) => {
      const name = typeof student === 'object' ? student.name : student;
      return {
        id: `STU-${shortHash(`${id}|${normalizeName(name)}`)}`, name: text(name), number: '', order: index + 1,
        scheduledStart: typeof student === 'object' ? student.start : time.start,
        scheduledEnd: typeof student === 'object' ? student.end : time.end
      };
    })
  };
}

function parseTeachingSheet(data, sheetName, term) {
  if (!Array.isArray(data) || data.length < 7) return [];
  const dateRow = data[1] || [];
  const timeRows = [];
  data.forEach((row, index) => { if (text(row?.[0]) === '時間') timeRows.push(index); });
  const tasks = [];
  for (let block = 0; block < timeRows.length; block++) {
    const timeRow = timeRows[block], itemRow = timeRow + 1, endRow = timeRows[block + 1] ?? data.length;
    const width = Math.max(dateRow.length, data[timeRow]?.length || 0, data[itemRow]?.length || 0);
    for (let column = 1; column < width; column++) {
      const date = parseDateCell(dateRow[column], term);
      const time = parseTimeRange(data[timeRow]?.[column]);
      const equipment = data[itemRow]?.[column];
      const examiner = data[itemRow + 2]?.[column];
      if (!date || !time || !text(equipment) || !usableName(examiner)) continue;
      const students = [];
      for (let row = itemRow + 3; row < endRow; row++) if (usableName(data[row]?.[column])) students.push(data[row][column]);
      tasks.push(makeTask({ term, sheetName, itemRow, column, phase: '教學', date, time, equipment, location: data[itemRow + 1]?.[column], examiner, students }));
    }
  }
  return tasks;
}

function isLighting(equipment) {
  return /燈|Par|Flo|ARRI|Vortex|Zoom|Lith|Litepanels|Kino/i.test(text(equipment));
}

function examBlockTime(data, startRow, endRow, equipment) {
  const timeColumn = isLighting(equipment) ? 1 : 0;
  const times = [];
  for (let row = startRow; row < endRow; row++) {
    const range = parseTimeRange(data[row]?.[timeColumn]);
    if (range) times.push(range);
  }
  return times.length ? { start: times[0].start, end: times[times.length - 1].end } : null;
}

function phaseForSheet(sheetName) {
  if (sheetName.includes('第一次補考')) return '第一次補考';
  if (sheetName.includes('第二次補考')) return '第二次補考';
  return '考試';
}

function parseExamSheet(data, sheetName, term) {
  if (!Array.isArray(data) || data.length < 6) return [];
  const dateHeaders = [];
  let currentDate = null;
  const width = data.reduce((max, row) => Math.max(max, row?.length || 0), 0);
  for (let column = 2; column < width; column++) {
    const candidate = parseDateCell(data[1]?.[column], term);
    if (candidate) currentDate = candidate;
    dateHeaders[column] = currentDate ? new Date(currentDate) : null;
  }
  const itemRows = [];
  data.forEach((row, index) => { if (text(row?.[0]) === '項目') itemRows.push(index); });
  const tasks = [];
  for (let block = 0; block < itemRows.length; block++) {
    const itemRow = itemRows[block], studentStart = itemRow + 3, endRow = itemRows[block + 1] ?? data.length;
    for (let column = 2; column < width; column++) {
      const equipment = data[itemRow]?.[column], examiner = data[itemRow + 2]?.[column], date = dateHeaders[column];
      if (!date || !text(equipment) || !usableName(examiner)) continue;
      const time = examBlockTime(data, studentStart, endRow, equipment);
      if (!time) continue;
      const students = [];
      const timeColumn = isLighting(equipment) ? 1 : 0;
      for (let row = studentStart; row < endRow; row++) {
        if (!usableName(data[row]?.[column])) continue;
        const studentTime = parseTimeRange(data[row]?.[timeColumn]) || time;
        students.push({ name: data[row][column], start: studentTime.start, end: studentTime.end });
      }
      tasks.push(makeTask({ term, sheetName, itemRow, column, phase: phaseForSheet(sheetName), date, time, equipment, location: data[itemRow + 1]?.[column], examiner, students }));
    }
  }
  return tasks;
}

function parseWorkbook(sheets, term = process.env.ACADEMIC_TERM || '1151') {
  const tasks = [];
  for (const [sheetName, data] of Object.entries(sheets || {})) {
    if (/^教學週分班表/.test(sheetName)) tasks.push(...parseTeachingSheet(data, sheetName, term));
    else if (/考試週分班表|補考週分班表/.test(sheetName)) tasks.push(...parseExamSheet(data, sheetName, term));
  }
  return tasks;
}

module.exports = { parseWorkbook, parseTeachingSheet, parseExamSheet, parseDateCell, parseTimeRange };
