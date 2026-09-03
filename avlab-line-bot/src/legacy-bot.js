'use strict';
var CHANNEL_ACCESS_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN;
var TASK_SHEET_ID=process.env.INTERNAL_TASK_FILE_ID||'1MDIpAfU2LYiv9LAduSDRDlh4vkgL6e5z',TASK_SHEET_NAME='1151 對內教學官／考官安排',COL_TASK_DATE=0,COL_TASK_PHASE=1,COL_TASK_LEVEL=2,COL_TASK_ITEM=3,COL_TASK_NAME=4,COL_TASK_LOCATION=5;
var INTERNAL_ATTENDANCE_SHEET_ID=process.env.INTERNAL_ATTENDANCE_SHEET_ID||'15INDclJDJSXKlXNDh2x50zbfeSi9hsGO8TKaJXjvlWo';
var EXTERNAL_RESULTS_SHEET_ID=process.env.EXTERNAL_RESULTS_SHEET_ID||'1WXeO6VF-emmoP_07tzsGk5z0WGSU7aFLbtbT0ImYACg',EXTERNAL_TASK_SHEET_NAME='對外任務';
var MASTER_SHEET_ID='1iqzwP74yZtlxcy2qnJ8y1NvMCUdlNDP73CaQECVZodY';
var ATTENDANCE_SHEET_NAME='教學考試點名和通過情況總表';
var LEAVE_SHEET_ID='1A0wZWctAbihNzNi3Ji0CVW6at024QQQDnNzdQP1K2XI',LEAVE_SHEET_NAME='表單回覆 1',COL_LEAVE_TIMESTAMP=0,COL_LEAVE_NAME=1,COL_LEAVE_DATE=5,COL_LEAVE_SUBSTITUTE=7;
var EXTERNAL_SHEET_ID='1UGoTWRq59rNatZn5ZUYRu-reiYiRquI2GREeWDsf5sU',EXTERNAL_SHEET_NAME='表單回覆 1',COL_EXTERNAL_TIMESTAMP=0,COL_EXTERNAL_NAME=1,COL_EXTERNAL_DATE=2,COL_EXTERNAL_SUBSTITUTE=5;
var ASSISTANT_SHEET_ID='1n5-GLLMxCORCwNqne2nLzplC16n9YPfbKlU2oxzuCp0',ASSISTANT_SHEET_NAME='助理名單',COL_NAME_IN_LIST=0;
var CERT_SHEET_ID=process.env.INTERNAL_CERTIFICATION_SHEET_ID||'1vUnpcRVsQmUH9zjqic8KFf5IlGk0E5GSH-rkhBGE7bk',CERT_SHEET_NAME='工作表1',COL_CERT_NAME=0,FIRST_EQUIP_COL=3;
// ========== 用戶綁定表設定 ==========
var USER_BIND_SHEET_NAME = '用戶綁定';
var BIND_COL_USER_ID = 0;
var BIND_COL_NAME = 1;
var BIND_COL_TIME = 2;
var BIND_COL_STUDENT_NUMBER = 3;
var PENDING_ROLE_PREFIX = 'pending_role_';

// ========== 補考表單設定 ==========
var RETEST_SHEET_ID = '1H5kVv2AOtasMvS-YBBtjG_TYyiV09b3al586jbeB8Zc';
var RETEST_SHEET_NAME = '表單回覆 1';
var COL_RETEST_TIMESTAMP = 0;
var COL_RETEST_STUDENT_NAME = 1;
var COL_RETEST_LEVEL = 2;
var COL_RETEST_TYPE = 3;
var COL_RETEST_EQUIP = 4;
var COL_RETEST_EXAMINER = 5;
var COL_RETEST_DATE = 6;
var COL_RETEST_PASS = 7;

// ========== 管理員名單（接收請假通知） ==========
var MANAGER_NAMES = ['徐嘉翔', '蔡季妍', '吳欣芸'];
// ========== 管理員權限檢查 ==========
function isManager(userId) {
  var name = getBoundName(userId);
  if (!name) return false;
  return MANAGER_NAMES.includes(name);
}
// ========== 射龍門專用試算表設定 ==========
var GAME_SHEET_ID = '1fGQiWWbfiuX5i_ADm5p95aPgZP0jTXGxPyrBQvqoOmQ';
var PLAYER_SHEET = '玩家資料';
var TRANSACTION_SHEET = '交易紀錄';
var POOL_SHEET = '池底紀錄';
var TITLE_SHEET = '稱號紀錄';

// ========== 射龍門遊戲基本設定 ==========
var ENTRY_FEE = 1;           // 每局入池金（教學代幣）
var DEFAULT_TOKEN = 20;      // 新玩家預設代幣
var DAILY_BONUS = 10;        // 每日首次獎勵
var TITLE_REWARD = 50;       // 賭神獎勵代幣
var TITLE_NAME = '👑 賭神';   // 賭神稱號

// ========== 冷卻與防抖設定 ==========
var GAME_END_CACHE = CacheService.getScriptCache(); // 記錄遊戲結束時間
var LAST_COMMAND_TIME = {};                          // 記錄用戶最後指令時間（防抖）
// ========== 新增：二次確認專用快取 ==========
var CONFIRM_CACHE_PREFIX = 'confirm_start_';        // 等待確認開始的標記
var CONFIRM_OK_PREFIX = 'confirm_ok_';              // 已確認開始的標記（有效期10秒）

// ========== 排班功能相關設定 ==========
var BASIC_EQUIP_COURSE = '基礎配件課程';
var EXAM_SCHEDULE_SHEET_ID = '1UauuYQcPHQrYKQLIhFidem1x_UO0PxUICu_v7Tqy4GU';
var EXAM_SCHEDULE_SHEET_NAME = '對外考試排程';
var COL_EXAM_DATE = 0;
var COL_EXAM_WEEKDAY = 1;
var COL_EXAM_TIME = 2;
var COL_EXAM_ITEM = 3;
var COL_EXAM_PHASE = 4;

var AVAILABILITY_SHEET_ID = '1UauuYQcPHQrYKQLIhFidem1x_UO0PxUICu_v7Tqy4GU';
var AVAILABILITY_SHEET_NAME = '表單回覆 1';
var COL_AVAIL_NAME = 2;
var COL_AVAIL_LEVEL = 3;
var COL_AVAIL_MON = 4;
var COL_AVAIL_TUE = 5;
var COL_AVAIL_WED = 6;
var COL_AVAIL_THU = 7;
var COL_AVAIL_FRI = 8;
var COL_AVAIL_NOTE = 9;

var FINAL_SCHEDULE_SHEET_NAME = '最終排班結果';
// ========== 政大美食清單（供教學飽使用） ==========
var FOOD_LIST = {
  早餐: ['阿寶', '李白', '小貓咪', '口福', '古早味', 'Q burger', '美味派', '麥當勞'],
  午晚餐: ['小確幸', '海南雞', '波波恰恰', '原丼力', 'juicy bun', '左撇子', 'lazy pasta', '菁英自助餐', '食鼎鵝肉飯', '小曼谷', '提洛斯', '敏忠', '八方', '韓大佬', 'comesee 披薩', '湘湘牛排', '小尚品', '海底撈', '珍妹麵店', '敘緣小館', '麥當勞', '入口漢堡', '廢墟', 'shukie', '緣分小火鍋', '首思義', '高句麗', '四川', '麻辣燙', '關東煮', '大隻佬', '原汁牛肉麵', '福勝亭', '栗鍋', 'WOW獨享鍋', '起家基', '肯德基', '滇味廚房', '浪速'],
  宵夜: ['健滷', '烤場', '明池豆花', '串霸', '永豆', '嚐相聚', '麥當勞'],
  飲料: ['龍角', '得正', '政大茶亭', 'cow banana', '五十嵐'],
  甜點: ['明池', '小木屋', '小蜻子', '自由之丘', '小公寓', '覓糖', '麵包大亨', '惜惜咖啡'],
  校內: ['商院小七', '集英樓', 'POKE']
};
const LEVEL_REQUIREMENTS={
  '見習':{
    'all':[
      'X160','A7SII','Atomos','CX350','3Play','字幕機','H6',
      '軟殼燈','Lith LED','Zoom350','Par 200W'
    ]
  },
  '二級':{
    'all':[
      'FS7','Teradek圖傳','Dwarf圖傳','Vortex 4S/8S','F8n','聲音工作區',
      '導播台','錄放影機','成音台','字幕機'
    ]
  },
  '一級':{
    'all':[
      'KOMODO 6K','A7S3','Teradek無線追','Flo Box','ARRI S60 Pro','833','633'
    ]
  }
};
const LEVEL_MAP={'徐嘉翔':'一級','毛成甄':'一級','王鈺慈':'一級','王師湲':'一級','梁文宜':'一級','陳逸璇':'一級','詹詠丞':'一級','施少涵':'二級','洪子雲':'二級','吳靜宜':'二級','江哲維':'二級','蔡季妍':'二級','吳欣芸':'二級','趙志僖':'二級','黃忻妤':'二級','陳胤之':'二級','賈茹茵':'二級','吳青璇':'二級','侯沛岑':'二級','許彤瑜':'二級','劉謹誼':'二級','陳奕穎':'二級','張馨元':'二級','許韶恩':'二級','蔡亞芯':'二級','朱曼禎':'二級','劉祐臻':'二級','胡邵晴':'二級','蔡妍安':'二級','曾郁淳':'二級','鄭書羽':'二級','鍾采彤':'見習','楊媛祺':'見習','張競云':'見習','李芸欣':'見習','林芷晴':'見習','葉秉勛':'見習','萬佳嫻':'見習','李子煊':'見習','徐晨瑋':'見習','張珉寧':'見習','李慈恩':'見習','劉俊睿':'見習','蔡璨遠':'見習','黃鈺琇':'見習','賴奕倫':'見習','李愉瑩':'見習','謝培愉':'見習','施語柔':'見習','韓睿森':'見習','王祥宇':'見習','林芫希':'見習','曾澧翔':'見習','侯少恩':'見習','黃浩霖':'見習','黃萱':'見習','陳逸朗':'見習','張庭瑄':'見習','莊馥瑄':'見習','杜宥萱':'見習','王絜薷':'見習'};

// ========== 原有輔助函數 ==========
function gC(s,e,d,l){return'https://www.google.com/calendar/render?action=TEMPLATE&text='+encodeURIComponent(s)+'&dates='+((d=>d.toISOString().replace(/-|:|\.\d+/g,''))(e)+'/'+d.toISOString().replace(/-|:|\.\d+/g,''))+'&details='+encodeURIComponent(d||'')+'&location='+encodeURIComponent(l||'');}
function ck(u,k){var c=CacheService.getScriptCache(),l=c.get(u+'_last'),n=parseInt(c.get(u+'_count'))||0;n=l===k?n+1:1;c.put(u+'_last',k,3600);c.put(u+'_count',n,3600);return n>=7;}
function nrm(r){return r?r.toString().replace(/[（(][^）)]*[）)]/g,'').replace(/\s+/g,''):'';}
function qr(b){return{items:b.map(function(item){return{
  type:'action',
  action:item.uri
    ? {type:'uri',label:item.label,uri:item.uri}
    : {type:'message',label:item.label,text:item.text}
};})};}
function bA(){return qr([{label:'🔙 回上一頁',text:'回上一頁'},{label:'🏠 回首頁',text:'主選單'}]);}
function bE(){return qr([{label:'🔙 回上一頁',text:'回上一頁'},{label:'🏠 回首頁',text:'主選單'}]);}

// ========== 從總表讀取所有資料（點名 + 考試結果），加入快取（30秒） ==========
function getMasterData() {
  var cache = CacheService.getScriptCache();
  var cached = cache.get('MASTER_DATA');
  if (cached) return JSON.parse(cached);

  try {
    var sheet = SpreadsheetApp.openById(INTERNAL_ATTENDANCE_SHEET_ID).getSheetByName(ATTENDANCE_SHEET_NAME);
    if (!sheet) return [];

    var lastRow = sheet.getLastRow();
    var lastCol = sheet.getLastColumn();
    if (lastRow < 2 || lastCol < 3) return [];

    var data = sheet.getRange(1, 1, lastRow, lastCol).getValues();
    var headers = data[0];
    var rows = data.slice(1);
    var records = [];
    var currentTeaching = null;

    for (var col = 2; col < headers.length; col++) {
      var header = headers[col];
      if (!header || typeof header !== 'string') continue;

      if (header.includes('教學') || header.includes('檢定')) {
        currentTeaching = header;
        for (var i = 0; i < rows.length; i++) {
          var row = rows[i];
          var rawName = row[0];
          if (!rawName || rawName.toString().trim() === '') continue;
          var name = nrm(rawName.toString());
          var cellValue = row[col];
          if (cellValue && cellValue.toString().trim() !== '') {
            records.push({
              name: name,
              type: 'attendance',
              activity: currentTeaching,
              value: cellValue.toString().trim(),
              date: parseDateFromHeader(header)
            });
          }
        }
      }
      else if (header.includes('加開結果') || header.includes('考試結果')) {
        var resultType = header.includes('加開結果') ? '加開' : '考試';
        var teaching = currentTeaching || '未知活動';
        for (var i = 0; i < rows.length; i++) {
          var row = rows[i];
          var rawName = row[0];
          if (!rawName || rawName.toString().trim() === '') continue;
          var name = nrm(rawName.toString());
          var cellValue = row[col];
          if (cellValue && cellValue.toString().trim() !== '') {
            records.push({
              name: name,
              type: 'result',
              activity: teaching,
              resultType: resultType,
              value: cellValue.toString().trim(),
              date: parseDateFromHeader(header)
            });
          }
        }
      }
    }
    cache.put('MASTER_DATA', JSON.stringify(records), 30);
    return records;
  } catch (e) {
    Logger.log('getMasterData 錯誤: ' + e);
    return [];
  }
}

function parseDateFromHeader(header) {
  var dateMatch = header.match(/(\d{1,2})\/(\d{1,2})/);
  if (dateMatch) {
    var month = parseInt(dateMatch[1], 10);
    var day = parseInt(dateMatch[2], 10);
    var year = 2026;
    return new Date(year, month - 1, day);
  }
  return null;
}

// ========== 點名資料（向後相容） ==========
function getAttendanceData() {
  var all = getMasterData();
  return all.filter(r => r.type === 'attendance').map(r => ({
    name: r.name,
    status: r.value,
    date: r.date,
    activity: r.activity
  }));
}

// ========== 個人點名明細 + 統計 ==========
function showAttendanceStats(name) {
  var targetName = nrm(name);
  var records = getAttendanceData().filter(r => r.name === targetName);
  records.sort((a, b) => (a.activity > b.activity ? 1 : -1));

  var detail = '';
  var stats = {到:0, 請假:0, 缺席:0, 遲到:0, 教學官:0};

  records.forEach(r => {
    detail += r.activity + '：' + r.status + '\n';
    var st = r.status || '';
    if (st.includes('到')) stats.到++;
    else if (st.includes('請假')) stats.請假++;
    else if (st.includes('缺席')) stats.缺席++;
    else if (st.includes('遲到')) stats.遲到++;
    else if (st.includes('教學官')) stats.教學官++;
  });

  var total = records.length;
  var penalty = getPersonalLeavePenalty(name);

  var text = '【' + name + ' 的點名明細】\n' + (detail || '⚠️ 查無點名紀錄\n');
  text += '\n【統計】\n總點名筆數：' + total + '\n✅ 到：' + stats.到 + ' 次\n📝 請假：' + stats.請假 + ' 次\n❌ 缺席：' + stats.缺席 + ' 次\n';
  text += '\n【請假扣分統計】\n✅ 正常請假：' + penalty.normal + ' 次 (扣 ' + (penalty.normal * 0.5).toFixed(1) + ' 分)\n⚠️ 逾期請假：' + penalty.late + ' 次 (扣 ' + (penalty.late * 2) + ' 分)\n❌ 曠職：' + penalty.absent + ' 次 (扣 ' + (penalty.absent * 4) + ' 分)\n💰 總請假扣分：' + (penalty.totalPoints || 0).toFixed(1) + ' 分';

  return { text: text, quickReply: bA() };
}

// ========== 考試結果查詢 ==========
function showExamResults(name) {
  var targetName = nrm(name);
  var all = getMasterData();
  var results = all.filter(r => r.type === 'result' && r.name === targetName);

  var grouped = {};
  results.forEach(r => {
    if (!grouped[r.activity]) grouped[r.activity] = {};
    grouped[r.activity][r.resultType] = r.value;
  });

  if (Object.keys(grouped).length === 0) {
    return { text: '找不到 ' + name + ' 的考試結果記錄', quickReply: bA() };
  }

  var text = '【' + name + ' 的考試結果】\n\n';
  var activities = Object.keys(grouped).sort();
  activities.forEach(act => {
    text += '📌 ' + act + '\n';
    if (grouped[act]['加開']) text += '  加開結果：' + grouped[act]['加開'] + '\n';
    if (grouped[act]['考試']) text += '  考試結果：' + grouped[act]['考試'] + '\n';
    text += '\n';
  });
  return { text: text, quickReply: bA() };
}

// ========== 請假資料（含快取，30秒） ==========
function getLeaveData() {
  var cache = CacheService.getScriptCache();
  var cached = cache.get('LEAVE_DATA');
  if (cached) {
    var parsed = JSON.parse(cached);
    parsed.forEach(item => {
      item.submitTime = new Date(item.submitTime);
      item.leaveDate = new Date(item.leaveDate);
    });
    return parsed;
  }

  try {
    var s = SpreadsheetApp.openById(LEAVE_SHEET_ID).getSheetByName(LEAVE_SHEET_NAME);
    if (!s) return [];
    var data = s.getDataRange().getValues().slice(1).map(r => ({
      name: r[COL_LEAVE_NAME].toString(),
      submitTime: new Date(r[COL_LEAVE_TIMESTAMP]),
      leaveDate: new Date(r[COL_LEAVE_DATE]),
      substitute: (r[COL_LEAVE_SUBSTITUTE] || '').toString()
    })).filter(d => !isNaN(d.submitTime) && !isNaN(d.leaveDate));
    cache.put('LEAVE_DATA', JSON.stringify(data), 30);
    return data;
  } catch (e) {
    return [];
  }
}

function wd(d){var w=new Date(d);w.setDate(w.getDate()+(3-(w.getDay()||7)));w.setHours(23,59,59);return w;}
function td(d){var t=new Date(d);t.setDate(t.getDate()+(4-(t.getDay()||7)));t.setHours(18,0,0);return t;}
function cl(s,l){var w=wd(l),t=td(l);return s<=w?'normal':s<=t?'late':'absent';}

function getPersonalLeavePenalty(n){
  var s={normal:0,late:0,absent:0,totalPoints:0};
  getLeaveData().forEach(i=>{
    if(i.name===n){
      var t=cl(i.submitTime,i.leaveDate);
      s[t]++; s.totalPoints+=t==='normal'?0.5:t==='late'?2:4;
    }
  });
  return s;
}

// ========== 全體統計 ==========
function getAllCombinedStats(){
  var a={}, p={};
  getAttendanceData().forEach(r => {
    var n = r.name;
    var st = r.status || '';
    if (!n) return;
    if (!a[n]) a[n] = {到:0, 請假:0, 缺席:0, 遲到:0, 教學官:0};
    if (st.includes('到')) a[n].到++;
    else if (st.includes('請假')) a[n].請假++;
    else if (st.includes('缺席')) a[n].缺席++;
    else if (st.includes('遲到')) a[n].遲到++;
    else if (st.includes('教學官')) a[n].教學官++;
  });
  getLeaveData().forEach(i => {
    var n = i.name;
    var t = cl(i.submitTime, i.leaveDate);
    if (!p[n]) p[n] = {normal:0, late:0, absent:0, total:0};
    p[n][t]++; p[n].total += t==='normal'?0.5 : t==='late'?2 : 4;
  });
  var o = '【全體助理點名與請假統計】\n';
  Object.keys(a).sort().forEach(n => {
    var A = a[n];
    var P = p[n] || {normal:0, late:0, absent:0, total:0};
    o += n + '：到' + A.到 + ' 請假' + A.請假 + ' 缺席' + A.缺席 + ' 遲到' + A.遲到 + ' 教學官' + A.教學官 + ' (扣分: ' + P.total.toFixed(1) + ')\n';
  });
  return o || '目前無點名統計資料。';
}

// ========== 代班查詢 ==========
function getSubstituteInfo(n){
  var r={對內:{申請:[],代班:[]},對外:{申請:[],代班:[]}};
  try{
    var s=SpreadsheetApp.openById(LEAVE_SHEET_ID).getSheetByName(LEAVE_SHEET_NAME);
    if(s) s.getDataRange().getValues().slice(1).forEach(rw=>{
      var a=rw[COL_LEAVE_NAME], sb=rw[COL_LEAVE_SUBSTITUTE], d=rw[COL_LEAVE_DATE];
      var ds=d instanceof Date?Utilities.formatDate(d,Session.getScriptTimeZone(),'yyyy/MM/dd'):String(d);
      if(a===n) r.對內.申請.push({日期:ds,代班人:sb||'未填'});
      if(sb===n) r.對內.代班.push({日期:ds,申請人:a||'未知'});
    });
  }catch(e){}
  try{
    var e=SpreadsheetApp.openById(EXTERNAL_SHEET_ID).getSheetByName(EXTERNAL_SHEET_NAME);
    if(e) e.getDataRange().getValues().slice(1).forEach(rw=>{
      var a=rw[COL_EXTERNAL_NAME], sb=rw[COL_EXTERNAL_SUBSTITUTE], d=rw[COL_EXTERNAL_DATE];
      var ds=d instanceof Date?Utilities.formatDate(d,Session.getScriptTimeZone(),'yyyy/MM/dd'):String(d);
      if(a===n) r.對外.申請.push({日期:ds,代班人:sb||'未填'});
      if(sb===n) r.對外.代班.push({日期:ds,申請人:a||'未知'});
    });
  }catch(e){}
  return r;
}

function showSubstituteInfo(n){
  var s=getSubstituteInfo(n), t='【'+n+' 的代班紀錄】\n\n📌 對內請假\n▶ 申請請假：\n';
  t+=(s.對內.申請.length?s.對內.申請.map(i=>'   '+i.日期+' 由 '+i.代班人+' 代班').join('\n'):'   無紀錄')+'\n▶ 被代班：\n';
  t+=(s.對內.代班.length?s.對內.代班.map(i=>'   '+i.日期+' 幫 '+i.申請人+' 代班').join('\n'):'   無紀錄')+'\n\n📌 對外考官更動\n▶ 申請更動：\n';
  t+=(s.對外.申請.length?s.對外.申請.map(i=>'   '+i.日期+' 由 '+i.代班人+' 代班').join('\n'):'   無紀錄')+'\n▶ 被代班：\n';
  t+=(s.對外.代班.length?s.對外.代班.map(i=>'   '+i.日期+' 幫 '+i.申請人+' 代班').join('\n'):'   無紀錄');
  return{text:t, quickReply:bA()};
}

// ========== 任務查詢（資料由 webhook 進入點即時重新載入） ==========
function getTasksFromSheet(n){
  try{
    var s=SpreadsheetApp.openById(TASK_SHEET_ID).getSheetByName(TASK_SHEET_NAME);
    if(!s) return[];
    var d=s.getDataRange().getValues().slice(1), inp=nrm(n);
    var tasks = d.filter(r=>nrm(r[COL_TASK_NAME])===inp).map(r=>{
      var dt=r[COL_TASK_DATE]instanceof Date?r[COL_TASK_DATE]:new Date(r[COL_TASK_DATE]);
      var type = r[COL_TASK_PHASE] && r[COL_TASK_PHASE].toString().includes('教學') ? '📚 教學' : '📝 檢定';
      var sum='📅 '+Utilities.formatDate(dt,Session.getScriptTimeZone(),'MM/dd')+' [對內] ' + type + ' - '+r[COL_TASK_LEVEL]+' / '+r[COL_TASK_ITEM]+' ('+r[COL_TASK_LOCATION]+')';
      return{
        summary:sum,
        description:'級別：'+r[COL_TASK_LEVEL]+'\n項目：'+r[COL_TASK_ITEM]+'\n地點：'+r[COL_TASK_LOCATION],
        start:new Date(dt.setHours(18,0,0,0)),
        end:new Date(dt.setHours(21,0,0,0))
      };
    });
    return tasks;
  }catch(e){return[];}
}

function taskClockParts(value){
  if(value instanceof Date)return{hour:value.getHours(),minute:value.getMinutes()};
  var raw=String(value||''),m=raw.match(/(\d{1,2}):(\d{2})/);
  if(!m)return null;
  var hour=Number(m[1]);
  if((raw.includes('下午')||/\bPM\b/i.test(raw))&&hour<12)hour+=12;
  if((raw.includes('上午')||/\bAM\b/i.test(raw))&&hour===12)hour=0;
  return{hour:hour,minute:Number(m[2])};
}

function taskDateTime(dateValue,timeValue,fallbackHour){
  var date=dateValue instanceof Date?new Date(dateValue):new Date(dateValue);
  if(isNaN(date.getTime()))return null;
  var clock=taskClockParts(timeValue)||{hour:fallbackHour,minute:0};
  date.setHours(clock.hour,clock.minute,0,0);
  return date;
}

function getExternalTasksForName(n){
  try{
    var s=SpreadsheetApp.openById(EXTERNAL_RESULTS_SHEET_ID).getSheetByName(EXTERNAL_TASK_SHEET_NAME);
    if(!s)return[];
    var inp=nrm(n);
    return s.getDataRange().getValues().slice(1).filter(r=>{
      var taskId=String(r[0]||'');
      return taskId&&!taskId.startsWith('_TEMPLATE')&&nrm(r[8])===inp&&String(r[11]||'')!=='已取消';
    }).map(r=>{
      var start=taskDateTime(r[3],r[4],18),end=taskDateTime(r[3],r[5],21);
      if(!start)return null;
      if(!end||end<=start)end=new Date(start.getTime()+60*60*1000);
      var phase=String(r[2]||'任務'),icon=phase==='教學'?'📚':'📝';
      var summary='📅 '+Utilities.formatDate(start,Session.getScriptTimeZone(),'MM/dd')+' [對外] '+icon+' '+phase+' - '+r[6]+' ('+(r[7]||'地點未填')+')';
      return{
        summary:summary,
        description:'任務ID：'+r[0]+'\n階段：'+phase+'\n項目：'+r[6]+'\n地點：'+(r[7]||'未填'),
        start:start,end:end,taskId:String(r[0]),source:'對外'
      };
    }).filter(Boolean);
  }catch(e){return[];}
}

// ========== 顯示任務 ==========
function showTasksForName(name) {
  var level = LEVEL_MAP[name];
  var apprenticeText='【1151 對內教學/檢定 - 重要時程表】\n\n' +
               '📚 9/6 暑訓教學\n\n' +
               '📝 9/18 暑訓檢定\n\n' +
               '📚 10/16 期中教學\n\n' +
               '📝 10/30 期中檢定\n\n' +
               '📚 11/6 期末教學\n\n' +
               '📝 12/4 期末檢定\n\n' +
               '⚠️ 考官與考生請留意時間，無法出席請依規定完成請假程序喔！';
  var t = getTasksFromSheet(name).concat(getExternalTasksForName(name)).sort((a,b)=>a.start-b.start);
  if(level==='見習'&&!t.length)return{text:apprenticeText,quickReply:bA()};
  if (!t.length) return { text: '找不到 ' + name + ' 的任務記錄', quickReply: bA(), notFound: true };
  var txt=(level==='見習'?apprenticeText+'\n\n':'')+'【' + name + ' 的對內＋對外教學官／考官任務】\n\n',q=[],td=new Date();
  var today=new Date(td);today.setHours(0,0,0,0);
  t.forEach((tk, i) => {
    txt += tk.summary + '\n';
    var taskDay=new Date(tk.start);taskDay.setHours(0,0,0,0);
    var df=Math.round((taskDay-today)/86400000);
    txt += df > 0 ? '   ⏳ 距離任務還有 ' + df + ' 天\n' : df === 0 ? '   ⚠️ 就是今天！好強！\n' : '   ⌛ 任務已過期\n';
    q.push({ type: 'action', action: { type: 'uri', label: '📅 加入任務 ' + (i + 1), uri: gC(tk.summary, tk.start, tk.end, tk.description, '影音實驗室') } });
    txt += '\n';
  });
  txt += '💡 將任務手動加入手機行事曆！怎這強！';
  q.push({ type: 'action', action: { type: 'message', label: '🔙 回上一頁', text: '回上一頁' } }, { type: 'action', action: { type: 'message', label: '🏠 回首頁', text: '主選單' } });
  return { text: txt, quickReply: { items: q } };
}

// ========== 認證查詢（含快取，30秒） ==========
function getCertificationData(){
  var cache = CacheService.getScriptCache();
  var cached = cache.get('CERT_DATA');
  if (cached) return JSON.parse(cached);

  try{
    var s=SpreadsheetApp.openById(CERT_SHEET_ID).getSheetByName(CERT_SHEET_NAME);
    if(!s) return{};
    var d=s.getDataRange().getValues();
    if(d.length<4) return{};
    var eq=[];
    for(var c=FIRST_EQUIP_COL;c<d[1].length;c++){ var h=d[1][c]; if(h&&h.toString().trim()) eq.push(h.toString().trim().toUpperCase()); }
    var cm={};
    for(var i=3;i<d.length;i++){
      var r=d[i], n=r[COL_CERT_NAME];
      if(!n||!n.toString().trim()) continue;
      var nm=nrm(n.toString()), lv=LEVEL_MAP[n.toString()];
      if(!lv) continue;
      var psd=[];
      for(var j=0;j<eq.length;j++){
        var cv=r[FIRST_EQUIP_COL+j], is=false;
        if(typeof cv==='string'){ var v=cv.trim().toUpperCase(); if(v==='V'||v==='✓'||v==='TRUE') is=true; }
        else if(cv===true) is=true;
        if(is) psd.push(eq[j]);
      }
      var req=LEVEL_REQUIREMENTS[lv].all.map(function(e){ return e.toUpperCase(); });
      var miss=req.filter(e=>!psd.includes(e));
      cm[nm]={name:n.toString(), level:lv, passed:psd, missing:miss, required:req};
    }
    cache.put('CERT_DATA', JSON.stringify(cm), 30);
    return cm;
  }catch(e){ return{}; }
}

// ========== 認證進度顯示 ==========
function showCertificationProgress(name) {
  var allNames = getAssistantNames();
  var normalizedName = nrm(name);
  if (!allNames.includes(normalizedName)) {
    return { text: '查無「' + name + '」在助理名單中', quickReply: bA() };
  }
  var certData = getCertificationData()[normalizedName];
  if (!certData) {
    return { text: '找不到「' + name + '」的認證記錄', quickReply: bA() };
  }
  
  var passedAll = certData.passed || [];
  var currentLevel = certData.level;
  
  var allLevels = ['見習', '二級', '一級'];
  var displayLevels = [];
  if (currentLevel === '見習') {
    displayLevels = ['見習'];
  } else if (currentLevel === '二級') {
    displayLevels = ['見習', '二級'];
  } else if (currentLevel === '一級') {
    displayLevels = ['見習', '二級', '一級'];
  }
  
  var text = '【' + certData.name + ' 的認證進度】\n📌 目前級別：' + currentLevel + '\n\n';
  
  displayLevels.forEach(function(level) {
    var required = LEVEL_REQUIREMENTS[level] ? LEVEL_REQUIREMENTS[level].all.map(function(e){ return e.toUpperCase(); }) : [];
    var passedInLevel = [];
    var missingInLevel = [];
    required.forEach(function(eq) {
      if (passedAll.includes(eq)) {
        passedInLevel.push(eq);
      } else {
        missingInLevel.push(eq);
      }
    });
    
    text += '【' + level + '】\n';
    text += '✅ 已通過 (' + passedInLevel.length + '/' + required.length + ')：' + 
            (passedInLevel.length ? passedInLevel.join('、') : '無') + '\n';
    text += '❌ 尚未通過 (' + missingInLevel.length + ' 項)：\n';
    if (missingInLevel.length) {
      missingInLevel.forEach(function(item) {
        text += '   🔴 ' + item + '\n';
      });
    } else {
      text += '   🎉 全部通過！如此強！\n';
    }
    text += '\n';
  });
  
  return { text: text, quickReply: bA() };
}

// ========== 助理名單（含快取，1小時） ==========
function getAssistantNamesFromSheet(){
  try{
    var s=SpreadsheetApp.openById(ASSISTANT_SHEET_ID).getSheetByName(ASSISTANT_SHEET_NAME);
    if(!s) return[];
    var names=s.getRange(2,1,s.getLastRow()-1,1).getValues().map(r=>r[0]).filter(n=>n);
    return[...new Set(names.map(n=>nrm(n)))].sort();
  }catch(e){return[];}
}
function getAssistantNames(){
  var c=CacheService.getScriptCache(), ca=c.get('ASSISTANT_NAMES');
  if(ca) return JSON.parse(ca);
  var n=getAssistantNamesFromSheet();
  c.put('ASSISTANT_NAMES', JSON.stringify(n), 3600);
  return n;
}

// 身份入口只以目前對內點名表 A、B 欄的現役 53 人為準；群組標題沒有學號，會自動略過。
function getActiveAssistantRecords(){
  try{
    var s=SpreadsheetApp.openById(INTERNAL_ATTENDANCE_SHEET_ID).getSheetByName(ATTENDANCE_SHEET_NAME);
    if(!s||s.getLastRow()<2)return[];
    return s.getRange(2,1,s.getLastRow()-1,2).getValues().map(function(row){
      return{name:nrm(row[0]),number:String(row[1]||'').trim()};
    }).filter(function(person){return person.name&&/^\d{9}$/.test(person.number);});
  }catch(e){return[];}
}

// 對外考生也需要綁定 LINE，才能在未通過時收到補考表單。
// 名單直接讀取已同步的「任務學生」，不另建一份容易過期的名冊。
function getExternalStudents(){
  try{
    var s=SpreadsheetApp.openById(EXTERNAL_RESULTS_SHEET_ID).getSheetByName('任務學生');
    if(!s||s.getLastRow()<2)return[];
    var rows=s.getRange(2,3,s.getLastRow()-1,2).getValues(), seen={};
    return rows.map(function(row){ return {name:nrm(row[0]), number:String(row[1]||'').trim()}; })
      .filter(function(student){
        if(!student.name)return false;
        var key=student.name+'|'+nrm(student.number);
        if(seen[key])return false;
        seen[key]=true;
        return true;
      });
  }catch(e){return[];}
}
function getExternalStudentNames(){
  return[...new Set(getExternalStudents().map(function(student){return student.name;}))].sort();
}

// ========== 模糊匹配與前綴處理 ==========
function lev(a,b){
  if(a.length===0) return b.length;
  if(b.length===0) return a.length;
  var m=[];
  for(var i=0;i<=b.length;i++) m[i]=[i];
  for(var j=0;j<=a.length;j++) m[0][j]=j;
  for(i=1;i<=b.length;i++) for(j=1;j<=a.length;j++)
    m[i][j]=b.charAt(i-1)===a.charAt(j-1)? m[i-1][j-1] : Math.min(m[i-1][j-1]+1, m[i][j-1]+1, m[i-1][j]+1);
  return m[b.length][a.length];
}
function findClosestName(i,l){
  var best={name:null, dist:Infinity};
  l.forEach(n=>{ var d=lev(i,n); if(d<best.dist) best={name:n, dist:d}; });
  return best;
}
function matchPrefix(i,p){
  var t=i.trim();
  for(var x of p){
    var re=new RegExp('^'+x+'[\\s　]*');
    if(re.test(t)){ var r=t.replace(re,'').trim(); return {matched:true, rest:r===''?null:r}; }
  }
  return {matched:false};
}
function handleQuery(r,t){
  if(!r) return {text:'請輸入姓名', quickReply:bA()};
  var directTask=null;
  if(t==='task'){
    directTask=showTasksForName(String(r).trim());
    if(!directTask.notFound)return directTask;
  }
  var all=getAssistantNames(), no=nrm(r), ex=all.find(n=>n===no);
  if(ex){
    if(t==='task') return directTask;
    if(t==='att') return showAttendanceStats(ex);
    if(t==='sub') return showSubstituteInfo(ex);
    if(t==='cert') return showCertificationProgress(ex);
    if(t==='exam') return showExamResults(ex);
  }
  var cls=findClosestName(no, all);
  if(cls.dist<=2){
    var res;
    if(t==='task') res=showTasksForName(cls.name);
    else if(t==='att') res=showAttendanceStats(cls.name);
    else if(t==='sub') res=showSubstituteInfo(cls.name);
    else if(t==='cert') res=showCertificationProgress(cls.name);
    else res=showExamResults(cls.name);
    res.text='您輸入的是「'+r+'」，已為您查詢最接近的姓名「'+cls.name+'」。\n\n'+res.text;
    return res;
  }
  if(t==='task')return directTask;
  return {text:'查無「'+r+'」在助理名單中', quickReply:bA()};
}

// ========== 用戶綁定相關函數 ==========
function recordUser(userId) {
  if (!userId) return;
  var sheet = SpreadsheetApp.openById(MASTER_SHEET_ID).getSheetByName(USER_BIND_SHEET_NAME);
  if (!sheet) {
    sheet = SpreadsheetApp.openById(MASTER_SHEET_ID).insertSheet(USER_BIND_SHEET_NAME);
    sheet.getRange(1, 1, 1, 4).setValues([['LINE User ID', '姓名', '綁定時間', '學號']]);
  }
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (data[i][BIND_COL_USER_ID] === userId) return;
  }
  sheet.appendRow([userId, '', new Date(), '']);
  Logger.log('記錄新用戶：' + userId);
}

function handleBindName(rest, userId) {
  var cache=CacheService.getScriptCache(),pendingRole=cache.get(PENDING_ROLE_PREFIX+userId);
  if(!pendingRole)return{text:'請先回首頁選擇「中心助理」或「對外學生」，再依畫面指示完成綁定。',quickReply:qr([{label:'🏠 選擇身份',text:'主選單'}])};
  if (!rest) return { text: pendingRole==='assistant'?'請輸入「我是 姓名」完成中心助理綁定。':'請輸入「我是 姓名 學號」完成對外學生綁定，例如：我是 王小明 112405001。', quickReply: bA() };
  var raw = rest.trim(), parts = raw.split(/[\s　]+/), suppliedNumber = parts.length > 1 ? parts.pop() : '';
  var requestedName = parts.join(''), normalizedName = nrm(requestedName || raw);
  var externalMatches = getExternalStudents().filter(function(student){ return student.name === normalizedName; });
  var activeAssistants=getActiveAssistantRecords();
  var assistantName = activeAssistants.map(function(person){return person.name;}).find(function(candidate){ return candidate === normalizedName; });
  var matchedStudent = null;
  if(pendingRole==='external'){
    if (!suppliedNumber) return { text: '請連同學號一起輸入，格式為「我是 姓名 學號」。\n例如：我是 王小明 112405001', quickReply: bA() };
    matchedStudent = externalMatches.find(function(student){ return nrm(student.number) === nrm(suppliedNumber); });
    if (!matchedStudent) return { text: '姓名或學號與任務學生／修課名單不一致，請確認後再輸入「我是 姓名 學號」。', quickReply: bA() };
  }else if(!assistantName){
    return{text:'查無「'+requestedName+'」在目前 '+activeAssistants.length+' 位中心助理名單中，請確認姓名後再試。',quickReply:bA()};
  }
  var finalName = matchedStudent ? matchedStudent.name : assistantName;
  var finalNumber = matchedStudent ? matchedStudent.number : '';
  
  var sheet = SpreadsheetApp.openById(MASTER_SHEET_ID).getSheetByName(USER_BIND_SHEET_NAME);
  if (!sheet) {
    sheet = SpreadsheetApp.openById(MASTER_SHEET_ID).insertSheet(USER_BIND_SHEET_NAME);
    sheet.getRange(1, 1, 1, 4).setValues([['LINE User ID', '姓名', '綁定時間', '學號']]);
  }
  if (sheet.getRange(1, BIND_COL_STUDENT_NUMBER + 1).getValue() !== '學號') sheet.getRange(1, BIND_COL_STUDENT_NUMBER + 1).setValue('學號');
  var data = sheet.getDataRange().getValues();
  var rowIndex = -1;
  for (var i = 1; i < data.length; i++) {
    if (data[i][BIND_COL_USER_ID] === userId) {
      rowIndex = i + 1;
      break;
    }
  }
  if (rowIndex === -1) {
    sheet.appendRow([userId, finalName, new Date(), finalNumber]);
  } else {
    sheet.getRange(rowIndex, BIND_COL_NAME + 1, 1, 3).setValues([[finalName, new Date(), finalNumber]]);
  }
  cache.remove(PENDING_ROLE_PREFIX+userId);
  var destination=pendingRole==='external'?'對外學生':'中心助理';
  var menu=pendingRole==='external'?getExternalMainMenu():getInternalMainMenu();
  return { text: '✅ 綁定成功！您已綁定為：' + finalName + (finalNumber ? '（' + finalNumber + '）' : '')+'\n\n'+menu.text, quickReply: menu.quickReply, navigationPage:destination };
}

function isUserBound(userId) {
  var sheet = SpreadsheetApp.openById(MASTER_SHEET_ID).getSheetByName(USER_BIND_SHEET_NAME);
  if (!sheet) return false;
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (data[i][BIND_COL_USER_ID] === userId && data[i][BIND_COL_NAME]) {
      return true;
    }
  }
  return false;
}

// ========== 取得綁定姓名（根據 LINE User ID）==========
function getBoundName(userId) {
  var sheet = SpreadsheetApp.openById(MASTER_SHEET_ID).getSheetByName(USER_BIND_SHEET_NAME);
  if (!sheet) return null;
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (data[i][BIND_COL_USER_ID] === userId) {
      return data[i][BIND_COL_NAME];
    }
  }
  return null;
}

function getBoundRecord(userId){
  var sheet=SpreadsheetApp.openById(MASTER_SHEET_ID).getSheetByName(USER_BIND_SHEET_NAME);
  if(!sheet)return null;
  var data=sheet.getDataRange().getValues();
  for(var i=1;i<data.length;i++)if(data[i][BIND_COL_USER_ID]===userId)return{name:nrm(data[i][BIND_COL_NAME]),number:String(data[i][BIND_COL_STUDENT_NUMBER]||'').trim()};
  return null;
}

function selectIdentity(role,userId){
  var bound=getBoundRecord(userId),cache=CacheService.getScriptCache();
  if(role==='assistant'){
    var activeAssistants=getActiveAssistantRecords();
    var active=activeAssistants.some(function(person){return bound&&person.name===bound.name;});
    if(active)return Object.assign(getInternalMainMenu(),{navigationPage:'中心助理'});
    cache.put(PENDING_ROLE_PREFIX+userId,'assistant',1800);
    return{text:'👩‍💼 中心助理綁定\n\n請輸入「我是 姓名」。\n只有目前名單中的 '+activeAssistants.length+' 位中心助理可以完成綁定。',quickReply:qr([{label:'🏠 回首頁',text:'主選單'}])};
  }
  var student=getExternalStudents().some(function(person){return bound&&person.name===bound.name&&nrm(person.number)===nrm(bound.number);});
  if(student)return Object.assign(getExternalMainMenu(),{navigationPage:'對外學生'});
  cache.put(PENDING_ROLE_PREFIX+userId,'external',1800);
  return{text:'👨‍🎓 對外學生綁定\n\n請輸入「我是 姓名 學號」。\n例如：我是 王小明 112405001',quickReply:qr([{label:'🏠 回首頁',text:'主選單'}])};
}

// ========== 選單 ==========
function getMainMenu(){return{text:'🤖 歡迎使用影音實驗室教學部機器人！\n\n請選擇您的身份並完成綁定：',quickReply:qr([{label:'👨‍🎓 對外學生',text:'選擇對外學生'},{label:'👩‍💼 中心助理',text:'選擇中心助理'}])};}
function getExternalMainMenu(){return{text:'請選擇您想查詢的對外學生資訊：',quickReply:qr([{label:'📋 流程',text:'流程'},{label:'📅 時程',text:'對外時程'},{label:'📚 題庫/講義',text:'題庫講義'},{label:'💰 保證金',text:'保證金'},{label:'🚫 學生請假',text:'學生請假'},{label:'🔑 借器材',text:'借用規定'},{label:'🔧 器材練習',text:'器材練習'},{label:'🔍 更多',text:'對外更多'},{label:'🏠 回首頁',text:'主選單'}])};}
function getExternalMoreMenu(){return{text:'更多對外學生資訊：',quickReply:qr([{label:'📘 講義',text:'講義'},{label:'⏰ 營業時間',text:'營業時間'},{label:'🚫 額滿',text:'額滿'},{label:'🔙 回上一頁',text:'回上一頁'},{label:'🏠 回首頁',text:'主選單'}])};}
function getInternalMainMenu(){
  return {
    text:'請選擇您想查詢的助理資訊：',
    quickReply:qr([
      {label:'📋 點名', text:'點名'},
      {label:'⏰ 我的對內／對外任務', text:'我的任務'},
      {label:'🔍 個人查詢', text:'查詢'},
      {label:'📝 請假與代班', text:'請假選項'},
      {label:'📅 時程與排班', text:'助理排程'},
      {label:'📚 講義區', text:'講義區'},
      {label:'📖 認證與補考', text:'越級考'},
      {label:'🎲 休閒工具', text:'助理工具'},
      {label:'🏠 回首頁', text:'主選單'}
    ])
  };
}  // ← 這裡的右大括號是關鍵！
function getQueryTypeMenu(){
  return{
    text:'請選擇您想查詢的項目：',
    quickReply:qr([
      {label:'📊 個人點名統計', text:'個人點名統計'},
      {label:'📋 認證進度', text:'認證'},
      {label:'📋 考試結果', text:'考試結果'},
      {label:'📊 全體點名統計', text:'全體點名統計'},
      {label:'🔙 回上一頁', text:'回上一頁'},
      {label:'🏠 回首頁', text:'主選單'}
    ])
  };
}
function getInternalMoreMenu(){
  return getInternalScheduleMenu();
}
function getInternalScheduleMenu(){
  return{
    text:'請選擇時程或排班資訊：',
    quickReply:qr([
      {label:'📅 時程', text:'對內時程'},
      {label:'👨‍🏫 對內考官安排', text:'對內考官'},
      {label:'📊 教學總排程', text:'教學總排程'},
      {label:'🔙 回上一頁', text:'回上一頁'},
      {label:'🏠 回首頁', text:'主選單'}
    ])
  };
}
function getInternalToolsMenu(){return{text:'請選擇休閒工具：',quickReply:qr([{label:'🔮 每日運勢',text:'每日運勢'},{label:'🍽️ 教學飽',text:'教學飽'},{label:'🎴 射龍門',text:'射龍門'},{label:'🔙 回上一頁',text:'回上一頁'},{label:'🏠 回首頁',text:'主選單'}])};}
function getLeaveOptionsMenu(){return{text:'請選擇請假或代班紀錄：',quickReply:qr([{label:'📝 對內請假',text:'對內請假'},{label:'👥 對外考官更動',text:'對外考官更動'},{label:'📋 代班紀錄',text:'代班查詢'},{label:'🔙 回上一頁',text:'回上一頁'},{label:'🏠 回首頁',text:'主選單'}])};}
function getCommonLinks(){return{text:'【1151 助理常用連結】\n\n📊 1151 教學總排程\nhttps://docs.google.com/spreadsheets/d/11SEPY8ugY1-l_EQ-J3qYdxmQoXHWARmgBY4wA-QFQzI/edit\n\n👨‍🏫 1151 對內教學官／考官安排\nhttps://docs.google.com/spreadsheets/d/1MDIpAfU2LYiv9LAduSDRDlh4vkgL6e5z/edit',quickReply:bA()};}

var INTERNAL_RESOURCE_VIDEOS={
  '講義影片攝影':[
    ['Sony PXW-X160','https://youtu.be/qVjd6gF9IBs'],
    ['Sony A7SII','https://youtu.be/lH3i9z1AVEY'],
    ['Sony PXW-FS7','https://youtu.be/sQYuTTJO9Nc'],
    ['Atomos 外接螢幕','https://youtu.be/8i51HBq7_cc']
  ],
  '講義影片燈光':[
    ['Zoom 350','https://youtu.be/3UFxrYTlNpk'],
    ['Lith LED','https://youtu.be/Az9KciHWJi8'],
    ['BrightCast LED 軟殼燈','https://youtu.be/fMrGmRqBhus'],
    ['Litepanels','https://youtu.be/cEGU0W1aAqo'],
    ['HMI Mini Par 200W','https://youtu.be/MWnHNx_S5qU'],
    ['LED Flo-Box','https://youtu.be/tjTbQvs_pRY']
  ],
  '講義影片聲音':[
    ['Zoom H6','https://youtu.be/SENcBwiVxno'],
    ['Sound Devices 633','https://youtu.be/j9TXQUbpKXY'],
    ['聲音工作區','https://youtu.be/_IniiyNIhg8']
  ],
  '講義影片影棚':[
    ['VisCG 字幕機','https://youtu.be/T9tPoBznq-Y'],
    ['StudioLive 成音台','https://youtu.be/fRczXMDj2NI']
  ]
};
var INTERNAL_RESOURCE_PLAYLISTS={
  '講義影片攝影':'https://www.youtube.com/playlist?list=PLETCaHJSoQwU1LykDPJy_ZQmrQooIxFRE',
  '講義影片燈光':'https://www.youtube.com/playlist?list=PLETCaHJSoQwUUhm8tcr2hK2GwUSsmB0Eg',
  '講義影片聲音':'https://www.youtube.com/playlist?list=PLETCaHJSoQwWzEx8njRu9uMjiHdEU8xGk',
  '講義影片影棚':'https://www.youtube.com/playlist?list=PLETCaHJSoQwV4xcWkuzhDrC-iJJkYtfQq'
};

function resourceNavigation(){return[
  {label:'📚 講義區分類',text:'講義區'},
  {label:'🔙 回上一頁',text:'回上一頁'},
  {label:'🏠 回首頁',text:'主選單'}
];}

function getInternalResourcesMenu(){return{
  text:'📚【中心助理講義區】\n\n依照需要選擇資料類別；影片已整理自影音實驗室官方 YouTube 頻道與對外教學播放清單。',
  quickReply:qr([
    {label:'📁 文件／講義',text:'講義文件'},
    {label:'📷 攝影機',text:'講義影片攝影'},
    {label:'💡 燈光',text:'講義影片燈光'},
    {label:'🎙️ 聲音',text:'講義影片聲音'},
    {label:'🎛️ 影棚設備',text:'講義影片影棚'},
    {label:'📺 官方頻道',uri:'https://www.youtube.com/@NCCUAVLab'},
    {label:'🔙 回上一頁',text:'回上一頁'},
    {label:'🏠 回首頁',text:'主選單'}
  ])
};}

function getInternalDocuments(){return{
  text:'📁【文件／講義資源】\n\n📚 講義、題庫資料夾\nhttps://drive.google.com/drive/folders/1-4XPVE68GlFzydhFJObxXhXJCILBe7D4\n\n🗂️ 教學部完整資料夾\nhttps://drive.google.com/drive/folders/1tS-W8F87FkowayUkafvHK_YLhHG214HC\n\n📖 官網器材教學手冊\nhttps://avlab.nccu.edu.tw/PageDownload?fid=10553',
  quickReply:qr(resourceNavigation())
};}

function getInternalVideoResources(command){
  var names={'講義影片攝影':'攝影機與配件','講義影片燈光':'燈光器材','講義影片聲音':'聲音器材','講義影片影棚':'影棚設備'};
  var videos=INTERNAL_RESOURCE_VIDEOS[command]||[];
  var text='🎬【'+names[command]+'教學影片】\n\n▶️ 播放全部\n'+INTERNAL_RESOURCE_PLAYLISTS[command]+'\n\n'+videos.map(function(video,index){return (index+1)+'️⃣ '+video[0]+'\n'+video[1];}).join('\n\n');
  return{text:text,quickReply:qr(resourceNavigation())};
}

// ========== 統一回應 ==========
var UNIFIED={
  流程:'🗺️【對外教學與認證流程說明】\n\n想取得影音實驗室的器材借用權限嗎？請跟著以下步驟通關：\n\n1️⃣ 【報名與繳交保證金】\n留意粉專報名表單，搶到名額後，務必於死線(10/9)前至中心繳交保證金。\n\n2️⃣ 【參加教學與預約練習】\n準時出席教學工作坊！課後可利用中心開放時間預約練習（每次上限2小時 / 2項器材）。\n\n3️⃣ 【參加考試】\n包含上機實作與簡答題。簡答題請務必熟讀題庫，缺席皆不可退保證金喔！\n\n4️⃣ 【取得借用權限】\n注意：器材是以「組」為單位，整組的「所有組員」都必須通過該項認證，才會正式開放借用權限！\n\n💡 溫馨提醒：【基礎配件課程】是所有進階器材的先修，一定要先考過才能報名其他的喔！',
  對外時程:'🗓️【對外教學工作坊 - 重要時程表】\n\n📝 對外報名時間 (第2、3週)\n9/14 (一) － 9/25 (五)\n\n📚 教學週 (第4、5週)\n9/28 (一) － 10/9 (五)\n\n📝 考試週 (第6、7週)\n10/12 (一) － 10/23 (五)\n\n🔄 第一次補考 (第8週)\n10/27 (二) － 10/30 (五)\n\n🔄 第二次補考 (第9週)\n11/2 (一) － 11/6 (五)\n\n⚠️ 請密切注意各階段的報名與保證金繳交死線(10/9)喔！',
  題庫講義:'【考試內容與題庫 + 上課講義】\n\n📚 題庫：\n👉 《影音實驗室對外教學工作坊-簡答題題庫》：\nhttps://docs.google.com/document/d/1pKjK2uqPmtcXIYRzyW87Ll7vvKFtcfzL/edit?usp=sharing&ouid=106559454873395212671&rtpof=true&sd=true\n\n📘 講義：\n👉 對外教學工作坊上課講義：\nhttps://avlab.nccu.edu.tw/PageDoc/Detail?fid=10543&id=18228',
  保證金:'【保證金制度說明】\n\n✅ 同一項器材的「簡答題」與「上機考」都通過，才符合退還保證金資格。\n\n🔄 補考採累計制：已通過的項目會保留。例如簡答題已通過、上機未通過，補考只需重考上機；上機通過後即顯示可退保證金。\n\n❌ 若補考後仍有任一項未通過，保證金狀態會顯示「不可退」。\n\n完整規定：\nhttps://drive.google.com/file/d/1cSVpcW5allLz6_tImqg2KEd7A2Jfu101/view',
  學生請假:'【請假與更改時間規定 (對外學生)】\n\n⚠️ 對外考生「不可請假」，但可透過「對外考試時間異動表單」申請更改時間或取消報名。⚠️\n\n❗ 取消報名仍「不予退費」，請確定報名項目後再繳交保證金。\n\n若測驗當天未出席將視同放棄資格，且已繳交之保證金一律「不予退費」。\n\n⚠️ 更改時間表單：https://forms.gle/ek1ApLGp3g6cAeLB9',
  借用規定:'【器材借用權限說明】\n器材借用有兩大前提：\n1. 必須先上過「基礎配件課程」並取得權限。\n2. 器材是以「組」為單位，整組的「所有組員」都必須通過該項認證，才能開放借用權限！請督促隊友。',
  講義:'【對外教學工作坊 - 上課講義】\n上課前或複習時可以參考這裡的教學講義喔！\n\n👉 https://avlab.nccu.edu.tw/PageDoc/Detail?fid=10543&id=18228',
  營業時間:'【中心開放時間】\n週一至週四：12:00～18:00\n週五：10:00～18:00',
  額滿:'【報名額滿怎麼辦】\n選項消失代表該時段已額滿。基礎配件課程限額 10 名，其他項目限額 6-8 名，請選擇其他時段。若所有時段皆無法配合，請私訊粉專。',
  器材練習:'【器材練習借用說明】\n\n本實驗室開放同學於參加考試前，至影音實驗室現場借用器材練習。由於器材與場地數量有限，請務必遵守以下規定：\n\n📌 預約方式\n• 可預約未來兩週內的練習時段（最晚須於練習「前一天」完成預約，不接受當天預約）。\n• 每人每天「僅能預約一個時段」，每時段至多 2 小時。\n• 每個時段可練習 1～2 項器材。\n\n⏰ 預約限制\n• 為確保公平使用機會，若無提前預約，現場無法保證能使用到器材。\n• 練習時間以兩小時為上限，逾時將影響其他同學權益。\n\n📝 請至影音實驗室填寫紙本報名表',
  對內請假:'【對內請假規定與表單】\n\n⏳ 請假死線：\n正常請假死線為「星期三 23:59」。逾期緩衝死線為「星期四 18:00」，超過此時間皆視為曠職並扣考核分。\n\n📝 對內請假表單：\nhttps://forms.gle/BoZnX4fnerBNbf4T7\n\n⚠️ (若是對外學生要改考試時間，請輸入「學生請假」)',
  越級考:'【越級考/補考說明】\n\n1️⃣ 若要申請越級考，請提前私訊對內教學組長「李慈恩」，等候他協助安排考官。\n2️⃣ 由考生與考官自行約時間考試。\n3️⃣ 考試時由考官填寫認證表單，若登記為通過，兩個工作天內經理會開啟權限。\n\n【補考說明】\n若教學部已為同級助理開設統一考試時段，考試未過或未參與考試者，須於該年度完成補考：\n• 原開設時段考試未過：請找原考官補考。\n• 原開設時段未參與考試：請找原考官（若有兩位擇一即可）。\n• 若原考官已不在中心，請找對內教學組長「李慈恩」安排，流程同越級考。\n\n【越級考/加開申請表單】\nhttps://forms.gle/MgWKkzpQWheo8GMv9',
  對外考官更動:'【對外教學考官更動表單 (中心助理專用)】\n當您擔任對外考官卻無法出席時，請務必找好代班人後再填寫此表單！\n\nhttps://forms.gle/RRdeUaH43QYFYwaPA\n\n⚠️ 備註：對外考官若無法出席，「一定要找代班」！請找好代班人後再填寫此表單。',
  對內考官:'【1151 對內考官安排】\nhttps://docs.google.com/spreadsheets/d/1MDIpAfU2LYiv9LAduSDRDlh4vkgL6e5z/edit\n\n⚠️ 備註：對內考官若需請假，請務必尋找「代班人」，並填寫對內請假表單：\nhttps://forms.gle/KbXjTfp4EYh3SJGc8',
  對內時程:'【1151 對內教學／檢定時程】\n\n📚 9/6 暑訓教學\n📝 9/18 暑訓檢定\n📚 10/16 期中教學\n📝 10/30 期中檢定\n📚 11/6 期末教學\n📝 12/4 期末檢定\n\n完整器材與考官安排：\nhttps://docs.google.com/spreadsheets/d/1MDIpAfU2LYiv9LAduSDRDlh4vkgL6e5z/edit',
  教學總排程:'【1151 教學總排程】\nhttps://docs.google.com/spreadsheets/d/11SEPY8ugY1-l_EQ-J3qYdxmQoXHWARmgBY4wA-QFQzI/edit'
};
function getUnifiedReply(k){
  var t = UNIFIED[k];
  if (k === '流程' || k === '對外時程' || k === '題庫講義' || k === '保證金' || 
      k === '學生請假' || k === '借用規定' || k === '講義' || 
      k === '營業時間' || k === '額滿' || k === '器材練習') {
    return t ? { text: t, quickReply: bE() } : null;
  }
  return t ? { text: t, quickReply: bA() } : null;
}

// ========== 讀取所有已排定任務（含考官） ==========
function getAllScheduledTasks() {
  var cache = CacheService.getScriptCache();
  var cached = cache.get('ALL_SCHEDULED_TASKS');
  if (cached) return JSON.parse(cached);

  try {
    var sheet = SpreadsheetApp.openById(TASK_SHEET_ID).getSheetByName(TASK_SHEET_NAME);
    if (!sheet) return [];
    var data = sheet.getDataRange().getValues();
    if (data.length < 2) return [];
    var tasks = [];
    for (var i = 1; i < data.length; i++) {
      var row = data[i];
      var date = row[COL_TASK_DATE];
      if (!date) continue;
      var dateObj = (date instanceof Date) ? date : new Date(date);
      var instructor = row[COL_TASK_NAME];
      if (!instructor) continue;
      tasks.push({
        date: dateObj,
        instructor: instructor.toString().trim(),
        item: row[COL_TASK_ITEM] ? row[COL_TASK_ITEM].toString().trim() : ''
      });
    }
    cache.put('ALL_SCHEDULED_TASKS', JSON.stringify(tasks), 30);
    return tasks;
  } catch (e) {
    Logger.log('getAllScheduledTasks 錯誤: ' + e);
    return [];
  }
}

// ========== 找代班功能 ==========
function handleFindSubstitute(rest, userId) {
  if (!rest) return { text: '請輸入「找代班 日期 姓名」，例如：找代班 3/13 徐嘉翔', quickReply: bA() };
  var parts = rest.trim().split(/\s+/);
  if (parts.length < 2) return { text: '格式錯誤，請輸入「找代班 日期 姓名」，例如：找代班 3/13 徐嘉翔', quickReply: bA() };
  var dateStr = parts[0];
  var targetName = parts.slice(1).join(' ');

  var dateMatch = dateStr.match(/(\d{1,2})\/(\d{1,2})/);
  if (!dateMatch) return { text: '日期格式錯誤，請使用 MM/DD 格式，例如 3/13', quickReply: bA() };
  var month = parseInt(dateMatch[1], 10);
  var day = parseInt(dateMatch[2], 10);
  var year = 2026;
  var targetDate = new Date(year, month - 1, day);
  targetDate.setHours(0,0,0,0);

  var normTarget = nrm(targetName);
  var allNames = getAssistantNames();
  
  var exactMatch = allNames.includes(normTarget);
  var closest = null;
  if (!exactMatch) {
    closest = findClosestName(normTarget, allNames);
  }
  
  if (!exactMatch && (!closest || closest.dist > 2)) {
    return { text: '查無「' + targetName + '」或近似姓名在助理名單中', quickReply: bA() };
  }
  
  var finalName = exactMatch ? normTarget : closest.name;
  var originalName = exactMatch ? targetName : (function(){
    for (var n in LEVEL_MAP) {
      if (nrm(n) === closest.name) return n;
    }
    return closest.name;
  })();

  var allTasks = getAllScheduledTasks();
  var targetItem = null;
  allTasks.forEach(t => {
    var taskDate = new Date(t.date);
    taskDate.setHours(0,0,0,0);
    if (taskDate.getTime() === targetDate.getTime() && nrm(t.instructor) === finalName) {
      targetItem = t.item;
    }
  });

  if (!targetItem) {
    return { text: originalName + ' 當天沒有被安排任務，無需找代班。', quickReply: bA() };
  }

  var busyInstructors = {};
  allTasks.forEach(t => {
    var taskDate = new Date(t.date);
    taskDate.setHours(0,0,0,0);
    if (taskDate.getTime() === targetDate.getTime()) {
      var norm = nrm(t.instructor);
      if (norm) busyInstructors[norm] = true;
    }
  });

  var certData = getCertificationData();
  var qualified = [];
  for (var name in certData) {
    var passed = certData[name].passed || [];
    if (passed.includes(targetItem)) {
      qualified.push(name);
    }
  }

  var candidates = qualified.filter(name => allNames.includes(name) && !busyInstructors[name]);

  if (candidates.length === 0) {
    return { text: '當天沒有可代班的人選。', quickReply: bA() };
  }

  var text = '【可代班人選】\n日期：' + dateStr + '\n需代班：' + originalName + '（' + targetItem + '）\n\n';
  candidates.sort().forEach(name => {
    var originalCandidateName = (function(){
      for (var n in LEVEL_MAP) {
        if (nrm(n) === name) return n;
      }
      return name;
    })();
    text += '• ' + originalCandidateName + '\n';
  });
  
  text += '\n📝 找到代班人後，請填寫對內請假表單：\nhttps://docs.google.com/forms/d/e/1FAIpQLSfHCPloGR4rWQuYBamgp1Uz7L18YrzhhiubUny3-A49RMrffQ/viewform?usp=header';

  return { text: text, quickReply: bA() };
}// ========== 即時更新認證 ==========
function onMasterSheetEdit(e) {
  Logger.log('=== 觸發器啟動 ===');
  if (!e) {
    Logger.log('錯誤：沒有事件物件，請勿手動執行此函數');
    return;
  }
  var range = e.range;
  var sheet = range.getSheet();
  var sheetName = sheet.getName();
  Logger.log('工作表名稱：' + sheetName);
  
  if (sheetName !== ATTENDANCE_SHEET_NAME) {
    Logger.log('工作表名稱不符，退出 (預期: ' + ATTENDANCE_SHEET_NAME + ')');
    return;
  }
  
  var row = range.getRow();
  var col = range.getColumn();
  var newValue = e.value;
  Logger.log('編輯位置：第 ' + row + ' 行，第 ' + col + ' 欄，新值：' + newValue);
  
  var header = sheet.getRange(1, col).getValue();
  Logger.log('欄位標題：' + header);
  
  if (!header || typeof header !== 'string') {
    Logger.log('標題無效，退出');
    return;
  }
  
  var resultCol = -1;
  var equipCol = -1;

  // 1151 改為每項器材各自一欄，例如「導播台結果」「錄放影機結果」。
  // 選「通過」會取得認證；把通過刪除或改成其他狀態時會撤回該項認證。
  if (header !== '考試結果' && header !== '加開結果' && /結果$/.test(header)) {
    var equipmentFromHeader = header.replace(/結果$/, '').trim();
    var directStudentName = sheet.getRange(row, 1).getValue();
    if (equipmentFromHeader && directStudentName) {
      var normalizedDirectStudent = nrm(directStudentName.toString());
      if (newValue === '通過') {
        updateCertificationForPerson(normalizedDirectStudent, equipmentFromHeader);
      } else if (e.oldValue === '通過') {
        var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
        var rowValues = sheet.getRange(row, 1, 1, sheet.getLastColumn()).getValues()[0];
        var stillPassed = headers.some(function(candidateHeader, index) {
          return index !== col - 1 && typeof candidateHeader === 'string' &&
            candidateHeader.replace(/結果$/, '').trim() === equipmentFromHeader &&
            rowValues[index] === '通過';
        });
        if (!stillPassed) clearCertificationForPerson(normalizedDirectStudent, equipmentFromHeader);
      }
    }
    return;
  }
  
  if (header === '考試結果') {
    resultCol = col;
    equipCol = col + 1;
  } else if (header === '通過器材') {
    resultCol = col - 1;
    equipCol = col;
  } else {
    Logger.log('不是考試結果或通過器材欄位，退出');
    return;
  }
  
  var resultHeader = sheet.getRange(1, resultCol).getValue();
  var equipHeader = sheet.getRange(1, equipCol).getValue();
  if (resultHeader !== '考試結果' || equipHeader !== '通過器材') {
    Logger.log('欄位對應錯誤：考試結果=' + resultHeader + ', 通過器材=' + equipHeader);
    return;
  }
  
  var resultValue = sheet.getRange(row, resultCol).getValue();
  var equipValue = sheet.getRange(row, equipCol).getValue();
  Logger.log('考試結果值：' + resultValue + '，通過器材值：' + equipValue);
  
  if (resultValue !== '通過') {
    Logger.log('考試結果不是「通過」，退出');
    return;
  }
  
  if (!equipValue) {
    Logger.log('通過器材為空，退出');
    return;
  }
  
  var studentName = sheet.getRange(row, 1).getValue();
  Logger.log('學生姓名原始值：' + studentName);
  if (!studentName) {
    Logger.log('姓名為空，退出');
    return;
  }
  var normalizedStudent = nrm(studentName.toString());
  Logger.log('標準化後姓名：' + normalizedStudent);
  
  var equipList = equipValue.toString().split(/[,，]\s*/);
  Logger.log('分割後器材清單：' + JSON.stringify(equipList));
  
  equipList.forEach(function(equipName) {
    equipName = equipName.trim();
    if (equipName) {
      Logger.log('準備更新器材：' + equipName);
      updateCertificationForPerson(normalizedStudent, equipName);
    }
  });
  
  Logger.log('=== 觸發器結束 ===');
}

// 輔助函數：更新特定人員的特定器材認證
function updateCertificationForPerson(studentName, equipName) {
  Logger.log('開始更新認證：學生=' + studentName + ', 器材=' + equipName);
  var certSheet = SpreadsheetApp.openById(CERT_SHEET_ID).getSheetByName(CERT_SHEET_NAME);
  if (!certSheet) {
    Logger.log('錯誤：無法開啟認證表');
    return;
  }
  var certData = certSheet.getDataRange().getValues();
  var headers = certData[1];
  Logger.log('認證表標題列：' + headers.join(', '));
  
  var studentRow = -1;
  for (var i = 3; i < certData.length; i++) {
    var nameInCert = certData[i][COL_CERT_NAME];
    var normalizedCertName = nrm(nameInCert ? nameInCert.toString() : '');
    if (normalizedCertName === studentName) {
      studentRow = i + 1;
      Logger.log('找到學生位於認證表第 ' + studentRow + ' 行');
      break;
    }
  }
  if (studentRow === -1) {
    Logger.log('學生 ' + studentName + ' 在認證表中找不到');
    return;
  }
  
  var equipCol = -1;
  for (var j = FIRST_EQUIP_COL; j < headers.length; j++) {
    if (headers[j] === equipName) {
      equipCol = j + 1;
      Logger.log('找到器材位於第 ' + equipCol + ' 欄');
      break;
    }
  }
  if (equipCol === -1) {
    Logger.log('器材 ' + equipName + ' 在認證表中找不到');
    return;
  }
  
  var current = certSheet.getRange(studentRow, equipCol).getValue();
  Logger.log('目前該格值：' + current);
  if (current !== 'V' && current !== true) {
    certSheet.getRange(studentRow, equipCol).setValue('V');
    Logger.log('✅ 已更新：' + studentName + ' 的 ' + equipName + ' 設為通過');

    // 發送認證更新通知
    var userId = getUserIdByName(studentName);
    if (userId) {
      var message = '🎉 恭喜！您的認證已更新。\n\n' +
                    '📌 通過器材：' + equipName + '\n' +
                    '請輸入「認證 姓名」查看最新進度。';
      pushMessage(userId, message);
      Logger.log('已發送認證更新通知給：' + studentName);
    }
  } else {
    Logger.log('該器材已通過，無需更新');
  }
}

function clearCertificationForPerson(studentName, equipName) {
  Logger.log('開始撤回認證：學生=' + studentName + ', 器材=' + equipName);
  var certSheet = SpreadsheetApp.openById(CERT_SHEET_ID).getSheetByName(CERT_SHEET_NAME);
  if (!certSheet) return;
  var certData = certSheet.getDataRange().getValues();
  var headers = certData[1] || [];
  var studentRow = -1;
  for (var i = 2; i < certData.length; i++) {
    var certName = nrm(certData[i][COL_CERT_NAME] ? certData[i][COL_CERT_NAME].toString() : '');
    if (certName === studentName) { studentRow = i + 1; break; }
  }
  var equipCol = -1;
  for (var j = FIRST_EQUIP_COL; j < headers.length; j++) {
    if (headers[j] === equipName) { equipCol = j + 1; break; }
  }
  if (studentRow === -1 || equipCol === -1) return;
  var current = certSheet.getRange(studentRow, equipCol).getValue();
  if (current === 'V' || current === true || current === '✓') {
    certSheet.getRange(studentRow, equipCol).setValue('');
    Logger.log('↩️ 已撤回：' + studentName + ' 的 ' + equipName + ' 認證');
  }
}

// ========== 監聽對內請假表單提交 ==========
function onLeaveFormSubmit(e) {
  Logger.log('=== 對內請假表單提交觸發 ===');
  if (!e) {
    Logger.log('錯誤：沒有事件物件');
    return;
  }
  var sheet = e.range.getSheet();
  if (sheet.getName() !== LEAVE_SHEET_NAME) {
    Logger.log('工作表名稱不符，退出');
    return;
  }

  var values = e.values;
  var name = values[COL_LEAVE_NAME];       // 請假人
  var leaveDate = values[COL_LEAVE_DATE];  // 請假日期
  var substitute = values[COL_LEAVE_SUBSTITUTE]; // 代班人

  Logger.log('請假人：' + name + '，請假日期：' + leaveDate + '，代班人：' + (substitute || '無'));

  // 如果有代班人，才進行任務轉移
  if (substitute && substitute.trim() !== '') {
    transferTask(name, substitute, leaveDate);
    notifySubstitute(substitute, name, leaveDate);
  } else {
    Logger.log('無代班人，跳過任務轉移');
  }

  // 無論有無代班人，都通知請假人本人
  notifyLeaveApplicant(name, leaveDate, substitute);

  // 無論有無代班人，都通知管理員
  notifyManagers(name, leaveDate, substitute);
}

function transferTask(originalName, newName, leaveDate) {
  try {
    var sheet = SpreadsheetApp.openById(TASK_SHEET_ID).getSheetByName(TASK_SHEET_NAME);
    var data = sheet.getDataRange().getValues();
    var targetDate = new Date(leaveDate);
    targetDate.setHours(0,0,0,0);

    for (var i = 1; i < data.length; i++) {
      var rowDate = data[i][COL_TASK_DATE];
      if (!(rowDate instanceof Date)) continue;
      var rowDateNorm = new Date(rowDate);
      rowDateNorm.setHours(0,0,0,0);

      if (rowDateNorm.getTime() === targetDate.getTime() && 
          nrm(data[i][COL_TASK_NAME]) === nrm(originalName)) {
        sheet.getRange(i + 1, COL_TASK_NAME + 1).setValue(newName);
        Logger.log('任務已轉移：' + originalName + ' → ' + newName + '，日期：' + leaveDate);
        break;
      }
    }
  } catch (err) {
    Logger.log('transferTask 錯誤：' + err);
  }
}

function notifySubstitute(substituteName, originalName, leaveDate) {
  try {
    var userId = getUserIdByName(substituteName);
    if (!userId) {
      Logger.log('找不到代班人 ' + substituteName + ' 的綁定 ID');
      return;
    }

    var dateObj = new Date(leaveDate);
    var dateStr = Utilities.formatDate(dateObj, Session.getScriptTimeZone(), 'MM/dd');
    var message = '🔔 您被指定為代班人\n\n' +
                  '原任務人：' + originalName + '\n' +
                  '任務日期：' + dateStr + '\n' +
                  '請確認當日行程，並提前準備相關器材與教學內容。\n' +
                  '若有問題請盡快聯繫教學組長。';

    pushMessage(userId, message);
    Logger.log('已發送通知給代班人：' + substituteName);
  } catch (err) {
    Logger.log('notifySubstitute 錯誤：' + err);
  }
}

// ===== 通知請假人本人 =====
function notifyLeaveApplicant(applicantName, leaveDate, substituteName) {
  try {
    var userId = getUserIdByName(applicantName);
    if (!userId) {
      Logger.log('找不到請假人 ' + applicantName + ' 的綁定 ID，跳過通知');
      return;
    }

    var dateObj = new Date(leaveDate);
    var dateStr = Utilities.formatDate(dateObj, Session.getScriptTimeZone(), 'MM/dd');
    
    var message;
    if (substituteName && substituteName.trim() !== '') {
      message = '✅ 您的請假申請已成功提交\n\n' +
                '請假日期：' + dateStr + '\n' +
                '代班人：' + substituteName + '\n\n' +
                '請記得與代班人確認任務細節。';
    } else {
      message = '✅ 您的請假申請已成功提交\n\n' +
                '請假日期：' + dateStr + '\n\n' +
                '（本次請假無需安排代班）';
    }

    pushMessage(userId, message);
    Logger.log('已發送請假成功通知給：' + applicantName);
  } catch (err) {
    Logger.log('notifyLeaveApplicant 錯誤：' + err);
  }
}

// ===== 通知管理員 =====
function notifyManagers(applicantName, leaveDate, substituteName) {
  var dateObj = new Date(leaveDate);
  var dateStr = Utilities.formatDate(dateObj, Session.getScriptTimeZone(), 'MM/dd');
  var message = '👥 請假通知\n\n' +
                '申請人：' + applicantName + '\n' +
                '請假日期：' + dateStr + '\n' +
                '代班人：' + (substituteName || '無');

  MANAGER_NAMES.forEach(function(managerName) {
    try {
      var userId = getUserIdByName(managerName);
      if (userId) {
        pushMessage(userId, message);
        Logger.log('已發送請假通知給管理員：' + managerName);
      } else {
        Logger.log('管理員 ' + managerName + ' 未綁定，跳過通知');
      }
    } catch (err) {
      Logger.log('通知管理員 ' + managerName + ' 時發生錯誤：' + err);
    }
  });
}

// ========== 監聽任務表編輯 ==========
function onTaskSheetEdit(e) {
  Logger.log('=== 任務表編輯觸發 ===');
  if (!e) {
    Logger.log('錯誤：沒有事件物件');
    return;
  }
  var range = e.range;
  var sheet = range.getSheet();
  if (sheet.getName() !== TASK_SHEET_NAME) {
    Logger.log('工作表名稱不符，退出');
    return;
  }

  var row = range.getRow();
  var col = range.getColumn();
  var newValue = e.value;
  var oldValue = e.oldValue;

  // 只關心「考官姓名」欄位的變動
  if (col !== COL_TASK_NAME + 1) {
    Logger.log('不是考官姓名欄位，退出');
    return;
  }

  var taskDate = sheet.getRange(row, COL_TASK_DATE + 1).getValue();
  var taskItem = sheet.getRange(row, COL_TASK_ITEM + 1).getValue();
  var taskPhase = sheet.getRange(row, COL_TASK_PHASE + 1).getValue();
  var dateStr = taskDate instanceof Date ? Utilities.formatDate(taskDate, Session.getScriptTimeZone(), 'MM/dd') : taskDate;

  var newInstructor = newValue ? newValue.toString().trim() : '';
  if (newInstructor) {
    var userId = getUserIdByName(newInstructor);
    if (userId) {
      var type = taskPhase && taskPhase.toString().includes('教學') ? '📚 教學' : '📝 檢定';
      var message = '🔄 您的任務有更新\n\n' +
                    '日期：' + dateStr + '\n' +
                    '類型：' + type + '\n' +
                    '項目：' + taskItem + '\n\n' +
                    '請確認您的任務安排。';
      pushMessage(userId, message);
      Logger.log('已通知新考官：' + newInstructor);
    }
  }

  if (oldValue) {
    var oldInstructor = oldValue.toString().trim();
    var oldUserId = getUserIdByName(oldInstructor);
    if (oldUserId && oldInstructor !== newInstructor) {
      var message = '❌ 您的任務已被移除\n\n' +
                    '日期：' + dateStr + '\n' +
                    '項目：' + taskItem + '\n\n' +
                    '請確認您的任務安排。';
      pushMessage(oldUserId, message);
      Logger.log('已通知原考官：' + oldInstructor);
    }
  }
}

// ========== 監聽補考表單提交 ==========
function onRetestFormSubmit(e) {
  Logger.log('=== 補考表單提交觸發 ===');
  if (!e) {
    Logger.log('錯誤：沒有事件物件');
    return;
  }
  var sheet = e.range.getSheet();
  if (sheet.getName() !== RETEST_SHEET_NAME) {
    Logger.log('工作表名稱不符，退出');
    return;
  }

  var values = e.values;
  var studentName = values[COL_RETEST_STUDENT_NAME];
  var equipName = values[COL_RETEST_EQUIP];
  var isPass = values[COL_RETEST_PASS];
  var examinerName = values[COL_RETEST_EXAMINER];

  if (!studentName || !equipName) {
    Logger.log('考生姓名或器材為空，無法更新認證');
    return;
  }

  if (isPass !== '是' && isPass !== 'true' && isPass !== true) {
    Logger.log('考試未通過，不更新認證');
    return;
  }

  var normalizedStudent = nrm(studentName.toString());
  Logger.log('考生：' + normalizedStudent + '，通過器材：' + equipName + '，考官：' + examinerName);

  updateCertificationForPerson(normalizedStudent, equipName);

  if (examinerName) {
    var examinerId = getUserIdByName(examinerName);
    if (examinerId) {
      var message = '✅ 您提交的補考認證已處理\n\n' +
                    '考生：' + studentName + '\n' +
                    '通過器材：' + equipName + '\n' +
                    '已自動更新至認證表。';
      pushMessage(examinerId, message);
    }
  }
}

// ========== 取得用戶ID的輔助函數 ==========
function getUserIdByName(name) {
  var sheet = SpreadsheetApp.openById(MASTER_SHEET_ID).getSheetByName(USER_BIND_SHEET_NAME);
  if (!sheet) return null;
  var data = sheet.getDataRange().getValues();
  var normName = nrm(name);
  for (var i = 1; i < data.length; i++) {
    if (nrm(data[i][BIND_COL_NAME]) === normName) {
      return data[i][BIND_COL_USER_ID];
    }
  }
  return null;
}

function pushMessage(userId, text) {
  var url = 'https://api.line.me/v2/bot/message/push';
  var payload = {
    to: userId,
    messages: [{ type: 'text', text: text }]
  };
  UrlFetchApp.fetch(url, {
    method: 'post',
    headers: { Authorization: 'Bearer ' + CHANNEL_ACCESS_TOKEN },
    payload: JSON.stringify(payload),
    contentType: 'application/json',
    muteHttpExceptions: true
  });
}

// ========== 每晚 8 點發送明日任務提醒 ==========
function sendTomorrowTaskReminders() {
  Logger.log('=== 發送明日任務提醒 ===');
  var tasks = getAllScheduledTasks();
  var tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0,0,0,0);

  var tomorrowTasks = tasks.filter(t => {
    var d = new Date(t.date);
    d.setHours(0,0,0,0);
    return d.getTime() === tomorrow.getTime();
  });

  var byInstructor = {};
  tomorrowTasks.forEach(t => {
    var name = t.instructor;
    if (!byInstructor[name]) byInstructor[name] = [];
    byInstructor[name].push(t.item);
  });

  for (var name in byInstructor) {
    var userId = getUserIdByName(name);
    if (!userId) {
      Logger.log('講師 ' + name + ' 未綁定，跳過');
      continue;
    }
    var items = byInstructor[name].join('、');
    var dateStr = Utilities.formatDate(tomorrow, Session.getScriptTimeZone(), 'MM/dd');
    var message = '⏰ 明日任務提醒\n\n' +
                  '日期：' + dateStr + '\n' +
                  '項目：' + items + '\n' +
                  '請提前準備，準時出席！';
    pushMessage(userId, message);
    Logger.log('已提醒：' + name);
  }
}

function setupDailyReminder() {
  ScriptApp.newTrigger('sendTomorrowTaskReminders')
    .timeBased()
    .atHour(20)
    .everyDays(1)
    .create();
  Logger.log('每日提醒觸發器已建立');
}

// ========== 每日運勢 ==========
function getDailyFortune() {
  var rand = Math.random();
  var text = '';
  if (rand < 0.3) {
    text = '靠杯！今天不適合拍片';
  } else if (rand < 0.55) {
    text = '都沒錢了，拍甚麼拍';
  } else if (rand < 0.7) {
    text = '今天會撞車';
  } else if (rand < 0.8) {
    text = '去問助教';
  } else if (rand < 0.99) {
    text = '穩到靠杯';
  } else {
    text = '跟班長拿10塊';
  }
  var quickReplyItems = [
    { type: 'action', action: { type: 'message', label: '🔄 再抽一次', text: '每日運勢' } },
    { type: 'action', action: { type: 'message', label: '🔙 回上一頁', text: '回上一頁' } },
    { type: 'action', action: { type: 'message', label: '🏠 回首頁', text: '主選單' } }
  ];
  return { 
    text: '🔮 今日運勢：\n\n' + text, 
    quickReply: { items: quickReplyItems } 
  };
}

// ========== 排班功能輔助函數 ==========

function parseTimeSlots(str) {
  if (!str || typeof str !== 'string') return [];
  // 統一格式：去除「點」、去除空格、轉為半形減號
  return str.split(/[,，]\s*/).map(s => s.trim().replace(/點$/, '').replace(/[－—]/g, '-')).filter(s => s);
}

/**
 * 解析備註，支援：
 * - 日期例外：4/21不行、0421不行、421不行
 * - 時段限制：週二只能到13.、週五只能13-14
 * - 任務偏好：多一點任務、少一點任務、賺、給
 */
function parseNote(note) {
  var result = {
    dateExceptions: [],  // 格式 ["4/21"]
    weekdayTimeExceptions: {}, // 格式 { "二": ["12-14"] }
    preference: 0  // 偏好：正數想要多排，負數想要少排，0為正常
  };
  if (!note) return result;

  // 解析日期例外（支援多種格式）
  var dateMatches = note.match(/(\d{1,4})\/?(\d{1,2})?(?:不行|沒空|無法)/g);
  if (dateMatches) {
    dateMatches.forEach(function(m) {
      var parts = m.match(/(\d{1,4})\/?(\d{1,2})?/);
      if (parts) {
        var month, day;
        if (parts[2]) {
          month = parseInt(parts[1], 10);
          day = parseInt(parts[2], 10);
        } else {
          // 四位數字如 0421
          var str = parts[1];
          if (str.length === 4) {
            month = parseInt(str.substring(0,2), 10);
            day = parseInt(str.substring(2,4), 10);
          } else if (str.length === 3) {
            month = parseInt(str.charAt(0), 10);
            day = parseInt(str.substring(1), 10);
          } else {
            return;
          }
        }
        result.dateExceptions.push(month + '/' + day);
      }
    });
  }

  // 解析 "週二只能到13." -> 排除12-14
  var weekdayLimitMatch = note.match(/週([一二三四五六日]+)只能到(\d{1,2})[\.:]?/g);
  if (weekdayLimitMatch) {
    weekdayLimitMatch.forEach(function(w) {
      var parts = w.match(/週([一二三四五六日]+)只能到(\d{1,2})/);
      if (parts) {
        var weekdays = parts[1].split('');
        var limitHour = parseInt(parts[2], 10);
        if (limitHour < 14) {
          weekdays.forEach(function(wd) {
            if (!result.weekdayTimeExceptions[wd]) result.weekdayTimeExceptions[wd] = [];
            result.weekdayTimeExceptions[wd].push('12-14');
          });
        }
      }
    });
  }

  // 解析 "週五只能13-14"
  var rangeMatch = note.match(/週([一二三四五六日])只能(\d{1,2})-(\d{1,2})/g);
  if (rangeMatch) {
    rangeMatch.forEach(function(r) {
      var parts = r.match(/週([一二三四五六日])只能(\d{1,2})-(\d{1,2})/);
      if (parts) {
        var wd = parts[1];
        var start = parseInt(parts[2], 10);
        var end = parseInt(parts[3], 10);
        if (start <= 14 && end >= 14) {
          // 12-14可用，不排除
        } else {
          if (!result.weekdayTimeExceptions[wd]) result.weekdayTimeExceptions[wd] = [];
          result.weekdayTimeExceptions[wd].push('12-14');
        }
        if (start <= 21 && end >= 21) {
          // 18-21可用
        } else {
          if (!result.weekdayTimeExceptions[wd]) result.weekdayTimeExceptions[wd] = [];
          result.weekdayTimeExceptions[wd].push('18-21');
        }
      }
    });
  }

  // 任務偏好：多一點任務、少一點任務、賺、給
  if (note.includes('多一點') || note.includes('賺') || note.includes('多排')) {
    result.preference = 1;
  } else if (note.includes('少一點') || note.includes('給') || note.includes('少排')) {
    result.preference = -1;
  }

  return result;
}

function getWeekdayFromDate(dateStr) {
  var parts = dateStr.split('/');
  if (parts.length < 2) return null;
  var month = parseInt(parts[0], 10) - 1;
  var day = parseInt(parts[1], 10);
  var date = new Date(2026, month, day);
  var weekdays = ['日', '一', '二', '三', '四', '五', '六'];
  return weekdays[date.getDay()];
}

function getExamSchedule() {
  var cache = CacheService.getScriptCache();
  var cached = cache.get('EXAM_SCHEDULE');
  if (cached) return JSON.parse(cached);

  try {
    var sheet = SpreadsheetApp.openById(EXAM_SCHEDULE_SHEET_ID).getSheetByName(EXAM_SCHEDULE_SHEET_NAME);
    if (!sheet) {
      Logger.log('❌ 找不到考試排程工作表：' + EXAM_SCHEDULE_SHEET_NAME);
      return {};
    }
    var data = sheet.getDataRange().getValues();
    Logger.log('考試排程表總行數：' + data.length);
    var rows = data.slice(1); // 跳過標題
    Logger.log('資料行數：' + rows.length);
    var schedule = {};
    rows.forEach(function(row, index) {
      var dateCell = row[COL_EXAM_DATE];
      var time = row[COL_EXAM_TIME];
      var item = row[COL_EXAM_ITEM];
      var phase = row[COL_EXAM_PHASE] || '';
      if (!dateCell || !time || !item) {
        return;
      }
      
      // 標準化日期
      var dateStr;
      if (dateCell instanceof Date) {
        var month = dateCell.getMonth() + 1;
        var day = dateCell.getDate();
        dateStr = month + '/' + day;
      } else {
        dateStr = dateCell.toString().replace(/^0+/, '').replace(/\/0+/, '/');
      }
      
      // 標準化時段
      var timeStr = time.toString().replace(/\s+/g, '').replace(/[－—]/g, '-');
      var itemStr = item.toString().trim().toUpperCase();
      var key = dateStr + '|' + timeStr;
      
      if (!schedule[key]) {
        schedule[key] = {
          items: [],
          phase: phase.toString().trim()
        };
      }
      schedule[key].items.push(itemStr);
    });
    cache.put('EXAM_SCHEDULE', JSON.stringify(schedule), 60);
    Logger.log('總共產生 ' + Object.keys(schedule).length + ' 個時段');
    return schedule;
  } catch (e) {
    Logger.log('getExamSchedule 錯誤: ' + e);
    return {};
  }
}

function getAssistantAvailability() {
  var cache = CacheService.getScriptCache();
  var cached = cache.get('ASSISTANT_AVAILABILITY');
  if (cached) return JSON.parse(cached);

  try {
    var sheet = SpreadsheetApp.openById(AVAILABILITY_SHEET_ID).getSheetByName(AVAILABILITY_SHEET_NAME);
    if (!sheet) return {};
    var data = sheet.getDataRange().getValues().slice(1);
    var tempMap = {};

    data.forEach(function(row) {
      var rawName = row[COL_AVAIL_NAME];
      if (!rawName) return;
      var baseName = rawName.replace(/\d+$/, '');
      var numMatch = rawName.match(/\d+$/);
      var version = numMatch ? parseInt(numMatch[0], 10) : 0;
      var norm = nrm(baseName);
      var note = row[COL_AVAIL_NOTE] || '';
      var parsedNote = parseNote(note);

      if (!tempMap[norm] || version > tempMap[norm].version) {
        tempMap[norm] = {
          version: version,
          data: {
            '一': parseTimeSlots(row[COL_AVAIL_MON]),
            '二': parseTimeSlots(row[COL_AVAIL_TUE]),
            '三': parseTimeSlots(row[COL_AVAIL_WED]),
            '四': parseTimeSlots(row[COL_AVAIL_THU]),
            '五': parseTimeSlots(row[COL_AVAIL_FRI]),
            '備註': note,
            '原始姓名': rawName,
            '日期例外': parsedNote.dateExceptions,
            '星期時段例外': parsedNote.weekdayTimeExceptions,
            '偏好': parsedNote.preference
          }
        };
      }
    });

    var availability = {};
    for (var norm in tempMap) {
      availability[norm] = tempMap[norm].data;
    }

    cache.put('ASSISTANT_AVAILABILITY', JSON.stringify(availability), 60);
    return availability;
  } catch (e) {
    Logger.log('getAssistantAvailability 錯誤: ' + e);
    return {};
  }
}

function isQualifiedForItem(item, normName, certData) {
  var itemUpper = item.toUpperCase();
  var originalName = getOriginalName(normName);
  var level = LEVEL_MAP[originalName];
  if (!level) return false;

  // 基礎配件課程特殊處理
  if (itemUpper === nrm(BASIC_EQUIP_COURSE).toUpperCase()) {
    return level === '一級' || level === '二級';
  }

  // 若有認證資料且 passed 包含該項目，則合格
  if (certData[normName] && certData[normName].passed && certData[normName].passed.includes(itemUpper)) {
    return true;
  }

  // 若認證資料缺失，則根據級別判斷
  var requiredLevel = null;
  for (var lvl in LEVEL_REQUIREMENTS) {
    if (LEVEL_REQUIREMENTS[lvl].all.map(function(e){ return e.toUpperCase(); }).includes(itemUpper)) {
      requiredLevel = lvl;
      break;
    }
  }
  if (!requiredLevel) return false;

  var weight = { '見習': 1, '二級': 2, '一級': 3 };
  return weight[level] >= weight[requiredLevel];
}

function isAssistantAvailable(assistantName, dateStr, timeSlot, availability) {
  var assistant = availability[assistantName];
  if (!assistant) return false;

  // 檢查日期例外
  if (assistant['日期例外'] && assistant['日期例外'].includes(dateStr)) return false;

  var weekday = getWeekdayFromDate(dateStr);
  if (!weekday) return false;

  // 檢查星期時段例外
  if (assistant['星期時段例外'] && assistant['星期時段例外'][weekday] && 
      assistant['星期時段例外'][weekday].includes(timeSlot)) {
    return false;
  }

  var availSlots = assistant[weekday] || [];
  if (availSlots.length === 0) return false;

  var examParts = timeSlot.split('-');
  if (examParts.length !== 2) return false;
  var examStart = parseInt(examParts[0], 10);
  var examEnd = parseInt(examParts[1], 10);

  for (var i = 0; i < availSlots.length; i++) {
    var slot = availSlots[i];
    var slotParts = slot.split('-');
    if (slotParts.length !== 2) continue;
    var slotStart = parseInt(slotParts[0], 10);
    var slotEnd = parseInt(slotParts[1], 10);
    // 允許部分重疊
    if (slotEnd > examStart && slotStart < examEnd) {
      return true;
    }
  }
  return false;
}

function getExamItemsByDateTime(dateStr, timeSlot) {
  var schedule = getExamSchedule();
  // 標準化輸入參數
  var normDate = dateStr.toString().replace(/^0+/, '').replace(/\/0+/, '/');
  var normTime = timeSlot.toString().replace(/\s+/g, '').replace(/[－—]/g, '-');
  var key = normDate + '|' + normTime;
  Logger.log('查詢 key: ' + key);
  Logger.log('當前 schedule: ' + JSON.stringify(schedule));
  return (schedule[key] && schedule[key].items) || [];
}

function handleScheduleQuery(rest, userId) {
  var parts = rest.trim().split(/\s+/);
  if (parts.length < 2) {
    return { text: '請輸入「日期 時段」，例如：排班 3/31 12-14', quickReply: bA() };
  }
  var dateStr = parts[0];
  var timeSlot = parts.slice(1).join(' ');

  var dateMatch = dateStr.match(/^(\d{1,2})\/(\d{1,2})$/);
  if (!dateMatch) {
    return { text: '日期格式錯誤，請使用 MM/DD，例如 3/31', quickReply: bA() };
  }

  var items = getExamItemsByDateTime(dateStr, timeSlot);
  if (items.length === 0) {
    return { text: dateStr + ' ' + timeSlot + ' 時段沒有安排考試', quickReply: bA() };
  }

  var availability = getAssistantAvailability();
  var certData = getCertificationData();

  var reply = '【' + dateStr + ' ' + timeSlot + ' 可排考官名單】\n\n';
  items.forEach(function(item) {
    reply += '📌 ' + item + '\n';

    var candidates = [];
    for (var name in availability) {
      if (isAssistantAvailable(name, dateStr, timeSlot, availability)) {
        if (isQualifiedForItem(item, name, certData)) {
          candidates.push(name);
        }
      }
    }

    if (candidates.length > 0) {
      candidates.sort();
      var candidateList = candidates.map(function(n) {
        var note = availability[n]['備註'] ? ' (備註：' + availability[n]['備註'] + ')' : '';
        return availability[n]['原始姓名'] + note;
      });
      reply += '可排考官：' + candidateList.join('、') + '\n\n';
    } else {
      reply += '⚠️ 此時段無合格且有空的助理，請手動協調。\n\n';
    }
  });

  return { text: reply, quickReply: bA() };
}

function getMyTentativeSchedule(userId) {
  var name = getBoundName(userId);
  if (!name) {
    return { text: '您尚未綁定姓名，請輸入「我是 姓名」完成綁定。', quickReply: bA() };
  }

  var normName = nrm(name);
  var examSchedule = getExamSchedule();
  var availability = getAssistantAvailability();
  var certData = getCertificationData();

  // 收集所有可能任務，按日期、時段分組
  var tasksByDate = {}; // { date: { timeSlot: [item1, item2, ...] } }
  for (var key in examSchedule) {
    var parts = key.split('|');
    var date = parts[0];
    var timeSlot = parts[1];
    var items = examSchedule[key].items;

    if (!isAssistantAvailable(normName, date, timeSlot, availability)) continue;

    items.forEach(function(item) {
      if (isQualifiedForItem(item, normName, certData)) {
        if (!tasksByDate[date]) tasksByDate[date] = {};
        if (!tasksByDate[date][timeSlot]) tasksByDate[date][timeSlot] = [];
        tasksByDate[date][timeSlot].push(item);
      }
    });
  }

  // 取得所有日期並排序
  var dates = Object.keys(tasksByDate).sort(function(a, b) {
    var aParts = a.split('/').map(Number);
    var bParts = b.split('/').map(Number);
    if (aParts[0] !== bParts[0]) return aParts[0] - bParts[0];
    return aParts[1] - bParts[1];
  });

  if (dates.length === 0) {
    return { text: '根據目前資料，您沒有可能被排到的任務。', quickReply: bA() };
  }

  var reply = '【您可能被排到的時段】\n（最終排班以公告為準）\n\n';
  var total = 0;
  dates.forEach(function(date) {
    var weekday = getWeekdayFromDate(date);
    reply += '📅 ' + date + ' (' + weekday + ')\n';
    var timeSlots = Object.keys(tasksByDate[date]).sort(function(a, b) {
      return parseInt(a) - parseInt(b);
    });
    timeSlots.forEach(function(timeSlot) {
      var items = tasksByDate[date][timeSlot];
      total += items.length;
      reply += '  ' + timeSlot + '：' + items.join('、') + '\n';
    });
    reply += '\n';
  });

  reply += '總計 ' + total + ' 項可能任務。\n';
  reply += '⚠️ 注意：此為暫定排班，實際任務以最終公告為準。';

  return { text: reply, quickReply: bA() };
}

function getTentativeOverallSchedule() {
  var examSchedule = getExamSchedule();
  var availability = getAssistantAvailability();
  var certData = getCertificationData();

  // 按日期和時段分組，每個時段內記錄項目及其可用考官
  var scheduleByDate = {};

  for (var key in examSchedule) {
    var parts = key.split('|');
    var date = parts[0];
    var timeSlot = parts[1];
    var phase = examSchedule[key].phase || '';
    var items = examSchedule[key].items;

    if (!scheduleByDate[date]) scheduleByDate[date] = {};
    if (!scheduleByDate[date][timeSlot]) {
      scheduleByDate[date][timeSlot] = {
        phase: phase,
        items: []
      };
    }

    // 找出此時段可用的所有助理
    var availableAssistants = [];
    for (var name in availability) {
      if (isAssistantAvailable(name, date, timeSlot, availability)) {
        availableAssistants.push(name);
      }
    }

    items.forEach(function(item) {
      var candidates = availableAssistants.filter(function(name) {
        return isQualifiedForItem(item, name, certData);
      }).map(function(name) {
        return availability[name]['原始姓名'];
      }).sort();

      scheduleByDate[date][timeSlot].items.push({
        item: item,
        candidates: candidates
      });
    });
  }

  var dates = Object.keys(scheduleByDate).sort(function(a, b) {
    var aParts = a.split('/').map(Number);
    var bParts = b.split('/').map(Number);
    if (aParts[0] !== bParts[0]) return aParts[0] - bParts[0];
    return aParts[1] - bParts[1];
  });

  var reply = '【暫定總排班】\n（依目前資料，實際排班以最終公告為準）\n\n';

  dates.forEach(function(date) {
    var weekday = getWeekdayFromDate(date);
    reply += '📅 ' + date + ' (' + weekday + ')\n';
    var timeSlots = Object.keys(scheduleByDate[date]).sort(function(a, b) {
      return parseInt(a) - parseInt(b);
    });
    timeSlots.forEach(function(timeSlot) {
      var data = scheduleByDate[date][timeSlot];
      if (data.phase) reply += '  [' + data.phase + '] ' + timeSlot + '\n';
      else reply += '  ' + timeSlot + '\n';

      data.items.forEach(function(itemData) {
        var item = itemData.item;
        var candidates = itemData.candidates;
        if (candidates.length > 0) {
          reply += '    • ' + item + '：' + candidates.join('、') + '\n';
        } else {
          reply += '    • ' + item + '：⚠️ 無可用考官\n';
        }
      });
    });
    reply += '\n';
  });

  reply += '⚠️ 注意事項：\n';
  reply += '• 此為暫定總排班，僅供參考。\n';
  reply += '• 實際排班將由系統自動完成，請以最終公告為準。\n';
  reply += '• 若發現缺人時段，請儘早協調。';

  // 檢查長度，若過長則產生試算表連結
  if (reply.length > 5000) {
    var sheetUrl = generateOverallScheduleSheet(scheduleByDate);
    var shortReply = reply.substring(0, 4900) +
      '\n\n...（訊息過長，僅顯示部分。完整結果請查看試算表：\n' + sheetUrl + '）';
    return { text: shortReply, quickReply: bA() };
  } else {
    return { text: reply, quickReply: bA() };
  }
}

function generateOverallScheduleSheet(scheduleByDate) {
  var rows = [];
  var dates = Object.keys(scheduleByDate).sort(function(a, b) {
    var aParts = a.split('/').map(Number);
    var bParts = b.split('/').map(Number);
    if (aParts[0] !== bParts[0]) return aParts[0] - bParts[0];
    return aParts[1] - bParts[1];
  });
  dates.forEach(function(date) {
    var timeSlots = Object.keys(scheduleByDate[date]).sort(function(a, b) {
      return parseInt(a) - parseInt(b);
    });
    timeSlots.forEach(function(timeSlot) {
      var data = scheduleByDate[date][timeSlot];
      data.items.forEach(function(itemData) {
        rows.push([
          date,
          timeSlot,
          data.phase,
          itemData.item,
          itemData.candidates.join('、') || '無'
        ]);
      });
    });
  });

  var ss = SpreadsheetApp.openById(MASTER_SHEET_ID);
  var sheetName = '暫定總排班_' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'MMddHHmm');
  var sheet = ss.insertSheet(sheetName);
  var headers = [['日期', '時段', '階段', '項目', '可用考官']];
  sheet.getRange(1, 1, 1, 5).setValues(headers);
  if (rows.length > 0) {
    sheet.getRange(2, 1, rows.length, 5).setValues(rows);
  }
  sheet.autoResizeColumns(1, 5);
  return ss.getUrl() + '#gid=' + sheet.getSheetId();
}

function getShortageReport() {
  var examSchedule = getExamSchedule();
  var availability = getAssistantAvailability();
  var certData = getCertificationData();
  var allAssistants = Object.keys(availability);

  var slots = [];
  for (var key in examSchedule) {
    var parts = key.split('|');
    slots.push({ date: parts[0], timeSlot: parts[1], items: examSchedule[key].items });
  }
  slots.sort(function(a, b) { return a.date.localeCompare(b.date); });

  var reportLines = [];
  slots.forEach(function(slot) {
    var date = slot.date;
    var timeSlot = slot.timeSlot;
    var items = slot.items;

    var availableAssistants = allAssistants.filter(function(name) {
      return isAssistantAvailable(name, date, timeSlot, availability);
    });

    items.forEach(function(item) {
      var candidates = availableAssistants.filter(function(name) {
        return isQualifiedForItem(item, name, certData);
      });
      var count = candidates.length;
      var marker = count === 0 ? ' ⚠️ 缺人' : '';
      reportLines.push(date + ' ' + timeSlot + ' ' + item + '：' + count + '人可用' + marker);
    });
  });

  if (reportLines.length === 0) return { text: '目前無資料。', quickReply: bA() };
  var reply = '【缺人狀況】\n\n' + reportLines.join('\n');
  if (reply.length > 5000) {
    var shortageLines = reportLines.filter(line => line.includes('⚠️'));
    reply = '【缺人狀況（僅顯示缺人項目）】\n\n' + shortageLines.join('\n');
  }
  return { text: reply, quickReply: bA() };
}

function getOriginalName(normName) {
  for (var orig in LEVEL_MAP) {
    if (nrm(orig) === normName) return orig;
  }
  return normName;
}

function outputFinalSchedule(rows) {
  var ss = SpreadsheetApp.openById(MASTER_SHEET_ID);
  var sheet = ss.getSheetByName(FINAL_SCHEDULE_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(FINAL_SCHEDULE_SHEET_NAME);
  } else {
    sheet.clear();
  }
  var headers = [['日期', '星期', '時段', '階段', '項目', '級別', '考官']];
  sheet.getRange(1, 1, 1, 7).setValues(headers);
  if (rows.length > 0) {
    sheet.getRange(2, 1, rows.length, 7).setValues(rows);
  }
  sheet.setFrozenRows(1);
  sheet.autoResizeColumns(1, 7);
}

function notifyAssignedAssistants(rows) {
  var tasksByNorm = {};
  rows.forEach(function(row) {
    if (row[6] === '⚠️ 待處理') return;
    var originalName = row[6];
    var normName = nrm(originalName);
    if (!tasksByNorm[normName]) tasksByNorm[normName] = [];
    tasksByNorm[normName].push({
      date: row[0],
      timeSlot: row[2],
      item: row[4]
    });
  });

  for (var normName in tasksByNorm) {
    var tasks = tasksByNorm[normName];
    var originalName = getOriginalName(normName);
    var userId = getUserIdByName(originalName);
    if (!userId) continue;
    var message = '【您的考官任務已確定】\n\n您已被分配以下任務：\n';
    tasks.sort(function(a, b) { return a.date.localeCompare(b.date); });
    tasks.forEach(function(t) {
      message += '\n📅 ' + t.date + ' ' + t.timeSlot + '  ' + t.item;
    });
    pushMessage(userId, message);
  }
}

function autoSchedule() {
  Logger.log('開始自動排班...');

  var examSchedule = getExamSchedule();
  var availability = getAssistantAvailability();
  var certData = getCertificationData();
  var allAssistants = Object.keys(availability);

  var slots = [];
  for (var key in examSchedule) {
    var parts = key.split('|');
    slots.push({
      date: parts[0],
      timeSlot: parts[1],
      phase: examSchedule[key].phase,
      items: examSchedule[key].items
    });
  }
  slots.sort(function(a, b) { return a.date.localeCompare(b.date); });

  var resultRows = [];
  var assignedCount = {};
  var pref = {};
  allAssistants.forEach(function(name) { 
    assignedCount[name] = 0; 
    pref[name] = availability[name]['偏好'] || 0;
  });

  slots.forEach(function(slot) {
    var date = slot.date;
    var timeSlot = slot.timeSlot;
    var phase = slot.phase;
    var items = slot.items;

    var availableAssistants = allAssistants.filter(function(name) {
      return isAssistantAvailable(name, date, timeSlot, availability);
    });

    var candidatesPerItem = {};
    items.forEach(function(item) {
      candidatesPerItem[item] = availableAssistants.filter(function(name) {
        return isQualifiedForItem(item, name, certData);
      });
    });

    var sortedItems = items.slice().sort(function(a, b) {
      return (candidatesPerItem[a] || []).length - (candidatesPerItem[b] || []).length;
    });

    var assignedInSlot = {};

    sortedItems.forEach(function(item) {
      var candidates = (candidatesPerItem[item] || []).filter(function(name) {
        return !assignedInSlot[name];
      });
      if (candidates.length === 0) {
        resultRows.push([
          date,
          getWeekdayFromDate(date),
          timeSlot,
          phase,
          item,
          '',
          '⚠️ 待處理'
        ]);
      } else {
        // 排序：先考慮偏好，再考慮已排次數，最後按姓名
        candidates.sort(function(a, b) {
          if (pref[a] !== pref[b]) return pref[b] - pref[a]; // 偏好高的優先
          if (assignedCount[a] !== assignedCount[b]) return assignedCount[a] - assignedCount[b];
          return a.localeCompare(b);
        });
        var chosen = candidates[0];
        var originalName = getOriginalName(chosen);
        var level = certData[chosen] ? certData[chosen].level : LEVEL_MAP[originalName] || '';
        resultRows.push([
          date,
          getWeekdayFromDate(date),
          timeSlot,
          phase,
          item,
          level,
          originalName
        ]);
        assignedInSlot[chosen] = true;
        assignedCount[chosen]++;
      }
    });
  });

  outputFinalSchedule(resultRows);
  notifyAssignedAssistants(resultRows);

  Logger.log('自動排班完成，共產生 ' + resultRows.length + ' 筆資料。');
  return resultRows;
}

function onAvailabilityFormSubmit(e) {
  Logger.log('=== 空閒時間表單提交觸發 ===');
  if (!e) return;
  var sheet = e.range.getSheet();
  if (sheet.getName() !== AVAILABILITY_SHEET_NAME) return;

  var values = e.values;
  var rawName = values[COL_AVAIL_NAME];
  if (!rawName) return;

  var baseName = rawName.replace(/\d+$/, '');
  var userId = getUserIdByName(baseName);
  if (!userId) {
    Logger.log('找不到用戶 ' + baseName + ' 的綁定 ID');
    return;
  }

  var normName = nrm(baseName);
  var examSchedule = getExamSchedule();
  var availability = getAssistantAvailability();
  var certData = getCertificationData();

  var tasks = [];
  for (var key in examSchedule) {
    var parts = key.split('|');
    var date = parts[0];
    var timeSlot = parts[1];
    var items = examSchedule[key].items;

    if (!isAssistantAvailable(normName, date, timeSlot, availability)) continue;

    items.forEach(function(item) {
      if (isQualifiedForItem(item, normName, certData)) {
        tasks.push({ date: date, timeSlot: timeSlot, item: item });
      }
    });
  }
  tasks.sort(function(a, b) { return a.date.localeCompare(b.date); });

  if (tasks.length === 0) {
    Logger.log('助理 ' + rawName + ' 暫無可排任務');
    return;
  }

  var message = '【暫定排班通知】\n\n根據您目前填寫的空閒時間，您可能被安排到以下任務（最終以公告為準）：\n';
  tasks.forEach(function(t) {
    message += '\n📅 ' + t.date + ' ' + t.timeSlot + '  ' + t.item;
  });
  pushMessage(userId, message);
  Logger.log('已發送暫定排班通知給：' + rawName);
}

// ========== 新增：檢查考試排程表（管理員用）==========
function checkExamSchedule() {
  var schedule = getExamSchedule();
  var keys = Object.keys(schedule).sort();
  if (keys.length === 0) {
    return { text: '⚠️ 考試排程表為空，請確認工作表名稱及資料。', quickReply: bA() };
  }
  var reply = '【當前考試排程時段】\n';
  keys.slice(0, 20).forEach(function(key) {
    reply += key + '：' + schedule[key].items.join(', ') + '\n';
  });
  if (keys.length > 20) reply += '...等共 ' + keys.length + ' 個時段';
  return { text: reply, quickReply: bA() };
}// ========== 射龍門全域交易紀錄管理 ==========
var GLOBAL_TRANS_KEY = 'global_trans';
var ALL_USERS_KEY = 'all_users';

function d_registerUser(userId) {
  var key = ALL_USERS_KEY;
  var json = PropertiesService.getScriptProperties().getProperty(key);
  var users = json ? JSON.parse(json) : [];
  if (!users.includes(userId)) {
    users.push(userId);
    PropertiesService.getScriptProperties().setProperty(key, JSON.stringify(users));
  }
}

function d_getAllUsers() {
  var key = ALL_USERS_KEY;
  var json = PropertiesService.getScriptProperties().getProperty(key);
  return json ? JSON.parse(json) : [];
}

function d_addGlobalTransaction(userId, userName, delta, newBalance, type, details) {
  var key = GLOBAL_TRANS_KEY;
  var json = PropertiesService.getScriptProperties().getProperty(key);
  var records = json ? JSON.parse(json) : [];
  
  var record = {
    timestamp: new Date().toISOString(),
    userId: userId,
    name: userName || userId.substring(0, 8),
    delta: delta,
    newBalance: newBalance,
    type: type,
    details: details
  };
  records.push(record);
  
  // 只保留最近 100 筆
  if (records.length > 100) records = records.slice(-100);
  
  PropertiesService.getScriptProperties().setProperty(key, JSON.stringify(records));
}

function d_getGlobalTransactions(limit = 5) {
  var key = GLOBAL_TRANS_KEY;
  var json = PropertiesService.getScriptProperties().getProperty(key);
  var records = json ? JSON.parse(json) : [];
  return records.slice(-limit);
}

function d_formatTime(isoString) {
  var d = new Date(isoString);
  var hh = ('0' + d.getHours()).slice(-2);
  var mm = ('0' + d.getMinutes()).slice(-2);
  return hh + ':' + mm;
}
// ========== 隨機美食推薦 ==========
function getRandomFood(category) {
  var list;
  if (category && FOOD_LIST[category]) {
    list = FOOD_LIST[category];
  } else {
    // 不指定類別時，從全部項目中隨機選取
    var allItems = [];
    for (var key in FOOD_LIST) {
      allItems = allItems.concat(FOOD_LIST[key]);
    }
    list = allItems;
  }
  var randomIndex = Math.floor(Math.random() * list.length);
  return list[randomIndex];
}

// ========== 射龍門輔助函數 ==========
function cardName(p) {
  if (p === 1) return 'A';
  if (p === 11) return 'J';
  if (p === 12) return 'Q';
  if (p === 13) return 'K';
  return p.toString();
}

function quickReply(itemsArr) {
  var items = itemsArr.map(function(item) {
    return { type: 'action', action: { type: 'message', label: item, text: item } };
  });
  return { items: items };
}

function formatTime(date) {
  var hh = ('0' + date.getHours()).slice(-2);
  var mm = ('0' + date.getMinutes()).slice(-2);
  return hh + ':' + mm;
}

function getUserName(userId) {
  var name = getBoundName ? getBoundName(userId) : null;
  return name || userId.substring(0, 8);
}

// ========== 讀取玩家資料（射龍門） ==========
function getPlayerData(userId) {
  try {
    var sheet = SpreadsheetApp.openById(GAME_SHEET_ID).getSheetByName(PLAYER_SHEET);
    var data = sheet.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      if (data[i][0] === userId) {
        var token = Number(data[i][2]);
        if (isNaN(token) || token === '') token = DEFAULT_TOKEN;
        return {
          row: i + 1,
          name: data[i][1],
          token: token,
          lastBonusDate: data[i][8] ? new Date(data[i][8]) : new Date(0)
        };
      }
    }
    // 新增玩家
    var name = getUserName(userId);
    sheet.appendRow([userId, name, DEFAULT_TOKEN, 0, 0, 0, 0, 0, new Date(0)]);
    return {
      row: sheet.getLastRow(),
      name: name,
      token: DEFAULT_TOKEN,
      lastBonusDate: new Date(0)
    };
  } catch (e) {
    Logger.log('讀取玩家錯誤: ' + e);
    return null;
  }
}

// ========== 更新玩家代幣（射龍門）- 已使用 Lock ==========
function updatePlayerToken(userId, delta, gameDetails, type) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var sheet = SpreadsheetApp.openById(GAME_SHEET_ID).getSheetByName(PLAYER_SHEET);
    var transSheet = SpreadsheetApp.openById(GAME_SHEET_ID).getSheetByName(TRANSACTION_SHEET);
    var data = sheet.getDataRange().getValues();

    for (var i = 1; i < data.length; i++) {
      if (data[i][0] === userId) {
        var oldBalance = Number(data[i][2]);
        if (isNaN(oldBalance)) oldBalance = DEFAULT_TOKEN;

        var newBalance = oldBalance + delta;
        if (isNaN(newBalance)) newBalance = DEFAULT_TOKEN;

        var name = data[i][1];

        sheet.getRange(i + 1, 3).setNumberFormat('#').setValue(newBalance);
        
        if (type !== '獎勵') {
          sheet.getRange(i + 1, 4).setValue(Number(data[i][3] || 0) + 1);
          if (delta > 0) {
            sheet.getRange(i + 1, 5).setValue(Number(data[i][4] || 0) + 1);
            var currentMax = Number(data[i][6] || 0);
            if (delta > currentMax) {
              sheet.getRange(i + 1, 7).setNumberFormat('#').setValue(delta);
            }
          } else if (delta < 0) {
            sheet.getRange(i + 1, 6).setValue(Number(data[i][5] || 0) + 1);
          }
        }
        sheet.getRange(i + 1, 9).setValue(new Date());

        transSheet.appendRow([
          new Date(),
          userId,
          name,
          type || (delta > 0 ? '贏' : (delta < 0 ? '輸' : '入池')),
          delta,
          newBalance,
          gameDetails || '',
          ''
        ]);

        lock.releaseLock();
        return newBalance;
      }
    }

    var newName = getUserName(userId);
    sheet.appendRow([userId, newName, DEFAULT_TOKEN + delta, 1, delta > 0 ? 1 : 0, delta < 0 ? 1 : 0, delta > 0 ? delta : 0, 0, new Date()]);
    transSheet.appendRow([new Date(), userId, newName, type || (delta > 0 ? '贏' : '輸'), delta, DEFAULT_TOKEN + delta, gameDetails, '']);
    lock.releaseLock();
    return DEFAULT_TOKEN + delta;
  } catch (e) {
    Logger.log('更新餘額錯誤: ' + e);
    lock.releaseLock();
    var current = getPlayerData(userId)?.token || DEFAULT_TOKEN;
    return current + delta;
  }
}

// ========== 池底操作 ==========
function getPool() {
  try {
    var sheet = SpreadsheetApp.openById(GAME_SHEET_ID).getSheetByName(POOL_SHEET);
    var data = sheet.getDataRange().getValues();
    if (data.length > 1) {
      var val = Number(data[1][0]);
      return isNaN(val) ? 0 : val;
    }
    return 0;
  } catch (e) {
    return 0;
  }
}

function setPool(value) {
  var sheet = SpreadsheetApp.openById(GAME_SHEET_ID).getSheetByName(POOL_SHEET);
  sheet.getRange(2, 1).setNumberFormat('#').setValue(value);
}

function addToPool(amount) {
  var lock = LockService.getScriptLock();
  lock.waitLock(5000);
  try {
    var current = getPool();
    var newPool = current + amount;
    setPool(newPool);
    lock.releaseLock();
    return newPool;
  } catch (e) {
    lock.releaseLock();
    return getPool();
  }
}

function deductFromPool(amount) {
  var lock = LockService.getScriptLock();
  lock.waitLock(5000);
  try {
    var current = getPool();
    var newPool = Math.max(0, current - amount);
    setPool(newPool);
    lock.releaseLock();
    return newPool;
  } catch (e) {
    lock.releaseLock();
    return getPool();
  }
}

// ========== 取得最近貢獻者 (最近5筆入池交易) ==========
function getRecentContributors() {
  try {
    var sheet = SpreadsheetApp.openById(GAME_SHEET_ID).getSheetByName(TRANSACTION_SHEET);
    var data = sheet.getDataRange().getValues();
    var contributors = [];
    for (var i = data.length - 1; i >= 1; i--) {
      if (data[i][3] === '入池') {
        contributors.push({
          name: data[i][2],
          amount: Number(data[i][4]),
          time: formatTime(new Date(data[i][0]))
        });
        if (contributors.length >= 5) break;
      }
    }
    return contributors;
  } catch (e) {
    return [];
  }
}

// ========== 取得近期戰報 ==========
function getRecentResults() {
  var records = d_getGlobalTransactions(3);
  var lines = [];
  records.forEach(function(r) {
    var sign = r.delta > 0 ? '+' : '';
    var time = d_formatTime(r.timestamp);
    lines.push(time + ' ' + r.name + ' ' + r.type + ' ' + sign + r.delta);
  });
  return lines;
}

// ========== 每日獎勵 ==========
function claimDailyBonus(userId) {
  var player = getPlayerData(userId);
  if (!player) return { text: '讀取玩家資料失敗', quickReply: quickReply(['主選單']) };

  var now = new Date();
  var last = player.lastBonusDate;
  var isNewDay = last.toDateString() !== now.toDateString();

  if (!isNewDay) {
    return { text: '❌ 今日獎勵已領取過，請明天再來！', quickReply: quickReply(['射龍門', '主選單']) };
  }

  var newToken = updatePlayerToken(userId, DAILY_BONUS, '每日獎勵', '獎勵');
  return {
    text: '✅ 每日首次獎勵 +' + DAILY_BONUS + ' 教學代幣！\n💰 目前餘額：' + newToken + ' 枚',
    quickReply: quickReply(['射龍門', '主選單'])
  };
}

// ========== 遊戲狀態管理（使用 Lock） ==========
var STATE_KEY = 'dragon_state_';
function getState(userId) {
  var lock = LockService.getScriptLock();
  lock.waitLock(5000);
  try {
    var json = PropertiesService.getUserProperties().getProperty(STATE_KEY + userId);
    return json ? JSON.parse(json) : null;
  } finally {
    lock.releaseLock();
  }
}
function setState(userId, state) {
  var lock = LockService.getScriptLock();
  lock.waitLock(5000);
  try {
    PropertiesService.getUserProperties().setProperty(STATE_KEY + userId, JSON.stringify(state));
  } finally {
    lock.releaseLock();
  }
}
function clearState(userId) {
  var lock = LockService.getScriptLock();
  lock.waitLock(5000);
  try {
    PropertiesService.getUserProperties().deleteProperty(STATE_KEY + userId);
  } finally {
    lock.releaseLock();
  }
}

// ========== 開始遊戲（加入冷卻檢查 + 確認標記） ==========
function startGame(userId) {
  // 檢查是否剛結束遊戲（3秒內）
  var lastEnd = GAME_END_CACHE.get('game_end_' + userId);
  if (lastEnd) {
    var diff = Date.now() - parseInt(lastEnd);
    if (diff < 3000) { // 3秒內
      return {
        text: '⏳ 您剛剛結束一局遊戲，請稍後再開始新局。',
        quickReply: quickReply(['主選單'])
      };
    }
  }

  // 檢查是否有確認標記（防止非預期呼叫）
  var confirmOk = GAME_END_CACHE.get(CONFIRM_OK_PREFIX + userId);
  if (!confirmOk) {
    Logger.log('⚠️ 嘗試未經確認開始遊戲，用戶：' + userId);
    return {
      text: '❌ 請先輸入「射龍門」並點擊「確認開始」才能開始新局。',
      quickReply: quickReply(['射龍門', '主選單'])
    };
  }
  // 清除確認標記（一次性）
  GAME_END_CACHE.remove(CONFIRM_OK_PREFIX + userId);

  d_registerUser(userId);

  var player = getPlayerData(userId);
  if (!player) return { text: '讀取資料失敗', quickReply: quickReply(['主選單']) };
  
  // 負數檢查：若餘額小於0，不能開始新局
  if (player.token < 0) {
    return {
      text: '⚠️ 您的教學代幣餘額為負數（' + player.token + ' 枚），無法開始新局。請聯繫管理員課金！',
      quickReply: quickReply(['我的ID', '主選單'])
    };
  }

  var state = getState(userId);
  if (state) {
    return {
      text: '您還有一局未完成的遊戲！\n您的牌：' + cardName(state.c1) + '、' + cardName(state.c2),
      quickReply: quickReply(['繼續遊戲', '放棄舊局', '放棄'])
    };
  }

  var newToken = updatePlayerToken(userId, -ENTRY_FEE, '開始新局', '入池');
  addToPool(ENTRY_FEE);

  var c1 = Math.floor(Math.random() * 13) + 1;
  var c2 = Math.floor(Math.random() * 13) + 1;
  if (c1 > c2) { var temp = c1; c1 = c2; c2 = temp; }
  setState(userId, { stage: 'BET', c1: c1, c2: c2 });

  var pool = getPool();
  var contributors = getRecentContributors();
  var recentResults = getRecentResults();

  var poolDisplay = '**目前池底總額：' + pool + ' 枚**\n\n';
  var contribText = '最近貢獻者：\n';
  if (contributors.length > 0) {
    contributors.forEach(function(c, idx) {
      contribText += (idx + 1) + '. ' + c.name + ' 投入 ' + c.amount + ' 枚 (' + c.time + ')\n';
    });
  } else {
    contribText += '尚無貢獻紀錄\n';
  }

  var resultsText = '';
  if (recentResults.length > 0) {
    resultsText = '\n📊 近期輸贏動態：\n' + recentResults.join('\n') + '\n';
  }

  var msg = '🎲 射龍門開始！\n\n';
  msg += '您的兩張牌：' + cardName(c1) + ' 和 ' + cardName(c2) + '\n';
  msg += poolDisplay;
  msg += contribText;
  msg += resultsText + '\n';
  msg += '您的代幣餘額：' + newToken + ' 枚\n\n';
  msg += '請選擇要「放棄」還是「喊注」？\n';
  msg += '- 放棄：損失入池金，該局結束。\n';
  msg += '- 喊注：從下方選擇金額，然後直接開牌。\n';
  msg += '也可直接點「All in」喊注全部池底。\n\n';
  msg += '$ 當前池底：' + pool + ' 枚';

  var quickItems = ['放棄', 'All in', '10', '50', '100'];
  return { text: msg, quickReply: quickReply(quickItems) };
}

// ========== 繼續遊戲 ==========
function continueGame(userId) {
  var state = getState(userId);
  if (!state) return { text: '您目前沒有進行中的牌局。', quickReply: quickReply(['射龍門']) };

  var pool = getPool();
  var contributors = getRecentContributors();
  var recentResults = getRecentResults();

  var poolDisplay = '**目前池底總額：' + pool + ' 枚**\n\n';
  var contribText = '最近貢獻者：\n';
  if (contributors.length > 0) {
    contributors.forEach(function(c, idx) {
      contribText += (idx + 1) + '. ' + c.name + ' 投入 ' + c.amount + ' 枚 (' + c.time + ')\n';
    });
  } else {
    contribText += '尚無貢獻紀錄\n';
  }

  var resultsText = '';
  if (recentResults.length > 0) {
    resultsText = '\n📊 近期輸贏動態：\n' + recentResults.join('\n') + '\n';
  }

  var msg = '您的牌局未完成！\n您的兩張牌：' + cardName(state.c1) + ' 和 ' + cardName(state.c2) + '\n\n';
  msg += poolDisplay;
  msg += contribText;
  msg += resultsText + '\n';

  if (state.stage === 'BET') {
    msg += '請輸入您要「喊注」的金額，或選擇放棄。\n';
    msg += '💰 您的代幣餘額：' + getPlayerData(userId).token + ' 枚\n\n';
    msg += '$ 當前池底：' + pool + ' 枚';
    return { text: msg, quickReply: quickReply(['放棄', 'All in', '10', '50', '100']) };
  } else {
    msg += '請猜第三張牌會比較大(上)還是比較小(下)？';
    return { text: msg, quickReply: quickReply(['上', '下', '放棄']) };
  }
}

// ========== 喊注 ==========
function placeBet(userId, betAmount, isAllIn) {
  var state = getState(userId);
  if (!state || state.stage !== 'BET') return { text: '請先輸入「射龍門」開始新局。' };

  var player = getPlayerData(userId);
  if (player.token < 0) {
    return {
      text: '⚠️ 您的教學代幣餘額為負數（' + player.token + ' 枚），無法進行遊戲。請聯繫管理員課金！',
      quickReply: quickReply(['我的ID', '主選單'])
    };
  }

  var pool = getPool();
  if (pool <= 0) return { text: '目前池底為空，請輸入「放棄」結束此局。' };
  if (betAmount <= 0) return { text: '喊注金額必須大於 0。' };
  if (betAmount > pool) return { text: '喊注不能超過池底上限 (' + pool + ' 枚)！' };

  if (!isAllIn) {
    var balance = player.token;
    var maxLoss = betAmount * (state.c1 === state.c2 ? 3 : 2);
    if (balance < maxLoss) {
      return {
        text: '您的教學代幣餘額不足可能的最大損失（需 ' + maxLoss + ' 枚），請減少喊注金額、選擇「All in」或放棄。',
        quickReply: quickReply(['放棄', 'All in'])
      };
    }
  }

  state.bet = betAmount;

  if (state.c1 === state.c2) {
    state.stage = 'UPDOWN';
    setState(userId, state);
    return {
      text: '您喊注了 ' + betAmount + ' 枚。\n因為兩張牌都是【' + cardName(state.c1) + '】\n請猜第三張牌會比較大(上)還是比較小(下)？',
      quickReply: quickReply(['上', '下', '放棄'])
    };
  }

  return settleGame(userId, state, betAmount, null);
}

// ========== 猜大小 ==========
function guessUpDown(userId, guess) {
  var state = getState(userId);
  if (!state || state.stage !== 'UPDOWN') return { text: '現在不是猜大小的階段喔！' };
  return settleGame(userId, state, state.bet, guess);
}

// ========== 遊戲結算（加入冷卻記錄） ==========
function settleGame(userId, state, bet, guess) {
  var c1 = state.c1, c2 = state.c2;
  var c3 = Math.floor(Math.random() * 13) + 1;
  var win = false, multi = -1, resultText = '';

  if (c1 === c2) {
    if (c3 === c1) {
      multi = -3; resultText = '💥 慘烈撞柱！三張牌都是【' + cardName(c3) + '】！(賠3倍)';
    } else {
      var isBigger = c3 > c1;
      var isGuessUp = (guess === '上');
      if ((isGuessUp && isBigger) || (!isGuessUp && !isBigger)) {
        win = true; multi = 1; resultText = '🎉 恭喜猜中！第三張牌是【' + cardName(c3) + '】！';
      } else {
        multi = -1; resultText = '😢 猜錯了，第三張牌是【' + cardName(c3) + '】。';
      }
    }
  } else {
    if (c3 > c1 && c3 < c2) {
      win = true; multi = 1; resultText = '🎯 進球！第三張牌是【' + cardName(c3) + '】，落在中間！';
    } else if (c3 === c1 || c3 === c2) {
      multi = -2; resultText = '💥 撞柱！第三張牌是【' + cardName(c3) + '】！(賠2倍)';
    } else {
      multi = -1; resultText = '😵 歪球！第三張牌是【' + cardName(c3) + '】，落在外面。';
    }
  }

  var winAmount = 0, lossAmount = 0;
  if (win) {
    winAmount = Math.min(bet, getPool());
    deductFromPool(winAmount);
    if (winAmount < bet) resultText += '\n(池底不足，實際拿走 ' + winAmount + ' 枚)';
  } else {
    lossAmount = bet * (-multi);
    addToPool(lossAmount);
  }

  var delta = win ? winAmount : -lossAmount;
  var oldToken = getPlayerData(userId).token;
  var details = '牌 ' + cardName(c1) + ' ' + cardName(c2) + ' → ' + cardName(c3);
  var newToken = updatePlayerToken(userId, delta, details, win ? '贏' : '輸');

  var userName = getUserName(userId);
  d_addGlobalTransaction(userId, userName, delta, newToken, win ? '贏' : '輸', details);

  clearState(userId);

  // 記錄遊戲結束時間（用於冷卻）
  GAME_END_CACHE.put('game_end_' + userId, Date.now().toString(), 60);

  var msg = resultText + '\n\n';
  msg += '本局喊注：' + bet + ' 枚\n';
  msg += (win ? '🎊 贏得：' + winAmount : '💸 損失：' + lossAmount) + ' 枚\n';
  msg += '💰 原餘額 ' + oldToken + ' → 新餘額 ' + newToken + ' (變動 ' + delta + ')\n';
  msg += '🏟️ 最新池底：' + getPool() + ' 枚\n';
  if (newToken < 0) msg += '⚠️ 警告：您已破產，請聯繫管理員課金！\n';

  return { text: msg, quickReply: quickReply(['射龍門', '主選單']) };
}

// ========== 放棄遊戲（加入冷卻記錄） ==========
function foldGame(userId) {
  if (!getState(userId)) return { text: '您目前沒有進行中的牌局。' };
  clearState(userId);
  GAME_END_CACHE.put('game_end_' + userId, Date.now().toString(), 60);
  return { text: '您已放棄本局遊戲，入池金不退還。\n想再挑戰請輸入「射龍門」。', quickReply: quickReply(['射龍門', '主選單']) };
}

// ========== 放棄舊局（加入冷卻記錄） ==========
function forceClearState(userId) {
  if (!getState(userId)) return { text: '您目前沒有進行中的牌局。' };
  clearState(userId);
  GAME_END_CACHE.put('game_end_' + userId, Date.now().toString(), 60);
  return { text: '已強制清除舊局，您可以重新開始。', quickReply: quickReply(['射龍門', '主選單']) };
}

// ========== 排行榜（顯示賭神） ==========
function showLeaderboard() {
  try {
    var sheet = SpreadsheetApp.openById(GAME_SHEET_ID).getSheetByName(PLAYER_SHEET);
    var data = sheet.getDataRange().getValues();
    var players = [];
    for (var i = 1; i < data.length; i++) {
      players.push({
        userId: data[i][0],
        name: data[i][1],
        token: Number(data[i][2]) || 0
      });
    }
    players.sort(function(a, b) { return b.token - a.token; });

    var godInfo = null;
    var godJson = PropertiesService.getScriptProperties().getProperty('current_god');
    if (godJson) godInfo = JSON.parse(godJson);

    var msg = '🏆 【教學代幣排行榜】\n\n';
    players.slice(0, 10).forEach(function(p, idx) {
      var mark = (godInfo && p.userId === godInfo.userId) ? ' 👑' : '';
      msg += (idx + 1) + '. ' + p.name + mark + ' ：' + p.token + ' 枚\n';
    });

    if (godInfo && !players.slice(0, 10).some(p => p.userId === godInfo.userId)) {
      msg += '\n👑 本週賭神：' + godInfo.name + '（' + godInfo.period + '）';
    }

    return { text: msg, quickReply: quickReply(['射龍門', '主選單']) };
  } catch (e) {
    return { text: '讀取排行榜失敗', quickReply: quickReply(['射龍門', '主選單']) };
  }
}

// ========== 顯示當前賭神詳細資訊 ==========
function showCurrentGod() {
  var godJson = PropertiesService.getScriptProperties().getProperty('current_god');
  if (!godJson) {
    return { text: '目前沒有賭神稱號持有者（可能尚未結算或無人符合資格）', quickReply: quickReply(['射龍門', '主選單']) };
  }
  var god = JSON.parse(godJson);
  var msg = '👑 當前賭神\n\n';
  msg += '姓名：' + god.name + '\n';
  msg += '稱號：' + god.title + '\n';
  msg += '統計週期：' + god.period + '\n';
  msg += '週盈利：' + god.profit + ' 枚\n';
  msg += '頒發時間：' + Utilities.formatDate(new Date(god.awardedAt), Session.getScriptTimeZone(), 'MM/dd HH:mm') + '\n';
  return { text: msg, quickReply: quickReply(['射龍門', '主選單']) };
}

// ========== 我的帳戶 ==========
function showMyAccount(userId) {
  var player = getPlayerData(userId);
  if (!player) return { text: '讀取失敗', quickReply: quickReply(['主選單']) };
  var msg = '💳 【您的帳戶資訊】\n\n';
  msg += '姓名：' + player.name + '\n';
  msg += '教學代幣：' + player.token + ' 枚\n';
  msg += '系統 ID：\n' + userId + '\n\n';
  msg += '💡 長按 ID 可複製';
  return { text: msg, quickReply: quickReply(['射龍門', '主選單']) };
}

// ========== 管理員儲值 ==========
function recharge(adminId, text) {
  if (typeof isManager !== 'function' || !isManager(adminId)) {
    return { text: '⛔ 您沒有權限' };
  }

  var match = text.match(/^儲值\s+(\S+)\s+(\d+)$/);
  if (!match) return { text: '格式錯誤！請輸入：儲值 [用戶ID] [台幣金額]' };

  var targetUser = match[1];
  var twd = parseInt(match[2], 10);
  var tokenAmount = twd * 10;
  var newToken = updatePlayerToken(targetUser, tokenAmount, '管理員儲值', '儲值');

  return {
    text: '✅ 儲值成功！\n' +
          '💵 收取台幣：' + twd + ' 元\n' +
          '🪙 發放代幣：' + tokenAmount + ' 枚\n' +
          '💳 用戶目前餘額：' + newToken + ' 枚'
  };
}

// ========== 每週結算賭神 ==========
function calculateWeeklyGodOfGamblers() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return;

  try {
    var ss = SpreadsheetApp.openById(GAME_SHEET_ID);
    var transSheet = ss.getSheetByName(TRANSACTION_SHEET);
    var playerSheet = ss.getSheetByName(PLAYER_SHEET);
    var titleSheet = ss.getSheetByName(TITLE_SHEET);

    var now = new Date();
    var lastMonday = new Date(now);
    lastMonday.setDate(now.getDate() - (now.getDay() + 6) % 7 - 7);
    lastMonday.setHours(0, 0, 0, 0);
    var lastSunday = new Date(lastMonday);
    lastSunday.setDate(lastSunday.getDate() + 6);
    lastSunday.setHours(23, 59, 59, 999);

    var transData = transSheet.getDataRange().getValues();
    var profitMap = {};

    for (var i = 1; i < transData.length; i++) {
      var t = transData[i];
      var transTime = new Date(t[0]);
      if (transTime >= lastMonday && transTime <= lastSunday) {
        var userId = t[1];
        var amount = Number(t[4]) || 0;
        var type = t[3];
        if (type === '贏' || type === '輸') {
          if (!profitMap[userId]) profitMap[userId] = 0;
          profitMap[userId] += (type === '贏' ? amount : -Math.abs(amount));
        }
      }
    }

    var topUserId = null;
    var topProfit = -Infinity;
    for (var uid in profitMap) {
      if (profitMap[uid] > topProfit) {
        topProfit = profitMap[uid];
        topUserId = uid;
      }
    }

    if (!topUserId || topProfit < 0) {
      Logger.log('本週無人符合賭神資格');
      PropertiesService.getScriptProperties().deleteProperty('current_god');
      return;
    }

    var playerData = playerSheet.getDataRange().getValues();
    var winnerName = '';
    for (var j = 1; j < playerData.length; j++) {
      if (playerData[j][0] === topUserId) {
        winnerName = playerData[j][1];
        break;
      }
    }
    if (!winnerName) winnerName = topUserId.substring(0, 8);

    updatePlayerToken(topUserId, TITLE_REWARD, '獲得賭神稱號獎勵', '獎勵');

    var dateRange = Utilities.formatDate(lastMonday, Session.getScriptTimeZone(), 'MM/dd') +
                    ' - ' + Utilities.formatDate(lastSunday, Session.getScriptTimeZone(), 'MM/dd');
    titleSheet.appendRow([
      new Date(),
      topUserId,
      winnerName,
      TITLE_NAME,
      dateRange,
      '週盈利 ' + topProfit + ' 枚'
    ]);

    var godInfo = {
      userId: topUserId,
      name: winnerName,
      title: TITLE_NAME,
      period: dateRange,
      profit: topProfit,
      awardedAt: new Date().toISOString()
    };
    PropertiesService.getScriptProperties().setProperty('current_god', JSON.stringify(godInfo));

    var message = '🎉 恭喜您獲得本週 ' + TITLE_NAME + ' 稱號！\n' +
                  '🏆 週盈利：' + topProfit + ' 枚\n' +
                  '💰 獎勵 ' + TITLE_REWARD + ' 枚已匯入您的帳戶！';
    pushMessage(topUserId, message);

    Logger.log('賭神結算完成：' + winnerName);
  } catch (e) {
    Logger.log('結算錯誤：' + e);
  } finally {
    lock.releaseLock();
  }
}

function setupWeeklyTrigger() {
  ScriptApp.newTrigger('calculateWeeklyGodOfGamblers')
    .timeBased()
    .onWeekDay(ScriptApp.WeekDay.MONDAY)
    .atHour(1)
    .create();
  Logger.log('每週賭神結算觸發器已設定');
}

// ========== 射龍門主路由（加入防抖 + 二次確認） ==========
// ========== 射龍門主路由（加入防抖 + 二次確認） ==========
function handleDragonCommand(userId, text) {
  var cmd = text.trim();
  var now = Date.now();
  var cache = CacheService.getScriptCache();
  
  // 防抖：1秒內相同指令忽略（使用快取，不再依賴全域物件）
  var antiSpamKey = 'spam_' + userId + '_' + cmd;
  if (cache.get(antiSpamKey)) {
    return { text: "" }; // 靜默丟棄
  }
  cache.put(antiSpamKey, '1', 1); // 鎖定1秒

  // ===== 處理二次確認指令 =====
  if (cmd === '確認開始') {
    var pending = GAME_END_CACHE.get(CONFIRM_CACHE_PREFIX + userId);
    if (!pending) {
      return { text: '❌ 請求已過期，請重新輸入「射龍門」。', quickReply: quickReply(['射龍門']) };
    }
    GAME_END_CACHE.put(CONFIRM_OK_PREFIX + userId, 'true', 15);
    GAME_END_CACHE.remove(CONFIRM_CACHE_PREFIX + userId);
    return startGame(userId);
  }

  if (cmd === '取消') {
    if (GAME_END_CACHE.get(CONFIRM_CACHE_PREFIX + userId)) {
      GAME_END_CACHE.remove(CONFIRM_CACHE_PREFIX + userId);
      return { text: '已取消開始新局。', quickReply: quickReply(['射龍門', '主選單']) };
    } else {
      return { text: '目前沒有待確認的操作。', quickReply: quickReply(['射龍門', '主選單']) };
    }
  }

  // ===== 射龍門初始指令 =====
  if (cmd === '射龍門') {
    var state = getState(userId);
    if (state) {
      return {
        text: '您還有一局未完成的遊戲！\n您的牌：' + cardName(state.c1) + '、' + cardName(state.c2),
        quickReply: quickReply(['繼續遊戲', '放棄舊局'])
      };
    }

    var player = getPlayerData(userId);
    if (player.token < 0) {
      return {
        text: '⚠️ 您的教學代幣餘額為負數（' + player.token + ' 枚），無法開始新局。請聯繫管理員課金！',
        quickReply: quickReply(['我的ID', '主選單'])
      };
    }

    GAME_END_CACHE.put(CONFIRM_CACHE_PREFIX + userId, 'pending', 60);
    return {
      text: '🎲 確定要開始一局射龍門嗎？\n將消耗 1 枚教學代幣。',
      quickReply: quickReply(['確認開始', '取消'])
    };
  }

  // ===== 其他遊戲指令 =====
  if (cmd === '領獎勵' || cmd === '每日獎勵') return claimDailyBonus(userId);
  if (cmd === '放棄') return foldGame(userId);
  if (cmd === '放棄舊局') return forceClearState(userId);
  if (cmd === '繼續遊戲' || cmd === '繼續') return continueGame(userId);
  if (cmd === 'All in' || cmd === '梭哈') return placeBet(userId, getPool(), true);
  if (cmd === '上' || cmd === '下') return guessUpDown(userId, cmd);
  if (cmd === '排行榜') return showLeaderboard();
  if (cmd === '誰是賭神' || cmd === '賭神') return showCurrentGod();
  if (cmd === '我的ID' || cmd === '帳戶') return showMyAccount(userId);

  // 處理數字喊注（需檢查是否在 BET 階段）
  var betMatch = cmd.match(/^(\d+)$/);
  if (betMatch) {
    var state = getState(userId);
    if (state && state.stage === 'BET') {
      return placeBet(userId, parseInt(betMatch[1], 10), false);
    }
    return { text: '沒有進行中的牌局，請先輸入「射龍門」。', quickReply: quickReply(['射龍門']) };
  }

  if (cmd.indexOf('儲值') === 0) return recharge(userId, cmd);

  return null; // 非遊戲指令
}

// ========== 核心回覆邏輯（已整合射龍門） ==========
function getReply(u, i) {
  if (!u) return '請輸入文字問題';
  
  u = u.toString().trim();

  // ===== 先處理射龍門遊戲指令 =====
  var gameReply = handleDragonCommand(i, u);
  if (gameReply) return gameReply;

  // ===== 綁定指令 =====
  var bindPrefixes = ['我是', '綁定'];
  var m;
  if ((m = matchPrefix(u, bindPrefixes)).matched) return handleBindName(m.rest, i);
  if(u==='選擇中心助理')return selectIdentity('assistant',i);
  if(u==='選擇對外學生')return selectIdentity('external',i);
  if(u==='我的任務'){
    var boundTaskName=getBoundName(i);
    return boundTaskName?showTasksForName(boundTaskName):{text:'請先回首頁選擇身份並完成綁定。',quickReply:qr([{label:'🏠 選擇身份',text:'主選單'}])};
  }
  
  // ===== 排班查詢指令 =====
  var schedulePrefixes = ['排班', '考官', '找考官'];
  if ((m = matchPrefix(u, schedulePrefixes)).matched) {
    return handleScheduleQuery(m.rest, i);
  }

  // ===== 特定指令 =====
  if (u === '缺人報表') {
    return getShortageReport();
  }
  if (u === '開始排班') {
    autoSchedule();
    return { text: '排班已完成，請查看「最終排班結果」工作表。', quickReply: bA() };
  }
  if (u === '檢查排程表') {
    return checkExamSchedule();
  }
  if (u === '每日運勢') {
    return getDailyFortune();
  }
    // ===== 教學飽隨機美食 =====
  if (u === '教學飽' || u === '吃什麼' || u === '隨機美食') {
    var food = getRandomFood(); // 從全部隨機
    var items = [
      { label: '🔁 再抽一次', text: '教學飽' },
      { label: '🍳 早餐', text: '早餐吃什麼' },
      { label: '🍱 午晚餐', text: '午晚餐吃什麼' },
      { label: '🌙 宵夜', text: '宵夜吃什麼' },
      { label: '🥤 飲料', text: '飲料喝什麼' },
      { label: '🍰 甜點', text: '甜點吃什麼' },
      { label: '🏫 校內', text: '校內吃什麼' },
      { label: '🔙 回上一頁', text: '回上一頁' },
      { label: '🏠 回首頁', text: '主選單' }
    ];
    return { text: '🍽️ 今天吃這個吧：\n\n**' + food + '**', quickReply: qr(items) };
  }

  // 各類別快速查詢
  if (u === '早餐吃什麼') return { text: '🍳 早餐推薦：' + getRandomFood('早餐'), quickReply: bA() };
  if (u === '午晚餐吃什麼') return { text: '🍱 午晚餐推薦：' + getRandomFood('午晚餐'), quickReply: bA() };
  if (u === '宵夜吃什麼') return { text: '🌙 宵夜推薦：' + getRandomFood('宵夜'), quickReply: bA() };
  if (u === '飲料喝什麼') return { text: '🥤 飲料推薦：' + getRandomFood('飲料'), quickReply: bA() };
  if (u === '甜點吃什麼') return { text: '🍰 甜點推薦：' + getRandomFood('甜點'), quickReply: bA() };
  if (u === '校內吃什麼') return { text: '🏫 校內推薦：' + getRandomFood('校內'), quickReply: bA() };
  
  if (u === '個人點名統計') {
    var n = getAssistantNames();
    if (!n.length) return { text: '⚠️ 目前無法讀取助理名單，請確認試算表設定或稍後再試。', quickReply: bA() };
    return { text: '📊 查詢個人點名統計\n請輸入「點名 姓名」，例如：點名 林宇俊', quickReply: bA() };
  }
  if (u === '代班查詢') {
    var n = getAssistantNames();
    if (!n.length) return { text: '⚠️ 目前無法讀取助理名單，請確認試算表設定或稍後再試。', quickReply: bA() };
    return { text: '📋 查詢代班紀錄\n請輸入「代班 姓名」，例如：代班 林宇俊', quickReply: bA() };
  }
  if (u === '認證' || u === '認證進度') {
    var n = getAssistantNames();
    if (!n.length) return { text: '⚠️ 目前無法讀取助理名單，請確認試算表設定或稍後再試。', quickReply: bA() };
    return { text: '📋 查詢個人認證進度\n請輸入「認證 姓名」，例如：認證 林宇俊', quickReply: bA() };
  }
  if (u === '考試結果') {
    var n = getAssistantNames();
    if (!n.length) return { text: '⚠️ 目前無法讀取助理名單，請確認試算表設定或稍後再試。', quickReply: bA() };
    return { text: '📋 查詢考試結果\n請輸入「考試結果 姓名」，例如：考試結果 林宇俊', quickReply: bA() };
  }
  // ===== 前綴比對（實際查詢）=====
  var ap = ['點名統計', '個人點名', '點名'];
  var sp = ['代班查詢', '代班紀錄', '代班'];
  var cp = ['認證進度', '認證', '缺考', '進度'];
  var ep = ['考試結果', '成績', '結果'];
  if ((m = matchPrefix(u, ap)).matched) return handleQuery(m.rest, 'att');
  if ((m = matchPrefix(u, sp)).matched) return handleQuery(m.rest, 'sub');
  if ((m = matchPrefix(u, cp)).matched) return handleQuery(m.rest, 'cert');
  if ((m = matchPrefix(u, ep)).matched) return handleQuery(m.rest, 'exam');

  // ===== 導航選單 =====
  var nav = {
    '主選單': getMainMenu,
    '對外學生': getExternalMainMenu,
    '對外更多': getExternalMoreMenu,
    '中心助理': getInternalMainMenu,
    '助理更多': getInternalMoreMenu,
    '助理排程': getInternalScheduleMenu,
    '助理工具': getInternalToolsMenu,
    '講義區': getInternalResourcesMenu,
    '講義文件': getInternalDocuments,
    '講義影片攝影': function(){return getInternalVideoResources('講義影片攝影');},
    '講義影片燈光': function(){return getInternalVideoResources('講義影片燈光');},
    '講義影片聲音': function(){return getInternalVideoResources('講義影片聲音');},
    '講義影片影棚': function(){return getInternalVideoResources('講義影片影棚');},
    '請假選項': getLeaveOptionsMenu,
    '請假': getLeaveOptionsMenu,
    '查詢': getQueryTypeMenu,
    '常用連結': getCommonLinks,
    '全體點名統計': () => ({ text: getAllCombinedStats(), quickReply: bA() })
  };
  if (nav[u]) return nav[u]();

  // ===== 統一資訊回覆 =====
  var uni = getUnifiedReply(u);
  if (uni) return uni;

  // ===== 綁定檢查與預設回覆 =====
  if (!isUserBound(i)) {
    return { text: '💡 提醒：您尚未綁定姓名！請輸入「我是 您的姓名」完成綁定，才能接收個人化通知。\n\n例如：我是 徐嘉翔', quickReply: qr([{ label: '🔙 回主選單', text: '主選單' }]) };
  }

  if (u.includes('學長') || u.includes('好強')) return { text: ['學長、、', '學姊、、'][Math.random() * 2 | 0], quickReply: qr([{ label: '🔙 回主選單', text: '主選單' }]) };
  if (u.includes('加油')) return { text: ['好強', '真強', '怎這強'][Math.random() * 3 | 0], quickReply: qr([{ label: '🔙 回主選單', text: '主選單' }]) };
  return { text: ['怎說', '好強', '真強'][Math.random() * 3 | 0], quickReply: qr([{ label: '🔙 回主選單', text: '主選單' }]) };
}

// ========== doPost / doGet / replyToUser ==========
function doPost(e) {
  try {
    var m = JSON.parse(e.postData.contents);
    var cache = CacheService.getScriptCache(); // 取得快取服務

    for (var ev of m.events) {
      // 1. 【去重檢查】如果是訊息事件，檢查 message.id 是否處理過
      if (ev.type === 'message' && ev.message && ev.message.id) {
        var msgId = ev.message.id;
        if (cache.get(msgId)) {
          continue; // 如果這個 ID 已經在處理中或處理過，跳過這一個 event
        }
        cache.put(msgId, 'true', 60); // 標記此 ID 已處理，效期 60 秒
      }

      var uid = ev.source.userId;
      var tk = ev.replyToken;

      if (ev.type === 'follow') {
        replyToUser(tk, getMainMenu());
      } else if (ev.type === 'message') {
        var rep = null;
        recordUser(uid);

        // 2. 發送 Loading 動畫 (保持你原本的 5 秒設定)
        UrlFetchApp.fetch('https://api.line.me/v2/bot/chat/loading/start', {
          method: 'post',
          headers: {
            'Authorization': 'Bearer ' + CHANNEL_ACCESS_TOKEN,
            'Content-Type': 'application/json'
          },
          payload: JSON.stringify({
            chatId: uid,
            loadingSeconds: 5
          }),
          muteHttpExceptions: true
        });

        // 3. 處理文字與貼圖邏輯
        if (ev.message.type === 'text') {
          var txt = ev.message.text.trim();
          // ck 是你原本的檢查函式 (可能是防洗版邏輯)
          rep = ck(uid, 'text:' + txt) ? '閉嘴' : getReply(txt, uid);
          
        } else if (ev.message.type === 'sticker') {
          var key = 'sticker:' + ev.message.packageId + ':' + ev.message.stickerId;
          rep = ck(uid, key) ? '閉嘴' : { 
            text: '怎說', 
            quickReply: qr([
              { label: '👨‍🎓 對外學生', text: '對外學生' }, 
              { label: '👩‍💼 中心助理', text: '中心助理' }
            ]) 
          };
        }

        // 4. 回覆使用者
        if (rep) {
          replyToUser(tk, rep);
        }
      }
    }
  } catch (err) {
    Logger.log("doPost 發生錯誤: " + err);
  }
  return ContentService.createTextOutput('OK');
}
function doGet(){return ContentService.createTextOutput('OK');}
function replyToUser(t,c){var msg=typeof c==='string'?[{type:'text',text:c}]:[{type:'text',text:c.text,quickReply:c.quickReply}];UrlFetchApp.fetch('https://api.line.me/v2/bot/message/reply',{method:'post',headers:{Authorization:'Bearer '+CHANNEL_ACCESS_TOKEN,'Content-Type':'application/json'},payload:JSON.stringify({replyToken:t,messages:msg}),muteHttpExceptions:true});}

// ========== 安裝觸發器 ==========
function installTrigger() {
  var triggers = ScriptApp.getProjectTriggers();
  
  var hasMasterEdit = triggers.some(t => t.getHandlerFunction() === 'onMasterSheetEdit');
  if (!hasMasterEdit) {
    ScriptApp.newTrigger('onMasterSheetEdit')
      .forSpreadsheet(MASTER_SHEET_ID)
      .onEdit()
      .create();
    Logger.log('onMasterSheetEdit 觸發器安裝成功');
  }

  var hasTaskEdit = triggers.some(t => t.getHandlerFunction() === 'onTaskSheetEdit');
  if (!hasTaskEdit) {
    ScriptApp.newTrigger('onTaskSheetEdit')
      .forSpreadsheet(TASK_SHEET_ID)
      .onEdit()
      .create();
    Logger.log('onTaskSheetEdit 觸發器安裝成功');
  }

  Logger.log('請記得手動設定以下觸發器：');
  Logger.log('1. onLeaveFormSubmit → 來源：' + LEAVE_SHEET_ID + '，事件：表單提交時');
  Logger.log('2. onRetestFormSubmit → 來源：' + RETEST_SHEET_ID + '，事件：表單提交時');
  Logger.log('3. onAvailabilityFormSubmit → 來源：' + AVAILABILITY_SHEET_ID + '，事件：表單提交時');
  Logger.log('4. 射龍門每週結算觸發器請手動執行 setupWeeklyTrigger() 一次。');
}

// Node.js entry points. Apps Script's doPost/installTrigger are intentionally
// replaced by Express routes and the Railway scheduler in server.js.
module.exports = {
  getReply,
  getMainMenu,
  recordUser,
  sendTomorrowTaskReminders,
  calculateWeeklyGodOfGamblers,
  onLeaveFormSubmit,
  onRetestFormSubmit,
  onAvailabilityFormSubmit,
  onMasterSheetEdit,
  onTaskSheetEdit
};
