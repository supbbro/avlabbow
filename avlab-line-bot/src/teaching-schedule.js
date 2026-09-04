'use strict';

const { ids } = require('./config');

const MONTH_TABS = ['8月', '9月', '10月', '11月', '12月'];
const GROUP_SHEET = 'LINE群組設定';
const LOG_SHEET = '教學排程提醒紀錄';
const GROUP_SCOPE = '教學總排程';
const SCHEDULE_URL = `https://docs.google.com/spreadsheets/d/${ids.teachingSchedule}/edit`;
const COMMAND = /^(綁定教學群組(?:\s|$)|解除教學群組$|今日教學排程$|本週教學排程$)/;
const CATEGORIES = new Set([
  '中心、特定節日', '工作提醒', '行政', '行政工作提醒',
  '對內工作', '對內工作提醒', '對外工作', '對外工作提醒'
]);
let scheduleLinks = new Map();
let linksLoadedAt = 0;

const clean = value => String(value ?? '').trim();
const sheet = (id, name) => SpreadsheetApp.openById(id).getSheetByName(name);
const dateKey = value => Utilities.formatDate(value, Session.getScriptTimeZone(), 'yyyy-MM-dd');
const displayDate = value => Utilities.formatDate(value, Session.getScriptTimeZone(), 'MM/dd');
const qr = items => ({ items: items.map(item => ({
  type: 'action', action: item.uri
    ? { type: 'uri', label: item.label, uri: item.uri }
    : { type: 'message', label: item.label, text: item.text }
})) });
const reply = (text, items = []) => ({ text, ...(items.length ? { quickReply: qr(items) } : {}) });

function baseYear() {
  const term = clean(process.env.ACADEMIC_TERM || '1151');
  const rocYear = Number(term.slice(0, 3));
  return Number.isFinite(rocYear) ? rocYear + 1911 : new Date().getFullYear();
}

function parseDate(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return new Date(value);
  const match = clean(value).match(/^(\d{1,2})\/(\d{1,2})/);
  if (!match) return null;
  return new Date(baseYear(), Number(match[1]) - 1, Number(match[2]));
}

function extractCellLinks(cell = {}) {
  const text = clean(cell.formattedValue);
  const links = [];
  if (cell.hyperlink) links.push({ label: text || '開啟連結', url: cell.hyperlink });
  const textRuns = cell.textFormatRuns || [];
  textRuns.forEach((run, index) => {
    const url = run.format?.link?.uri;
    if (!url) return;
    const end = textRuns[index + 1]?.startIndex ?? text.length;
    links.push({ label: clean(text.slice(run.startIndex || 0, end)) || '開啟連結', url });
  });
  const chipRuns = cell.chipRuns || [];
  chipRuns.forEach((run, index) => {
    const url = run.chip?.richLinkProperties?.uri;
    if (!url) return;
    const end = chipRuns[index + 1]?.startIndex ?? text.length;
    links.push({ label: clean(text.slice(run.startIndex || 0, end)) || '開啟附件', url });
  });
  return [...new Map(links.filter(link => /^https?:\/\//i.test(link.url)).map(link => [link.url, link])).values()];
}

async function loadLinks(api, { force = false } = {}) {
  if (!api || (!force && Date.now() - linksLoadedAt < 55000)) return scheduleLinks.size;
  const response = await api.spreadsheets.get({
    spreadsheetId: ids.teachingSchedule,
    ranges: MONTH_TABS.map(tab => `'${tab}'!A1:I100`),
    includeGridData: true,
    fields: 'sheets(properties(title),data(startRow,startColumn,rowData(values(formattedValue,hyperlink,textFormatRuns(startIndex,format(link(uri))),chipRuns(startIndex,chip(richLinkProperties(uri)))))))'
  });
  const next = new Map();
  for (const tab of response.data.sheets || []) {
    for (const grid of tab.data || []) {
      const startRow = grid.startRow || 0, startColumn = grid.startColumn || 0;
      (grid.rowData || []).forEach((row, rowOffset) => {
        (row.values || []).forEach((cell, columnOffset) => {
          const links = extractCellLinks(cell);
          if (links.length) next.set(`${tab.properties.title}|${startRow + rowOffset}|${startColumn + columnOffset}`, links);
        });
      });
    }
  }
  scheduleLinks = next;
  linksLoadedAt = Date.now();
  return scheduleLinks.size;
}

function allEvents() {
  const events = [];
  for (const tab of MONTH_TABS) {
    const target = sheet(ids.teachingSchedule, tab);
    if (!target) continue;
    let dates = [];
    const rows = target.getDataRange().getValues();
    for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
      const row = rows[rowIndex];
      const possibleDates = row.slice(1, 8).map(parseDate);
      if (possibleDates.filter(Boolean).length >= 1) {
        dates = possibleDates;
        continue;
      }
      const category = clean(row[0]);
      if (!CATEGORIES.has(category) || !dates.length) continue;
      row.slice(1, 8).forEach((value, index) => {
        const text = clean(value);
        if (!dates[index] || !text || text === '-') return;
        const columnIndex = index + 1;
        events.push({ date: dates[index], category, text, tab, rowIndex, columnIndex,
          links: scheduleLinks.get(`${tab}|${rowIndex}|${columnIndex}`) || [] });
      });
    }
  }
  const unique = new Map();
  events.forEach(event => unique.set(`${dateKey(event.date)}|${event.category}|${event.text}`, event));
  return [...unique.values()].sort((left, right) => left.date - right.date || left.category.localeCompare(right.category, 'zh-Hant'));
}

function mondayOf(value) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
  return date;
}

function eventsForDay(value) {
  const key = dateKey(value);
  return allEvents().filter(event => dateKey(event.date) === key);
}

function eventsForWeek(value) {
  const start = mondayOf(value), end = new Date(start);
  end.setDate(end.getDate() + 7);
  return allEvents().filter(event => event.date >= start && event.date < end);
}

function groupRows() {
  const target = sheet(ids.externalResults, GROUP_SHEET);
  if (!target) return [];
  return target.getDataRange().getValues().slice(1).map((row, index) => ({
    row: index + 2, id: clean(row[0]), name: clean(row[1]), scope: clean(row[2]), enabled: clean(row[3]), admin: clean(row[7])
  })).filter(group => group.id && group.scope === GROUP_SCOPE);
}

function boundName(userId) {
  const target = sheet(ids.master, '用戶綁定');
  if (!target) return '';
  const row = target.getDataRange().getValues().slice(1).find(item => clean(item[0]) === clean(userId) && item[1]);
  return row ? clean(row[1]) : '';
}

function upsertGroup(context, requestedName) {
  const target = sheet(ids.externalResults, GROUP_SHEET);
  if (!target) throw new Error('找不到 LINE群組設定 工作表');
  const existing = groupRows().find(group => group.id === context.chatId);
  const name = clean(requestedName) || `教學群組-${clean(context.chatId).slice(-6)}`;
  const now = new Date(), values = [name, GROUP_SCOPE, '是', '09:00', 0, 'Asia/Taipei', boundName(context.userId), now, now];
  if (existing) target.getRange(existing.row, 2, 1, values.length).setValues([values]);
  else target.appendRow([context.chatId, ...values]);
  return name;
}

function disableGroup(chatId) {
  const target = sheet(ids.externalResults, GROUP_SHEET);
  const existing = groupRows().find(group => group.id === clean(chatId));
  if (!target || !existing) return false;
  target.getRange(existing.row, 4).setValue('否');
  target.getRange(existing.row, 10).setValue(new Date());
  return true;
}

function ensureLogSheet() {
  const book = SpreadsheetApp.openById(ids.externalResults);
  let target = book.getSheetByName(LOG_SHEET);
  if (!target) {
    target = book.insertSheet(LOG_SHEET);
    target.appendRow(['提醒類型', '紀錄鍵', '群組ID', '群組名稱', '排程日期', '發送時間']);
  }
  return target;
}

function formatEvents(events, weekly) {
  if (!events.length) return weekly ? '本週沒有登記教學排程。' : '今天沒有登記教學排程。';
  let current = '', lines = [];
  for (const event of events) {
    const key = dateKey(event.date);
    if (weekly && key !== current) {
      current = key;
      lines.push(`\n📅 ${displayDate(event.date)}`);
    }
    lines.push(`${weekly ? '' : '• '}${event.category}｜${event.text}`);
    for (const link of event.links || []) lines.push(`  🔗 ${link.label}\n  ${link.url}`);
  }
  return lines.join('\n').trim();
}

function scheduleReply(events, weekly) {
  const title = weekly ? '📣【1151 本週教學排程】' : `⏰【1151 今日教學排程｜${displayDate(events[0]?.date || new Date())}】`;
  return reply(`${title}\n\n${formatEvents(events, weekly)}`.slice(0, 4900), [
    { label: '📊 開啟完整排程', uri: SCHEDULE_URL }
  ]);
}

function queuePush(groupId, message) {
  UrlFetchApp.fetch('https://api.line.me/v2/bot/message/push', {
    method: 'post', headers: { Authorization: `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}` },
    contentType: 'application/json', payload: JSON.stringify({
      to: groupId, messages: [{ type: 'text', text: message.text, quickReply: message.quickReply }]
    }), muteHttpExceptions: true
  });
}

function reminderDue(now) {
  const due = new Date(now);
  due.setHours(9, 0, 0, 0);
  return now >= due;
}

function sendGroupReminders(now = new Date()) {
  if (!reminderDue(now)) return 0;
  const activeGroups = groupRows().filter(group => group.enabled === '是');
  if (!activeGroups.length) return 0;
  const log = ensureLogSheet();
  const sent = new Set(log.getDataRange().getValues().slice(1).map(row => clean(row[1])).filter(Boolean));
  const dailyEvents = eventsForDay(now);
  const weeklyEvents = now.getDay() === 1 ? eventsForWeek(now) : [];
  let count = 0;
  for (const group of activeGroups) {
    const reminders = [];
    if (weeklyEvents.length) reminders.push({ type: '週一提醒', key: `教學排程週一:${group.id}:${dateKey(mondayOf(now))}`, events: weeklyEvents, weekly: true });
    if (dailyEvents.length) reminders.push({ type: '當日提醒', key: `教學排程當日:${group.id}:${dateKey(now)}`, events: dailyEvents, weekly: false });
    for (const reminder of reminders) {
      if (sent.has(reminder.key)) continue;
      queuePush(group.id, scheduleReply(reminder.events, reminder.weekly));
      log.appendRow([reminder.type, reminder.key, group.id, group.name, dateKey(now), now]);
      sent.add(reminder.key);
      count++;
    }
  }
  return count;
}

function handleCommand(text, context) {
  const command = clean(text);
  const bind = command.match(/^綁定教學群組(?:\s+(.+))?$/);
  if (bind) {
    if (!['group', 'room'].includes(context.sourceType)) return reply('請在要接收提醒的 LINE 群組中輸入這個指令。');
    return reply(`✅ 已綁定「${upsertGroup(context, bind[1])}」\n每週一 09:00 推播本週摘要，每天 09:00 推播當日排程。`, [
      { label: '查看本週排程', text: '本週教學排程' },
      { label: '📊 開啟完整排程', uri: SCHEDULE_URL }
    ]);
  }
  if (command === '解除教學群組') {
    if (!['group', 'room'].includes(context.sourceType)) return reply('請在已綁定的教學群組中操作。');
    return reply(disableGroup(context.chatId) ? '已停止此群組的 1151 教學排程提醒。' : '此群組尚未啟用教學排程提醒。');
  }
  if (command === '今日教學排程') return scheduleReply(eventsForDay(new Date()), false);
  if (command === '本週教學排程') return scheduleReply(eventsForWeek(new Date()), true);
  return null;
}

module.exports = {
  isCommand: text => COMMAND.test(clean(text)), handleCommand, sendGroupReminders, disableGroup, loadLinks,
  _test: { allEvents, eventsForDay, eventsForWeek, mondayOf, reminderDue, formatEvents, extractCellLinks }
};
