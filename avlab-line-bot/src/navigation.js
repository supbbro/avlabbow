'use strict';

const HOME = '主選單';
const BACK = '回上一頁';
const MAX_DEPTH = 20;
const TTL_SECONDS = 12 * 60 * 60;

const keyFor = userId => `navigation:${String(userId || '')}`;

function read(cache, userId) {
  if (!userId) return [HOME];
  try {
    const parsed = JSON.parse(cache.get(keyFor(userId)) || '[]');
    return Array.isArray(parsed) && parsed.length ? parsed : [HOME];
  } catch {
    return [HOME];
  }
}

function write(cache, userId, stack) {
  if (userId) cache.put(keyFor(userId), JSON.stringify(stack.slice(-MAX_DEPTH)), TTL_SECONDS);
}

function resolve(cache, userId, input) {
  const command = String(input || '').trim();
  if (command !== BACK) return { command, isBack: false };
  const stack = read(cache, userId);
  if (stack.length > 1) stack.pop();
  write(cache, userId, stack);
  return { command: stack.at(-1) || HOME, isBack: true };
}

function remember(cache, userId, command, hasReply = true) {
  if (!userId || !hasReply || command === BACK) return;
  if (command === HOME) {
    write(cache, userId, [HOME]);
    return;
  }
  const stack = read(cache, userId);
  if (stack.at(-1) !== command) stack.push(command);
  write(cache, userId, stack);
}

module.exports = { HOME, BACK, resolve, remember, _test: { read } };
