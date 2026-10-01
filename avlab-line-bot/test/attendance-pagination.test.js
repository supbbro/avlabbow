'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

process.env.LINE_CHANNEL_ACCESS_TOKEN ||= 'test-token';
process.env.GOOGLE_SERVICE_ACCOUNT_JSON ||= JSON.stringify({ client_email: 'test@example.com', private_key: 'test-key' });

const { GoogleSheetsRuntime, installGlobals } = require('../src/runtime');
const { ids } = require('../src/config');
const externalTeaching = require('../src/external-teaching');

test('attendance roster returns every student when a class has more than ten people', () => {
  const runtime = new GoogleSheetsRuntime();
  installGlobals(runtime);

  const master = runtime.openById(ids.master).insertSheet('用戶綁定');
  master.appendRow(['LINE User ID', '姓名', '綁定時間', '學號', '身分']);
  master.appendRow(['U-EXAMINER', '測試考官', '', '', 'assistant']);

  const results = runtime.openById(ids.externalResults);
  const tasks = results.insertSheet('對外任務');
  tasks.appendRow(['任務ID','學期','階段','日期','開始時間','結束時間','器材','地點','教學官／考官','考官LINE User ID','LINE群組ID','任務狀態','前一天提醒','兩小時前提醒','前一天提醒時間','兩小時前提醒時間','來源分頁','來源位置']);
  tasks.appendRow(['T-MANY','1151','教學',new Date('2026-10-01'),'12:00','14:00','基礎配件課程','401','測試考官','U-EXAMINER','','點名中']);

  const students = results.insertSheet('任務學生');
  students.appendRow(['任務ID','學生ID','學生姓名','學號','點名順序','出席狀態','考試結果','更新時間','個別開始時間','個別結束時間','考生提醒時間','來源儲存格']);
  for (let index = 1; index <= 11; index++) {
    students.appendRow(['T-MANY', `S${index}`, `學生${index}`, `NO${index}`, index, '未點名', '未記錄', '', '12:00', '14:00', '', `C${index + 5}`]);
  }

  const response = externalTeaching.handleCommand('考生名單 T-MANY 1', {
    sourceType: 'user', userId: 'U-EXAMINER', chatId: 'U-EXAMINER'
  }, { skipScheduleSync: true });

  assert.equal(response.lineMessages.length, 2);
  assert.equal(response.lineMessages[0].template.columns.length, 10);
  assert.equal(response.lineMessages[1].template.columns.length, 1);
  assert.deepEqual(response.lineMessages.flatMap(message => message.template.columns.map(column => column.title)),
    Array.from({ length: 11 }, (_, index) => `學生${index + 1}`));
  assert.match(response.text, /共 11 人；卡片分成 2 組顯示/);
  assert.equal(response.lineMessages[0].quickReply, undefined);
  assert.ok(response.lineMessages[1].quickReply);
});
