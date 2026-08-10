// probe-figure.mjs — 사실적 인체 모델을 실제 치료실 장면에 넣어 본다
//
//   node test/probe-figure.mjs
//
// 자세 시스템까지 다 옮기고 나서 "생각한 그림이 아니었다"가 되면 손해가 크다.
// 앱 코드는 건드리지 않고, 돌아가는 장면에 모델 하나만 세워 놓고 찍어 본다.
// 지금 인형과 나란히 세워 차이를 눈으로 비교하기 위한 것이다.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const OUT = path.join(here, 'shots');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 모델 주소를 인자로 바꿔 가며 비교한다
//   node test/probe-figure.mjs <glb주소>
const MODEL = process.argv[2] ||
  'https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/models/gltf/Michelle.glb';

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

const prof = path.join(here, 'out', 'chrome-figure');
fs.rmSync(prof, { recursive: true, force: true });
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', [
  '--headless=new', '--remote-debugging-port=9337', `--user-data-dir=${prof}`,
  '--window-size=1600,900', '--hide-scrollbars',
  '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-first-run', 'about:blank',
], { stdio: 'ignore' });

let wsUrl = null;
for (let i = 0; i < 60 && !wsUrl; i++) {
  try {
    const l = await (await fetch('http://127.0.0.1:9337/json/list')).json();
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

await send('Runtime.enable'); await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 900, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: `http://127.0.0.1:${port}/` });
await sleep(3500);
await ev(`(()=>{document.getElementById('inp-class').value='점검용 분반';
  document.getElementById('inp-sid').value='00000000';
  document.getElementById('inp-name').value='비교';
  document.getElementById('inp-quality').value='high';
  document.querySelector('input[name=chatmode][value=offline]').checked=true;
  document.getElementById('btn-start').click();return 1})()`);
for (let i = 0; i < 120; i++) {
  await sleep(1000);
  if (await ev(`!!(window.GAME && GAME.beds && GAME.beds.length)`)) break;
}

// 베드 하나를 골라 그 옆에 모델을 세운다
console.log(await ev(`(async()=>{
  const b = GAME.beds[0];
  const loader = new TX.GLTFLoader();
  const gltf = await loader.loadAsync(${JSON.stringify(MODEL)});
  const m = gltf.scene;
  m.traverse(o=>{ if(o.isMesh){ o.castShadow = true; o.frustumCulled = false; } });
  // 전기치료실 중앙 복도 — 막힌 곳이 없어 카메라를 자유롭게 둘 수 있다
  m.position.set(-0.5, 0, 0.5);
  m.rotation.y = Math.PI;
  GAME.scene.add(m);
  window.__probe = m;
  return '세움 (베드 참고: ' + b.patient.name + ')';
})()`, true));

await sleep(4000);

// 모델 정면 2.4m 앞에서 본다 (전기치료실 복도라 시야가 트여 있다)
await ev(`(()=>{
  GAME.player.x=-0.5; GAME.player.z=-1.9; GAME.yaw=Math.PI; GAME.pitch=-0.02; return 1})()`);
await sleep(3000);
fs.mkdirSync(OUT, { recursive: true });
let { data } = await send('Page.captureScreenshot', { format: 'png' });
fs.writeFileSync(path.join(OUT, 'probe-비교.png'), Buffer.from(data, 'base64'));
console.log('캡처: probe-비교.png');

// 한 프레임 비용이 얼마나 늘었는지
console.log(await ev(`(()=>{
  const r=GAME.renderer;
  r.info.autoReset=false; r.info.reset(); r.render(GAME.scene, GAME.camera);
  const o={드로우콜:r.info.render.calls, 삼각형:r.info.render.triangles};
  r.info.autoReset=true; return JSON.stringify(o);
})()`));

sock.close(); chrome.kill(); srv.close();
