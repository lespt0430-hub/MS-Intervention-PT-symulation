// probe-gltf.mjs — 리깅된 인체 모델을 실제로 열어 뼈대 구조를 들여다본다
//
//   node test/probe-gltf.mjs
//
// 자세 시스템을 본(Bone) 회전으로 옮기려면 그 모델의 뼈 이름과 계층이
// 어떻게 생겼는지부터 알아야 한다. 후보 모델을 브라우저에서 실제로 열어
// 뼈 목록·삼각형 수·재질을 뽑아 본다. (여기서 받는 것은 조사용일 뿐,
// 저장소에 넣지 않는다 — 라이선스를 정한 뒤에 넣는다.)

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const CANDIDATES = [
  ['CesiumMan (Khronos 샘플)',
   'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/CesiumMan/glTF-Binary/CesiumMan.glb'],
  ['Xbot (three.js 예제 · Mixamo 계열)',
   'https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/models/gltf/Xbot.glb'],
  ['Michelle (three.js 예제 · Mixamo 계열)',
   'https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/models/gltf/Michelle.glb'],
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

const prof = path.join(here, 'out', 'chrome-probe');
fs.rmSync(prof, { recursive: true, force: true });
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', [
  '--headless=new', '--remote-debugging-port=9336', `--user-data-dir=${prof}`,
  '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-first-run', 'about:blank',
], { stdio: 'ignore' });

let wsUrl = null;
for (let i = 0; i < 60 && !wsUrl; i++) {
  try {
    const l = await (await fetch('http://127.0.0.1:9336/json/list')).json();
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
const send = (method, params = {}) => {
  const i = ++id; sock.send(JSON.stringify({ id: i, method, params }));
  return new Promise((ok) => waiting.set(i, { ok }));
};
const ev = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) return '오류: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
};

await send('Runtime.enable');
await send('Page.enable');
// index.html 을 열어 vendor 번들(THREE·TX)을 그대로 쓴다
await send('Page.navigate', { url: `http://127.0.0.1:${port}/` });
await sleep(3000);
console.log('GLTFLoader 존재:', await ev(`!!(window.TX && TX.GLTFLoader)`));
console.log('SkeletonUtils.clone 존재:', await ev(`!!(window.TX && TX.SkeletonUtils && TX.SkeletonUtils.clone)`));

for (const [name, url] of CANDIDATES) {
  console.log('\n' + '─'.repeat(64));
  console.log(name);
  const out = await ev(`(async()=>{
    try {
      const loader = new TX.GLTFLoader();
      const t0 = performance.now();
      const gltf = await loader.loadAsync(${JSON.stringify(url)});
      const ms = Math.round(performance.now() - t0);
      let tris = 0, skinned = 0, meshes = 0, mats = new Set();
      const bones = [];
      gltf.scene.traverse((o) => {
        if (o.isSkinnedMesh) skinned++;
        if (o.isMesh) { meshes++;
          const g = o.geometry;
          tris += g.index ? g.index.count / 3 : g.attributes.position.count / 3;
          (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m && mats.add(m.name || m.type));
        }
        if (o.isBone) bones.push(o.name);
      });
      const box = new THREE.Box3().setFromObject(gltf.scene);
      const size = box.getSize(new THREE.Vector3());
      return JSON.stringify({
        불러오기ms: ms,
        메시수: meshes, 스킨드메시: skinned,
        삼각형: Math.round(tris),
        뼈개수: bones.length,
        키m: +size.y.toFixed(2),
        애니메이션: gltf.animations.map(a=>a.name).slice(0,6),
        재질: [...mats].slice(0,6),
        뼈샘플: bones.slice(0, 26),
      }, null, 1);
    } catch (e) { return '실패: ' + e.message; }
  })()`);
  console.log(out);
}

sock.close(); chrome.kill(); srv.close();
