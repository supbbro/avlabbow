'use strict';

// The production attendance controller runs against a private in-memory
// workbook for each trainee. Practice never opens or flushes live Sheets.
const crypto = require('crypto');
const { GoogleSheetsRuntime } = require('./runtime');
const { ids } = require('./config');
const externalTeaching = require('./external-teaching');

const sessions = new Map();
const SESSION_MS = 6 * 60 * 60 * 1000;
const PREFIX = '練習 ';
const ACTION_COMMAND = /^(?:今日任務|對外任務|近期任務|查看任務|點名首頁|開始點名|考生名單|查看考生|查看點名結果|修改出席|修改紀錄|修改步驟|更正點名|更正評分|到場判定|點名狀態|簡答登記|上機登記|考試登記|完成點名)(?:\s|$)/;

const isPracticeCommand = text => /^(?:練習|練習點名|開始練習|開始教學練習|開始補考練習|練習重來|結束練習)(?:$|\s)/.test(String(text || '').trim());
const simpleReply = (text, actions = []) => ({ text, ...(actions.length ? { quickReply: { items: actions.map(([label, data]) => ({
  type: 'action', action: data === '主選單'
    ? { type: 'message', label, text: data }
    : { type: 'postback', label, data }
})) } } : {}) });

function localDateTime(date) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(date).map(part => [part.type, part.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
}

function createSession(context, now, phase = '考試') {
  const runtime = new GoogleSheetsRuntime();
  const taskId = `PRACTICE-${crypto.createHash('sha256').update(context.userId).digest('hex').slice(0, 12)}`;
  const starts = localDateTime(new Date(now.getTime() + 60 * 60 * 1000));
  const ends = localDateTime(new Date(now.getTime() + 3 * 60 * 60 * 1000));
  const resultBook = runtime.openById(ids.externalResults);
  const tasks = resultBook.insertSheet('對外任務');
  tasks.appendRow(['任務ID', '學期', '階段', '日期', '開始時間', '結束時間', '器材', '地點', '教學官／考官', '考官LINE User ID', 'LINE群組ID', '任務狀態']);
  tasks.appendRow([taskId, '練習', phase, starts.date, starts.time, ends.time, 'H6（練習）', '練習教室', '練習考官', context.userId, '', '已排定']);
  const students = resultBook.insertSheet('任務學生');
  students.appendRow(['任務ID', '學生ID', '學生姓名', '學號', '點名順序', '出席狀態', '考試結果', '記錄時間', '個別開始時間', '個別結束時間']);
  students.appendRow([taskId, `${taskId}-1`, '陳小晴', 'PRACTICE001', 1, '未點名', '未記錄', '', starts.time, ends.time]);
  students.appendRow([taskId, `${taskId}-2`, '林小宇', 'PRACTICE002', 2, '未點名', '未記錄', '', starts.time, ends.time]);
  const attendance = resultBook.insertSheet('LINE點名紀錄');
  if (phase === '第一次補考') {
    attendance.appendRow(['紀錄ID','任務ID','日期','開始時間','階段','器材','學生ID','學生姓名','學號','出席狀態','簡答題結果','上機結果','總結果','操作考官','考官LINE User ID','記錄時間','累計簡答題結果','累計上機結果','保證金狀態']);
    for (const [index, name] of ['陳小晴', '林小宇'].entries()) {
      attendance.appendRow([`${taskId}:prior-${index + 1}`, '練習前次考試', starts.date, starts.time, '考試', 'H6（練習）', `${taskId}-${index + 1}`, name, `PRACTICE00${index + 1}`, '到場', '通過', '未通過', '僅簡答題通過', '練習考官', context.userId, now, '通過', '未通過', '不可退保證金']);
    }
  }
  const bindings = runtime.openById(ids.master).insertSheet('用戶綁定');
  bindings.appendRow(['LINE User ID', '姓名', '身份選擇', '學號', '角色']);
  bindings.appendRow([context.userId, '練習考官', '', '', 'assistant']);
  runtime.operations.length = 0;
  return { runtime, taskId, phase, expiresAt: now.getTime() + SESSION_MS };
}

function getSession(userId, now) {
  const session = sessions.get(userId);
  if (!session || session.expiresAt <= now.getTime()) {
    sessions.delete(userId);
    return null;
  }
  return session;
}

function sandbox(session, command, context) {
  const originalSheets = global.SpreadsheetApp;
  const originalFetch = global.UrlFetchApp;
  global.SpreadsheetApp = { openById: id => session.runtime.openById(id) };
  global.UrlFetchApp = { fetch: () => { throw new Error('練習模式禁止推送真實 LINE 訊息'); } };
  try {
    return externalTeaching.handleCommand(command, context, { skipScheduleSync: true });
  } finally {
    global.SpreadsheetApp = originalSheets;
    global.UrlFetchApp = originalFetch;
    session.runtime.operations.length = 0;
    session.runtime.httpOperations.length = 0;
  }
}

function practiceAction(action, taskId) {
  if (!action) return action;
  // The training result sheet must stay private, but examiners need to see
  // the actual retest form link they will hand to students in production.
  if (action.type === 'uri' && action.uri?.includes(`/d/${ids.externalResults}/`)) {
    return { type: 'postback', label: '查看練習紀錄', data: `${PREFIX}查看點名結果 ${taskId}` };
  }
  if (action.type === 'postback' && ACTION_COMMAND.test(action.data || '')) {
    return { ...action, data: PREFIX + action.data };
  }
  if (action.type === 'message' && ACTION_COMMAND.test(action.text || '')) {
    return { type: 'postback', label: action.label, data: PREFIX + action.text };
  }
  return action;
}

function practiceQuickReply(quickReply, taskId) {
  if (!quickReply?.items) return quickReply;
  return { ...quickReply, items: quickReply.items.map(item => ({
    ...item, action: practiceAction(item.action, taskId)
  })) };
}

function practiceReply(result, taskId) {
  if (!result) return simpleReply('練習指令無效，請從考生卡片點選。', [['回練習名單', '練習點名']]);
  const guidance = result.text?.includes('【未通過時，請當場告知考生】')
    ? result.text.includes('上機未通過：')
      ? '\n\n🧪 練習提醒：這是假考生，不會傳送 LINE 私訊；上方連結是正式上機補考表單，僅供辨識流程，請勿用假資料送出。'
      : '\n\n🧪 練習提醒：這是假考生，不會傳送 LINE 私訊；簡答補考不需要上機報名表。'
    : '';
  const safeText = result.text
    ?.replace('考生尚未完成 LINE 姓名綁定，請考官現場提醒。', '練習模式不會私訊真實考生。')
    .replace('點擊下方可查看考生認證狀態。', '練習結果只保存在這次練習，不會寫入正式認證。') + guidance;
  const copy = { ...result, text: safeText };
  if (result.quickReply) copy.quickReply = practiceQuickReply(result.quickReply, taskId);
  if (result.fallbackQuickReply) copy.fallbackQuickReply = practiceQuickReply(result.fallbackQuickReply, taskId);
  if (result.lineMessage) {
    copy.lineMessage = {
      ...result.lineMessage,
      altText: `🧪 練習｜${result.lineMessage.altText || '考生卡片'}`,
      template: result.lineMessage.template ? {
        ...result.lineMessage.template,
        columns: result.lineMessage.template.columns?.map(column => ({
          ...column, actions: column.actions?.map(action => practiceAction(action, taskId))
        }))
      } : undefined,
      quickReply: practiceQuickReply(result.lineMessage.quickReply, taskId)
    };
  }
  return copy;
}

function handleCommand(text, context, now = new Date()) {
  const command = String(text || '').trim();
  if (!isPracticeCommand(command)) return null;
  if (context.sourceType !== 'user' || !context.userId) return simpleReply('練習模式請在與機器人的私人聊天室使用。');
  if (command === '結束練習') {
    sessions.delete(context.userId);
    return simpleReply('練習已結束；假資料已清除，沒有修改正式資料。', [['🏠 回首頁', '主選單']]);
  }
  if (command === '開始練習' || command === '開始教學練習' || command === '開始補考練習' || command === '練習重來') {
    const previous = getSession(context.userId, now);
    const phase = command === '開始教學練習' ? '教學' : command === '開始補考練習' ? '第一次補考' : command === '練習重來' ? previous?.phase || '考試' : '考試';
    const session = createSession(context, now, phase);
    sessions.set(context.userId, session);
    return practiceReply(sandbox(session, `開始點名 ${session.taskId}`, context), session.taskId);
  }
  const session = getSession(context.userId, now);
  if (!session) return simpleReply('目前沒有練習任務，請按「開始練習」。', [
    ['▶️ 開始練習', '開始練習'], ['🏠 回首頁', '主選單']
  ]);
  const requested = command === '練習' || command === '練習點名'
    ? `考生名單 ${session.taskId} 1` : command.slice(PREFIX.length);
  const realCommand = /^(?:今日任務|對外任務|近期任務)$/.test(requested)
    ? `查看任務 ${session.taskId}` : requested;
  // Crafted postbacks must not inspect other tasks or invoke a scheduler.
  if (!ACTION_COMMAND.test(realCommand) || !realCommand.split(/\s+/).includes(session.taskId)) {
    return simpleReply('請使用練習卡片上的按鈕。', [['回練習名單', '練習點名']]);
  }
  return practiceReply(sandbox(session, realCommand, context), session.taskId);
}

module.exports = { isPracticeCommand, handleCommand };
