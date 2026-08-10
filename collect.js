// collect.js — 학생 결과 수집 · 교수 조회 · 엑셀 내보내기
//
// GitHub Pages에는 서버가 없으므로 교수님 구글 시트(Apps Script 웹 앱)를
// 수집처로 쓴다. 설정은 config.js 한 줄, 배포 절차는 PROFESSOR_SETUP.md.
//
// 통신 규약 — Apps Script 웹 앱은 사전요청(OPTIONS)을 처리하지 못한다.
// 그래서 본문을 text/plain 으로 보내 '단순 요청'으로 만든다(내용은 JSON 문자열).
//   { action:'submit', row:{...} }        학생 제출
//   { action:'list', user, pw }           교수 조회 (비밀번호는 스크립트가 검증)
//
// 비밀번호는 이 코드가 아니라 구글 쪽 스크립트에 저장되어 그쪽에서 대조한다.
// 정적 사이트라 소스가 공개되지만, 소스를 봐도 남의 결과를 볼 수 없다.

const COLLECT = {};

COLLECT.OUTBOX = 'ptsim_outbox';     // 전송 실패분 보관함
COLLECT.CLIENT = 'ptsim_client_id';  // PC 구분용 임의 식별자

COLLECT.cfg = function () { return window.PTSIM_CONFIG || {}; };
COLLECT.url = function () {
  // 교수님이 자기 PC에서만 임시로 다른 주소를 시험해 볼 수 있게 덮어쓰기 허용
  return (localStorage.getItem('ptsim_collect_url') || COLLECT.cfg().collectUrl || '').trim();
};
COLLECT.enabled = function () { return !!COLLECT.url(); };

COLLECT.clientId = function () {
  let id = localStorage.getItem(COLLECT.CLIENT);
  if (!id) {
    id = 'pc-' + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
    localStorage.setItem(COLLECT.CLIENT, id);
  }
  return id;
};

// ── 서버 호출 ────────────────────────────────────────────────
COLLECT.call = async function (payload, timeoutMs) {
  const url = COLLECT.url();
  if (!url) throw new Error('수집 서버 주소가 설정되지 않았습니다 (config.js).');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs || 15000);
  try {
    const res = await fetch(url, {
      method: 'POST',
      // text/plain 이어야 사전요청 없이 그대로 전송된다
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
      signal: ctrl.signal,
      redirect: 'follow',
    });
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); }
    catch (e) { throw new Error('서버 응답을 이해할 수 없습니다: ' + text.slice(0, 120)); }
    if (!data.ok) throw new Error(data.error || '서버가 요청을 거부했습니다.');
    return data;
  } finally {
    clearTimeout(timer);
  }
};

// ── 학생 제출 ────────────────────────────────────────────────
// 환자 한 명을 채점할 때마다 한 줄씩 보낸다. 시험 도중 인터넷이 끊겨도
// 이미 보낸 앞부분은 남고, 실패분은 보관함에 쌓아 두었다가 다시 시도한다.
COLLECT.buildRow = function (patient, record, studentName) {
  const s = record.scores || {};
  const dxOpt = (patient.diagnosisOptions || []).find((d) => d.id === record.dx);
  const txNames = (record.tx || []).map((id) => {
    const t = (patient.treatments || []).find((x) => x.id === id);
    return t ? t.name : id;
  });
  const missed = (patient.requiredExams || []).filter((id) => !(record.performed || []).includes(id));
  return {
    submittedAt: record.when || new Date().toISOString(),
    className: COLLECT.cfg().className || '',
    student: studentName || '',
    clientId: COLLECT.clientId(),
    patientId: patient.id,
    patientName: patient.name,
    condition: patient.chiefComplaint || '',
    histScore: s.hist, examScore: s.exam, dxScore: s.dx, txScore: s.tx, total: s.total,
    dxChosen: dxOpt ? dxOpt.name : (record.dx || ''),
    dxCorrect: record.dx === patient.correctDx ? 'O' : 'X',
    txChosen: txNames.join(' / '),
    examCount: (record.performed || []).length,
    examMissed: missed.length,
    chatTurns: (record.chat || []).filter((m) => m.role === 'student').length,
  };
};

COLLECT.outbox = function () {
  try { return JSON.parse(localStorage.getItem(COLLECT.OUTBOX)) || []; }
  catch (e) { return []; }
};
COLLECT.setOutbox = function (rows) {
  localStorage.setItem(COLLECT.OUTBOX, JSON.stringify(rows.slice(-200)));
};

COLLECT.submit = async function (patient, record, studentName) {
  if (!COLLECT.enabled()) return { skipped: true };
  const row = COLLECT.buildRow(patient, record, studentName);
  try {
    await COLLECT.call({ action: 'submit', row });
    COLLECT.flush();          // 밀려 있던 것도 같이 올린다
    return { ok: true };
  } catch (e) {
    const box = COLLECT.outbox();
    box.push(row);
    COLLECT.setOutbox(box);
    return { ok: false, error: e.message, queued: box.length };
  }
};

// 보관함 재전송 — 페이지를 열 때와 제출 성공 직후에 호출한다.
//
// 한 건이라도 실패하면 거기서 멈춘다. 학교 방화벽이 구글을 막아 응답이 아예
// 안 오는 상황에서 12건을 순서대로 15초씩 기다리면 3분 동안 붙잡혀 있게 된다.
// 어차피 같은 서버라 첫 건이 안 되면 나머지도 안 된다 — 남겨 두고 다음 기회
// (다음 제출·다음 접속)에 다시 시도하는 편이 낫다.
COLLECT.FLUSH_TIMEOUT = 8000;   // 배경 작업이라 제출(15초)보다 짧게 본다
COLLECT._flushing = false;

COLLECT.flush = async function () {
  if (!COLLECT.enabled()) return;
  if (COLLECT._flushing) return;     // 접속 직후와 제출 직후가 겹쳐 두 번 올리는 것 방지
  const box = COLLECT.outbox();
  if (!box.length) return;
  COLLECT._flushing = true;
  let sent = 0;
  try {
    for (const row of box) {
      try { await COLLECT.call({ action: 'submit', row }, COLLECT.FLUSH_TIMEOUT); }
      catch (e) { break; }
      sent += 1;
    }
    // 보낸 만큼만 덜어낸다. 그 사이 새로 쌓인 실패분은 건드리지 않는다.
    const now = COLLECT.outbox();
    COLLECT.setOutbox(now.slice(sent));
  } finally {
    COLLECT._flushing = false;
  }
  return { sent, left: COLLECT.pendingCount() };
};

COLLECT.pendingCount = function () { return COLLECT.outbox().length; };

// ── 교수 조회 ────────────────────────────────────────────────
COLLECT.fetchAll = async function (user, pw) {
  const data = await COLLECT.call({ action: 'list', user, pw }, 30000);
  return data.rows || [];
};

// ── 엑셀(.xlsx) 만들기 ───────────────────────────────────────
// 외부 라이브러리 없이 xlsx(=zip+xml)를 직접 조립한다.
// CSV로 내보내면 한글이 깨지거나 학번 앞의 0이 사라지는 사고가 잦아서,
// 엑셀이 그대로 여는 진짜 xlsx를 만든다.
COLLECT._crcTable = null;
COLLECT._crc32 = function (bytes) {
  if (!COLLECT._crcTable) {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c >>> 0;
    }
    COLLECT._crcTable = t;
  }
  const t = COLLECT._crcTable;
  let c = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i++) c = t[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
};

COLLECT._zip = function (files) {
  const enc = new TextEncoder();
  const parts = [];
  const central = [];
  let offset = 0;
  const u16 = (v) => [v & 0xFF, (v >> 8) & 0xFF];
  const u32 = (v) => [v & 0xFF, (v >> 8) & 0xFF, (v >> 16) & 0xFF, (v >>> 24) & 0xFF];

  files.forEach((f) => {
    const name = enc.encode(f.name);
    const data = enc.encode(f.data);
    const crc = COLLECT._crc32(data);
    // 로컬 헤더 (압축 없음 = store, 플래그 0x800 = 파일명 UTF-8)
    const head = [].concat(
      [0x50, 0x4B, 0x03, 0x04], u16(20), u16(0x0800), u16(0),
      u16(0), u16(0), u32(crc), u32(data.length), u32(data.length),
      u16(name.length), u16(0)
    );
    parts.push(new Uint8Array(head), name, data);
    central.push({ name, crc, size: data.length, offset });
    offset += head.length + name.length + data.length;
  });

  const cdir = [];
  central.forEach((c) => {
    const head = [].concat(
      [0x50, 0x4B, 0x01, 0x02], u16(20), u16(20), u16(0x0800), u16(0),
      u16(0), u16(0), u32(c.crc), u32(c.size), u32(c.size),
      u16(c.name.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(c.offset)
    );
    cdir.push(new Uint8Array(head), c.name);
  });
  const cdirSize = cdir.reduce((s, a) => s + a.length, 0);
  const end = new Uint8Array([].concat(
    [0x50, 0x4B, 0x05, 0x06], u16(0), u16(0),
    u16(central.length), u16(central.length), u32(cdirSize), u32(offset), u16(0)
  ));
  return new Blob(parts.concat(cdir, [end]), { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
};

COLLECT._esc = function (v) {
  return String(v === undefined || v === null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');   // 엑셀이 거부하는 제어문자 제거
};
COLLECT._col = function (i) {
  let s = '';
  i += 1;
  while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = (i - m - 1) / 26; }
  return s;
};

// header: [{key, label}] / rows: 객체 배열
COLLECT.toXlsx = function (header, rows, sheetName) {
  const cell = (ri, ci, val) => {
    const ref = COLLECT._col(ci) + (ri + 1);
    if (typeof val === 'number' && isFinite(val)) return '<c r="' + ref + '"><v>' + val + '</v></c>';
    return '<c r="' + ref + '" t="inlineStr"><is><t xml:space="preserve">' + COLLECT._esc(val) + '</t></is></c>';
  };
  let xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>';
  xml += '<row r="1">' + header.map((h, ci) => cell(0, ci, h.label)).join('') + '</row>';
  rows.forEach((r, i) => {
    xml += '<row r="' + (i + 2) + '">' +
      header.map((h, ci) => cell(i + 1, ci, r[h.key])).join('') + '</row>';
  });
  xml += '</sheetData></worksheet>';

  const name = COLLECT._esc(sheetName || '결과');
  return COLLECT._zip([
    { name: '[Content_Types].xml',
      data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
        '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
        '</Types>' },
    { name: '_rels/.rels',
      data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
        '</Relationships>' },
    { name: 'xl/workbook.xml',
      data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
        'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
        '<sheets><sheet name="' + name + '" sheetId="1" r:id="rId1"/></sheets></workbook>' },
    { name: 'xl/_rels/workbook.xml.rels',
      data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
        '</Relationships>' },
    { name: 'xl/worksheets/sheet1.xml', data: xml },
  ]);
};

COLLECT.HEADER = [
  { key: 'submittedAt', label: '제출시각' },
  { key: 'className', label: '분반' },
  { key: 'student', label: '학생(학번·이름)' },
  { key: 'patientId', label: '환자번호' },
  { key: 'patientName', label: '환자명' },
  { key: 'condition', label: '주호소' },
  { key: 'histScore', label: '문진(10)' },
  { key: 'examScore', label: '검사(10)' },
  { key: 'dxScore', label: '진단(10)' },
  { key: 'txScore', label: '치료(10)' },
  { key: 'total', label: '총점(40)' },
  { key: 'dxCorrect', label: '진단정답' },
  { key: 'dxChosen', label: '선택한 진단' },
  { key: 'txChosen', label: '선택한 치료' },
  { key: 'examCount', label: '시행검사수' },
  { key: 'examMissed', label: '누락필수검사' },
  { key: 'chatTurns', label: '문진질문수' },
  { key: 'clientId', label: 'PC식별자' },
];

COLLECT.download = function (blob, filename) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
};

COLLECT.downloadXlsx = function (rows, filename) {
  const stamp = new Date().toISOString().slice(0, 10);
  COLLECT.download(COLLECT.toXlsx(COLLECT.HEADER, rows, '진료결과'),
    filename || ('가상환자시뮬레이션_결과_' + stamp + '.xlsx'));
};

// 이 PC에 남아 있는 기록만으로 엑셀 만들기 (수집 서버를 안 쓸 때의 대비책)
COLLECT.localRows = function () {
  if (!window.UI || !UI.state) return [];
  return Object.keys(UI.state.records || {}).map((pid) => {
    const p = PATIENTS.find((x) => x.id === pid);
    if (!p) return null;
    return COLLECT.buildRow(p, UI.state.records[pid], UI.state.studentName);
  }).filter(Boolean);
};

window.COLLECT = COLLECT;
