'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

process.env.GOOGLE_SERVICE_ACCOUNT_JSON ||= JSON.stringify({ client_email: 'test@example.com', private_key: 'test-key' });
process.env.LINE_CHANNEL_ACCESS_TOKEN ||= 'test-token';

const { GoogleSheetsRuntime } = require('../src/runtime');
const { ids } = require('../src/config');
const { sendRegistrationConfirmations, retryUuid } = require('../src/registration-confirmations');
const { parseRegistrationRows } = require('../src/external-registration-parser');

test('registration parser accepts the second form branch', () => {
  const parsed = parseRegistrationRows([
    ['姓名', '學號', 'H6考試', '姓名', '學號'],
    ['', '', '是', '第二分支學生', '111101020']
  ]);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].number, '111101020');
});

test('pre-registered students are notified once when their registration appears', async () => {
  const runtime = new GoogleSheetsRuntime();
  const response = runtime.openById(ids.externalRegistration).insertSheet('表單回覆 1');
  response.appendRow(['姓名', '學號', 'H6考試']);
  const bindings = runtime.openById(ids.master).insertSheet('用戶綁定');
  bindings.appendRow(['LINE User ID', '姓名', '綁定時間', '學號', '身分類型']);
  bindings.appendRow(['U-EARLY', '測試學生', '', '111101017', 'external']);
  const calls = [];
  const fetchImpl = async (_url, options) => { calls.push(options); return { ok: true, status: 200 }; };

  assert.equal((await sendRegistrationConfirmations(runtime, { fetchImpl })).sent, 0);
  response.appendRow(['測試學生', '111101017', '是']);
  assert.equal((await sendRegistrationConfirmations(runtime, { fetchImpl })).sent, 1);
  assert.equal((await sendRegistrationConfirmations(runtime, { fetchImpl })).sent, 0);
  assert.equal(calls.length, 1);
  assert.match(JSON.parse(calls[0].body).messages[0].text, /報名成功/);
  assert.doesNotMatch(JSON.parse(calls[0].body).messages[0].text, /保證金|繳費|50 元/);
  assert.match(calls[0].headers['X-Line-Retry-Key'], /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/);
});

test('existing registrations are baselined, but binding afterward gets a confirmation', async () => {
  const runtime = new GoogleSheetsRuntime();
  const response = runtime.openById(ids.externalRegistration).insertSheet('表單回覆 1');
  response.appendRow(['姓名', '學號', 'H6考試']);
  response.appendRow(['晚綁學生', '111101018', '是']);
  const bindings = runtime.openById(ids.master).insertSheet('用戶綁定');
  bindings.appendRow(['LINE User ID', '姓名', '綁定時間', '學號', '身分類型']);
  let count = 0;
  const fetchImpl = async () => { count++; return { ok: true, status: 200 }; };
  await sendRegistrationConfirmations(runtime, { fetchImpl });
  bindings.appendRow(['U-LATE', '晚綁學生', '', '111101018', 'external']);
  assert.equal((await sendRegistrationConfirmations(runtime, { fetchImpl })).sent, 1);
  assert.equal(count, 1);
});

test('confirmation is matched by student number and does not notify a different name', async () => {
  const runtime = new GoogleSheetsRuntime();
  const response = runtime.openById(ids.externalRegistration).insertSheet('表單回覆 1');
  response.appendRow(['姓名', '學號', 'H6考試']);
  const bindings = runtime.openById(ids.master).insertSheet('用戶綁定');
  bindings.appendRow(['LINE User ID', '姓名', '綁定時間', '學號', '身分類型']);
  bindings.appendRow(['U-WRONG', '其他同學', '', '111101019', 'external']);
  await sendRegistrationConfirmations(runtime, { fetchImpl: async () => { throw Error('unexpected push'); } });
  response.appendRow(['真正學生', '111101019', '是']);
  const result = await sendRegistrationConfirmations(runtime, { fetchImpl: async () => { throw Error('unexpected push'); } });
  assert.equal(result.sent, 0);
  assert.equal(retryUuid('test'), retryUuid('test'));
});
