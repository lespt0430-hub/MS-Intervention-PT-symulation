// mock-apps-script.js — 구글 Apps Script 웹 앱을 실제 동작대로 흉내 내는 시험용 서버
//
// 로컬에서 아무 서버나 세워 놓고 시험하면 진짜 배포 환경에서만 터지는 문제를
// 놓친다. Apps Script 웹 앱은 보통 서버와 다음이 다르다.
//
//  1. POST .../exec 는 결과를 바로 주지 않고 302 로 script.googleusercontent.com
//     (다른 출처) 으로 넘긴다. 브라우저는 리다이렉트를 GET 으로 다시 요청한다.
//  2. 그래서 CORS 검사가 두 번(원 응답·리다이렉트 응답) 일어난다.
//  3. OPTIONS(사전요청)를 아예 처리하지 못한다 — 오면 실패로 봐야 한다.
//
// 그래서 이 모의 서버도 포트를 둘 쓴다. EXEC 포트가 302 를 주고, CONTENT 포트가
// 실제 JSON 을 준다. 브라우저의 same-origin 판정을 흉내 내려고 일부러 다른
// 포트를 쓴다(포트가 다르면 다른 출처다).

import http from 'node:http';

export const PROF_ID = 'prof';
export const PROF_PW = 'test-pw-1234';

export function createMockAppsScript(opts = {}) {
  const state = {
    rows: [],              // 시트에 쌓인 줄
    preflights: 0,         // OPTIONS 가 오면 센다 (오면 안 된다)
    submits: 0,
    // 'network' 끊김 · 'hang' 무응답 · 'error' 거부 · null 정상
    fail: opts.fail || null,
    // appendRow 를 원자적이지 않게 흉내 낼지 (동시 제출 경합 재현용).
    // 진짜 시트의 appendRow 도 '읽고 → 쓰는' 두 단계라 원자적이지 않다.
    racyAppend: !!opts.racyAppend,
    // LockService.getScriptLock() 을 쓰는지 (PROFESSOR_SETUP.md 의 현재 스크립트)
    lock: opts.lock !== false,
  };
  let lockChain = Promise.resolve();   // 스크립트 잠금 = 요청을 한 줄로 세운다
  const pending = new Map();   // 리다이렉트 토큰 → 응답 본문

  const json = (res, obj, extra = {}) => {
    const body = JSON.stringify(obj);
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      ...extra,
    });
    res.end(body);
  };

  // 시트 appendRow. Apps Script 는 doPost 를 동시에 여러 개 돌리고,
  // appendRow 자체는 잠금을 걸어 주지 않는다.
  async function rawAppend(row) {
    if (state.racyAppend) {
      // 읽고 → 잠깐 쉬고 → 쓴다. 진짜 동시 실행 경합과 같은 모양.
      const at = state.rows.length;
      await new Promise((r) => setTimeout(r, 5));
      state.rows[at] = row;
    } else {
      state.rows.push(row);
    }
  }

  // LockService.getScriptLock().waitLock() — 스크립트 전체를 한 줄로 세운다
  async function appendRow(row) {
    if (!state.lock) return rawAppend(row);
    const mine = lockChain.then(() => rawAppend(row));
    lockChain = mine.catch(() => {});
    return mine;
  }

  function handle(req) {
    return new Promise((resolve) => {
      let body = '';
      req.on('data', (c) => { body += c; });
      req.on('end', async () => {
        let reqObj;
        try { reqObj = JSON.parse(body); }
        catch (e) { return resolve({ ok: false, error: '본문을 읽을 수 없습니다.' }); }

        if (state.fail === 'error') return resolve({ ok: false, error: '모의 서버 강제 실패' });

        if (reqObj.action === 'submit') {
          state.submits += 1;
          await appendRow(reqObj.row || {});
          return resolve({ ok: true });
        }
        if (reqObj.action === 'list') {
          if (reqObj.user !== PROF_ID || reqObj.pw !== PROF_PW) {
            return resolve({ ok: false, error: '아이디 또는 비밀번호가 맞지 않습니다.' });
          }
          return resolve({ ok: true, rows: state.rows.slice() });
        }
        resolve({ ok: false, error: '알 수 없는 요청입니다.' });
      });
    });
  }

  // ── 본문(JSON)을 돌려주는 쪽 = script.googleusercontent.com 역할 ──
  const content = http.createServer((req, res) => {
    if (req.method === 'OPTIONS') { state.preflights += 1; res.writeHead(405); return res.end(); }
    const url = new URL(req.url, 'http://x');
    const token = url.searchParams.get('t');
    const payload = pending.get(token);
    pending.delete(token);
    if (payload === undefined) { res.writeHead(404); return res.end('no such token'); }
    json(res, payload);
  });

  // ── /exec = 웹 앱 주소. 302 만 준다 ──
  const exec = http.createServer(async (req, res) => {
    if (req.method === 'OPTIONS') {
      // 진짜 Apps Script 도 사전요청을 처리하지 못한다. 여기 걸리면 그건 곧
      // 브라우저에서 CORS 오류로 전송이 통째로 막힌다는 뜻이다.
      state.preflights += 1;
      res.writeHead(405, { Allow: 'GET, POST' });
      return res.end();
    }
    if (req.method === 'GET') {
      return json(res, { ok: true, msg: '가상환자시뮬레이션 수집기가 동작 중입니다.' });
    }
    if (state.fail === 'network') { req.destroy(); return; }
    // 무응답 — 학교 방화벽이 구글을 막아 연결만 물고 있는 상황
    if (state.fail === 'hang') { state.submits += 1; return; }

    const result = await handle(req);
    const token = Math.random().toString(36).slice(2);
    pending.set(token, result);
    res.writeHead(302, {
      Location: `http://127.0.0.1:${content.address().port}/echo?t=${token}`,
      'Access-Control-Allow-Origin': '*',
    });
    res.end();
  });

  return {
    state,
    async start() {
      await new Promise((r) => content.listen(0, '127.0.0.1', r));
      await new Promise((r) => exec.listen(0, '127.0.0.1', r));
      return `http://127.0.0.1:${exec.address().port}/exec`;
    },
    async stop() {
      await new Promise((r) => exec.close(r));
      await new Promise((r) => content.close(r));
    },
  };
}
