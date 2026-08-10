// 가상환자시뮬레이션 — 결과 수집기
// 아래 두 줄만 교수님이 쓰실 값으로 바꾸세요.
const PROF_ID = 'prof';            // 교수 아이디
const PROF_PW = '여기에_비밀번호';   // 교수 비밀번호 (학생에게 알려주지 마세요)

const SHEET_NAME = '결과';
const HEADER = ['제출시각', '분반', '학생', '환자번호', '환자명', '주호소',
  '문진(10)', '검사(10)', '진단(10)', '치료(10)', '총점(40)',
  '진단정답', '선택한 진단', '선택한 치료', '시행검사수', '누락필수검사',
  '문진질문수', 'PC식별자'];

function sheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(SHEET_NAME);
    sh.appendRow(HEADER);
    sh.setFrozenRows(1);
  }
  return sh;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// 값이 비어 있어도 appendRow 가 실패하지 않게 다듬는다
function num_(v) { return (typeof v === 'number' && isFinite(v)) ? v : ''; }

function doPost(e) {
  try {
    const req = JSON.parse(e.postData.contents);

    if (req.action === 'submit') {
      const r = req.row || {};
      // 한 반이 동시에 채점을 끝내면 doPost 가 여러 개 동시에 돈다.
      // 잠그지 않으면 서로 같은 줄에 써서 결과가 사라진다 (실제로 재현됨).
      const lock = LockService.getScriptLock();
      lock.waitLock(30000);
      try {
        sheet_().appendRow([
          r.submittedAt || new Date().toISOString(), r.className || '', r.student || '',
          r.patientId || '', r.patientName || '', r.condition || '',
          num_(r.histScore), num_(r.examScore), num_(r.dxScore), num_(r.txScore), num_(r.total),
          r.dxCorrect || '', r.dxChosen || '', r.txChosen || '',
          num_(r.examCount), num_(r.examMissed), num_(r.chatTurns), r.clientId || '',
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
      const values = sheet_().getDataRange().getValues();
      const keys = ['submittedAt', 'className', 'student', 'patientId', 'patientName',
        'condition', 'histScore', 'examScore', 'dxScore', 'txScore', 'total',
        'dxCorrect', 'dxChosen', 'txChosen', 'examCount', 'examMissed',
        'chatTurns', 'clientId'];
      const rows = values.slice(1).map(function (v) {
        const o = {};
        keys.forEach(function (k, i) {
          o[k] = (v[i] instanceof Date) ? v[i].toISOString() : v[i];
        });
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
