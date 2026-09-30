'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

process.env.LINE_CHANNEL_ACCESS_TOKEN ||= 'test-token';
process.env.GOOGLE_SERVICE_ACCOUNT_JSON ||= JSON.stringify({ client_email: 'test@example.com', private_key: 'test-key' });

const { GoogleSheetsRuntime, installGlobals } = require('../src/runtime');
const { ids } = require('../src/config');
const changes = require('../src/external-student-changes');

function addRows(sheet, rows) { rows.forEach(row => sheet.appendRow(row)); }

test('student change responses move, cancel, detect existing work, and keep full targets safe', () => {
  const runtime = new GoogleSheetsRuntime();
  installGlobals(runtime);

  const schedule = runtime.openById(ids.externalClassSchedule);
  const regular = schedule.insertSheet('考試週分班表I');
  addRows(regular, [
    ['', '', '考試週'],
    ['一般器材', '燈光器材', '10/8(四)', '', '10/13(二)', '10/14(三)'],
    ['項目', '', '軟殼燈', '', 'CX350', 'atomos'],
    ['地點', '', '403', '', '401', '402'],
    ['考官', '', '考官甲', '', '考官乙', '考官丙'],
    ['18:05-18:20', '18:05-18:15', '取消生', '', '滿位甲', '移動生'],
    ['18:25-18:40', '18:20-18:30', '', '', '滿位乙', ''],
    ['18:45-19:00', '18:35-18:45', '', '', '滿位丙', ''],
    ['19:05-19:20', '18:50-19:00', '', '', '滿位丁', '']
  ]);
  const early = schedule.insertSheet('侯班影製提前考試週');
  addRows(early, [
    ['', '', '提前考試'],
    ['一般器材', '燈光器材', '10/5(一)', '10/6(二)'],
    ['項目', '', 'CX350', 'atomos'],
    ['地點', '', '417', '403'],
    ['考官', '', '考官丁', '考官戊'],
    ['18:05-18:20', '18:05-18:15', '新滿甲', ''],
    ['18:25-18:40', '18:20-18:30', '新滿乙', ''],
    ['18:45-19:00', '18:35-18:45', '新滿丙', ''],
    ['19:05-19:20', '18:50-19:00', '新滿丁', ''],
    ['19:25-19:40', '19:05-19:15', '已移動生', '']
  ]);

  const response = runtime.openById(ids.externalStudentChange).insertSheet('表單回覆 1');
  addRows(response, [
    ['時間戳記', '電子郵件', '', '', '姓名', '', '學號', '', '',
      '軟殼燈考試原報名時段', '軟殼燈考試修改時段',
      'CX350考試原報名時段', 'CX350考試修改時段',
      'Atomos螢幕考試原報名時段', 'Atomos螢幕考試修改時段'],
    ['2026/9/30 10:00', '', '', '', '取消生', '', '1001', '', '', '10/08 18:00-20:00', '取消報名'],
    ['2026/9/30 10:01', '', '', '', '移動生', '', '1002', '', '', '', '', '', '', '10/14 18:00-20:00', '10/06 18:00-20:00'],
    ['2026/9/30 10:02', '', '', '', '滿位甲', '', '1003', '', '', '', '', '10/13 18:00-20:00', '10/05 18:00-20:00'],
    ['2026/9/30 10:03', '', '', '', '已移動生', '', '1004', '', '', '', '', '10/13 18:00-20:00', '10/05 18:00-20:00']
  ]);
  const resultBook = runtime.openById(ids.externalResults);
  const log = resultBook.insertSheet('分班更改同步紀錄');
  log.appendRow(['處理鍵', '表單列', '送出時間', '姓名', '學號', '項目', '原時段', '新時段', '同步狀態', '最後處理時間']);

  let syncs = 0;
  const result = changes.processPendingStudentChanges({ syncSchedule: () => { syncs++; } });
  assert.deepEqual(result, { processed: 4, changed: 2, waiting: 1 });
  assert.equal(regular.getRange(6, 3).getValue(), '');
  assert.equal(regular.getRange(6, 6).getValue(), '');
  assert.equal(early.getRange(6, 4).getValue(), '移動生');
  assert.equal(regular.getRange(6, 5).getValue(), '滿位甲', 'full target must leave the old assignment intact');
  assert.equal(early.getRange(10, 3).getValue(), '已移動生');
  assert.equal(syncs, 1);
  const statuses = log.getDataRange().getValues().slice(1).map(row => row[8]);
  assert.equal(statuses.some(status => /^已同步：取消/.test(status)), true);
  assert.equal(statuses.some(status => /已同步：.*→/.test(status)), true);
  assert.equal(statuses.includes('待人工處理：新時段已滿'), true);
  assert.equal(statuses.includes('略過：已人工同步完成'), true);

  const second = changes.processPendingStudentChanges({ syncSchedule: () => { syncs++; } });
  assert.deepEqual(second, { processed: 1, changed: 0, waiting: 1 });
  assert.equal(log.getLastRow(), 5, 'retrying a waiting row must update the same log row');
});
