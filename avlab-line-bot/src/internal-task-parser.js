'use strict';

const clean = value => String(value ?? '').replace(/\r/g, '').trim();

function academicYear(term) {
  const match = String(term || '').match(/^(\d{3})/);
  return match ? Number(match[1]) + 1911 : new Date().getFullYear();
}

function parseDate(value, term) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return new Date(value);
  const match = clean(value).match(/(\d{1,2})\s*[\/.-]\s*(\d{1,2})/);
  if (!match) return null;
  return new Date(academicYear(term), Number(match[1]) - 1, Number(match[2]));
}

function parseAssignment(value) {
  const raw = clean(value);
  const locationMatch = raw.match(/[（(]\s*([^（）()]+?)\s*[）)]\s*$/);
  const location = locationMatch ? clean(locationMatch[1]) : '';
  const namesPart = clean(locationMatch ? raw.slice(0, locationMatch.index) : raw);
  const names = namesPart.split(/[、,，/／\n]+/).map(clean).filter(Boolean);
  return { names, location };
}

function headerIndex(row, patterns) {
  return row.findIndex(cell => patterns.some(pattern => pattern.test(clean(cell))));
}

function parseSheet(rows, term) {
  const source = Array.isArray(rows) ? rows : [];
  const headerRow = source.findIndex(row => {
    const cells = (row || []).map(clean);
    return cells.some(cell => /^(日期|時程)$/.test(cell)) && cells.some(cell => /級別/.test(cell)) && cells.some(cell => /項目/.test(cell));
  });
  if (headerRow < 0) return [];

  const header = source[headerRow] || [];
  const scheduleCol = headerIndex(header, [/^日期$/, /^時程$/]);
  const phaseCol = headerIndex(header, [/^階段$/]);
  const levelCol = headerIndex(header, [/級別/]);
  const itemCol = headerIndex(header, [/項目/]);
  const assignmentCol = headerIndex(header, [/教學官/, /考官/]);
  if ([scheduleCol, levelCol, itemCol, assignmentCol].some(index => index < 0)) return [];

  let lastDate = null;
  let lastPhase = '';
  const tasks = [];
  for (const row of source.slice(headerRow + 1)) {
    const schedule = clean(row?.[scheduleCol]);
    const phase = phaseCol >= 0 ? clean(row?.[phaseCol]) : '';
    const parsedDate = parseDate(schedule, term);
    if (parsedDate) lastDate = parsedDate;
    if (phase) lastPhase = phase;
    if (phaseCol < 0 && schedule) {
      const phaseMatch = schedule.match(/([^\n]*?(?:教學|檢定|考試))/);
      if (phaseMatch) lastPhase = clean(phaseMatch[1]);
    }

    const level = clean(row?.[levelCol]);
    const item = clean(row?.[itemCol]);
    const { names, location } = parseAssignment(row?.[assignmentCol]);
    if (!lastDate || !level || !item || !names.length) continue;
    for (const name of names) tasks.push([new Date(lastDate), lastPhase, level, item, name, location]);
  }
  return tasks;
}

function parseInternalTaskWorkbook(workbookSheets, term = '1151') {
  const candidates = Object.values(workbookSheets || {}).map(rows => parseSheet(rows, term));
  const tasks = candidates.reduce((best, current) => current.length > best.length ? current : best, []);
  return [['日期', '階段', '級別', '項目', '教學官／考官', '地點'], ...tasks];
}

module.exports = { parseInternalTaskWorkbook, parseAssignment, parseDate };
