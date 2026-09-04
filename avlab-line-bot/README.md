# 影音實驗室 LINE Bot（Railway + Node.js + Google Sheets）

這個專案把原本的 Google Apps Script 主程式搬到 Railway。Express 接收 LINE webhook，Google Sheets API 讀寫原本的試算表；原有選單、查詢、姓名綁定、點名、認證、排班、通知與射龍門邏輯保留在 `src/legacy-bot.js`。

## 架構

```text
LINE Messaging API ──POST /webhook──> Railway / Node.js
                                           │
                                           ├── Google Sheets API（資料與遊戲狀態）
                                           ├── LINE Reply / Push API
                                           └── Railway 內建排程檢查

Google Sheets 編輯/表單提交 ──Apps Script relay──> POST /automation/*
```

## 1. 安全處理（先做）

原始貼文中的 Channel access token 已曝光。請到 LINE Developers：

1. 進入 Provider → Channel → Messaging API。
2. Reissue（重發）Channel access token。
3. 舊 token 不要再使用，也不要提交到 Git。

## 2. 建立 Google 服務帳號

1. 在 Google Cloud 建立專案並啟用 **Google Sheets API** 與 **Google Drive API**。
2. 建立 Service Account，下載 JSON key。
3. 找出 JSON 的 `client_email`。
4. 把 `src/config.js` 內列出的每一份試算表分享給該 email，權限設為「編輯者」。

服務帳號不會自動繼承你個人帳號的 Drive 權限；少分享任何一份表，整個請求都可能因 403/404 失敗。

## 3. 本機設定與啟動

```bash
cp .env.example .env
npm install
npm start
```

把 `.env` 填好。`GOOGLE_SERVICE_ACCOUNT_JSON` 可以直接放單行 JSON，也可放 JSON 的 Base64；若 Railway 對多行內容處理不便，使用 Base64 最省事。

健康檢查：

```bash
curl http://localhost:3000/health
```

## 4. 部署 Railway

1. 將 `avlab-line-bot` 資料夾推到 GitHub repo（或把它設為 repo root）。
2. Railway → New Project → Deploy from GitHub Repo。
3. 若 repo 上層還有其他檔案，將 Railway 的 Root Directory 設為 `/avlab-line-bot`。
4. 在 Variables 新增：
   - `LINE_CHANNEL_ACCESS_TOKEN`
   - `LINE_CHANNEL_SECRET`
   - `GOOGLE_SERVICE_ACCOUNT_JSON`
   - `AUTOMATION_SECRET`（長隨機字串）
   - `EXTERNAL_RESULTS_SHEET_ID=1WXeO6VF-emmoP_07tzsGk5z0WGSU7aFLbtbT0ImYACg`
   - `EXTERNAL_EXAMINER_CHANGE_RESPONSE_ID=1sk5uQakzuqKzU97hxgCMtJKpwAL1eBTfWW0gN_oNCO8`
   - `EXTERNAL_CLASS_SCHEDULE_ID=1oaEKt3JVxcdy8yPBGZAuRh3lkhnvRoIJ9rTNbj-Gh9I`
   - `INTERNAL_TASK_FILE_ID=1MDIpAfU2LYiv9LAduSDRDlh4vkgL6e5z`
   - `INTERNAL_ATTENDANCE_SHEET_ID=15INDclJDJSXKlXNDh2x50zbfeSi9hsGO8TKaJXjvlWo`
   - `INTERNAL_CERTIFICATION_SHEET_ID=1vUnpcRVsQmUH9zjqic8KFf5IlGk0E5GSH-rkhBGE7bk`
   - `ACADEMIC_TERM=1151`
   - `TZ=Asia/Taipei`
   - `SHEETS_CACHE_TTL_MS=60000`（選用；預設快取 60 秒，降低 LINE 回覆延遲）
   - `SHEETS_METADATA_CACHE_TTL_MS=600000`（選用；分頁結構預設快取 10 分鐘）
5. Generate Domain。部署後確認 `https://你的網域/health` 回傳 `{"ok":true,...}`。

`PORT` 由 Railway 自動提供，不要寫死。

## 5. 設定 LINE webhook

在 LINE Developers → Messaging API：

1. Webhook URL 設為 `https://你的網域/webhook`。
2. 按 Verify。
3. 開啟 Use webhook。
4. 建議關閉 LINE Official Account Manager 內建的自動回覆，避免一則訊息收到兩份回答。

## 6. Google 表單與試算表編輯事件

Railway 可取代 Apps Script 的 LINE webhook 和時間排程，但 Google Sheets API 不會在表單提交或人工編輯時主動通知 Railway。因此保留一個很薄的 Apps Script relay：

1. 將 `apps-script-relay.gs` 貼進原 Apps Script 專案。
2. 在 Apps Script → 專案設定 → 指令碼屬性新增：
   - `RAILWAY_URL`：例如 `https://你的網域`（結尾不要 `/`）
   - `AUTOMATION_SECRET`：與 Railway 完全相同
3. 安裝觸發條件：
   - `onLeaveFormSubmit`：請假回覆表，提交表單時
   - `onExternalExaminerChangeFormSubmit`：對外考官更動回覆表，提交表單時
   - `onRetestFormSubmit`：補考回覆表，提交表單時
   - `onAvailabilityFormSubmit`：可用時間回覆表，提交表單時
   - `onMasterSheetEdit`：點名總表，編輯時

不要再把舊的 Apps Script `doPost` 部署為 LINE webhook，否則可能重複處理。

## 7. 排程

Railway 常駐程序會以台北時間執行：

- 每分鐘：檢查對內任務，在任務當週星期一 09:00 與任務當日 09:00 各提醒一次。
- 每分鐘：檢查已綁定的教學群組；週一 09:00 推播本週 1151 教學總排程，每天 09:00 推播當日排程。
- 每天 20:00：保留舊版明日任務提醒。
- 每週一 01:00：結算射龍門「賭神」。
- 每分鐘：檢查對外任務的一小時提醒。

若 Railway 服務被手動暫停或方案會休眠，停機期間不會補跑排程。需要保證執行時，可另用 Railway Cron 建立獨立 job endpoint；目前版本適合常駐服務。

## 檔案說明

- `src/server.js`：Express、LINE 驗簽、webhook、排程與 automation endpoints。
- `src/runtime.js`：Apps Script API 到 Google Sheets API 的相容層。
- `src/external-teaching.js`：群組綁定、對外任務提醒、點名與考試結果登記。
- `src/internal-teaching.js`：對內週一／當日提醒、點名表入口與逐器材認證同步。
- `src/legacy-bot.js`：原有機器人商業邏輯（token 已改讀環境變數）。
- `src/config.js`：試算表 ID 與工作表名稱。
- `apps-script-relay.gs`：Google 編輯/表單觸發器的選用轉送器。
- `railway.json`：Railway build、啟動、health check 設定。

## 常見錯誤

- `The caller does not have permission`：某份試算表尚未分享給 Service Account。
- `Google Drive API ... is disabled`：到 Google Cloud 專案啟用 Google Drive API；對內考官表是 Excel，必須透過 Drive API 下載後解析。
- `Invalid signature`：Railway 的 `LINE_CHANNEL_SECRET` 不是該 Messaging API channel 的 secret。
- LINE Verify 成功但無回覆：查看 Railway logs；最常見是 Google key 的換行或 Sheets 權限問題。
- automation 回傳 401：Apps Script 與 Railway 的 `AUTOMATION_SECRET` 不一致。

## 對外教學點名

程式使用原生試算表「1151 修課名單與考試結果（LINE 點名版）」中的四個分頁：

- `對外任務`：一列一個教學／考試任務，正式任務狀態填「已排定」。
- `任務學生`：用任務 ID 將學生連到任務。
- `LINE點名紀錄`：機器人寫入出席、簡答、上機與總結果。
- `LINE群組設定`：保存教學總排程群組與提醒設定。

任務、考官與學生不需要重複手動輸入。程式會用 `EXTERNAL_CLASS_SCHEDULE_ID` 讀取分班表中的：

- `教學週分班表I`
- `教學週分班表II`
- `考試週分班表I`
- `考試週分班表II`
- `第一次補考週分班表`
- `第二次補考週分班表`

每次查詢任務、開始點名與每分鐘提醒檢查前，程式會依日期、時間、器材欄、考官欄及其下方學生名單同步到程式專用分頁。來源試算表可改檔名或移動資料夾，因為連線依據是 spreadsheet ID；不要刪除後另建不同 ID 的檔案，也不要任意更改上述分頁名稱與列標籤「時間／項目／地點／教學官／考官／學生」。

教學總排程群組指令：

- `綁定教學群組 群組名稱`
- `本週教學排程`
- `今日教學排程`
- `解除教學群組`

提醒會一併附上排程儲存格中的普通超連結、局部文字連結與 Google Drive／文件智慧型方塊連結。

對外任務可在私訊輸入 `近期任務` 或 `對外任務` 查詢；`同步對外排程` 為管理與除錯用。

考官需先私訊機器人輸入 `我是 姓名`，且姓名需與分班表的「教學官／考官」相符。考官可在私訊輸入 `近期任務` 查看自己的任務；任務開始前 1 小時，機器人會私訊考官，並向已綁定的 LINE 群組推播任務與考生名單。提醒訊息中的「開始聊天室點名」會開啟可左右滑動的點名卡，每位考生都有「準時／遲到／缺席」按鈕；考試任務接著登記通過結果，完成後可由「查看考生認證狀態」開啟結果表。如果 LINE 拒絕顯示卡片，程式會自動改送純文字與點名按鈕。既有管理員與群組設定中的管理員也可以操作點名。

`_TEMPLATE` 開頭的示範列只用來維持原生表格欄位型別與下拉選單，程式會自動忽略。
