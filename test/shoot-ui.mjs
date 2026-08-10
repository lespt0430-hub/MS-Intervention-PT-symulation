// shoot-ui.mjs — 2D 화면(시작 화면 · 진료 모달)을 캡처한다
//
//   node test/shoot-ui.mjs [before|after]
//   node test/shoot-ui.mjs ref            참고 사이트(광주보건대) 홈페이지
//
// shoot.js 는 3D 장면을 찍으려고 시작 화면을 건너뛴다. UI 디자인을 고칠 때는
// 그 건너뛴 화면들이 정작 봐야 할 것이라 따로 찍는다.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const OUT = path.join(here, 'shots');
const TAG = process.argv[2] || 'ui';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.png': 'image/png' };

const srv = http.createServer((q, s) => {
  let p = decodeURIComponent(q.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  const f = path.join(root, p);
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { s.writeHead(404); return s.end(); }
  s.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(s);
});
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const port = srv.address().port;

const prof = path.join(here, 'out', 'chrome-ui');
fs.rmSync(prof, { recursive: true, force: true });
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', [
  '--headless=new', '--remote-debugging-port=9338', `--user-data-dir=${prof}`,
  '--window-size=1440,1000', '--hide-scrollbars',
  '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-first-run', 'about:blank',
], { stdio: 'ignore' });

let wsUrl = null;
for (let i = 0; i < 60 && !wsUrl; i++) {
  try {
    const l = await (await fetch('http://127.0.0.1:9338/json/list')).json();
    wsUrl = (l.find((t) => t.type === 'page') || {}).webSocketDebuggerUrl;
  } catch (e) { /* 대기 */ }
  if (!wsUrl) await sleep(500);
}
const sock = new WebSocket(wsUrl);
await new Promise((r) => sock.addEventListener('open', r));
let id = 0; const waiting = new Map();
sock.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (m.id && waiting.has(m.id)) { const { ok } = waiting.get(m.id); waiting.delete(m.id); ok(m.result); }
});
const send = (m, p = {}) => { const i = ++id; sock.send(JSON.stringify({ id: i, method: m, params: p }));
  return new Promise((ok) => waiting.set(i, { ok })); };
const ev = async (e, aw = false) => {
  const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: aw });
  if (r.exceptionDetails) return '오류: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
};
const shot = async (name) => {
  const { data } = await send('Page.captureScreenshot', { format: 'png' });
  fs.mkdirSync(OUT, { recursive: true });
  const f = path.join(OUT, `${TAG}-${name}.png`);
  fs.writeFileSync(f, Buffer.from(data, 'base64'));
  console.log('  캡처:', path.basename(f));
};

await send('Runtime.enable'); await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });

if (TAG === 'ref') {
  await send('Page.navigate', { url: 'https://www.ghu.ac.kr/' });
  await sleep(9000);
  await shot('광주보건대-상단');
  await ev(`window.scrollTo(0, 900)`); await sleep(2500);
  await shot('광주보건대-중단');
} else {
  await send('Page.navigate', { url: `http://127.0.0.1:${port}/` });
  await sleep(3500);
  await shot('시작화면');

  // 교수 모드를 펼친 상태도
  await ev(`(()=>{document.getElementById('prof-mode').open = true; window.scrollTo(0,600); return 1})()`);
  await sleep(1200);
  await shot('교수모드');

  // 입장 → 환자 진료 모달
  await ev(`(()=>{window.scrollTo(0,0);
    document.getElementById('inp-class').value='2026-2 물리치료중재론 A반';
    document.getElementById('inp-sid').value='202412345';
    document.getElementById('inp-name').value='홍길동';
    document.getElementById('inp-quality').value='high';
    document.querySelector('input[name=chatmode][value=offline]').checked=true;
    document.getElementById('btn-start').click(); return 1})()`);
  for (let i = 0; i < 120; i++) {
    await sleep(1000);
    if (await ev(`!!(window.GAME && GAME.beds && GAME.beds.length)`)) break;
  }
  await sleep(2500);

  // 진료 모달 열기 — 문진 탭
  console.log(await ev(`(()=>{ UI.openConsult(GAME.beds[0].patient); return '진료 모달: ' + GAME.beds[0].patient.name; })()`));
  await sleep(1800);
  await shot('문진');

  for (const tab of ['exam', 'dx', 'tx']) {
    const label = { exam: '검사', dx: '진단', tx: '치료계획' }[tab];
    await ev(`(()=>{ UI.showTab('${tab}'); return 1 })()`);
    await sleep(1200);
    await shot(label);
  }
}

sock.close(); chrome.kill(); srv.close();
