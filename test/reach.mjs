// reach.mjs — 모든 환자에게 실제로 걸어갈 수 있는지 점검한다
//
//   node test/reach.mjs
//
// 화면 캡처는 "보이는가"만 알려 준다. 방을 늘리거나 기구를 옮기고 나면
// 정작 문 앞을 장비가 막아 학생이 그 환자에게 못 가는 일이 생기는데,
// 그건 스크린샷에 안 찍힌다.
//
// 장면이 다 만들어진 뒤 GAME.obstacles / GAME.beds 를 그대로 읽어
// 출발 지점(GAME.player)에서 격자 채우기를 돌린다. 게임의 충돌 판정과
// 같은 규칙(축 정렬 상자 안이면 못 들어간다)을 쓴다.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.webp': 'image/webp',
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
  const hit = [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  ].find((c) => fs.existsSync(c));
  if (!hit) throw new Error('크롬/엣지를 찾지 못했습니다.');
  return hit;
}

class CDP {
  constructor(ws) {
    this.ws = ws; this.id = 0; this.waiting = new Map();
    ws.addEventListener('message', (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id && this.waiting.has(m.id)) {
        const { ok, no } = this.waiting.get(m.id); this.waiting.delete(m.id);
        m.error ? no(new Error(m.error.message)) : ok(m.result);
      }
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
  async eval(expr) {
    const r = await this.send('Runtime.evaluate', { expression: expr, returnByValue: true });
    if (r.exceptionDetails) {
      throw new Error('페이지 오류: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
    }
    return r.result.value;
  }
}

// 게임과 같은 규칙으로 격자 채우기. 셀 20cm.
function flood(room, boxes, start) {
  const S = 0.2;
  const nx = Math.round(room.w / S), nz = Math.round(room.d / S);
  const idx = (i, j) => j * nx + i;
  const toX = (i) => -room.w / 2 + (i + 0.5) * S;
  const toZ = (j) => -room.d / 2 + (j + 0.5) * S;
  const blocked = new Uint8Array(nx * nz);
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const x = toX(i), z = toZ(j);
      if (Math.abs(x) > room.w / 2 - 0.4 || Math.abs(z) > room.d / 2 - 0.4) { blocked[idx(i, j)] = 1; continue; }
      for (const b of boxes) {
        if (Math.abs(x - b.cx) < b.hw && Math.abs(z - b.cz) < b.hd) { blocked[idx(i, j)] = 1; break; }
      }
    }
  }
  const seen = new Uint8Array(nx * nz);
  const si = Math.round((start.x + room.w / 2) / S - 0.5);
  const sj = Math.round((start.z + room.d / 2) / S - 0.5);
  if (blocked[idx(si, sj)]) throw new Error('출발 지점이 막혀 있습니다');
  const q = [[si, sj]];
  seen[idx(si, sj)] = 1;
  const cells = [];
  while (q.length) {
    const [i, j] = q.pop();
    cells.push([toX(i), toZ(j)]);
    [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([di, dj]) => {
      const a = i + di, b = j + dj;
      if (a < 0 || b < 0 || a >= nx || b >= nz) return;
      if (seen[idx(a, b)] || blocked[idx(a, b)]) return;
      seen[idx(a, b)] = 1;
      q.push([a, b]);
    });
  }
  return cells;
}

async function main() {
  const { srv, port } = await serve();
  const profile = path.join(here, 'out', 'chrome-reach');
  fs.rmSync(profile, { recursive: true, force: true });
  const dbg = 9335;
  const chrome = spawn(chromePath(), [
    '--headless=new', `--remote-debugging-port=${dbg}`, `--user-data-dir=${profile}`,
    '--window-size=900,600', '--mute-audio', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--no-first-run', '--no-default-browser-check', '--disable-extensions', 'about:blank',
  ], { stdio: 'ignore' });

  let wsUrl = null;
  for (let i = 0; i < 60 && !wsUrl; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${dbg}/json/list`)).json();
      wsUrl = (list.find((t) => t.type === 'page') || {}).webSocketDebuggerUrl;
    } catch (e) { /* 아직 */ }
    if (!wsUrl) await sleep(500);
  }
  const ws = new WebSocket(wsUrl);
  await new Promise((r) => ws.addEventListener('open', r));
  const cdp = new CDP(ws);
  await cdp.send('Runtime.enable');
  await cdp.send('Page.navigate', { url: `http://127.0.0.1:${port}/` });
  await sleep(3000);
  await cdp.eval(`(()=>{
    document.getElementById('inp-class').value='점검'; document.getElementById('inp-sid').value='00000000';
    document.getElementById('inp-name').value='점검';
    const q=document.getElementById('inp-quality'); if(q) q.value='low';
    document.querySelector('input[name="chatmode"][value="offline"]').checked = true;
    document.getElementById('btn-start').click(); return true; })()`);

  let ready = false;
  for (let i = 0; i < 120 && !ready; i++) {
    await sleep(1000);
    ready = await cdp.eval('!!(window.GAME && GAME.beds && GAME.beds.length)');
  }
  if (!ready) { chrome.kill(); srv.close(); throw new Error('장면이 준비되지 않았습니다'); }

  const data = await cdp.eval(`({
    room: GAME.ROOM,
    start: { x: GAME.player.x, z: GAME.player.z },
    obstacles: GAME.obstacles.map(o => ({cx:o.cx,cz:o.cz,hw:o.hw,hd:o.hd})),
    beds: GAME.beds.map(b => ({id:b.patient.id, name:b.patient.name, cx:b.cx, cz:b.cz, hw:b.hw, hd:b.hd})),
    roster: PATIENTS.map(p => p.id),
  })`);
  chrome.kill(); srv.close();

  const boxes = data.obstacles.concat(data.beds.map((b) => ({ cx: b.cx, cz: b.cz, hw: b.hw, hd: b.hd })));
  const cells = flood(data.room, boxes, data.start);
  console.log('걸어 다닐 수 있는 넓이:', (cells.length * 0.04).toFixed(1), 'm²');

  let bad = 0;
  const seenIds = new Set();
  data.beds.forEach((b) => {
    if (seenIds.has(b.id)) { console.log('  ✗ 중복 등록:', b.id, b.name); bad++; }
    seenIds.add(b.id);
    // 게임의 판정 반경 2.6m 안에 닿을 수 있는 칸이 있어야 한다
    const ok = cells.some(([x, z]) => Math.hypot(x - b.cx, z - b.cz) < 2.6);
    console.log((ok ? '  ✓ ' : '  ✗ ') + b.id + ' ' + b.name +
      '  (' + b.cx.toFixed(2) + ', ' + b.cz.toFixed(2) + ')');
    if (!ok) bad++;
  });
  // 배치 누락 점검 — 데이터에는 있는데 어느 실에도 세우지 않은 환자를 잡는다.
  // 인원수를 상수로 박아 두면 환자를 늘릴 때마다 테스트가 먼저 깨진다.
  const missing = data.roster.filter((id) => !seenIds.has(id));
  if (missing.length) { console.log('  ✗ 배치되지 않은 환자:', missing.join(', ')); bad++; }

  console.log(bad ? `\n실패 ${bad}건` : `\n환자 ${data.beds.length}명 모두 접근 가능`);
  process.exit(bad ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
