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
const internalTeaching = require('../src/internal-teaching');
const externalTeaching = require('../src/external-teaching');
const externalGroupSync = require('../src/external-group-sync');
const { parseTeachingSheet, parseExamSheet } = require('../src/external-schedule-parser');
const { parseInternalTaskWorkbook } = require('../src/internal-task-parser');
const { parseDepositWorkbook } = require('../src/deposit-parser');
const { parseRegistrationRows } = require('../src/external-registration-parser');
const navigation = require('../src/navigation');

test('main menu survives the Apps Script to Node compatibility layer', () => {
  const reply = bot.getReply('主選單', 'U-test');
  assert.match(reply.text, /影音實驗室/);
  assert.equal(reply.quickReply.items.length, 2);
  assert.deepEqual(reply.quickReply.items.map(item => item.action.text), ['選擇對外學生', '選擇中心助理']);
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

test('submenu pages consistently provide back and home navigation', () => {
  for (const [index, command] of ['對外更多', '查詢', '助理排程', '助理工具', '請假選項', '流程'].entries()) {
    const page = bot.getReply(command, `U-nav-${index}`);
    const labels = page.quickReply.items.map(item => item.action.label);
    assert.equal(labels.some(label => label.includes('回上一頁')), true, command);
    assert.equal(labels.some(label => label.includes('回首頁')), true, command);
    const back = page.quickReply.items.find(item => item.action.label.includes('回上一頁'));
    assert.equal(back.action.text, '回上一頁', command);
  }
  const externalMain = bot.getReply('對外學生', 'U-nav-external').quickReply.items.map(item => item.action.label);
  const internalMain = bot.getReply('中心助理', 'U-nav-internal').quickReply.items.map(item => item.action.label);
  assert.equal(externalMain.some(label => label.includes('回首頁')), true);
  assert.equal(internalMain.some(label => label.includes('回首頁')), true);
});

test('internal menu groups each feature once without a catch-all more page', () => {
  const main = bot.getReply('中心助理', 'U-menu').quickReply.items.map(item => item.action);
  assert.equal(main.some(action => action.text === '助理更多'), false);
  assert.deepEqual(main.filter(action => ['查詢', '請假選項', '助理排程', '助理工具'].includes(action.text)).map(action => action.text), [
    '查詢', '請假選項', '助理排程', '助理工具'
  ]);

  const query = bot.getReply('查詢', 'U-menu-query').quickReply.items.map(item => item.action.text);
  const leave = bot.getReply('請假選項', 'U-menu-leave').quickReply.items.map(item => item.action.text);
  const schedule = bot.getReply('助理排程', 'U-menu-schedule').quickReply.items.map(item => item.action.text);
  assert.equal(query.includes('代班查詢'), false);
  assert.equal(query.includes('查任務'), false);
  assert.equal(leave.includes('代班查詢'), true);
  assert.equal(leave.includes('找代班'), false);
  assert.equal(schedule.includes('常用連結'), false);
  assert.equal(query.includes('我的暫定排班'), false);
  assert.equal(schedule.some(command => /暫定/.test(command)), false);
});

test('back navigation returns through the real per-user page history', () => {
  const cache = new Map();
  const facade = {
    get: key => cache.get(key) || null,
    put: (key, value) => cache.set(key, value)
  };
  const userId = 'U-history';
  for (const command of ['主選單', '中心助理', '查詢', '認證', '認證 徐嘉翔']) {
    navigation.remember(facade, userId, command, true);
  }
  assert.equal(navigation.resolve(facade, userId, '回上一頁').command, '認證');
  assert.equal(navigation.resolve(facade, userId, '回上一頁').command, '查詢');
  assert.equal(navigation.resolve(facade, userId, '回上一頁').command, '中心助理');
  navigation.remember(facade, userId, '主選單', true);
  assert.equal(navigation.resolve(facade, userId, '回上一頁').command, '主選單');
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

test('a reminder on the current task day suppresses duplicates even when the sheet hides its time', () => {
  const taskDate = new Date('2026-09-01T16:00:00.000Z');
  assert.equal(externalTeaching._test.reminderBelongsToSchedule(new Date('2026-09-01T16:00:00.000Z'), taskDate, '18:05'), true);
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

test('my task query includes internal and external assignments', () => {
  const assistantBook = runtime.openById(ids.assistant);
  const assistants = assistantBook.getSheetByName('助理名單') || assistantBook.insertSheet('助理名單');
  if (!assistants.getLastRow()) assistants.appendRow(['姓名']);
  assistants.appendRow(['黃忻妤']);
  const resultBook = runtime.openById(ids.externalResults);
  const tasks = resultBook.getSheetByName('對外任務') || resultBook.insertSheet('對外任務');
  if (!tasks.getLastRow()) tasks.appendRow(['任務ID','學期','階段','日期','開始時間','結束時間','器材','地點','教學官／考官','考官LINE User ID','LINE群組ID','任務狀態']);
  tasks.appendRow(['EXT-NAME-QUERY','1151','教學',new Date('2026-03-17'),'12:00','13:00','基礎配件課程','大勇401','黃忻妤','','','已排定']);
  const internalTasks = runtime.openById(ids.task).getSheetByName('1151 對內教學官／考官安排') || runtime.openById(ids.task).insertSheet('1151 對內教學官／考官安排');
  if (!internalTasks.getLastRow()) internalTasks.appendRow(['日期','階段','級別','項目','教學官／考官','地點']);
  internalTasks.appendRow([new Date('2026-03-18'),'期中教學','二級','導播台','黃忻妤','新棚']);
  const binds = runtime.openById(ids.master).getSheetByName('用戶綁定') || runtime.openById(ids.master).insertSheet('用戶綁定');
  if (!binds.getLastRow()) binds.appendRow(['LINE User ID','姓名','綁定時間','學號']);
  binds.appendRow(['U-COMBINED','黃忻妤','','112703005']);
  const mine = bot.getReply('我的任務', 'U-COMBINED');
  assert.match(mine.text, /黃忻妤 的對內＋對外教學官／考官任務/);
  assert.match(mine.text, /\[對內\].*導播台/);
  assert.match(mine.text, /\[對外\].*基礎配件課程/);
  assert.match(mine.text, /任務已過期/);
});

test('other peoples tasks cannot be queried by name', () => {
  const tasks = runtime.openById(ids.externalResults).getSheetByName('對外任務');
  tasks.appendRow(['EXT-TEMP-EXAMINER','1151','教學',new Date('2026-03-19'),'12:00','13:00','聲音工作區','聲音工作區','真假','','','已排定']);
  const response = bot.getReply('任務 真假', 'U-test');
  assert.doesNotMatch(response.text, /真假 的對內＋對外教學官／考官任務/);
  assert.doesNotMatch(response.text, /\[對外\].*聲音工作區/);
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
  const binds = runtime.openById(ids.master).getSheetByName('用戶綁定') || runtime.openById(ids.master).insertSheet('用戶綁定');
  if (!binds.getLastRow()) binds.appendRow(['LINE User ID','姓名','綁定時間','學號']);
  binds.appendRow(['U1','測試者','']);
  const context = { sourceType: 'group', chatId: 'G1', userId: 'U1' };

  const attendanceStart = externalTeaching.handleCommand('開始點名 T1', context);
  assert.match(attendanceStart.text, /學生甲/);
  assert.match(attendanceStart.text, /考生名單/);
  assert.equal(attendanceStart.lineMessage.type, 'template');
  assert.equal(attendanceStart.lineMessage.template.type, 'carousel');
  assert.equal(attendanceStart.lineMessage.template.columns[0].title, '學生甲');
  assert.deepEqual(attendanceStart.lineMessage.template.columns[0].actions.map(action => action.label), ['學生已到（自動判定）', '請假', '缺席']);
  assert.equal(attendanceStart.lineMessage.template.columns[0].actions[0].type, 'postback');
  const studentPrompt = externalTeaching.handleCommand('查看考生 T1 S1', context);
  assert.match(studentPrompt.text, /15 分鐘後點名為遲到/);
  assert.deepEqual(studentPrompt.quickReply.items.slice(0, 3).map(item => item.action.label), ['✅ 學生已到', '📝 請假', '❌ 缺席']);
  assert.match(externalTeaching.handleCommand('點名狀態 T1 S1 到場', context).text, /已登記 學生甲：到場/);
  assert.equal(attendance.getRange(2, 10).getValue(), '到場');
  const finished = externalTeaching.handleCommand('完成點名 T1', context);
  assert.match(finished.text, /任務已完成/);
  assert.equal(finished.quickReply.items[0].action.type, 'uri');
  assert.match(finished.quickReply.items[0].action.uri, new RegExp(ids.externalResults));
  assert.equal(tasks.getRange(taskRow, 12).getValue(), '已完成');
});

test('retest preserves the passed written result and only asks for the practical result', () => {
  const resultBook = runtime.openById(ids.externalResults);
  const tasks = resultBook.getSheetByName('對外任務');
  const students = resultBook.getSheetByName('任務學生');
  const attendance = resultBook.getSheetByName('LINE點名紀錄');
  const context = { sourceType: 'group', chatId: 'G1', userId: 'U1' };

  tasks.appendRow(['T-EXAM-CUM','1151','考試',new Date('2026-09-12'),'12:00','13:00','CX350','401','測試者','','G1','已排定',true,true,'','','','']);
  students.appendRow(['T-EXAM-CUM','S-EXAM-CUM','補考學生','999',1,'未點名','未記錄','']);
  const examMenu = externalTeaching.handleCommand('開始點名 T-EXAM-CUM', context);
  assert.deepEqual(examMenu.lineMessage.template.columns[0].actions.map(action => action.label), ['考生已到', '查看／評分']);
  const attendancePrompt = externalTeaching.handleCommand('查看考生 T-EXAM-CUM S-EXAM-CUM', context);
  assert.equal(attendancePrompt.quickReply.items.some(item => item.action.label.includes('取消資格')), false);
  const firstPrompt = externalTeaching.handleCommand('點名狀態 T-EXAM-CUM S-EXAM-CUM 到場', context);
  assert.match(firstPrompt.text, /簡答題：⏳ 尚未評分/);
  assert.match(firstPrompt.text, /上機：⏳ 尚未評分/);
  assert.doesNotMatch(firstPrompt.text, /保證金：/);
  assert.equal(firstPrompt.quickReply.items[0].action.type, 'postback');
  const practicalPrompt = externalTeaching.handleCommand('簡答登記 T-EXAM-CUM S-EXAM-CUM 通過', context);
  assert.match(practicalPrompt.text, /簡答題：✅ 通過/);
  assert.match(practicalPrompt.text, /上機：⏳ 尚未評分/);
  assert.doesNotMatch(practicalPrompt.text, /保證金：/);
  const failed = externalTeaching.handleCommand('上機登記 T-EXAM-CUM S-EXAM-CUM 未通過', context);
  assert.match(failed.text, /請考官務必提醒考生填寫第一次補考表單/);
  assert.match(failed.text, /未通過項目：上機/);
  assert.match(failed.text, /考生尚未完成 LINE 姓名綁定/);

  tasks.appendRow(['T-RETEST-CUM','1151','第一次補考',new Date('2026-09-19'),'12:00','13:00','CX350','401','測試者','','G1','已排定',true,true,'','','','']);
  students.appendRow(['T-RETEST-CUM','S-RETEST-CUM','補考學生','999',1,'未點名','未記錄','']);
  externalTeaching.handleCommand('開始點名 T-RETEST-CUM', context);
  const retestPrompt = externalTeaching.handleCommand('點名狀態 T-RETEST-CUM S-RETEST-CUM 到場', context);
  const resultLabels = retestPrompt.quickReply.items.map(item => item.action.label);
  assert.match(retestPrompt.text, /簡答題：✅ 通過/);
  assert.match(retestPrompt.text, /上機：⏳ 尚未評分/);
  assert.equal(resultLabels.some(label => label === '上機 ✅'), true);
  assert.equal(resultLabels.some(label => label === '上機 ❌'), true);
  assert.equal(resultLabels.some(label => label.includes('簡答題')), false);

  const completed = externalTeaching.handleCommand('上機登記 T-RETEST-CUM S-RETEST-CUM 通過', context);
  assert.match(completed.text, /可退保證金/);
  const rows = attendance.getDataRange().getValues();
  const retestRow = rows.find(row => row[0] === 'T-RETEST-CUM:S-RETEST-CUM');
  assert.equal(retestRow[16], '通過');
  assert.equal(retestRow[17], '通過');
  assert.equal(retestRow[18], '可退保證金');
});

test('arrival grace rules are five minutes for exams and fifteen minutes for teaching', () => {
  const date = new Date('2026-09-02T00:00:00+08:00');
  const student = { scheduledStart: '12:00' };
  assert.equal(externalTeaching._test.automaticArrivalStatus({ phase: '考試', date, start: '12:00' }, student, new Date('2026-09-02T12:05:00+08:00')), '到場');
  assert.equal(externalTeaching._test.automaticArrivalStatus({ phase: '考試', date, start: '12:00' }, student, new Date('2026-09-02T12:05:01+08:00')), '取消資格');
  assert.equal(externalTeaching._test.automaticArrivalStatus({ phase: '教學', date, start: '12:00' }, student, new Date('2026-09-02T12:15:01+08:00')), '遲到');
  const teachingReminder = externalTeaching._test.studentReminderText(
    { phase: '教學', date, start: '12:00', end: '13:00', equipment: 'X160', location: '401' },
    { name: '虛擬學生', scheduledStart: '12:10', scheduledEnd: '13:00' }
  );
  assert.match(teachingReminder, /對外教學將於 1 小時內開始/);
  assert.match(teachingReminder, /超過 15 分鐘.*遲到/);
  assert.doesNotMatch(teachingReminder, /取消本次考試資格/);
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
    assert.match(push.messages[0].text, /1 小時內/);
    assert.match(push.messages[0].text, /學生乙/);
    assert.equal(push.messages[0].quickReply.items[0].action.text, '開始點名 T-REMIND');
  }
});

test('a roster student can bind LINE and receives a retest form after failed grading', () => {
  const resultBook = runtime.openById(ids.externalResults);
  const tasks = resultBook.getSheetByName('對外任務');
  const students = resultBook.getSheetByName('任務學生');
  students.appendRow(['EXT-BIND-TEST', 'STU-BIND-TEST', '外部測試生', 'TEST', 1, '未點名', '未記錄', '', '13:00', '13:15', '']);
  bot.getReply('選擇對外學生', 'U-external-student-typo-test');
  const typoResponse = bot.getReply('我是 外部測試身 TEST', 'U-external-student-typo-test');
  assert.match(typoResponse.text, /姓名或學號/);
  assert.doesNotMatch(typoResponse.text, /綁定成功/);
  bot.getReply('選擇對外學生', 'U-external-student-test');
  const missingNumber = bot.getReply('我是 外部測試生', 'U-external-student-test');
  assert.match(missingNumber.text, /學號/);
  assert.doesNotMatch(missingNumber.text, /綁定成功/);
  const response = bot.getReply('我是 外部測試生 TEST', 'U-external-student-test');
  assert.match(response.text, /綁定成功/);
  assert.match(response.text, /外部測試生/);

  tasks.appendRow(['EXT-BIND-TEST','1151','考試',new Date('2026-09-20'),'12:00','13:00','H6','401','測試者','','G1','已排定',true,true,'','','','']);
  runtime.httpOperations = [];
  const reminderCount = externalTeaching.sendExternalReminders(new Date('2026-09-20T12:00:00+08:00'));
  assert.equal(reminderCount, 1);
  const reminderPush = JSON.parse(runtime.httpOperations[0].options.payload);
  assert.equal(reminderPush.to, 'U-external-student-test');
  assert.match(reminderPush.messages[0].text, /13:00-13:15/);
  assert.match(reminderPush.messages[0].text, /超過 5 分鐘/);

  const context = { sourceType: 'group', chatId: 'G1', userId: 'U1' };
  externalTeaching.handleCommand('開始點名 EXT-BIND-TEST', context);
  externalTeaching.handleCommand('點名狀態 EXT-BIND-TEST STU-BIND-TEST 到場', context);
  externalTeaching.handleCommand('簡答登記 EXT-BIND-TEST STU-BIND-TEST 通過', context);
  const previousUrl = process.env.EXTERNAL_FIRST_RETEST_FORM_URL;
  process.env.EXTERNAL_FIRST_RETEST_FORM_URL = 'https://docs.google.com/forms/d/FAKE/viewform';
  runtime.httpOperations = [];
  const failed = externalTeaching.handleCommand('上機登記 EXT-BIND-TEST STU-BIND-TEST 未通過', context);
  if (previousUrl === undefined) delete process.env.EXTERNAL_FIRST_RETEST_FORM_URL;
  else process.env.EXTERNAL_FIRST_RETEST_FORM_URL = previousUrl;
  assert.match(failed.text, /已私訊已綁定的考生/);
  const push = JSON.parse(runtime.httpOperations[0].options.payload);
  assert.equal(push.to, 'U-external-student-test');
  assert.match(push.messages[0].text, /上機/);
  assert.match(push.messages[0].text, /報名連結：https:\/\/docs\.google\.com\/forms/);
  assert.equal(push.messages[0].quickReply.items[0].action.uri, 'https://docs.google.com/forms/d/FAKE/viewform');
});

test('assistant identity binding only accepts the active attendance roster', () => {
  const attendanceBook = runtime.openById(ids.internalAttendance);
  const roster = attendanceBook.getSheetByName('教學考試點名和通過情況總表') || attendanceBook.insertSheet('教學考試點名和通過情況總表');
  const rows = [['姓名／項目','學號']];
  for (let index = 1; index <= 53; index++) rows.push([`現役${String(index).padStart(2, '0')}`, `123456${String(index).padStart(3, '0')}`]);
  roster.getRange(1, 1, rows.length, 2).setValues(rows);

  assert.match(bot.getReply('選擇中心助理', 'U-active-assistant').text, /53 位中心助理/);
  const active = bot.getReply('我是 現役01', 'U-active-assistant');
  assert.match(active.text, /綁定成功/);
  assert.match(active.text, /助理資訊/);

  bot.getReply('選擇中心助理', 'U-retired-assistant');
  const retired = bot.getReply('我是 已退助理', 'U-retired-assistant');
  assert.match(retired.text, /查無/);
  assert.doesNotMatch(retired.text, /綁定成功/);
});

test('a failed short answer immediately ends the attempt without practical buttons', () => {
  const resultBook = runtime.openById(ids.externalResults);
  const tasks = resultBook.getSheetByName('對外任務');
  const students = resultBook.getSheetByName('任務學生');
  tasks.appendRow(['EXT-SHORT-FAIL','1151','考試',new Date('2026-09-22'),'12:00','13:00','200W Par','417','測試者','','G1','已排定',true,true,'','','考試週分班表I','C3:C8']);
  students.appendRow(['EXT-SHORT-FAIL','STU-SHORT-FAIL','簡答未過生','SHORT001',1,'到場','未記錄','','12:00','12:15','']);
  const context = { sourceType: 'group', chatId: 'G1', userId: 'U1' };
  const completed = externalTeaching.handleCommand('簡答登記 EXT-SHORT-FAIL STU-SHORT-FAIL 未通過', context);
  assert.match(completed.text, /簡答題：❌ 未通過/);
  assert.match(completed.text, /上機：⛔ 無上機資格/);
  assert.match(completed.text, /未通過項目：簡答題/);
  assert.equal(completed.quickReply.items.some(item => item.action.label.includes('上機')), false);
  const blocked = externalTeaching.handleCommand('上機登記 EXT-SHORT-FAIL STU-SHORT-FAIL 通過', context);
  assert.match(blocked.text, /沒有上機考試資格/);
});

test('a bound student receives the teaching reminder with the fifteen-minute rule', () => {
  const resultBook = runtime.openById(ids.externalResults);
  const tasks = resultBook.getSheetByName('對外任務');
  const students = resultBook.getSheetByName('任務學生');
  tasks.appendRow(['EXT-TEACH-REMIND','1151','教學',new Date('2026-09-21'),'14:00','15:00','X160','401','測試者','','G1','已排定',true,true,'','','','']);
  students.appendRow(['EXT-TEACH-REMIND','STU-TEACH-REMIND','外部測試生','TEST',1,'未點名','未記錄','','14:00','15:00','']);
  runtime.httpOperations = [];
  assert.equal(externalTeaching.sendExternalReminders(new Date('2026-09-21T13:00:00+08:00')), 3);
  const pushes = runtime.httpOperations.map(operation => JSON.parse(operation.options.payload));
  const studentPush = pushes.find(push => push.to === 'U-external-student-test');
  assert.ok(studentPush);
  assert.match(studentPush.messages[0].text, /對外教學將於 1 小時內開始/);
  assert.match(studentPush.messages[0].text, /超過 15 分鐘.*遲到/);
});

test('failed exam stages select the next retest form and stop after the second retest', () => {
  assert.equal(externalTeaching._test.retestForm({ phase: '考試' }).url, 'https://forms.gle/3be87wRzRBKvdkFb6');
  assert.equal(externalTeaching._test.retestForm({ phase: '第一次補考' }).url, 'https://forms.gle/t1vrm4U43xMhoWxD9');
  assert.equal(externalTeaching._test.retestForm({ phase: '第二次補考' }).finalAttempt, true);
  assert.match(externalTeaching._test.retestMessage({ equipment: 'H6' }, { name: '學生甲' }, ['上機'], '第一次補考', 'https://forms.gle/first'), /第二次補考須繳交 100 元，且不退費/);
  assert.match(externalTeaching._test.retestMessage({ equipment: 'H6' }, { name: '學生甲' }, ['上機'], '第二次補考', 'https://forms.gle/second'), /第二次補考須繳交 100 元，且不退費/);
});

test('deposit workbook parser normalizes initial and retest payment rows', () => {
  const parsed = parseDepositWorkbook({
    '考試保證金': [
      ['說明'], ['姓名','系級','學號','報名考試項目','總共項數','保證金總額','已繳交','繳交金額'],
      ['學生甲','廣電一','1001','H6',1,100,true,100]
    ],
    '第一次補考保證金': [
      ['姓名','學號','須補交補考保證金之考試項目(原因)','已繳交','繳交金額'],
      ['學生乙','1002','X160',false,'']
    ],
    '第二次補考': [
      ['第二次補考每人100元且不退費'],
      ['姓名','學號','報名考試項目','已繳交','繳交金額'],
      ['學生丙','1003','CX350','TRUE',100]
    ]
  });
  assert.deepEqual(parsed.slice(1).map(row => [row[0], row[1], row[2], row[3]]), [
    ['考試','學生甲','1001','true'],
    ['第一次補考','學生乙','1002','false'],
    ['第二次補考','學生丙','1003','TRUE']
  ]);
  const records = parsed.slice(1).map(row => ({ phase: row[0], name: row[1], number: row[2], paid: externalTeaching._test.paidFlag(row[3]) }));
  assert.equal(externalTeaching._test.depositRecordFor({ name: '同名', number: '1001' }, '考試', records).paid, true);
  assert.equal(externalTeaching._test.depositRecordFor({ name: '同名', number: '1002' }, '第一次補考', records).paid, false);
  assert.equal(externalTeaching._test.dayBeforeDate(new Date('2026-10-09T00:00:00+08:00')), '2026-10-08');
});

test('registration response is the deposit authority and counts each exam equipment at fifty dollars', () => {
  const headers = Array(34).fill('');
  Object.assign(headers, { 0: '時間戳記', 4: '姓名', 5: '系級', 6: '學號', 9: '基礎配件課程', 10: 'X160考試', 20: 'H6考試', 31: '聲音工作區教學', 32: '聲音工作區考試' });
  const row = Array(34).fill('');
  Object.assign(row, { 4: '梁璟莘', 5: '廣電三', 6: '111101017', 9: '我要上課', 10: true, 20: '報名', 31: true, 32: false });
  const registrations = parseRegistrationRows([headers, row]);
  assert.deepEqual(registrations[0].equipment, ['X160', 'H6']);
  assert.equal(registrations[0].number, '111101017');
});

test('group matrix sync derives green and retest colors from cumulative LINE records', () => {
  const roster = [
    ['音響學'],
    ['第一組'],
    ['學生甲', '1001'],
    ['學生乙', '1002'],
    ['學生丙', '1003']
  ];
  const matrix = [
    ['姓名', '系級', '學號', '課程', '', '基礎配件課程', 'H6考試', 'X160考試'],
    ['說明'],
    ['學生甲', '', '1001', '音響學'],
    ['學生乙', '', '1002', '音響學']
  ];
  const header = ['紀錄ID','任務ID','日期','開始時間','階段','器材','學生ID','學生姓名','學號','出席狀態','簡答題結果','上機結果','總結果','操作考官','考官LINE User ID','記錄時間','累計簡答題結果','累計上機結果','保證金狀態'];
  const log = (id, phase, equipment, name, attendance, short, practical, deposit) => {
    const row = Array(19).fill('');
    Object.assign(row, { 0: id, 4: phase, 5: equipment, 7: name, 9: attendance, 16: short, 17: practical, 18: deposit });
    return row;
  };
  const depositCanceled = log('7', '考試', 'X160', '學生乙', '取消資格', '未通過', '未通過', '不可退保證金（取消資格）');
  depositCanceled[13] = '保證金未繳';
  const logs = [header,
    log('1', '教學', '基礎配件課程', '學生甲', '到場', '', '', '不適用'),
    log('2', '教學', '基礎配件課程', '學生乙', '缺席', '', '', '不適用'),
    log('3', '考試', 'H6', '學生甲', '到場', '通過', '通過', '可退保證金'),
    log('4', '考試', 'H6', '學生乙', '到場', '通過', '未通過', '不可退保證金'),
    log('5', '第一次補考', 'H6', '學生乙', '到場', '通過', '通過', '可退保證金'),
    log('6', '考試', 'X160', '學生乙', '取消資格', '未通過', '未通過', '不可退保證金（取消資格）'),
    depositCanceled
  ];
  const plan = externalGroupSync._test.planMatrix(roster, matrix, logs);
  assert.equal(plan.groups.length, 1);
  assert.equal(plan.memberships.length, 3);
  assert.equal(plan.missing.length, 1);
  const status = (name, equipment) => plan.updates.find(update => update.name === name && update.equipment === equipment)?.status;
  assert.equal(status('學生甲', '基礎配件課程'), '通過');
  assert.equal(status('學生乙', '基礎配件課程'), '要補考');
  assert.equal(status('學生乙', 'H6'), '通過');
  assert.equal(status('學生乙', 'X160'), '保證金未繳');
  assert.equal(externalGroupSync._test.canonicalEquipment('200W Par'), externalGroupSync._test.canonicalEquipment('Par 200W考試'));
});

test('group matrix sync refreshes an existing student name without resetting result cells', () => {
  const roster = [['音響學'], ['第一組'], ['新姓名', '1001']];
  const matrix = [
    ['姓名', '系級', '學號', '課程', '', 'H6考試'],
    ['說明'],
    ['舊姓名', '廣電系', '1001', '一D56 侯志欽老師 音響學', '', '既有結果']
  ];
  const plan = externalGroupSync._test.planMatrix(roster, matrix, [['紀錄ID']]);
  assert.deepEqual(plan.fieldUpdates, [{ rowIndex: 2, column: 0, value: '新姓名' }]);
  assert.equal(plan.missing.length, 0);
});

test('group matrix sync reuses a single-course student row when the course changes', () => {
  const roster = [['影像製作'], ['第二組'], ['學生甲', '1001']];
  const matrix = [
    ['姓名', '系級', '學號', '課程'],
    ['說明'],
    ['影像課同學', '', '2000', '５．二EFG 李志文老師 影像製作'],
    ['學生甲', '', '1001', '一D56 侯志欽老師 音響學']
  ];
  const plan = externalGroupSync._test.planMatrix(roster, matrix, [['紀錄ID']]);
  assert.equal(plan.missing.length, 0);
  assert.deepEqual(plan.fieldUpdates, [{ rowIndex: 3, column: 3, value: '５．二EFG 李志文老師 影像製作' }]);
});

test('roster parsing uses a subsection title that appears before its group labels', () => {
  const rows = Array.from({ length: 4 }, () => Array(12).fill(''));
  rows[0][10] = '非劇情片理論與創作';
  rows[1][10] = '導演方法';
  rows[2][10] = '第一組';
  rows[3][10] = '學生丁';
  rows[3][11] = '1004';
  const groups = externalGroupSync._test.parseRosterGroups(rows);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].course, '導演方法');
  assert.deepEqual(groups[0].members, [{ name: '學生丁', studentId: '1004' }]);
});

test('combined labels such as seventh and eighth groups remain group labels', () => {
  const rows = Array.from({ length: 5 }, () => Array(22).fill(''));
  rows[0][20] = '影視編導實務';
  rows[1][20] = '第七組、第八組';
  rows[2][20] = '學生戊';
  rows[2][21] = '1005';
  rows[3][20] = '第九組';
  rows[4][20] = '學生己';
  rows[4][21] = '1006';
  const groups = externalGroupSync._test.parseRosterGroups(rows);
  assert.equal(groups[0].course, '影視編導實務');
  assert.equal(groups[0].group, '第七組、第八組');
  assert.deepEqual(groups[0].members, [{ name: '學生戊', studentId: '1005' }]);
  assert.equal(groups[1].course, '影視編導實務');
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
  assert.deepEqual(tasks[1].students.map(student => student.scheduledStart), ['12:05', '12:20']);
  assert.equal(tasks[0].date.getFullYear(), 2027);
});

test('unpaid registered students are canceled at the deadline, struck from schedule, and hidden from attendance', () => {
  const isolated = new GoogleSheetsRuntime();
  installGlobals(isolated);
  const resultBook = isolated.openById(ids.externalResults);
  const tasks = resultBook.insertSheet('對外任務');
  tasks.appendRow(['任務ID','學期','階段','日期','開始時間','結束時間','器材','地點','考官','考官LINE User ID','群組ID','狀態']);
  tasks.appendRow(['DEPOSIT-TASK','1151','考試',new Date('2026-10-10'),'12:00','12:15','H6','401','考官甲','U-EXAM','','已排定',true,true,'','','考試週分班表I','C3']);
  const students = resultBook.insertSheet('任務學生');
  students.appendRow(['任務ID','學生ID','學生姓名','學號','點名順序','出席狀態','考試結果','更新時間','個別開始時間','個別結束時間','提醒時間','來源儲存格']);
  students.appendRow(['DEPOSIT-TASK','DEPOSIT-STUDENT','學生甲','1001',1,'未點名','未記錄','','12:00','12:15','','C3']);
  resultBook.insertSheet('LINE點名紀錄');
  resultBook.insertSheet('LINE群組設定');
  const deposits = isolated.openById(ids.deposit).insertSheet('考試週保證金');
  deposits.appendRow(['姓名','系級','學號','報名考試項目','總共項數','保證金總額','已繳交','繳交金額','處理日期／助理','班長註記','教學部註記']);
  deposits.appendRow(['值班班長請注意']);
  deposits.appendRow(['範例','','111405XXX','H6',1,50,'FALSE','','','','']);
  deposits.appendRow(['學生甲','','1001','H6',1,50,'FALSE','','','','']);
  const registration = isolated.openById(ids.externalRegistration).insertSheet('表單回覆 1');
  const registrationHeader = Array(21).fill('');
  Object.assign(registrationHeader, { 4: '姓名', 5: '系級', 6: '學號', 20: 'H6考試' });
  const registrationRow = Array(21).fill('');
  Object.assign(registrationRow, { 4: '學生甲', 6: '1001', 20: true });
  registration.appendRow(registrationHeader); registration.appendRow(registrationRow);
  const schedule = isolated.openById(ids.externalClassSchedule).insertSheet('考試週分班表I');
  schedule.getRange(3, 3).setValue('學生甲');
  const bindings = isolated.openById(ids.master).insertSheet('用戶綁定');
  bindings.appendRow(['LINE User ID','姓名','綁定時間','學號']);
  bindings.appendRow(['U-STUDENT','學生甲','','1001']);

  const result = externalTeaching._test.processDepositRequirements(new Date('2026-10-10T12:00:00+08:00'));
  assert.deepEqual(result, { reminders: 0, canceled: 1, restored: 0 });
  assert.equal(students.getRange(2, 6).getValue(), '取消資格');
  assert.equal(resultBook.getSheetByName('LINE點名紀錄').getRange(2, 14).getValue(), '保證金未繳');
  assert.equal(resultBook.getSheetByName('保證金提醒紀錄').getRange(2, 2).getValue(), '取消資格');
  const pushes = isolated.httpOperations.map(operation => JSON.parse(operation.options.payload));
  assert.deepEqual(new Set(pushes.map(push => push.to)), new Set(['U-STUDENT', 'U-EXAM']));
  assert.equal(isolated.operations.some(operation => operation.kind === 'fontLine' && operation.value === 'line-through'), true);
  assert.equal(externalTeaching._test.studentsFor('DEPOSIT-TASK').length, 0);
  deposits.getRange(4, 7).setValue(true);
  const restored = externalTeaching._test.processDepositRequirements(new Date('2026-10-10T12:01:00+08:00'));
  assert.deepEqual(restored, { reminders: 0, canceled: 0, restored: 1 });
  assert.equal(students.getRange(2, 6).getValue(), '未點名');
  assert.equal(resultBook.getSheetByName('LINE點名紀錄').getRange(2, 14).getValue(), '保證金已確認');
  installGlobals(runtime);
});

test('duplicate names in the same schedule task are removed', () => {
  const rows = Array.from({ length: 8 }, () => []);
  rows[1][2] = '9/2(三)';
  rows[2][0] = '項目'; rows[2][2] = '200W Par';
  rows[3][2] = '417'; rows[4][2] = '考官甲';
  rows[5][1] = '18:55-19:05'; rows[5][2] = '學生甲';
  rows[6][1] = '19:05-19:15'; rows[6][2] = '學生甲';
  const tasks = parseExamSheet(rows, '考試週分班表I', '1151');
  assert.equal(tasks.length, 1);
  assert.deepEqual(tasks[0].students.map(student => student.name), ['學生甲']);
});

test('schedule students are enriched from the roster and roster duplicates collapse by student number', () => {
  const rows = Array.from({ length: 5 }, () => Array(7).fill(''));
  rows[1][0] = '學生甲'; rows[1][1] = '1001';
  rows[2][5] = '學生甲'; rows[2][6] = '1001';
  rows[3][0] = '同名學生'; rows[3][1] = '2001';
  rows[4][0] = '同名學生'; rows[4][1] = '2002';
  const roster = externalTeaching._test.rosterStudents(rows);
  assert.equal(roster.filter(student => student.name === '學生甲').length, 1);
  const tasks = [{ students: [{ name: '學生甲', number: '' }, { name: '學生甲', number: '' }] }];
  externalTeaching._test.enrichStudentsFromRoster(tasks, roster);
  assert.deepEqual(tasks[0].students, [{ name: '學生甲', number: '1001' }]);
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

test('internal reminders send on Monday at 09:00 and event day at 18:00 without cards', () => {
  const taskBook = runtime.openById(ids.task);
  const taskSheet = taskBook.getSheetByName('1151 對內教學官／考官安排') || taskBook.insertSheet('1151 對內教學官／考官安排');
  if (!taskSheet.getLastRow()) taskSheet.appendRow(['日期','階段','級別','項目','教學官／考官','地點']);
  taskSheet.appendRow([new Date(2026, 8, 6), '暑訓教學', '見習', 'H6', '內測考官', '新棚']);
  const attendanceBook = runtime.openById(ids.internalAttendance);
  const binds = runtime.openById(ids.master).getSheetByName('用戶綁定') || runtime.openById(ids.master).insertSheet('用戶綁定');
  if (!binds.getLastRow()) binds.appendRow(['LINE User ID','姓名','綁定時間','學號']);
  binds.appendRow(['U-INTERNAL','內測考官','','']);
  runtime.httpOperations = [];

  assert.equal(internalTeaching.sendInternalReminders(new Date(2026, 7, 31, 8, 59)), 0);
  assert.equal(internalTeaching.sendInternalReminders(new Date(2026, 7, 31, 9, 0)), 1);
  assert.equal(internalTeaching.sendInternalReminders(new Date(2026, 7, 31, 9, 1)), 0);
  assert.equal(internalTeaching.sendInternalReminders(new Date(2026, 8, 6, 17, 59)), 0);
  assert.equal(internalTeaching.sendInternalReminders(new Date(2026, 8, 6, 18, 0)), 1);
  const pushes = runtime.httpOperations.map(operation => JSON.parse(operation.options.payload));
  assert.equal(pushes.length, 2);
  assert.equal(pushes.every(push => push.to === 'U-INTERNAL'), true);
  assert.equal(pushes.every(push => push.messages[0].quickReply.items[0].action.type === 'uri'), true);
  assert.equal(pushes.some(push => /名單調整/.test(push.messages[0].text)), true);
  assert.equal(pushes.some(push => /今天有你的/.test(push.messages[0].text)), true);
  const direct = internalTeaching.handleCommand('點名', { sourceType: 'user', userId: 'U-INTERNAL' });
  assert.equal(direct.quickReply.items[0].action.type, 'uri');
  assert.match(direct.quickReply.items[0].action.uri, /gid=653206596/);
});

test('an equipment-specific result updates only that certification when the sheet edit says passed', () => {
  const attendanceBook = runtime.openById(ids.internalAttendance);
  const attendance = attendanceBook.getSheetByName('教學考試點名和通過情況總表') || attendanceBook.insertSheet('教學考試點名和通過情況總表');
  attendance.getRange(1, 1, 3, 4).setValues([
    ['姓名／項目','學號','導播台結果','錄放影機結果'],
    ['內測學生','I001','通過','不通過'],
    ['另一學生','I002','','']
  ]);
  const certification = runtime.openById(ids.internalCertification).getSheetByName('工作表1') || runtime.openById(ids.internalCertification).insertSheet('工作表1');
  certification.getRange(1, 1, 5, 5).setValues([
    ['認證狀況','','','',''],
    ['姓名／項目','學號','','導播台','錄放影機'],
    ['見習(2)','','','',''],
    ['內測學生','I001','','','V'],
    ['另一學生','I002','','','']
  ]);
  bot.onMasterSheetEdit({ value: '通過', range: attendance.getRange(2, 3) });
  assert.equal(certification.getRange(4, 4).getValue(), 'V');
  assert.equal(certification.getRange(4, 5).getValue(), 'V');
  bot.onMasterSheetEdit({ value: '不通過', range: attendance.getRange(2, 4) });
  assert.equal(certification.getRange(4, 5).getValue(), 'V');
  attendance.getRange(3, 4).setValue('通過');
  assert.equal(internalTeaching.syncInternalCertifications(), 1);
  assert.equal(certification.getRange(5, 5).getValue(), 'V');
});
