'use strict';

const text = value => String(value ?? '').trim();
const norm = value => text(value).replace(/\s+/g, '');
const notSelected = /^(?:FALSE|否|無|不報名|未報名|不需要|N\/?A|-|—)$/i;

function selected(value) {
  const valueText = text(value);
  return Boolean(valueText) && !notSelected.test(valueText);
}

function equipmentName(header) {
  return text(header).replace(/\s*考試\s*$/u, '').trim();
}

function parseRegistrationRows(rows) {
  if (!Array.isArray(rows) || !rows.length) return [];
  const headerIndex = rows.findIndex(row => row.some(value => text(value) === '學號') && row.some(value => text(value) === '姓名'));
  if (headerIndex < 0) return [];
  const headers = rows[headerIndex].map(text);
  const departmentColumn = headers.indexOf('系級');
  const identityPairs = headers.flatMap((header, nameColumn) => {
    if (header !== '姓名') return [];
    const offset = headers.slice(nameColumn + 1).findIndex(value => value === '學號');
    return offset < 0 ? [] : [[nameColumn, nameColumn + 1 + offset]];
  });
  if (!identityPairs.length) return [];
  const equipmentColumns = headers.map((header, index) => ({ header, index })).filter(({ header }) =>
    (/考試/.test(header) && !/是否|確認|結果/.test(header)) || header === 'Teradek無線追'
  );
  const registrations = new Map();
  for (let rowIndex = headerIndex + 1; rowIndex < rows.length; rowIndex++) {
    const row = rows[rowIndex] || [];
    const equipment = [...new Set(equipmentColumns.filter(({ index }) => selected(row[index]))
      .map(({ header }) => equipmentName(header)).filter(Boolean))];
    if (!equipment.length) continue;
    for (const [nameColumn, numberColumn] of identityPairs) {
      const name = text(row[nameColumn]);
      const number = text(row[numberColumn]);
      if (!name || !number) continue;
      registrations.set(norm(number) || `NAME:${norm(name)}`, {
        name, department: text(row[departmentColumn]), number, equipment,
        timestamp: row[0] || '', sourceRow: rowIndex + 1
      });
    }
  }
  return [...registrations.values()];
}

module.exports = { parseRegistrationRows, selected, equipmentName };
