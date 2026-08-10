// shoot-mobile.mjs — 휴대폰 화면 크기로 3D 화면을 찍는다
//
//   node test/shoot-mobile.mjs
//
// 조작판을 좌우로 나눈 뒤 실제 휴대폰 폭에서 겹치지 않는지, 진료 버튼 글자가
// 깨지지 않는지는 그 크기로 찍어 봐야 안다. 데스크톱 크기로만 보면 놓친다.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const OUT = path.join(here, 'shots');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 세로(요즘 보급형)·가로(눕혀서 볼 때) 둘 다
const VIEWS = [
  ['세로', 390, 844],
  ['가로', 844, 390],
];

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8' };
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

const prof = path.join(here, 'out', 'chrome-mobile');
fs.rmSync(prof, { recursive: true, force: true });
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', [
  '--headless=new', '--remote-debugging-port=9339', `--user-data-dir=${prof}`,
  '--hide-scrollbars', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
  '--no-first-run', 'about:blank',
], { stdio: 'ignore' });

let wsUrl = null;
for (let i = 0; i < 60 && !wsUrl; i++) {
  try {
    const l = await (await fetch('http://127.0.0.1:9339/json/list')).json();
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
const ev = async (e) => {
  const r = await send('Runtime.evaluate', { expression: e, returnByValue: true });
  if (r.exceptionDetails) return '오류: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
};

await send('Runtime.enable'); await send('Page.enable');
fs.mkdirSync(OUT, { recursive: true });

for (const [name, w, h] of VIEWS) {
  await send('Emulation.setDeviceMetricsOverride', {
    width: w, height: h, deviceScaleFactor: 2, mobile: true,
  });
  await send('Page.navigate', { url: `http://127.0.0.1:${port}/` });
  await sleep(3500);
  await ev(`(()=>{document.getElementById('inp-class').value='A반';
    document.getElementById('inp-sid').value='202412345';
    document.getElementById('inp-name').value='홍길동';
    document.getElementById('inp-quality').value='low';
    document.querySelector('input[name=chatmode][value=offline]').checked=true;
    document.getElementById('btn-start').click(); return 1})()`);
  for (let i = 0; i < 120; i++) {
    await sleep(1000);
    if (await ev(`!!(window.GAME && GAME.beds && GAME.beds.length)`)) break;
  }
  await sleep(3000);
  await ev(`(()=>{GAME.player.x=0;GAME.player.z=-2;GAME.yaw=Math.PI;GAME.pitch=-0.05;return 1})()`);
  await sleep(2000);

  // 두 조작판이 겹치지 않는지 좌표로도 확인한다 (눈으로만 보면 놓친다)
  const geom = await ev(`(()=>{
    const m = document.getElementById('pad-move').getBoundingClientRect();
    const l = document.getElementById('pad-look').getBoundingClientRect();
    return JSON.stringify({
      화면: innerWidth + 'x' + innerHeight,
      이동판: Math.round(m.left)+','+Math.round(m.top)+' '+Math.round(m.width)+'x'+Math.round(m.height),
      시점판: Math.round(l.left)+','+Math.round(l.top)+' '+Math.round(l.width)+'x'+Math.round(l.height),
      겹침: (m.right > l.left) ? '겹침!' : '없음',
      화면밖: (m.left < 0 || l.right > innerWidth || m.bottom > innerHeight || l.bottom > innerHeight) ? '넘침!' : '없음',
    });
  })()`);
  console.log(name + ': ' + geom);

  const { data } = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(OUT, `mobile-${name}.png`), Buffer.from(data, 'base64'));
  console.log('  캡처: mobile-' + name + '.png');
}

sock.close(); chrome.kill(); srv.close();
