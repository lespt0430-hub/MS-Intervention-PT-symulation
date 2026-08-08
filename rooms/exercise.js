// rooms/exercise.js — ExerciseRoom : 운동치료실
//
// '운동치료실 내부도면' 기준.
//   · 바닥에 빨강·노랑 이중선 보행 트랙
//   · 천장에 곡선 슬링 트랙(현수장치) — 하네스를 매고 보행 훈련을 한다
//   · 보행용 평행봉 · 매트 베드 · 필라테스 리포머 · 짐볼 랙 · 늑목 · 대형 벽거울

function buildExerciseRoom() {
  const X = GAME.ZONE.exercise;

  buildWalkTrack(X.track);
  buildSlingTrack();
  buildParallelBars(7.5, -8.6);
  buildMatBed(6.4, -3.6);
  buildReformer(11.0, -6.6);
  buildBallRack(4.32, 6.60);
  buildWallBars();
  buildBigMirror();
  buildCardio();
  buildProps();
  buildExercisePatients();
}

// ── 보행 트랙 ────────────────────────────────────────────────
// 도면의 트랙은 직선 레인이 아니라 빨강·노랑 이중선으로 도색한 타원이다.
// 환자가 한 바퀴 돌며 걷는 용도라 실제 재활치료실의 바닥 풍경에 가깝다.
function buildWalkTrack(TRK) {
  const PX = 96;                             // m → px
  const cv = document.createElement('canvas');
  cv.width = Math.round(TRK.w * PX);
  cv.height = Math.round(TRK.d * PX);
  const tg = cv.getContext('2d');
  tg.clearRect(0, 0, cv.width, cv.height);   // 선 이외는 투명 — 바닥 재질이 비쳐야 도색으로 보인다

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
      map: RENDER.colorTex(cv), transparent: true, roughness: 0.30,
      metalness: 0, envMapIntensity: 1.2, depthWrite: false,
    })
  );
  track.rotation.x = -Math.PI / 2;
  track.position.set(TRK.cx, 0.004, TRK.cz);
  GAME.scene.add(track);
}

// ── 천장 슬링 트랙 ───────────────────────────────────────────
// 도면 천장에 걸린 곡선 레일. 그 아래에 하네스와 손잡이가 늘어져 있다.
function buildSlingTrack() {
  const s = GAME.scene;
  const h = GAME.ROOM.h;
  const railMat = KIT.steel(0xd2d9dd);
  const cx = 8.6, cz = 0.6, railY = h - 0.42;

  // 곡선 레일 — 원형 링을 눌러 타원으로 쓴다
  const loop = new THREE.Mesh(new THREE.TorusGeometry(4.0, 0.055, 8, 48), railMat);
  loop.rotation.x = Math.PI / 2;
  loop.scale.set(0.86, 1.06, 1);
  loop.position.set(cx, railY, cz);
  s.add(loop);
  // 천장 행거
  for (let a = 0; a < Math.PI * 2; a += Math.PI / 4) {
    const hx = cx + Math.cos(a) * 4.0 * 0.86;
    const hz = cz + Math.sin(a) * 4.0 * 1.06;
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, h - railY, 6), railMat);
    rod.position.set(hx, (h + railY) / 2, hz);
    s.add(rod);
  }

  // 현수 유닛 — 빨간 로프 + 하네스 + 손잡이 (도면과 같은 색)
  const ropeMat = KIT.std(0xc0392b, { roughness: 0.85 });
  const strapMat = KIT.std(0xf1c40f, { roughness: 0.8 });
  const gripMat = KIT.std(0x2c3e50, { roughness: 0.5 });
  const unit = (ux, uz) => {
    const carrier = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.10, 0.16), railMat);
    carrier.position.set(ux, railY - 0.09, uz);
    s.add(carrier);
    [[-0.16, 1.05, 'strap'], [0.16, 1.15, 'grip']].forEach(([off, len, tip]) => {
      const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, len, 6), ropeMat);
      rope.position.set(ux + off, railY - 0.14 - len / 2, uz);
      s.add(rope);
      if (tip === 'strap') {
        const loopEnd = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.018, 8, 14), strapMat);
        loopEnd.position.set(ux + off, railY - 0.14 - len - 0.08, uz);
        s.add(loopEnd);
      } else {
        const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.16, 8), gripMat);
        grip.rotation.z = Math.PI / 2;
        grip.position.set(ux + off, railY - 0.14 - len - 0.02, uz);
        s.add(grip);
      }
    });
  };
  unit(8.6, -3.4);      // 하네스 보행 훈련 자리
  unit(10.9, 2.2);
}

// ── 보행용 평행봉 ────────────────────────────────────────────
function buildParallelBars(x, z) {
  const g = new THREE.Group();
  const post = KIT.steel(0xcfd6da);
  const wood = KIT.std(0xc89a63, { roughness: 0.45 });
  [-0.35, 0.35].forEach((zz) => {
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 3.0, 10), wood);
    bar.rotation.z = Math.PI / 2;
    bar.position.set(0, 0.92, zz);
    bar.castShadow = true;
    g.add(bar);
    [-1.4, 1.4].forEach((xx) => {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.035, 0.92, 8), post);
      p.position.set(xx, 0.46, zz);
      g.add(p);
    });
  });
  // 저상 발판 — 도면의 평행봉은 짙은 회색 매트 위에 올라가 있다
  const deck = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.06, 1.25), KIT.std(0x53606a, { roughness: 0.92 }));
  deck.position.y = 0.03;
  deck.receiveShadow = true;
  g.add(deck);
  const trim = new THREE.Mesh(new THREE.BoxGeometry(3.5, 0.05, 1.35), KIT.wood());
  trim.position.y = 0.025;
  g.add(trim);
  g.position.set(x, 0, z);
  // 정면 벽을 따라(좌우 x 방향) 걷는다. 예전처럼 z 방향으로 세우면
  // 3.4m짜리 봉이 운동치료실 입구(z -6.8~-3.6) 앞을 가로막았다.
  GAME.scene.add(g);
  KIT.solid(x, z, 1.78, 0.72);
}

// ── 매트 베드 (목재 프레임 + 파란 매트) ──────────────────────
// 앉는 면 높이 0.50 — 환자·치료사 인형의 앉은 자세가 이 높이를 기준으로 한다.
function buildMatBed(x, z) {
  const g = new THREE.Group();
  const wood = KIT.wood();
  const top = new THREE.Mesh(new THREE.BoxGeometry(2.30, 0.14, 1.80), KIT.std(0x2c4f8a, { roughness: 0.55, envMapIntensity: 0.8 }));
  top.position.y = 0.43;
  top.castShadow = true; top.receiveShadow = true;
  g.add(top);
  const apron = new THREE.Mesh(new THREE.BoxGeometry(2.34, 0.12, 1.84), wood);
  apron.position.y = 0.32;
  g.add(apron);
  [[-1.05, -0.78], [1.05, -0.78], [-1.05, 0.78], [1.05, 0.78]].forEach(([lx, lz]) => {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.26, 0.11), wood);
    leg.position.set(lx, 0.13, lz);
    g.add(leg);
  });
  g.position.set(x, 0, z);
  GAME.scene.add(g);
  KIT.solid(x, z, 1.20, 0.95);
}

// ── 필라테스 리포머 ──────────────────────────────────────────
function buildReformer(x, z) {
  const g = new THREE.Group();
  const wood = KIT.std(0xcbab7c, { roughness: 0.5, envMapIntensity: 0.7 });
  const rail = KIT.steel(0xd2d9dd);
  [-0.30, 0.30].forEach((rz) => {
    const side = new THREE.Mesh(new THREE.BoxGeometry(2.20, 0.14, 0.09), wood);
    side.position.set(0, 0.36, rz);
    side.castShadow = true;
    g.add(side);
    const r = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 2.10, 8), rail);
    r.rotation.z = Math.PI / 2;
    r.position.set(0, 0.45, rz);
    g.add(r);
  });
  [-1.0, 1.0].forEach((rx) => [-0.30, 0.30].forEach((rz) => {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.30, 0.09), wood);
    leg.position.set(rx, 0.15, rz);
    g.add(leg);
  }));
  const carriage = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.09, 0.62), KIT.std(0x37424a, { roughness: 0.55 }));
  carriage.position.set(-0.20, 0.53, 0);
  carriage.castShadow = true;
  g.add(carriage);
  [-0.20, 0.20].forEach((rz) => {
    const sh = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.16, 10), KIT.std(0x2b333a, { roughness: 0.6 }));
    sh.rotation.z = Math.PI / 2;
    sh.position.set(-0.58, 0.63, rz);
    g.add(sh);
  });
  const footbar = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.58, 8), rail);
  footbar.rotation.z = Math.PI / 2;
  footbar.position.set(0.72, 0.60, 0);
  g.add(footbar);
  [-0.18, -0.06, 0.06, 0.18].forEach((rz) => {
    const spr = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.34, 6), KIT.steel(0xb0babf));
    spr.rotation.z = Math.PI / 2;
    spr.position.set(0.38, 0.44, rz);
    g.add(spr);
  });
  g.position.set(x, 0, z);
  GAME.scene.add(g);
  KIT.solid(x, z, 1.20, 0.45);
}

// ── 짐볼 랙 + 짐볼 ───────────────────────────────────────────
// 도면 왼쪽 벽면의 선반에 파란 짐볼이 층층이 올라가 있다.
function buildBallRack(x, z) {
  const g = new THREE.Group();
  const bar = KIT.steel(0x8a959c);
  [-0.85, 0.85].forEach((lx) => {
    const upright = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.95, 0.05), bar);
    upright.position.set(lx, 0.975, 0);
    g.add(upright);
  });
  [0.55, 1.20, 1.85].forEach((y, row) => {
    const shelf = new THREE.Mesh(new THREE.BoxGeometry(1.75, 0.04, 0.55), bar);
    shelf.position.y = y;
    shelf.castShadow = true;
    g.add(shelf);
    [-0.55, 0, 0.55].forEach((bx, i) => {
      const r = 0.26;
      const ball = new THREE.Mesh(new THREE.SphereGeometry(r, 20, 14),
        KIT.std([0x2f6fae, 0x3f86c4, 0x2a5f96][(i + row) % 3], { roughness: 0.18, metalness: 0.02, envMapIntensity: 1.4 }));
      ball.position.set(bx, y + r + 0.02, 0);
      ball.castShadow = true;
      g.add(ball);
    });
  });
  g.position.set(x, 0, z);
  g.rotation.y = Math.PI / 2;            // 구분벽에 등을 대고 실 안쪽을 향한다
  GAME.scene.add(g);
  KIT.solid(x, z, 0.35, 0.95);

  // 바닥에 굴러다니는 컬러 짐볼 (도면의 초록·보라·노랑)
  // 고정식 자전거(x 6.5~7.5)와 겹치지 않게 안쪽으로 물려 놓는다
  [[8.0, 7.6, 0.33, 0x8f6fb8], [9.1, 8.4, 0.30, 0x7aa84f], [10.1, 7.7, 0.27, 0xd8b23f]].forEach(([bx, bz, r, col]) => {
    const ball = new THREE.Mesh(new THREE.SphereGeometry(r, 26, 18),
      KIT.std(col, { roughness: 0.16, metalness: 0.02, envMapIntensity: 1.5 }));
    ball.position.set(bx, r, bz);
    ball.castShadow = true;
    GAME.scene.add(ball);
    KIT.solid(bx, bz, r, r);
  });
}

// ── 늑목 (벽면 사다리) ───────────────────────────────────────
function buildWallBars() {
  const wood = KIT.std(0xc89a63, { roughness: 0.45 });
  const mk = (x, z, yaw) => {
    const g = new THREE.Group();
    [-1.15, 1.15].forEach((zz) => {
      const side = new THREE.Mesh(new THREE.BoxGeometry(0.09, 2.6, 0.06), wood);
      side.position.set(0, 1.4, zz);
      g.add(side);
    });
    for (let i = 0; i < 8; i++) {
      const rung = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 2.3, 8), wood);
      rung.rotation.x = Math.PI / 2;
      rung.position.set(0, 0.45 + i * 0.31, 0);
      g.add(rung);
    }
    g.position.set(x, 0, z);
    g.rotation.y = yaw;
    GAME.scene.add(g);
  };
  mk(GAME.ROOM.w / 2 - 0.12, 4.95, Math.PI);      // 외벽 — 창·거울 사이 자리
  mk(GAME.ROOM.w / 2 - 0.12, -8.20, Math.PI);
}

// ── 대형 벽거울 ──────────────────────────────────────────────
// 환자가 자기 자세를 보며 운동하는 용도라 실제로 이만큼 크다.
function buildBigMirror() {
  const s = GAME.scene;
  const MIR_W = 6.0, MIR_H = 2.2, MIR_Y = 1.35;
  const MIR_X = GAME.ROOM.w / 2 - 0.06;
  const MIR_Z = -3.8;

  // 프레임은 테두리 4개로 짠다. 판 하나로 두면 그 판이 거울면을 덮어버린다.
  const frameMat = KIT.std(0x8fa5b2, { metalness: 0.6, roughness: 0.35, envMapIntensity: 1.2 });
  [[0, (MIR_H + 0.1) / 2, MIR_W + 0.2, 0.10], [0, -(MIR_H + 0.1) / 2, MIR_W + 0.2, 0.10],
   [(MIR_W + 0.1) / 2, 0, 0.10, MIR_H + 0.2], [-(MIR_W + 0.1) / 2, 0, 0.10, MIR_H + 0.2]].forEach(([oz, oy, fz, fy]) => {
    const barMesh = new THREE.Mesh(new THREE.BoxGeometry(0.05, fy, fz), frameMat);
    barMesh.position.set(MIR_X + 0.01, MIR_Y + oy, MIR_Z + oz);
    s.add(barMesh);
  });
  if (RENDER.q.reflect && window.TX && TX.Reflector) {
    RENDER.buildWallMirror(s, MIR_W, MIR_H, MIR_X, MIR_Y, MIR_Z, -Math.PI / 2);
  } else {
    // 낮음·보통 등급은 실제 반사를 못 쓴다. 이때 금속값만 높이면 반사할 환경이
    // 어두워 거울이 통째로 검은 칠판이 된다 — 밝은 유리면으로 흉내 낸다.
    const mirror = new THREE.Mesh(new THREE.PlaneGeometry(MIR_W, MIR_H),
      KIT.std(0xcfdae1, {
        metalness: 0.45, roughness: 0.10, envMapIntensity: 2.6,
        emissive: 0x3d4b55, emissiveIntensity: 0.45,
      }));
    mirror.position.set(MIR_X, MIR_Y, MIR_Z);
    mirror.rotation.y = -Math.PI / 2;
    s.add(mirror);
  }
  // 거울 하부 바
  const barreMat = KIT.steel(0xc8d2d8);
  const barre = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, MIR_W, 10), barreMat);
  barre.rotation.x = Math.PI / 2;
  barre.position.set(MIR_X - 0.16, 0.92, MIR_Z);
  s.add(barre);
  [-2.6, 0, 2.6].forEach((oz) => {
    const brk = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.04, 0.04), barreMat);
    brk.position.set(MIR_X - 0.09, 0.92, MIR_Z + oz);
    s.add(brk);
  });
}

// ── 유산소 기구 (트레드밀 · 고정식 자전거) ───────────────────
function buildCardio() {
  const s = GAME.scene;
  const steel = KIT.steel();

  const tm = new THREE.Group();
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.16, 2.0), KIT.std(0x3a444c, { roughness: 0.5 }));
  base.position.y = 0.1; base.castShadow = true;
  const belt = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.025, 1.55), KIT.std(0x191e22, { roughness: 0.95 }));
  belt.position.set(0, 0.19, 0.15);
  tm.add(base, belt);
  [-0.36, 0.36].forEach((xx) => {
    const hr = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.0, 8), steel);
    hr.rotation.x = Math.PI / 2;
    hr.position.set(xx, 0.98, -0.35);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.85, 8), steel);
    post.position.set(xx, 0.55, -0.82);
    post.rotation.x = 0.15;
    tm.add(hr, post);
  });
  const console_ = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.3, 0.07), KIT.std(0x2b3238, { roughness: 0.4 }));
  console_.position.set(0, 1.18, -0.93);
  console_.rotation.x = -0.35;
  const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.16), KIT.screen(0x5ab6d6));
  scr.position.set(0, 1.2, -0.885);
  scr.rotation.x = -0.35;
  tm.add(console_, scr);
  tm.position.set(5.25, 0, 7.6);
  tm.rotation.y = Math.PI;
  s.add(tm);
  KIT.solid(5.25, 7.6, 0.55, 1.15);

  const bike = new THREE.Group();
  const flywheel = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.06, 18), KIT.std(0x37424a, { roughness: 0.35 }));
  flywheel.rotation.z = Math.PI / 2;
  flywheel.position.set(0, 0.42, -0.32);
  flywheel.castShadow = true;
  const frame = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.85), KIT.std(0x8b2f36, { roughness: 0.45 }));
  frame.position.set(0, 0.72, -0.02);
  frame.rotation.x = 0.55;
  const seatPost = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.35, 8), steel);
  seatPost.position.set(0, 0.82, 0.3);
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.06, 0.26), KIT.std(0x22282d));
  seat.position.set(0, 1.0, 0.3);
  const hbPost = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.4, 8), steel);
  hbPost.position.set(0, 0.95, -0.42);
  const hBar = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.45, 8), KIT.std(0x22282d));
  hBar.rotation.z = Math.PI / 2;
  hBar.position.set(0, 1.15, -0.42);
  bike.add(flywheel, frame, seatPost, seat, hbPost, hBar);
  [[0.13, 0.54], [-0.13, 0.30]].forEach(([xx, yy]) => {
    const pd = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.03, 0.12), KIT.std(0x22282d));
    pd.position.set(xx, yy, -0.12);
    bike.add(pd);
  });
  bike.position.set(7.0, 0, 8.1);
  bike.rotation.y = Math.PI + 0.3;
  s.add(bike);
  KIT.solid(7.0, 8.1, 0.5, 0.6);
}

// ── 소도구 ───────────────────────────────────────────────────
function buildProps() {
  const s = GAME.scene;

  // 컬러 요가 매트 — 도면처럼 여러 색을 섞어 깐다.
  // 입구(z -6.8~-3.6) 앞에 깔면 들어서자마자 매트를 밟고 지나가야 해서
  // 짐볼·랙이 있는 안쪽 벽면 줄로 옮겼다.
  [[6.75, 6.5, 0xc0564e], [8.60, 6.6, 0x4f7c9e], [10.40, 6.6, 0x6f9c62],
   [12.25, -0.6, 0xc9a13f], [12.25, 0.5, 0x4f7c9e]].forEach(([x, z, col]) => {
    const mat = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.05, 0.9), KIT.std(col, { roughness: 0.62, envMapIntensity: 0.8 }));
    mat.position.set(x, 0.025, z);
    mat.receiveShadow = true;
    s.add(mat);
  });

  // 덤벨 랙
  const rack = new THREE.Group();
  const rackMat = KIT.steel(0x8a959c);
  [0.35, 0.65].forEach((y, ri) => {
    const shelf = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.05, 0.4), rackMat);
    shelf.position.y = y;
    shelf.castShadow = true;
    rack.add(shelf);
    for (let i = 0; i < 4; i++) {
      const db = new THREE.Group();
      const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.2, 8), KIT.steel(0xcfd6da));
      handle.rotation.z = Math.PI / 2;
      const r = 0.05 + ri * 0.02;
      [-0.09, 0.09].forEach((hx) => {
        const head = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.05, 12), KIT.std(0x37424a, { roughness: 0.4 }));
        head.rotation.z = Math.PI / 2;
        head.position.x = hx;
        db.add(head);
      });
      db.add(handle);
      db.position.set(-0.55 + i * 0.36, y + 0.08, 0);
      rack.add(db);
    }
  });
  [-0.7, 0.7].forEach((xx) => {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.68, 0.38), rackMat);
    leg.position.set(xx, 0.34, 0);
    rack.add(leg);
  });
  rack.position.set(GAME.ROOM.w / 2 - 0.45, 0, 8.6);
  rack.rotation.y = -Math.PI / 2;
  GAME.scene.add(rack);
  KIT.solid(GAME.ROOM.w / 2 - 0.45, 8.6, 0.35, 0.85);

  // 스텝박스 · 밸런스 보드
  const step = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.22, 0.4), KIT.std(0x7d9ec7, { roughness: 0.9 }));
  step.position.set(5.2, 0.11, -1.2);
  step.castShadow = true;
  GAME.scene.add(step);
  const board = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.03, 16), KIT.std(0xc89a63, { roughness: 0.5 }));
  board.position.set(12.3, 0.09, 2.0);
  board.rotation.x = 0.1;
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), KIT.std(0x37424a));
  dome.position.set(12.3, 0.045, 2.0);
  GAME.scene.add(board, dome);

  // 소도구 선반 (수건·폼롤러·밴드)
  const shelf = new THREE.Group();
  const shelfMat = KIT.std(0xe8ebe6, { roughness: 0.6 });
  [-0.75, 0.75].forEach((xx) => {
    const panel = new THREE.Mesh(new THREE.BoxGeometry(0.04, 1.25, 0.36), shelfMat);
    panel.position.set(xx, 0.625, 0);
    panel.castShadow = true;
    shelf.add(panel);
  });
  [0.28, 0.72, 1.16].forEach((yy) => {
    const b = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.035, 0.34), shelfMat);
    b.position.y = yy;
    shelf.add(b);
  });
  [[-0.3, 0x6fa8dc], [0.35, 0x93c47d]].forEach(([xx, col]) => {
    const roller = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.55, 12), KIT.std(col, { roughness: 0.9 }));
    roller.rotation.z = Math.PI / 2;
    roller.position.set(xx, 0.81, 0);
    shelf.add(roller);
  });
  [[-0.5, 0xdd7e6b], [-0.22, 0xf1c40f], [0.08, 0x6fa8dc]].forEach(([xx, col]) => {
    const sb = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 10), KIT.std(col, { roughness: 0.6 }));
    sb.position.set(xx, 0.39, 0);
    shelf.add(sb);
  });
  [[-0.45, 0xeef3f6], [-0.15, 0xdaeaf2], [0.15, 0xeef3f6]].forEach(([xx, col]) => {
    const towel = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.14, 0.26), KIT.std(col, { roughness: 0.95 }));
    towel.position.set(xx, 1.26, 0);
    shelf.add(towel);
  });
  shelf.position.set(4.30, 0, 3.4);
  shelf.rotation.y = Math.PI / 2;
  GAME.scene.add(shelf);
  KIT.solid(4.30, 3.4, 0.25, 0.8);

  // 벽 포스터 2장
  [[-1.6, ['바른 자세', '건강한 척추'], '#eaf4ea', '#2e6b3e'],
   [3.9, ['오늘의 운동', '내일의 건강'], '#fdf2e9', '#a04000']].forEach(([z, lines, bg, col]) => {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.95),
      printedMat(makeTextCanvas(lines, 512, 320, { bg, color: col, border: col, fontSize: 62 })));
    p.position.set(GAME.ZONE.divE + 0.11, 1.9, z);
    p.rotation.y = Math.PI / 2;
    GAME.scene.add(p);
  });
}

// ── 환자·치료사 ──────────────────────────────────────────────
// 도면처럼 기구마다 환자와 치료사가 짝을 이룬다.
// 배정 기준은 질환 부위 — 무릎·발목·족부는 실제로 운동·보행 훈련을 한다.
function buildExercisePatients() {
  // p7 반월판 — 매트 베드에 앉아 운동 (앉는 면 0.50).
  // 앉은 자세는 무릎부터 아래가 앞으로 내려간다. 베드 한가운데 앉히면
  // 종아리가 매트 속에 파묻혀 다리가 무릎에서 잘려 보인다 —
  // 반드시 가장자리(z -2.95)에 걸터앉히고 다리가 바깥(+z)으로 나오게 한다.
  exerciseStation(PATIENTS[6], 6.4, -2.95, 0, 'sit');
  KIT.therapist(6.4, -1.75, Math.PI, 'handson');
  KIT.stool(7.6, -2.0);

  // p9 슬개대퇴통증 — 보행 트랙 레인(빨강·노랑 사이)을 걷는다
  exerciseStation(PATIENTS[8], 6.2, 3.2, 0, 'walk');

  // p10 아킬레스건 — 천장 슬링 하네스를 매고 보행 훈련
  exerciseStation(PATIENTS[9], 8.6, -3.4, Math.PI / 2, 'stand');
  KIT.therapist(9.7, -3.4, -Math.PI / 2, 'handson');
  // 하네스 벨트 — 도면처럼 몸통에 두르고 로프에 연결된다
  const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.26, 0.30, 14, 1, true),
    KIT.std(0x37424a, { roughness: 0.7, side: THREE.DoubleSide }));
  belt.position.set(8.6, 1.02, -3.4);
  GAME.scene.add(belt);

  // p12 족저근막염 — 리포머 캐리지(높이 0.53)에 걸터앉는다.
  // 여기도 마찬가지로 종아리가 기구에 묻히지 않도록 옆으로 다리를 낸다.
  exerciseStation(PATIENTS[11], 10.55, -6.45, 0, 'sit', 0.03);
  KIT.therapist(10.6, -5.35, Math.PI, 'handson');
}

// 기구 앞에 선/앉은 환자 한 명. 침대와 똑같이 진료 판정에 등록한다.
function exerciseStation(patient, x, z, yaw, stance, yLift) {
  const g = new THREE.Group();
  g.add(buildPatientFigure(patient, { stance }));

  // 바닥 안내 표지 — 넓은 실에서 누가 누구인지 알려주는 단서.
  // 표기는 세 치료실 모두 '이름 (성별, 나이)' 한 줄로 통일한다.
  const sexAge = patient.sex + ', ' + patient.age + '세';
  KIT.nameplate(g, [patient.name + ' (' + sexAge + ')'], 0.62, 1.02, 0.30, 0, 0.64);
  const postMat = KIT.steel(0xa8b3ba);
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.92, 8), postMat);
  post.position.set(0.62, 0.46, 0.30);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.19, 0.03, 14), KIT.std(0x8d979e, { roughness: 0.45, metalness: 0.5 }));
  base.position.set(0.62, 0.015, 0.30);
  g.add(post, base);

  g.position.set(x, yLift || 0, z);
  g.rotation.y = yaw;
  GAME.scene.add(g);
  KIT.registerPatient(g, patient, x, z, 0.75, 0.75, 2.05);
}
