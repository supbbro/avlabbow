'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { WorkQueue } = require('../src/work-queue');

test('LINE jobs overtake waiting background jobs without concurrent Sheet access', async () => {
  const order = [];
  let releaseFirst;
  const queue = new WorkQueue(() => {});
  const first = queue.enqueue(async () => {
    order.push('background-start');
    await new Promise(resolve => { releaseFirst = resolve; });
    order.push('background-end');
  }, 'background');
  const second = queue.enqueue(async () => { order.push('background-next'); }, 'background');
  const line = queue.enqueue(async () => { order.push('LINE'); });
  releaseFirst();
  await Promise.all([first, second, line]);
  assert.deepEqual(order, ['background-start', 'background-end', 'LINE', 'background-next']);
});

test('a failed queued job does not block later LINE events', async () => {
  const errors = [];
  const queue = new WorkQueue(error => errors.push(error.message));
  await assert.rejects(queue.enqueue(async () => { throw new Error('sheet failed'); }), /sheet failed/);
  assert.equal(await queue.enqueue(async () => 'next reply'), 'next reply');
  assert.deepEqual(errors, ['sheet failed']);
});

test('background reminders still run during a burst of LINE messages', async () => {
  const order = [];
  let releaseFirst;
  const queue = new WorkQueue(() => {});
  const jobs = [queue.enqueue(async () => {
    await new Promise(resolve => { releaseFirst = resolve; });
    order.push('LINE-0');
  })];
  for (let n = 1; n <= 12; n++) jobs.push(queue.enqueue(async () => { order.push(`LINE-${n}`); }));
  jobs.push(queue.enqueue(async () => { order.push('reminder'); }, 'background'));
  releaseFirst();
  await Promise.all(jobs);
  assert.ok(order.indexOf('reminder') > order.indexOf('LINE-1'));
  assert.ok(order.indexOf('reminder') < order.indexOf('LINE-12'));
});

test('queue status exposes a running background job and waiting LINE event', async () => {
  let release;
  const queue = new WorkQueue(() => {});
  const background = queue.enqueue(() => new Promise(resolve => { release = resolve; }), 'background');
  const line = queue.enqueue(async () => 'LINE');
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(queue.status(), {
    running: true,
    currentPriority: 'background',
    currentSeconds: 0,
    interactiveWaiting: 1,
    backgroundWaiting: 0
  });
  release('background');
  assert.equal(await background, 'background');
  assert.equal(await line, 'LINE');
  assert.deepEqual(queue.status(), {
    running: false,
    currentPriority: null,
    currentSeconds: 0,
    interactiveWaiting: 0,
    backgroundWaiting: 0
  });
});
