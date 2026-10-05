'use strict';

const text = value => String(value ?? '').trim();
const norm = value => text(value).replace(/\s+/g, '');
const notSelected = /^(?:FALSE|否|無|不報名|未報名|不需要|N\/?A|-|—)$/i;

function selected(value) {
  const valueText = text(value);
  return Boolean(valueText) && !notSelected.test(valueText);
}

function equipmentName(header) {
  return text(header).replace(/\s*考試(?:\s*\d{1,2}\/.*)?\s*$/u, '').trim();
}

function registrationItem(header) {
  return /(?:教學|考試)/u.test(header) || ['基礎配件課程', 'Teradek無線追焦組', 'Teradek無線追'].includes(header);
}

function houbanFilmSelected(headers, row) {
  const dedicatedColumns = headers.flatMap((header, index) => {
    const value = norm(header);
    return value.includes('侯志欽') && value.includes('影像製作') ? [index] : [];
  });
  if (dedicatedColumns.length) return dedicatedColumns.some(index => selected(row[index]));
  return headers.some((header, index) => norm(header).includes('本學期所選之課程')
    && norm(row[index]).includes('侯志欽') && norm(row[index]).includes('影像製作'));
}

function equipmentKey(value) {
  const key = equipmentName(value).normalize('NFKC').toUpperCase().replace(/[\s\-_/／・·（）()]/g, '');
  if (['A7SII', 'A7SLL'].includes(key)) return 'A7SII';
  if (['ATOMOS', 'ATOMOS螢幕'].includes(key)) return 'ATOMOS';
  if (['VORTEX4S8S', 'V4V8'].includes(key)) return 'V4V8';
  if (['200WPAR', 'PAR200W', '200PAR', 'PAR200'].includes(key)) return 'PAR200W';
  return key;
}

function itemKey(value) {
  const raw = text(value);
  const phase = raw.includes('教學') ? ':教學' : raw.includes('考試') ? ':考試' : '';
  return `${equipmentKey(raw.replace(/(?:教學|考試).*$/u, ''))}${phase}`;
}

function mergeUnique(values, keyFor) {
  const merged = new Map();
  for (const value of values) {
    const key = keyFor(value);
    if (key && !merged.has(key)) merged.set(key, value);
  }
  return [...merged.values()];
}

function timestampOrder(value, fallback) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.getTime();
  const raw = text(value);
  const localized = raw.match(/(\d{4})\/(\d{1,2})\/(\d{1,2})\s*(上午|下午)?\s*(\d{1,2})?:(\d{2})?(?::(\d{2}))?/);
  if (localized) {
    let hour = Number(localized[5] || 0);
    if (localized[4] === '下午' && hour < 12) hour += 12;
    if (localized[4] === '上午' && hour === 12) hour = 0;
    return Date.UTC(Number(localized[1]), Number(localized[2]) - 1, Number(localized[3]), hour, Number(localized[6] || 0), Number(localized[7] || 0));
  }
  const parsed = Date.parse(raw);
  return Number.isNaN(parsed) ? fallback : parsed;
}

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

function parseRegistrationRows(rows, { includeEmpty = false } = {}) {
  if (!Array.isArray(rows) || !rows.length) return [];
  const headerIndex = rows.findIndex(row => row.some(value => text(value) === '學號') && row.some(value => text(value) === '姓名'));
  if (headerIndex < 0) return [];
  const headers = rows[headerIndex].map(text);
  const identityPairs = headers.flatMap((header, nameColumn) => {
    if (header !== '姓名') return [];
    const offset = headers.slice(nameColumn + 1).findIndex(value => value === '學號');
    if (offset < 0) return [];
    const numberColumn = nameColumn + 1 + offset;
    const departmentOffset = headers.slice(nameColumn + 1, numberColumn).findIndex(value => value === '系級');
    const departmentColumn = departmentOffset < 0 ? -1 : nameColumn + 1 + departmentOffset;
    return [[nameColumn, numberColumn, departmentColumn]];
  });
  if (!identityPairs.length) return [];
  const itemColumns = headers.map((header, index) => ({ header, index })).filter(({ header }) => registrationItem(header));
  const equipmentColumns = itemColumns.filter(({ header }) => /考試/u.test(header)
    || ['Teradek無線追焦組', 'Teradek無線追'].includes(header));
  const validNumbersByName = new Map();
  for (let rowIndex = headerIndex + 1; rowIndex < rows.length; rowIndex++) for (const [nameColumn, numberColumn] of identityPairs) {
    const name = norm(rows[rowIndex]?.[nameColumn]), number = norm(rows[rowIndex]?.[numberColumn]);
    if (!name || !/^\d{9}$/.test(number)) continue;
    if (!validNumbersByName.has(name)) validNumbersByName.set(name, new Set());
    validNumbersByName.get(name).add(number);
  }
  const registrations = new Map();
  const submissionCounts = new Map();
  for (let rowIndex = headerIndex + 1; rowIndex < rows.length; rowIndex++) {
    const row = rows[rowIndex] || [];
    const registeredItems = mergeUnique(itemColumns.filter(({ index }) => selected(row[index]))
      .map(({ header }) => header.replace(/\s+/g, ' ').trim()), itemKey);
    const equipment = mergeUnique(equipmentColumns.filter(({ index }) => selected(row[index]))
      .map(({ header }) => equipmentName(header)).filter(Boolean), equipmentKey);
    for (const [nameColumn, numberColumn, departmentColumn] of identityPairs) {
      const name = text(row[nameColumn]);
      let number = text(row[numberColumn]);
      if (!name || !number) continue;
      const validNumbers = validNumbersByName.get(norm(name));
      if (!/^\d{9}$/.test(norm(number)) && validNumbers?.size === 1) {
        const candidate = [...validNumbers][0];
        if (editDistance(number, candidate) <= 1) number = candidate;
      }
      const key = norm(number) || `NAME:${norm(name)}`;
      submissionCounts.set(key, (submissionCounts.get(key) || 0) + 1);
      const previous = registrations.get(key);
      const order = timestampOrder(row[0], rowIndex + 1);
      if (previous && previous._order > order) continue;
      registrations.set(key, {
        name, department: text(row[departmentColumn]), number,
        equipment, registeredItems,
        // The early deadline applies only when the Hou Chih-Chin Film
        // Production option is actually selected. It may be represented by
        // a dedicated checkbox column or by the legacy course-selection cell.
        houbanFilm: houbanFilmSelected(headers, row),
        timestamp: row[0] || '', sourceRow: rowIndex + 1, _order: order
      });
    }
  }
  return [...registrations.entries()].flatMap(([key, registration]) => {
    if (!includeEmpty && !registration.registeredItems.length) return [];
    const { _order, ...result } = registration;
    return [{ ...result, submissionCount: submissionCounts.get(key) || 1 }];
  });
}

module.exports = { parseRegistrationRows, selected, equipmentName };
