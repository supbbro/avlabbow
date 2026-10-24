'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const externalGroupSync = require('../src/external-group-sync');

const HEADER = ['紀錄ID','任務ID','日期','開始時間','階段','器材','學生ID','學生姓名','學號','出席狀態','簡答題結果','上機結果','總結果','操作考官','考官LINE User ID','記錄時間','累計簡答題結果','累計上機結果','保證金狀態'];

function examLog(id, equipment, name, studentId, shortAnswer, practical, recordedAt) {
  const row = Array(19).fill('');
  Object.assign(row, {
    0: id,
    4: '考試',
    5: equipment,
    7: name,
    8: studentId,
    9: '到場',
    10: shortAnswer,
    11: practical,
    12: shortAnswer === '通過' && practical === '通過' ? '全部通過' : '未通過',
    15: recordedAt,
    16: shortAnswer,
    17: practical,
    18: shortAnswer === '通過' && practical === '通過' ? '可退保證金' : '不可退保證金'
  });
  return row;
}

test('certification sync matches by student number and appends missing A7S3 exam takers', () => {
  const matrix = [
    ['姓名', '系級', '學號', '課程', '帳號', '組別', 'H6考試', 'a7sIII考試'],
    ['說明', '', '', '更新日期：10/15 11:20'],
    ['認證表姓名', '', '113405001', '測試課程', '', '第一組']
  ];
  const logs = [
    HEADER,
    examLog('1', 'A7S3', '點名姓名不同', '113405001', '通過', '通過', '10/15/2026 12:00:00'),
    examLog('2', 'A7S3', '新增學生', '113405002', '通過', '未通過', '10/15/2026 12:30:00')
  ];

  const plan = externalGroupSync._test.planCertificationColors(matrix, logs, new Date('2026-10-15T15:00:00+08:00'));

  assert.deepEqual(plan.missing.map(item => [item.rowIndex, item.name, item.studentId]), [[3, '新增學生', '113405002']]);
  assert.deepEqual(plan.updates.map(update => [update.rowIndex, update.name, update.studentId, update.equipment, update.colorStatus]), [
    [2, '認證表姓名', '113405001', 'A7S3', '新通過'],
    [3, '新增學生', '113405002', 'A7S3', '新待補考']
  ]);
});

test('manual all-pass correction overrides stale cumulative timeout result', () => {
  const matrix = [
    ['姓名', '系級', '學號', '課程', '帳號', '組別', '導播台考試'],
    ['說明', '', '', '更新日期：10/16 21:50'],
    ['測試學生', '', '113405001', '測試課程', '', '第一組']
  ];
  const row = examLog('1', '導播台', '測試學生', '113405001', '通過', '通過', '10/21/2026 12:15:07');
  row[13] = '超過 10 分鐘未到';
  row[16] = '未通過';
  row[17] = '未通過';
  row[18] = '不可退保證金（超過 10 分鐘未到）';

  const plan = externalGroupSync._test.planCertificationColors(matrix, [HEADER, row], new Date('2026-10-21T13:00:00+08:00'));

  assert.deepEqual(plan.updates.map(update => [update.rowIndex, update.equipment, update.colorStatus]), [
    [2, '導播台', '新通過']
  ]);
});

test('Teradek wireless-follow aliases match the wireless follow-focus matrix column', () => {
  assert.equal(externalGroupSync._test.canonicalEquipment('Teradek無線追'), '無線追焦組');
  assert.equal(externalGroupSync._test.canonicalEquipment('terek無限追'), '無線追焦組');
  assert.equal(externalGroupSync._test.canonicalEquipment('無限追'), '無線追焦組');
  assert.equal(externalGroupSync._test.canonicalEquipment('Teradek圖傳考試'), 'TERADEK圖傳');
  assert.equal(externalGroupSync._test.canonicalEquipment('無線追焦組'), '無線追焦組');
});

test('CX350 exam results map to the current studio-camera certification column', () => {
  assert.equal(externalGroupSync._test.canonicalEquipment('CX350'), '棚內機');
  assert.equal(externalGroupSync._test.canonicalEquipment('CX350考試'), '棚內機');
  assert.equal(externalGroupSync._test.canonicalEquipment('棚內機考試'), '棚內機');
});
