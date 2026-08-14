// rooms/layout.js — MainLayout : 외벽 · 바닥 · 천장 · 3구역 구분벽 · 간판 · 천장조명
//
// 전체 도면 기준. 26m × 19m 한 층을 벽으로 세 개의 실로 나눈다.
//   +x 쪽(출입구에서 보면 왼쪽) 운동치료실 | 가운데 전기치료실 | -x 쪽 도수치료실
// 출입문은 정면(-z) 한가운데 있고, 들어서면 전기치료실 중앙 복도가 정면으로 뻗는다.
// 좌우 실로는 중앙 복도 양옆의 목재 문선 개구부로 들어간다 — 도면의 동선 그대로다.

function buildLayout() {
  const { w, d, h } = GAME.ROOM;
  const Z = GAME.ZONE;
  const s = GAME.scene;

  buildFloor(w, d);
  buildCeiling(w, d, h);
  buildShell(w, d, h);
  buildZoneWalls();
  buildCeilingFixtures(w, d, h);

  // ── 실 입구 (목재 문선 + 검은 사인) ──
  // 도수치료실 — 벽이 x = divM 이므로 문선은 z축을 따라 열린다
  KIT.portal(Z.divM, Z.manual.entryZ, Math.PI / 2, 1.7, '도수치료실');
  // 운동치료실 — 도면의 운동실 입구는 사람이 지나다니는 넓은 개구부다
  KIT.portal(Z.divE, Z.exercise.entryZ, Math.PI / 2, 3.2, '운동치료실');
  // 수치료실 — 운동치료실 안쪽 끝에서 가로벽을 지나 들어간다
  KIT.portal(Z.hydro.entryX, Z.hydro.wallZ, 0, Z.hydro.entryW, '수치료실');

  // 전기치료실 사인 — 도면처럼 중앙 복도 끝(안쪽 벽) 위에 건다.
  // 출입문으로 들어서면 복도 정면으로 바로 읽힌다.
  const eSign = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.62, 0.16), KIT.wood());
  eSign.position.set(Z.electro.aisleCX, h - 0.55, d / 2 - 0.10);
  eSign.castShadow = true;
  s.add(eSign);
  const ePlate = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 0.42),
    printedMat(makeTextCanvas(['전기치료실'], 512, 118, { bg: '#2b3239', color: '#f2f5f7', fontSize: 74 }),
      { roughness: 0.4, envMapIntensity: 1.0 }));
  ePlate.position.set(Z.electro.aisleCX, h - 0.55, d / 2 - 0.18);
  ePlate.rotation.y = Math.PI;
  s.add(ePlate);
}

// ── 바닥 ─────────────────────────────────────────────────────
// 병원 리놀륨 시트. 광택면은 매끈하고(러프 0.11) 이음선 홈은 무광이다.
// 노멀맵이 스펙클 알갱이와 홈을 실제 요철로 만들어 준다.
function buildFloor(w, d) {
  const floorMat = RENDER.pbrMaterial(
    (fx) => {
      fx.fillStyle = '#e6e7df'; fx.fillRect(0, 0, 512, 512);
      for (let i = 0; i < 26; i++) {     // 넓은 얼룩 — 단색 바닥이 플라스틱처럼 보이는 걸 막는다
        const g = fx.createRadialGradient(Math.random() * 512, Math.random() * 512, 0,
          Math.random() * 512, Math.random() * 512, 60 + Math.random() * 110);
        g.addColorStop(0, 'rgba(202,205,193,0.20)');
        g.addColorStop(1, 'rgba(198,206,210,0)');
        fx.fillStyle = g; fx.fillRect(0, 0, 512, 512);
      }
      for (let i = 0; i < 2600; i++) {   // 스펙클
        const g = 200 + Math.floor(Math.random() * 45);
        fx.fillStyle = 'rgba(' + g + ',' + (g + 4) + ',' + (g + 7) + ',' + (0.25 + Math.random() * 0.5) + ')';
        fx.fillRect(Math.random() * 512, Math.random() * 512, 1.6, 1.6);
      }
      for (let i = 0; i < 500; i++) {    // 어두운 점
        fx.fillStyle = 'rgba(120,132,140,' + (0.12 + Math.random() * 0.2) + ')';
        fx.fillRect(Math.random() * 512, Math.random() * 512, 1.3, 1.3);
      }
      fx.strokeStyle = 'rgba(163,168,155,0.16)'; fx.lineWidth = 1.5;
      [[0, 0], [256, 256], [256, 0], [0, 256]].forEach(([x, y]) => fx.strokeRect(x, y, 256, 256));
      // 시공 자국 — 광택 바닥은 왁스 결이 길게 남는다. 이게 있어야 반사가
      // 균일한 흰 판이 아니라 '닦아 놓은 바닥'으로 읽힌다.
      fx.strokeStyle = 'rgba(255,255,255,0.05)'; fx.lineWidth = 6;
      for (let i = 0; i < 14; i++) {
        const y = Math.random() * 512;
        fx.beginPath(); fx.moveTo(0, y); fx.lineTo(512, y + (Math.random() - 0.5) * 26); fx.stroke();
      }
    },
    {
      // envMapIntensity 1.7 + 러프 0.11은 바닥이 통째로 하얗게 타서
      // 얼룩·이음선이 전부 사라졌다. 반사를 줄이고 살짝 거칠게 잡는다.
      size: [512, 512], repeat: [w / 4, d / 4], normalStrength: 1.1, normalScale: 0.5,
      rough: { base: 0.16, dark: 0.52 }, envMapIntensity: 1.15,
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
  const floor = new THREE.Mesh(floorGeometry(w, d), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  GAME.scene.add(floor);
}

// 바닥판 — 수치료실의 전신 풀 자리는 도려낸다.
//
// 풀을 바닥에 앉히려면(수면이 바닥 높이) 그 아래가 실제로 비어 있어야 한다.
// 바닥판 한 장으로 덮어 두면 수조 벽·바닥이 판 밑에 가려 아무것도 안 보이고,
// 풀은 바닥에 그려 놓은 파란 사각형이 되어 버린다.
//
// PlaneGeometry 대신 구멍 뚫린 Shape 을 쓰되, UV 는 PlaneGeometry 와
// 똑같이 0..1 로 다시 씌운다. ShapeGeometry 의 기본 UV 는 미터 좌표라
// 재질의 repeat 값이 그대로 먹지 않는다(타일이 26×19배로 늘어난다).
function floorGeometry(w, d) {
  const P = GAME.ZONE.hydro.pool;
  const shape = new THREE.Shape();
  shape.moveTo(-w / 2, -d / 2);
  shape.lineTo(w / 2, -d / 2);
  shape.lineTo(w / 2, d / 2);
  shape.lineTo(-w / 2, d / 2);
  shape.closePath();

  // 판은 XY 평면에서 만들어 -90° 눕힌다 → 판의 +y 가 월드 -z 다.
  const x0 = P.cx - P.w / 2, x1 = P.cx + P.w / 2;
  const y0 = -(P.cz + P.d / 2), y1 = -(P.cz - P.d / 2);
  const hole = new THREE.Path();
  hole.moveTo(x0, y0);
  hole.lineTo(x0, y1);
  hole.lineTo(x1, y1);
  hole.lineTo(x1, y0);
  hole.closePath();
  shape.holes.push(hole);

  const geo = new THREE.ShapeGeometry(shape);
  const pos = geo.attributes.position, uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    uv.setXY(i, (pos.getX(i) + w / 2) / w, (pos.getY(i) + d / 2) / d);
  }
  uv.needsUpdate = true;
  return geo;
}

// ── 천장 ─────────────────────────────────────────────────────
// 600×600 미네랄울 흡음 타일 — 미세 타공을 넣으면 흰 판이 즉시 천장으로 읽힌다.
function buildCeiling(w, d, h) {
  const ceilDraw = (g, S, dark) => {
    g.fillStyle = dark ? '#808080' : '#f4f7f8'; g.fillRect(0, 0, S, S);
    for (let i = 0; i < 420; i++) {
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
    g.strokeStyle = dark ? '#303030' : '#cbd5da';
    g.lineWidth = 5; g.strokeRect(0, 0, S, S);
  };
  const ceilMat = RENDER.pbrMaterial(
    (g, S) => ceilDraw(g, S, false),
    { size: [256, 256], repeat: [w / 0.6, d / 0.6], normalStrength: 1.6, normalScale: 0.7,
      rough: { base: 0.95, dark: 1.0 }, envMapIntensity: 0.5,
      height: (g, S) => ceilDraw(g, S, true) }
  );
  // 천장은 색상값 자체는 밝은데(#f4f7f8) 아래를 향한 면이라 빛을 거의 못 받아
  // 화면에서는 잿빛으로 죽어 있었다 — 방 전체가 무겁게 눌려 보이던 원인이다.
  // 실제 흡음 천장은 아래 등기구가 쏘아 올린 빛을 되받아 꽤 밝다.
  // 그 되받은 빛을 약한 자체발광으로 대신한다 (광원을 늘리지 않으니 공짜다).
  ceilMat.emissive = new THREE.Color(0xdfe7ec);
  ceilMat.emissiveIntensity = 0.34;
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(w, d), ceilMat);
  ceil.rotation.x = Math.PI / 2; ceil.position.y = h;
  GAME.scene.add(ceil);
}

// ── 외피: 외벽 · 걸레받이 · 창 · 출입문 · 정면 간판 ──────────
function buildShell(w, d, h) {
  const s = GAME.scene;

  // 벽 — 상단 도장 + 하단 웨인스코팅(보호 패널)
  const WALL_TILE = 4;
  const bandTop = 512 * (1 - 1.1 / h);
  const wallDraw = (g, W, H, dark) => {
    g.fillStyle = dark ? '#8a8a8a' : '#f3f2ee'; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 2600; i++) {
      const a = Math.random() * (dark ? 0.5 : 0.3);
      g.fillStyle = dark ? 'rgba(120,120,120,' + a + ')' : 'rgba(210,212,206,' + a + ')';
      g.fillRect(Math.random() * W, Math.random() * bandTop, 2.2, 2.2);
    }
    g.fillStyle = dark ? '#8f8f8f' : '#dce1da'; g.fillRect(0, bandTop, W, H - bandTop);
    for (let x = 0; x < W; x += 128) {
      g.strokeStyle = dark ? '#303030' : 'rgba(150,162,150,0.45)';
      g.lineWidth = dark ? 3 : 2;
      g.beginPath(); g.moveTo(x, bandTop + 10); g.lineTo(x, H - 8); g.stroke();
    }
    g.fillStyle = dark ? '#d8d8d8' : '#b6bfb6'; g.fillRect(0, bandTop - 8, W, 11);
    if (dark) return;
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
    s.add(m);
  };
  mkWall(w, 0, -d / 2, 0, wallMat);
  mkWall(w, 0, d / 2, Math.PI, wallMat);
  mkWall(d, -w / 2, 0, Math.PI / 2, wallMatShort);
  mkWall(d, w / 2, 0, -Math.PI / 2, wallMatShort);

  // 걸레받이
  const skirtMat = KIT.std(0x97a196, { roughness: 0.45, metalness: 0.05 });
  [[w, 0, -d / 2 + 0.02, 0], [w, 0, d / 2 - 0.02, Math.PI],
   [d, -w / 2 + 0.02, 0, Math.PI / 2], [d, w / 2 - 0.02, 0, -Math.PI / 2]].forEach(([ww, x, z, ry]) => {
    const sk = new THREE.Mesh(new THREE.PlaneGeometry(ww, 0.15), skirtMat);
    sk.position.set(x, 0.075, z); sk.rotation.y = ry;
    s.add(sk);
  });

  // ── 창 ──
  // 창밖 풍경 한 장을 만들어 모든 창이 공유한다.
  const gcv = document.createElement('canvas');
  gcv.width = 512; gcv.height = 256;
  const gg = gcv.getContext('2d');
  const grad = gg.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, '#8dc2ee'); grad.addColorStop(0.5, '#c3e2fa'); grad.addColorStop(0.78, '#e2f0f6');
  gg.fillStyle = grad; gg.fillRect(0, 0, 512, 256);
  gg.fillStyle = 'rgba(255,255,255,0.8)';
  gg.beginPath(); gg.ellipse(140, 62, 68, 22, 0, 0, 7); gg.fill();
  gg.beginPath(); gg.ellipse(370, 96, 84, 24, 0, 0, 7); gg.fill();
  gg.fillStyle = 'rgba(150,172,186,0.55)';
  [[20, 150, 70, 46], [104, 138, 52, 58], [300, 144, 86, 52], [400, 132, 60, 64]].forEach(([x, y, bw, bh]) => {
    gg.fillRect(x, y, bw, bh);
  });
  gg.fillStyle = 'rgba(108,142,110,0.75)';
  for (let i = 0; i < 14; i++) {
    const x = 8 + i * 37, r = 13 + Math.random() * 8;
    gg.beginPath(); gg.arc(x, 196 + Math.random() * 6, r, 0, 7); gg.fill();
  }
  gg.fillStyle = '#cfd9d2'; gg.fillRect(0, 210, 512, 46);
  const glassTex = RENDER.colorTex(gcv);
  // 창밖은 실내보다 훨씬 밝다. emissive라야 형광등에 눌리지 않는다.
  // 창은 실내보다 두세 스톱 밝아야 '바깥'으로 읽힌다. 블룸 임계값을 넘겨
  // 창틀 주변에 옅은 빛번짐이 생기면서 실내 대비가 살아난다.
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0x000000, emissive: 0xffffff, emissiveMap: glassTex, emissiveIntensity: 1.35, roughness: 1,
  });
  const frameMat = KIT.std(0x9aa8b0, { roughness: 0.3, metalness: 0.85, envMapIntensity: 1.2 });
  const mullMat = KIT.std(0xdde4e8, { roughness: 0.4, metalness: 0.2 });

  // 창 하나 — 벽면 안쪽으로 5cm 들어간 자리에 붙인다. yaw는 창이 바라보는 방향.
  const mkWindow = (x, z, yaw) => {
    const g = new THREE.Group();
    const win = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.3), glassMat);
    g.add(win);
    [[2.6, 0.08, 0, 0.71], [2.6, 0.08, 0, -0.71], [0.08, 1.5, 1.3, 0], [0.08, 1.5, -1.3, 0]].forEach(([bw, bh, ox, oy]) => {
      const f = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, 0.09), frameMat);
      f.position.set(ox, oy, 0.005);
      g.add(f);
    });
    const mv = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.3, 0.06), mullMat);
    const mh = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.05, 0.06), mullMat);
    mv.position.z = 0.01; mh.position.z = 0.01;
    g.add(mv, mh);
    const sill = new THREE.Mesh(new THREE.BoxGeometry(2.7, 0.05, 0.16), mullMat);
    sill.position.set(0, -0.68, 0.06);
    g.add(sill);
    g.position.set(x, 1.9, z);
    g.rotation.y = yaw;
    s.add(g);
  };

  // 정면(-z): 출입문 좌우. 안쪽(+z): 전 구역. 좌우 외벽: 각 실 창가.
  [-8.6, -4.4, 4.4, 8.6].forEach((x) => mkWindow(x, -d / 2 + 0.06, 0));
  [-10.8, -7.4, -2.0, 2.0, 6.4, 10.2].forEach((x) => mkWindow(x, d / 2 - 0.06, Math.PI));
  GAME.ZONE.manual.roomZ.forEach((z) => mkWindow(-w / 2 + 0.06, z, Math.PI / 2));   // 도수 룸 창가
  // 운동치료실 쪽 외벽은 대형 거울·늑목·덤벨랙이 줄지어 차지한다.
  // 남는 자리는 수치료실 구간뿐이라 창은 거기에 낸다 — 풀에 낮빛이 들어온다.
  [6.60].forEach((z) => mkWindow(w / 2 - 0.06, z, -Math.PI / 2));

  // ── 출입문 (정면 한가운데) ──
  const dcv = document.createElement('canvas');
  dcv.width = 256; dcv.height = 320;
  const dg = dcv.getContext('2d');
  dg.fillStyle = '#b7c9d4'; dg.fillRect(0, 0, 256, 320);
  dg.strokeStyle = '#8fa5b2'; dg.lineWidth = 5;
  dg.strokeRect(8, 8, 112, 304); dg.strokeRect(136, 8, 112, 304);
  dg.fillStyle = '#dcebf5'; dg.fillRect(30, 40, 68, 90); dg.fillRect(158, 40, 68, 90);
  dg.fillStyle = '#5b6d78'; dg.fillRect(108, 160, 8, 46); dg.fillRect(140, 160, 8, 46);
  const door = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 2.4),
    KIT.std(0xffffff, { map: RENDER.colorTex(dcv), roughness: 0.35, metalness: 0.25, envMapIntensity: 1.1 }));
  door.position.set(0, 1.2, -d / 2 + 0.04);
  s.add(door);

  // 정면 간판 — 도면의 검은 사인. 들어와서 뒤를 돌면 읽힌다.
  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(7.4, 1.05),
    printedMat(makeTextCanvas(['광주보건대학교 부속 물리치료실'], 1024, 145, { bg: '#2b3239', color: '#ffffff', fontSize: 70 }),
      { roughness: 0.28, metalness: 0.1, envMapIntensity: 1.2 })
  );
  sign.position.set(0, 2.92, -d / 2 + 0.06);
  s.add(sign);
}

// ── 3구역 구분벽 ─────────────────────────────────────────────
// 도면의 세 실은 천장까지 올라간 벽으로 완전히 나뉜다.
// 각 벽에는 개구부가 하나씩 있고, 그 자리에 layout이 목재 문선을 세운다.
function buildZoneWalls() {
  const { d, h } = GAME.ROOM;
  const Z = GAME.ZONE;

  // 도수치료실 | 전기치료실
  KIT.wallRun({
    axis: 'z', at: Z.divM, from: -d / 2, to: d / 2,
    openings: [{ c: Z.manual.entryZ, w: 1.7 }],
  });
  // 전기치료실 | 운동치료실
  KIT.wallRun({
    axis: 'z', at: Z.divE, from: -d / 2, to: d / 2,
    openings: [{ c: Z.exercise.entryZ, w: 3.2 }],
  });
  // 운동치료실 | 수치료실 — 운동실 안쪽 끝을 가로로 막는다.
  // 수치료실은 습기·염소 냄새를 가둬야 해서 실제로도 완전히 분리된 실이다.
  KIT.wallRun({
    axis: 'x', at: Z.hydro.wallZ, from: Z.divE, to: GAME.ROOM.w / 2,
    openings: [{ c: Z.hydro.entryX, w: Z.hydro.entryW }],
  });

  // 구분벽 상단 목재 몰딩 — 도면의 벽은 상부에 오크 띠가 둘러져 있다
  [Z.divM, Z.divE].forEach((x) => {
    const cap = new THREE.Mesh(new THREE.BoxGeometry(Z.wallT + 0.06, 0.12, d), KIT.wood());
    cap.position.set(x, h - 0.28, 0);
    GAME.scene.add(cap);
  });
  const hCap = new THREE.Mesh(
    new THREE.BoxGeometry(GAME.ROOM.w / 2 - Z.divE, 0.12, Z.wallT + 0.06), KIT.wood());
  hCap.position.set((Z.divE + GAME.ROOM.w / 2) / 2, h - 0.28, Z.hydro.wallZ);
  GAME.scene.add(hCap);
}

// ── 천장 등기구 ──────────────────────────────────────────────
// 실제로 빛을 내는 광원은 render.js가 화질 등급에 맞춰 배치한다.
// 여기서는 "보이는 기구"(형광등 패널 · 매입 다운라이트)만 만든다.
function buildCeilingFixtures(w, d, h) {
  const s = GAME.scene;
  const Z = GAME.ZONE;

  // 형광등 패널 — emissive라 블룸에서 번지고 금속·거울 반사에도 잡힌다.
  const panelMat = new THREE.MeshStandardMaterial({
    color: 0x000000, emissive: 0xf6faff, emissiveIntensity: 2.3, roughness: 1,
  });
  const frameMat = KIT.std(0xb8c2c8, { roughness: 0.35, metalness: 0.6, envMapIntensity: 1.1 });
  const n = Z.lights.length;
  const panels = new THREE.InstancedMesh(new THREE.BoxGeometry(1.76, 0.075, 0.5), panelMat, n);
  const frames = new THREE.InstancedMesh(new THREE.BoxGeometry(1.9, 0.07, 0.62), frameMat, n);
  const m4 = new THREE.Matrix4();
  const q0 = new THREE.Quaternion();
  const one = new THREE.Vector3(1, 1, 1);
  Z.lights.forEach(([x, z], i) => {
    m4.compose(new THREE.Vector3(x, h - 0.044, z), q0, one);
    panels.setMatrixAt(i, m4);
    m4.compose(new THREE.Vector3(x, h - 0.045, z), q0, one);
    frames.setMatrixAt(i, m4);
  });
  panels.instanceMatrix.needsUpdate = true;
  frames.instanceMatrix.needsUpdate = true;
  s.add(panels, frames);

  // 원형 매입 다운라이트 — 국내 병원 천장의 특징. 개별 메시로 두면 드로우콜이
  // 아까우므로 InstancedMesh로 묶어 전구·테두리 각각 1회 호출로 처리한다.
  const spots = [];
  // 도수치료실: 룸마다 2개 + 복도 줄
  Z.manual.roomZ.forEach((z) => { spots.push([-11.6, z], [-7.8, z]); });
  [-6.6, -1.6, 3.4, 8.0].forEach((z) => spots.push([Z.manual.corrCX, z]));
  // 전기치료실: 복도 양옆
  [-7.4, -4.6, -1.8, 1.0, 3.8, 6.6].forEach((z) => { spots.push([-2.75, z], [2.75, z]); });
  // 운동치료실: 넓은 실이라 격자로 (안쪽 끝은 수치료실이라 z 2.6 까지)
  [4.6, 7.6, 10.6, 12.4].forEach((x) => {
    [-8.4, -5.4, -2.4, 0.6, 2.6].forEach((z) => spots.push([x, z]));
  });
  // 수치료실: 물 위는 밝아야 바닥이 보인다 — 풀 둘레로 촘촘히
  [4.7, 6.9, 9.1, 11.3, 12.6].forEach((x) => {
    [4.4, 6.5, 8.6].forEach((z) => spots.push([x, z]));
  });

  const dlCount = spots.length;
  const bulbs = new THREE.InstancedMesh(new THREE.CircleGeometry(0.085, 14),
    new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xfff2dc, emissiveIntensity: 2.1, roughness: 1 }), dlCount);
  const rings = new THREE.InstancedMesh(new THREE.RingGeometry(0.085, 0.115, 14),
    KIT.std(0xf2f1ed, { roughness: 0.45, metalness: 0.15, envMapIntensity: 1.0 }), dlCount);
  const qDown = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0));
  spots.forEach(([x, z], i) => {
    m4.compose(new THREE.Vector3(x, h - 0.012, z), qDown, one);
    bulbs.setMatrixAt(i, m4);
    m4.compose(new THREE.Vector3(x, h - 0.016, z), qDown, one);
    rings.setMatrixAt(i, m4);
  });
  bulbs.instanceMatrix.needsUpdate = true;
  rings.instanceMatrix.needsUpdate = true;
  s.add(bulbs, rings);
}
