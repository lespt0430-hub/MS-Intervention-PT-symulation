// probe-crowd.mjs — 인물 24명을 전부 리깅 모델로 바꾸면 실제로 얼마가 드는가
//
//   node test/probe-crowd.mjs <glb경로> [인원수]
//
// 1명 비용에 인원수를 곱하면 될 것 같지만, 실제로는 두 가지가 어긋난다.
//   - SkeletonUtils.clone 이 지오메트리·재질을 공유하는지(안 하면 메모리가 24배)
//   - 시야 밖 컬링과 그림자 패스가 걸리면 드로우콜이 곱한 값과 달라진다
// 그래서 진짜로 24체를 세워 놓고 한 프레임을 재 본다.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const MODEL = process.argv[2];
const COUNT = parseInt(process.argv[3] || '24', 10);
if (!MODEL) { console.error('사용법: node test/probe-crowd.mjs <glb경로> [인원수]'); process.exit(1); }

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

const prof = path.join(here, 'out', 'chrome-crowd');
fs.rmSync(prof, { recursive: true, force: true });
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', [
  '--headless=new', '--remote-debugging-port=9342', `--user-data-dir=${prof}`,
  '--window-size=1600,900', '--hide-scrollbars',
  '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-first-run', 'about:blank',
], { stdio: 'ignore' });

let wsUrl = null;
for (let i = 0; i < 60 && !wsUrl; i++) {
  try {
    const l = await (await fetch('http://127.0.0.1:9342/json/list')).json();
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
  document.getElementById('inp-name').value='군중';
  document.getElementById('inp-quality').value='low';
  document.querySelector('input[name=chatmode][value=offline]').checked=true;
  document.getElementById('btn-start').click();return 1})()`);
for (let i = 0; i < 120; i++) {
  await sleep(1000);
  if (await ev(`!!(window.GAME && GAME.beds && GAME.beds.length)`)) break;
}

const measure = `(()=>{
  const r = GAME.renderer, sc = GAME.scene;
  r.info.autoReset = false; r.info.reset();
  r.render(sc, GAME.camera);
  const o = { 드로우콜: r.info.render.calls, 삼각형: r.info.render.triangles,
              지오메트리: r.info.memory.geometries, 텍스처: r.info.memory.textures };
  r.info.autoReset = true;
  let meshes = 0; sc.traverse((x)=>{ if(x.isMesh) meshes++; });
  o.메시수 = meshes;
  return JSON.stringify(o);
})()`;

// 복도 한가운데 — perf.js 와 같은 지점이라 값을 그대로 비교할 수 있다
await ev(`(()=>{GAME.player.x=0;GAME.player.z=-1;GAME.yaw=Math.PI;GAME.pitch=-0.09;return 1;})()`);
await sleep(2500);
const before = JSON.parse(await ev(measure));

// 24체를 세운다. SkeletonUtils.clone 은 뼈대는 새로 만들되 지오메트리·재질은
// 원본과 공유한다 — 공유가 되는지는 '지오메트리' 수가 안 늘어나는 것으로 확인한다.
const added = await ev(`(async()=>{
  const gltf = await new TX.GLTFLoader().loadAsync(${JSON.stringify(MODEL)});
  window.__crowd = [];
  for (let i = 0; i < ${COUNT}; i++) {
    const c = TX.SkeletonUtils.clone(gltf.scene);
    c.traverse(o=>{ if(o.isMesh) o.castShadow = true; });
    // 방 안에 고르게 흩는다 (도면 기준 x -12..12, z -9..9)
    c.position.set(-11 + (i % 8) * 3.1, 0, -8 + Math.floor(i / 8) * 5.5);
    c.rotation.y = Math.PI;
    GAME.scene.add(c);
    window.__crowd.push(c);
  }
  return ${COUNT};
})()`, true);
await sleep(3000);
const after = JSON.parse(await ev(measure));

console.log('\n인물 ' + added + '명을 리깅 모델로 세웠을 때');
console.log('─'.repeat(58));
console.log('  항목'.padEnd(14) + '세우기 전'.padStart(14) + '세운 뒤'.padStart(14) + '차이'.padStart(14));
for (const k of ['드로우콜', '삼각형', '메시수', '지오메트리', '텍스처']) {
  const d = after[k] - before[k];
  console.log('  ' + k.padEnd(12) + String(before[k]).padStart(14) + String(after[k]).padStart(14)
    + (d >= 0 ? '+' : '') + String(d).padStart(13));
}
console.log('');
console.log('  ※ 지오메트리 증가가 모델당 메시 수(3개) 정도에 그치면 clone 이 공유하고 있는 것');

sock.close(); chrome.kill(); srv.close();
