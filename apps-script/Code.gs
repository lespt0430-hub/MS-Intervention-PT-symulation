var PROF_ID = 'lespt0430';
var PROF_PW = 'CHANGE_ME';
var SHEET_NAME = '결과';

// AI 문진 중계 —— 학생 브라우저에 키를 심지 않기 위한 장치.
//
// 정적 사이트(GitHub Pages)라 소스가 그대로 공개된다. 키를 config.js 에 적으면
// 학생 누구나 소스 보기로 꺼내 갈 수 있다. 그래서 키는 이 스크립트의
// '스크립트 속성'에만 두고, 학생 브라우저는 여기로 질문만 보낸다.
//
//   Apps Script 편집기 → 왼쪽 ⚙ 프로젝트 설정 → 스크립트 속성 →
//   속성 GEMINI_KEY / 값 (발급받은 키) 저장
//
// 키를 넣지 않으면 AI 문진은 그냥 꺼진 채로 동작한다(내장 답변 모드).
// 가벼운 모델이 기본이다. 'latest' 계열은 답 쓰기 전에 생각을 오래 하고
// 붐빌 때는 아예 응답하지 않아, 문진 한 마디에 30초를 넘기는 일이 있었다.
var GEMINI_DEFAULT_MODEL = 'gemini-flash-lite-latest';
function geminiKey_() {
  return (PropertiesService.getScriptProperties().getProperty('GEMINI_KEY') || '').trim();
}
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
    // AI 문진 사용 가능 여부 — 학생 화면이 시작할 때 물어본다 (키는 알려주지 않는다)
    if (req.action === 'ai_status') {
      return json_({ ok: true, ai: geminiKey_().length > 0 });
    }
    // AI 문진 켜기/끄기 — 교수만. 키는 여기(스크립트 속성)에만 저장된다.
    //
    // 이 통로가 있어야 교수님이 Apps Script 편집기를 열지 않고도 웹 화면에서
    // 학기 시작에 켜고 학기 끝에 끌 수 있다. 키가 저장소나 학생 브라우저로
    // 내려가지 않는 것이 핵심이다.
    if (req.action === 'ai_set') {
      if (req.user !== PROF_ID || req.pw !== PROF_PW) {
        return json_({ ok: false, error: '아이디 또는 비밀번호가 맞지 않습니다.' });
      }
      var props = PropertiesService.getScriptProperties();
      if (req.enable === false) {
        props.deleteProperty('GEMINI_KEY');
        return json_({ ok: true, ai: false });
      }
      var newKey = String(req.key || '').trim();
      if (!newKey) return json_({ ok: false, error: 'API 키를 입력하세요.' });
      // 저장 전에 실제로 되는 키인지 확인한다 — 오타를 켜 둔 채 수업에 들어가면
      // 학생 열두 명이 동시에 "AI 오류"를 보게 된다.
      var probe = UrlFetchApp.fetch(
        'https://generativelanguage.googleapis.com/v1beta/models?pageSize=1&key=' +
        encodeURIComponent(newKey), { muteHttpExceptions: true });
      if (probe.getResponseCode() !== 200) {
        var pe = {};
        try { pe = JSON.parse(probe.getContentText() || '{}'); } catch (x) {}
        return json_({ ok: false,
          error: '이 키로 Gemini 에 접속하지 못했습니다 — ' +
                 ((pe.error && pe.error.message) || probe.getResponseCode()) });
      }
      props.setProperty('GEMINI_KEY', newKey);
      return json_({ ok: true, ai: true });
    }
    // AI 문진 중계 — 학생 브라우저 대신 여기서 Gemini 를 부른다
    if (req.action === 'ai') {
      var key = geminiKey_();
      if (!key) {
        return json_({ ok: false, error: '교수 Gemini 키가 설정되지 않았습니다 (스크립트 속성 GEMINI_KEY).' });
      }
      var model = String(req.model || GEMINI_DEFAULT_MODEL).replace(/[^a-zA-Z0-9._-]/g, '');
      var body = {
        system_instruction: { parts: [{ text: String(req.system || '') }] },
        contents: (req.messages || []).map(function (m) {
          return {
            role: m.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: String(m.content || '') }],
          };
        }),
        generationConfig: {
          maxOutputTokens: Math.min(8192, Number(req.maxTokens) || 1024),
          temperature: 0.7,
        },
      };
      if (req.jsonMode) body.generationConfig.responseMimeType = 'application/json';
      var res = UrlFetchApp.fetch(
        'https://generativelanguage.googleapis.com/v1beta/models/' + model +
        ':generateContent?key=' + encodeURIComponent(key),
        { method: 'post', contentType: 'application/json',
          payload: JSON.stringify(body), muteHttpExceptions: true });
      var out = JSON.parse(res.getContentText() || '{}');
      if (res.getResponseCode() !== 200) {
        return json_({ ok: false, error: (out.error && out.error.message) || ('API 오류 ' + res.getResponseCode()) });
      }
      var cand = (out.candidates || [])[0];
      var parts = cand && cand.content && cand.content.parts;
      if (!parts || !parts.length) {
        return json_({ ok: false, error: '응답이 비어 있습니다' + (cand && cand.finishReason ? ' (' + cand.finishReason + ')' : '') });
      }
      var text = parts.map(function (p) { return p.text || ''; }).join('');
      return json_({ ok: true, text: text });
    }
    return json_({ ok: false, error: '알 수 없는 요청입니다.' });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}
function doGet() {
  return json_({ ok: true, msg: '가상환자시뮬레이션 수집기가 동작 중입니다.' });
}
