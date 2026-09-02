'use strict';

const text = value => String(value ?? '').trim();
const compact = value => text(value).replace(/\s+/g, '');

function headerIndex(row, pattern) {
  return (row || []).findIndex(value => pattern.test(compact(value)));
}

function phaseForSheet(sheetName, data, headerRow) {
  const header = (data[headerRow] || []).map(text).join('|');
  const context = [sheetName, ...data.slice(0, Math.min(headerRow + 1, 5)).flat()].map(text).join('|');
  if (/第二次補考/.test(context)) return '第二次補考';
  if (/第一次補考/.test(sheetName) || /須補交補考保證金/.test(header)) return '第一次補考';
  return '考試';
}

function parseDepositWorkbook(rawSheets) {
  const output = [['階段','姓名','學號','已繳交','應繳金額','實繳金額','報名考試項目','來源分頁','來源列']];
  for (const [sheetName, data] of Object.entries(rawSheets || {})) {
    const headerRow = (data || []).findIndex(row => headerIndex(row, /^姓名$/) >= 0 && headerIndex(row, /^學號$/) >= 0 && headerIndex(row, /^已繳交$/) >= 0);
    if (headerRow < 0) continue;
    const header = data[headerRow] || [];
    const nameCol = headerIndex(header, /^姓名$/);
    const numberCol = headerIndex(header, /^學號$/);
    const paidCol = headerIndex(header, /^已繳交$/);
    const requiredCol = headerIndex(header, /^保證金總額$/);
    const amountCol = headerIndex(header, /^繳交金額$/);
    const itemCol = headerIndex(header, /^(?:報名考試項目|須補交補考保證金之考試項目\(原因\))$/);
    const phase = phaseForSheet(sheetName, data, headerRow);
    for (let rowIndex = headerRow + 1; rowIndex < data.length; rowIndex++) {
      const row = data[rowIndex] || [];
      const name = text(row[nameCol]), number = text(row[numberCol]);
      if (!name || !number || name === '範例' || /XXX/i.test(number)) continue;
      output.push([phase, name, number, text(row[paidCol]), requiredCol >= 0 ? text(row[requiredCol]) : '', amountCol >= 0 ? text(row[amountCol]) : '', itemCol >= 0 ? text(row[itemCol]) : '', sheetName, rowIndex + 1]);
    }
  }
  return output;
}

module.exports = { parseDepositWorkbook, _test: { phaseForSheet } };
