'use strict';

const text = value => String(value ?? '').trim();
const norm = value => text(value).replace(/[（(][^）)]*[）)]/g, '').replace(/\s+/g, '');

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

function namesMatch(left, right) {
  const a = norm(left), b = norm(right);
  if (!a || !b) return false;
  return a === b || (Math.min(a.length, b.length) >= 3 && editDistance(a, b) <= 1);
}

function parseRegistrationIdentities(rows) {
  if (!Array.isArray(rows) || !rows.length) return [];
  const headerIndex = rows.findIndex(row => row.some(value => norm(value) === '姓名') && row.some(value => norm(value) === '學號'));
  if (headerIndex < 0) return [];
  const headers = rows[headerIndex].map(norm);
  const pairs = [];
  for (let nameColumn = 0; nameColumn < headers.length; nameColumn++) {
    if (headers[nameColumn] !== '姓名') continue;
    const numberOffset = headers.slice(nameColumn + 1).findIndex(header => header === '學號');
    if (numberOffset >= 0) pairs.push([nameColumn, nameColumn + 1 + numberOffset]);
  }
  const output = [];
  for (let rowIndex = headerIndex + 1; rowIndex < rows.length; rowIndex++) {
    for (const [nameColumn, numberColumn] of pairs) {
      const name = text(rows[rowIndex]?.[nameColumn]), number = text(rows[rowIndex]?.[numberColumn]);
      if (name && number) output.push({ name, number, source: 'registration' });
    }
  }
  return output;
}

function parseDepositIdentities(rawSheets) {
  const output = [];
  for (const [sheetName, rows] of Object.entries(rawSheets || {})) {
    const headerIndex = (rows || []).findIndex(row => row.some(value => norm(value) === '姓名') && row.some(value => norm(value) === '學號'));
    if (headerIndex < 0) continue;
    const headers = rows[headerIndex].map(norm);
    const nameColumn = headers.indexOf('姓名'), numberColumn = headers.indexOf('學號');
    for (let rowIndex = headerIndex + 1; rowIndex < rows.length; rowIndex++) {
      const name = text(rows[rowIndex]?.[nameColumn]), number = text(rows[rowIndex]?.[numberColumn]);
      if (!name || !number || name === '範例' || /XXX/i.test(number)) continue;
      output.push({ name, number, source: sheetName });
    }
  }
  return output;
}

function mergeExternalIdentities(...lists) {
  const merged = new Map();
  for (const person of lists.flat()) {
    const key = norm(person.number);
    if (!key) continue;
    if (!merged.has(key)) merged.set(key, { name: text(person.name), number: text(person.number), aliases: [], sources: [] });
    const current = merged.get(key);
    if (person.name && !current.aliases.some(alias => norm(alias) === norm(person.name))) current.aliases.push(text(person.name));
    if (person.source && !current.sources.includes(person.source)) current.sources.push(person.source);
  }
  return [...merged.values()];
}

module.exports = { parseRegistrationIdentities, parseDepositIdentities, mergeExternalIdentities, namesMatch, norm };
