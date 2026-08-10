var PROF_ID = 'lespt0430';
var PROF_PW = 'CHANGE_ME';
var SHEET_NAME = '결과';
var HEADER = ['제출시각', '분반', '학번', '이름', '환자번호', '환자명', '주호소', '문진(10)', '검사(10)', '진단(10)', '치료(10)', '총점(40)', '진단정답', '선택한 진단', '선택한 치료', '시행검사수', '누락필수검사', '문진질문수', 'PC식별자'];
var KEYS = ['submittedAt', 'className', 'studentId', 'student', 'patientId', 'patientName', 'condition', 'histScore', 'examScore', 'dxScore', 'txScore', 'total', 'dxCorrect', 'dxChosen', 'txChosen', 'examCount', 'examMissed', 'chatTurns', 'clientId'];
function sheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(SHEET_NAME);
    sh.appendRow(HEADER);
    sh.setFrozenRows(1);
    return sh;
  }
  if (sh.getMaxColumns() < HEADER.length) {
    sh.insertColumnsAfter(sh.getMaxColumns(), HEADER.length - sh.getMaxColumns());
  }
  var head = sh.getRange(1, 1, 1, HEADER.length).getValues()[0];
  var same = true;
  for (var i = 0; i < HEADER.length; i++) {
    if (String(head[i]).trim() !== HEADER[i]) { same = false; break; }
  }
  if (!same) {
    var stamp = Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyyMMdd_HHmm');
    sh.setName(SHEET_NAME + '_이전_' + stamp);
    sh = ss.insertSheet(SHEET_NAME);
    sh.appendRow(HEADER);
    sh.setFrozenRows(1);
  }
  return sh;
}
function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
function num_(v) {
  return (typeof v === 'number' && isFinite(v)) ? v : '';
}
function doPost(e) {
  try {
    var req = JSON.parse(e.postData.contents);
    if (req.action === 'submit') {
      var r = req.row || {};
      var lock = LockService.getScriptLock();
      lock.waitLock(30000);
      try {
        sheet_().appendRow([
          r.submittedAt || new Date().toISOString(), r.className || '',
          r.studentId || '', r.student || '',
          r.patientId || '', r.patientName || '', r.condition || '',
          num_(r.histScore), num_(r.examScore), num_(r.dxScore), num_(r.txScore), num_(r.total),
          r.dxCorrect || '', r.dxChosen || '', r.txChosen || '',
          num_(r.examCount), num_(r.examMissed), num_(r.chatTurns), r.clientId || ''
        ]);
      } finally {
        lock.releaseLock();
      }
      return json_({ ok: true });
    }
    if (req.action === 'list') {
      if (req.user !== PROF_ID || req.pw !== PROF_PW) {
        return json_({ ok: false, error: '아이디 또는 비밀번호가 맞지 않습니다.' });
      }
      var values = sheet_().getDataRange().getValues();
      var rows = values.slice(1).map(function (v) {
        var o = {};
        for (var i = 0; i < KEYS.length; i++) {
          o[KEYS[i]] = (v[i] instanceof Date) ? v[i].toISOString() : v[i];
        }
        return o;
      });
      return json_({ ok: true, rows: rows });
    }
    return json_({ ok: false, error: '알 수 없는 요청입니다.' });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}
function doGet() {
  return json_({ ok: true, msg: '가상환자시뮬레이션 수집기가 동작 중입니다.' });
}
