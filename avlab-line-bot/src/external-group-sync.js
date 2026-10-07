'use strict';

const MATRIX_SHEET = process.env.EXTERNAL_MATRIX_SHEET_NAME || '1151課程認證狀態';
const LOG_SHEET = 'LINE點名紀錄';
const CURRENT_COURSE_COLUMNS = [0, 4, 9, 14, 19];
const PASS = '通過';
const RETEST = '要補考';
const DEPOSIT_DISQUALIFIED = '保證金未繳';
const DEPOSIT_RESTORED = '保證金已確認';
const COLORS = {
  [PASS]: { red: 0.7137255, green: 0.84313726, blue: 0.65882355 },
  [RETEST]: { red: 0.9764706, green: 0.79607844, blue: 0.6117647 },
  [DEPOSIT_DISQUALIFIED]: { red: 0.9764706, green: 0.79607844, blue: 0.6117647 },
  [DEPOSIT_RESTORED]: { red: 1, green: 1, blue: 1 }
};
const lastApplied = new Map();

const text = value => String(value ?? '').trim();
const compact = value => text(value).normalize('NFKC').replace(/[\s\-_/／・·・（）()]/g, '').toUpperCase();
const compactStudentId = value => compact(value).replace(/[^A-Z0-9]/g, '');
const groupLabel = value => /^(?:第)?(?:[0-9]+|[一二三四五六七八九十]+)組(?:[、,，](?:第)?(?:[0-9]+|[一二三四五六七八九十]+)組)*$/.test(text(value));
const booleanValue = value => /^(?:TRUE|FALSE)$/i.test(text(value));
const personKey = person => compactStudentId(person.studentId)
  ? `ID:${compactStudentId(person.studentId)}`
  : `NAME:${compact(person.name)}`;
const membershipKey = member => `${personKey(member)}|${compact(member.course)}|${compact(member.group)}`;

function canonicalEquipment(value) {
  const key = compact(value).replace(/(?:考試|教學)$/u, '');
  if (key.includes('基礎配件課程')) return '基礎配件課程';
  if (key.includes('聲音工作區')) return '聲音工作區';
  if (key.includes('棚內機')) return '棚內機';
  if (key.includes('導播台')) return '導播台';
  if (key.includes('字幕機')) return '字幕機';
  if (key.includes('燈盤')) return '燈盤';
  if (key.includes('成音台')) return '成音台';
  if (key.includes('3PLAY')) return '3PLAY';
  if (key.includes('錄放影機') || key.includes('錄放機')) return '錄放影機';
  if (key.includes('無線追焦')) return '無線追焦組';
  if (['A7SIII', 'Α7SIII', 'A7S3', 'Α7S3'].includes(key)) return 'A7S3';
  if (['A7SII', 'Α7SII'].includes(key)) return 'A7SII';
  if (key.startsWith('ARRIS60')) return 'ARRIS60';
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
  const width = Math.max(0, ...rows.map(row => row.length));
  const detectedLegacyColumns = Array.from({ length: Math.max(0, width - 1) }, (_, column) => column)
    .filter(column => text(rows[0]?.[column]) && rows.slice(1).some(row => groupLabel(row[column])));
  const courseColumns = [...new Set([...CURRENT_COURSE_COLUMNS, ...detectedLegacyColumns])]
    .filter(column => text(rows[0]?.[column]));
  for (const column of courseColumns) {
    const baseCourse = text(rows[0]?.[column]);
    let section = baseCourse;
    let category = '';
    let current = null;
    let explicitGroups = false;
    let pendingHeadings = [];
    for (let row = 1; row < rows.length; row++) {
      const value = text(rows[row]?.[column]);
      if (!value) continue;
      if (groupLabel(value)) {
        if (pendingHeadings.length) {
          section = pendingHeadings.join('｜');
          category = '';
          pendingHeadings = [];
        }
        current = { course: section, group: value, members: [] };
        groups.push(current);
        explicitGroups = true;
        continue;
      }
      const studentId = text(rows[row]?.[column + 1]);
      const memberSignal = Boolean(studentId || booleanValue(rows[row]?.[column + 2]) || (column === 19 && text(rows[row]?.[column + 5])));
      const nextValue = rows.slice(row + 1).map(item => text(item?.[column])).find(Boolean) || '';
      const startsSection = current && explicitGroups && !memberSignal && groupLabel(nextValue);
      if (memberSignal || (current && explicitGroups && !startsSection)) {
        if (pendingHeadings.length) {
          if (pendingHeadings.length > 1) category = pendingHeadings.slice(0, -1).join('｜');
          const group = [category, pendingHeadings.at(-1)].filter(Boolean).join('｜');
          current = { course: section, group, members: [] };
          groups.push(current);
          pendingHeadings = [];
          explicitGroups = false;
        }
        if (!current) {
          current = { course: section, group: category || '未分組', members: [] };
          groups.push(current);
        }
        current.members.push({ name: value, studentId });
        continue;
      }
      pendingHeadings.push(value);
      current = null;
      explicitGroups = false;
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
    const shortAnswer = text(row[10]);
    const practical = text(row[11]);
    const total = text(row[12]);
    const operator = text(row[13]);
    const deposit = text(row[18]);
    const cumulativeShort = text(row[16]);
    const cumulativePractical = text(row[17]);
    const key = `${name}|${equipment}`;
    let status = '';
    if (phase === '教學') {
      if (['到場', '遲到'].includes(attendance)) status = PASS;
      else if (['請假', '未到', '缺席', '取消資格'].includes(attendance)) status = RETEST;
    } else if (operator === DEPOSIT_RESTORED) {
      status = DEPOSIT_RESTORED;
    } else if (attendance === '取消資格' && operator === DEPOSIT_DISQUALIFIED) {
      status = DEPOSIT_DISQUALIFIED;
    } else if ((cumulativeShort === PASS && cumulativePractical === PASS) || deposit === '可退保證金') {
      status = PASS;
    } else if (['請假', '未到', '缺席', '取消資格'].includes(attendance)
      || [shortAnswer, practical, total, cumulativeShort, cumulativePractical].some(value => value === '未通過')
      || deposit.startsWith('不可退保證金')) {
      status = RETEST;
    }
    if (!status) continue;
    // LINE 點名紀錄以後寫入的決定性結果為準，讓考官修正後能立即覆蓋舊顏色。
    outcomes.set(key, status);
  }
  return outcomes;
}

function courseMatches(selectedCourse, course) {
  const raw = value => compact(text(value).split('｜')[0]).replace(/(?:期中|期末)$/u, '');
  const normalize = value => {
    const key = raw(value);
    if (key.includes('聲音藝術與錄音工程') || key.includes('音響學')) return '音響學';
    if (key.includes('獨立專題') && (key.includes('鍾適芳') || key.includes('獨立專題B'))) return '鍾適芳獨立專題';
    if (key.includes('影製侯') || (key.includes('侯志欽') && key.includes('影像製作'))) return '影製侯';
    if (key.includes('影製李') || (key.includes('李志文') && key.includes('影像製作'))) return '影製李';
    return key;
  };
  const selected = normalize(selectedCourse);
  const roster = normalize(course);
  const selectedRaw = raw(selectedCourse);
  const rosterRaw = raw(course);
  return Boolean(selected && roster && (selected.includes(roster) || roster.includes(selected)
    || selectedRaw.includes(rosterRaw) || rosterRaw.includes(selectedRaw)));
}

function findCourseRow(rows, member, claimedRows, groupColumn) {
  const available = (row, index) => {
    if (index < 2 || claimedRows.has(index)) return false;
    return member.studentId
      ? compactStudentId(row[2]) === compactStudentId(member.studentId)
      : compact(row[0]) === compact(member.name);
  };
  const exactCourse = (row, index) => available(row, index) && compact(row[3]) === compact(member.course);
  const exactGroup = row => groupColumn >= 0 && compact(row[groupColumn]) === compact(member.group);
  let found = rows.findIndex((row, index) => exactCourse(row, index) && exactGroup(row));
  if (found < 0) found = rows.findIndex((row, index) => exactCourse(row, index));
  if (found < 0) found = rows.findIndex((row, index) => available(row, index) && courseMatches(row[3], member.course) && exactGroup(row));
  return found >= 0 ? found : rows.findIndex((row, index) => available(row, index) && courseMatches(row[3], member.course));
}

function planMatrix(rosterRows, matrixRows, logRows) {
  const groups = parseRosterGroups(rosterRows);
  const outcomes = outcomeMap(logRows);
  const memberships = [];
  const seenMemberships = new Set();
  for (const group of groups) for (const member of group.members) {
    const candidate = { ...member, course: group.course, group: group.group };
    const key = membershipKey(candidate);
    if (seenMemberships.has(key)) continue;
    seenMemberships.add(key);
    memberships.push(candidate);
  }

  const augmentedRows = matrixRows.map(row => row.slice());
  const groupColumn = (augmentedRows[0] || []).findIndex(header => compact(header) === compact('組別'));
  const identityEndColumn = Math.max(5, groupColumn + 1);
  const missing = [];
  const fieldUpdates = [];
  const rowForMembership = new Map();
  const claimedRows = new Set();
  for (const member of memberships) {
    let exemplar = augmentedRows.findIndex((row, index) => index >= 2 && compact(row[3]) === compact(member.course));
    if (exemplar < 0) exemplar = augmentedRows.findIndex((row, index) => index >= 2 && courseMatches(row[3], member.course));
    const selectedCourse = member.course;
    let rowIndex = findCourseRow(augmentedRows, member, claimedRows, groupColumn);
    if (rowIndex < 0) {
      rowIndex = augmentedRows.length;
      const newRow = Array(identityEndColumn).fill('');
      newRow[0] = member.name;
      newRow[2] = member.studentId;
      newRow[3] = selectedCourse;
      if (groupColumn >= 0) newRow[groupColumn] = member.group;
      augmentedRows.push(newRow);
      missing.push({ member, rowIndex, exemplar, values: newRow });
    } else {
      const identityValues = [[0, member.name], [3, selectedCourse]];
      if (groupColumn >= 0) identityValues.push([groupColumn, member.group]);
      for (const [column, value] of identityValues) {
        if (text(augmentedRows[rowIndex][column]) === text(value)) continue;
        augmentedRows[rowIndex][column] = value;
        fieldUpdates.push({ rowIndex, column, value });
      }
    }
    claimedRows.add(rowIndex);
    rowForMembership.set(membershipKey(member), rowIndex);
  }

  const headerKeys = (augmentedRows[0] || []).map(headerEquipmentKey);
  const updates = [];
  for (const member of memberships) {
    const rowIndex = rowForMembership.get(membershipKey(member));
    for (let column = 5; column < headerKeys.length; column++) {
      const equipment = headerKeys[column];
      if (!equipment) continue;
      const status = outcomes.get(`${compact(member.name)}|${equipment}`);
      if (status) updates.push({ rowIndex, column, status, name: member.name, course: member.course, group: member.group, equipment });
    }
  }
  return { groups, memberships, outcomes, updates, missing, fieldUpdates, identityEndColumn };
}

function planCertificationColors(matrixRows, logRows) {
  const outcomes = outcomeMap(logRows);
  const headerKeys = (matrixRows[0] || []).map(headerEquipmentKey);
  const updates = [];
  for (let rowIndex = 2; rowIndex < matrixRows.length; rowIndex++) {
    const name = text(matrixRows[rowIndex]?.[0]);
    if (!name) continue;
    for (let column = 5; column < headerKeys.length; column++) {
      const equipment = headerKeys[column];
      if (!equipment) continue;
      const status = outcomes.get(`${compact(name)}|${equipment}`);
      if (!status) continue;
      updates.push({ rowIndex, column, name, equipment, status: status === DEPOSIT_DISQUALIFIED ? RETEST : status });
    }
  }
  return { outcomes, updates };
}

function quoted(name) { return `'${String(name).replaceAll("'", "''")}'`; }

async function syncExternalCertificationColors(api, spreadsheetId) {
  const ranges = [`${quoted(MATRIX_SHEET)}!A:AM`, `${quoted(LOG_SHEET)}!A:S`];
  const values = await api.spreadsheets.values.batchGet({ spreadsheetId, ranges, valueRenderOption: 'FORMATTED_VALUE' });
  const [matrixRows = [], logRows = []] = (values.data.valueRanges || []).map(range => range.values || []);
  if (!matrixRows.length || !logRows.length) return { updated: 0, reason: '缺少必要分頁資料' };
  const plan = planCertificationColors(matrixRows, logRows);
  const metadata = await api.spreadsheets.get({ spreadsheetId, fields: 'sheets(properties(sheetId,title))' });
  const matrixSheetId = (metadata.data.sheets || []).find(sheet => sheet.properties?.title === MATRIX_SHEET)?.properties?.sheetId;
  if (matrixSheetId == null) throw new Error(`找不到分頁：${MATRIX_SHEET}`);

  const requests = [];
  const appliedAfterSuccess = [];
  for (const update of plan.updates) {
    const cacheKey = `color-only|${spreadsheetId}|${update.rowIndex}|${update.column}`;
    if (lastApplied.get(cacheKey) === update.status) continue;
    requests.push({ repeatCell: {
      range: { sheetId: matrixSheetId, startRowIndex: update.rowIndex, endRowIndex: update.rowIndex + 1, startColumnIndex: update.column, endColumnIndex: update.column + 1 },
      cell: { userEnteredFormat: {
        backgroundColorStyle: { rgbColor: COLORS[update.status] },
        textFormat: { strikethrough: false }
      } },
      fields: 'userEnteredFormat.backgroundColorStyle,userEnteredFormat.textFormat.strikethrough'
    } });
    appliedAfterSuccess.push([cacheKey, update.status]);
  }
  if (requests.length) await api.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests } });
  for (const [cacheKey, status] of appliedAfterSuccess) lastApplied.set(cacheKey, status);
  return { updated: requests.length, matched: plan.updates.length };
}

module.exports = {
  syncExternalCertificationColors,
  _test: { canonicalEquipment, logEquipmentKey, headerEquipmentKey, parseRosterGroups, outcomeMap, planMatrix, planCertificationColors }
};
