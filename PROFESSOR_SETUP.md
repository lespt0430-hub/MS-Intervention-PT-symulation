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
