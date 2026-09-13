// 진료 한 건을 끝까지 자동으로 진행해 ⑤ 중재 처방과 50점 채점을 확인한다.
//   node test/rx-e2e.mjs
// 헤드리스 크롬을 띄워 실제 페이지에서 UI를 조작하므로, 문법은 맞는데
// 화면에서만 깨지는 문제(요소 id 오타, 이벤트 미연결 등)를 잡는다.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const OUT = path.join(here, 'shots');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.png': 'image/png', '.webp': 'image/webp', '.json': 'application/json' };
const srv = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]);
  const f = path.join(root, u === '/' ? 'index.html' : u);
  if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const port = srv.address().port;

// 앞선 실행의 크롬이 아직 프로필 폴더를 붙들고 있으면 지우기가 실패한다.
// 실행마다 새 폴더를 쓰고, 지워지지 않는 옛 폴더는 그냥 넘어간다.
const prof = path.join(here, 'out', 'chrome-rx-' + Date.now());
for (const d of fs.existsSync(path.join(here, 'out')) ? fs.readdirSync(path.join(here, 'out')) : []) {
  if (d.startsWith('chrome-rx-')) {
    try { fs.rmSync(path.join(here, 'out', d), { recursive: true, force: true }); } catch (e) { /* 사용 중 */ }
  }
}
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', [
  '--headless=new', '--remote-debugging-port=9341', `--user-data-dir=${prof}`,
  '--window-size=1440,1000', '--hide-scrollbars',
  '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-first-run', 'about:blank',
], { stdio: 'ignore' });

let wsUrl = null;
for (let i = 0; i < 60 && !wsUrl; i++) {
  try {
    const l = await (await fetch('http://127.0.0.1:9341/json/list')).json();
    wsUrl = (l.find((t) => t.type === 'page') || {}).webSocketDebuggerUrl;
  } catch (e) { /* 대기 */ }
  if (!wsUrl) await sleep(500);
}
const sock = new WebSocket(wsUrl);
await new Promise((r) => sock.addEventListener('open', r));
let id = 0; const waiting = new Map();
const errors = [];
const dialogs = [];
sock.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (m.method === 'Runtime.exceptionThrown') {
    errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
  }
  // alert/confirm 은 헤드리스에서 스스로 닫히지 않는다 — 받아서 "예"로 처리한다
  if (m.method === 'Page.javascriptDialogOpening') {
    dialogs.push(m.params.message);
    sock.send(JSON.stringify({ id: ++id, method: 'Page.handleJavaScriptDialog', params: { accept: true } }));
  }
  if (m.id && waiting.has(m.id)) { const { ok } = waiting.get(m.id); waiting.delete(m.id); ok(m.result); }
});
const send = (m, p = {}) => { const i = ++id; sock.send(JSON.stringify({ id: i, method: m, params: p }));
  return new Promise((ok) => waiting.set(i, { ok })); };
const ev = async (e, aw = false) => {
  const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: aw });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
};
const shot = async (name) => {
  const { data } = await send('Page.captureScreenshot', { format: 'png' });
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, `rx-${name}.png`), Buffer.from(data, 'base64'));
  console.log('  캡처: rx-' + name + '.png');
};

let fails = 0;
const ok = (cond, msg) => { console.log((cond ? '  ✓ ' : '  ✗ ') + msg); if (!cond) fails++; };

await send('Runtime.enable'); await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: `http://127.0.0.1:${port}/` });
await sleep(4000);

// ── 입장 ──────────────────────────────────────────────────
console.log('\n1. 입장');
await ev(`(()=>{
  document.getElementById('inp-name').value='테스트';
  document.getElementById('inp-sid').value='20260909';
  document.getElementById('inp-class').value='자동점검';
  document.getElementById('inp-quality').value='low';
  document.getElementById('btn-start').click(); return 1;
})()`);
await sleep(6000);
// const 로 선언한 전역은 window 에 붙지 않으므로 이름으로 직접 확인한다
ok(await ev(`typeof UI==='object' && Array.isArray(PATIENTS) && typeof RX==='object'`),
  'UI · PATIENTS · RX 가 모두 로드됐다');
// 인원수를 상수로 박아 두면 환자를 늘릴 때마다 테스트가 먼저 깨진다 —
// 아래 중재·원형 점검과 같은 규칙으로, 수가 아니라 조건을 본다.
const nPatients = await ev(`PATIENTS.length`);
ok(nPatients >= 12 && await ev(`PATIENTS.every(p=>p.correctStage&&p.correctIrritability)`),
  '환자 ' + nPatients + '명 모두 단계·자극성 정답을 가지고 있다');
ok(await ev(`PATIENTS.every(p=>p.diagnosisOptions.length>=12)`), '환자마다 감별진단이 12개 이상이다');
// 권고 중재에는 빠짐없이 정답 용량이 있어야 한다 (개수를 박아 두면 중재를 늘릴 때마다 깨진다)
const noPlan = await ev(`PATIENTS.flatMap(p=>p.treatments.filter(t=>t.recommended && !RX.plans[p.id+':'+t.id]).map(t=>p.id+':'+t.id)).join(', ')`);
ok(noPlan === '', '권고 중재 전부에 정답 용량이 있다' + (noPlan ? ' — 빠진 것: ' + noPlan : ''));
// 라이브러리에 정의만 해 두고 아무 환자도 쓰지 않는 원형이 남아 있으면 알린다
const unusedProtos = await ev(`(()=>{
  const used=new Set(); PATIENTS.forEach(p=>p.treatments.forEach(t=>used.add(RX.spec(p,t).proto)));
  return Object.keys(RX.protos).filter(x=>!used.has(x)).join(', ');
})()`);
ok(unusedProtos === '', '모든 중재 원형이 실제 환자에게 연결돼 있다' + (unusedProtos ? ' — 미사용: ' + unusedProtos : ''));
ok(await ev(`Object.keys(RX.protos).length >= 35`), '중재 원형이 35종 이상 실려 있다');

// ── 진료 시작 (1번 환자) ──────────────────────────────────
console.log('\n2. 진단 탭 — 진단명 · 단계 · 자극성');
await ev(`UI.openConsult(PATIENTS[0])`);
await sleep(600);
await ev(`UI.showTab('dx')`);
await sleep(400);
ok(await ev(`document.querySelectorAll('#dx-list input[name="dx"]').length`) === 14, '감별진단이 14개 뜬다');
ok(await ev(`document.querySelectorAll('#dx-list input[name="stage"]').length`) === 3, '단계 선택지 3개가 뜬다');
ok(await ev(`document.querySelectorAll('#dx-list input[name="irr"]').length`) === 3, '자극성 선택지 3개가 뜬다');
await shot('진단탭');

const P = await ev(`JSON.stringify({dx:UI.cur.correctDx, stage:UI.cur.correctStage, irr:UI.cur.correctIrritability})`);
const key = JSON.parse(P);
await ev(`(()=>{
  const c=(n,v)=>{const el=document.querySelector('#dx-list input[name="'+n+'"][value="'+v+'"]');el.click();};
  c('dx','${key.dx}'); c('stage','${key.stage}'); c('irr','${key.irr}'); return 1;
})()`);
ok(await ev(`UI.selDx==='${key.dx}' && UI.selStage==='${key.stage}' && UI.selIrr==='${key.irr}'`), '세 가지 판정이 모두 기록된다');

// ── 검사 · 문진 (점수용) ─────────────────────────────────
await ev(`UI.cur.requiredExams.forEach(id=>UI.doExam(id))`);

// ── 치료계획 → 처방 ──────────────────────────────────────
console.log('\n3. 치료계획 · 중재 처방');
await ev(`UI.showTab('tx')`);
await sleep(300);
// 권고 중재를 전부 고른다
await ev(`(()=>{
  const rec=UI.cur.treatments.filter(t=>t.recommended).map(t=>t.id);
  document.querySelectorAll('#tx-list input').forEach(c=>{ if(rec.includes(c.value)) c.click(); });
  return 1;
})()`);
await sleep(500);
const nRec = await ev(`UI.selTx.length`);
ok(nRec === await ev(`UI.cur.treatments.filter(t=>t.recommended).length`),
  '권고 중재 ' + nRec + '건을 모두 선택했다');
await ev(`UI.showTab('rx')`);
await sleep(400);
ok(await ev(`document.querySelectorAll('#rx-list .rx-card').length`) === nRec, '처방 카드가 선택한 중재 수만큼 생성된다');
ok(await ev(`document.getElementById('rx-badge').textContent`) === String(nRec), '탭 배지가 미완성 처방 수를 보여 준다');
await shot('처방탭-빈상태');

// 선택지가 한 줄에 하나씩 놓이는지 (가로로 흘리면 줄이 어긋나 지저분하다)
const perRow = await ev(`(()=>{
  const opts=[...document.querySelectorAll('#rx-list .rx-opts')][0].children;
  const tops=new Set([...opts].map(o=>Math.round(o.getBoundingClientRect().top)));
  return tops.size===opts.length;
})()`);
ok(perRow, '선택지가 한 줄에 하나씩 놓인다');

// 카드를 다 펼쳤을 때 잘리지 않고 스크롤로 내려갈 수 있는지
const scrollable = await ev(`(()=>{
  const l=document.getElementById('rx-list');
  document.querySelectorAll('#rx-list .rx-card').forEach(c=>c.open=true);
  const clipped = l.scrollHeight > l.clientHeight;
  l.scrollTop = l.scrollHeight;
  const moved = l.scrollTop > 0;
  const inside = l.getBoundingClientRect().bottom <= document.querySelector('.cm-body').getBoundingClientRect().bottom + 1;
  l.scrollTop = 0;
  return JSON.stringify({clipped, moved, inside});
})()`);
const sc = JSON.parse(scrollable);
ok(sc.clipped && sc.moved, '카드를 모두 펼쳐도 스크롤로 끝까지 내려간다');
ok(sc.inside, '목록이 진료창 밖으로 넘쳐 잘리지 않는다');

// 진단 탭도 같은 구조라 함께 확인한다 (감별진단 14개 + 단계 + 자극성)
await ev(`UI.showTab('dx')`);
await sleep(300);
const dxScroll = await ev(`(()=>{
  const l=document.getElementById('dx-list');
  l.scrollTop = l.scrollHeight;
  const r = l.scrollTop > 0 || l.scrollHeight <= l.clientHeight;
  const irrVisible = !!document.querySelector('#dx-list input[name="irr"]');
  l.scrollTop = 0; return JSON.stringify({r, irrVisible});
})()`);
ok(JSON.parse(dxScroll).r && JSON.parse(dxScroll).irrVisible, '진단 탭도 자극성 항목까지 스크롤로 닿는다');
await ev(`UI.showTab('rx')`);
await sleep(300);

// 첫 카드에서 실제로 라디오를 클릭해 상태가 잡히는지 확인
await ev(`(()=>{ const r=document.querySelector('#rx-list .rx-field input'); r.click(); return 1; })()`);
await sleep(200);
ok(await ev(`Object.keys(UI.selRx).length > 0`), '클릭한 값이 UI.selRx 에 들어간다');
ok(await ev(`!!document.querySelector('#rx-list .rx-opt.on')`), '고른 선택지에 표시가 남는다');

// 정답 용량을 그대로 채워 넣는다
await ev(`(()=>{
  UI.selRx = {};
  UI.cur.treatments.filter(t=>UI.selTx.includes(t.id)).forEach(t=>{
    const spec = RX.spec(UI.cur, t); const pick = {};
    spec.fields.forEach(f=>{
      const b = spec.best[f.id];
      pick[f.id] = b == null ? f.opts[0].v : (Array.isArray(b) ? b[0] : b);
    });
    UI.selRx[t.id] = pick;
  });
  UI.renderRx(); return 1;
})()`);
await sleep(400);
ok(await ev(`UI.rxIncomplete().length`) === 0, '모든 처방을 채우면 미완성이 0이 된다');
ok(await ev(`document.querySelectorAll('#rx-list .rx-card.complete').length`) === nRec, '카드가 모두 완료 표시로 바뀐다');
await shot('처방탭-작성완료');

// ── 채점 ─────────────────────────────────────────────────
console.log('\n4. 채점 (50점)');
await ev(`UI.submit()`, true);
await sleep(3000);
const S = JSON.parse(await ev(`JSON.stringify(UI.state.records[PATIENTS[0].id].scores)`));
console.log('   ' + JSON.stringify(S));
ok(S.rx === 10, '정답 용량을 그대로 넣으면 처방 10점 만점이다 (받은 점수 ' + S.rx + ')');
ok(S.dx === 10, '진단명 7 + 단계 1.5 + 자극성 1.5 = 10점이다 (받은 점수 ' + S.dx + ')');
ok(S.tx === 10, '권고 중재를 모두 고르면 치료계획 10점이다');
ok(S.total === Math.round((S.hist + S.exam + S.dx + S.tx + S.rx) * 10) / 10, '총점이 다섯 항목의 합이다');
ok(S.total <= 50 && S.total > 30, '총점이 50점 만점 범위 안이다 (' + S.total + '/50)');
ok((await ev(`document.querySelector('.total-score').textContent`)).includes('50'), '리포트에 "/ 50점"이 표시된다');
ok(await ev(`document.querySelectorAll('#pane-result .rx-result').length`) === nRec, '처방 상세가 중재별로 출력된다');
await shot('결과리포트');
await ev(`document.querySelector('.result-scroll').scrollTop = 99999`);
await sleep(400);
await shot('결과리포트-처방상세');

// ── 오답 처방도 점수에 반영되는지 ─────────────────────────
console.log('\n5. 틀린 용량은 감점되는지');
const wrong = await ev(`(()=>{
  const p=PATIENTS[0], t=p.treatments[0], spec=RX.spec(p,t), pick={};
  spec.fields.forEach(f=>{
    const b=spec.best[f.id]; const bv=Array.isArray(b)?b:[b];
    const okv=(spec.ok[f.id]||[]);
    const bad=f.opts.find(o=>!bv.includes(o.v)&&!okv.includes(o.v));
    pick[f.id]=bad?bad.v:f.opts[0].v;
  });
  return RX.scoreOne(spec, pick);
})()`);
ok(wrong === 0, '전부 틀리게 고르면 처방 정확도가 0이다 (' + wrong + ')');
const half = await ev(`(()=>{
  const p=PATIENTS[0], t=p.treatments[0], spec=RX.spec(p,t), pick={};
  spec.fields.forEach(f=>{ const o=(spec.ok[f.id]||[])[0]; const b=spec.best[f.id];
    pick[f.id]= o || (Array.isArray(b)?b[0]:b); });
  return RX.scoreOne(spec, pick);
})()`);
ok(half > 0 && half < 1, '차선(ok) 선택은 부분점수가 된다 (' + half.toFixed(2) + ')');

// ── 대화상자 · 콘솔 오류 ─────────────────────────────────
console.log('\n6. 대화상자와 자바스크립트 오류');
ok(dialogs.every((d) => d.includes('문진 대화')),
  '예상치 못한 경고창이 뜨지 않았다' + (dialogs.length ? ' (뜬 것: ' + dialogs.join(' / ') + ')' : ''));
ok(errors.length === 0, errors.length ? '오류 발생: ' + errors.join(' | ') : '실행 중 오류 없음');

console.log('\n' + '─'.repeat(56));
console.log(fails ? '실패 ' + fails + '건' : '모두 통과');
chrome.kill(); srv.close();
process.exit(fails ? 1 : 0);
