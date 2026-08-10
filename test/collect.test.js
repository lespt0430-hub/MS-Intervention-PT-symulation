// collect.test.js — 결과 수집·교수 조회·엑셀 내보내기 실사용 점검
//
//   node test/collect.test.js
//
// collect.js 는 브라우저용 스크립트라 window·localStorage·document 가 있어야
// 돈다. 여기서는 그 세 가지만 최소로 흉내 내고, 서버는 진짜 Apps Script 와
// 같은 모양(302 리다이렉트·사전요청 불가)의 모의 서버를 쓴다.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createMockAppsScript, PROF_ID, PROF_PW } from './mock-apps-script.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const OUT = path.join(here, 'out');

// ── 아주 작은 시험 틀 ────────────────────────────────────────
let pass = 0;
const fails = [];
function check(name, cond, detail) {
  if (cond) { pass += 1; console.log('  ✓ ' + name); }
  else { fails.push(name + (detail ? ' — ' + detail : '')); console.log('  ✗ ' + name + (detail ? '\n      ' + detail : '')); }
}
function section(title) { console.log('\n' + title); }

// ── 브라우저 흉내 ────────────────────────────────────────────
function makeLocalStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    clear: () => m.clear(),
  };
}

// 내려받기(download)는 a 태그를 쓴다. 파일로 떨어뜨려 검사할 수 있게 가로챈다.
function makeDocument(saved) {
  return {
    createElement: () => ({
      set href(v) { this._href = v; },
      get href() { return this._href; },
      click() { saved.push({ name: this.download, href: this._href }); },
      remove() {},
    }),
    body: { appendChild() {} },
  };
}

function loadCollect(env = {}) {
  const src = fs.readFileSync(path.join(root, 'collect.js'), 'utf8');
  const window = {};
  const localStorage = makeLocalStorage();
  const saved = [];
  const document = makeDocument(saved);
  const blobs = [];
  // URL.createObjectURL 이 없으므로 Blob 을 붙잡아 둔다
  const URLShim = { createObjectURL: (b) => { blobs.push(b); return 'blob:' + blobs.length; }, revokeObjectURL() {} };
  // 브라우저에서는 전역인 것들 (localRows 가 쓴다)
  if (env.UI) window.UI = env.UI;
  const fn = new Function('window', 'localStorage', 'document', 'URL', 'UI', 'PATIENTS', src);
  fn(window, localStorage, document, URLShim, env.UI, env.PATIENTS);
  return { COLLECT: window.COLLECT, window, localStorage, saved, blobs };
}

// 학생 정보 — 분반·학번·이름을 따로 받는다
const WHO = { className: '2026-2 물리치료중재론 A반', studentId: '20251234', studentName: '홍길동' };

// ── 시험용 환자·기록 (한글·특수문자·제어문자를 일부러 섞는다) ──
const patient = {
  id: 'P07',
  name: '김＜영＞희 & 보호자',
  chiefComplaint: '어깨 통증 "3주째" — 야간통 동반',
  correctDx: 'dx-rc',
  requiredExams: ['ex-rom', 'ex-neer', 'ex-empty'],
  diagnosisOptions: [
    { id: 'dx-rc', name: '회전근개 <건병증>' },
    { id: 'dx-fs', name: '유착성 관절낭염' },
  ],
  treatments: [
    { id: 'tx-1', name: '견갑 안정화 운동 & 자세교육' },
    { id: 'tx-2', name: '초음파' },
  ],
};
const record = {
  when: '2026-08-10T04:05:06.000Z',
  scores: { hist: 8.5, exam: 7, dx: 10, tx: 6.5, total: 32 },
  dx: 'dx-rc',
  tx: ['tx-1', 'tx-2'],
  performed: ['ex-rom', 'ex-neer'],
  chat: [{ role: 'student' }, { role: 'patient' }, { role: 'student' }],
};

// ── 본 시험 ──────────────────────────────────────────────────
const run = async () => {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });

  // 1. 정상 제출 ─────────────────────────────────────────────
  section('1. 학생 제출 — 정상 (302 리다이렉트 경유)');
  {
    const mock = createMockAppsScript();
    const url = await mock.start();
    const { COLLECT, window } = loadCollect();
    window.PTSIM_CONFIG = { collectUrl: url };

    const r = await COLLECT.submit(patient, record, WHO);
    check('제출이 성공으로 돌아온다', r.ok === true, JSON.stringify(r));
    check('시트에 한 줄 쌓인다', mock.state.rows.length === 1);
    check('사전요청(OPTIONS)이 한 번도 가지 않는다', mock.state.preflights === 0,
      '사전요청 ' + mock.state.preflights + '회 — 실제 Apps Script 라면 CORS 로 전송 실패');

    const row = mock.state.rows[0] || {};
    check('분반·학번·이름이 각각 따로 실린다',
      row.className === '2026-2 물리치료중재론 A반' && row.studentId === '20251234'
      && row.student === '홍길동' && row.patientId === 'P07',
      JSON.stringify(row).slice(0, 180));
    check('총점 32, 진단정답 O', row.total === 32 && row.dxCorrect === 'O', `total=${row.total} dxCorrect=${row.dxCorrect}`);
    check('누락 필수검사 1건(ex-empty)', row.examMissed === 1, String(row.examMissed));
    check('문진 질문수 2', row.chatTurns === 2, String(row.chatTurns));
    check('치료 이름이 id 가 아니라 이름으로', /견갑 안정화/.test(row.txChosen), row.txChosen);
    check('보관함이 비어 있다', COLLECT.pendingCount() === 0);
    await mock.stop();
  }

  // 2. 전송 실패 → 보관 → 재전송 ─────────────────────────────
  section('2. 인터넷이 끊겼다가 돌아오는 경우');
  {
    const mock = createMockAppsScript({ fail: 'network' });
    const url = await mock.start();
    const { COLLECT, window } = loadCollect();
    window.PTSIM_CONFIG = { collectUrl: url };

    const r1 = await COLLECT.submit(patient, record, WHO);
    check('실패가 사용자에게 보고된다', r1.ok === false && r1.queued === 1, JSON.stringify(r1));
    await COLLECT.submit({ ...patient, id: 'P08' }, record, WHO);
    check('실패분이 보관함에 쌓인다', COLLECT.pendingCount() === 2, String(COLLECT.pendingCount()));

    mock.state.fail = null;                      // 인터넷 복구
    const f = await COLLECT.flush();
    check('복구 후 밀린 것이 전부 올라간다', f.sent === 2 && f.left === 0, JSON.stringify(f));
    check('보관함이 비워진다', COLLECT.pendingCount() === 0);
    check('시트에 2줄', mock.state.rows.length === 2, String(mock.state.rows.length));
    await mock.stop();
  }

  // 3. 서버가 응답하지 않을 때 재전송이 얼마나 붙잡고 있나 ────
  section('3. 서버 무응답 — 밀린 건이 많을 때 (학교 방화벽 상황)');
  {
    const mock = createMockAppsScript({ fail: 'hang' });
    const url = await mock.start();
    const { COLLECT, window, localStorage } = loadCollect();
    window.PTSIM_CONFIG = { collectUrl: url };

    // 12명 환자를 오프라인으로 다 본 뒤 접속한 상황
    const box = Array.from({ length: 12 }, (_, i) => COLLECT.buildRow({ ...patient, id: 'P' + i }, record, WHO));
    localStorage.setItem('ptsim_outbox', JSON.stringify(box));

    const t0 = Date.now();
    const timed = await Promise.race([
      COLLECT.flush().then(() => 'done'),
      new Promise((r) => setTimeout(() => r('timeout'), 20000)),
    ]);
    const secs = ((Date.now() - t0) / 1000).toFixed(1);
    check('20초 안에 재전송 시도가 끝난다', timed === 'done',
      `${secs}초가 지나도 안 끝남 — 요청 하나당 순서대로 기다리면 12건이면 몇 분씩 붙잡힌다. ` +
      '첫 건이 실패하면 즉시 멈추고 다음 기회로 미뤄야 한다');
    check('첫 건에서 멈춘다 (12건을 다 시도하지 않는다)', mock.state.submits === 1,
      mock.state.submits + '건을 시도함');
    check('시도하지 못한 기록은 그대로 보관된다', COLLECT.pendingCount() === 12,
      COLLECT.pendingCount() + '건만 남음 — 전송되지 않은 결과가 사라지면 안 된다');
    console.log('      (경과 ' + secs + '초, 서버가 받은 요청 ' + mock.state.submits + '건)');
    await mock.stop();
  }

  // 4. 동시 제출 (한 반이 같이 채점 완료를 누르는 순간) ───────
  // PROFESSOR_SETUP.md 의 스크립트가 LockService 로 감싸고 있어야 결과가 안 샌다.
  section('4. 동시 제출 — 학생 12명이 같은 순간에 채점');
  {
    // (가) 잠금이 없으면 어떻게 되는지 — 왜 LockService 가 필요한지 근거
    const bare = createMockAppsScript({ racyAppend: true, lock: false });
    const bareUrl = await bare.start();
    {
      const { COLLECT, window } = loadCollect();
      window.PTSIM_CONFIG = { collectUrl: bareUrl };
      await Promise.all(Array.from({ length: 12 }, (_, i) =>
        COLLECT.submit({ ...patient, id: 'P' + i }, record, { ...WHO, studentId: '2025' + i, studentName: '학생' + i })));
    }
    const bareLanded = bare.state.rows.filter(Boolean).length;
    check('잠금이 없으면 결과가 실제로 사라진다 (LockService 가 필요한 근거)',
      bareLanded < 12, `${bareLanded}/12 — 유실이 재현되지 않음`);
    console.log('      잠금 없음: 12건 중 ' + bareLanded + '건만 남음');
    await bare.stop();

    // (나) 현재 문서대로 LockService 를 쓰면
    const mock = createMockAppsScript({ racyAppend: true });
    const url = await mock.start();
    const { COLLECT, window } = loadCollect();
    window.PTSIM_CONFIG = { collectUrl: url };
    await Promise.all(Array.from({ length: 12 }, (_, i) =>
      COLLECT.submit({ ...patient, id: 'P' + i }, record, { ...WHO, studentId: '2025' + i, studentName: '학생' + i })));
    const landed = mock.state.rows.filter(Boolean).length;
    check('LockService 를 쓰면 12건이 모두 남는다', landed === 12, `${landed}/12`);
    await mock.stop();
  }

  // 5. 교수 조회 ─────────────────────────────────────────────
  section('5. 교수 조회 — 비밀번호 대조');
  {
    const mock = createMockAppsScript();
    const url = await mock.start();
    const { COLLECT, window } = loadCollect();
    window.PTSIM_CONFIG = { collectUrl: url, className: 'A반' };
    for (let i = 0; i < 3; i++) await COLLECT.submit({ ...patient, id: 'P' + i }, record, { ...WHO, studentId: '2025' + i, studentName: '학생' + i });

    let rejected = false;
    try { await COLLECT.fetchAll(PROF_ID, '틀린비밀번호'); }
    catch (e) { rejected = /맞지 않습니다/.test(e.message); }
    check('틀린 비밀번호는 거부된다', rejected);

    let rejected2 = false;
    try { await COLLECT.fetchAll('학생아이디', PROF_PW); }
    catch (e) { rejected2 = true; }
    check('아이디가 달라도 거부된다', rejected2);

    const rows = await COLLECT.fetchAll(PROF_ID, PROF_PW);
    check('맞는 비밀번호로 3건을 받는다', rows.length === 3, String(rows.length));

    // 6. 엑셀 만들기 ────────────────────────────────────────
    section('6. 엑셀(.xlsx) 내보내기');
    const blob = COLLECT.toXlsx(COLLECT.HEADER, rows, '진료결과');
    const buf = Buffer.from(await blob.arrayBuffer());
    fs.writeFileSync(path.join(OUT, 'result.xlsx'), buf);
    check('파일이 만들어진다', buf.length > 0, buf.length + ' bytes');
    check('ZIP 서명(PK)으로 시작', buf[0] === 0x50 && buf[1] === 0x4B);
    await mock.stop();
  }

  // 7. 수집처를 안 쓸 때 — 이 PC 기록만 엑셀로 ────────────────
  section('7. 수집 꺼짐 — 이 PC 기록만 엑셀로 받기');
  {
    const PATIENTS = [patient, { ...patient, id: 'P08', name: '이순신' }];
    const UI = {
      state: {
        className: '2026-2 물리치료중재론 A반',
        studentId: '20251234',
        studentName: '홍길동',
        records: { P07: record, P08: record },
      },
    };
    const { COLLECT, saved, blobs } = loadCollect({ UI, PATIENTS });
    // collectUrl 을 비워 둔 기본 상태
    check('수집이 꺼져 있다', COLLECT.enabled() === false);

    const rows = COLLECT.localRows();
    check('이 PC 기록 2건을 뽑아낸다', rows.length === 2, String(rows.length));
    check('분반·학번·이름이 실린다',
      rows[0].className === '2026-2 물리치료중재론 A반' && rows[0].studentId === '20251234'
      && rows[0].student === '홍길동', JSON.stringify(rows[0]).slice(0, 120));

    COLLECT.downloadXlsx(rows, '이PC.xlsx');
    check('내려받기가 실행된다', saved.length === 1 && saved[0].name === '이PC.xlsx',
      JSON.stringify(saved));
    const buf = Buffer.from(await blobs[0].arrayBuffer());
    fs.writeFileSync(path.join(OUT, 'local.xlsx'), buf);
    check('이 파일도 ZIP(xlsx) 이다', buf[0] === 0x50 && buf[1] === 0x4B);
  }

  // 8. 붙여넣을 스크립트가 문서와 같은지 ──────────────────────
  // apps-script/Code.gs 는 교수님이 그대로 복사해 붙여넣는 파일이고,
  // PROFESSOR_SETUP.md 에도 같은 코드가 실려 있다. 둘이 어긋나면
  // 문서를 보고 붙여넣은 사람과 파일을 받아 간 사람이 다른 코드를 쓰게 된다.
  section('8. apps-script/Code.gs 와 PROFESSOR_SETUP.md 가 같은가');
  {
    // 줄바꿈(CRLF/LF)은 윈도우·git 설정에 따라 갈리므로 맞춰 놓고 비교한다
    const norm = (s) => s.replace(/\r\n/g, '\n').trim();
    const gs = norm(fs.readFileSync(path.join(root, 'apps-script/Code.gs'), 'utf8'));
    const md = norm(fs.readFileSync(path.join(root, 'PROFESSOR_SETUP.md'), 'utf8'));
    const block = (md.match(/```javascript\n([\s\S]*?)\n```/) || [])[1];
    check('문서에 스크립트 블록이 있다', !!block);
    check('두 곳의 코드가 정확히 같다', block && block.trim() === gs,
      '문서를 고쳤으면 apps-script/Code.gs 도 같이 고쳐야 한다');
    check('LockService 로 감싸져 있다', /LockService\.getScriptLock/.test(gs),
      '동시 제출 시 결과가 사라진다');
    check('doPost·doGet 이 모두 있다', /function doPost/.test(gs) && /function doGet/.test(gs));
  }

  // ── 마무리 ────────────────────────────────────────────────
  console.log('\n' + '─'.repeat(60));
  console.log(`통과 ${pass}건 · 실패 ${fails.length}건`);
  if (fails.length) {
    console.log('\n실패 항목');
    fails.forEach((f) => console.log('  · ' + f));
  }
  process.exit(fails.length ? 1 : 0);
};

run().catch((e) => { console.error(e); process.exit(1); });
