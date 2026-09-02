'use strict';

const ROSTER_SHEET = process.env.EXTERNAL_ROSTER_SHEET_NAME || '1151修課名單';
const MATRIX_SHEET = process.env.EXTERNAL_MATRIX_SHEET_NAME || '1142課程考試對照';
const LOG_SHEET = 'LINE點名紀錄';
const COURSE_COLUMNS = [0, 5, 10, 15, 20, 25];
const PASS = '通過';
const RETEST = '要補考';
const DEPOSIT_DISQUALIFIED = '保證金未繳';
const COLORS = {
  [PASS]: { red: 0.7137255, green: 0.84313726, blue: 0.65882355 },
  [RETEST]: { red: 0.9764706, green: 0.79607844, blue: 0.6117647 },
  [DEPOSIT_DISQUALIFIED]: { red: 0.9764706, green: 0.79607844, blue: 0.6117647 }
};
const lastApplied = new Map();

const text = value => String(value ?? '').trim();
const compact = value => text(value).normalize('NFKC').replace(/[\s\-_/／・·・（）()]/g, '').toUpperCase();
const groupLabel = value => /^(?:第)?(?:[0-9]+|[一二三四五六七八九十]+)組(?:[、,，](?:第)?(?:[0-9]+|[一二三四五六七八九十]+)組)*$/.test(text(value));

function canonicalEquipment(value) {
  const key = compact(value).replace(/(?:考試|教學)$/u, '');
  if (key.includes('基礎配件課程')) return '基礎配件課程';
  if (key.includes('聲音工作區')) return '聲音工作區';
  if (['ATOMOS', 'ATOMOS螢幕'].includes(key)) return 'ATOMOS';
  if (['VORTEX4S8S', 'V4V8'].includes(key)) return 'V4V8';
  if (['200WPAR', 'PAR200W', '200PAR', 'PAR200'].includes(key)) return 'PAR200W';
  return key;
}

function logEquipmentKey(equipment, phase) {
  const base = canonicalEquipment(equipment);
  if (!base) return '';
  const teaching = text(phase) === '教學';
  if (base === '基礎配件課程') return base;
  if (base === '聲音工作區') return `${base}:${teaching ? '教學' : '考試'}`;
  return teaching ? '' : base;
}

function headerEquipmentKey(header) {
  const raw = text(header);
  const base = canonicalEquipment(raw);
  if (!base) return '';
  if (base === '聲音工作區') return `${base}:${raw.includes('教學') ? '教學' : '考試'}`;
  return base;
}

function parseRosterGroups(rows) {
  const groups = [];
  for (const column of COURSE_COLUMNS) {
    const course = text(rows[0]?.[column]);
    if (!course) continue;
    let section = course;
    let current = null;
    for (let row = 1; row < rows.length; row++) {
      const value = text(rows[row]?.[column]);
      if (groupLabel(value)) {
        current = { course: section, group: value, members: [] };
        groups.push(current);
        continue;
      }
      const studentId = text(rows[row]?.[column + 1]);
      if (current && value && studentId) current.members.push({ name: value, studentId });
      else if (value && !studentId) { section = value; current = null; }
    }
  }
  return groups.filter(group => group.members.length);
}

function outcomeMap(logRows) {
  const outcomes = new Map();
  for (const row of logRows.slice(1)) {
    if (!text(row[0]) || text(row[0]).startsWith('_TEMPLATE')) continue;
    const name = compact(row[7]);
    const phase = text(row[4]);
    const equipment = logEquipmentKey(row[5], phase);
    if (!name || !equipment) continue;
    const attendance = text(row[9]);
    const operator = text(row[13]);
    const deposit = text(row[18]);
    const cumulativeShort = text(row[16]);
    const cumulativePractical = text(row[17]);
    const key = `${name}|${equipment}`;
    const previous = outcomes.get(key);
    let status = '';
    if (phase === '教學') {
      if (['到場', '遲到'].includes(attendance)) status = PASS;
      else if (['請假', '缺席', '取消資格'].includes(attendance)) status = RETEST;
    } else if (attendance === '取消資格' && operator === DEPOSIT_DISQUALIFIED) {
      status = DEPOSIT_DISQUALIFIED;
    } else if ((cumulativeShort === PASS && cumulativePractical === PASS) || deposit === '可退保證金') {
      status = PASS;
    } else if (['請假', '缺席', '取消資格'].includes(attendance) || deposit.startsWith('不可退保證金')) {
      status = RETEST;
    }
    if (!status) continue;
    // A later deposit cancellation must visibly override an older pass; a later
    // valid pass can in turn clear the strike-through.
    if (status === PASS || status === DEPOSIT_DISQUALIFIED || previous !== PASS) outcomes.set(key, status);
  }
  return outcomes;
}

function courseMatches(selectedCourse, course) {
  return compact(selectedCourse).includes(compact(course));
}

function planMatrix(rosterRows, matrixRows, logRows) {
  const groups = parseRosterGroups(rosterRows);
  const outcomes = outcomeMap(logRows);
  const memberships = [];
  const seenMemberships = new Set();
  for (const group of groups) for (const member of group.members) {
    const key = `${compact(member.studentId)}|${compact(group.course)}`;
    if (seenMemberships.has(key)) continue;
    seenMemberships.add(key);
    memberships.push({ ...member, course: group.course, group: group.group });
  }

  const augmentedRows = matrixRows.map(row => row.slice());
  const missing = [];
  const fieldUpdates = [];
  const rowForMembership = new Map();
  const claimedRows = new Set();
  const coursesByStudent = new Map();
  for (const member of memberships) {
    const studentKey = compact(member.studentId);
    if (!coursesByStudent.has(studentKey)) coursesByStudent.set(studentKey, []);
    coursesByStudent.get(studentKey).push(member.course);
  }
  for (const member of memberships) {
    const studentKey = compact(member.studentId);
    let rowIndex = augmentedRows.findIndex((row, index) => index >= 2 && !claimedRows.has(index) && compact(row[2]) === studentKey && courseMatches(row[3], member.course));
    if (rowIndex < 0) {
      const exemplar = augmentedRows.findIndex((row, index) => index >= 2 && courseMatches(row[3], member.course));
      const selectedCourse = exemplar >= 0 ? text(augmentedRows[exemplar][3]) : member.course;
      const currentCourses = coursesByStudent.get(studentKey) || [];
      const reusableRow = currentCourses.length === 1
        ? augmentedRows.findIndex((row, index) => index >= 2 && !claimedRows.has(index) && compact(row[2]) === studentKey && !currentCourses.some(course => courseMatches(row[3], course)))
        : -1;
      if (reusableRow >= 0) {
        rowIndex = reusableRow;
        for (const [column, value] of [[0, member.name], [2, member.studentId], [3, selectedCourse]]) {
          if (text(augmentedRows[rowIndex][column]) === text(value)) continue;
          augmentedRows[rowIndex][column] = value;
          fieldUpdates.push({ rowIndex, column, value });
        }
      } else {
        rowIndex = augmentedRows.length;
        const newRow = [member.name, '', member.studentId, selectedCourse, ''];
        augmentedRows.push(newRow);
        missing.push({ member, rowIndex, exemplar, values: newRow });
      }
    } else if (text(augmentedRows[rowIndex][0]) !== member.name) {
      augmentedRows[rowIndex][0] = member.name;
      fieldUpdates.push({ rowIndex, column: 0, value: member.name });
    }
    claimedRows.add(rowIndex);
    rowForMembership.set(`${compact(member.studentId)}|${compact(member.course)}`, rowIndex);
  }

  const headerKeys = (augmentedRows[0] || []).map(headerEquipmentKey);
  const updates = [];
  for (const member of memberships) {
    const rowIndex = rowForMembership.get(`${compact(member.studentId)}|${compact(member.course)}`);
    for (let column = 5; column < headerKeys.length; column++) {
      const equipment = headerKeys[column];
      if (!equipment) continue;
      const status = outcomes.get(`${compact(member.name)}|${equipment}`);
      if (status) updates.push({ rowIndex, column, status, name: member.name, course: member.course, group: member.group, equipment });
    }
  }
  return { groups, memberships, outcomes, updates, missing, fieldUpdates };
}

function quoted(name) { return `'${String(name).replaceAll("'", "''")}'`; }

async function syncExternalCertificationMatrix(api, spreadsheetId) {
  const ranges = [`${quoted(ROSTER_SHEET)}!A:AM`, `${quoted(MATRIX_SHEET)}!A:AJ`, `${quoted(LOG_SHEET)}!A:S`];
  const values = await api.spreadsheets.values.batchGet({ spreadsheetId, ranges, valueRenderOption: 'FORMATTED_VALUE' });
  const [rosterRows = [], matrixRows = [], logRows = []] = (values.data.valueRanges || []).map(range => range.values || []);
  if (!rosterRows.length || !matrixRows.length || !logRows.length) return { updated: 0, added: 0, reason: '缺少必要分頁資料' };
  const plan = planMatrix(rosterRows, matrixRows, logRows);
  const metadata = await api.spreadsheets.get({ spreadsheetId, fields: 'sheets(properties(sheetId,title))' });
  const matrixSheetId = (metadata.data.sheets || []).find(sheet => sheet.properties?.title === MATRIX_SHEET)?.properties?.sheetId;
  if (matrixSheetId == null) throw new Error(`找不到分頁：${MATRIX_SHEET}`);

  const requests = [];
  const appliedAfterSuccess = [];
  for (const addition of plan.missing) {
    const formatExemplar = addition.exemplar >= 0 ? addition.exemplar : Math.min(2, matrixRows.length - 1);
    if (formatExemplar >= 0) requests.push({ copyPaste: {
      source: { sheetId: matrixSheetId, startRowIndex: formatExemplar, endRowIndex: formatExemplar + 1, startColumnIndex: 0, endColumnIndex: 5 },
      destination: { sheetId: matrixSheetId, startRowIndex: addition.rowIndex, endRowIndex: addition.rowIndex + 1, startColumnIndex: 0, endColumnIndex: 5 },
      pasteType: 'PASTE_FORMAT', pasteOrientation: 'NORMAL'
    } });
    requests.push({ updateCells: {
      range: { sheetId: matrixSheetId, startRowIndex: addition.rowIndex, endRowIndex: addition.rowIndex + 1, startColumnIndex: 0, endColumnIndex: 5 },
      rows: [{ values: addition.values.map(value => ({ userEnteredValue: { stringValue: text(value) } })) }],
      fields: 'userEnteredValue'
    } });
  }

  for (const update of plan.fieldUpdates) requests.push({ updateCells: {
    range: { sheetId: matrixSheetId, startRowIndex: update.rowIndex, endRowIndex: update.rowIndex + 1, startColumnIndex: update.column, endColumnIndex: update.column + 1 },
    rows: [{ values: [{ userEnteredValue: { stringValue: text(update.value) } }] }],
    fields: 'userEnteredValue'
  } });

  let updated = 0;
  for (const update of plan.updates) {
    const cacheKey = `${spreadsheetId}|${update.rowIndex}|${update.column}`;
    if (lastApplied.get(cacheKey) === update.status) continue;
    requests.push({ repeatCell: {
      range: { sheetId: matrixSheetId, startRowIndex: update.rowIndex, endRowIndex: update.rowIndex + 1, startColumnIndex: update.column, endColumnIndex: update.column + 1 },
      cell: { userEnteredFormat: {
        backgroundColorStyle: { rgbColor: COLORS[update.status] },
        textFormat: { strikethrough: update.status === DEPOSIT_DISQUALIFIED }
      } },
      fields: 'userEnteredFormat.backgroundColorStyle,userEnteredFormat.textFormat.strikethrough'
    } });
    appliedAfterSuccess.push([cacheKey, update.status]);
    updated++;
  }
  if (requests.length) await api.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests } });
  for (const [cacheKey, status] of appliedAfterSuccess) lastApplied.set(cacheKey, status);
  return { updated, added: plan.missing.length, refreshed: plan.fieldUpdates.length, groups: plan.groups.length, memberships: plan.memberships.length };
}

module.exports = { syncExternalCertificationMatrix, _test: { canonicalEquipment, logEquipmentKey, headerEquipmentKey, parseRosterGroups, outcomeMap, planMatrix } };
