// shoot.js — 3D 화면을 자동으로 캡처한다
//
//   node test/shoot.js                     기본(before) 이름으로 전 구역 캡처
//   node test/shoot.js after               after-*.png 로 캡처
//   node test/shoot.js after high 운동      화질·구역 지정
//
// 디자인을 고칠 때 눈으로 보지 않고 코드만 만지면 반드시 어긋난다.
// 헤드리스 크롬을 띄워 실제로 그려진 화면을 받아 온다.
// GPU가 없으므로 SwiftShader(소프트웨어 래스터라이저)로 돌린다 — 느리지만
// 색·형태·조명은 실제 GPU와 같게 나온다.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const OUT = path.join(here, 'shots');

const TAG = process.argv[2] || 'before';
const QUALITY = process.argv[3] || 'high';
const ONLY = process.argv[4] || '';

// 각 구역을 대표하는 카메라 자리 — [이름, x, z, 좌우각(도), 상하각(도)]
// rooms/kit.js 의 GAME.ZONE 좌표계를 따른다.
// yaw 규약: 0=-z 방향, 180=+z(안쪽), 90=-x, 270=+x
const SHOTS = [
  ['입구',     0.0, -8.5, 180, -3],
  ['전기치료실', 0.0, -1.0, 180, -5],
  ['운동치료실', 8.3, -7.0, 180, -5],
  ['운동기구',   8.5, 1.6,    0, -5],
  ['수치료실',   5.4, 3.7,  200, -6],
  ['수치료입구', 5.4, 1.2,  180, -2],
  ['케이블',     6.6, -0.3,  90, -3],
  ['보행풀',     7.9, 4.9,  205, -3],
  ['전신풀',     9.0, 4.0,  200, -14],
  ['도수복도',  -5.25, -4.6, 180, -5],
  ['도수룸',   -8.6, -1.9,  90, -5],
  ['특수치료',  -1.2, 2.2,  160, -6],
  ['충격파',    1.1, 7.6,  -47, -8],
  ['기구라인',   8.5, -5.6,   0, -3],
];

// 환자 앞으로 카메라를 자동으로 데려간다. 좌표를 손으로 적으면 배치가 바뀔 때마다
// 빈 벽을 찍게 된다 — 장면에 등록된 베드(GAME.beds)에서 직접 위치를 읽는다.
// side 가 참이면 베드 옆에서 본다.
//
// 정면(발치)에서만 찍으면 팔이 앞뒤로 얼마나 들렸는지가 안 보인다. 실제로
// 그 각도만 보고 자세를 맞췄다가, 팔을 45° 앞으로 든 사람을 눕혀 놓고
// 팔이 천장으로 솟은 걸 뒤늦게 알았다. 옆에서 한 장 더 찍는다.
const FACE_PATIENT = (idx, side) => `(()=>{
  const b = GAME.beds[${idx}];
  if (!b) return '베드 없음';
  ${side ? `
  // 정확히 옆(±x)에 서면 옆 침대나 수납장 안에 들어가 버린다. 발치에서
  // 비스듬히 보는 자리가 몸을 가장 잘 보여 주면서 가구도 피한다.
  GAME.player.x = b.cx - 0.95;
  GAME.player.z = b.cz - 0.95;
  GAME.yaw = 1.25 * Math.PI;   // +x·+z 사이를 본다
  GAME.pitch = -0.30;
  ` : `
  // 베드 앞(-z 쪽)에 바짝 서서 베드를 내려다본다.
  // 1.7m 로 물러섰더니 전기치료실에서는 커튼 밖으로 나가 화면이 온통
  // 커튼 천이었다 — 칸막이 안에 들어와 있어야 환자가 보인다.
  GAME.player.x = b.cx;
  GAME.player.z = b.cz - 1.15;
  GAME.yaw = Math.PI;      // +z 를 본다
  GAME.pitch = -0.22;
  `}
  return b.patient.name;
})()`;

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.webp': 'image/webp',
  '.json': 'application/json',
};

function serve() {
  const srv = http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split('?')[0]);
    if (p === '/') p = '/index.html';
    const f = path.join(root, p);
    if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) {
      res.writeHead(404); return res.end('not found');
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
    fs.createReadStream(f).pipe(res);
  });
  return new Promise((r) => srv.listen(0, '127.0.0.1', () => r({ srv, port: srv.address().port })));
}

function chromePath() {
  const candidates = [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  ];
  const hit = candidates.find((c) => fs.existsSync(c));
  if (!hit) throw new Error('크롬/엣지를 찾지 못했습니다.');
  return hit;
}

// ── CDP(크롬 개발자 프로토콜) 최소 클라이언트 ────────────────
class CDP {
  constructor(ws) { this.ws = ws; this.id = 0; this.waiting = new Map(); this.handlers = new Map();
    ws.addEventListener('message', (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id && this.waiting.has(m.id)) {
        const { ok, no } = this.waiting.get(m.id); this.waiting.delete(m.id);
        m.error ? no(new Error(m.error.message)) : ok(m.result);
      } else if (m.method && this.handlers.has(m.method)) this.handlers.get(m.method)(m.params);
    });
  }
  send(method, params = {}) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((ok, no) => {
      this.waiting.set(id, { ok, no });
      setTimeout(() => { if (this.waiting.delete(id)) no(new Error(method + ' 응답 없음')); }, 180000);
    });
  }
  on(method, fn) { this.handlers.set(method, fn); }
  async eval(expr, awaitPromise = false) {
    const r = await this.send('Runtime.evaluate', {
      expression: expr, returnByValue: true, awaitPromise,
    });
    if (r.exceptionDetails) throw new Error('페이지 오류: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
    return r.result.value;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const { srv, port } = await serve();
  const base = `http://127.0.0.1:${port}/`;
  console.log('로컬 서버:', base);

  const profile = path.join(here, 'out', 'chrome-profile');
  fs.rmSync(profile, { recursive: true, force: true });
  const dbg = 9333;
  const chrome = spawn(chromePath(), [
    '--headless=new', `--remote-debugging-port=${dbg}`, `--user-data-dir=${profile}`,
    '--window-size=1600,900', '--hide-scrollbars', '--mute-audio',
    // 소프트웨어 WebGL — GPU 없이도 three.js 가 돈다
    '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--no-first-run', '--no-default-browser-check', '--disable-extensions',
    'about:blank',
  ], { stdio: 'ignore' });

  // 디버깅 포트가 열릴 때까지
  let wsUrl = null;
  for (let i = 0; i < 60 && !wsUrl; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${dbg}/json/list`)).json();
      wsUrl = (list.find((t) => t.type === 'page') || {}).webSocketDebuggerUrl;
    } catch (e) { /* 아직 안 열림 */ }
    if (!wsUrl) await sleep(500);
  }
  if (!wsUrl) { chrome.kill(); srv.close(); throw new Error('크롬 디버깅 포트가 열리지 않았습니다.'); }

  const ws = new WebSocket(wsUrl);
  await new Promise((r) => ws.addEventListener('open', r));
  const cdp = new CDP(ws);

  const logs = [];
  await cdp.send('Runtime.enable');
  await cdp.send('Page.enable');
  cdp.on('Runtime.consoleAPICalled', (p) => {
    if (p.type === 'error' || p.type === 'warning') {
      logs.push(p.type + ': ' + p.args.map((a) => a.value ?? a.description ?? '').join(' '));
    }
  });
  cdp.on('Runtime.exceptionThrown', (p) => {
    logs.push('예외: ' + (p.exceptionDetails.exception?.description || p.exceptionDetails.text));
  });

  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 1600, height: 900, deviceScaleFactor: 1, mobile: false,
  });
  await cdp.send('Page.navigate', { url: base });
  await sleep(3500);

  // WebGL 이 실제로 되는지
  const gl = await cdp.eval(`(()=>{const c=document.createElement('canvas');
    const g=c.getContext('webgl2')||c.getContext('webgl'); if(!g) return '없음';
    const e=g.getExtension('WEBGL_debug_renderer_info');
    return e? String(g.getParameter(e.UNMASKED_RENDERER_WEBGL)) : '알수없음';})()`);
  console.log('WebGL:', gl);

  // 시작 화면 건너뛰기
  await cdp.eval(`(()=>{
    document.getElementById('inp-class').value = '점검용 분반';
    document.getElementById('inp-sid').value = '00000000';
    document.getElementById('inp-name').value = '캡처';
    const q = document.getElementById('inp-quality'); if (q) q.value = ${JSON.stringify(QUALITY)};
    document.querySelector('input[name="chatmode"][value="offline"]').checked = true;
    document.getElementById('btn-start').click();
    return true;
  })()`);

  // 장면이 만들어질 때까지 (절차적 PBR 맵 계산이 오래 걸린다)
  let ready = false;
  for (let i = 0; i < 120 && !ready; i++) {
    await sleep(1000);
    ready = await cdp.eval(`!!(window.GAME && GAME.scene && GAME.renderer && GAME.scene.children.length > 5)`);
  }
  if (!ready) { console.log('장면이 준비되지 않았습니다.'); logs.forEach((l) => console.log('  ' + l)); }
  else console.log('장면 준비 완료 · 화질등급:', await cdp.eval('RENDER.tier'));

  await sleep(4000);   // 그림자·환경광이 자리잡을 시간

  for (const [name, x, z, yaw, pitch] of SHOTS) {
    if (ONLY && !name.includes(ONLY)) continue;
    await cdp.eval(`(()=>{
      GAME.player.x = ${x}; GAME.player.z = ${z};
      GAME.yaw = ${yaw} * Math.PI / 180; GAME.pitch = ${pitch} * Math.PI / 180;
      return true;
    })()`);
    await sleep(2500);   // 소프트웨어 렌더라 몇 프레임 기다린다
    const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
    const file = path.join(OUT, `${TAG}-${name}.png`);
    fs.writeFileSync(file, Buffer.from(data, 'base64'));
    console.log('  캡처:', path.basename(file), (fs.statSync(file).size / 1024).toFixed(0) + ' KB');
  }

  // 환자를 가까이서 — 캐릭터 형상 확인용.
  // 베드 번호를 지정할 수 있다:  node test/shoot.js h2 high 캐릭터:0,7,10
  if (!ONLY || ONLY.startsWith('캐릭터')) {
    const idxs = (ONLY.split(':')[1] || '0,5').split(',').map(Number);
    for (const idx of idxs) {
      for (const side of [false, true]) {
        const who = await cdp.eval(FACE_PATIENT(idx, side));
        await sleep(2500);
        const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
        const file = path.join(OUT, `${TAG}-캐릭터${idx}${side ? '-옆' : ''}.png`);
        fs.writeFileSync(file, Buffer.from(data, 'base64'));
        console.log('  캡처:', path.basename(file), '—', who);
      }
    }
  }

  if (logs.length) {
    console.log('\n페이지 경고·오류');
    [...new Set(logs)].slice(0, 15).forEach((l) => console.log('  ' + l.slice(0, 200)));
  }

  ws.close(); chrome.kill(); srv.close();
  console.log('\n저장 위치:', OUT);
}

main().catch((e) => { console.error(e); process.exit(1); });
