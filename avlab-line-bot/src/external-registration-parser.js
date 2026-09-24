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

function parseRegistrationRows(rows) {
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
  const registrations = new Map();
  for (let rowIndex = headerIndex + 1; rowIndex < rows.length; rowIndex++) {
    const row = rows[rowIndex] || [];
    const registeredItems = mergeUnique(itemColumns.filter(({ index }) => selected(row[index]))
      .map(({ header }) => header.replace(/\s+/g, ' ').trim()), itemKey);
    const equipment = mergeUnique(equipmentColumns.filter(({ index }) => selected(row[index]))
      .map(({ header }) => equipmentName(header)).filter(Boolean), equipmentKey);
    if (!registeredItems.length) continue;
    for (const [nameColumn, numberColumn, departmentColumn] of identityPairs) {
      const name = text(row[nameColumn]);
      const number = text(row[numberColumn]);
      if (!name || !number) continue;
      const key = norm(number) || `NAME:${norm(name)}`;
      const previous = registrations.get(key);
      registrations.set(key, {
        name: name || previous?.name || '', department: text(row[departmentColumn]) || previous?.department || '', number,
        equipment: mergeUnique([...(previous?.equipment || []), ...equipment], equipmentKey),
        registeredItems: mergeUnique([...(previous?.registeredItems || []), ...registeredItems], itemKey),
        timestamp: row[0] || '', sourceRow: rowIndex + 1
      });
    }
  }
  return [...registrations.values()];
}

module.exports = { parseRegistrationRows, selected, equipmentName };
