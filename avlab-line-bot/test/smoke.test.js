'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

process.env.LINE_CHANNEL_ACCESS_TOKEN ||= 'test-token';
process.env.GOOGLE_SERVICE_ACCOUNT_JSON ||= JSON.stringify({ client_email: 'test@example.com', private_key: 'test-key' });

const { GoogleSheetsRuntime, installGlobals, formatDate, sheetApiValue } = require('../src/runtime');
const { ids } = require('../src/config');
const runtime = new GoogleSheetsRuntime();
installGlobals(runtime);
const bot = require('../src/legacy-bot');
const externalTeaching = require('../src/external-teaching');
const { parseTeachingSheet, parseExamSheet } = require('../src/external-schedule-parser');
const { parseInternalTaskWorkbook } = require('../src/internal-task-parser');

test('main menu survives the Apps Script to Node compatibility layer', () => {
  const reply = bot.getReply('主選單', 'U-test');
  assert.match(reply.text, /影音實驗室/);
  assert.equal(reply.quickReply.items.length, 2);
});

test('menus omit retired links and common links only show current 1151 files', () => {
  const common = bot.getReply('常用連結', 'U-test').text;
  assert.match(common, /1151 教學總排程/);
  assert.match(common, /1151 對內教學官／考官安排/);
  assert.doesNotMatch(common, /對內點名表|助理認證狀況表|對內統整表格/);

  const internalLabels = bot.getReply('助理更多', 'U-test').quickReply.items.map(item => item.action.label);
  assert.equal(internalLabels.some(label => /統整表|認證狀況|各級認證項目/.test(label)), false);
  const externalLabels = bot.getReply('對外更多', 'U-test').quickReply.items.map(item => item.action.label);
  assert.equal(externalLabels.some(label => /考試項目/.test(label)), false);
});

test('Taipei date formatter supports the patterns used by the bot', () => {
  assert.equal(formatDate(new Date('2026-08-27T12:34:00Z'), 'yyyy/MM/dd HH:mm'), '2026/08/27 20:34');
  assert.equal(sheetApiValue(new Date('2026-08-29T16:00:00Z')), '2026/08/30 00:00:00');
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

test('forced value refresh reuses cached spreadsheet metadata', async () => {
  const cached = new GoogleSheetsRuntime();
  let metadataLoads = 0, valueLoads = 0;
  cached.api = { spreadsheets: {
    get: async () => { metadataLoads++; return { data: { sheets: [{ properties: { title: '測試分頁', sheetId: 1 } }] } }; },
    values: { batchGet: async () => { valueLoads++; return { data: { valueRanges: [{ values: [['欄位'], ['內容']] }] } }; } }
  } };
  await cached.loadWorkbook('TEST', ['測試分頁']);
  await cached.loadWorkbook('TEST', ['測試分頁']);
  assert.equal(metadataLoads, 1);
  assert.equal(valueLoads, 2);
});

test('selected workbook refresh leaves the other cached workbooks untouched', async () => {
  const cached = new GoogleSheetsRuntime();
  const loads = new Map();
  cached.loadWorkbook = async spreadsheetId => {
    loads.set(spreadsheetId, (loads.get(spreadsheetId) || 0) + 1);
    cached.sheets.set(spreadsheetId, new Map());
  };
  await cached.loadOnly([ids.task, ids.master]);
  await cached.loadOnly([ids.task, ids.master], { forceIds: [ids.task] });
  assert.equal(loads.get(ids.task), 2);
  assert.equal(loads.get(ids.master), 1);
});

test('schedule sync treats timestamps on the same Taipei calendar day as the same task date', () => {
  const current = Array(18).fill('');
  const desired = Array(18).fill('');
  current[3] = new Date('2026-08-29T16:00:00.000Z');
  desired[3] = new Date('2026-08-30T00:00:00.000Z');
  assert.equal(externalTeaching._test.rowChanged(current, desired), false);
});

test('only a reminder timestamp close to the current task start suppresses a new notification', () => {
  const taskDate = new Date('2026-09-01T16:00:00.000Z');
  assert.equal(externalTeaching._test.reminderBelongsToSchedule(new Date('2026-09-02T09:05:00.000Z'), taskDate, '18:05'), true);
  assert.equal(externalTeaching._test.reminderBelongsToSchedule(new Date('2026-07-16T16:00:00.000Z'), taskDate, '18:05'), false);
});

test('task start is interpreted in Taipei regardless of the Railway process timezone', () => {
  const start = externalTeaching._test.parseTaskStart({
    date: new Date('2026-09-01T16:00:00.000Z'),
    start: '6:05:00 下午'
  });
  assert.equal(start.toISOString(), '2026-09-02T10:05:00.000Z');
});

test('external commands are routed to the smaller workbook set', () => {
  assert.equal(externalTeaching.isExternalCommand('近期任務'), true);
  assert.equal(externalTeaching.isExternalCommand('開始點名 T1'), true);
  assert.equal(externalTeaching.isExternalCommand('主選單'), false);
  assert.equal(externalTeaching.requiresFreshData('開始點名 T1'), true);
  assert.equal(externalTeaching.requiresFreshData('點名狀態 T1 S1 到場'), false);
  assert.equal(externalTeaching.isCombinedTaskQuery('任務 黃忻妤'), true);
  assert.equal(externalTeaching.isCombinedTaskQuery('近期任務'), false);
});

test('name task query includes assignments synchronized from the external schedule', () => {
  const assistantBook = runtime.openById(ids.assistant);
  const assistants = assistantBook.getSheetByName('助理名單') || assistantBook.insertSheet('助理名單');
  if (!assistants.getLastRow()) assistants.appendRow(['姓名']);
  assistants.appendRow(['黃忻妤']);
  const resultBook = runtime.openById(ids.externalResults);
  const tasks = resultBook.getSheetByName('對外任務') || resultBook.insertSheet('對外任務');
  if (!tasks.getLastRow()) tasks.appendRow(['任務ID','學期','階段','日期','開始時間','結束時間','器材','地點','教學官／考官','考官LINE User ID','LINE群組ID','任務狀態']);
  tasks.appendRow(['EXT-NAME-QUERY','1151','教學',new Date('2026-03-17'),'12:00','13:00','基礎配件課程','大勇401','黃忻妤','','','已排定']);
  const response = bot.getReply('任務 黃忻妤', 'U-test');
  assert.match(response.text, /黃忻妤 的教學\/考官任務/);
  assert.match(response.text, /\[對外\].*基礎配件課程/);
  assert.match(response.text, /任務已過期/);
});

test('task query can find an examiner who is not in the assistant roster', () => {
  const tasks = runtime.openById(ids.externalResults).getSheetByName('對外任務');
  tasks.appendRow(['EXT-TEMP-EXAMINER','1151','教學',new Date('2026-03-19'),'12:00','13:00','聲音工作區','聲音工作區','真假','','','已排定']);
  const response = bot.getReply('任務 真假', 'U-test');
  assert.match(response.text, /真假 的教學\/考官任務/);
  assert.match(response.text, /\[對外\].*聲音工作區/);
  assert.doesNotMatch(response.text, /助理名單/);
});

test('group attendance writes a normalized record and completes the task', () => {
  const resultBook = runtime.openById(ids.externalResults);
  const tasks = resultBook.getSheetByName('對外任務') || resultBook.insertSheet('對外任務');
  if (!tasks.getLastRow()) tasks.appendRow(['任務ID','學期','階段','日期','開始時間','結束時間','器材','地點','教學官／考官','考官LINE User ID','LINE群組ID','任務狀態','前一天提醒','兩小時前提醒','前一天提醒時間','兩小時前提醒時間','來源分頁','來源位置']);
  tasks.appendRow(['T1','1151','教學',new Date('2026-09-10'),'12:00','13:00','X160','401','測試者','','G1','已排定',true,true,'','','','']);
  const taskRow = tasks.getLastRow();
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

  const attendanceStart = externalTeaching.handleCommand('開始點名 T1', context);
  assert.match(attendanceStart.text, /學生甲/);
  assert.equal(attendanceStart.lineMessage.type, 'template');
  assert.equal(attendanceStart.lineMessage.template.type, 'carousel');
  assert.deepEqual(attendanceStart.lineMessage.template.columns[0].actions.map(action => action.label), ['準時', '遲到', '缺席']);
  assert.deepEqual(attendanceStart.fallbackQuickReply.items.map(item => item.action.label), ['學生甲 準時', '學生甲 遲到', '學生甲 缺席']);
  assert.match(externalTeaching.handleCommand('點名狀態 T1 S1 到場', context).text, /完成所有學生/);
  assert.equal(attendance.getRange(2, 10).getValue(), '到場');
  const finished = externalTeaching.handleCommand('完成點名 T1', context);
  assert.match(finished.text, /任務已完成/);
  assert.equal(finished.quickReply.items[0].action.type, 'uri');
  assert.match(finished.quickReply.items[0].action.uri, new RegExp(ids.externalResults));
  assert.equal(tasks.getRange(taskRow, 12).getValue(), '已完成');
});

test('one-hour reminder pushes the roster to the examiner and assigned group', () => {
  const resultBook = runtime.openById(ids.externalResults);
  const tasks = resultBook.getSheetByName('對外任務');
  const students = resultBook.getSheetByName('任務學生');
  tasks.appendRow(['T-REMIND','1151','考試',new Date(2026, 8, 11),'12:00','13:00','X160','401','測試者','U1','G1','已排定',true,true,'','','','']);
  students.appendRow(['T-REMIND','S2','學生乙','456',1,'未點名','未記錄','']);
  runtime.httpOperations = [];

  const sent = externalTeaching.sendExternalReminders(new Date(2026, 8, 11, 11, 0));
  assert.equal(sent, 2);
  const pushes = runtime.httpOperations.map(operation => JSON.parse(operation.options.payload));
  assert.deepEqual(new Set(pushes.map(push => push.to)), new Set(['U1', 'G1']));
  for (const push of pushes) {
    assert.match(push.messages[0].text, /1 小時後/);
    assert.match(push.messages[0].text, /學生乙/);
    assert.equal(push.messages[0].quickReply.items[0].action.text, '開始點名 T-REMIND');
  }
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

test('1151 Excel examiner table is normalized and multi-examiner cells are searchable', () => {
  const normalized = parseInternalTaskWorkbook({
    '考官安排': [
      ['1151 對內教學官／考官安排', '', '', ''],
      ['時程', '級別', '項目', '教學官／考官＆考試地點'],
      ['9/6\n暑訓教學\n5人', '一級', 'Flo Box', '王鈺慈（出機區）'],
      ['', '見習', '棚內機(CX350)', '吳青璇、詹詠丞（新棚）']
    ]
  }, '1151');
  assert.equal(normalized.length, 4);
  assert.deepEqual(normalized.slice(1).map(row => row[4]), ['王鈺慈', '吳青璇', '詹詠丞']);
  assert.equal(normalized[3][5], '新棚');
  assert.equal(normalized[1][0].getFullYear(), 2026);
  assert.equal(normalized[2][1], '暑訓教學');
});
