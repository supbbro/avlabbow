'use strict';

const ids = {
  task: process.env.INTERNAL_TASK_FILE_ID || '1MDIpAfU2LYiv9LAduSDRDlh4vkgL6e5z',
  master: '1iqzwP74yZtlxcy2qnJ8y1NvMCUdlNDP73CaQECVZodY',
  leave: '1A0wZWctAbihNzNi3Ji0CVW6at024QQQDnNzdQP1K2XI',
  external: '1UGoTWRq59rNatZn5ZUYRu-reiYiRquI2GREeWDsf5sU',
  assistant: '1n5-GLLMxCORCwNqne2nLzplC16n9YPfbKlU2oxzuCp0',
  cert: '1R-3NyQ24se2jWE-YunOGXKu2sc4bpBHzE7tmI4RCWD0',
  retest: '1H5kVv2AOtasMvS-YBBtjG_TYyiV09b3al586jbeB8Zc',
  game: '1fGQiWWbfiuX5i_ADm5p95aPgZP0jTXGxPyrBQvqoOmQ',
  schedule: '1UauuYQcPHQrYKQLIhFidem1x_UO0PxUICu_v7Tqy4GU',
  externalClassSchedule: process.env.EXTERNAL_CLASS_SCHEDULE_ID || '1oaEKt3JVxcdy8yPBGZAuRh3lkhnvRoIJ9rTNbj-Gh9I',
  externalResults: process.env.EXTERNAL_RESULTS_SHEET_ID || '1WXeO6VF-emmoP_07tzsGk5z0WGSU7aFLbtbT0ImYACg'
};

const workbooks = {
  [ids.task]: ['1151 對內教學官／考官安排'],
  [ids.master]: ['教學考試點名和通過情況總表', '用戶綁定', '最終排班結果'],
  [ids.leave]: ['表單回覆 1'],
  [ids.external]: ['表單回覆 1'],
  [ids.assistant]: ['助理名單'],
  [ids.cert]: ['工作表1'],
  [ids.retest]: ['表單回覆 1'],
  [ids.game]: ['玩家資料', '交易紀錄', '池底紀錄', '稱號紀錄', '系統狀態'],
  [ids.schedule]: ['對外考試排程', '表單回覆 1'],
  [ids.externalClassSchedule]: ['教學週分班表I', '教學週分班表II', '考試週分班表I', '考試週分班表II', '第一次補考週分班表', '第二次補考週分班表'],
  [ids.externalResults]: ['對外任務', '任務學生', 'LINE點名紀錄', 'LINE群組設定']
};

const excelWorkbookIds = new Set([ids.task]);

module.exports = { ids, workbooks, excelWorkbookIds, timezone: process.env.TZ || 'Asia/Taipei' };
