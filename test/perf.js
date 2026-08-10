// perf.js — 한 프레임을 그리는 데 드는 양을 잰다
//
//   node test/perf.js [화질]
//
// 소프트웨어 렌더러(SwiftShader)로 재는 FPS는 실제 GPU와 무관하므로 의미가 없다.
// 대신 GPU가 실제로 해야 하는 일의 양 — 드로우콜·삼각형·광원 수·장면을 몇 번
// 그리는지 — 를 센다. 이 값들은 하드웨어와 무관하게 비교할 수 있다.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const QUALITY = process.argv[2] || 'high';

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.webp': 'image/webp' };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function serve() {
  const srv = http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split('?')[0]);
    if (p === '/') p = '/index.html';
    const f = path.join(root, p);
    if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) {
      res.writeHead(404); return res.end('nf');
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
    fs.createReadStream(f).pipe(res);
  });
  return new Promise((r) => srv.listen(0, '127.0.0.1', () => r({ srv, port: srv.address().port })));
}

class CDP {
  constructor(ws) { this.ws = ws; this.id = 0; this.w = new Map();
    ws.addEventListener('message', (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id && this.w.has(m.id)) { const { ok, no } = this.w.get(m.id); this.w.delete(m.id);
        m.error ? no(new Error(m.error.message)) : ok(m.result); }
    });
  }
  send(method, params = {}) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((ok, no) => { this.w.set(id, { ok, no });
      setTimeout(() => { if (this.w.delete(id)) no(new Error(method + ' 시간초과')); }, 180000); });
  }
  async eval(expr) {
    const r = await this.send('Runtime.evaluate', { expression: expr, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  }
}

const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find((c) => fs.existsSync(c));

async function main() {
  const { srv, port } = await serve();
  const profile = path.join(here, 'out', 'chrome-perf');
  fs.rmSync(profile, { recursive: true, force: true });
  const dbg = 9334;
  const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${dbg}`,
    `--user-data-dir=${profile}`, '--window-size=1600,900', '--hide-scrollbars',
    '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--no-first-run', '--no-default-browser-check', 'about:blank'], { stdio: 'ignore' });

  let wsUrl = null;
  for (let i = 0; i < 60 && !wsUrl; i++) {
    try {
      const l = await (await fetch(`http://127.0.0.1:${dbg}/json/list`)).json();
      wsUrl = (l.find((t) => t.type === 'page') || {}).webSocketDebuggerUrl;
    } catch (e) { /* 대기 */ }
    if (!wsUrl) await sleep(500);
  }
  const ws = new WebSocket(wsUrl);
  await new Promise((r) => ws.addEventListener('open', r));
  const cdp = new CDP(ws);
  await cdp.send('Runtime.enable'); await cdp.send('Page.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 900, deviceScaleFactor: 1, mobile: false });
  await cdp.send('Page.navigate', { url: `http://127.0.0.1:${port}/` });
  await sleep(3500);

  await cdp.eval(`(()=>{document.getElementById('inp-class').value='점검용 분반';
    document.getElementById('inp-sid').value='00000000';
    document.getElementById('inp-name').value='측정';
    const q=document.getElementById('inp-quality'); if(q) q.value=${JSON.stringify(QUALITY)};
    document.querySelector('input[name="chatmode"][value="offline"]').checked=true;
    document.getElementById('btn-start').click(); return 1;})()`);

  let ready = false;
  for (let i = 0; i < 120 && !ready; i++) {
    await sleep(1000);
    ready = await cdp.eval(`!!(window.GAME && GAME.scene && GAME.renderer && GAME.scene.children.length>5)`);
  }
  if (!ready) { console.log('장면 준비 실패'); ws.close(); chrome.kill(); srv.close(); return; }

  // 복도 한가운데에서 안쪽을 본다 — 가장 많이 보이는 지점
  await cdp.eval(`(()=>{GAME.player.x=0;GAME.player.z=-1;GAME.yaw=Math.PI;GAME.pitch=-0.09;return 1;})()`);
  await sleep(3000);

  const s = await cdp.eval(`(()=>{
    const r = GAME.renderer, sc = GAME.scene;
    // 후처리를 거치면 info.render 에는 마지막 전체화면 패스(사각형 1개)만 남는다.
    // 장면 자체를 한 번 직접 그려서 진짜 드로우콜·삼각형을 읽는다.
    //
    // autoReset을 꺼야 한다. 켜 두면 render()가 시작할 때마다 카운터가 0이 되는데,
    // 반사면(Reflector)은 장면 렌더 도중에 render()를 한 번 더 부른다 —
    // 그 중첩 렌더가 카운터를 프레임 중간에 지워 버려서, 정작 가장 비싼 것을
    // 쓰는 쪽이 더 싸게 측정되는 거꾸로 된 결과가 나온다.
    // 끄고 직접 reset하면 중첩 렌더까지 합쳐 한 프레임의 총량이 잡힌다.
    r.info.autoReset = false;
    r.info.reset();
    r.render(sc, GAME.camera);
    const calls = r.info.render.calls, tris = r.info.render.triangles;
    r.info.autoReset = true;
    let lights = 0, meshes = 0, shadowCasters = 0;
    sc.traverse((o) => {
      if (o.isLight) lights++;
      if (o.isMesh) { meshes++; if (o.castShadow) shadowCasters++; }
    });
    // 반사면(Reflector)은 장면을 통째로 한 번 더 그린다 — 몇 개인지가 중요하다
    let reflectors = 0;
    sc.traverse((o) => { if (o.isMesh && o.onBeforeRender && o.material && /Reflect|Gloss/i.test(o.material.name || '')) reflectors++; });
    return {
      등급: RENDER.tier,
      드로우콜: calls,
      삼각형: tris,
      셰이더프로그램: r.info.programs ? r.info.programs.length : -1,
      텍스처: r.info.memory.textures,
      지오메트리: r.info.memory.geometries,
      광원수: lights,
      메시수: meshes,
      그림자메시: shadowCasters,
      후처리패스: RENDER.composer ? RENDER.composer.passes.length : 0,
      평면반사: RENDER.floorReflector ? 1 : 0,
      벽거울: RENDER.wallMirrors ? RENDER.wallMirrors.length : 0,
    };
  })()`);

  console.log('\n한 프레임에 드는 양 (화질 ' + QUALITY + ')');
  console.log('─'.repeat(46));
  Object.entries(s).forEach(([k, v]) => {
    console.log('  ' + k.padEnd(16, ' ') + String(v).padStart(12));
  });

  ws.close(); chrome.kill(); srv.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
