// ════════════════════════════════════════════════════════════
//  ① 여기 세 줄만 고치면 됩니다
// ════════════════════════════════════════════════════════════

var PROF_ID = 'lespt0430';        // 교수 모드 로그인 아이디
var PROF_PW = 'CHANGE_ME';        // ← 반드시 실제 비밀번호로 바꾸세요

// 결과를 적을 구글 시트.
//   · 시트에서 [확장 프로그램 → Apps Script] 로 만든 스크립트라면 비워 두세요.
//   · 별도 프로젝트로 만들었다면 시트 주소의 가운데 긴 문자열을 넣으세요.
//     https://docs.google.com/spreadsheets/d/<< 이 부분 >>/edit
//
// 예전에는 getActiveSpreadsheet() 만 썼는데, 그건 시트에 붙어 있는
// 스크립트에서만 동작한다. 별도 프로젝트로 만들면 null 이 돌아와 배포는
// 되는데 모든 요청이 오류가 났다 — 원인을 찾기 어려운 실패였다.
var SHEET_ID = '';

var SHEET_NAME = '결과';          // 시트 안의 탭 이름

// 이 스크립트의 판 번호. 웹 화면이 "지금 배포된 스크립트가 이 기능을 아는가"
// 를 확인하는 데 쓴다. 예전 판이 배포돼 있으면 화면에서 미리 알려 주고
// 안 되는 버튼을 잠근다 — 눌러 보고 나서야 아는 것보다 낫다.
// 기능을 더할 때마다 1 씩 올린다.
var SCRIPT_VERSION = 3;

// ════════════════════════════════════════════════════════════
//  ② 아래는 건드리지 않아도 됩니다
// ════════════════════════════════════════════════════════════

// 편집기에서 이 함수를 골라 [실행] 을 누르면 설정이 맞는지 알려 준다.
// 배포하기 전에 한 번 돌려 보면 "배포는 됐는데 왜 안 되지" 를 피할 수 있다.
// (실행 로그는 편집기 아래 '실행 로그' 에 뜬다)
function 설정확인() {
  var out = [];
  try {
    var sh = sheet_();
    out.push('✓ 시트 연결됨 — ' + sh.getParent().getName() + ' / 탭 「' + sh.getName() + '」');
  } catch (e) {
    out.push('✗ 시트에 연결하지 못했습니다: ' + e);
    out.push('   → 시트에 붙은 스크립트가 아니라면 위 SHEET_ID 를 채우세요.');
  }
  out.push(PROF_PW === 'CHANGE_ME'
    ? '✗ PROF_PW 가 아직 CHANGE_ME 입니다 — 실제 비밀번호로 바꾸세요.'
    : '✓ 교수 비밀번호가 설정돼 있습니다 (아이디: ' + PROF_ID + ')');
  var k = geminiKey_();
  out.push(k
    ? '✓ AI 키가 등록돼 있습니다 (' + aiProvider_() + ', ' + k.length + '자)'
    : '· AI 키는 아직 없습니다 — 웹 화면의 교수 모드에서 「AI 문진 켜기」로 넣으면 됩니다.');
  out.push('');
  out.push('배포 후 확인: 웹앱 주소(/exec)를 브라우저 주소창에 그냥 붙여넣어');
  out.push('{"ok":true,...} 가 보이면 성공입니다. 로그인 화면이 뜨면');
  out.push('배포의 「액세스 권한이 있는 사용자」가 “모든 사용자” 가 아닙니다.');
  Logger.log(out.join('\n'));
  return out.join('\n');
}

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
// 어느 회사 키인지. 저장해 둔 값이 없으면 키 생김새로 알아낸다
// (AIza… = Gemini, sk-ant-… = Claude, sk-… = OpenAI).
function aiProvider_() {
  var saved = (PropertiesService.getScriptProperties().getProperty('AI_PROVIDER') || '').trim();
  if (saved === 'gemini' || saved === 'openai' || saved === 'anthropic') return saved;
  var k = geminiKey_();
  if (/^sk-ant-/.test(k)) return 'anthropic';
  if (/^sk-/.test(k)) return 'openai';
  return 'gemini';
}
// 회사별 '키가 살아 있는지' 확인용 호출. 오타를 켜 둔 채 수업에 들어가면
// 학생 전원이 동시에 AI 오류를 본다.
function aiProbe_(provider, key) {
  if (provider === 'openai') {
    return UrlFetchApp.fetch('https://api.openai.com/v1/models?limit=1',
      { headers: { Authorization: 'Bearer ' + key }, muteHttpExceptions: true });
  }
  if (provider === 'anthropic') {
    return UrlFetchApp.fetch('https://api.anthropic.com/v1/models?limit=1',
      { headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' }, muteHttpExceptions: true });
  }
  return UrlFetchApp.fetch(
    'https://generativelanguage.googleapis.com/v1beta/models?pageSize=1&key=' + encodeURIComponent(key),
    { muteHttpExceptions: true });
}
var HEADER = ['제출시각', '분반', '학번', '이름', '환자번호', '환자명', '주호소', '문진(10)', '검사(10)', '진단(10)', '치료(10)', '총점(40)', '진단정답', '선택한 진단', '선택한 치료', '시행검사수', '누락필수검사', '문진질문수', 'PC식별자'];
var KEYS = ['submittedAt', 'className', 'studentId', 'student', 'patientId', 'patientName', 'condition', 'histScore', 'examScore', 'dxScore', 'txScore', 'total', 'dxCorrect', 'dxChosen', 'txChosen', 'examCount', 'examMissed', 'chatTurns', 'clientId'];
function sheet_() {
  // SHEET_ID 를 적었으면 그 시트를, 안 적었으면 이 스크립트가 붙어 있는 시트를 쓴다.
  var ss = SHEET_ID ? SpreadsheetApp.openById(SHEET_ID) : SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) {
    throw new Error('시트를 찾지 못했습니다. 이 스크립트가 시트에 붙어 있지 않다면 ' +
                    '맨 위 SHEET_ID 에 스프레드시트 주소의 긴 문자열을 넣으세요.');
  }
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
    // 판 번호 확인 — 로그인이 필요 없다. 어떤 기능을 아는지만 알려 준다.
    // 예전 판이 배포돼 있으면 이 요청 자체가 '알 수 없는 요청' 으로 돌아오고,
    // 화면은 그걸로 "새 코드로 다시 배포하세요" 를 안내한다.
    if (req.action === 'ping') {
      return json_({ ok: true, version: SCRIPT_VERSION,
                     actions: ['submit', 'list', 'reset', 'ai_status', 'ai_set', 'ai'] });
    }
    // 전체 기록 초기화 — 교수만. 새 학기·새 분반을 시작할 때 쓴다.
    //
    // 지우지 않고 '보관' 탭으로 밀어낸다. 버튼 하나로 학생 전원의 성적이
    // 사라지는 기능이라, 잘못 눌렀을 때 되돌릴 수 없으면 안 된다.
    // 보관 탭이 쌓이는 것이 기록이 날아가는 것보다 낫다.
    if (req.action === 'reset') {
      if (req.user !== PROF_ID || req.pw !== PROF_PW) {
        return json_({ ok: false, error: '아이디 또는 비밀번호가 맞지 않습니다.' });
      }
      var lock = LockService.getScriptLock();
      lock.waitLock(20000);
      try {
        var sh0 = sheet_();
        var n = Math.max(0, sh0.getLastRow() - 1);       // 머리글 제외
        if (n === 0) return json_({ ok: true, moved: 0, archive: '' });
        var stamp = Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyyMMdd_HHmm');
        var archive = SHEET_NAME + '_보관_' + stamp;
        sh0.setName(archive);
        var ss2 = sh0.getParent();
        var fresh = ss2.insertSheet(SHEET_NAME);
        fresh.appendRow(HEADER);
        fresh.setFrozenRows(1);
        return json_({ ok: true, moved: n, archive: archive });
      } finally {
        lock.releaseLock();
      }
    }
    // AI 문진 사용 가능 여부 — 학생 화면이 시작할 때 물어본다 (키는 알려주지 않는다)
    if (req.action === 'ai_status') {
      return json_({ ok: true, ai: geminiKey_().length > 0, provider: aiProvider_() });
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
        props.deleteProperty('AI_PROVIDER');
        return json_({ ok: true, ai: false });
      }
      var newKey = String(req.key || '').trim();
      if (!newKey) return json_({ ok: false, error: 'API 키를 입력하세요.' });
      // 회사는 화면에서 고른 값을 쓰되, 안 왔으면 키 생김새로 판단한다.
      var prov = String(req.provider || '');
      if (prov !== 'gemini' && prov !== 'openai' && prov !== 'anthropic') {
        prov = /^sk-ant-/.test(newKey) ? 'anthropic' : (/^sk-/.test(newKey) ? 'openai' : 'gemini');
      }
      // 저장 전에 실제로 되는 키인지 확인한다 — 오타를 켜 둔 채 수업에 들어가면
      // 학생 전원이 동시에 "AI 오류"를 보게 된다.
      var probe = aiProbe_(prov, newKey);
      if (probe.getResponseCode() !== 200) {
        var pe = {};
        try { pe = JSON.parse(probe.getContentText() || '{}'); } catch (x) {}
        return json_({ ok: false,
          error: '이 키로 접속하지 못했습니다 (' + prov + ') — ' +
                 ((pe.error && (pe.error.message || pe.error.type)) || probe.getResponseCode()) });
      }
      props.setProperty('GEMINI_KEY', newKey);
      props.setProperty('AI_PROVIDER', prov);
      return json_({ ok: true, ai: true, provider: prov });
    }
    // AI 문진 중계 — 학생 브라우저 대신 여기서 AI 를 부른다.
    // 학생 쪽에는 키가 없고, 여기서도 키를 응답에 넣지 않는다.
    if (req.action === 'ai') {
      var key = geminiKey_();
      if (!key) {
        return json_({ ok: false, error: '교수 AI 키가 설정되지 않았습니다 (스크립트 속성 GEMINI_KEY).' });
      }
      // 회사는 서버에 저장된 것이 기준이다. 학생이 보낸 값을 그대로 믿으면
      // Gemini 키로 OpenAI 를 부르는 엉뚱한 호출이 나간다.
      var prov = aiProvider_();
      var model = String(req.model || '').replace(/[^a-zA-Z0-9._-]/g, '');
      var sys = String(req.system || '');
      var msgs = (req.messages || []);
      var budget = Math.min(8192, Number(req.maxTokens) || 1024);
      var url, opt, out, text;

      if (prov === 'openai') {
        if (!model) model = 'gpt-4.1-mini';
        var oaMsgs = [{ role: 'system', content: sys }];
        for (var i = 0; i < msgs.length; i++) {
          oaMsgs.push({ role: msgs[i].role === 'assistant' ? 'assistant' : 'user',
                        content: String(msgs[i].content || '') });
        }
        var oaBody = { model: model, messages: oaMsgs, max_completion_tokens: budget };
        if (req.jsonMode) oaBody.response_format = { type: 'json_object' };
        var oaRes = UrlFetchApp.fetch('https://api.openai.com/v1/chat/completions', {
          method: 'post', contentType: 'application/json',
          headers: { Authorization: 'Bearer ' + key },
          payload: JSON.stringify(oaBody), muteHttpExceptions: true });
        out = JSON.parse(oaRes.getContentText() || '{}');
        if (oaRes.getResponseCode() !== 200) {
          return json_({ ok: false, error: (out.error && out.error.message) || ('API 오류 ' + oaRes.getResponseCode()) });
        }
        text = (((out.choices || [])[0] || {}).message || {}).content || '';

      } else if (prov === 'anthropic') {
        if (!model) model = 'claude-haiku-4-5-20251001';
        var anMsgs = [];
        for (var j = 0; j < msgs.length; j++) {
          anMsgs.push({ role: msgs[j].role === 'assistant' ? 'assistant' : 'user',
                        content: String(msgs[j].content || '') });
        }
        var anBody = {
          model: model, max_tokens: budget, messages: anMsgs,
          system: sys + (req.jsonMode ? '\n\n반드시 JSON 하나만 출력한다. 설명·코드펜스를 붙이지 않는다.' : ''),
        };
        var anRes = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
          method: 'post', contentType: 'application/json',
          headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' },
          payload: JSON.stringify(anBody), muteHttpExceptions: true });
        out = JSON.parse(anRes.getContentText() || '{}');
        if (anRes.getResponseCode() !== 200) {
          return json_({ ok: false, error: (out.error && (out.error.message || out.error.type)) || ('API 오류 ' + anRes.getResponseCode()) });
        }
        text = (out.content || []).map(function (b) { return b.text || ''; }).join('');

      } else {
        if (!model) model = GEMINI_DEFAULT_MODEL;
        var body = {
          system_instruction: { parts: [{ text: sys }] },
          contents: msgs.map(function (m) {
            return { role: m.role === 'assistant' ? 'model' : 'user',
                     parts: [{ text: String(m.content || '') }] };
          }),
          generationConfig: { maxOutputTokens: budget, temperature: 0.7 },
        };
        if (req.jsonMode) body.generationConfig.responseMimeType = 'application/json';
        var res = UrlFetchApp.fetch(
          'https://generativelanguage.googleapis.com/v1beta/models/' + model +
          ':generateContent?key=' + encodeURIComponent(key),
          { method: 'post', contentType: 'application/json',
            payload: JSON.stringify(body), muteHttpExceptions: true });
        out = JSON.parse(res.getContentText() || '{}');
        if (res.getResponseCode() !== 200) {
          return json_({ ok: false, error: (out.error && out.error.message) || ('API 오류 ' + res.getResponseCode()) });
        }
        var cand = (out.candidates || [])[0];
        var parts = cand && cand.content && cand.content.parts;
        if (!parts || !parts.length) {
          return json_({ ok: false, error: '응답이 비어 있습니다' + (cand && cand.finishReason ? ' (' + cand.finishReason + ')' : '') });
        }
        text = parts.map(function (p) { return p.text || ''; }).join('');
      }

      if (!text) return json_({ ok: false, error: '응답이 비어 있습니다 (' + prov + ')' });
      return json_({ ok: true, text: text, provider: prov });
    }
    return json_({ ok: false, error: '알 수 없는 요청입니다.' });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}
// 배포가 제대로 됐는지 브라우저에서 바로 확인하는 창구.
// 웹앱 주소(/exec)를 주소창에 붙여넣었을 때
//   · JSON 이 보이면  → 익명 접근 허용됨. 학생 브라우저에서도 된다.
//   · 로그인 화면이면 → 「액세스 권한이 있는 사용자」가 “모든 사용자” 가 아니다.
// 키 자체는 절대 내보내지 않는다 — 있는지 없는지만 알린다.
function doGet() {
  var sheetOk = false, sheetErr = '';
  try { sheet_(); sheetOk = true; } catch (e) { sheetErr = String(e); }
  return json_({
    ok: true,
    msg: '가상환자시뮬레이션 수집기가 동작 중입니다.',
    sheet: sheetOk ? 'ok' : ('오류: ' + sheetErr),
    profPwSet: PROF_PW !== 'CHANGE_ME',
    ai: geminiKey_().length > 0,
    provider: aiProvider_(),
  });
}