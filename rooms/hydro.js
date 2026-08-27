// rooms/hydro.js — HydroRoom : 수치료실 (운동치료실 안쪽 끝)
//
// 충남대학교병원 재활치료센터 수치료실 소개 페이지의 사진 4장을 옮긴 것이다.
//   ①② 보행 풀 치료 프로그램 — 대기(공기 중)에서 훈련하기 어려운 환자를 위한
//        1인풀 시스템. 스테인리스 수조 안에 수중 트레드밀이 깔려 있고,
//        앞면 아크릴 창으로 치료사가 물속 다리 움직임을 본다.
//        여기서 무릎 환자(p9 슬개대퇴통증)가 부분체중부하 보행훈련을 받는다.
//   ③④ 전신 풀 치료 수영장 — 바닥에 앉힌 수조. 할리윅·바트라가츠·왓수를
//        1:1 또는 그룹으로 시행한다. 수중 계단·벤치·평행봉이 들어간다.
//
// 좌표: x 4.0~14.5, z 3.4~11.0 (운동치료실과는 z = ZONE.hydro.wallZ 벽으로 분리)

function buildHydroRoom() {
  const H = GAME.ZONE.hydro;

  buildHydroFloor();
  buildTherapyPool(H.pool);
  buildGaitPool(H.gait);
  buildHydroFittings();
}

// ── 물 재질 ──────────────────────────────────────────────────
// 잔물결 노멀맵 한 장을 두 풀이 나눠 쓴다. 색상맵 없이 노멀만으로 충분하다 —
// 물은 자기 색이 거의 없고, 보이는 것의 대부분이 '무엇이 비치는가'다.
// 그래서 러프니스를 아주 낮추고 환경반사를 크게 올린다.
let RIPPLE_TEX = null;
function rippleCanvas() {
  if (RIPPLE_TEX) return RIPPLE_TEX;
  const S = 256;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d', { willReadFrequently: true });
  const img = g.createImageData(S, S);
  // 주파수를 전부 정수로 두어야 타일 경계에서 물결이 끊기지 않는다.
  for (let y = 0; y < S; y++) {
    const v = (y / S) * Math.PI * 2;
    for (let x = 0; x < S; x++) {
      const u = (x / S) * Math.PI * 2;
      const h = Math.sin(u * 3 + Math.sin(v * 2) * 0.9) * 0.50
              + Math.sin(v * 4 + Math.sin(u * 3) * 0.7) * 0.34
              + Math.sin((u + v) * 6) * 0.16;
      const c = 128 + h * 42;
      const i = (y * S + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = c;
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  RIPPLE_TEX = cv;
  return cv;
}

// 수면. drift 를 주면 노멀맵이 천천히 흘러 물이 살아 움직인다.
function waterMaterial(rx, ry, opt) {
  const o = opt || {};
  const nrm = RENDER.normalMapFrom(rippleCanvas(), o.wave === undefined ? 1.5 : o.wave);
  nrm.wrapS = nrm.wrapT = THREE.RepeatWrapping;
  nrm.repeat.set(rx, ry);
  const mat = new THREE.MeshStandardMaterial({
    color: o.color === undefined ? 0x8ecfe4 : o.color,
    transparent: true,
    opacity: o.opacity === undefined ? 0.60 : o.opacity,
    roughness: 0.05, metalness: 0.25, envMapIntensity: 2.4,
    normalMap: nrm,
    normalScale: new THREE.Vector2(o.wave === undefined ? 0.6 : o.wave * 0.4,
                                   o.wave === undefined ? 0.6 : o.wave * 0.4),
    side: THREE.DoubleSide,
    depthWrite: false,       // 물 아래(수조 바닥·환자 다리)가 가려지지 않게
  });
  if (o.drift !== false) {
    GAME.tickers.push((dt) => {
      nrm.offset.x += dt * 0.012;
      nrm.offset.y += dt * 0.019;
    });
  }
  return mat;
}

// 수조 내벽·바닥 타일 — 물빛이 도는 연한 아쿠아. 줄눈이 있어야 물이 맑아 보인다.
function poolTileMaterial(rx, ry) {
  const draw = (g, S, dark) => {
    g.fillStyle = dark ? '#8c8c8c' : '#cfe6ec';
    g.fillRect(0, 0, S, S);
    for (let i = 0; i < 900; i++) {           // 유약 얼룩
      g.fillStyle = dark ? 'rgba(140,140,140,0.25)' : 'rgba(168,208,220,' + (Math.random() * 0.28) + ')';
      g.fillRect(Math.random() * S, Math.random() * S, 2.4, 2.4);
    }
    g.strokeStyle = dark ? '#3a3a3a' : '#a6c6d0';   // 줄눈
    g.lineWidth = dark ? 7 : 4;
    g.strokeRect(0, 0, S, S);
  };
  return RENDER.pbrMaterial((g, S) => draw(g, S, false), {
    size: [128, 128], repeat: [rx, ry], normalStrength: 1.2, normalScale: 0.5,
    rough: { base: 0.14, dark: 0.32 }, envMapIntensity: 1.8,
    height: (g, S) => draw(g, S, true),
  });
}

// ── 바닥 마감 ────────────────────────────────────────────────
// 수치료실 바닥은 병원 리놀륨이 아니라 논슬립 자기타일이다. 전신 풀 구멍만
// 도려낸 판을 리놀륨 위에 한 겹 덮는다. (구멍은 layout.js 가 이미 뚫어 뒀다)
function buildHydroFloor() {
  const H = GAME.ZONE.hydro, P = H.pool;
  const x0 = GAME.ZONE.divE, x1 = GAME.ROOM.w / 2;
  const z0 = H.wallZ, z1 = GAME.ROOM.d / 2;
  const W = x1 - x0, D = z1 - z0;

  const draw = (g, S, dark) => {
    g.fillStyle = dark ? '#8a8a8a' : '#dfe3e0';
    g.fillRect(0, 0, S, S);
    for (let i = 0; i < 2200; i++) {          // 논슬립 알갱이
      const a = Math.random() * (dark ? 0.55 : 0.30);
      g.fillStyle = dark ? 'rgba(190,190,190,' + a + ')' : 'rgba(160,176,180,' + a + ')';
      g.fillRect(Math.random() * S, Math.random() * S, 1.8, 1.8);
    }
    g.strokeStyle = dark ? '#3c3c3c' : '#b3bfc0';
    g.lineWidth = dark ? 6 : 3.5;
    g.strokeRect(0, 0, S, S);
  };
  const mat = RENDER.pbrMaterial((g, S) => draw(g, S, false), {
    size: [128, 128], repeat: [W / 0.30, D / 0.30], normalStrength: 1.4, normalScale: 0.55,
    // 젖은 바닥이라 매끈하다. 다만 논슬립이라 거울처럼은 아니다.
    rough: { base: 0.24, dark: 0.5 }, envMapIntensity: 1.5,
    height: (g, S) => draw(g, S, true),
  });

  const shape = new THREE.Shape();
  shape.moveTo(x0, -z1); shape.lineTo(x1, -z1); shape.lineTo(x1, -z0); shape.lineTo(x0, -z0);
  shape.closePath();
  const hole = new THREE.Path();
  const hx0 = P.cx - P.w / 2, hx1 = P.cx + P.w / 2;
  const hy0 = -(P.cz + P.d / 2), hy1 = -(P.cz - P.d / 2);
  hole.moveTo(hx0, hy0); hole.lineTo(hx0, hy1); hole.lineTo(hx1, hy1); hole.lineTo(hx1, hy0);
  hole.closePath();
  shape.holes.push(hole);

  const geo = new THREE.ShapeGeometry(shape);
  const pos = geo.attributes.position, uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    uv.setXY(i, (pos.getX(i) - x0) / W, (pos.getY(i) + z1) / D);
  }
  uv.needsUpdate = true;

  const floor = new THREE.Mesh(geo, mat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0.006;      // 리놀륨 위에 얹는다
  floor.receiveShadow = true;
  GAME.scene.add(floor);
}

// ── 전신 풀 (③④ 전신 풀 치료 수영장) ────────────────────────
// 바닥을 도려낸 자리에 수조를 앉힌다. 수심 1.25m — 성인 가슴 높이라
// 할리윅·바트라가츠 기법을 서서 시행할 수 있다.
function buildTherapyPool(P) {
  const s = GAME.scene;
  const hw = P.w / 2, hd = P.d / 2, DEP = P.depth;
  const g = new THREE.Group();
  g.position.set(P.cx, 0, P.cz);
  s.add(g);

  // 바닥 — repeat 를 면마다 따로 잡아야 타일이 정사각형으로 나온다
  const floorMat = poolTileMaterial(P.w / 0.30, P.d / 0.30);
  const basin = new THREE.Mesh(new THREE.PlaneGeometry(P.w, P.d), floorMat);
  basin.rotation.x = -Math.PI / 2;
  basin.position.y = -DEP;
  basin.receiveShadow = true;
  g.add(basin);

  // 내벽 4장 — 안쪽을 향해 세운다
  const wallMatX = poolTileMaterial(P.d / 0.30, DEP / 0.30);
  const wallMatZ = poolTileMaterial(P.w / 0.30, DEP / 0.30);
  [[0, -hd, 0, P.w, wallMatZ], [0, hd, Math.PI, P.w, wallMatZ],
   [-hw, 0, Math.PI / 2, P.d, wallMatX], [hw, 0, -Math.PI / 2, P.d, wallMatX]].forEach(([x, z, ry, len, m]) => {
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(len, DEP), m);
    wall.position.set(x, -DEP / 2, z);
    wall.rotation.y = ry;
    g.add(wall);
  });

  // 수중 조명 — 앞벽에 박힌 방수등. 물속이 어두우면 수조가 검은 구덩이가 된다.
  // 계단이 -x 모서리를 차지하므로 등은 그 반대쪽에만 단다.
  [0.30, 1.20].forEach((x) => {
    const lamp = new THREE.Mesh(new THREE.CircleGeometry(0.11, 16),
      new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xcfeffb, emissiveIntensity: 2.4, roughness: 1 }));
    lamp.position.set(x, -0.52, -hd + 0.012);
    g.add(lamp);
    const bez = new THREE.Mesh(new THREE.RingGeometry(0.11, 0.135, 16), KIT.steel(0xd2dade));
    bez.position.set(x, -0.52, -hd + 0.010);
    g.add(bez);
  });

  // 수중 계단 3단 (앞쪽 -x 모서리) + 그랩레일.
  // 아래 단일수록 물 쪽으로 더 나온다 — 실제 풀 계단의 단면이다.
  // 각 단은 디딤면에서 수조 바닥까지 꽉 찬 덩어리다. 얇은 판으로 두면
  // 물속에 판때기가 떠 있는 것처럼 보인다.
  const stepMat = KIT.std(0xd6e4e6, { roughness: 0.35, metalness: 0.05, envMapIntensity: 1.6 });
  [[-0.32, 0.44], [-0.66, 0.82], [-1.00, 1.20]].forEach(([y, depth]) => {
    const th = y + DEP;
    const block = new THREE.Mesh(new THREE.BoxGeometry(1.30, th, depth), stepMat);
    block.position.set(-hw + 0.65, y - th / 2, -hd + depth / 2);
    g.add(block);
  });
  const railMat = KIT.steel(0xd8e0e4);
  [-hw + 0.10, -hw + 1.22].forEach((x) => {
    const rail = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.024, 8, 16, Math.PI * 0.9), railMat);
    rail.position.set(x, 0.30, -hd + 0.62);
    rail.rotation.set(0, Math.PI / 2, -0.35);
    g.add(rail);
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.42, 8), railMat);
    foot.position.set(x, 0.06, -hd + 0.20);
    g.add(foot);
  });

  // 수중 벤치 (+z 벽) — 왓수·이완 치료 때 앉거나 눕는 자리
  const bench = new THREE.Mesh(KIT.rbox(2.20, 0.10, 0.46, 0.02), stepMat);
  bench.position.set(0.30, -0.70, hd - 0.25);
  g.add(bench);
  [-0.80, 1.40].forEach((x) => {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.09, DEP - 0.75, 0.36), stepMat);
    leg.position.set(x, -(DEP + 0.70) / 2 - 0.02, hd - 0.25);
    g.add(leg);
  });

  // 수중 평행봉 — 물속 보행 훈련용. 바닥에 고정된 스테인리스 봉이다.
  // 계단(-x 모서리, x −1.80~−0.50)을 피해 오른쪽으로 물려 세운다.
  [-0.42, 0.42].forEach((dz) => {
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 2.10, 10), railMat);
    bar.rotation.z = Math.PI / 2;
    bar.position.set(0.60, -0.32, dz - 0.35);
    g.add(bar);
    [-0.90, 0.90].forEach((dx) => {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.030, DEP - 0.32, 8), railMat);
      post.position.set(0.60 + dx, -(DEP + 0.32) / 2 + 0.005, dz - 0.35);
      g.add(post);
    });
  });

  // 수면 — 데크보다 6cm 아래(오버플로 그레이팅 높이)
  const water = new THREE.Mesh(new THREE.PlaneGeometry(P.w, P.d), waterMaterial(P.w / 1.6, P.d / 1.6));
  water.rotation.x = -Math.PI / 2;
  water.position.y = -0.06;
  water.renderOrder = 2;
  g.add(water);

  // 테두리 — 논슬립 코핑 + 오버플로 그레이팅
  const cope = KIT.std(0xc9cfc9, { roughness: 0.5, metalness: 0.04, envMapIntensity: 1.1 });
  const grate = KIT.steel(0xa9b4ba);
  const CW = 0.30;
  [[0, -hd - CW / 2, P.w + CW * 2, CW], [0, hd + CW / 2, P.w + CW * 2, CW],
   [-hw - CW / 2, 0, CW, P.d], [hw + CW / 2, 0, CW, P.d]].forEach(([x, z, sx, sz]) => {
    const c = new THREE.Mesh(KIT.rbox(sx, 0.07, sz, 0.012), cope);
    c.position.set(x, 0.035, z);
    c.receiveShadow = true;
    g.add(c);
  });
  // 물 쪽 가장자리의 배수 그레이팅 한 줄
  [[0, -hd + 0.03, P.w, 0.06], [0, hd - 0.03, P.w, 0.06],
   [-hw + 0.03, 0, 0.06, P.d], [hw - 0.03, 0, 0.06, P.d]].forEach(([x, z, sx, sz]) => {
    const gr = new THREE.Mesh(new THREE.BoxGeometry(sx, 0.02, sz), grate);
    gr.position.set(x, 0.005, z);
    g.add(gr);
  });

  // 풀 둘레 안전 난간 (뒤·오른쪽) — 데크에서 물로 바로 떨어지지 않게.
  // 기둥만 세우면 뜬금없는 막대가 되므로 가로대를 ㄱ자로 이어 준다.
  const RY = 0.92;
  KIT.armLinkage(g, [
    [-hw + 0.30, RY, hd + 0.34], [hw + 0.34, RY, hd + 0.34], [hw + 0.34, RY, -0.30],
  ], 0.026, railMat);
  [[-hw + 0.30, hd + 0.34], [0.50, hd + 0.34], [hw + 0.34, hd + 0.34],
   [hw + 0.34, 0.90], [hw + 0.34, -0.30]].forEach(([x, z]) => {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.030, RY, 8), railMat);
    post.position.set(x, RY / 2, z);
    g.add(post);
  });

  // ── 환자 (p19 고관절 이형성·미세불안정) — 수중 근력·협응 훈련 ──
  // 과가동 고관절에 지상 체중부하는 부담이라, 부력으로 하중을 덜고
  // 한 다리 지지·골반 조절을 훈련하는 것이 이 환자에게 풀이 필요한 이유다.
  // 발이 수조 바닥(y = −DEP)에 닿아야 하므로 그만큼 내려 세운다.
  const patient = PATIENTS[18];
  // 환자가 서는 자리(풀 기준). 수조 한가운데(0.60, −0.10)에 세웠더니 물가까지
  // 빙 돌아가야 얼굴이 보였다. 학생은 −x·−z 쪽 개구부로 들어오므로 그쪽 벽에
  // 붙여 세워야 들어서자마자 보인다. 아령·치료사·판정도 이 값을 따라간다.
  const px = 0.10, pz = -hd + 0.62;
  const pg = new THREE.Group();
  pg.add(buildPatientFigure(patient, { stance: 'stand' }));
  pg.position.set(px, -DEP, pz);
  pg.rotation.y = Math.PI;                 // 입구(−z) 쪽을 바라본다
  g.add(pg);

  // 수중 운동용 아령(부력 덤벨) — 양손에 하나씩 잡는 높이에 띄운다
  [-0.30, 0.30].forEach((dx) => {
    const db = new THREE.Group();
    [-0.11, 0.11].forEach((dy) => {
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.14, 12),
        KIT.std(0x3f7fa5, { roughness: 0.7 }));
      cap.position.y = dy;
      db.add(cap);
    });
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.020, 0.020, 0.20, 8), KIT.steel(0xd8e0e4));
    db.add(bar);
    db.rotation.z = Math.PI / 2;
    db.position.set(px + dx, -DEP + 0.94, pz + 0.24);
    g.add(db);
  });

  // 명패 — 수조가 커서 침대처럼 발치에 눕힐 수 없다. 데크 모서리에 세운다.
  const sign = new THREE.Group();
  KIT.nameplate(sign, [patient.name + ' (' + patient.sex + ', ' + patient.age + '세)'],
    0, 1.06, 0, 0, 0.62);
  const spost = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.96, 8), KIT.steel(0xa8b3ba));
  spost.position.y = 0.48;
  const sbase = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.19, 0.03, 14),
    KIT.std(0x8d979e, { roughness: 0.45, metalness: 0.5 }));
  sbase.position.y = 0.015;
  sign.add(spost, sbase);
  // 명패도 들어오는 쪽 데크 모서리로 — 환자와 이름이 한 화면에 들어와야 한다
  sign.position.set(-0.80, 0, -hd - CW - 0.34);
  sign.rotation.y = Math.PI;
  g.add(sign);

  // 진료 판정 — 학생은 데크에 서서 E 를 누른다.
  //
  // 판정 중심은 '풀 한가운데'가 아니라 '환자가 실제로 서 있는 자리'여야 한다.
  // 중심이 수조 한가운데면 2.6m 반경이 안쪽 데크까지만 닿아서, 들어서자마자
  // 눈앞에 환자가 보이는데도 빙 돌아가야 E 가 떴다.
  // 상자는 수조 안에만 두어 새로 막는 자리가 생기지 않게 한다 — 풀 전체는
  // 아래 wallSolid 가 이미 막고 있다.
  KIT.registerPatient(g, patient, P.cx + px, P.cz + pz, 1.20, 0.60, 1.25);
  // 완료 체크 표시도 환자 머리 위로 옮긴다 (기본값은 그룹 원점 = 수조 한가운데)
  GAME.beds[GAME.beds.length - 1].checkSprite.position.set(px, 1.25, pz);

  // 치료사 — 전신 풀의 할리윅·바트라가츠·왓수는 치료사가 물에 같이 들어가
  // 환자를 받쳐 주는 1:1 기법이다. 데크에서 지켜보는 것으로는 그 장면이 안 된다.
  // 환자와 마주 서도록 −x 쪽에 세우고 +x(환자)를 보게 한다.
  KIT.therapistIn(g, px + 1.05, -DEP, pz, -Math.PI / 2, 'staff_m');

  // 풀 전체를 통행 금지로 등록한다. AO 데칼이 없는 wallSolid 를 쓴다 —
  // solid 로 두면 도려낸 바닥 구멍 위에 검은 원이 떠서 물이 더러워 보인다.
  KIT.wallSolid(P.cx, P.cz, hw + CW + 0.1, hd + CW + 0.1);
}

// ── 보행 풀 (①② 보행 풀 치료 프로그램 · 1인풀 수중 트레드밀) ─
// 스테인리스 수조 + 앞면 아크릴 창 + 바닥 트레드밀 + 측면 조작 콘솔.
// 대기에서 걷기 어려운 환자가 부력으로 체중을 덜고 걷는다.
function buildGaitPool(G) {
  const W = G.w, D = G.d, H = G.h, FL = G.deck;
  const T = 0.09;                     // 수조 벽 두께
  const WATER = 1.30;                 // 수면 (안쪽 바닥에서 1.14m — 성인 명치 높이)
  // 관찰창 윗변은 수면보다 위에 둔다. 수면 아래에서 끊으면 창으로 볼 때
  // 물이 안 보여서 마른 유리 상자에 사람이 서 있는 것처럼 읽힌다.
  const WIN_HW = 0.78, WIN_Y0 = 0.34, WIN_Y1 = 1.38;

  const g = new THREE.Group();
  g.position.set(G.cx, 0, G.cz);
  GAME.scene.add(g);

  const steel = KIT.steel(0xccd5da);
  const shell = KIT.std(0xe9eef1, { roughness: 0.28, metalness: 0.55, envMapIntensity: 1.5 });
  const dark = KIT.std(0x39434a, { roughness: 0.4, metalness: 0.2 });

  // 받침대 + 수조 바닥
  const plinth = new THREE.Mesh(KIT.rbox(W, FL, D, 0.02), dark);
  plinth.position.y = FL / 2;
  plinth.castShadow = true;
  g.add(plinth);
  const inner = poolTileMaterial((W - 2 * T) / 0.25, (D - 2 * T) / 0.25);
  const bed = new THREE.Mesh(new THREE.PlaneGeometry(W - 2 * T, D - 2 * T), inner);
  bed.rotation.x = -Math.PI / 2;
  bed.position.y = FL + 0.002;
  g.add(bed);

  // 벽 — 뒤·좌·우는 통짜, 앞은 창틀
  const WH = H - FL;
  const back = new THREE.Mesh(KIT.rbox(W, WH, T, 0.015), shell);
  back.position.set(0, FL + WH / 2, D / 2 - T / 2);
  back.castShadow = true;
  g.add(back);
  [-1, 1].forEach((sx) => {
    const side = new THREE.Mesh(KIT.rbox(T, WH, D - 2 * T, 0.015), shell);
    side.position.set(sx * (W / 2 - T / 2), FL + WH / 2, 0);
    side.castShadow = true;
    g.add(side);
  });
  // 앞면 창틀 — 아래 문턱 · 위 헤더 · 좌우 기둥
  const fz = -D / 2 + T / 2;
  const postW = W / 2 - WIN_HW;
  [[0, (FL + WIN_Y0) / 2, W, WIN_Y0 - FL],
   [0, (WIN_Y1 + H) / 2, W, H - WIN_Y1]].forEach(([x, y, sw, sh]) => {
    const m = new THREE.Mesh(KIT.rbox(sw, sh, T, 0.012), shell);
    m.position.set(x, y, fz);
    m.castShadow = true;
    g.add(m);
  });
  [-1, 1].forEach((sx) => {
    const m = new THREE.Mesh(KIT.rbox(postW, WIN_Y1 - WIN_Y0, T, 0.012), shell);
    m.position.set(sx * (WIN_HW + postW / 2), (WIN_Y0 + WIN_Y1) / 2, fz);
    g.add(m);
  });
  // 아크릴 관찰창 — 여기로 물속 다리와 트레드밀이 보인다
  const acryl = new THREE.Mesh(new THREE.BoxGeometry(WIN_HW * 2, WIN_Y1 - WIN_Y0, 0.028),
    new THREE.MeshStandardMaterial({
      color: 0xdff0f6, roughness: 0.03, metalness: 0.0, envMapIntensity: 2.4,
      transparent: true, opacity: 0.20, depthWrite: false, side: THREE.DoubleSide,
    }));
  acryl.position.set(0, (WIN_Y0 + WIN_Y1) / 2, fz);
  acryl.renderOrder = 4;
  g.add(acryl);

  // 상단 림 — 광택 스테인리스 띠
  const rim = new THREE.Mesh(KIT.rbox(W + 0.07, 0.09, D + 0.07, 0.02), steel);
  rim.position.y = H + 0.01;
  rim.castShadow = true;
  g.add(rim);

  // 수중 트레드밀 — 벨트가 z 방향으로 돈다(환자는 창을 마주보고 걷는다)
  const belt = new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.035, 1.32),
    KIT.std(0x1b2126, { roughness: 0.9 }));
  belt.position.set(0, FL + 0.035, 0.02);
  g.add(belt);
  [-0.40, 0.40].forEach((dx) => {
    const side = new THREE.Mesh(KIT.rbox(0.12, 0.06, 1.36, 0.015), steel);
    side.position.set(dx, FL + 0.04, 0.02);
    g.add(side);
  });

  // 수류 제트 노즐 (뒷벽) — 저항수류로 보행 부하를 준다
  [-0.55, 0, 0.55].forEach((dx) => {
    const noz = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.045, 0.05, 14), steel);
    noz.rotation.x = Math.PI / 2;
    noz.position.set(dx, 0.72, D / 2 - T - 0.02);
    g.add(noz);
  });

  // 물 — 수조 안을 채운다. 깊이 기록을 끄므로 뒤의 환자·벨트가 비쳐 보인다.
  const wh = WATER - FL - 0.01;
  const body = new THREE.Mesh(new THREE.BoxGeometry(W - 2 * T - 0.01, wh, D - 2 * T - 0.01),
    waterMaterial(2, 2, { opacity: 0.46, color: 0x8fd2e8, wave: 0.8, drift: false }));
  body.position.y = FL + 0.01 + wh / 2;
  body.renderOrder = 3;
  g.add(body);
  const surf = new THREE.Mesh(new THREE.PlaneGeometry(W - 2 * T - 0.02, D - 2 * T - 0.02),
    waterMaterial(1.6, 1.3, { opacity: 0.55 }));
  surf.rotation.x = -Math.PI / 2;
  surf.position.y = WATER;
  surf.renderOrder = 5;
  g.add(surf);

  // 환자용 손잡이 — 창 쪽 좌우에 한 쌍
  [-1, 1].forEach((sx) => {
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 1.20, 10), steel);
    bar.rotation.x = Math.PI / 2;
    bar.position.set(sx * 0.55, 1.22, -0.05);
    g.add(bar);
    [-0.5, 0.5].forEach((dz) => {
      const br = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.16, 8), steel);
      br.rotation.z = Math.PI / 2;
      br.position.set(sx * 0.63, 1.22, dz);
      g.add(br);
    });
  });

  // 승강 계단 + 상부 플랫폼 (뒤쪽) — 수조가 1.6m 라 계단 없이는 못 들어간다
  const tread = KIT.std(0xb9c4c9, { roughness: 0.55, metalness: 0.25, envMapIntensity: 1.1 });
  const plat = new THREE.Mesh(KIT.rbox(1.00, 0.08, 0.62, 0.015), tread);
  plat.position.set(0, H + 0.02, D / 2 + 0.34);
  plat.castShadow = true;
  g.add(plat);
  [[H - 0.40, 0.99], [H - 0.80, 1.34], [H - 1.20, 1.69]].forEach(([y, z]) => {
    const st = new THREE.Mesh(KIT.rbox(1.00, 0.08, 0.36, 0.012), tread);
    st.position.set(0, y, D / 2 + z);
    st.castShadow = true;
    g.add(st);
  });
  [-0.54, 0.54].forEach((sx) => {
    // 경사 난간 — 계단을 따라 비스듬히 올라간다
    const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 1.45, 8), steel);
    rail.position.set(sx, H - 0.32, D / 2 + 1.20);
    rail.rotation.x = 0.62;
    g.add(rail);
    [[H - 1.02, 1.72], [H - 0.26, 0.95]].forEach(([y, z]) => {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, y * 2, 8), steel);
      post.position.set(sx, y, D / 2 + z);
      g.add(post);
    });
  });

  // 조작 콘솔 (+x 쪽) — 치료사가 여기 서서 속도·수위·수류를 맞춘다
  const con = new THREE.Group();
  const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 1.10, 12), steel);
  stand.position.y = 0.55;
  const cbase = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.27, 0.05, 16), KIT.steel(0x9aa6ad));
  cbase.position.y = 0.03;
  const panel = new THREE.Mesh(KIT.rbox(0.46, 0.34, 0.07, 0.015), dark);
  panel.position.set(0, 1.22, 0);
  panel.rotation.x = -0.5;
  const pscr = new THREE.Mesh(new THREE.PlaneGeometry(0.38, 0.26), KIT.screen(0x54c8e8));
  pscr.position.set(0, 1.235, 0.045);
  pscr.rotation.x = -0.5;
  con.add(stand, cbase, panel, pscr);
  // 수중 카메라 모니터 — 물속 다리 움직임을 실시간으로 본다
  const monArm = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.46, 8), steel);
  monArm.position.y = 1.62;
  const mon = new THREE.Mesh(KIT.rbox(0.44, 0.30, 0.04, 0.01), dark);
  mon.position.set(0, 1.98, 0.015);
  const mscr = new THREE.Mesh(new THREE.PlaneGeometry(0.38, 0.24), KIT.screen(0x2f86a4));
  mscr.position.set(0, 1.98, 0.038);
  con.add(monArm, mon, mscr);
  con.position.set(W / 2 + 0.34, 0, -0.15);
  con.rotation.y = Math.PI / 2;          // 화면이 +x(치료사) 쪽을 본다
  g.add(con);

  // 수온·수위 표시 — 수조 앞면 창 아래
  const gauge = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.13),
    printedMat(makeTextCanvas(['수온 33.5℃ · 수심 1.28m'], 512, 108, { bg: '#12212a', color: '#7fe3ff', fontSize: 56 }),
      { roughness: 0.4, envMapIntensity: 1.0 }));
  gauge.position.set(0.72, 0.25, -D / 2 - 0.006);
  gauge.rotation.y = Math.PI;
  g.add(gauge);

  KIT.solid(G.cx, G.cz, W / 2 + 0.06, D / 2 + 0.06);
  KIT.solid(G.cx, G.cz + D / 2 + 1.05, 0.55, 1.05);      // 승강 계단

  // ── 무릎 환자 (p9 슬개대퇴통증) — 수중 트레드밀 보행훈련 ──
  // 발이 벨트 위(y = FL+0.05)에 오도록 들어올리고, 관찰창(-z)을 마주보게 세운다.
  const patient = PATIENTS[8];
  const pg = new THREE.Group();
  pg.add(buildPatientFigure(patient, { stance: 'walk' }));
  pg.position.set(0, FL + 0.05, 0.02);
  pg.rotation.y = Math.PI;
  g.add(pg);

  // 부력조끼 — 수중 보행 시 몸통을 띄운다.
  // 사람 몸통은 앞뒤로 납작하다(좌우 0.50 × 앞뒤 0.26). 원통 그대로 씌우면
  // 조끼가 아니라 드럼통을 두른 것처럼 보이므로 같은 비율로 눌러 준다.
  const vest = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.285, 0.40, 18, 1, true),
    KIT.std(0xd8842a, { roughness: 0.75, side: THREE.DoubleSide }));
  vest.scale.set(1, 1, 0.58);
  // 발바닥에서 잰 높이다. 1.30 은 161cm 환자의 목 언저리라 조끼가 턱을 받치고
  // 얼굴을 가렸다 — 수조를 낮추자 그게 그대로 드러났다. 가슴 한가운데로 내린다.
  vest.position.set(0, FL + 0.05 + 1.12, 0.02);
  g.add(vest);
  [-1, 1].forEach((sx) => {         // 어깨끈
    const strap = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.30, 0.03),
      KIT.std(0x2f3941, { roughness: 0.8 }));
    strap.position.set(sx * 0.13, FL + 0.05 + 1.36, 0.02);   // 어깨
    strap.rotation.z = sx * 0.14;
    g.add(strap);
  });

  // 명패 — 수조가 커서 침대처럼 발치에 눕힐 수 없다. 창 옆에 스탠드로 세운다.
  const sign = new THREE.Group();
  KIT.nameplate(sign, [patient.name + ' (' + patient.sex + ', ' + patient.age + '세)'],
    0, 1.06, 0, 0, 0.62);
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.96, 8), KIT.steel(0xa8b3ba));
  post.position.y = 0.48;
  const sbase = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.19, 0.03, 14), KIT.std(0x8d979e, { roughness: 0.45, metalness: 0.5 }));
  sbase.position.y = 0.015;
  sign.add(post, sbase);
  sign.position.set(-W / 2 - 0.34, 0, -D / 2 - 0.30);
  sign.rotation.y = Math.PI;
  g.add(sign);

  // 진료 판정 — 학생은 관찰창 앞에 서서 E 를 누른다
  KIT.registerPatient(g, patient, G.cx, G.cz, W / 2, D / 2, 2.35);

  // 콘솔 앞 치료사
  KIT.therapist(G.cx + W / 2 + 0.78, G.cz - 0.15, -Math.PI / 2, 'handson');
}

// ── 부속 설비 ────────────────────────────────────────────────
function buildHydroFittings() {
  const s = GAME.scene;
  const H = GAME.ZONE.hydro;
  const wallX = GAME.ZONE.divE + 0.10;      // 운동치료실과의 구분벽 안쪽면
  const backZ = GAME.ROOM.d / 2 - 0.10;     // 안쪽 외벽 안쪽면
  const steel = KIT.steel(0xc6cfd5);

  // 샤워기 2기 (입수 전 세척 — 수치료실 필수 설비)
  [4.30, 5.30].forEach((z) => {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 2.05, 10), steel);
    pole.position.set(wallX + 0.07, 1.05, z);
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.020, 0.020, 0.34, 8), steel);
    arm.rotation.z = Math.PI / 2;
    arm.position.set(wallX + 0.24, 2.05, z);
    const head = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.07, 0.05, 16), steel);
    head.position.set(wallX + 0.40, 1.99, z);
    const valve = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.05, 12), steel);
    valve.rotation.z = Math.PI / 2;
    valve.position.set(wallX + 0.11, 1.28, z);
    s.add(pole, arm, head, valve);
    // 바닥 배수구
    const drain = new THREE.Mesh(new THREE.CircleGeometry(0.11, 16), KIT.steel(0xa9b4ba));
    drain.rotation.x = -Math.PI / 2;
    drain.position.set(wallX + 0.40, 0.008, z);
    s.add(drain);
  });

  // 수건·가운 선반 (구분벽 안쪽, 문 반대편)
  const shelf = new THREE.Group();
  const shelfMat = KIT.std(0xe8ebe6, { roughness: 0.55 });
  [-0.72, 0.72].forEach((xx) => {
    const panel = new THREE.Mesh(new THREE.BoxGeometry(0.04, 1.45, 0.38), shelfMat);
    panel.position.set(xx, 0.725, 0);
    panel.castShadow = true;
    shelf.add(panel);
  });
  [0.34, 0.80, 1.26].forEach((yy) => {
    const b = new THREE.Mesh(new THREE.BoxGeometry(1.44, 0.035, 0.36), shelfMat);
    b.position.y = yy;
    shelf.add(b);
  });
  [[-0.46, 1.32], [-0.16, 1.32], [0.16, 1.32], [0.46, 1.32],
   [-0.34, 0.86], [0.10, 0.86], [0.44, 0.86]].forEach(([xx, yy]) => {
    const towel = new THREE.Mesh(KIT.rbox(0.26, 0.16, 0.28, 0.03),
      KIT.std(yy > 1 ? 0xeef3f6 : 0xd7e7ef, { roughness: 0.95 }));
    towel.position.set(xx, yy, 0);
    shelf.add(towel);
  });
  shelf.position.set(wallX + 0.22, 0, 8.30);
  shelf.rotation.y = Math.PI / 2;
  s.add(shelf);
  KIT.solid(wallX + 0.22, 8.30, 0.22, 0.75);

  // 부력 도구 랙 — 누들·아령·킥판. 수중운동의 저항·부력 도구다.
  const rack = new THREE.Group();
  [-0.55, 0.55].forEach((xx) => {
    const up = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.40, 0.05), steel);
    up.position.set(xx, 0.70, 0);
    rack.add(up);
  });
  [0.45, 0.95, 1.36].forEach((yy) => {
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.15, 8), steel);
    bar.rotation.z = Math.PI / 2;
    bar.position.y = yy;
    rack.add(bar);
  });
  // 누들(긴 발포 봉) — 세로로 꽂아 둔다
  [[-0.38, 0xe4574f], [-0.13, 0xf0b429], [0.13, 0x4f9fd4], [0.38, 0x62a85a]].forEach(([xx, col]) => {
    const noodle = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 1.25, 12),
      KIT.std(col, { roughness: 0.85 }));
    noodle.position.set(xx, 0.78, 0.02);
    rack.add(noodle);
  });
  // 수중 아령 (부력식 덤벨)
  [[-0.30, 0.99], [0.05, 0.99], [0.38, 0.99]].forEach(([xx, yy]) => {
    const db = new THREE.Group();
    const h = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.20, 8), KIT.std(0xeceff1));
    h.rotation.z = Math.PI / 2;
    [-0.10, 0.10].forEach((ox) => {
      const head = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.07, 12), KIT.std(0x4f9fd4, { roughness: 0.85 }));
      head.rotation.z = Math.PI / 2;
      head.position.x = ox;
      db.add(head);
    });
    db.add(h);
    db.position.set(xx, yy + 0.07, -0.10);
    rack.add(db);
  });
  rack.position.set(14.05, 0, 4.05);
  rack.rotation.y = -Math.PI / 2;
  s.add(rack);
  KIT.solid(14.05, 4.05, 0.25, 0.62);

  // 구명 부표 — 물이 있는 실의 법정 비치품
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.075, 10, 22),
    KIT.std(0xe4453c, { roughness: 0.6 }));
  ring.position.set(GAME.ROOM.w / 2 - 0.09, 1.60, backZ - 2.30);
  ring.rotation.y = Math.PI / 2;
  s.add(ring);
  [0, 1].forEach((i) => {
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.078, 8, 6, 0.5),
      KIT.std(0xf5f5f5, { roughness: 0.7 }));
    band.position.copy(ring.position);
    band.rotation.set(0, Math.PI / 2, i * Math.PI);
    s.add(band);
  });

  // 수질 관리 패널 (안쪽 벽) — 수온·잔류염소·pH
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(0.86, 0.58),
    printedMat(makeTextCanvas(['수질 관리', '수온 33.5℃  pH 7.3', '잔류염소 0.6 ppm'], 512, 340,
      { bg: '#122630', color: '#8fe6ff', border: '#2b5c70', fontSize: 58 }),
      { roughness: 0.35, envMapIntensity: 1.2 }));
  panel.position.set(7.90, 1.72, backZ - 0.005);
  panel.rotation.y = Math.PI;
  s.add(panel);

  // 실 안내 사인 — 들어서면 정면(안쪽 벽)에 보인다
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.30, 0.52),
    printedMat(makeTextCanvas(['수치료실 · Hydrotherapy'], 768, 174, { bg: '#1d5a72', color: '#ffffff', fontSize: 70 }),
      { roughness: 0.3, metalness: 0.1, envMapIntensity: 1.2 }));
  sign.position.set(5.60, 2.42, backZ - 0.005);
  sign.rotation.y = Math.PI;
  s.add(sign);

  // 프로그램 안내판 — 충남대병원 페이지의 두 프로그램을 그대로 적는다
  [[4.85, ['보행 풀 치료 프로그램', '혼자서기·체중이동·균형·걷기', '1인풀 수중 트레드밀'], '#eaf4f7', '#1d5a72'],
   [7.20, ['전신 풀 치료 프로그램', '할리윅 · 바트라가츠 · 왓수', '1:1 또는 그룹 운동치료'], '#eef6ee', '#2e6b3e']]
    .forEach(([z, lines, bg, col]) => {
    const b = new THREE.Mesh(new THREE.PlaneGeometry(1.40, 0.92),
      printedMat(makeTextCanvas(lines, 512, 336, { bg, color: col, border: col, fontSize: 52 })));
    b.position.set(GAME.ZONE.divE + 0.11, 1.88, z);
    b.rotation.y = Math.PI / 2;
    s.add(b);
  });

  // 미끄럼 주의 — 문 옆 바닥 표지
  const warn = new THREE.Mesh(new THREE.PlaneGeometry(0.90, 0.45),
    printedMat(makeTextCanvas(['⚠ 바닥 미끄럼 주의'], 512, 256, { bg: '#f2c200', color: '#20252a', fontSize: 66 }),
      { roughness: 0.5 }));
  warn.rotation.x = -Math.PI / 2;
  warn.position.set(H.entryX + 1.35, 0.012, H.wallZ + 0.75);
  warn.rotation.z = -0.25;
  s.add(warn);
}
