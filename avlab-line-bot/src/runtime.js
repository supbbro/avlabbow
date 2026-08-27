'use strict';

const { google } = require('googleapis');
const { workbooks, ids, timezone } = require('./config');

const a1 = name => `'${String(name).replaceAll("'", "''")}'`;
const colName = number => {
  let result = '';
  for (let n = number; n > 0; n = Math.floor((n - 1) / 26)) {
    result = String.fromCharCode(65 + ((n - 1) % 26)) + result;
  }
  return result;
};

function credentialsFromEnv() {
  if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    let raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON.trim();
    if (!raw.startsWith('{')) raw = Buffer.from(raw, 'base64').toString('utf8');
    const parsed = JSON.parse(raw);
    if (parsed.private_key) parsed.private_key = parsed.private_key.replace(/\\n/g, '\n');
    return parsed;
  }
  if (process.env.GOOGLE_CLIENT_EMAIL && process.env.GOOGLE_PRIVATE_KEY) {
    return {
      client_email: process.env.GOOGLE_CLIENT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n')
    };
  }
  throw new Error('Missing Google credentials. Set GOOGLE_SERVICE_ACCOUNT_JSON or GOOGLE_CLIENT_EMAIL/GOOGLE_PRIVATE_KEY.');
}

function formatDate(value, pattern) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value ?? '');
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
  }).formatToParts(date).map(part => [part.type, part.value]));
  return pattern
    .replace(/yyyy/g, parts.year).replace(/MM/g, parts.month).replace(/dd/g, parts.day)
    .replace(/HH/g, parts.hour).replace(/mm/g, parts.minute).replace(/ss/g, parts.second);
}

function maybeDate(value, spreadsheetId, sheetName, column) {
  if (typeof value !== 'string' || !value.trim()) return value;
  const dateColumns = {
    [`${ids.task}|1142 教學考官安排彙整`]: [0],
    [`${ids.leave}|表單回覆 1`]: [0, 5],
    [`${ids.external}|表單回覆 1`]: [0, 2],
    [`${ids.retest}|表單回覆 1`]: [0, 6],
    [`${ids.externalResults}|對外任務`]: [3, 14, 15],
    [`${ids.externalResults}|任務學生`]: [7],
    [`${ids.externalResults}|LINE點名紀錄`]: [2, 15],
    [`${ids.externalResults}|LINE群組設定`]: [8, 9],
    [`${ids.game}|玩家資料`]: [8],
    [`${ids.game}|交易紀錄`]: [0],
    [`${ids.game}|稱號紀錄`]: [0]
  };
  if (!(dateColumns[`${spreadsheetId}|${sheetName}`] || []).includes(column)) return value;
  const normalized = value.replace('上午', 'AM').replace('下午', 'PM');
  const match = normalized.match(/^(?:(\d{4})[/-])?(\d{1,2})[/-](\d{1,2})(?:\s*(AM|PM)?\s*(\d{1,2}):(\d{2})(?::(\d{2}))?)?/i);
  if (match) {
    let hour = Number(match[5] || 0);
    const meridiem = String(match[4] || '').toUpperCase();
    if (meridiem === 'PM' && hour < 12) hour += 12;
    if (meridiem === 'AM' && hour === 12) hour = 0;
    return new Date(Number(match[1] || new Date().getFullYear()), Number(match[2]) - 1, Number(match[3]), hour, Number(match[6] || 0), Number(match[7] || 0));
  }
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? value : parsed;
}

class MemoryCache {
  constructor() { this.items = new Map(); }
  get(key) {
    const item = this.items.get(String(key));
    if (!item || item.expires <= Date.now()) { this.items.delete(String(key)); return null; }
    return item.value;
  }
  put(key, value, seconds = 600) {
    this.items.set(String(key), { value: String(value), expires: Date.now() + seconds * 1000 });
  }
  remove(key) { this.items.delete(String(key)); }
}

class RangeFacade {
  constructor(sheet, row, column, rows = 1, columns = 1) {
    this.sheet = sheet; this.row = row; this.column = column;
    this.rows = rows; this.columns = columns;
  }
  getRow() { return this.row; }
  getColumn() { return this.column; }
  getSheet() { return this.sheet; }
  getValue() { return this.getValues()[0]?.[0] ?? ''; }
  getValues() {
    return Array.from({ length: this.rows }, (_, r) =>
      Array.from({ length: this.columns }, (_, c) => this.sheet.data[this.row - 1 + r]?.[this.column - 1 + c] ?? '')
    );
  }
  setValue(value) { return this.setValues([[value]]); }
  setValues(values) {
    for (let r = 0; r < values.length; r++) {
      const targetRow = this.row - 1 + r;
      while (this.sheet.data.length <= targetRow) this.sheet.data.push([]);
      for (let c = 0; c < values[r].length; c++) this.sheet.data[targetRow][this.column - 1 + c] = values[r][c];
    }
    this.sheet.runtime.queueUpdate(this.sheet, this.row, this.column, values);
    return this;
  }
  setNumberFormat() { return this; }
}

class SheetFacade {
  constructor(runtime, spreadsheetId, name, data = [], sheetId = null) {
    this.runtime = runtime; this.spreadsheetId = spreadsheetId; this.name = name;
    this.data = data; this.sheetId = sheetId;
  }
  getName() { return this.name; }
  getSheetId() { return this.sheetId ?? 0; }
  getLastRow() {
    for (let r = this.data.length - 1; r >= 0; r--) if ((this.data[r] || []).some(v => v !== '' && v != null)) return r + 1;
    return 0;
  }
  getLastColumn() { return this.data.reduce((max, row) => Math.max(max, row.length), 0); }
  getDataRange() { return new RangeFacade(this, 1, 1, Math.max(1, this.getLastRow()), Math.max(1, this.getLastColumn())); }
  getRange(row, column, rows = 1, columns = 1) { return new RangeFacade(this, row, column, rows, columns); }
  appendRow(values) {
    this.data.push(values.slice());
    this.runtime.operations.push({ kind: 'append', sheet: this, values: [values] });
    return this;
  }
  clear() {
    this.data = [];
    this.runtime.operations.push({ kind: 'clear', sheet: this });
    return this;
  }
  setFrozenRows() { return this; }
  autoResizeColumns() { return this; }
}

class SpreadsheetFacade {
  constructor(runtime, id) { this.runtime = runtime; this.id = id; }
  getSheetByName(name) { return this.runtime.sheets.get(this.id)?.get(name) || null; }
  insertSheet(name) {
    const book = this.runtime.sheets.get(this.id) || new Map();
    this.runtime.sheets.set(this.id, book);
    if (book.has(name)) throw new Error(`Sheet already exists: ${name}`);
    const sheet = new SheetFacade(this.runtime, this.id, name);
    book.set(name, sheet);
    this.runtime.operations.push({ kind: 'addSheet', sheet });
    return sheet;
  }
  getUrl() { return `https://docs.google.com/spreadsheets/d/${this.id}/edit`; }
}

class GoogleSheetsRuntime {
  constructor() {
    const auth = new google.auth.GoogleAuth({ credentials: credentialsFromEnv(), scopes: ['https://www.googleapis.com/auth/spreadsheets'] });
    this.api = google.sheets({ version: 'v4', auth });
    this.sheets = new Map();
    this.loadedAt = new Map();
    this.loading = new Map();
    const configuredTtl = Number(process.env.SHEETS_CACHE_TTL_MS || 60_000);
    this.cacheTtlMs = Number.isFinite(configuredTtl) ? Math.max(0, configuredTtl) : 60_000;
    this.operations = [];
    this.httpOperations = [];
    this.properties = new Map();
    this.cache = new MemoryCache();
  }

  async loadAll(options = {}) {
    return this.loadOnly(Object.keys(workbooks), options);
  }

  async loadOnly(spreadsheetIds, { force = false } = {}) {
    this.operations = []; this.httpOperations = [];
    const uniqueIds = [...new Set(spreadsheetIds)].filter(id => workbooks[id]);
    const now = Date.now();
    await Promise.all(uniqueIds.map(spreadsheetId => {
      const isFresh = this.sheets.has(spreadsheetId) && now - (this.loadedAt.get(spreadsheetId) || 0) < this.cacheTtlMs;
      if (!force && isFresh) return null;
      if (!force && this.loading.has(spreadsheetId)) return this.loading.get(spreadsheetId);
      const pending = this.loadWorkbook(spreadsheetId, workbooks[spreadsheetId])
        .then(() => this.loadedAt.set(spreadsheetId, Date.now()))
        .finally(() => this.loading.delete(spreadsheetId));
      this.loading.set(spreadsheetId, pending);
      return pending;
    }));
    if (uniqueIds.includes(ids.game)) this.loadProperties();
  }

  loadProperties() {
    const state = this.sheets.get(ids.game)?.get('系統狀態');
    this.properties.clear();
    for (const row of (state?.data || []).slice(1)) if (row[0]) this.properties.set(String(row[0]), String(row[1] ?? ''));
  }

  async loadWorkbook(spreadsheetId, requested) {
    const meta = await this.api.spreadsheets.get({ spreadsheetId, fields: 'sheets(properties(sheetId,title))' });
    const metadata = new Map((meta.data.sheets || []).map(s => [s.properties.title, s.properties.sheetId]));
    const names = requested.filter(name => metadata.has(name));
    const response = names.length ? await this.api.spreadsheets.values.batchGet({
      spreadsheetId, ranges: names.map(a1), valueRenderOption: 'FORMATTED_VALUE', dateTimeRenderOption: 'FORMATTED_STRING'
    }) : { data: { valueRanges: [] } };
    const book = new Map();
    names.forEach((name, index) => {
      const values = response.data.valueRanges?.[index]?.values || [];
      book.set(name, new SheetFacade(this, spreadsheetId, name,
        values.map(row => row.map((value, column) => maybeDate(value, spreadsheetId, name, column))), metadata.get(name)));
    });
    this.sheets.set(spreadsheetId, book);
  }

  openById(id) { return new SpreadsheetFacade(this, id); }
  queueUpdate(sheet, row, column, values) { this.operations.push({ kind: 'update', sheet, row, column, values }); }
  queueHttp(url, options = {}) { this.httpOperations.push({ url, options }); return { getResponseCode: () => 202 }; }

  setProperty(key, value) {
    this.properties.set(String(key), String(value));
    this.syncPropertiesSheet();
  }
  deleteProperty(key) { this.properties.delete(String(key)); this.syncPropertiesSheet(); }
  syncPropertiesSheet() {
    let sheet = this.sheets.get(ids.game)?.get('系統狀態');
    if (!sheet) sheet = this.openById(ids.game).insertSheet('系統狀態');
    const values = [['key', 'value'], ...this.properties.entries()];
    sheet.data = values.map(row => [...row]);
    this.operations = this.operations.filter(op => !(op.sheet === sheet && (op.kind === 'update' || op.kind === 'clear')));
    this.operations.push({ kind: 'clear', sheet }, { kind: 'update', sheet, row: 1, column: 1, values });
  }

  async flush() {
    for (const op of this.operations) {
      const spreadsheetId = op.sheet.spreadsheetId;
      if (op.kind === 'addSheet') {
        const response = await this.api.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests: [{ addSheet: { properties: { title: op.sheet.name } } }] } });
        op.sheet.sheetId = response.data.replies?.[0]?.addSheet?.properties?.sheetId;
      } else if (op.kind === 'clear') {
        await this.api.spreadsheets.values.clear({ spreadsheetId, range: a1(op.sheet.name) });
      } else if (op.kind === 'append') {
        await this.api.spreadsheets.values.append({ spreadsheetId, range: `${a1(op.sheet.name)}!A1`, valueInputOption: 'USER_ENTERED', insertDataOption: 'INSERT_ROWS', requestBody: { values: op.values } });
      } else if (op.kind === 'update') {
        const endRow = op.row + op.values.length - 1;
        const width = Math.max(...op.values.map(row => row.length));
        const endColumn = op.column + width - 1;
        const range = `${a1(op.sheet.name)}!${colName(op.column)}${op.row}:${colName(endColumn)}${endRow}`;
        await this.api.spreadsheets.values.update({ spreadsheetId, range, valueInputOption: 'USER_ENTERED', requestBody: { values: op.values } });
      }
    }
    this.operations = [];
    const calls = this.httpOperations.splice(0).map(({ url, options }) => {
      const headers = { ...(options.headers || {}) };
      if (options.contentType) headers['Content-Type'] = options.contentType;
      return fetch(url, { method: String(options.method || 'get').toUpperCase(), headers, body: options.payload }).then(async response => {
        if (!response.ok) throw new Error(`HTTP ${response.status} from ${url}: ${await response.text()}`);
      });
    });
    await Promise.all(calls);
  }
}

function installGlobals(runtime) {
  global.SpreadsheetApp = { openById: id => runtime.openById(id) };
  global.CacheService = { getScriptCache: () => runtime.cache };
  global.LockService = { getScriptLock: () => ({ waitLock() {}, tryLock() { return true; }, releaseLock() {} }) };
  const propertyBag = {
    getProperty: key => runtime.properties.get(String(key)) ?? null,
    setProperty: (key, value) => runtime.setProperty(key, value),
    deleteProperty: key => runtime.deleteProperty(key)
  };
  global.PropertiesService = { getScriptProperties: () => propertyBag, getUserProperties: () => propertyBag };
  global.Utilities = { formatDate: (date, _tz, pattern) => formatDate(date, pattern), getUuid: () => crypto.randomUUID(), sleep() {} };
  global.Session = { getScriptTimeZone: () => timezone };
  global.Logger = { log: (...args) => console.log(...args) };
  global.UrlFetchApp = { fetch: (url, options) => runtime.queueHttp(url, options) };
  global.ScriptApp = { WeekDay: { MONDAY: 1 }, getProjectTriggers: () => [], newTrigger: () => ({ timeBased() { return this; }, atHour() { return this; }, everyDays() { return this; }, onWeekDay() { return this; }, forSpreadsheet() { return this; }, onEdit() { return this; }, create() {} }) };
  global.ContentService = { createTextOutput: text => text };
}

module.exports = { GoogleSheetsRuntime, installGlobals, formatDate };
