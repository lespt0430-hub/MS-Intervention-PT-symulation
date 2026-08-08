// rooms/kit.js — 공간 모듈 공용 부품 (치수 · 재질 · 가구)
//
// 도면 4장을 네 개의 공간 모듈로 나눠 짓는다.
//   rooms/layout.js   = 외벽·바닥·천장·구분벽·간판·조명   (전체 도면)
//   rooms/manual.js   = 도수치료실 프라이빗 룸 4개          (도수치료실 내부도면)
//   rooms/electro.js  = 전기치료실 커튼 베이 + 치료기 카트  (전기치료실 내부도면)
//   rooms/exercise.js = 운동치료실 트랙·슬링·기구           (운동치료실 내부도면)
// 이 파일에는 그 넷이 공유하는 것만 둔다. 진료 로직(game.js·ui.js)과는 무관하다.
//
// 좌표 규약 — 정면(출입구)이 -z, 안쪽이 +z.
// 출입구에서 안쪽을 보면 화면 왼쪽이 +x 이므로, 도면과 같은 순서로 보이려면
//   +x = 운동치료실 · 가운데 = 전기치료실 · -x = 도수치료실 이어야 한다.

const KIT = {};

// ── 평면 치수 (전체 도면) ────────────────────────────────────
GAME.ZONE = {
  wallT: 0.20,          // 실 구분벽 두께
  doorH: 2.40,          // 개구부(문선) 높이

  // 전기치료실을 x=0에 대칭으로 놓는다. 출입문·중앙 복도·정면 간판이 모두
  // x=0 한 줄에 서야 들어섰을 때 간판이 한쪽으로 밀려 보이지 않는다.
  divM: -3.90,          // 도수치료실 | 전기치료실 경계 벽 x
  divE: 3.90,           // 전기치료실 | 운동치료실 경계 벽 x

  // 도수치료실 — 안쪽 복도 한 줄 + 프라이빗 룸 4개
  manual: {
    // 복도 폭 2.7m — 1.6m로는 문선이 양쪽에서 튀어나와 답답하고
    // 두 사람이 스쳐 지나갈 수도 없다.
    corrWall: -6.60,    // 복도 ↔ 룸 경계 벽 x
    corrCX: -5.25,      // 복도 중심 x
    entryZ: -5.90,      // 전기치료실에서 들어오는 개구부 z
    roomZ: [-5.50, -1.90, 1.70, 5.30],   // 룸 4개 중심 z
    roomHD: 1.70,       // 룸 반깊이(z)
    bedX: -10.40,       // 치료 베드 중심 x (머리쪽 -x, 창가 벽 쪽)
  },

  // 전기치료실 — 중앙 복도 양옆 커튼 베이
  electro: {
    aisleCX: 0,         // 중앙 복도 중심 x — 출입문·간판과 같은 선
    bankL: -2.75,       // 좌(-x) 열 베드 중심 x (머리쪽이 -x 벽)
    bankR: 2.75,        // 우(+x) 열 베드 중심 x
    // 베이 4칸 중심 z (열마다). 앞쪽 1/3(z < -3.4)은 접수·대기 구역으로 비워 둔다 —
    // 커튼이 출입문 코앞에 서면 들어서자마자 시야가 막히고, 좌우 실 개구부(z -6.8~-3.6)도 가린다.
    bayZ: [-2.00, 0.80, 3.60, 6.40],
    bayHD: 1.40,        // 베이 반깊이 — 커튼이 서는 간격
  },

  // 운동치료실 — 바닥 보행 트랙 + 천장 슬링 트랙
  exercise: {
    entryZ: -5.20,      // 전기치료실에서 들어오는 개구부 z
    track: { w: 6.4, d: 8.4, r: 2.4, cx: 8.30, cz: 1.90 },
    mirrorZ: 0.60,      // 우측 외벽 대형 거울 중심 z
  },

  // 천장 등기구 자리 [x, z, 우선순위]. 벽으로 막힌 세 실을 각각 밝혀야 하므로
  // 예전처럼 중앙 한 줄로는 안 된다. render.js가 화질 등급에 맞춰 우선순위
  // 순서대로 켠다 — 0번만 켜도 세 실이 모두 커버되도록 흩어 놓았다.
  lights: [
    [-9.60, -5.50, 1], [-9.60, -1.90, 0], [-9.60, 1.70, 1], [-9.60, 5.30, 0],  // 도수 룸 4개
    [-5.25, -3.20, 2], [-5.25, 4.20, 2],                                        // 도수 복도
    [-2.75, -1.00, 0], [-2.75, 4.20, 1], [2.75, -1.00, 1], [2.75, 4.20, 0],     // 전기 양 열
    [0, -7.60, 2], [0, 6.60, 2],                                                // 전기 복도 앞뒤
    [5.60, -4.60, 0], [10.80, -4.60, 1], [5.60, 2.00, 1], [10.80, 2.00, 0],     // 운동 4구역
    [8.30, 7.60, 2],
  ],
};

// ── 캔버스 텍스트 (명패·간판·포스터) ─────────────────────────
// fontSize는 "희망 크기"일 뿐이고, 실제로는 판 안에 들어가도록 자동으로 줄인다.
// 한글은 글자당 폭이 커서 지정 크기 그대로 쓰면 간판 밖으로 삐져나간다 —
// 정면 간판('광주보건대학교 부속 물리치료실')이 실제로 그랬다.
function makeTextCanvas(lines, w, h, opts) {
  const o = opts || {};
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = o.bg || '#ffffff';
  ctx.fillRect(0, 0, w, h);
  if (o.border) { ctx.strokeStyle = o.border; ctx.lineWidth = 8; ctx.strokeRect(4, 4, w - 8, h - 8); }
  ctx.fillStyle = o.color || '#1a2b3c';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';

  const font = (px) => 'bold ' + px + 'px "Malgun Gothic", sans-serif';
  const pad = o.pad === undefined ? Math.round(Math.min(w, h) * 0.09) : o.pad;
  const availW = Math.max(8, w - pad * 2);
  const availH = Math.max(8, h - pad * 2);
  let fs = o.fontSize || 40;

  ctx.font = font(fs);
  let widest = 0;
  lines.forEach((ln) => { widest = Math.max(widest, ctx.measureText(ln).width || 0); });
  if (widest > availW) fs = Math.max(9, Math.floor(fs * (availW / widest)));   // 가로 맞춤
  if (lines.length * fs * 1.3 > availH) fs = Math.max(9, Math.floor(availH / (lines.length * 1.3)));  // 세로 맞춤
  ctx.font = font(fs);

  const lh = fs * 1.3;
  const startY = h / 2 - ((lines.length - 1) * lh) / 2;
  // maxWidth를 함께 넘겨 반올림 오차로 1~2px 넘치는 경우까지 막는다
  lines.forEach((ln, i) => ctx.fillText(ln, w / 2, startY + i * lh, availW));
  return RENDER.colorTex(cv);
}

// 인쇄물·명패용 재질. MeshBasic은 빛을 안 받아 어두운 방에서 혼자 떠 보이므로
// Standard로 두어 방의 조명을 함께 받게 한다.
function printedMat(tex, opt) {
  return new THREE.MeshStandardMaterial(Object.assign({
    map: tex, roughness: 0.85, metalness: 0,
  }, opt || {}));
}

// ── 재질 ─────────────────────────────────────────────────────
KIT._cache = {};
KIT.cache = function (key, make) {
  if (!KIT._cache[key]) KIT._cache[key] = make();
  return KIT._cache[key];
};

KIT.std = (color, opt) => new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.7 }, opt || {}));
KIT.steel = (color) => KIT.std(color || 0xb8c2c8, { metalness: 0.85, roughness: 0.22, envMapIntensity: 1.35 });
KIT.screen = (color) => new THREE.MeshStandardMaterial({
  color: 0x000000, emissive: color, emissiveIntensity: 0.9, roughness: 1,
});

// 실내 도장벽 — 도면의 벽은 따뜻한 아이보리다. 미세 요철(오렌지필)만 준다.
KIT.paint = () => KIT.cache('paint', () => RENDER.pbrMaterial(
  (g, S) => {
    g.fillStyle = '#efe9dd'; g.fillRect(0, 0, S, S);
    for (let i = 0; i < 2400; i++) {
      g.fillStyle = 'rgba(212,203,187,' + (Math.random() * 0.30) + ')';
      g.fillRect(Math.random() * S, Math.random() * S, 2.2, 2.2);
    }
  },
  { size: [256, 256], repeat: [4, 1], normalStrength: 0.8, normalScale: 0.32,
    rough: { base: 0.90, dark: 0.95 }, envMapIntensity: 0.7 }
));

// 목재 — 도면의 문선·헤더·수납장은 전부 밝은 오크다.
// 결은 촘촘하고 얕아야 한다. 굵고 깊게 그리면 가까이서 볼 때
// 나뭇결이 아니라 흐르는 물결무늬처럼 보인다(문선·옷장처럼 큰 면에서 특히).
KIT._drawWood = function (g, S, dark) {
  g.fillStyle = dark ? '#8a8a8a' : '#c69c68';
  g.fillRect(0, 0, S, S);
  for (let i = 0; i < 260; i++) {
    const y = Math.random() * S;
    const a = 0.04 + Math.random() * 0.09;
    g.strokeStyle = dark ? 'rgba(74,74,74,' + a + ')' : 'rgba(126,88,50,' + a + ')';
    g.lineWidth = 0.5 + Math.random() * 1.4;
    g.beginPath();
    g.moveTo(0, y);
    for (let x = 0; x <= S; x += 16) g.lineTo(x, y + Math.sin((x / S) * Math.PI * 2.4 + i) * 1.6);
    g.stroke();
  }
};
KIT.wood = () => KIT.cache('wood', () => RENDER.pbrMaterial(
  (g, S) => KIT._drawWood(g, S, false),
  { size: [256, 256], repeat: [3, 3], normalStrength: 0.7, normalScale: 0.22,
    rough: { base: 0.45, dark: 0.58 }, envMapIntensity: 0.9,
    height: (g, S) => KIT._drawWood(g, S, true) }
));
// 치료대 인조가죽 — 도면의 베드 매트는 전부 짙은 남색이다.
// 레자는 표면에 얇은 코팅이 있어 조명이 길게 미끄러진다. 러프니스를 낮추고
// 환경 반사를 올려야 천이 아니라 인조가죽으로 읽힌다.
KIT.leather = (color) => KIT.std(color || 0x2f3d58, { roughness: 0.34, metalness: 0.06, envMapIntensity: 1.35 });

// 프라이버시 커튼 — 도면은 크림색 주름 원단이다. (예전의 청·적 격자는 뺐다)
const CURTAIN_CACHE = {};
function curtainMaterial(widthMeters, heightMeters) {
  const H = heightMeters || 1.5;
  const key = widthMeters.toFixed(2) + 'x' + H.toFixed(2);
  if (CURTAIN_CACHE[key]) return CURTAIN_CACHE[key];

  // 주름(굵은 세로 결) + 직조(가는 격자)를 겹쳐 그린다.
  // 색상맵의 명암만으로는 평면이지만, 같은 패턴을 노멀맵으로 만들면
  // 빛의 방향에 따라 주름이 살아 움직인다.
  const draw = (g, S, dark) => {
    g.fillStyle = dark ? '#808080' : '#efe6d6';
    g.fillRect(0, 0, S, S);
    for (let x = 0; x < S; x++) {           // 주름: 부드러운 사인 음영
      const f = Math.sin((x / S) * Math.PI * 2 * 5);
      if (dark) {
        const v = Math.round(128 + f * 34);
        g.fillStyle = 'rgb(' + v + ',' + v + ',' + v + ')';
      } else {
        g.fillStyle = 'rgba(122,110,92,' + (0.13 - f * 0.10) + ')';
      }
      g.fillRect(x, 0, 1, S);
    }
    for (let i = 0; i < S; i += 4) {        // 직조 결 — 아주 약하게
      g.fillStyle = dark ? 'rgba(255,255,255,0.035)' : 'rgba(255,255,255,0.08)';
      g.fillRect(0, i, S, 1);
      g.fillStyle = dark ? 'rgba(0,0,0,0.035)' : 'rgba(150,134,110,0.05)';
      g.fillRect(0, i + 2, S, 1);
    }
  };

  const m = RENDER.pbrMaterial(
    (g, S) => draw(g, S, false),
    {
      // 주름 폭·직조 결의 실치수를 커튼 크기와 무관하게 유지한다.
      size: [256, 256], repeat: [widthMeters / 1.2, H / 1.5],
      normalStrength: 1.8, normalScale: 0.8,
      rough: { base: 0.95, dark: 0.99 }, envMapIntensity: 0.45,
      side: THREE.DoubleSide,
      // 실제 프라이버시 커튼은 폴리에스터 메시라 빛을 조금 통과시킨다.
      // 완전 불투명하면 베이 안이 새까매져 커튼이 콘크리트 칸막이로 보인다.
      transparent: true, opacity: 0.93, depthWrite: true,
      color: 0xf6efe2,
      height: (g, S) => draw(g, S, true),
    }
  );
  CURTAIN_CACHE[key] = m;
  return m;
}

// ── 충돌·접지그림자 등록 ─────────────────────────────────────
// 가구는 그림자 데칼까지, 벽은 충돌 판정만 등록한다.
// (벽에 데칼을 깔면 방 전체 바닥이 시커메진다)
GAME.aoSpots = [];
KIT.solid = function (cx, cz, hw, hd) {
  GAME.obstacles.push({ cx, cz, hw, hd });
  GAME.aoSpots.push({ cx, cz, hw, hd });
};
KIT.wallSolid = function (cx, cz, hw, hd) {
  GAME.obstacles.push({ cx, cz, hw, hd });
};

// ── 벽 한 줄 (개구부 포함) ───────────────────────────────────
// axis 'x' : z가 고정된 벽(길이는 x 방향) / axis 'z' : x가 고정된 벽
// openings: [{ c: 중심좌표, w: 폭, h: 높이 }]
KIT.wallRun = function (opt) {
  const Z = GAME.ZONE;
  const H = opt.height || GAME.ROOM.h;
  const t = opt.t || Z.wallT;
  const mat = opt.mat || KIT.paint();
  const axisX = opt.axis === 'x';
  const from = Math.min(opt.from, opt.to);
  const to = Math.max(opt.from, opt.to);
  const gaps = (opt.openings || []).slice().sort((a, b) => a.c - b.c);

  const slab = (a, b) => {
    const len = b - a;
    if (len < 0.02) return;
    const mid = (a + b) / 2;
    const sx = axisX ? len : t;
    const sz = axisX ? t : len;
    const m = new THREE.Mesh(new THREE.BoxGeometry(sx, H, sz), mat);
    m.position.set(axisX ? mid : opt.at, H / 2, axisX ? opt.at : mid);
    m.receiveShadow = true;
    GAME.scene.add(m);
    // 걸레받이 + 하부 보호패널(웨인스코팅) + 몰딩.
    // 외벽에는 텍스처로 그려 넣은 것을 실내 칸막이벽에는 형상으로 붙인다.
    // 이게 없으면 실내 벽만 아무 결이 없는 흰 판이라 방이 미완성으로 보인다.
    if (opt.skirt !== false) {
      const sk = new THREE.Mesh(new THREE.BoxGeometry(sx + 0.02, 0.14, sz + 0.02),
        KIT.cache('skirt', () => KIT.std(0xa8967a, { roughness: 0.5, metalness: 0.05 })));
      sk.position.set(m.position.x, 0.07, m.position.z);
      GAME.scene.add(sk);

      const wsX = axisX ? sx : t + 0.04;
      const wsZ = axisX ? t + 0.04 : sz;
      const ws = new THREE.Mesh(new THREE.BoxGeometry(wsX, 0.96, wsZ),
        KIT.cache('wainscot', () => KIT.std(0xdfd2b6, { roughness: 0.55, envMapIntensity: 0.8 })));
      ws.position.set(m.position.x, 0.62, m.position.z);
      ws.receiveShadow = true;
      GAME.scene.add(ws);

      const capX = axisX ? sx : t + 0.09;
      const capZ = axisX ? t + 0.09 : sz;
      const cap = new THREE.Mesh(new THREE.BoxGeometry(capX, 0.05, capZ),
        KIT.cache('wainCap', () => KIT.std(0xc2ae87, { roughness: 0.45, envMapIntensity: 0.9 })));
      cap.position.set(m.position.x, 1.12, m.position.z);
      GAME.scene.add(cap);
    }
    if (opt.collide !== false) KIT.wallSolid(m.position.x, m.position.z, sx / 2 + 0.12, sz / 2 + 0.12);
  };

  let cur = from;
  gaps.forEach((g) => {
    slab(cur, g.c - g.w / 2);
    const dh = g.h || Z.doorH;
    if (H - dh > 0.03) {         // 상인방
      const sx = axisX ? g.w : t;
      const sz = axisX ? t : g.w;
      const lint = new THREE.Mesh(new THREE.BoxGeometry(sx, H - dh, sz), mat);
      lint.position.set(axisX ? g.c : opt.at, (H + dh) / 2, axisX ? opt.at : g.c);
      GAME.scene.add(lint);
    }
    cur = g.c + g.w / 2;
  });
  slab(cur, to);
};

// ── 개구부 목재 문선 + 실명 명패 ─────────────────────────────
// 도면의 각 실 입구는 오크 문선에 검은 사인이 붙어 있다.
// 로컬 규약: 개구부는 local x 방향으로 열리고, 벽 두께는 local z.
KIT.portal = function (x, z, yaw, w, label, opt) {
  const o = opt || {};
  const H = o.h || GAME.ZONE.doorH;
  const T = o.t || 0.34;                    // 문선이 벽보다 앞뒤로 튀어나온 두께
  const g = new THREE.Group();
  const wood = KIT.wood();

  [-1, 1].forEach((s) => {
    const jamb = new THREE.Mesh(new THREE.BoxGeometry(0.16, H + 0.34, T), wood);
    jamb.position.set(s * (w / 2 + 0.08), (H + 0.34) / 2, 0);
    jamb.castShadow = true;
    g.add(jamb);
  });
  const head = new THREE.Mesh(new THREE.BoxGeometry(w + 0.32, 0.34, T), wood);
  head.position.set(0, H + 0.17, 0);
  head.castShadow = true;
  g.add(head);

  if (label) {
    const tex = makeTextCanvas([label], 512, 128, { bg: '#2b3239', color: '#f2f5f7', fontSize: 74 });
    const pw = Math.min(w * 0.66, 1.75);
    [1, -1].forEach((s) => {
      const pl = new THREE.Mesh(new THREE.PlaneGeometry(pw, pw / 4), printedMat(tex, { roughness: 0.4, envMapIntensity: 1.0 }));
      pl.position.set(0, H + 0.17, s * (T / 2 + 0.012));
      pl.rotation.y = s > 0 ? 0 : Math.PI;
      g.add(pl);
    });
  }
  g.position.set(x, 0, z);
  g.rotation.y = yaw;
  GAME.scene.add(g);
  return g;
};

// ── 치료 베드 (도수치료실 · 전기치료실 공용) ─────────────────
// 로컬 규약: 머리쪽 -z, 발끝 +z. 도면의 베드는 흰 프레임 + 남색 레자다.
KIT.bed = function (opt) {
  const o = opt || {};
  const W = o.w || 0.88, L = o.l || 2.05, H = o.h || 0.66;
  const g = new THREE.Group();

  const frame = new THREE.Mesh(new THREE.BoxGeometry(W, 0.11, L),
    KIT.std(0xeef1f3, { roughness: 0.35, metalness: 0.30, envMapIntensity: 1.1 }));
  frame.position.y = H - 0.11;
  frame.castShadow = true;
  g.add(frame);

  const legMat = KIT.steel(0xa7b2ba);
  [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, H - 0.16, 10), legMat);
    leg.position.set(sx * (W / 2 - 0.09), (H - 0.16) / 2 + 0.05, sz * (L / 2 - 0.12));
    g.add(leg);
    const caster = new THREE.Mesh(new THREE.SphereGeometry(0.048, 8, 6), KIT.std(0x39434a, { roughness: 0.6 }));
    caster.position.set(sx * (W / 2 - 0.09), 0.048, sz * (L / 2 - 0.12));
    g.add(caster);
  });

  // 매트리스 — 등판/좌판 2단으로 나누면 치료대처럼 보인다
  const mat = KIT.leather(o.color);
  const back = new THREE.Mesh(new THREE.BoxGeometry(W, 0.13, L * 0.42), mat);
  back.position.set(0, H + 0.005, -(L / 2 - L * 0.21));
  back.castShadow = true; back.receiveShadow = true;
  const seat = new THREE.Mesh(new THREE.BoxGeometry(W, 0.13, L * 0.58 - 0.02), mat);
  seat.position.set(0, H, (L / 2 - (L * 0.58 - 0.02) / 2));
  seat.castShadow = true; seat.receiveShadow = true;
  g.add(back, seat);

  // 베개 (머리쪽) — 도면의 베개도 같은 남색 계열이다
  const headZ = -(L / 2 - 0.30);
  const pillow = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.10, 0.34),
    KIT.std(o.pillow === undefined ? 0x3b4c6b : o.pillow, { roughness: 0.6 }));
  pillow.position.set(0, H + 0.115, headZ - 0.06);
  pillow.castShadow = true;
  g.add(pillow);

  // 하부 수납 바구니
  if (o.basket !== false) {
    const basket = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.16, 0.32),
      KIT.std(0x9aa3ab, { roughness: 0.55, envMapIntensity: 0.8 }));
    basket.position.set(0, 0.13, 0.42);
    g.add(basket);
  }

  return { group: g, H, headZ, W, L };
};

// ── 이동식 전기치료기 카트 ───────────────────────────────────
// 전기치료실 도면의 베드 옆마다 서 있는 흰 기기 + 바구니 달린 카트.
KIT.etCart = function (x, z, yaw) {
  const g = new THREE.Group();
  const body = KIT.std(0xf2f5f7, { roughness: 0.35, metalness: 0.08, envMapIntensity: 1.1 });
  const pole = KIT.steel(0xb4bec4);

  const box = new THREE.Mesh(new THREE.BoxGeometry(0.40, 0.26, 0.30), body);
  box.position.y = 0.94;
  box.castShadow = true;
  g.add(box);
  const face = new THREE.Mesh(new THREE.PlaneGeometry(0.30, 0.15),
    new THREE.MeshStandardMaterial({ color: 0x101c22, emissive: 0x2f86a4, emissiveIntensity: 0.8, roughness: 1 }));
  face.position.set(0, 0.97, 0.151);
  g.add(face);
  // 다이얼 두 개
  [-0.10, 0.10].forEach((dx) => {
    const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.02, 10), KIT.std(0x39434a));
    knob.rotation.x = Math.PI / 2;
    knob.position.set(dx, 0.855, 0.151);
    g.add(knob);
  });
  // 기둥·바퀴·선반
  [[-0.15, -0.12], [0.15, -0.12], [-0.15, 0.12], [0.15, 0.12]].forEach(([px, pz]) => {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.80, 6), pole);
    leg.position.set(px, 0.42, pz);
    g.add(leg);
    const wheel = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), KIT.std(0x39434a, { roughness: 0.6 }));
    wheel.position.set(px, 0.03, pz);
    g.add(wheel);
  });
  const tray = new THREE.Mesh(new THREE.BoxGeometry(0.40, 0.03, 0.30), KIT.steel(0xd4dade));
  tray.position.y = 0.40;
  g.add(tray);
  const wire = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.14, 0.24), KIT.std(0xdfe4e8, { roughness: 0.7 }));
  wire.position.y = 0.48;
  g.add(wire);
  // 전극 케이블 — 기기에서 베드 쪽으로 늘어진다
  [[-0.08, 0.9], [0.08, -0.8]].forEach(([off, tw]) => {
    const cable = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.006, 5, 14, Math.PI * 1.25),
      KIT.std(0x3c464d, { roughness: 0.75 }));
    cable.position.set(off, 0.86, 0.16);
    cable.rotation.set(Math.PI / 2, 0, tw);
    g.add(cable);
  });

  g.position.set(x, 0, z);
  g.rotation.y = yaw || 0;
  GAME.scene.add(g);
  KIT.solid(x, z, 0.28, 0.24);
  return g;
};

// ── 소가구 ───────────────────────────────────────────────────
KIT.stool = function (x, z) {
  const g = new THREE.Group();
  const seat = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.06, 14), KIT.std(0x2f3d58, { roughness: 0.7 }));
  seat.position.y = 0.52; seat.castShadow = true;
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.42, 8), KIT.steel());
  post.position.y = 0.28;
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.21, 0.035, 12), KIT.steel(0x9aa6ad));
  base.position.y = 0.04;
  g.add(seat, post, base);
  g.position.set(x, 0, z);
  GAME.scene.add(g);
  KIT.solid(x, z, 0.22, 0.22);
  return g;
};

// 목재 수납장 (도수 룸 · 복도)
KIT.cabinet = function (x, z, yaw, w, h, d) {
  const W = w || 0.9, H = h || 0.8, D = d || 0.42;
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(W, H, D), KIT.wood());
  body.position.y = H / 2;
  body.castShadow = true; body.receiveShadow = true;
  g.add(body);
  const top = new THREE.Mesh(new THREE.BoxGeometry(W + 0.04, 0.03, D + 0.04), KIT.std(0xe8e2d6, { roughness: 0.45 }));
  top.position.y = H + 0.015;
  g.add(top);
  const nDoor = W > 1.2 ? 3 : 2;
  for (let i = 0; i < nDoor; i++) {
    const hx = -W / 2 + W / nDoor * (i + 0.5);
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.14, 0.02), KIT.steel(0x9aa6ad));
    handle.position.set(hx + W / nDoor * 0.32, H * 0.6, D / 2 + 0.012);
    g.add(handle);
    const seam = new THREE.Mesh(new THREE.BoxGeometry(0.008, H - 0.06, 0.006), KIT.std(0x9c7c50));
    seam.position.set(-W / 2 + W / nDoor * (i + 1), H / 2, D / 2 + 0.006);
    if (i < nDoor - 1) g.add(seam);
  }
  g.position.set(x, 0, z);
  g.rotation.y = yaw || 0;
  GAME.scene.add(g);
  const c = Math.abs(Math.cos(yaw || 0)), s = Math.abs(Math.sin(yaw || 0));
  KIT.solid(x, z, (W / 2) * c + (D / 2) * s, (D / 2) * c + (W / 2) * s);
  return g;
};

// 협탁 + 탁상 스탠드 (도수 룸의 머리맡 — 도면의 따뜻한 조명)
KIT.lampTable = function (x, z, yaw) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.58, 0.40), KIT.wood());
  body.position.y = 0.29; body.castShadow = true;
  const top = new THREE.Mesh(new THREE.BoxGeometry(0.50, 0.03, 0.44), KIT.std(0xe8e2d6, { roughness: 0.45 }));
  top.position.y = 0.595;
  const handle = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.018, 0.018), KIT.steel(0x9aa6ad));
  handle.position.set(0, 0.40, 0.205);
  g.add(body, top, handle);
  // 스탠드 — 갓이 스스로 빛나야 도면의 노란 불빛이 나온다
  const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.05, 0.16, 10), KIT.std(0xc9b79a, { roughness: 0.5 }));
  stand.position.y = 0.68;
  const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.10, 0.14, 0.20, 16, 1, true),
    new THREE.MeshStandardMaterial({
      color: 0xf7ecd6, emissive: 0xffd9a0, emissiveIntensity: 0.9,
      roughness: 0.95, side: THREE.DoubleSide,
    }));
  shade.position.y = 0.86;
  g.add(stand, shade);
  g.position.set(x, 0, z);
  g.rotation.y = yaw || 0;
  GAME.scene.add(g);
  KIT.solid(x, z, 0.26, 0.24);
  return g;
};

// 액자 (도수 룸 벽의 풍경화)
KIT.frameArt = function (x, y, z, yaw, w, h) {
  const cv = document.createElement('canvas');
  cv.width = 256; cv.height = 160;
  const c = cv.getContext('2d');
  const sky = c.createLinearGradient(0, 0, 0, 160);
  sky.addColorStop(0, '#bcd8e8'); sky.addColorStop(1, '#e6eede');
  c.fillStyle = sky; c.fillRect(0, 0, 256, 160);
  c.fillStyle = 'rgba(126,150,132,0.75)';
  c.beginPath(); c.moveTo(0, 118); c.lineTo(70, 66); c.lineTo(140, 118); c.closePath(); c.fill();
  c.fillStyle = 'rgba(100,128,112,0.8)';
  c.beginPath(); c.moveTo(96, 122); c.lineTo(176, 58); c.lineTo(256, 122); c.closePath(); c.fill();
  c.fillStyle = '#cfd8c4'; c.fillRect(0, 118, 256, 42);
  c.fillStyle = 'rgba(150,170,150,0.5)';
  for (let i = 0; i < 9; i++) c.fillRect(i * 30, 122 + (i % 3) * 5, 22, 4);
  const g = new THREE.Group();
  const art = new THREE.Mesh(new THREE.PlaneGeometry(w, h), printedMat(RENDER.colorTex(cv), { roughness: 0.55 }));
  art.position.z = 0.022;
  const frame = new THREE.Mesh(new THREE.BoxGeometry(w + 0.07, h + 0.07, 0.04), KIT.wood());
  g.add(art, frame);
  g.position.set(x, y, z);
  g.rotation.y = yaw;
  GAME.scene.add(g);
  return g;
};

// 주름진 커튼면 — 평면에 노멀맵만 씌우면 정면에서 볼 때 판때기로 보이고
// 실루엣(가장자리)이 자로 자른 듯 곧게 나온다. 실제로 접힌 면을 만들어야
// 빛이 주름을 타고 흐르고 옆에서 봤을 때 두께감이 생긴다.
KIT.foldedPlane = function (w, h, folds) {
  const seg = Math.max(10, Math.round(w * 9));
  const g = new THREE.PlaneGeometry(w, h, seg, 1);
  const pos = g.attributes.position;
  const n = folds || Math.max(4, Math.round(w * 2.6));
  for (let i = 0; i < pos.count; i++) {
    pos.setZ(i, Math.sin((pos.getX(i) / w) * Math.PI * 2 * n) * 0.038);
  }
  pos.needsUpdate = true;
  g.computeVertexNormals();
  return g;
};

// 커튼 한 폭 (베이 칸막이 · 창가). 위쪽 레일까지 같이 세운다.
KIT.curtainPanel = function (opt) {
  const o = opt;
  const H = o.h || 2.2;
  const mat = curtainMaterial(o.w, H);
  const m = new THREE.Mesh(KIT.foldedPlane(o.w, H), mat);
  m.position.set(o.x, o.y === undefined ? H / 2 + 0.3 : o.y, o.z);
  m.rotation.y = o.yaw || 0;
  m.castShadow = false;
  GAME.scene.add(m);
  if (o.rail !== false) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(o.w, 0.05, 0.05), KIT.steel(0xc6cfd5));
    rail.position.set(o.x, (o.y === undefined ? H / 2 + 0.3 : o.y) + H / 2 + 0.05, o.z);
    rail.rotation.y = o.yaw || 0;
    GAME.scene.add(rail);
    // 천장 행거
    [-0.35, 0.35].forEach((f) => {
      const hg = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, GAME.ROOM.h - rail.position.y, 6), KIT.steel(0xc6cfd5));
      const dx = Math.cos(o.yaw || 0) * o.w * f;
      const dz = -Math.sin(o.yaw || 0) * o.w * f;
      hg.position.set(o.x + dx, (GAME.ROOM.h + rail.position.y) / 2, o.z + dz);
      GAME.scene.add(hg);
    });
  }
  return m;
};

// 직수형 정수기 — 위에 물통을 꽂는 구형이 아니라, 요즘 병원 대기실에 놓는
// 슬림 본체 + 컵 니치(오목한 취수 공간) 형태다. 니치를 진짜 빈 공간으로
// 만들어야(위·아래 몸통을 나누고 뒤판으로 잇는다) 고급 제품처럼 보인다.
KIT.waterPurifier = function (x, z, yaw) {
  const g = new THREE.Group();
  const W = 0.30, D = 0.34;
  const shell = KIT.std(0xf2f4f6, { roughness: 0.32, metalness: 0.06, envMapIntensity: 1.25 });
  const dark = KIT.std(0x2a3138, { roughness: 0.28, metalness: 0.25, envMapIntensity: 1.2 });
  const chrome = KIT.steel(0xc8d0d6);

  // 하부 몸통(필터부) + 상부 몸통(취수부) — 그 사이가 컵 니치
  const lower = new THREE.Mesh(new THREE.BoxGeometry(W, 0.56, D), shell);
  lower.position.y = 0.28;
  lower.castShadow = true;
  const upper = new THREE.Mesh(new THREE.BoxGeometry(W, 0.50, D), shell);
  upper.position.y = 0.99;
  upper.castShadow = true;
  // 니치 안쪽(뒤판) — 어두운 무광이라 안이 깊어 보인다
  const backWall = new THREE.Mesh(new THREE.BoxGeometry(W - 0.02, 0.20, 0.10), dark);
  backWall.position.set(0, 0.66, -D / 2 + 0.05);
  g.add(lower, upper, backWall);

  // 상부 전면 터치 패널 (켜져 있음)
  const panel = new THREE.Mesh(new THREE.BoxGeometry(W - 0.04, 0.30, 0.012), dark);
  panel.position.set(0, 1.06, D / 2 + 0.006);
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.09),
    new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0x54c8e8, emissiveIntensity: 0.85, roughness: 1 }));
  screen.position.set(0, 1.13, D / 2 + 0.014);
  // 냉·온수 표시등
  [[-0.06, 0x4aa3ff], [0.06, 0xff7a5c]].forEach(([ox, col]) => {
    const led = new THREE.Mesh(new THREE.CircleGeometry(0.011, 10),
      new THREE.MeshStandardMaterial({ color: 0x000000, emissive: col, emissiveIntensity: 1.1, roughness: 1 }));
    led.position.set(ox, 0.99, D / 2 + 0.014);
    g.add(led);
  });
  g.add(panel, screen);

  // 취수구 (니치 천장에서 내려온 크롬 노즐)
  const spout = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.09, 12), chrome);
  spout.position.set(0, 0.70, 0.02);
  const spoutTip = new THREE.Mesh(new THREE.CylinderGeometry(0.021, 0.016, 0.02, 12), chrome);
  spoutTip.position.set(0, 0.655, 0.02);
  // 물받이 그릴
  const tray = new THREE.Mesh(new THREE.BoxGeometry(W - 0.05, 0.012, D - 0.14), chrome);
  tray.position.set(0, 0.565, 0.03);
  g.add(spout, spoutTip, tray);

  // 상판 몰딩 (얇은 크롬 띠) — 밋밋한 흰 상자를 가전제품으로 보이게 한다
  const trim = new THREE.Mesh(new THREE.BoxGeometry(W + 0.012, 0.014, D + 0.012), chrome);
  trim.position.y = 1.245;
  g.add(trim);

  // 옆에 종이컵 디스펜서
  const cupTube = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.038, 0.26, 12),
    KIT.std(0xe7ebee, { roughness: 0.5, transparent: true, opacity: 0.85 }));
  cupTube.position.set(W / 2 + 0.06, 0.92, 0);
  g.add(cupTube);

  g.position.set(x, 0, z);
  g.rotation.y = yaw || 0;
  GAME.scene.add(g);
  const c = Math.abs(Math.cos(yaw || 0)), s = Math.abs(Math.sin(yaw || 0));
  KIT.solid(x, z, (W / 2 + 0.06) * c + (D / 2) * s, (D / 2) * c + (W / 2 + 0.06) * s);
  return g;
};

// 화분
KIT.plant = function (x, z, flip) {
  const s = GAME.scene;
  const potMat = KIT.std(0xb9b3a8, { roughness: 0.55, envMapIntensity: 0.9 });
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.20, 0.145, 0.34, 14), potMat);
  pot.position.set(x, 0.17, z); pot.castShadow = true;
  const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.212, 0.212, 0.04, 14), potMat);
  rim.position.set(x, 0.335, z);
  const soil = new THREE.Mesh(new THREE.CylinderGeometry(0.185, 0.185, 0.03, 12), KIT.std(0x4b3a2c, { roughness: 1.0 }));
  soil.position.set(x, 0.345, z);
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.032, 0.42, 8), KIT.std(0x5c7a4a, { roughness: 0.85 }));
  stem.position.set(x, 0.56, z);
  s.add(pot, rim, soil, stem);
  [[0.00, 0.90, 0.00, 0.30, 0x4e8d5b], [0.17, 0.76, 0.10, 0.21, 0x5b9c64],
   [-0.14, 0.80, -0.12, 0.18, 0x437c50]].forEach(([dx, y, dz, r, col]) => {
    const leaf = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 10), KIT.std(col, { roughness: 0.88, envMapIntensity: 0.6 }));
    leaf.position.set(x + dx * (flip || 1), y, z + dz);
    leaf.scale.y = 0.78;
    leaf.castShadow = true;
    s.add(leaf);
  });
  KIT.solid(x, z, 0.24, 0.24);
};

// ── 환자·치료사 배치 ─────────────────────────────────────────
KIT._checkTex = null;
KIT.checkSprite = function () {
  if (!KIT._checkTex) {
    KIT._checkTex = makeTextCanvas(['✓ 진료완료'], 512, 200, { bg: '#27ae60', color: '#ffffff', fontSize: 80 });
  }
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: KIT._checkTex, toneMapped: false }));
  sp.scale.set(1.1, 0.45, 1);
  sp.visible = false;
  return sp;
};

// 진료 판정 등록 — 학생이 E키로 접근하는 지점.
KIT.registerPatient = function (group, patient, cx, cz, hw, hd, checkY) {
  const check = KIT.checkSprite();
  check.position.set(0, checkY === undefined ? 1.75 : checkY, 0);
  group.add(check);
  GAME.beds.push({ patient, group, checkSprite: check, cx, cz, hw, hd });
};

// 이름표 — 어느 환자인지 멀리서 알아볼 수 있어야 한다.
// 앞면에만 글자를 인쇄한다. 양면(DoubleSide)으로 두면 뒤에서 봤을 때
// 글자가 좌우로 뒤집혀 읽혀서 표지가 아니라 오류처럼 보인다.
KIT.nameplate = function (parent, lines, x, y, z, yaw, w) {
  const W = w || 0.62;
  const geo = new THREE.PlaneGeometry(W, W * 0.47);
  const pl = new THREE.Mesh(geo,
    printedMat(makeTextCanvas(lines, 512, 240, { border: '#2c5f7c', fontSize: 52 }),
      { roughness: 0.45, envMapIntensity: 1.1 }));
  pl.position.set(x, y, z);
  pl.rotation.y = yaw || 0;
  parent.add(pl);
  // 뒷판은 4mm 뒤로 물린다 — 같은 자리에 겹치면 z-파이팅으로 지직거린다
  const a = yaw || 0;
  const back = new THREE.Mesh(geo, KIT.cache('plateBack', () => KIT.std(0xe8ecef, { roughness: 0.6 })));
  back.position.set(x - Math.sin(a) * 0.004, y, z - Math.cos(a) * 0.004);
  back.rotation.y = a + Math.PI;
  parent.add(back);
  return pl;
};

// 서 있는 치료사 — 도면처럼 환자 곁에 붙여 둔다.
// 인형은 자기 안에 "바닥에서 머리까지" 높이 오프셋을 갖고 있으므로
// 반드시 바깥 그룹으로 감싸서 옮긴다. 인형 자체의 position을 덮어쓰면
// 머리가 바닥 높이로 내려가 몸이 바닥 아래로 사라진다.
KIT.therapist = function (x, z, yaw, stance) {
  const g = new THREE.Group();
  g.add(buildTherapist(stance || 'handson'));
  g.position.set(x, 0, z);
  g.rotation.y = yaw;
  GAME.scene.add(g);
  GAME.obstacles.push({ cx: x, cz: z, hw: 0.30, hd: 0.30 });
  return g;
};

window.KIT = KIT;
