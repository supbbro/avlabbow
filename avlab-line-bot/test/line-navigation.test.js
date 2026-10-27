'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  ensureHomeQuickReply,
  ensureHomeOnLastMessage,
  ensureHomeInPayload
} = require('../src/line-navigation');

const messageItem = text => ({ type: 'action', action: { type: 'message', label: text, text } });

test('adds a home option to a message without quick replies', () => {
  const message = ensureHomeQuickReply({ type: 'text', text: '測試' });
  assert.equal(message.quickReply.items.length, 1);
  assert.equal(message.quickReply.items[0].action.text, '主選單');
});

test('keeps existing actions and reserves the thirteenth slot for home', () => {
  const items = Array.from({ length: 13 }, (_, index) => messageItem(`選項 ${index + 1}`));
  const message = ensureHomeQuickReply({ type: 'text', text: '測試', quickReply: { items } });
  assert.equal(message.quickReply.items.length, 13);
  assert.deepEqual(message.quickReply.items.slice(0, 12), items.slice(0, 12));
  assert.equal(message.quickReply.items[12].action.text, '主選單');
});

test('moves one existing home action to the end without duplicating it', () => {
  const home = messageItem('主選單');
  const message = ensureHomeQuickReply({
    type: 'text', text: '測試', quickReply: { items: [home, messageItem('查看任務')] }
  });
  assert.deepEqual(message.quickReply.items.map(item => item.action.text), ['查看任務', '主選單']);
});

test('adds home only to the last message in a LINE request', () => {
  const body = ensureHomeOnLastMessage({ messages: [
    { type: 'text', text: '第一則' },
    { type: 'text', text: '第二則' }
  ] });
  assert.equal(body.messages[0].quickReply, undefined);
  assert.equal(body.messages[1].quickReply.items[0].action.text, '主選單');
});

test('adds home to queued JSON payloads', () => {
  const payload = ensureHomeInPayload(JSON.stringify({ to: 'U123', messages: [{ type: 'text', text: '通知' }] }));
  const body = JSON.parse(payload);
  assert.equal(body.messages[0].quickReply.items[0].action.text, '主選單');
});
