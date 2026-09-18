'use strict';

// Practice stays entirely in process memory: no production Sheets, pushes, or
// certification updates. A Railway restart simply clears the demo sessions.
const sessions = new Map();
const SESSION_MS = 6 * 60 * 60 * 1000;
const DEMO_NAMES = ['陳小晴', '林小宇'];
const DEMO_EQUIPMENT = 'H6';

const isPracticeCommand = text => /^(?:練習|開始練習|練習點名|練習重來|結束練習|練習學生 [12]|練習出席 [12] (?:到場|缺席)|練習簡答 [12] (?:通過|未通過)|練習上機 [12] (?:通過|未通過))$/.test(String(text || '').trim());
const reply = (text, actions = []) => ({ text, ...(actions.length ? { quickReply: { items: actions.map(action => ({
  type: 'action', action: action.command === '主選單'
    ? { type: 'message', label: action.label, text: '主選單' }
    : { type: 'postback', label: action.label, data: action.command }
})) } } : {}) });
const nav = () => [
  { label: '📋 練習名單', command: '練習點名' },
  { label: '🔄 重新練習', command: '練習重來' },
  { label: '結束練習', command: '結束練習' },
  { label: '🏠 回首頁', command: '主選單' }
];

function createSession(now) {
  return {
    expiresAt: now.getTime() + SESSION_MS,
    startsAt: new Date(now.getTime() + 60 * 60 * 1000),
    students: DEMO_NAMES.map(name => ({ name, attendance: '未點名', short: '未評分', practical: '未評分' }))
  };
}

function getSession(userId, now) {
  const session = sessions.get(userId);
  if (!session || session.expiresAt <= now.getTime()) {
    sessions.delete(userId);
    return null;
  }
  return session;
}

function taskTime(date) {
  return new Intl.DateTimeFormat('zh-TW', {
    timeZone: 'Asia/Taipei', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false
  }).format(date);
}

function studentStatus(student) {
  if (student.attendance === '未點名') return '未點名';
  if (student.attendance === '缺席') return '缺席';
  if (student.short === '未評分') return '待評簡答';
  if (student.short === '未通過') return '簡答未通過';
  if (student.practical === '未評分') return '待評上機';
  return student.practical === '通過' ? '全部通過' : '上機未通過';
}

function listStudents(session) {
  const rows = session.students.map((student, index) => `${index + 1}. ${student.name}｜${studentStatus(student)}`).join('\n');
  return reply(`🧪【練習任務】\n${taskTime(session.startsAt)}｜考試｜${DEMO_EQUIPMENT}\n\n${rows}\n\n這是假資料，不會改正式認證或傳訊息給考生。`, [
    ...session.students.map((student, index) => ({ label: `👤 ${student.name}`, command: `練習學生 ${index + 1}` })),
    ...nav().slice(1)
  ]);
}

function showStudent(session, index) {
  const student = session.students[index];
  let actions;
  let prompt;
  if (student.attendance === '未點名') {
    prompt = '請選點名結果：';
    actions = [
      { label: '✅ 已到', command: `練習出席 ${index + 1} 到場` },
      { label: '❌ 缺席', command: `練習出席 ${index + 1} 缺席` }
    ];
  } else if (student.attendance === '到場' && student.short === '未評分') {
    prompt = '請選簡答結果：';
    actions = [
      { label: '簡答 ✅', command: `練習簡答 ${index + 1} 通過` },
      { label: '簡答 ❌', command: `練習簡答 ${index + 1} 未通過` }
    ];
  } else if (student.attendance === '到場' && student.short === '通過' && student.practical === '未評分') {
    prompt = '請選上機結果：';
    actions = [
      { label: '上機 ✅', command: `練習上機 ${index + 1} 通過` },
      { label: '上機 ❌', command: `練習上機 ${index + 1} 未通過` }
    ];
  } else {
    prompt = student.short === '未通過'
      ? '🗣️ 簡答未通過：請告知考生補考週可到影音實驗室現場補考，不需填上機報名表。'
      : student.practical === '未通過'
        ? '🎬 上機未通過：請告知考生須填第一次補考上機考報名表。'
        : student.attendance === '缺席' ? '缺席，這次不進行評分。' : '🎉 簡答與上機都通過！';
    actions = [];
  }
  return reply(`🧪【${student.name}｜${DEMO_EQUIPMENT}】\n點名：${student.attendance}｜簡答：${student.short}｜上機：${student.practical}\n\n${prompt}\n\n練習資料不會寫入正式表格。`, [
    ...actions,
    { label: '📋 回練習名單', command: '練習點名' },
    { label: '🏠 回首頁', command: '主選單' }
  ]);
}

function handleCommand(text, context, now = new Date()) {
  const command = String(text || '').trim();
  if (!isPracticeCommand(command)) return null;
  if (context.sourceType !== 'user' || !context.userId) return reply('練習模式請在與機器人的私人聊天室使用。');
  if (command === '結束練習') {
    sessions.delete(context.userId);
    return reply('練習已結束；沒有修改正式資料。', [{ label: '🏠 回首頁', command: '主選單' }]);
  }
  if (command === '開始練習' || command === '練習重來') {
    const session = createSession(now);
    sessions.set(context.userId, session);
    return listStudents(session);
  }
  const session = getSession(context.userId, now);
  if (!session) return reply('目前沒有練習任務，請按「開始練習」。', [
    { label: '▶️ 開始練習', command: '開始練習' },
    { label: '🏠 回首頁', command: '主選單' }
  ]);
  if (command === '練習' || command === '練習點名') return listStudents(session);
  const match = command.match(/^練習(學生|出席|簡答|上機) ([12])(?: (到場|缺席|通過|未通過))?$/);
  if (!match) return listStudents(session);
  const [, step, number, value] = match;
  const index = Number(number) - 1;
  const student = session.students[index];
  if (step === '學生') return showStudent(session, index);
  if (step === '出席' && student.attendance === '未點名' && ['到場', '缺席'].includes(value)) {
    student.attendance = value;
  } else if (step === '簡答' && student.attendance === '到場' && student.short === '未評分' && ['通過', '未通過'].includes(value)) {
    student.short = value;
  } else if (step === '上機' && student.attendance === '到場' && student.short === '通過' && student.practical === '未評分' && ['通過', '未通過'].includes(value)) {
    student.practical = value;
  } else {
    return reply('這一步目前不能登記；請依點名、簡答、上機的順序操作。', [
      { label: `👤 ${student.name}`, command: `練習學生 ${index + 1}` },
      { label: '📋 練習名單', command: '練習點名' }
    ]);
  }
  return showStudent(session, index);
}

module.exports = { isPracticeCommand, handleCommand };
