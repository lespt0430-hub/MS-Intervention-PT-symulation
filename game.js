// 3D 물리치료실 — Three.js r185
// 1인칭 이동(WASD + 마우스), 베드 12개, 환자 접근 시 진료 시작
// 빛·재질·화질 파이프라인은 render.js(RENDER)가 담당한다.

const GAME = {
  scene: null, camera: null, renderer: null,
  yaw: 0, pitch: 0,
  keys: {},
  player: { x: 0, z: 0, speed: 3.2 },
  beds: [], // {patient, group, checkSprite, cx, cz, hw, hd}
  obstacles: [], // 장비 충돌 박스 {cx, cz, hw, hd}
  nearPatient: null,
  locked: false,
  lastT: 0,
  qualityPref: 'auto',  // index.html이 시작 전에 채운다
  ROOM: { w: 24, d: 15, h: 3.4 }, // x: -12..12, z: -7.5..7.5
};

function initGame() {
  const c = GAME;
  RENDER.resolveTier(c.qualityPref);

  c.scene = new THREE.Scene();
  c.scene.background = new THREE.Color(0xc4d3de);
  // 안개 없음 — 실내 20m 거리에 대기원근을 넣으면 먼 벽이 하얗게 떠서
  // 오히려 실물감을 깎는다. r128 버전의 흐릿한 느낌의 주범이었다.

  // 시야각 64° — r128 버전의 70°는 실내에서 원근이 과장되어 게임처럼 보였다
  c.camera = new THREE.PerspectiveCamera(64, window.innerWidth / window.innerHeight, 0.1, 100);
  c.camera.position.set(0, 1.6, 0);

  c.renderer = RENDER.createRenderer(document.getElementById('canvas-wrap'));
  RENDER.buildEnvironment(c.renderer, c.scene);

  c.lastT = performance.now() / 1000;

  RENDER.buildLights(c.scene, c.ROOM);
  buildRoom();
  buildBeds();
  buildDecor();
  buildContactShadows();
  // 반사는 방·장비가 모두 들어온 뒤에 붙인다 (비칠 대상이 있어야 한다)
  RENDER.buildFloorReflection(c.scene, c.ROOM);
  RENDER.buildComposer(c.renderer, c.scene, c.camera);
  bindControls();
  animate();
}

// 침대·장비 밑에 접지 그림자를 깔아 물체가 바닥에 떠 보이지 않게 한다.
// 충돌 박스 목록을 그대로 재활용하므로 장비를 추가해도 자동으로 따라온다.
function buildContactShadows() {
  GAME.beds.forEach((b) => RENDER.aoDecal(GAME.scene, b.cx, b.cz, 0.62, 1.15));
  GAME.obstacles.forEach((o) => {
    if (o.hw < 0.15 || o.hd < 0.15) return;   // 커튼 레일 같은 얇은 판정은 제외
    RENDER.aoDecal(GAME.scene, o.cx, o.cz, o.hw, o.hd);
  });
}

// ── 캔버스 텍스처 유틸 ──
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
  const fs = o.fontSize || 40;
  ctx.font = 'bold ' + fs + 'px "Malgun Gothic", sans-serif';
  const lh = fs * 1.3;
  const startY = h / 2 - ((lines.length - 1) * lh) / 2;
  lines.forEach((ln, i) => ctx.fillText(ln, w / 2, startY + i * lh));
  return RENDER.colorTex(cv);
}

// 인쇄물·명패용 재질. MeshBasic은 빛을 안 받아 어두운 방에서 혼자 떠 보이므로
// Standard로 두어 방의 조명을 함께 받게 한다.
function printedMat(tex, opt) {
  return new THREE.MeshStandardMaterial(Object.assign({
    map: tex, roughness: 0.85, metalness: 0,
  }, opt || {}));
}

// ── 방 구조 ──
function buildRoom() {
  const { w, d, h } = GAME.ROOM;

  // 바닥 — 병원 리놀륨 시트. 광택면은 매끈하고(러프 0.3) 이음선 홈은 무광이다.
  // 노멀맵이 스펙클 알갱이와 홈을 실제 요철로 만들어 준다.
  const floorMat = RENDER.pbrMaterial(
    (fx) => {
      fx.fillStyle = '#e6e7df'; fx.fillRect(0, 0, 512, 512);
      // 넓은 얼룩 — 단색 바닥이 플라스틱처럼 보이는 걸 막는다
      for (let i = 0; i < 26; i++) {
        const g = fx.createRadialGradient(Math.random() * 512, Math.random() * 512, 0,
          Math.random() * 512, Math.random() * 512, 60 + Math.random() * 110);
        g.addColorStop(0, 'rgba(202,205,193,0.20)');
        g.addColorStop(1, 'rgba(198,206,210,0)');
        fx.fillStyle = g; fx.fillRect(0, 0, 512, 512);
      }
      for (let i = 0; i < 2600; i++) { // 스펙클
        const g = 200 + Math.floor(Math.random() * 45);
        fx.fillStyle = 'rgba(' + g + ',' + (g + 4) + ',' + (g + 7) + ',' + (0.25 + Math.random() * 0.5) + ')';
        fx.fillRect(Math.random() * 512, Math.random() * 512, 1.6, 1.6);
      }
      for (let i = 0; i < 500; i++) { // 어두운 점
        fx.fillStyle = 'rgba(120,132,140,' + (0.12 + Math.random() * 0.2) + ')';
        fx.fillRect(Math.random() * 512, Math.random() * 512, 1.3, 1.3);
      }
      fx.strokeStyle = 'rgba(163,168,155,0.16)'; fx.lineWidth = 1.5;
      [[0, 0], [256, 256], [256, 0], [0, 256]].forEach(([x, y]) => fx.strokeRect(x, y, 256, 256));
    },
    {
      // 참고 사진의 치료실 바닥은 천장 조명이 그대로 비칠 만큼 광택이 강한
      // 폴리싱 에폭시다. 러프니스를 더 낮추고 환경광 반사를 올려 그 느낌을 맞춘다.
      size: [512, 512], repeat: [w / 4, d / 4], normalStrength: 1.1, normalScale: 0.5,
      rough: { base: 0.11, dark: 0.48 }, envMapIntensity: 1.7,
      // 높이: 알갱이는 아주 얕게, 이음선 홈은 깊게
      height: (hx) => {
        hx.fillStyle = '#808080'; hx.fillRect(0, 0, 512, 512);
        for (let i = 0; i < 2600; i++) {
          const v = 128 + Math.floor((Math.random() - 0.5) * 46);
          hx.fillStyle = 'rgb(' + v + ',' + v + ',' + v + ')';
          hx.fillRect(Math.random() * 512, Math.random() * 512, 1.6, 1.6);
        }
        hx.strokeStyle = '#5e5e5e'; hx.lineWidth = 2;
        [[0, 0], [256, 256], [256, 0], [0, 256]].forEach(([x, y]) => hx.strokeRect(x, y, 256, 256));
      },
    }
  );
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(w, d), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  GAME.scene.add(floor);

  // 보행 훈련 트랙 — 참고 사진(운동2)의 치료실 바닥에 그려진 것은 직선 레인이
  // 아니라 빨강·노랑 이중선으로 도색한 타원 트랙이다. 환자가 한 바퀴 돌며 걷는
  // 용도라, 직선 레인보다 이쪽이 실제 재활치료실의 바닥 풍경에 가깝다.
  // 장비는 트랙 안쪽에 모여 있으므로 선이 장비를 관통하지 않는다.
  const TRK = { w: 21.0, d: 7.0, r: 2.4 };   // 트랙 바깥 치수(m)·모서리 반경
  const PX = 96;                             // m → px
  const trackCv = document.createElement('canvas');
  trackCv.width = Math.round(TRK.w * PX);
  trackCv.height = Math.round(TRK.d * PX);
  const tg = trackCv.getContext('2d');
  // 선 이외는 완전 투명 — 바닥 재질이 그대로 비쳐야 도색한 선으로 보인다
  tg.clearRect(0, 0, trackCv.width, trackCv.height);
  const roundRectPath = (ctx, x, y, ww, hh, r) => {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + ww, y, x + ww, y + hh, r);
    ctx.arcTo(x + ww, y + hh, x, y + hh, r);
    ctx.arcTo(x, y + hh, x, y, r);
    ctx.arcTo(x, y, x + ww, y, r);
    ctx.closePath();
  };
  tg.lineJoin = 'round';
  // 바깥에서 안으로: 빨강 → 노랑 → (보행 레인 1.5m) → 노랑 → 빨강
  [[0.12, '#c2453c'], [0.32, '#e0ae33'], [1.82, '#e0ae33'], [2.02, '#c2453c']].forEach(([inset, col]) => {
    tg.strokeStyle = col;
    tg.lineWidth = 0.07 * PX;
    roundRectPath(tg, inset * PX, inset * PX,
      (TRK.w - inset * 2) * PX, (TRK.d - inset * 2) * PX,
      Math.max(0.25, TRK.r - inset) * PX);
    tg.stroke();
  });
  const track = new THREE.Mesh(
    new THREE.PlaneGeometry(TRK.w, TRK.d),
    new THREE.MeshStandardMaterial({
      map: RENDER.colorTex(trackCv), transparent: true, roughness: 0.30,
      metalness: 0, envMapIntensity: 1.2, depthWrite: false,
    })
  );
  track.rotation.x = -Math.PI / 2;
  track.position.set(0, 0.004, 0);
  GAME.scene.add(track);

  // 천장 — 600×600 미네랄울 흡음 타일. 실제 병원 천장의 특징인
  // 미세 타공(perforation)을 넣으면 단조로운 흰 판이 즉시 천장으로 읽힌다.
  const ceilDraw = (g, S, dark) => {
    g.fillStyle = dark ? '#808080' : '#f4f7f8'; g.fillRect(0, 0, S, S);
    for (let i = 0; i < 420; i++) { // 타공
      const x = 12 + Math.random() * (S - 24), y = 12 + Math.random() * (S - 24);
      g.fillStyle = dark ? 'rgba(40,40,40,0.85)' : 'rgba(176,187,194,0.55)';
      g.beginPath(); g.arc(x, y, 1.5, 0, 7); g.fill();
    }
    if (!dark) {
      for (let i = 0; i < 500; i++) {
        g.fillStyle = 'rgba(196,206,212,' + Math.random() * 0.22 + ')';
        g.fillRect(Math.random() * S, Math.random() * S, 1.5, 1.5);
      }
    }
    // 타일 사이 T바 홈
    g.strokeStyle = dark ? '#303030' : '#cbd5da';
    g.lineWidth = 5; g.strokeRect(0, 0, S, S);
  };
  const ceilMat = RENDER.pbrMaterial(
    (g, S) => ceilDraw(g, S, false),
    { size: [256, 256], repeat: [w / 0.6, d / 0.6], normalStrength: 1.6, normalScale: 0.7,
      rough: { base: 0.95, dark: 1.0 }, envMapIntensity: 0.5,
      height: (g, S) => ceilDraw(g, S, true) }
  );
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(w, d), ceilMat);
  ceil.rotation.x = Math.PI / 2; ceil.position.y = h;
  GAME.scene.add(ceil);

  // 벽 — 상단 도장 + 하단 웨인스코팅(보호 패널)
  // 실제 병원 벽은 상단이 무광 도장(러프 0.88), 하단 보호패널은 물청소용
  // 반광 시트(러프 0.5)다. 이 차이를 러프니스맵으로 주면 벽이 훨씬 실물 같다.
  const WALL_TILE = 4;                                  // 텍스처 1장이 덮는 폭(m)
  const bandTop = 512 * (1 - 1.1 / h);                  // 바닥에서 1.1m 지점
  const wallDraw = (g, W, H, dark) => {
    g.fillStyle = dark ? '#8a8a8a' : '#f1eee7'; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 2600; i++) { // 도장면 미세 질감(오렌지필)
      const a = Math.random() * (dark ? 0.5 : 0.3);
      g.fillStyle = dark ? 'rgba(120,120,120,' + a + ')' : 'rgba(214,208,194,' + a + ')';
      g.fillRect(Math.random() * W, Math.random() * bandTop, 2.2, 2.2);
    }
    g.fillStyle = dark ? '#8f8f8f' : '#dfd2b6'; g.fillRect(0, bandTop, W, H - bandTop);
    for (let x = 0; x < W; x += 128) { // 패널 세로 홈
      g.strokeStyle = dark ? '#303030' : 'rgba(176,158,120,0.5)';
      g.lineWidth = dark ? 3 : 2;
      g.beginPath(); g.moveTo(x, bandTop + 10); g.lineTo(x, H - 8); g.stroke();
    }
    // 몰딩 — 튀어나온 띠라서 높이맵에서 밝게
    g.fillStyle = dark ? '#d8d8d8' : '#c2ae87'; g.fillRect(0, bandTop - 8, W, 11);
    if (dark) return;
    // 바닥·천장과 만나는 모서리의 주변광 차폐. 색상맵에만 그린다
    // (높이맵에 넣으면 없는 요철이 생긴다)
    const lo = g.createLinearGradient(0, H, 0, H - H * 0.12);
    lo.addColorStop(0, 'rgba(38,52,62,0.42)'); lo.addColorStop(1, 'rgba(38,52,62,0)');
    g.fillStyle = lo; g.fillRect(0, H - H * 0.12, W, H * 0.12);
    const hi = g.createLinearGradient(0, 0, 0, H * 0.09);
    hi.addColorStop(0, 'rgba(38,52,62,0.30)'); hi.addColorStop(1, 'rgba(38,52,62,0)');
    g.fillStyle = hi; g.fillRect(0, 0, W, H * 0.09);
  };
  const wallMat = RENDER.pbrMaterial(
    (g, W, H) => wallDraw(g, W, H, false),
    { size: [1024, 512], repeat: [w / WALL_TILE, 1], normalStrength: 1.3, normalScale: 0.6,
      rough: { base: 0.88, dark: 0.5 }, envMapIntensity: 0.85,
      height: (g, W, H) => wallDraw(g, W, H, true) }
  );
  // 짧은 벽은 같은 텍셀 밀도를 유지하려면 반복 횟수가 달라야 한다.
  // 캔버스는 재사용하고 텍스처만 복제해 반복값을 바꾼다 (Sobel 재계산 없음).
  const wallMatShort = wallMat.clone();
  ['map', 'normalMap', 'roughnessMap'].forEach((k) => {
    const t = wallMat[k].clone();
    t.repeat.set(d / WALL_TILE, 1);
    t.needsUpdate = true;
    wallMatShort[k] = t;
  });

  const mkWall = (ww, x, z, ry, mat) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(ww, h), mat);
    m.position.set(x, h / 2, z); m.rotation.y = ry;
    m.receiveShadow = true;
    GAME.scene.add(m);
  };
  mkWall(w, 0, -d / 2, 0, wallMat);
  mkWall(w, 0, d / 2, Math.PI, wallMat);
  mkWall(d, -w / 2, 0, Math.PI / 2, wallMatShort);
  mkWall(d, w / 2, 0, -Math.PI / 2, wallMatShort);

  // 걸레받이
  const skirtMat = new THREE.MeshStandardMaterial({ color: 0xa8967a, roughness: 0.45, metalness: 0.05 });
  [[w, 0, -d / 2 + 0.02, 0], [w, 0, d / 2 - 0.02, Math.PI], [d, -w / 2 + 0.02, 0, Math.PI / 2], [d, w / 2 - 0.02, 0, -Math.PI / 2]].forEach(([ww, x, z, ry]) => {
    const s = new THREE.Mesh(new THREE.PlaneGeometry(ww, 0.15), skirtMat);
    s.position.set(x, 0.075, z); s.rotation.y = ry;
    GAME.scene.add(s);
  });

  // 창문 (양쪽 긴 벽) — 입체 프레임 + 창밖 풍경 + 창살 + 창턱
  const gcv = document.createElement('canvas');
  gcv.width = 512; gcv.height = 256;
  const gg = gcv.getContext('2d');
  const grad = gg.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, '#8dc2ee'); grad.addColorStop(0.5, '#c3e2fa'); grad.addColorStop(0.78, '#e2f0f6');
  gg.fillStyle = grad; gg.fillRect(0, 0, 512, 256);
  gg.fillStyle = 'rgba(255,255,255,0.8)'; // 구름
  gg.beginPath(); gg.ellipse(140, 62, 68, 22, 0, 0, 7); gg.fill();
  gg.beginPath(); gg.ellipse(370, 96, 84, 24, 0, 0, 7); gg.fill();
  // 원경 실루엣 — 창밖에 뭔가 있으면 방이 "건물 안"으로 읽힌다
  gg.fillStyle = 'rgba(150,172,186,0.55)';
  [[20, 150, 70, 46], [104, 138, 52, 58], [300, 144, 86, 52], [400, 132, 60, 64]].forEach(([x, y, bw, bh]) => {
    gg.fillRect(x, y, bw, bh);
  });
  gg.fillStyle = 'rgba(108,142,110,0.75)'; // 가로수
  for (let i = 0; i < 14; i++) {
    const x = 8 + i * 37, r = 13 + Math.random() * 8;
    gg.beginPath(); gg.arc(x, 196 + Math.random() * 6, r, 0, 7); gg.fill();
  }
  gg.fillStyle = '#cfd9d2'; gg.fillRect(0, 210, 512, 46); // 지면
  const glassTex = RENDER.colorTex(gcv);
  // 창밖은 실내보다 훨씬 밝다. emissive로 처리해야 형광등 조명에 눌리지 않고,
  // 후처리 블룸에서 창가 빛번짐도 자연스럽게 생긴다.
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0x000000, emissive: 0xffffff, emissiveMap: glassTex,
    emissiveIntensity: 1.0, roughness: 1,
  });
  // 알루미늄 새시 — envMap이 있으니 metalness를 실제 값으로 올릴 수 있다
  const frameMat = new THREE.MeshStandardMaterial({ color: 0x9aa8b0, roughness: 0.3, metalness: 0.85, envMapIntensity: 1.2 });
  const mullMat = new THREE.MeshStandardMaterial({ color: 0xdde4e8, roughness: 0.4, metalness: 0.2 });
  for (let x = -8; x <= 8; x += 4) {
    [-1, 1].forEach((side) => {
      const zw = side * (d / 2);
      const win = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.3), glassMat);
      win.position.set(x, 1.9, zw - side * 0.05);
      win.rotation.y = side > 0 ? Math.PI : 0;
      GAME.scene.add(win);
      // 프레임 (박스 4변)
      [[2.6, 0.08, 0, 0.71], [2.6, 0.08, 0, -0.71], [0.08, 1.5, 1.3, 0], [0.08, 1.5, -1.3, 0]].forEach(([bw, bh, ox, oy]) => {
        const f = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, 0.09), frameMat);
        f.position.set(x + ox, 1.9 + oy, zw - side * 0.045);
        GAME.scene.add(f);
      });
      // 창살 (십자)
      const mv = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.3, 0.06), mullMat);
      mv.position.set(x, 1.9, zw - side * 0.04);
      const mh = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.05, 0.06), mullMat);
      mh.position.set(x, 1.9, zw - side * 0.04);
      GAME.scene.add(mv, mh);
      // 창턱
      const sill = new THREE.Mesh(new THREE.BoxGeometry(2.7, 0.05, 0.16), mullMat);
      sill.position.set(x, 1.22, zw - side * 0.1);
      GAME.scene.add(sill);
    });
  }

  // 출입문 (오른쪽 벽) — 양개형 도어
  const dcv = document.createElement('canvas');
  dcv.width = 256; dcv.height = 320;
  const dg = dcv.getContext('2d');
  dg.fillStyle = '#b7c9d4'; dg.fillRect(0, 0, 256, 320);
  dg.strokeStyle = '#8fa5b2'; dg.lineWidth = 5;
  dg.strokeRect(8, 8, 112, 304); dg.strokeRect(136, 8, 112, 304);
  dg.fillStyle = '#dcebf5'; dg.fillRect(30, 40, 68, 90); dg.fillRect(158, 40, 68, 90); // 창
  dg.fillStyle = '#5b6d78'; dg.fillRect(108, 160, 8, 46); dg.fillRect(140, 160, 8, 46); // 손잡이
  const door = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 2.3),
    new THREE.MeshStandardMaterial({ map: RENDER.colorTex(dcv), roughness: 0.35, metalness: 0.25, envMapIntensity: 1.1 }));
  door.position.set(w / 2 - 0.03, 1.15, 4.6);
  door.rotation.y = -Math.PI / 2;
  GAME.scene.add(door);

  // 정면 간판 — 아크릴 사인이라 살짝 광이 돈다
  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(7, 1.0),
    printedMat(makeTextCanvas(['광주보건대학교 부속 물리치료실'], 1024, 150, { bg: '#2c5f7c', color: '#ffffff', fontSize: 72 }),
      { roughness: 0.28, metalness: 0.1, envMapIntensity: 1.2 })
  );
  sign.position.set(0, 2.75, -GAME.ROOM.d / 2 + 0.05);
  GAME.scene.add(sign);

  // 천장 형광등 패널 — 실제로 빛을 내는 면(emissive)이라 블룸에서 번지고,
  // 거울·스테인리스 표면의 반사에도 잡힌다.
  const panelMat = new THREE.MeshStandardMaterial({
    color: 0x000000, emissive: 0xf6faff, emissiveIntensity: 2.3, roughness: 1, toneMapped: true,
  });
  const panelFrame = new THREE.MeshStandardMaterial({ color: 0xb8c2c8, roughness: 0.35, metalness: 0.6, envMapIntensity: 1.1 });
  for (let x = -8; x <= 8; x += 4) {
    const fr = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.07, 0.62), panelFrame);
    fr.position.set(x, h - 0.045, 0);
    const lp = new THREE.Mesh(new THREE.BoxGeometry(1.76, 0.075, 0.5), panelMat);
    lp.position.set(x, h - 0.044, 0);
    GAME.scene.add(fr, lp);
  }

  // 원형 매입 다운라이트 — 참고 사진 3장 모두에 있는 국내 병원 천장의 특징.
  // 28개를 개별 메시로 두면 내장 그래픽에서 드로우콜이 아까우므로
  // InstancedMesh로 묶어 전구·테두리 각각 1회 호출로 처리한다.
  const dlX = [-10.5, -7, -3.5, 0, 3.5, 7, 10.5];
  const dlZ = [-5.9, -2.4, 2.4, 5.9];
  const dlCount = dlX.length * dlZ.length;
  const bulbGeo = new THREE.CircleGeometry(0.085, 16);
  const ringGeo = new THREE.RingGeometry(0.085, 0.115, 16);
  const bulbs = new THREE.InstancedMesh(bulbGeo,
    new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xfff2dc, emissiveIntensity: 2.1, roughness: 1 }), dlCount);
  const rings = new THREE.InstancedMesh(ringGeo,
    new THREE.MeshStandardMaterial({ color: 0xf2f1ed, roughness: 0.45, metalness: 0.15, envMapIntensity: 1.0 }), dlCount);
  const m4 = new THREE.Matrix4();
  const qDown = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0)); // 아래를 향하게
  const one = new THREE.Vector3(1, 1, 1);
  let di = 0;
  dlX.forEach((x) => dlZ.forEach((z) => {
    m4.compose(new THREE.Vector3(x, h - 0.012, z), qDown, one);
    bulbs.setMatrixAt(di, m4);
    m4.compose(new THREE.Vector3(x, h - 0.016, z), qDown, one);
    rings.setMatrixAt(di, m4);
    di++;
  }));
  bulbs.instanceMatrix.needsUpdate = true;
  rings.instanceMatrix.needsUpdate = true;
  GAME.scene.add(bulbs, rings);
}

// ── 환자 인형: 질환별 자세 ──
// 좌표계: 베개 위치가 z=0, 발쪽이 +z, 천장이 +y. roll로 몸 전체를 옆/엎드림으로 돌린다.
const PATIENT_POSES = {
  p1: { armR: 'neck', props: ['neckroll', 'blanket'] },                                        // 목통증 — 목에 손, 목 베개
  p2: { armR: 'belly', props: ['blanket'] },                                                   // 오십견 — 아픈 팔을 배 위에
  p3: { armR: 'belly', armL: 'belly', props: ['blanket'] },                                    // 손목터널 — 양손을 배 위에 모아 쉬는 자세
  p4: { roll: -1.2, lift: 0.2, legR: { hip: 1.0, knee: 1.3 }, legL: { hip: 0.9, knee: 1.25 }, armR: 'forward', armL: 'forward' }, // 급성 요통 — 옆으로 웅크림
  p5: { legR: { hip: 0.6, knee: 1.0, abd: 0.5 }, armR: 'hip' },                                // 고관절 FAI — 다리 굽혀 벌림, 손은 사타구니
  p6: { legR: { hip: 0.15, knee: 0.25, abd: 0.35 }, armR: 'hip', armL: 'belly' },              // 고관절 OA — 다리 바깥 돌림, 손은 고관절
  p7: { legR: { hip: 0.7, knee: 1.25 }, armR: 'knee' },                                        // 반월판 — 무릎 세우고 손으로 잡음
  p8: { legR: { hip: 0.22, knee: 0.44 }, props: ['bolsterKneeR', 'wrapKneeR', 'iceKneeR'] },   // ACL — 무릎 받침 + 압박붕대 + 얼음
  p9: { legR: { hip: 0.35, knee: 0.6 }, legL: { hip: 0.35, knee: 0.6 }, armR: 'knee' },        // 슬개대퇴통증 — 양무릎 살짝 세우고 손은 무릎 앞
  p10: { roll: Math.PI, lift: 0.2, foot: 'prone' },                                            // 아킬레스건 — 엎드린 자세
  p11: { legR: { hip: 0.26, knee: 0.14 }, props: ['pillowAnkleR', 'wrapAnkleR', 'iceAnkleR'] }, // 발목염좌 — 다리 거상 + 붕대 + 얼음
  p12: { legR: { hip: 0.12, knee: 0.24 }, legL: { hip: 0.12, knee: 0.24 }, armR: 'belly', props: ['bolsterKnees'] }, // 족저근막염 — 무릎 아래 쿠션, 발 노출
};

function buildPatientFigure(patient) {
  const col = patient.colors || {};
  const M = {
    // 피부는 완전 무광이 아니다 — 약한 광택이 있어야 사람 피부로 읽힌다
    skin: new THREE.MeshStandardMaterial({ color: col.skin || 0xf1c8a8, roughness: 0.58, envMapIntensity: 0.7 }),
    hair: new THREE.MeshStandardMaterial({ color: col.hair || 0x2b2b2b, roughness: 0.5, envMapIntensity: 0.8 }),
    shirt: new THREE.MeshStandardMaterial({ color: col.blanket || 0xa8c8e0, roughness: 0.92, envMapIntensity: 0.5 }),
    pants: new THREE.MeshStandardMaterial({ color: 0x8195a6, roughness: 0.92, envMapIntensity: 0.5 }),
    white: new THREE.MeshStandardMaterial({ color: 0xf5f5f5, roughness: 0.9, envMapIntensity: 0.5 }),
    // 얼음팩 — 반투명하고 젖은 표면
    ice: new THREE.MeshStandardMaterial({ color: 0xbfe3f5, roughness: 0.12, metalness: 0.05, envMapIntensity: 1.4, transparent: true, opacity: 0.86 }),
    // 담요는 반원통 껍질이라 안쪽 면도 보인다 → DoubleSide
    blanket: new THREE.MeshStandardMaterial({ color: 0xdfe8f0, roughness: 0.97, envMapIntensity: 0.4, side: THREE.DoubleSide }),
    sheet: new THREE.MeshStandardMaterial({ color: 0xf4f7fa, roughness: 0.95, envMapIntensity: 0.4 }),
  };
  const pose = Object.assign({ roll: 0, lift: 0, legR: {}, legL: {}, armR: 'side', armL: 'side', foot: 'up', props: [] }, PATIENT_POSES[patient.id] || {});

  const fig = new THREE.Group();  // 침대 기준 (소품용)
  const body = new THREE.Group(); // 몸 좌표계 — roll/lift 적용
  body.rotation.z = pose.roll;
  body.position.y = pose.lift;
  fig.add(body);

  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const seg = (a, b, r, mat, parent) => {
    const dir = new THREE.Vector3().subVectors(b, a);
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, dir.length(), 14), mat);
    m.position.copy(a).addScaledVector(dir, 0.5);
    m.quaternion.setFromUnitVectors(V(0, 1, 0), dir.normalize());
    m.castShadow = true;
    (parent || body).add(m);
    return m;
  };
  const ball = (p, r, mat, parent) => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(r, 20, 16), mat);
    m.position.copy(p); m.castShadow = true;
    (parent || body).add(m);
    return m;
  };
  const box = (p, w, h, d, mat, parent) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.copy(p); m.castShadow = true;
    (parent || body).add(m);
    return m;
  };
  // 몸통·골반처럼 모서리가 없어야 하는 부위. 구 하나를 눌러 타원체로 쓴다
  // (직육면체로 두면 아무리 재질이 좋아도 사람이 아니라 상자로 읽힌다).
  const ellip = (p, rx, ry, rz, mat, parent) => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(1, 22, 16), mat);
    m.scale.set(rx, ry, rz);
    m.position.copy(p); m.castShadow = true;
    (parent || body).add(m);
    return m;
  };

  // 머리·얼굴
  const headC = V(0, 0.15, 0);
  ball(headC, 0.11, M.skin);
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.115, 24, 18, 0, Math.PI * 2, 0, Math.PI * 0.55), M.hair);
  hair.position.copy(headC);
  hair.quaternion.setFromUnitVectors(V(0, 1, 0), V(0, -0.55, -0.45).normalize());
  hair.castShadow = true;
  body.add(hair);
  if (patient.sex === '여') ball(V(0, 0.08, -0.13), 0.055, M.hair); // 묶은 머리
  if (Math.abs(pose.roll) < 2) { // 엎드린 자세가 아니면 눈이 보임
    ball(V(-0.035, 0.248, -0.030), 0.015, M.hair);
    ball(V(0.035, 0.248, -0.030), 0.015, M.hair);
  }

  // 목·몸통·골반·어깨
  seg(V(0, 0.13, 0.06), V(0, 0.115, 0.20), 0.05, M.skin);
  ellip(V(0, 0.105, 0.44), 0.215, 0.100, 0.28, M.shirt);   // 흉곽
  ellip(V(0, 0.095, 0.82), 0.185, 0.085, 0.17, M.pants);   // 골반
  ball(V(0.21, 0.12, 0.26), 0.065, M.shirt);
  ball(V(-0.21, 0.12, 0.26), 0.065, M.shirt);

  // 다리 (고관절 굴곡 hip / 무릎 굴곡 knee / 벌림 abd, 라디안)
  const joints = {};
  [['R', 1, pose.legR], ['L', -1, pose.legL]].forEach(([key, s, L]) => {
    const hip = L.hip || 0, knee = L.knee || 0, abd = L.abd || 0;
    const hp = V(s * 0.10, 0.09, 0.90);
    const tDir = V(s * Math.sin(abd), Math.sin(hip), Math.cos(hip) * Math.cos(abd)).normalize();
    const kp = hp.clone().addScaledVector(tDir, 0.38);
    const a2 = hip - knee;
    const sDir = V(s * Math.sin(abd) * 0.6, Math.sin(a2), Math.cos(a2)).normalize();
    const ap = kp.clone().addScaledVector(sDir, 0.38);
    seg(hp, kp, 0.075, M.pants);
    ball(kp, 0.07, M.pants);
    seg(kp, ap, 0.055, M.pants);
    const fDir = pose.foot === 'prone' ? V(0, -0.11, 0.10) : V(0, 0.12, 0.05);
    seg(ap, ap.clone().add(fDir), 0.05, M.skin);
    joints['knee' + key] = kp; joints['ankle' + key] = ap; joints['shankDir' + key] = sDir;
  });

  // 팔 (어깨→팔꿈치→손)
  const armTargets = (kind, s) => {
    const S = V(s * 0.23, 0.12, 0.26);
    switch (kind) {
      case 'neck':    return { S, elbow: V(s * 0.36, 0.12, 0.40), hand: V(s * 0.12, 0.20, 0.12) };
      case 'belly':   return { S, elbow: V(s * 0.27, 0.11, 0.50), hand: V(s * 0.04, 0.21, 0.63) };
      case 'hip':     return { S, elbow: V(s * 0.28, 0.10, 0.55), hand: V(s * 0.15, 0.18, 0.86) };
      case 'knee': // 세운 무릎 쪽 허벅지에 손 (팔 길이상 무릎까지는 닿지 않음)
        return { S, elbow: V(s * 0.24, 0.13, 0.53), hand: V(s * 0.12, 0.20, 0.80) };
      case 'forward': {
        const elbow = S.clone().add(V(0, 0.20, 0.12));
        return { S, elbow, hand: elbow.clone().add(V(0, 0.10, 0.20)) };
      }
      default:        return { S, elbow: V(s * 0.25, 0.10, 0.52), hand: V(s * 0.26, 0.10, 0.76) }; // side
    }
  };
  [[pose.armR, 1], [pose.armL, -1]].forEach(([kind, s]) => {
    const a = armTargets(kind, s);
    seg(a.S, a.elbow, 0.05, M.shirt);
    seg(a.elbow, a.hand, 0.042, M.skin);
    ball(a.hand, 0.05, M.skin);
  });

  // 질환별 소품 (침대 위 고정 — roll 미적용, 바로누움 환자 전용)
  const xCyl = (p, r, len, mat) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 12), mat);
    m.position.copy(p); m.rotation.z = Math.PI / 2; m.castShadow = true;
    fig.add(m);
    return m;
  };
  pose.props.forEach((prop) => {
    const kR = joints.kneeR, aR = joints.ankleR, dR = joints.shankDirR;
    switch (prop) {
      case 'neckroll':    xCyl(V(0, 0.05, 0.12), 0.05, 0.34, M.white); break;
      case 'blanket': {
        // 다리 위에 덮인 담요. 예전에는 0.16m 두께 상자여서 스티로폼 덩어리로 보였다.
        // 반원통 껍질을 씌우면 다리 윤곽을 따라 천이 흐르는 것처럼 읽힌다.
        // 발쪽으로 갈수록 좁아져야 한다. 굵기가 일정하면 담요가 아니라 통나무다.
        const bg = new THREE.CylinderGeometry(0.20, 0.29, 1.16, 22, 1, true, 0, Math.PI);
        bg.rotateZ(Math.PI / 2); bg.rotateY(Math.PI / 2);   // 축을 z로, 껍질을 위쪽으로
        const bl = new THREE.Mesh(bg, M.blanket);
        bl.position.set(0, 0.0, 1.19);
        bl.castShadow = true;
        fig.add(bl);
        // 가슴께로 접어 올린 시트 끝단
        const hem = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.05, 0.14), M.sheet);
        hem.position.set(0, 0.19, 0.63);
        hem.castShadow = true;
        fig.add(hem);
        break;
      }
      case 'bolsterKneeR': xCyl(V(kR.x, 0.06, kR.z), 0.09, 0.5, M.white); break;
      case 'bolsterKnees': xCyl(V(0, 0.055, kR.z), 0.07, 0.5, M.white); break;
      case 'wrapKneeR':   seg(kR.clone().addScaledVector(dR, -0.09), kR.clone().addScaledVector(dR, 0.09), 0.085, M.white, fig); break;
      case 'iceKneeR':    box(kR.clone().add(V(0, 0.11, 0)), 0.16, 0.06, 0.16, M.ice, fig); break;
      case 'pillowAnkleR': box(V(aR.x, 0.10, aR.z), 0.34, 0.20, 0.32, M.white, fig); break;
      case 'wrapAnkleR':  seg(aR.clone().addScaledVector(dR, -0.08), aR.clone().addScaledVector(dR, 0.08), 0.062, M.white, fig); break;
      case 'iceAnkleR':   box(aR.clone().add(V(0, 0.12, 0)), 0.14, 0.06, 0.14, M.ice, fig); break;
    }
  });

  return fig;
}

// ── 침대 + 환자 ──
function buildBeds() {
  // 배치: 두 줄 × 6개. 머리쪽이 벽을 향함.
  const xs = [-10, -6, -2, 2, 6, 10];
  PATIENTS.forEach((p, i) => {
    const row = i < 6 ? 0 : 1;
    const x = xs[i % 6];
    const z = row === 0 ? -5.4 : 5.4;
    const facing = row === 0 ? 1 : -1; // 발끝이 향하는 방향(+z / -z)
    makeBed(p, i + 1, x, z, facing);
  });
}

// 커튼 원단 — 베드 12개가 전부 같은 재질이므로 폭별로 한 번만 만들어 공유한다.
// (r128 버전은 베드마다 텍스처를 복제해 같은 이미지를 24번 GPU에 올렸다)
const CURTAIN_CACHE = {};
function curtainMaterial(widthMeters, heightMeters) {
  const H = heightMeters || 1.5;
  const key = widthMeters.toFixed(2) + 'x' + H.toFixed(2);
  if (CURTAIN_CACHE[key]) return CURTAIN_CACHE[key];

  // 주름(굵은 세로 결) + 직조(가는 격자)를 겹쳐 그린다.
  // 색상맵의 명암만으로는 평면이지만, 같은 패턴을 노멀맵으로 만들면
  // 빛의 방향에 따라 주름이 살아 움직인다.
  const draw = (g, S, dark) => {
    g.fillStyle = dark ? '#808080' : '#f7f5f0';
    g.fillRect(0, 0, S, S);
    for (let x = 0; x < S; x++) {           // 주름: 부드러운 사인 음영
      const f = Math.sin((x / S) * Math.PI * 2 * 4);
      const v = dark ? 128 + f * 30 : 0;
      if (dark) {
        g.fillStyle = 'rgb(' + Math.round(v) + ',' + Math.round(v) + ',' + Math.round(v) + ')';
      } else {
        g.fillStyle = 'rgba(108,116,124,' + (0.11 - f * 0.08) + ')';
      }
      g.fillRect(x, 0, 1, S);
    }
    for (let i = 0; i < S; i += 4) {        // 직조 결 — 아주 약하게
      g.fillStyle = dark ? 'rgba(255,255,255,0.035)' : 'rgba(255,255,255,0.07)';
      g.fillRect(0, i, S, 1);
      g.fillStyle = dark ? 'rgba(0,0,0,0.035)' : 'rgba(70,100,86,0.04)';
      g.fillRect(0, i + 2, S, 1);
    }
    if (!dark) {
      // 가는 청·적 격자무늬 — 참고 렌더링의 커튼은 세로줄만이 아니라
      // 가로줄이 함께 있는 잔격자다. 세로줄만 그으면 블라인드처럼 보인다.
      // 높이맵에는 넣지 않는다 (인쇄된 무늬이지 요철이 아니다).
      for (let x = 0; x < S; x += 34) {
        g.fillStyle = 'rgba(116,152,190,0.55)'; g.fillRect(x, 0, 2, S);
        g.fillStyle = 'rgba(202,118,110,0.45)'; g.fillRect(x + 17, 0, 1.5, S);
      }
      for (let y = 0; y < S; y += 34) {
        g.fillStyle = 'rgba(116,152,190,0.34)'; g.fillRect(0, y, S, 1.5);
        g.fillStyle = 'rgba(202,118,110,0.26)'; g.fillRect(0, y + 17, S, 1);
      }
    }
  };

  const m = RENDER.pbrMaterial(
    (g, S) => draw(g, S, false),
    {
      // 주름 폭·직조 결의 실치수를 커튼 크기와 무관하게 유지한다.
      // (세로 반복을 1로 고정하면 천장까지 오는 커튼에서 직조가 늘어나 보인다)
      size: [256, 256], repeat: [widthMeters / 1.2, H / 1.5],
      normalStrength: 1.8, normalScale: 0.8,
      rough: { base: 0.95, dark: 0.99 }, envMapIntensity: 0.45,
      side: THREE.DoubleSide,
      height: (g, S) => draw(g, S, true),
    }
  );
  CURTAIN_CACHE[key] = m;
  return m;
}

function makeBed(patient, num, x, z, facing) {
  const g = new THREE.Group();
  const BED_W = 1.0, BED_L = 2.1, BED_H = 0.62;

  // 프레임 — 분체도장 스틸
  const frame = new THREE.Mesh(new THREE.BoxGeometry(BED_W, 0.12, BED_L),
    new THREE.MeshStandardMaterial({ color: 0xeceef0, roughness: 0.35, metalness: 0.35, envMapIntensity: 1.1 }));
  frame.position.y = BED_H - 0.12; frame.castShadow = true;
  g.add(frame);
  // 다리 — 크롬 파이프
  const legMat = new THREE.MeshStandardMaterial({ color: 0xa7b2ba, roughness: 0.25, metalness: 0.8, envMapIntensity: 1.3 });
  [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, BED_H - 0.12, 12), legMat);
    leg.position.set(sx * (BED_W / 2 - 0.08), (BED_H - 0.12) / 2, sz * (BED_L / 2 - 0.1));
    g.add(leg);
  });
  // 매트리스 — 치료대 인조가죽(레자). 광이 살짝 도는 게 실제 질감이다.
  const mat = new THREE.Mesh(new THREE.BoxGeometry(BED_W, 0.14, BED_L),
    new THREE.MeshStandardMaterial({ color: 0xd08f52, roughness: 0.52, metalness: 0.03, envMapIntensity: 0.8 }));
  mat.position.y = BED_H; mat.castShadow = true; mat.receiveShadow = true;
  g.add(mat);
  // 베개 (머리쪽 = -facing 방향) — 면 커버라 완전 무광
  const headZ = -facing * (BED_L / 2 - 0.28);
  const pillow = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.09, 0.35),
    new THREE.MeshStandardMaterial({ color: 0xf6f9fb, roughness: 0.95 }));
  pillow.position.set(0, BED_H + 0.11, headZ);
  pillow.castShadow = true;
  g.add(pillow);

  // 환자 (질환별 자세 인형)
  const fig = buildPatientFigure(patient);
  fig.position.set(0, BED_H + 0.07, headZ);
  fig.rotation.y = facing > 0 ? 0 : Math.PI;
  g.add(fig);

  // 발판(footboard) + 환자 카드 — 실제 병상은 발판에 카드홀더가 끼워져 있다.
  // 예전에는 0.85m짜리 판이 발치 허공에 떠 있어서, 베드에 다가갈수록
  // 간판이 시야를 다 가리고 지지물도 없어 붕 떠 보였다.
  const sexAge = patient.sex + ', ' + patient.age + '세';
  const laminate = new THREE.MeshStandardMaterial({ color: 0xe4e7ea, roughness: 0.38, metalness: 0.1, envMapIntensity: 1.0 });
  const footboard = new THREE.Mesh(new THREE.BoxGeometry(0.98, 0.34, 0.05), laminate);
  footboard.position.set(0, BED_H + 0.20, facing * (BED_L / 2 + 0.03));
  footboard.castShadow = true;
  g.add(footboard);
  const placard = new THREE.Mesh(
    new THREE.PlaneGeometry(0.62, 0.29),
    printedMat(makeTextCanvas(['베드 ' + num, patient.name + ' (' + sexAge + ')'], 512, 240, { border: '#2c5f7c', fontSize: 54 }),
      { roughness: 0.45, envMapIntensity: 1.1 })
  );
  placard.position.set(0, BED_H + 0.21, facing * (BED_L / 2 + 0.062));
  placard.rotation.y = facing > 0 ? 0 : Math.PI;
  g.add(placard);

  // 완료 체크 표시 (숨김 상태로 시작) — UI 요소이므로 톤매핑에서 제외해 항상 선명하게
  const checkTex = makeTextCanvas(['✓ 진료완료'], 512, 200, { bg: '#27ae60', color: '#ffffff', fontSize: 80 });
  const check = new THREE.Sprite(new THREE.SpriteMaterial({ map: checkTex, toneMapped: false }));
  check.scale.set(1.1, 0.45, 1);
  check.position.set(0, BED_H + 1.1, 0);
  check.visible = false;
  g.add(check);

  // 헤드보드 — 멜라민 라미네이트
  const headboard = new THREE.Mesh(new THREE.BoxGeometry(0.98, 0.42, 0.06),
    new THREE.MeshStandardMaterial({ color: 0xe4e7ea, roughness: 0.38, metalness: 0.1, envMapIntensity: 1.0 }));
  headboard.position.set(0, BED_H + 0.24, -facing * (BED_L / 2 + 0.03));
  headboard.castShadow = true;
  g.add(headboard);

  // 사이드 캐비닛 (협탁)
  const cab = new THREE.Group();
  const cabBody = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.52, 0.4),
    new THREE.MeshStandardMaterial({ color: 0xe8ebe6, roughness: 0.7 }));
  cabBody.position.y = 0.26; cabBody.castShadow = true;
  const cabTop = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.03, 0.44),
    new THREE.MeshStandardMaterial({ color: 0xb9c8d2, roughness: 0.4 }));
  cabTop.position.y = 0.535;
  const cabHandle = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.02, 0.02),
    new THREE.MeshStandardMaterial({ color: 0x7f939f }));
  cabHandle.position.set(0, 0.38, 0.21);
  const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.03, 0.09, 10),
    new THREE.MeshStandardMaterial({ color: 0xf4f6f8 }));
  cup.position.set(0.08, 0.6, 0.05);
  cab.add(cabBody, cabTop, cabHandle, cup);
  cab.position.set(0.75, 0, -facing * (BED_L / 2 - 0.35));
  g.add(cab);

  // ── 커튼 부스 (천장 레일 + 양옆 커튼 + 입구는 걷어둠) ──
  // 부스: 벽쪽(z=-facing*2.1)부터 침대 발끝 너머(z=+facing*1.35)까지, 폭 x ±1.15
  const CUB_HW = 1.15;                 // 부스 반폭
  const wallZ = -facing * 2.1;         // 벽쪽 로컬 z
  const entryZ = facing * 1.35;        // 입구 로컬 z
  const cubLen = Math.abs(entryZ - wallZ);
  const cubMidZ = (wallZ + entryZ) / 2;
  // 참고 렌더링(w1536)의 부스 구조를 그대로 따른다: 바닥에서 천장까지 올라가는
  // 목재 각기둥 사이에 가로보를 걸고, 그 보에 커튼을 매단다. 번호판은 보 위에 붙는다.
  // 앞선 구현도 같은 방식이었지만 기둥이 지름 2.4cm 철사 굵기라 비계처럼 보였다.
  // 실제 목재 기둥은 10cm 각재이고, 굵기가 있어야 구조물로 읽힌다.
  const woodMat = new THREE.MeshStandardMaterial({ color: 0xc9a978, metalness: 0, roughness: 0.62, envMapIntensity: 0.65 });
  const POST = 0.10;               // 각기둥 한 변
  const beamY = 2.34;              // 가로보 윗면 높이
  const CUR_TOP = beamY - 0.06;    // 보에 걸린 커튼 상단
  const CUR_BOT = 0.09;            // 하단 — 참고 렌더링처럼 바닥 가까이 내려온다
  const curH = CUR_TOP - CUR_BOT;
  const curY = (CUR_TOP + CUR_BOT) / 2;

  const curMat = curtainMaterial(cubLen, curH);
  const bundleMat = new THREE.MeshStandardMaterial({ color: 0xf1eee7, roughness: 0.95, envMapIntensity: 0.45 });

  // 입구 각기둥 2개 (바닥 → 천장)
  [-CUB_HW, CUB_HW].forEach((sx) => {
    const post = new THREE.Mesh(new THREE.BoxGeometry(POST, GAME.ROOM.h, POST), woodMat);
    post.position.set(sx, GAME.ROOM.h / 2, entryZ);
    post.castShadow = true;
    g.add(post);
  });
  // 옆 가로보 + 커튼 (부스 칸막이) — 보는 기둥에서 벽까지 건너간다
  [-CUB_HW, CUB_HW].forEach((sx) => {
    const beam = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.09, cubLen), woodMat);
    beam.position.set(sx, beamY - 0.045, cubMidZ);
    beam.castShadow = true;
    g.add(beam);
    const side = new THREE.Mesh(new THREE.PlaneGeometry(cubLen, curH), curMat);
    side.rotation.y = Math.PI / 2;
    side.castShadow = true;
    side.position.set(sx, curY, cubMidZ);
    g.add(side);
  });
  // 입구 가로보 (커튼은 양쪽으로 걷어둠)
  const frontBeam = new THREE.Mesh(new THREE.BoxGeometry(CUB_HW * 2, 0.09, 0.06), woodMat);
  frontBeam.position.set(0, beamY - 0.045, entryZ);
  frontBeam.castShadow = true;
  g.add(frontBeam);
  [-1, 1].forEach((sx) => {
    const bundle = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.075, curH, 8), bundleMat);
    bundle.position.set(sx * (CUB_HW - 0.14), curY, entryZ);
    bundle.castShadow = true;
    g.add(bundle);
  });
  const halfCur = new THREE.Mesh(new THREE.PlaneGeometry(0.45, curH), curtainMaterial(0.45, curH));
  halfCur.position.set(-(CUB_HW - 0.50), curY, entryZ);
  g.add(halfCur);
  // 부스 번호판 — 참고 렌더링처럼 가로보 위에 얹혀 통로 쪽을 향한다.
  // 커튼이 바닥까지 내려오므로 통로에서 베드를 찾는 단서는 이것뿐이다.
  const bayPlate = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.21, 0.035),
    printedMat(makeTextCanvas([String(num)], 256, 128, { bg: '#2c5f7c', color: '#ffffff', fontSize: 92 }),
      { roughness: 0.4, envMapIntensity: 1.1 }));
  bayPlate.position.set(0, beamY + 0.06, entryZ);
  bayPlate.castShadow = true;
  g.add(bayPlate);

  // 침대 하부 수납 바구니 — 참고 렌더링에 베드마다 놓여 있다
  const basket = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.17, 0.34),
    new THREE.MeshStandardMaterial({ color: 0x8e97a0, roughness: 0.55, metalness: 0.05, envMapIntensity: 0.8 }));
  basket.position.set(0, 0.11, facing * 0.34);
  basket.castShadow = true;
  g.add(basket);

  // 옆 커튼 통과 방지
  GAME.obstacles.push(
    { cx: x - CUB_HW, cz: z + cubMidZ, hw: 0.1, hd: cubLen / 2 },
    { cx: x + CUB_HW, cz: z + cubMidZ, hw: 0.1, hd: cubLen / 2 }
  );

  g.position.set(x, 0, z);
  GAME.scene.add(g);
  GAME.beds.push({ patient, group: g, checkSprite: check, cx: x, cz: z, hw: BED_W / 2 + 0.35, hd: BED_L / 2 + 0.35 });
}

// ── 소품·치료실 장비 ──
function buildDecor() {
  const s = GAME.scene;
  const solid = (cx, cz, hw, hd) => GAME.obstacles.push({ cx, cz, hw, hd });
  const std = (color, opt) => new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.7 }, opt || {}));
  // 스테인리스·크롬 — envMap이 생겼으니 실제 금속값을 줄 수 있다
  const steel = (color) => std(color || 0xb8c2c8, { metalness: 0.85, roughness: 0.22, envMapIntensity: 1.35 });
  // 켜져 있는 화면 — 스스로 빛나야 실내 조명에 눌리지 않는다
  const screen = (color) => new THREE.MeshStandardMaterial({
    color: 0x000000, emissive: color, emissiveIntensity: 0.9, roughness: 1,
  });

  // 안내 데스크 + 모니터 + 의자
  const desk = new THREE.Group();
  const dtop = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.07, 0.75), std(0xd9c7a8, { roughness: 0.35 }));
  dtop.position.y = 0.95; dtop.castShadow = true;
  const dbody = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.9, 0.62), std(0x5b7c99));
  dbody.position.y = 0.45;
  const monStand = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.16, 0.06), std(0x2f3b42));
  monStand.position.set(-0.4, 1.06, 0);
  const mon = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.36, 0.04), std(0x22292e, { roughness: 0.3 }));
  mon.position.set(-0.4, 1.32, 0); mon.castShadow = true;
  const monScr = new THREE.Mesh(new THREE.PlaneGeometry(0.52, 0.3), screen(0x9fd4ee));
  monScr.position.set(-0.4, 1.32, 0.021);
  desk.add(dtop, dbody, monStand, mon, monScr);
  desk.position.set(10.3, 0, 0);
  desk.rotation.y = -Math.PI / 2;
  s.add(desk);
  solid(10.3, 0, 0.7, 1.35);
  const chair = new THREE.Group();
  const cseat = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.07, 0.44), std(0x38526b));
  cseat.position.y = 0.48; cseat.castShadow = true;
  const cback = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.5, 0.06), std(0x38526b));
  cback.position.set(0, 0.83, 0.21);
  const cpost = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.4, 8), steel());
  cpost.position.y = 0.28;
  const cbase = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.28, 0.04, 10), steel(0x9aa6ad));
  cbase.position.y = 0.05;
  chair.add(cseat, cback, cpost, cbase);
  chair.position.set(11.3, 0, 0);
  chair.rotation.y = -Math.PI / 2;
  s.add(chair);

  // 평행봉 (보행 훈련)
  const pbars = new THREE.Group();
  const pbMat = steel(0xcfd6da);
  const woodMat = std(0xc89a63, { roughness: 0.45 });
  [-0.35, 0.35].forEach((zz) => {
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 3.0, 10), woodMat);
    bar.rotation.z = Math.PI / 2;
    bar.position.set(0, 0.92, zz);
    bar.castShadow = true;
    pbars.add(bar);
    [-1.4, 1.4].forEach((xx) => {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.035, 0.92, 8), pbMat);
      post.position.set(xx, 0.46, zz);
      pbars.add(post);
    });
  });
  const pbMatFloor = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.03, 1.3), std(0x4f7c9e, { roughness: 0.9 }));
  pbMatFloor.position.y = 0.015;
  pbMatFloor.receiveShadow = true;
  pbars.add(pbMatFloor);
  pbars.position.set(5.5, 0, 0);
  s.add(pbars);
  solid(5.5, 0, 1.8, 0.8);

  // 운동 매트 + 짐볼
  const matColors = [0x5f8fb8, 0x7fa86e];
  matColors.forEach((mc, i) => {
    const gymMat = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.05, 0.95), std(mc, { roughness: 0.6, envMapIntensity: 0.8 }));
    gymMat.position.set(-5.5, 0.025, -0.6 + i * 1.2);
    gymMat.receiveShadow = true;
    s.add(gymMat);
  });
  [[-6.8, -1.1, 0.32, 0xc06d5c], [-4.4, 1.4, 0.26, 0x5f8fb8]].forEach(([x, z, r, col]) => {
    const ball = new THREE.Mesh(new THREE.SphereGeometry(r, 26, 20), std(col, { roughness: 0.32, envMapIntensity: 1.1 }));
    ball.position.set(x, r, z);
    ball.castShadow = true;
    s.add(ball);
  });

  // 늑목 (왼쪽 벽)
  const ladder = new THREE.Group();
  [-1.15, 1.15].forEach((zz) => {
    const side = new THREE.Mesh(new THREE.BoxGeometry(0.09, 2.6, 0.06), woodMat);
    side.position.set(0, 1.4, zz);
    ladder.add(side);
  });
  for (let i = 0; i < 8; i++) {
    const rung = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 2.3, 8), woodMat);
    rung.rotation.x = Math.PI / 2;
    rung.position.set(0, 0.45 + i * 0.31, 0);
    ladder.add(rung);
  }
  ladder.position.set(-11.85, 0, 0);
  s.add(ladder);

  // 덤벨 랙
  const rack = new THREE.Group();
  const rackMat = steel(0x8a959c);
  [0.35, 0.65].forEach((y, ri) => {
    const shelf = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.05, 0.4), rackMat);
    shelf.position.y = y;
    shelf.castShadow = true;
    rack.add(shelf);
    for (let i = 0; i < 4; i++) {
      const db = new THREE.Group();
      const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.2, 8), steel(0xcfd6da));
      handle.rotation.z = Math.PI / 2;
      const r = 0.05 + ri * 0.02;
      [-0.09, 0.09].forEach((hx) => {
        const head = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.05, 12), std(0x37424a, { roughness: 0.4 }));
        head.rotation.z = Math.PI / 2;
        head.position.x = hx;
        db.add(head);
      });
      db.add(handle);
      db.position.set(-0.55 + i * 0.36, y + 0.08, 0);
      rack.add(db);
    }
  });
  [[-0.7, 0], [0.7, 0]].forEach(([xx]) => {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.68, 0.38), rackMat);
    leg.position.set(xx, 0.34, 0);
    rack.add(leg);
  });
  rack.position.set(-11.25, 0, 4.9);
  rack.rotation.y = Math.PI / 2;
  s.add(rack);
  solid(-11.25, 4.9, 0.5, 0.85);

  // 온습포기 (핫팩 보온기)
  const hotpack = new THREE.Group();
  const hpBody = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.85, 0.55), steel(0xd4dade));
  hpBody.position.y = 0.545; hpBody.castShadow = true;
  const hpLid = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.06, 0.57), steel(0xb8c2c8));
  hpLid.position.y = 1.0;
  const hpDial = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.02, 10), std(0x37424a));
  hpDial.rotation.x = Math.PI / 2;
  hpDial.position.set(0.2, 0.75, 0.285);
  const hpLegs = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.12, 0.45), std(0x6b767d));
  hpLegs.position.y = 0.06;
  hotpack.add(hpBody, hpLid, hpDial, hpLegs);
  hotpack.position.set(-11.35, 0, -4.9);
  s.add(hotpack);
  solid(-11.35, -4.9, 0.55, 0.5);

  // 치료 카트 (초음파 치료기)
  const cart = new THREE.Group();
  [0.35, 0.75].forEach((y) => {
    const tray = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.03, 0.42), steel(0xd4dade));
    tray.position.y = y;
    tray.castShadow = true;
    cart.add(tray);
  });
  [[-0.25, -0.18], [0.25, -0.18], [-0.25, 0.18], [0.25, 0.18]].forEach(([xx, zz]) => {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.75, 8), steel());
    pole.position.set(xx, 0.4, zz);
    cart.add(pole);
    const wheel = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 8), std(0x37424a));
    wheel.position.set(xx, 0.035, zz);
    cart.add(wheel);
  });
  const usDevice = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.18, 0.3), std(0xf0f3f5, { roughness: 0.4 }));
  usDevice.position.y = 0.86; usDevice.castShadow = true;
  const usScreen = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.1), screen(0x6fc0e0));
  usScreen.position.set(0, 0.88, 0.151);
  cart.add(usDevice, usScreen);
  cart.position.set(8.6, 0, 3.4);
  s.add(cart);
  solid(8.6, 3.4, 0.45, 0.4);

  // 전신 거울 (앞벽)
  const mirrorFrame = new THREE.Mesh(new THREE.BoxGeometry(1.3, 1.9, 0.05), std(0x8fa5b2));
  mirrorFrame.position.set(-6, 1.35, -GAME.ROOM.d / 2 + 0.05);
  const mirror = new THREE.Mesh(new THREE.PlaneGeometry(1.18, 1.78),
    new THREE.MeshStandardMaterial({ color: 0xdfe8ee, metalness: 0.9, roughness: 0.16, envMapIntensity: 0.85 }));
  mirror.position.set(-6, 1.35, -GAME.ROOM.d / 2 + 0.08);
  s.add(mirrorFrame, mirror);

  // 벽시계 (뒷벽)
  const clockCv = document.createElement('canvas');
  clockCv.width = 128; clockCv.height = 128;
  const ck = clockCv.getContext('2d');
  ck.fillStyle = '#ffffff'; ck.beginPath(); ck.arc(64, 64, 60, 0, 7); ck.fill();
  ck.strokeStyle = '#37424a'; ck.lineWidth = 6; ck.beginPath(); ck.arc(64, 64, 58, 0, 7); ck.stroke();
  ck.lineWidth = 3;
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    ck.beginPath();
    ck.moveTo(64 + Math.cos(a) * 48, 64 + Math.sin(a) * 48);
    ck.lineTo(64 + Math.cos(a) * 54, 64 + Math.sin(a) * 54);
    ck.stroke();
  }
  ck.lineWidth = 5; ck.beginPath(); ck.moveTo(64, 64); ck.lineTo(64, 30); ck.stroke();
  ck.lineWidth = 4; ck.beginPath(); ck.moveTo(64, 64); ck.lineTo(88, 74); ck.stroke();
  const clock = new THREE.Mesh(new THREE.CircleGeometry(0.28, 24),
    printedMat(RENDER.colorTex(clockCv), { roughness: 0.3, envMapIntensity: 1.2 }));
  clock.position.set(0, 2.7, GAME.ROOM.d / 2 - 0.05);
  clock.rotation.y = Math.PI;
  s.add(clock);

  // 화분 4개 (모서리) — 예전에는 구 하나가 공중에 떠 막대사탕처럼 보였다.
  // 화분 → 흙 → 줄기 → 크기가 다른 잎 덩어리 3개로 쌓아야 식물로 읽힌다.
  const potMat = std(0xb9b3a8, { roughness: 0.55, envMapIntensity: 0.9 });  // 무광 세라믹 화분
  const soilMat = std(0x4b3a2c, { roughness: 1.0 });
  const stemMat = std(0x5c7a4a, { roughness: 0.85 });
  [[-11, -6.5, 1], [11, -6.5, -1], [-11, 6.5, -1], [11, 6.5, 1]].forEach(([x, z, flip]) => {
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.20, 0.145, 0.34, 16), potMat);
    pot.position.set(x, 0.17, z);
    pot.castShadow = true;
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.212, 0.212, 0.04, 16), potMat);
    rim.position.set(x, 0.335, z);
    const soil = new THREE.Mesh(new THREE.CylinderGeometry(0.185, 0.185, 0.03, 14), soilMat);
    soil.position.set(x, 0.345, z);
    s.add(pot, rim, soil);
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.032, 0.42, 8), stemMat);
    stem.position.set(x, 0.56, z);
    s.add(stem);
    // 잎 덩어리 — 크기·높이·색을 어긋나게 두어야 단일 구로 안 보인다
    [[0.00, 0.90, 0.00, 0.30, 0x4e8d5b], [0.17, 0.76, 0.10, 0.21, 0x5b9c64],
     [-0.14, 0.80, -0.12, 0.18, 0x437c50]].forEach(([dx, y, dz, r, col]) => {
      const leaf = new THREE.Mesh(new THREE.SphereGeometry(r, 14, 11), std(col, { roughness: 0.88, envMapIntensity: 0.6 }));
      leaf.position.set(x + dx * flip, y, z + dz);
      leaf.scale.y = 0.78;   // 위에서 눌린 수형
      leaf.castShadow = true;
      s.add(leaf);
    });
  });

  // 벽 포스터
  const poster1 = new THREE.Mesh(
    new THREE.PlaneGeometry(1.6, 1.0),
    printedMat(makeTextCanvas(['바른 자세', '건강한 척추'], 512, 320, { bg: '#eaf4ea', color: '#2e6b3e', border: '#2e6b3e', fontSize: 64 }))
  );
  poster1.position.set(-11.95, 1.9, -3);
  poster1.rotation.y = Math.PI / 2;
  s.add(poster1);
  const poster2 = new THREE.Mesh(
    new THREE.PlaneGeometry(1.6, 1.0),
    printedMat(makeTextCanvas(['오늘의 운동', '내일의 건강'], 512, 320, { bg: '#fdf2e9', color: '#a04000', border: '#a04000', fontSize: 64 }))
  );
  poster2.position.set(-11.95, 1.9, 3);
  poster2.rotation.y = Math.PI / 2;
  s.add(poster2);

  // ── 슬링 치료 스테이션 (천장 현수장치 + 치료 테이블) ──
  const sling = new THREE.Group();
  const slSteel = steel(0xcfd6da);
  [[-0.4, -0.8], [0.4, -0.8], [-0.4, 0.8], [0.4, 0.8]].forEach(([xx, zz]) => { // 천장 지지 로드
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, GAME.ROOM.h - 2.55, 6), slSteel);
    rod.position.set(xx, (GAME.ROOM.h + 2.55) / 2, zz);
    sling.add(rod);
  });
  [-0.4, 0.4].forEach((xx) => { // 프레임 레일
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 1.7), slSteel);
    rail.position.set(xx, 2.55, 0);
    rail.castShadow = true;
    sling.add(rail);
  });
  [-0.8, 0, 0.8].forEach((zz) => { // 크로스바
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.05, 0.05), slSteel);
    bar.position.set(0, 2.55, zz);
    sling.add(bar);
  });
  const ropeMat = std(0xc0392b, { roughness: 0.85 });   // 빨간 현수 로프
  const strapMat = std(0xf1c40f, { roughness: 0.8 });   // 노란 스트랩 고리
  const gripMat = std(0x2c3e50, { roughness: 0.5 });
  [[-0.4, -0.55, 1.15, 'strap'], [0.4, -0.55, 1.25, 'grip'], [-0.4, 0.45, 1.3, 'grip'], [0.4, 0.45, 1.05, 'strap']].forEach(([xx, zz, len, tip]) => {
    const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, len, 6), ropeMat);
    rope.position.set(xx, 2.55 - len / 2, zz);
    sling.add(rope);
    if (tip === 'strap') {
      const loop = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.018, 8, 16), strapMat);
      loop.position.set(xx, 2.55 - len - 0.07, zz);
      sling.add(loop);
    } else {
      const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.16, 8), gripMat);
      grip.rotation.z = Math.PI / 2;
      grip.position.set(xx, 2.55 - len - 0.02, zz);
      sling.add(grip);
    }
  });
  const slTop = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.12, 1.9), std(0x2e4a66, { roughness: 0.6 })); // 슬링 테이블
  slTop.position.y = 0.58; slTop.castShadow = true;
  sling.add(slTop);
  [[-0.3, -0.85], [0.3, -0.85], [-0.3, 0.85], [0.3, 0.85]].forEach(([xx, zz]) => {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.035, 0.52, 8), slSteel);
    leg.position.set(xx, 0.26, zz);
    sling.add(leg);
  });
  sling.position.set(1.2, 0, 0);
  s.add(sling);
  solid(1.2, 0, 0.6, 1.15);

  // ── 트레드밀 ──
  const tm = new THREE.Group();
  const tmBase = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.16, 2.0), std(0x3a444c, { roughness: 0.5 }));
  tmBase.position.y = 0.1; tmBase.castShadow = true;
  const tmBelt = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.025, 1.55), std(0x191e22, { roughness: 0.95 }));
  tmBelt.position.set(0, 0.19, 0.15);
  tm.add(tmBase, tmBelt);
  [-0.36, 0.36].forEach((xx) => { // 손잡이 레일
    const hr = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.0, 8), steel());
    hr.rotation.x = Math.PI / 2;
    hr.position.set(xx, 0.98, -0.35);
    tm.add(hr);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.85, 8), steel());
    post.position.set(xx, 0.55, -0.82);
    post.rotation.x = 0.15;
    tm.add(post);
  });
  const tmConsole = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.3, 0.07), std(0x2b3238, { roughness: 0.4 }));
  tmConsole.position.set(0, 1.18, -0.93);
  tmConsole.rotation.x = -0.35;
  const tmScr = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.16), screen(0x5ab6d6));
  tmScr.position.set(0, 1.2, -0.885);
  tmScr.rotation.x = -0.35;
  tm.add(tmConsole, tmScr);
  tm.position.set(-8.3, 0, 2.5);
  s.add(tm);
  solid(-8.3, 2.5, 0.55, 1.15);

  // ── 고정식 자전거 ──
  const bike = new THREE.Group();
  const flywheel = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.06, 20), std(0x37424a, { roughness: 0.35 }));
  flywheel.rotation.z = Math.PI / 2;
  flywheel.position.set(0, 0.42, -0.32);
  flywheel.castShadow = true;
  const bkFrame = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.85), std(0x8b2f36, { roughness: 0.45 }));
  bkFrame.position.set(0, 0.72, -0.02);
  bkFrame.rotation.x = 0.55;
  const seatPost = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.35, 8), steel());
  seatPost.position.set(0, 0.82, 0.3);
  const bkSeat = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.06, 0.26), std(0x22282d));
  bkSeat.position.set(0, 1.0, 0.3);
  const hbPost = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.4, 8), steel());
  hbPost.position.set(0, 0.95, -0.42);
  const hBar = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.45, 8), std(0x22282d));
  hBar.rotation.z = Math.PI / 2;
  hBar.position.set(0, 1.15, -0.42);
  [[0.13, 0.42], [-0.13, 0.42]].forEach(([xx, yy], i) => { // 페달
    const pd = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.03, 0.12), std(0x22282d));
    pd.position.set(xx, yy + (i ? 0.12 : -0.12), -0.12);
    bike.add(pd);
  });
  [[-0.28], [0.28]].forEach(([zz]) => { // 바닥 지지대
    const ft = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.05, 0.08), steel(0x9aa6ad));
    ft.position.set(0, 0.03, zz === undefined ? 0 : zz);
    bike.add(ft);
  });
  bike.add(flywheel, bkFrame, seatPost, bkSeat, hbPost, hBar);
  bike.position.set(-8.3, 0, -2.4);
  bike.rotation.y = 0.4;
  s.add(bike);
  solid(-8.3, -2.4, 0.5, 0.6);

  // ── 소도구 선반 (수건·폼롤러·볼·밴드) ──
  const shelf = new THREE.Group();
  const shelfMat = std(0xe8ebe6, { roughness: 0.6 });
  [-0.75, 0.75].forEach((xx) => {
    const panel = new THREE.Mesh(new THREE.BoxGeometry(0.04, 1.25, 0.36), shelfMat);
    panel.position.set(xx, 0.625, 0);
    panel.castShadow = true;
    shelf.add(panel);
  });
  [0.28, 0.72, 1.16].forEach((yy) => {
    const board = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.035, 0.34), shelfMat);
    board.position.y = yy;
    shelf.add(board);
  });
  [[-0.45, 0xeef3f6], [-0.15, 0xdaeaf2], [0.15, 0xeef3f6]].forEach(([xx, col]) => { // 수건 더미 (맨 위)
    const towel = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.14, 0.26), std(col, { roughness: 0.95 }));
    towel.position.set(xx, 1.26, 0);
    shelf.add(towel);
  });
  [[-0.3, 0x6fa8dc], [0.35, 0x93c47d]].forEach(([xx, col]) => { // 폼롤러 (중간)
    const roller = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.55, 12), std(col, { roughness: 0.9 }));
    roller.rotation.z = Math.PI / 2;
    roller.position.set(xx, 0.81, 0);
    shelf.add(roller);
  });
  [[-0.5, 0xdd7e6b], [-0.22, 0xf1c40f], [0.08, 0x6fa8dc]].forEach(([xx, col]) => { // 소볼 (아래)
    const sb = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 10), std(col, { roughness: 0.6 }));
    sb.position.set(xx, 0.39, 0);
    shelf.add(sb);
  });
  const bandRoll = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.1, 12), std(0xc0392b, { roughness: 0.8 })); // 세라밴드 롤
  bandRoll.position.set(0.45, 0.37, 0);
  shelf.add(bandRoll);
  shelf.position.set(2.2, 0, 7.28);
  s.add(shelf);
  solid(2.2, 7.28, 0.8, 0.25);

  // ── 적외선 램프 스탠드 2대 ──
  const mkIRLamp = (x, z, ry) => {
    const lamp = new THREE.Group();
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.25, 0.05, 12), steel(0x9aa6ad));
    base.position.y = 0.025;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.35, 8), steel());
    pole.position.y = 0.7;
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.5, 8), steel());
    arm.position.set(0, 1.42, 0.2);
    arm.rotation.x = 1.1;
    const head = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.11, 0.14, 14), std(0xd4dade, { metalness: 0.5, roughness: 0.3 }));
    head.position.set(0, 1.5, 0.44);
    head.rotation.x = 1.2;
    head.castShadow = true;
    const glow = new THREE.Mesh(new THREE.CircleGeometry(0.11, 14), new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xff7a2a, emissiveIntensity: 1.4, roughness: 1 }));
    glow.position.set(0, 1.44, 0.5);
    glow.rotation.x = -Math.PI / 2 + 1.2 + Math.PI;
    lamp.add(base, pole, arm, head, glow);
    lamp.position.set(x, 0, z);
    lamp.rotation.y = ry;
    s.add(lamp);
    solid(x, z, 0.28, 0.28);
  };
  mkIRLamp(3.05, 3.5, Math.PI);   // 위쪽 베드열 부스 입구 옆
  mkIRLamp(-3.05, -3.5, 0);       // 아래쪽 베드열 부스 입구 옆

  // ── 어깨 도르래 (왼쪽 벽) ──
  const pulley = new THREE.Group();
  const pWheel = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.03, 12), std(0x37424a));
  pWheel.rotation.z = Math.PI / 2;
  pWheel.position.set(0.03, 2.3, 0);
  pulley.add(pWheel);
  [[-0.12, 0.95], [0.12, 0.8]].forEach(([zz, len]) => {
    const line = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, len, 6), std(0xf4f6f8));
    line.position.set(0.05, 2.3 - len / 2, zz);
    pulley.add(line);
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.14, 8), std(0x8b2f36));
    handle.rotation.x = Math.PI / 2;
    handle.position.set(0.05, 2.3 - len - 0.03, zz);
    pulley.add(handle);
  });
  pulley.position.set(-11.92, 0, -1.9);
  s.add(pulley);

  // ── 휠체어 (출입문 옆) ──
  const wc = new THREE.Group();
  const wcMat = std(0x2c3e50, { roughness: 0.5 });
  [-0.28, 0.28].forEach((xx) => {
    const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.03, 8, 20), wcMat);
    wheel.rotation.y = Math.PI / 2;
    wheel.position.set(xx, 0.28, 0.05);
    wheel.castShadow = true;
    wc.add(wheel);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.04, 10), steel(0x9aa6ad));
    hub.rotation.z = Math.PI / 2;
    hub.position.set(xx, 0.28, 0.05);
    wc.add(hub);
    const caster = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), wcMat);
    caster.position.set(xx * 0.8, 0.06, -0.32);
    wc.add(caster);
  });
  const wcSeat = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.05, 0.42), std(0x1f6e8c, { roughness: 0.8 }));
  wcSeat.position.set(0, 0.5, -0.05);
  const wcBack = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.5, 0.05), std(0x1f6e8c, { roughness: 0.8 }));
  wcBack.position.set(0, 0.78, 0.19);
  wc.add(wcSeat, wcBack);
  [-0.2, 0.2].forEach((xx) => {
    const wcHandle = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.14, 8), wcMat);
    wcHandle.rotation.x = Math.PI / 2;
    wcHandle.position.set(xx, 1.06, 0.24);
    wc.add(wcHandle);
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.02, 0.14), steel(0x9aa6ad));
    foot.position.set(xx, 0.12, -0.42);
    wc.add(foot);
  });
  wc.position.set(10.7, 0, 5.7);
  wc.rotation.y = -1.1;
  s.add(wc);
  solid(10.7, 5.7, 0.45, 0.45);

  // ── 정수기 (데스크 옆) ──
  const wd = new THREE.Group();
  const wdBody = new THREE.Mesh(new THREE.BoxGeometry(0.34, 1.0, 0.34), std(0xf4f6f8, { roughness: 0.4 }));
  wdBody.position.y = 0.5; wdBody.castShadow = true;
  const wdBottle = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.34, 12), new THREE.MeshStandardMaterial({ color: 0x7fc4e8, roughness: 0.2, transparent: true, opacity: 0.85 }));
  wdBottle.position.y = 1.18;
  const wdTap = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.06, 0.05), std(0x2980b9));
  wdTap.position.set(-0.06, 0.78, 0.19);
  const wdTap2 = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.06, 0.05), std(0xc0392b));
  wdTap2.position.set(0.06, 0.78, 0.19);
  wd.add(wdBody, wdBottle, wdTap, wdTap2);
  wd.position.set(11.45, 0, -2.6);
  s.add(wd);
  solid(11.45, -2.6, 0.3, 0.3);

  // ── 치료용 스툴 2개 (바퀴 의자) ──
  [[-2.3, 3.6], [6.6, -3.4]].forEach(([x, z]) => {
    const stool = new THREE.Group();
    const sSeat = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.06, 14), std(0x38526b, { roughness: 0.7 }));
    sSeat.position.y = 0.52; sSeat.castShadow = true;
    const sPole = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.42, 8), steel());
    sPole.position.y = 0.28;
    const sBase = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.22, 0.035, 12), steel(0x9aa6ad));
    sBase.position.y = 0.04;
    stool.add(sSeat, sPole, sBase);
    stool.position.set(x, 0, z);
    s.add(stool);
    solid(x, z, 0.24, 0.24);
  });

  // ── 목발 (벽에 기대둠) ──
  [-0.06, 0.06].forEach((off, i) => {
    const crutch = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 1.25, 6), std(0x9aa6ad, { metalness: 0.5, roughness: 0.4 }));
    crutch.position.set(-11.72, 0.63, -3.3 + off * 3);
    crutch.rotation.z = -0.16;
    crutch.rotation.x = i ? 0.05 : -0.05;
    s.add(crutch);
    const cuff = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.012, 6, 12), std(0x8496a5));
    cuff.position.set(-11.82, 1.24, -3.3 + off * 3);
    cuff.rotation.y = Math.PI / 2;
    s.add(cuff);
  });

  // ── 스텝박스 + 밸런스 보드 (매트 옆) ──
  const step = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.22, 0.4), std(0x7d9ec7, { roughness: 0.9 }));
  step.position.set(-4.4, 0.11, -1.5);
  step.castShadow = true;
  s.add(step);
  const bboard = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.03, 16), std(0xc89a63, { roughness: 0.5 }));
  bboard.position.set(-6.7, 0.09, 1.6);
  bboard.rotation.x = 0.1;
  s.add(bboard);
  const bdome = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), std(0x37424a));
  bdome.position.set(-6.7, 0.045, 1.6);
  s.add(bdome);

  // ── 손소독제 스탠드 (출입문 옆) ──
  const san = new THREE.Group();
  const sanPole = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.1, 8), steel());
  sanPole.position.y = 0.55;
  const sanBase = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.16, 0.03, 10), steel(0x9aa6ad));
  sanBase.position.y = 0.02;
  const sanBox = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.2, 0.1), std(0xf4f6f8, { roughness: 0.4 }));
  sanBox.position.y = 1.16;
  san.add(sanPole, sanBase, sanBox);
  san.position.set(11.45, 0, 3.4);
  s.add(san);
  solid(11.45, 3.4, 0.18, 0.18);
}

// ── 조작 ──
function bindControls() {
  const dom = GAME.renderer.domElement;
  dom.addEventListener('click', () => {
    if (!UI.isModalOpen()) dom.requestPointerLock();
  });
  document.addEventListener('pointerlockchange', () => {
    GAME.locked = document.pointerLockElement === dom;
    document.getElementById('hud-hint').style.display = GAME.locked ? 'none' : 'flex';
  });
  document.addEventListener('mousemove', (e) => {
    if (!GAME.locked) return;
    GAME.yaw -= e.movementX * 0.0022;
    GAME.pitch -= e.movementY * 0.0022;
    GAME.pitch = Math.max(-1.2, Math.min(1.2, GAME.pitch));
  });
  document.addEventListener('keydown', (e) => {
    GAME.keys[e.code] = true;
    if (e.code === 'KeyE' && GAME.nearPatient && GAME.locked) {
      document.exitPointerLock();
      UI.openConsult(GAME.nearPatient);
    }
  });
  document.addEventListener('keyup', (e) => { GAME.keys[e.code] = false; });
  window.addEventListener('resize', () => RENDER.setSize(GAME.renderer, GAME.camera));

  // F3 — 교수용 성능 표시 (적용된 화질 등급 / 실측 FPS)
  document.addEventListener('keydown', (e) => {
    if (e.code !== 'F3') return;
    e.preventDefault();
    const el = document.getElementById('hud-perf');
    if (el) el.style.display = el.style.display === 'block' ? 'none' : 'block';
  });
}

function movePlayer(dt) {
  const k = GAME.keys;
  let fx = 0, fz = 0;
  if (k['KeyW'] || k['ArrowUp']) fz += 1;
  if (k['KeyS'] || k['ArrowDown']) fz -= 1;
  if (k['KeyA'] || k['ArrowLeft']) fx -= 1;
  if (k['KeyD'] || k['ArrowRight']) fx += 1;
  if (!fx && !fz) return;
  const len = Math.hypot(fx, fz); fx /= len; fz /= len;
  const sin = Math.sin(GAME.yaw), cos = Math.cos(GAME.yaw);
  // 카메라 기준 전진/횡이동
  let dx = (fx * cos - fz * sin) * GAME.player.speed * dt;
  let dz = (-fx * sin - fz * cos) * GAME.player.speed * dt;
  let nx = GAME.player.x + dx, nz = GAME.player.z + dz;
  // 방 경계
  const mx = GAME.ROOM.w / 2 - 0.4, mz = GAME.ROOM.d / 2 - 0.4;
  nx = Math.max(-mx, Math.min(mx, nx));
  nz = Math.max(-mz, Math.min(mz, nz));
  // 침대·장비 충돌 (밀어내기)
  [...GAME.beds, ...(GAME.obstacles || [])].forEach((b) => {
    if (Math.abs(nx - b.cx) < b.hw && Math.abs(nz - b.cz) < b.hd) {
      const ox = b.hw - Math.abs(nx - b.cx);
      const oz = b.hd - Math.abs(nz - b.cz);
      if (ox < oz) nx += (nx > b.cx ? 1 : -1) * ox;
      else nz += (nz > b.cz ? 1 : -1) * oz;
    }
  });
  GAME.player.x = nx; GAME.player.z = nz;
}

function updateInteraction() {
  let best = null, bestDist = 2.6;
  GAME.beds.forEach((b) => {
    const d = Math.hypot(GAME.player.x - b.cx, GAME.player.z - b.cz);
    if (d < bestDist) { bestDist = d; best = b; }
  });
  GAME.nearPatient = best ? best.patient : null;
  const prompt = document.getElementById('hud-prompt');
  if (best && GAME.locked) {
    const done = UI.isDone(best.patient.id);
    prompt.style.display = 'block';
    prompt.innerHTML = done
      ? '<b>E</b> — ' + best.patient.name + ' 진료 기록 다시 보기 <span class="done-tag">진료완료</span>'
      : '<b>E</b> — <span class="p-name">' + best.patient.name + '</span> 환자 진료 시작 · “' + best.patient.chiefComplaint + '”';
  } else {
    prompt.style.display = 'none';
  }
}

let _frame = 0;
function animate() {
  requestAnimationFrame(animate);
  const now = performance.now() / 1000;
  const dt = Math.min(now - GAME.lastT, 0.05);
  GAME.lastT = now;
  const modal = UI.isModalOpen();

  if (GAME.locked && !modal) movePlayer(dt);
  GAME.camera.position.set(GAME.player.x, 1.6, GAME.player.z);
  GAME.camera.rotation.order = 'YXZ';
  GAME.camera.rotation.y = GAME.yaw;
  GAME.camera.rotation.x = GAME.pitch;
  updateInteraction();

  _frame++;
  // 진료 모달이 열려 있으면 장면은 반투명 배경으로만 보이고 정지 상태다.
  // 학생이 가장 오래 머무는 화면이므로 이때 GPU를 놓아주면 내장 그래픽에서 체감이 크다.
  if (modal && _frame % 4 !== 0) return;

  RENDER.render(GAME.renderer, GAME.scene, GAME.camera);
  if (!modal) RENDER.tickPerf(GAME.renderer, GAME.scene, GAME.camera);

  const perf = document.getElementById('hud-perf');
  if (perf && perf.style.display === 'block' && _frame % 20 === 0) {
    const st = RENDER.stats();
    perf.textContent = '화질 ' + st.tier + (st.pref === 'auto' ? ' (자동)' : ' (고정)') + ' · ' + st.fps + ' fps';
  }
}

function markBedDone(patientId) {
  const b = GAME.beds.find((b) => b.patient.id === patientId);
  if (b) b.checkSprite.visible = true;
}

window.GAME = GAME;
