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
2. 편집기에 있던 내용을 **모두 지우고** 아래를 붙여넣습니다

```javascript
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

function doPost(e) {
  try {
    const req = JSON.parse(e.postData.contents);

    if (req.action === 'submit') {
      const r = req.row || {};
      sheet_().appendRow([
        r.submittedAt || new Date().toISOString(), r.className || '', r.student || '',
        r.patientId || '', r.patientName || '', r.condition || '',
        r.histScore, r.examScore, r.dxScore, r.txScore, r.total,
        r.dxCorrect || '', r.dxChosen || '', r.txChosen || '',
        r.examCount, r.examMissed, r.chatTurns, r.clientId || '',
      ]);
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

## 쓰는 법

### 학생

평소대로 진료하면 됩니다. 채점될 때마다 자동으로 전송되고, 학생은 아무것도
하지 않습니다. 인터넷이 잠깐 끊겨도 그 PC에 보관해 두었다가 다음에 자동으로
다시 올립니다.

### 교수

1. 시뮬레이션 시작 화면 → **⚙ 교수 모드** 펼치기
2. **학생 결과 조회** 칸에 아이디·비밀번호 입력 → **결과 불러오기**
3. 학생별 요약이 표로 나옵니다
4. **📥 엑셀(.xlsx) 다운로드** → 환자별 상세 점수까지 전부 들어 있습니다

구글 시트를 직접 열어서 봐도 됩니다 (파일 → 다운로드 → Microsoft Excel).

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
