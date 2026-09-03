'use strict';

require('dotenv').config();
const crypto = require('crypto');
const express = require('express');
const { GoogleSheetsRuntime, installGlobals, formatDate } = require('./runtime');
const { ids } = require('./config');

for (const key of ['LINE_CHANNEL_ACCESS_TOKEN', 'LINE_CHANNEL_SECRET']) {
  if (!process.env[key]) throw new Error(`Missing required environment variable: ${key}`);
}

const runtime = new GoogleSheetsRuntime();
installGlobals(runtime);
const bot = require('./legacy-bot');
const internalTeaching = require('./internal-teaching');
const externalTeaching = require('./external-teaching');
const externalGroupSync = require('./external-group-sync');
const navigation = require('./navigation');
const app = express();
const port = Number(process.env.PORT || 3000);
const EXTERNAL_WORKBOOKS = [ids.externalClassSchedule, ids.externalResults, ids.master, ids.externalRegistration, ids.deposit];
const INTERNAL_WORKBOOKS = [ids.task, ids.internalAttendance, ids.internalCertification, ids.master];
const INTERNAL_CERT_WORKBOOKS = [ids.internalAttendance, ids.internalCertification];
const TASK_QUERY_WORKBOOKS = [ids.task, ids.internalAttendance, ids.internalCertification, ids.externalClassSchedule, ids.externalResults, ids.assistant, ids.master];
const LIVE_TASK_WORKBOOKS = [ids.task, ids.externalClassSchedule, ids.externalResults];
const LIGHTWEIGHT_COMMANDS = new Set(['主選單', '對外學生', '對外更多', '中心助理', '助理更多', '助理排程', '助理工具', '請假選項', '請假', '查詢', '常用連結', '講義區', '講義文件', '講義影片攝影', '講義影片燈光', '講義影片聲音', '講義影片影棚']);
const ASSISTANT_PROMPT_COMMANDS = new Set(['個人點名統計', '代班查詢', '認證', '認證進度', '考試結果']);
let serial = Promise.resolve();

function enqueue(job) {
  const next = serial.then(job, job);
  serial = next.catch(error => console.error('Queued job failed:', error));
  return next;
}

function validLineSignature(buffer, signature) {
  if (!signature) return false;
  const expected = crypto.createHmac('sha256', process.env.LINE_CHANNEL_SECRET).update(buffer).digest('base64');
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

async function lineRequest(path, body) {
  const response = await fetch(`https://api.line.me/v2/bot${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!response.ok) throw new Error(`LINE API ${response.status}: ${await response.text()}`);
}

function toLineMessage(reply) {
  const normalized = typeof reply === 'string' ? { text: reply } : reply;
  if (normalized?.lineMessage) return normalized.lineMessage;
  if (!normalized?.text) return null;
  const message = { type: 'text', text: String(normalized.text).slice(0, 5000) };
  if (normalized.quickReply?.items?.length) message.quickReply = { items: normalized.quickReply.items.slice(0, 13) };
  return message;
}

function toFallbackLineMessage(reply) {
  if (!reply?.lineMessage || !reply?.text) return null;
  const message = { type: 'text', text: String(reply.text).slice(0, 5000) };
  if (reply.fallbackQuickReply?.items?.length) message.quickReply = { items: reply.fallbackQuickReply.items.slice(0, 13) };
  return message;
}

async function handleLineEvent(event) {
  let reply = null;
  const sourceType = event.source?.type || 'user';
  const context = {
    sourceType,
    userId: event.source?.userId || '',
    chatId: event.source?.groupId || event.source?.roomId || event.source?.userId || ''
  };
  if (event.type === 'follow') {
    reply = bot.getMainMenu();
  } else if (event.type === 'join') {
    reply = externalTeaching.joinReply();
  } else if (event.type === 'leave') {
    await runtime.loadOnly(EXTERNAL_WORKBOOKS);
    externalTeaching.disableGroup(context.chatId);
  } else if (event.type === 'postback') {
    const userId = context.userId;
    if (!userId) return;
    const command = String(event.postback?.data || '').trim();
    const internal = internalTeaching.isInternalCommand(command);
    if (!internal && !externalTeaching.isExternalCommand(command)) return;
    await runtime.loadOnly(internal ? INTERNAL_WORKBOOKS : EXTERNAL_WORKBOOKS, { force: internal ? internalTeaching.requiresFreshData(command) : externalTeaching.requiresFreshData(command) });
    bot.recordUser(userId);
    reply = internal ? internalTeaching.handleCommand(command, context) : externalTeaching.handleCommand(command, context);
  } else if (event.type === 'message') {
    const userId = context.userId;
    if (!userId) return;
    if (event.message?.id && runtime.cache.get(`message:${event.message.id}`)) return;
    if (event.message?.id) runtime.cache.put(`message:${event.message.id}`, '1', 60);
    if (event.message.type === 'text') {
      const originalText = event.message.text.trim();
      const navigationResult = navigation.resolve(runtime.cache, userId, originalText);
      const text = navigationResult.command;
      const combinedTaskQuery = text === '我的任務';
      const bindingCommand = /^(?:我是|綁定)[\s　]*/.test(text);
      if (bindingCommand) {
        await runtime.loadOnly([ids.master, ids.internalAttendance, ids.externalResults], { force: true });
      } else if (text === '選擇中心助理') {
        await runtime.loadOnly([ids.master, ids.internalAttendance], { force: true });
      } else if (text === '選擇對外學生') {
        await runtime.loadOnly([ids.master, ids.externalResults], { force: true });
      } else if (internalTeaching.isInternalCommand(text)) {
        await runtime.loadOnly(INTERNAL_WORKBOOKS, { force: internalTeaching.requiresFreshData(text) });
      } else if (combinedTaskQuery) {
        await runtime.loadOnly(TASK_QUERY_WORKBOOKS, { forceIds: LIVE_TASK_WORKBOOKS });
        externalTeaching.syncFromSchedule();
      } else if (externalTeaching.isExternalCommand(text)) {
        await runtime.loadOnly(EXTERNAL_WORKBOOKS, { force: externalTeaching.requiresFreshData(text) });
      } else if (LIGHTWEIGHT_COMMANDS.has(text)) {
        await runtime.loadOnly([ids.master]);
      } else if (ASSISTANT_PROMPT_COMMANDS.has(text)) {
        await runtime.loadOnly([ids.master, ids.assistant]);
      } else {
        await runtime.loadAll();
      }
      bot.recordUser(userId);
      reply = internalTeaching.handleCommand(text, context) || externalTeaching.handleCommand(text, context) || bot.getReply(text, userId);
      if (!navigationResult.isBack) navigation.remember(runtime.cache, userId, reply?.navigationPage || text, Boolean(reply));
    } else if (event.message.type === 'sticker') {
      await runtime.loadOnly([ids.master]);
      bot.recordUser(userId);
      reply = { text: '怎說', quickReply: { items: [
        { type: 'action', action: { type: 'message', label: '👨‍🎓 對外學生', text: '對外學生' } },
        { type: 'action', action: { type: 'message', label: '👩‍💼 中心助理', text: '中心助理' } }
      ] } };
    }
  }
  await runtime.flush();
  const message = toLineMessage(reply);
  if (message && event.replyToken) {
    try {
      await lineRequest('/message/reply', { replyToken: event.replyToken, messages: [message] });
    } catch (error) {
      const fallback = toFallbackLineMessage(reply);
      if (!fallback) throw error;
      console.error('Rich attendance message rejected; retrying text fallback:', error.message);
      await lineRequest('/message/reply', { replyToken: event.replyToken, messages: [fallback] });
    }
  }
}

app.get('/', (_req, res) => res.type('text').send('AV Lab LINE Bot is running'));
app.get('/health', (_req, res) => res.json({ ok: true, time: new Date().toISOString() }));

app.post('/webhook', express.raw({ type: 'application/json', limit: '1mb' }), (req, res) => {
  if (!validLineSignature(req.body, req.get('x-line-signature'))) return res.status(401).send('Invalid signature');
  let payload;
  try { payload = JSON.parse(req.body.toString('utf8')); }
  catch { return res.status(400).send('Invalid JSON'); }
  res.status(200).send('OK');
  for (const event of payload.events || []) enqueue(() => handleLineEvent(event));
});

app.use('/automation', express.json({ limit: '1mb' }));
app.use('/automation', (req, res, next) => {
  const supplied = req.get('x-automation-secret') || req.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!process.env.AUTOMATION_SECRET || supplied !== process.env.AUTOMATION_SECRET) return res.status(401).json({ error: 'Unauthorized' });
  next();
});

function eventFromBody(body, spreadsheetId, sheetName) {
  const sheet = runtime.openById(spreadsheetId).getSheetByName(body.sheetName || sheetName);
  if (!sheet) throw new Error(`Sheet not found: ${body.sheetName || sheetName}`);
  return {
    value: body.value,
    oldValue: body.oldValue,
    values: body.values || [],
    range: sheet.getRange(Number(body.row || 1), Number(body.column || 1))
  };
}

const automations = {
  'leave-submit': [bot.onLeaveFormSubmit, ids.leave, '表單回覆 1'],
  'external-examiner-change-submit': [externalTeaching.onExaminerChangeFormSubmit, ids.external, '表單回覆 1', [ids.external, ...EXTERNAL_WORKBOOKS]],
  'retest-submit': [bot.onRetestFormSubmit, ids.retest, '表單回覆 1'],
  'availability-submit': [bot.onAvailabilityFormSubmit, ids.schedule, '表單回覆 1'],
  'master-edit': [bot.onMasterSheetEdit, ids.internalAttendance, '教學考試點名和通過情況總表', [ids.internalAttendance, ids.internalCertification, ids.master]]
};

app.post('/automation/:name', (req, res) => {
  const target = automations[req.params.name];
  if (!target) return res.status(404).json({ error: 'Unknown automation' });
  enqueue(async () => {
    if (target[3]) await runtime.loadOnly(target[3], { force: true });
    else await runtime.loadAll({ force: true });
    target[0](eventFromBody(req.body, target[1], target[2]));
    await runtime.flush();
  }).then(() => res.json({ ok: true })).catch(error => {
    console.error(error); res.status(500).json({ error: error.message });
  });
});

const completedSchedules = new Set();
async function schedulerTick() {
  const stamp = formatDate(new Date(), 'yyyy-MM-dd HH:mm');
  const date = stamp.slice(0, 10);
  const time = stamp.slice(11);
  const weekday = new Intl.DateTimeFormat('en-US', { timeZone: process.env.TZ || 'Asia/Taipei', weekday: 'short' }).format(new Date());
  const jobs = [];
  // 認證同步獨立且優先執行，避免其他排程失敗時連帶阻斷對內認證更新。
  // Certification syncing only depends on these two native Sheets files. Loading
  // the task workbook or binding workbook here made an unrelated read failure
  // prevent otherwise valid certification results from being copied.
  jobs.push([`internal-cert-sync:${stamp}`, internalTeaching.syncInternalCertifications, INTERNAL_CERT_WORKBOOKS]);
  jobs.push([`internal-reminders:${stamp}`, internalTeaching.sendInternalReminders, INTERNAL_WORKBOOKS]);
  jobs.push([`external-examiner-changes:${stamp}`, externalTeaching.processPendingExaminerChanges, [ids.external, ...EXTERNAL_WORKBOOKS]]);
  jobs.push([`external-reminders:${stamp}`, externalTeaching.sendExternalReminders, EXTERNAL_WORKBOOKS]);
  jobs.push([`external-group-sync:${stamp}`, () => externalGroupSync.syncExternalCertificationMatrix(runtime.api, ids.externalResults), []]);
  if (time === '20:00') jobs.push([`daily:${date}`, bot.sendTomorrowTaskReminders, null]);
  if (weekday === 'Mon' && time === '01:00') jobs.push([`weekly:${date}`, bot.calculateWeeklyGodOfGamblers, null]);
  for (const [key, fn, workbookIds] of jobs) {
    if (completedSchedules.has(key)) continue;
    try {
      await enqueue(async () => {
        if (workbookIds) await runtime.loadOnly(workbookIds, { force: true });
        else await runtime.loadAll({ force: true });
        await fn();
        await runtime.flush();
      });
      completedSchedules.add(key);
    } catch (error) {
      // 同一分鐘內保留未完成狀態供下個 tick 重試，並繼續執行其他獨立工作。
      console.error(`Scheduled job failed (${key}):`, error);
    }
  }
  if (completedSchedules.size > 5000) completedSchedules.clear();
}
setInterval(() => schedulerTick().catch(console.error), 30_000).unref();

app.listen(port, '0.0.0.0', error => {
  if (error) {
    console.error(`Unable to listen on port ${port}:`, error);
    process.exitCode = 1;
    return;
  }
  console.log(`Listening on port ${port}`);
});

module.exports = { app, validLineSignature, toLineMessage, toFallbackLineMessage };
