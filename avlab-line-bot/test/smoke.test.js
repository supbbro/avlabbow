'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

process.env.LINE_CHANNEL_ACCESS_TOKEN ||= 'test-token';
process.env.GOOGLE_SERVICE_ACCOUNT_JSON ||= JSON.stringify({ client_email: 'test@example.com', private_key: 'test-key' });

const { GoogleSheetsRuntime, installGlobals, formatDate } = require('../src/runtime');
const { ids } = require('../src/config');
const runtime = new GoogleSheetsRuntime();
installGlobals(runtime);
const bot = require('../src/legacy-bot');
const externalTeaching = require('../src/external-teaching');
const { parseTeachingSheet, parseExamSheet } = require('../src/external-schedule-parser');

test('main menu survives the Apps Script to Node compatibility layer', () => {
  const reply = bot.getReply('主選單', 'U-test');
  assert.match(reply.text, /影音實驗室/);
  assert.equal(reply.quickReply.items.length, 2);
});

test('Taipei date formatter supports the patterns used by the bot', () => {
  assert.equal(formatDate(new Date('2026-08-27T12:34:00Z'), 'yyyy/MM/dd HH:mm'), '2026/08/27 20:34');
});

test('Google Sheets runtime caches each workbook and supports forced refresh', async () => {
  const cached = new GoogleSheetsRuntime();
  cached.cacheTtlMs = 60_000;
  let loads = 0;
  cached.loadWorkbook = async spreadsheetId => {
    loads++;
    cached.sheets.set(spreadsheetId, new Map());
  };
  await cached.loadOnly([ids.master]);
  await cached.loadOnly([ids.master]);
  assert.equal(loads, 1);
  await cached.loadOnly([ids.master], { force: true });
  assert.equal(loads, 2);
});

test('external commands are routed to the smaller workbook set', () => {
  assert.equal(externalTeaching.isExternalCommand('近期任務'), true);
  assert.equal(externalTeaching.isExternalCommand('開始點名 T1'), true);
  assert.equal(externalTeaching.isExternalCommand('主選單'), false);
  assert.equal(externalTeaching.requiresFreshData('開始點名 T1'), true);
  assert.equal(externalTeaching.requiresFreshData('點名狀態 T1 S1 到場'), false);
});

test('group attendance writes a normalized record and completes the task', () => {
  const resultBook = runtime.openById(ids.externalResults);
  const tasks = resultBook.insertSheet('對外任務');
  tasks.appendRow(['任務ID','學期','階段','日期','開始時間','結束時間','器材','地點','教學官／考官','考官LINE User ID','LINE群組ID','任務狀態','前一天提醒','兩小時前提醒','前一天提醒時間','兩小時前提醒時間','來源分頁','來源位置']);
  tasks.appendRow(['T1','1151','教學',new Date('2026-09-10'),'12:00','13:00','X160','401','測試者','','G1','已排定',true,true,'','','','']);
  const students = resultBook.insertSheet('任務學生');
  students.appendRow(['任務ID','學生ID','學生姓名','學號','點名順序','出席狀態','考試結果','更新時間']);
  students.appendRow(['T1','S1','學生甲','123',1,'未點名','未記錄','']);
  const attendance = resultBook.insertSheet('LINE點名紀錄');
  attendance.appendRow(['紀錄ID','任務ID','日期','開始時間','階段','器材','學生ID','學生姓名','學號','出席狀態','簡答結果','上機結果','總結果','操作考官','考官LINE User ID','記錄時間']);
  const groups = resultBook.insertSheet('LINE群組設定');
  groups.appendRow(['群組ID','群組名稱','用途','啟用','前一天提醒時間','提前提醒小時','時區','管理員','建立時間','更新時間']);
  groups.appendRow(['G1','測試群組','對外教學','是','20:00',2,'Asia/Taipei','測試者','','']);
  const binds = runtime.openById(ids.master).insertSheet('用戶綁定');
  binds.appendRow(['LINE User ID','姓名','綁定時間']);
  binds.appendRow(['U1','測試者','']);
  const context = { sourceType: 'group', chatId: 'G1', userId: 'U1' };

  assert.match(externalTeaching.handleCommand('開始點名 T1', context).text, /學生甲/);
  assert.match(externalTeaching.handleCommand('點名狀態 T1 S1 到場', context).text, /完成所有學生/);
  assert.equal(attendance.getRange(2, 10).getValue(), '到場');
  assert.match(externalTeaching.handleCommand('完成點名 T1', context).text, /任務已完成/);
  assert.equal(tasks.getRange(2, 12).getValue(), '已完成');
});

test('teaching assignments are parsed from date, time, examiner and student rows', () => {
  const rows = [
    ['', '教學週I'], ['', '9/14(一)'], ['時間', '12:00-13:00'], ['項目', '基礎配件課程'],
    ['地點', '401'], ['教學官', '考官甲'], ['學生', '學生甲'], ['', '學生乙']
  ];
  const tasks = parseTeachingSheet(rows, '教學週分班表I', '1151');
  assert.equal(tasks.length, 1);
  assert.equal(tasks[0].examiner, '考官甲');
  assert.deepEqual(tasks[0].students.map(student => student.name), ['學生甲', '學生乙']);
  assert.equal(tasks[0].date.getFullYear(), 2026);
});

test('exam assignments propagate merged date headers and choose the correct examiner column', () => {
  const rows = [
    ['', '', '考試週'], ['一般器材', '燈光器材', '3/30(一)', ''], ['項目', '', 'X160', 'Lith LED'],
    ['地點', '', '401', '402'], ['考官', '', '考官甲', '考官乙'],
    ['12:05-12:20', '12:05-12:15', '學生甲', '學生乙'], ['12:25-12:40', '12:20-12:30', '', '學生丙']
  ];
  const tasks = parseExamSheet(rows, '考試週分班表I', '1152');
  assert.equal(tasks.length, 2);
  assert.equal(tasks[1].examiner, '考官乙');
  assert.equal(tasks[1].start, '12:05');
  assert.deepEqual(tasks[1].students.map(student => student.name), ['學生乙', '學生丙']);
  assert.equal(tasks[0].date.getFullYear(), 2027);
});
