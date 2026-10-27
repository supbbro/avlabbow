'use strict';

const HOME_QUICK_REPLY_ITEM = Object.freeze({
  type: 'action',
  action: { type: 'message', label: '🏠 回首頁', text: '主選單' }
});

function isHomeItem(item) {
  const action = item?.action || {};
  return action.text === '主選單' || action.data === '主選單';
}

function ensureHomeQuickReply(message) {
  if (!message || typeof message !== 'object') return message;
  const current = Array.isArray(message.quickReply?.items) ? message.quickReply.items : [];
  const existingHome = current.find(isHomeItem);
  const otherItems = current.filter(item => !isHomeItem(item)).slice(0, 12);
  return {
    ...message,
    quickReply: { items: [...otherItems, existingHome || HOME_QUICK_REPLY_ITEM] }
  };
}

function ensureHomeOnLastMessage(body) {
  if (!body || !Array.isArray(body.messages) || !body.messages.length) return body;
  const messages = [...body.messages];
  messages[messages.length - 1] = ensureHomeQuickReply(messages[messages.length - 1]);
  return { ...body, messages };
}

function ensureHomeInPayload(payload) {
  if (typeof payload !== 'string') return payload;
  try {
    return JSON.stringify(ensureHomeOnLastMessage(JSON.parse(payload)));
  } catch (_error) {
    return payload;
  }
}

module.exports = {
  HOME_QUICK_REPLY_ITEM,
  ensureHomeQuickReply,
  ensureHomeOnLastMessage,
  ensureHomeInPayload
};
