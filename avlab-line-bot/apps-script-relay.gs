// Optional: keep Google Sheets edit/form triggers and forward only their event
// data to Railway. Set RAILWAY_URL and AUTOMATION_SECRET in Script Properties.
function relay_(path, body) {
  var props = PropertiesService.getScriptProperties();
  UrlFetchApp.fetch(props.getProperty('RAILWAY_URL') + '/automation/' + path, {
    method: 'post',
    contentType: 'application/json',
    headers: { 'x-automation-secret': props.getProperty('AUTOMATION_SECRET') },
    payload: JSON.stringify(body),
    muteHttpExceptions: true
  });
}

function onLeaveFormSubmit(e) {
  relay_('leave-submit', { sheetName: e.range.getSheet().getName(), values: e.values });
}
function onRetestFormSubmit(e) {
  relay_('retest-submit', { sheetName: e.range.getSheet().getName(), values: e.values });
}
function onAvailabilityFormSubmit(e) {
  relay_('availability-submit', { sheetName: e.range.getSheet().getName(), values: e.values });
}
function onMasterSheetEdit(e) {
  relay_('master-edit', { sheetName: e.range.getSheet().getName(), row: e.range.getRow(), column: e.range.getColumn(), value: e.value, oldValue: e.oldValue });
}
function onTaskSheetEdit(e) {
  relay_('task-edit', { sheetName: e.range.getSheet().getName(), row: e.range.getRow(), column: e.range.getColumn(), value: e.value, oldValue: e.oldValue });
}
