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

test('submenu pages consistently provide back and home navigation', () => {
  for (const [index, command] of ['對外更多', '查詢', '助理更多', '請假選項', '流程'].entries()) {
    const labels = bot.getReply(command, `U-nav-${index}`).quickReply.items.map(item => item.action.label);
    assert.equal(labels.some(label => label.includes('回上一頁')), true, command);
    assert.equal(labels.some(label => label.includes('回首頁')), true, command);
  }
  const externalMain = bot.getReply('對外學生', 'U-nav-external').quickReply.items.map(item => item.action.label);
  const internalMain = bot.getReply('中心助理', 'U-nav-internal').quickReply.items.map(item => item.action.label);
  assert.equal(externalMain.some(label => label.includes('回首頁')), true);
  assert.equal(internalMain.some(label => label.includes('回首頁')), true);
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
  assert.match(teachingReminder, /對外教學將於 1 小時後開始/);
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
    assert.match(push.messages[0].text, /1 小時後/);
    assert.match(push.messages[0].text, /學生乙/);
    assert.equal(push.messages[0].quickReply.items[0].action.text, '開始點名 T-REMIND');
  }
});

test('a roster student can bind LINE and receives a retest form after failed grading', () => {
  const resultBook = runtime.openById(ids.externalResults);
  const tasks = resultBook.getSheetByName('對外任務');
  const students = resultBook.getSheetByName('任務學生');
  students.appendRow(['EXT-BIND-TEST', 'STU-BIND-TEST', '外部測試生', 'TEST', 1, '未點名', '未記錄', '', '13:00', '13:15', '']);
  const response = bot.getReply('我是 外部測試生', 'U-external-student-test');
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
  assert.equal(push.messages[0].quickReply.items[0].action.uri, 'https://docs.google.com/forms/d/FAKE/viewform');
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
  assert.match(studentPush.messages[0].text, /對外教學將於 1 小時後開始/);
  assert.match(studentPush.messages[0].text, /超過 15 分鐘.*遲到/);
});

test('failed exam stages select the next retest form and stop after the second retest', () => {
  assert.equal(externalTeaching._test.retestForm({ phase: '考試' }).url, 'https://forms.gle/3be87wRzRBKvdkFb6');
  assert.equal(externalTeaching._test.retestForm({ phase: '第一次補考' }).url, 'https://forms.gle/t1vrm4U43xMhoWxD9');
  assert.equal(externalTeaching._test.retestForm({ phase: '第二次補考' }).finalAttempt, true);
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
