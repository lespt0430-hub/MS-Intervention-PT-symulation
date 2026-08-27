# 교수 설정 — 학생 결과 자동 수집 (구글 시트)

학생이 환자 한 명을 채점할 때마다 결과가 **교수님 구글 시트**에 한 줄씩 쌓입니다.
교수님은 시뮬레이션 시작 화면의 **교수 모드**에서 아이디·비밀번호로 전체 결과를
불러오고 **엑셀(.xlsx)로 다운로드**할 수 있습니다.

한 번만 설정하면 되고, 10분이면 끝납니다. 비용은 들지 않습니다.

---

## 왜 이렇게 하나

GitHub Pages는 파일만 보내주는 곳이라 데이터를 저장할 서버가 없습니다.
그래서 교수님 구글 계정의 시트를 저장소로 씁니다.

- 데이터는 **교수님 구글 계정 안에만** 저장됩니다
- 비밀번호는 웹사이트가 아니라 **구글 쪽 스크립트에 저장**되어 거기서 대조합니다.
  사이트 소스는 공개되지만, 소스를 뜯어봐도 남의 결과를 볼 수 없습니다

---

## 1단계 — 시트 만들기

1. [sheets.new](https://sheets.new) 로 새 스프레드시트를 만듭니다
2. 이름을 알아보기 쉽게 바꿉니다 (예: `가상환자시뮬레이션 결과`)

## 2단계 — 스크립트 붙여넣기

1. 그 시트에서 상단 메뉴 **확장 프로그램 → Apps Script**
2. 왼쪽에 보이는 **`Code.gs`** 를 열고, 거기 있던 내용을 **전부 지운 다음**
   아래 코드를 통째로 붙여넣습니다
   (저장소의 **`apps-script/Code.gs`** 파일과 같은 내용입니다. 그 파일을 열어
   복사하셔도 됩니다)

```javascript
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
```

이어서:

1. **`PROF_ID`와 `PROF_PW` 두 줄을 교수님이 쓰실 아이디·비밀번호로 바꿉니다**
2. 💾 저장

## 3단계 — 웹 앱으로 배포

1. 오른쪽 위 **배포 → 새 배포**
2. 톱니바퀴 ⚙ → **웹 앱** 선택
3. 설정
   - 설명: 아무거나 (예: `결과수집 v1`)
   - **다음 사용자로 실행: 나**
   - **액세스 권한이 있는 사용자: 모든 사용자** ← 반드시 이것으로
4. **배포** → 권한 승인 (본인 계정 선택 → "고급" → "이동" → 허용)
5. 나오는 **웹 앱 URL을 복사**합니다. `.../exec` 로 끝납니다

> "모든 사용자"는 **시트를 아무나 본다는 뜻이 아닙니다.** 학생 브라우저가 스크립트를
> 호출할 수 있게 하는 설정이고, 결과 조회는 비밀번호가 맞아야만 됩니다.

## 4단계 — 주소를 사이트에 넣기

저장소의 **`config.js`** 를 열어 한 줄을 채우고 저장합니다.

```javascript
window.PTSIM_CONFIG = {
  collectUrl: 'https://script.google.com/macros/s/AKfy..../exec',   // 3단계에서 복사한 주소
  className: '2025-1 물리치료중재론 A반',                              // 선택 사항
};
```

그리고 올립니다.

```bash
git add config.js
git commit -m "결과 수집처 설정"
git push
```

1~2분 뒤 반영됩니다.

---

## AI 문진 켜기 (선택)

교수님 키 **하나**로 모든 학생이 AI 문진을 쓰게 하는 기능입니다. 켜지 않으면
학생은 내장 답변 모드로 평소처럼 실습합니다.

**Apps Script 편집기를 열 필요 없습니다. 웹 화면에서 켜고 끕니다.**

1. <https://aistudio.google.com/apikey> 에서 Gemini API 키를 발급합니다.
2. 시뮬레이션 시작 화면 → **⚙ 교수 모드** → 아이디·비밀번호로 **결과 불러오기**
3. 로그인하면 나타나는 **🤖 AI 문진** 칸에 키를 붙여넣고 **AI 문진 켜기**
4. 학기가 끝나면 같은 자리에서 **끄기** — 서버에 저장된 키까지 지워집니다

켜는 순간 그 키로 실제 접속이 되는지 먼저 확인하고 저장합니다. 오타가 있으면
켜지지 않고 이유를 알려 줍니다. 켜진 뒤에는 학생 시작 화면에
"교수님이 등록해 둔 AI로 문진합니다" 라고 표시됩니다.

**왜 이렇게 하나 — 키를 사이트에 적으면 안 됩니다.**
이 시뮬레이션은 서버 없는 정적 사이트라 `config.js` 든 `api.js` 든 학생이
소스 보기로 그대로 읽을 수 있습니다. 키를 거기 적으면 그 키로 누구나 요금을
쓸 수 있게 됩니다. (GitHub 도 그런 키가 든 커밋은 푸시를 거부합니다.)
위 방법으로 넣으면 키는 교수님 구글 계정(스크립트 속성) 안에만 있고,
학생 브라우저는 "이 질문에 환자로 답해 달라"는 요청만 보냅니다.

> 웹 앱 주소를 아는 사람은 (학생이든 아니든) 그 주소로 AI 호출을 시킬 수는
> 있습니다. 수업이 없는 기간에는 **끄기**를 눌러 두시는 편이 안전합니다.

---

## 쓰는 법

### 학생

평소대로 진료하면 됩니다. 채점될 때마다 자동으로 전송되고, 학생은 아무것도
하지 않습니다. 인터넷이 잠깐 끊겨도 그 PC에 보관해 두었다가 다음에 자동으로
다시 올립니다.

### 교수

1. 시뮬레이션 시작 화면 → **⚙ 교수 모드** 펼치기
2. **학생 결과 조회** 칸에 아이디·비밀번호 입력 → **결과 불러오기**
3. 학생별 요약이 표로 나옵니다
4. **📥 전체 학생 기록 엑셀(.xlsx) 받기** → 환자별 상세 점수까지 전부 들어 있습니다

**학생이 어디서 접속했든 상관없습니다.** 실습실 PC든, 집이든, 휴대폰이든
제출된 기록은 전부 교수님 구글 시트 한 곳에 모입니다. 교수님도 아무 컴퓨터에서나
사이트를 열어 로그인하면 그 전부를 한 번에 받습니다 — 학생 PC를 돌아다닐 필요가
없습니다.

구글 시트를 직접 열어서 봐도 됩니다 (파일 → 다운로드 → Microsoft Excel).

**진료 기록 전체 초기화**도 교수 로그인을 해야 눌립니다. 이건 그 컴퓨터에 남은
진행 상황만 지우는 버튼이고, 시트에 이미 제출된 기록은 지워지지 않습니다.

수집처를 아예 안 쓰거나 실습실 인터넷이 구글을 막고 있다면, 각 학생 PC 에서
**💾 이 PC 기록만 엑셀로 받기** 를 눌러 그 컴퓨터에 남은 결과만 따로 받을 수
있습니다. 이건 인터넷이 없어도 됩니다.

---

## 이미 배포해 두신 분께 — 다시 붙여넣어야 합니다

스크립트가 두 번 바뀌었습니다.

1. **`LockService`** — 이게 없으면 한 반이 동시에 채점을 끝낼 때 결과가
   사라집니다 (12건 중 1건만 남는 것을 재현했습니다).
2. **학번 열 추가** — 예전에는 `학생(학번·이름)` 한 칸이었는데 **`분반` ·
   `학번` · `이름` 세 칸**으로 나뉘었습니다. 학생이 입장할 때 셋을 따로
   입력하므로, 엑셀에서 학번으로 정렬하거나 분반별로 나눌 수 있습니다.

위 스크립트를 다시 통째로 붙여넣고, **배포 → 배포 관리 → ✏ 편집 → 버전
'새 버전' → 배포** 까지 해 주세요. 웹 앱 주소는 그대로라 `config.js` 는
안 고쳐도 됩니다.

> **기존 시트는 그대로 둡니다.** 열 구성이 바뀌었으므로 스크립트가 옛 `결과`
> 시트를 `결과_이전_20260810_1530` 처럼 이름만 바꿔 남겨 두고, 새 열로 된
> `결과` 시트를 새로 만듭니다. 지우지 않으니 예전 데이터는 그대로 있습니다.

---

## 문제가 생기면

| 증상 | 원인과 해결 |
| --- | --- |
| "수집처가 설정되지 않았습니다" | `config.js`의 `collectUrl`이 비어 있습니다. 4단계를 다시 확인하세요 |
| "아이디 또는 비밀번호가 맞지 않습니다" | 스크립트의 `PROF_ID`/`PROF_PW`와 다릅니다. 스크립트를 고쳤으면 **배포 → 배포 관리 → 편집 → 버전 '새 버전' → 배포**를 다시 해야 반영됩니다 |
| 불러오기가 실패하거나 응답을 못 읽음 | 3단계의 액세스 권한이 **모든 사용자**인지 확인하세요 |
| 학생 화면에 "전송이 지연되고 있습니다" | 그 PC의 인터넷 문제입니다. 기록은 보관되어 있고 다음 접속 때 자동 전송됩니다 |
| 결과가 중복으로 쌓임 | 학생이 같은 환자를 다시 채점하면 줄이 하나 더 생깁니다. 엑셀에서 `제출시각` 기준 최신 것만 보시면 됩니다 |

## 개인정보 안내

이 기능을 켜면 **학생 이름(학번)과 점수가 교수님 구글 시트로 전송**됩니다.
켜기 전에 학생들에게 수집 항목과 용도를 안내해 주세요. 수집을 끄려면
`config.js`의 `collectUrl`을 다시 비우고 push 하면 됩니다.
