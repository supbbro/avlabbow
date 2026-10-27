'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { selectNavigationRecoveryRecipients } = require('../src/navigation-recovery');

test('navigation recovery keeps the latest valid account for each current identity', () => {
  const assistants = [
    ['姓名', '學號'],
    ['中心助理甲', '112405001'],
    ['林宇俊', '助教'],
    ['已退助理', '']
  ];
  const bindings = [
    ['LINE User ID', '姓名', '綁定時間', '學號', '身分類型', '身分確認時間'],
    ['U-assistant-old', '中心助理甲', '2026/02/01', '', '', ''],
    ['U-assistant-current', '中心助理甲', '2026/02/02', '', 'assistant', '2026/09/01'],
    ['U-ta', '林宇俊', '2026/09/01', '', 'assistant', '2026/09/01'],
    ['U-external-old', '學生甲', '2026/09/01', '113405001', 'external', '2026/09/01'],
    ['U-external-current', '學生甲', '2026/09/02', '113405001', 'external', '2026/09/02'],
    ['U-retired', '已退助理', '2026/09/01', '', 'assistant', '2026/09/01'],
    ['U-empty', '', '2026/09/01', '', '', '']
  ];
  const recipients = selectNavigationRecoveryRecipients(bindings, assistants);
  assert.deepEqual(recipients.map(item => [item.userId, item.role]), [
    ['U-assistant-current', 'assistant'],
    ['U-ta', 'assistant'],
    ['U-external-current', 'external']
  ]);
});
