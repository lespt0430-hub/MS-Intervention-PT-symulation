// shoot-figure.mjs — 인체 모델만 전신으로 크게 찍는다
//
//   node test/shoot-figure.mjs <glb경로> [출력이름] [거리m]
//
// probe-figure.mjs 로도 장면에 세워 볼 수는 있지만, 화면 아래쪽 조작판과 안내
// 문구가 딱 골반부터 아래를 가린다. 옷이 다리까지 내려오는지, 자세가 맞는지를
// 봐야 하는데 정작 그 부분이 안 보여서 "옷이 상체에만 붙었다"고 잘못 읽었다.
// 여기서는 캔버스만 남기고 전부 숨긴 뒤, 인물이 화면에 꽉 차게 잡는다.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const OUT = path.join(here, 'shots');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const MODEL = process.argv[2];
const NAME = process.argv[3] || 'figure';
const DIST = parseFloat(process.argv[4] || '2.6');
// 눈높이. 얼굴을 볼 때는 1.45 쯤으로 올려 잡는다 (기본은 가슴 높이)
const EYE = parseFloat(process.argv[5] || '0.95');
// 인물이 도는 각도(도). 180 이 정면, 0 이 뒷모습 — 등판을 볼 때 쓴다.
const YAW = parseFloat(process.argv[6] || '180');
if (!MODEL) { console.error('사용법: node test/shoot-figure.mjs <glb경로> [이름] [거리m]'); process.exit(1); }

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.webp': 'image/webp' };
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

const prof = path.join(here, 'out', 'chrome-figshot');
fs.rmSync(prof, { recursive: true, force: true });
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', [
  '--headless=new', '--remote-debugging-port=9339', `--user-data-dir=${prof}`,
  '--window-size=900,1200', '--hide-scrollbars',
  '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-first-run', 'about:blank',
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
const ev = async (e, aw = false) => {
  const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: aw });
  if (r.exceptionDetails) return '오류: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
};

await send('Runtime.enable'); await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 900, height: 1200, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: `http://127.0.0.1:${port}/` });
await sleep(3500);
await ev(`(()=>{document.getElementById('inp-class').value='점검용 분반';
  document.getElementById('inp-sid').value='00000000';
  document.getElementById('inp-name').value='촬영';
  document.getElementById('inp-quality').value='high';
  document.querySelector('input[name=chatmode][value=offline]').checked=true;
  document.getElementById('btn-start').click();return 1})()`);
for (let i = 0; i < 120; i++) {
  await sleep(1000);
  if (await ev(`!!(window.GAME && GAME.beds && GAME.beds.length)`)) break;
}

// 캔버스만 남기고 전부 숨긴다 (조작판·안내문이 하반신을 가리지 않게)
await ev(`(()=>{
  const cv = GAME.renderer.domElement;
  document.querySelectorAll('body *').forEach((el)=>{
    if (el !== cv && !el.contains(cv)) el.style.display='none';
  });
  return 1;
})()`);
await send('Emulation.setDeviceMetricsOverride', { width: 900, height: 1200, deviceScaleFactor: 1, mobile: false });
await ev(`window.dispatchEvent(new Event('resize'))`);

const info = await ev(`(async()=>{
  const loader = new TX.GLTFLoader();
  const gltf = await loader.loadAsync(${JSON.stringify(MODEL)});
  const m = gltf.scene;
  m.traverse(o=>{ if(o.isMesh){ o.castShadow = true; o.frustumCulled = false; } });
  // 전기치료실 중앙 복도 — 앞뒤로 트여 있어 전신을 담을 수 있다
  m.position.set(-0.5, 0, 0.5);
  m.rotation.y = ${YAW} * Math.PI / 180;
  GAME.scene.add(m);
  const box = new THREE.Box3().setFromObject(m);
  const size = box.getSize(new THREE.Vector3());
  let tris = 0, meshes = 0;
  m.traverse(o=>{ if(o.isMesh){ meshes++; const g=o.geometry;
    tris += g.index ? g.index.count/3 : g.attributes.position.count/3; }});
  return JSON.stringify({ 키m:+size.y.toFixed(3), 메시수:meshes, 삼각형:Math.round(tris) });
})()`, true);
console.log(info);

await sleep(3000);
// 인물 정면, 가슴 높이에서 본다
await ev(`(()=>{
  GAME.player.x=-0.5; GAME.player.z=0.5-${DIST}; GAME.yaw=Math.PI; GAME.pitch=0.02;
  if (GAME.camera) GAME.camera.position.y = ${EYE};
  return 1})()`);
await sleep(3000);

fs.mkdirSync(OUT, { recursive: true });
const { data } = await send('Page.captureScreenshot', { format: 'png' });
const file = path.join(OUT, NAME + '.png');
fs.writeFileSync(file, Buffer.from(data, 'base64'));
console.log('캡처:', path.relative(root, file));

sock.close(); chrome.kill(); srv.close();
