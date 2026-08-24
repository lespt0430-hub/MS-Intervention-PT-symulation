// probe-figure-cost.mjs — 지금 인형 1명 vs 리깅 모델 1명, 어느 쪽이 비싼가
//
//   node test/probe-figure-cost.mjs [glb주소]
//
// 인체를 .glb 로 바꾸면 삼각형은 늘고 드로우콜은 준다. 어느 쪽이 얼마나
// 움직이는지 모르면 "무겁겠지"라는 짐작으로 결정하게 된다. 둘 다 실측한다.
//
// 저사양 PC(사무용 내장 그래픽)에서는 삼각형보다 드로우콜이 먼저 막히는
// 경우가 많아서, 삼각형만 보고 판단하면 거꾸로 된 결론이 나올 수 있다.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const MODEL = process.argv[2] ||
  'https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/models/gltf/Michelle.glb';

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

const prof = path.join(here, 'out', 'chrome-figcost');
fs.rmSync(prof, { recursive: true, force: true });
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', [
  '--headless=new', '--remote-debugging-port=9338', `--user-data-dir=${prof}`,
  '--window-size=1280,720', '--hide-scrollbars',
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

await send('Runtime.enable'); await send('Page.enable');
await send('Page.navigate', { url: `http://127.0.0.1:${port}/` });
await sleep(3500);
await ev(`(()=>{document.getElementById('inp-class').value='점검용 분반';
  document.getElementById('inp-sid').value='00000000';
  document.getElementById('inp-name').value='비용';
  document.getElementById('inp-quality').value='low';
  document.querySelector('input[name=chatmode][value=offline]').checked=true;
  document.getElementById('btn-start').click();return 1})()`);
for (let i = 0; i < 120; i++) {
  await sleep(1000);
  if (await ev(`!!(window.GAME && GAME.beds && GAME.beds.length)`)) break;
}

// 장면에 실제로 서 있는 인물이 몇 명인지 — 확대했을 때의 총량을 가늠하려면 필요하다
const figCount = await ev(`(()=>{
  let n = 0;
  // 인물은 캡슐(CapsuleGeometry) 팔다리를 가진 그룹이다. 머리 구(SphereGeometry
  // 반지름 0.11)를 가진 그룹을 세면 사람 수가 나온다.
  GAME.scene.traverse((o)=>{
    if (o.isMesh && o.geometry && o.geometry.type === 'SphereGeometry'
        && Math.abs((o.geometry.parameters.radius || 0) - 0.11) < 1e-6) n++;
  });
  return n;
})()`);

// 지금 인형 1명 — 실제 빌더를 호출해 그대로 센다
const doll = await ev(`(()=>{
  // PATIENTS 는 const 라 window 에 붙지 않는다 — 전역 스코프에서 이름으로 읽는다
  const list = (typeof PATIENTS !== 'undefined') ? PATIENTS : [];
  const p = list[0] || { id: 'x', colors: {} };
  const fig = buildPatientFigure(p, { stance: 'stand' });
  let meshes = 0, tris = 0;
  const mats = new Set(), geos = new Set();
  fig.traverse((o)=>{
    if (!o.isMesh) return;
    meshes++;
    const g = o.geometry;
    tris += g.index ? g.index.count/3 : g.attributes.position.count/3;
    geos.add(g.uuid);
    (Array.isArray(o.material)?o.material:[o.material]).forEach(m=>m&&mats.add(m.uuid));
  });
  return JSON.stringify({ 메시수: meshes, 삼각형: Math.round(tris), 재질수: mats.size, 지오메트리수: geos.size });
})()`);

// 리깅 모델 1명
const rig = await ev(`(async()=>{
  try {
    const loader = new TX.GLTFLoader();
    const t0 = performance.now();
    const gltf = await loader.loadAsync(${JSON.stringify(MODEL)});
    const ms = Math.round(performance.now() - t0);
    let meshes = 0, tris = 0, bones = 0;
    const mats = new Set();
    gltf.scene.traverse((o)=>{
      if (o.isBone) bones++;
      if (!o.isMesh) return;
      meshes++;
      const g = o.geometry;
      tris += g.index ? g.index.count/3 : g.attributes.position.count/3;
      (Array.isArray(o.material)?o.material:[o.material]).forEach(m=>m&&mats.add(m.uuid));
    });
    return JSON.stringify({ 불러오기ms: ms, 메시수: meshes, 삼각형: Math.round(tris), 재질수: mats.size, 뼈개수: bones });
  } catch (e) { return JSON.stringify({ 오류: e.message }); }
})()`, true);

const d = JSON.parse(doll), r = JSON.parse(rig);
const N = figCount || 16;

console.log('\n인물 1명 비용 — 지금 인형 vs 리깅 모델');
console.log('─'.repeat(56));
console.log('  항목'.padEnd(18) + '지금 인형'.padStart(14) + '리깅 모델'.padStart(16));
const row = (k, a, b) => console.log('  ' + k.padEnd(16) + String(a).padStart(14) + String(b).padStart(16));
row('메시(드로우콜)', d.메시수, r.메시수);
row('삼각형', d.삼각형, r.삼각형);
row('재질', d.재질수, r.재질수);
row('뼈', '-', r.뼈개수);
console.log('');
console.log(`  장면 안 인물 수: 약 ${N}명`);
console.log('─'.repeat(56));
row('메시 합계', d.메시수 * N, r.메시수 * N);
row('삼각형 합계', d.삼각형 * N, r.삼각형 * N);
console.log('');
console.log(`  → 드로우콜 ${d.메시수 * N - r.메시수 * N >= 0 ? '감소' : '증가'} ${Math.abs(d.메시수*N - r.메시수*N).toLocaleString()}`);
console.log(`  → 삼각형 ${r.삼각형*N - d.삼각형*N >= 0 ? '증가' : '감소'} ${Math.abs(r.삼각형*N - d.삼각형*N).toLocaleString()}`);

sock.close(); chrome.kill(); srv.close();
