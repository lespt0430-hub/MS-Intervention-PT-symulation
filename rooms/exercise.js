// rooms/exercise.js — ExerciseRoom : 운동치료실
//
// '운동치료실 내부도면' 기준. 안쪽 끝(z > ZONE.hydro.wallZ)은 수치료실로
// 떼어 냈으므로 이 실은 x 4.0~14.5 · z −11.0~3.2 를 쓴다.
//   · 바닥에 빨강·노랑 이중선 보행 트랙 + 그 위 천장의 곡선 슬링 트랙
//   · 앞 벽면 한 줄이 기구 라인 — 재활 계단 · 트레드밀 · 자전거 · 평행봉 · 팔 에르고미터
//   · 구분벽 쪽에 케이블 타워 · 짐볼 랙 · 소도구 선반
//   · 거울 벽에 무릎 폄 운동기구 · 덤벨 랙 · 늑목

// 바닥 컬러 요가 매트 3장의 자리. 파란 매트에는 짐볼과 환자(p16)가 올라가므로
// 매트를 그리는 쪽(buildProps)과 환자를 세우는 쪽이 같은 좌표를 봐야 한다 —
// 숫자를 두 군데 적어 두면 한쪽만 옮겼을 때 환자가 맨바닥에 앉는다.
const MAT_RED = [7.40, 2.60];
const MAT_BLUE = [9.30, 2.60];
const MAT_GREEN = [11.20, 2.60];
const MAT_H = 0.05;                     // 매트 두께

// p10 이 서는 천장 슬링 자리. 슬링 레일(타원, 중심 8.50/−1.10 · 반지름 약 3.15)
// 위에 있어야 로프가 바로 머리 위로 내려온다 — 환자와 로프를 따로 적어 두면
// 한쪽만 옮겼을 때 허공에 매달린 하네스가 된다. 그래서 여기 한 번만 적는다.
const SLING_P10 = [6.15, 1.00];

function buildExerciseRoom() {
  const X = GAME.ZONE.exercise;

  buildWalkTrack(X.track);
  buildSlingTrack();
  // 앞 벽면 기구 라인 (z ≈ −10.2). 실이 가로로 3m 넓어져 간격을 벌렸다.
  buildTrainingStairs(5.30, -10.40);
  buildParallelBars(11.30, -10.10);
  buildArmErgometer(14.10, -10.20);
  // 중앙 열
  buildMatBed(7.40, -6.50);
  buildReformer(12.80, -5.60, Math.PI / 2);   // p12 — 긴 축을 z 로 돌려 거울을 보게
  // 균형 훈련(p18) — 평행봉 발판 위. 붙잡을 것이 있어야 하는 훈련이라
  // 따로 난간을 세우는 것보다 평행봉 안에 넣는 편이 자연스럽고 자리도 넓다.
  // 발판 윗면이 0.06m 이므로 그만큼 올린다.
  buildBalanceZone(11.30, -10.10, 0.06);
  // 몸통 협응 운동(p16) — 짐볼. 매트 테이블은 없앴다.
  // 바닥에 깔린 파란 요가 매트(buildProps) 위에 올린다. 매트 두께 0.05 만큼 띄운다.
  buildGymBall(MAT_BLUE[0], MAT_BLUE[1], undefined, 0.05);
  // 구분벽(−x) 열
  buildCableTower(4.35, -0.30);
  buildBallRack(4.35, -2.50);
  // 거울 벽(+x) 열 — 거울(z −6.8~−0.8) 정면은 비워 둔다.
  // 자세를 보며 운동하는 자리라 기구가 그 앞을 막으면 거울이 무용지물이고,
  // 거울 앞 통로도 좁아진다. 기구는 거울 위아래로 물리고 벽에 바짝 붙인다.
  buildLegMachine(13.95, -8.30);
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
  const T = GAME.ZONE.exercise.track;
  const cx = T.cx, cz = T.cz, railY = h - 0.42;
  const R = 3.1;

  // 곡선 레일 — 원형 링을 눌러 타원으로 쓴다. 아래 보행 트랙과 겹쳐 돈다.
  const loop = new THREE.Mesh(new THREE.TorusGeometry(R, 0.055, 8, 48), railMat);
  loop.rotation.x = Math.PI / 2;
  loop.scale.set(1.0, 1.04, 1);
  loop.position.set(cx, railY, cz);
  s.add(loop);
  // 천장 행거
  for (let a = 0; a < Math.PI * 2; a += Math.PI / 4) {
    const hx = cx + Math.cos(a) * R;
    const hz = cz + Math.sin(a) * R * 1.04;
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
  unit(SLING_P10[0], SLING_P10[1]);   // p10 이 매달리는 자리
  unit(10.85, 1.00);                  // 예비 유닛
  unit(8.50, -4.00);                  // 레일 앞머리 (비어 있는 자리)
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
// yaw 를 주면 기구를 돌린다. 서혜란은 거울(+x)을 보고 앉아야 해서, 기구의
// 긴 축을 z 방향으로 돌려 놓아야 다리가 기구 옆으로 자연스럽게 내려온다.
function buildReformer(x, z, yaw) {
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
  g.rotation.y = yaw || 0;
  GAME.scene.add(g);
  // 돌리면 막는 넓이도 같이 돌아간다
  const c = Math.abs(Math.cos(yaw || 0)), sn = Math.abs(Math.sin(yaw || 0));
  KIT.solid(x, z, 1.20 * c + 0.45 * sn, 0.45 * c + 1.20 * sn);
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

  // 바닥에 굴러다니는 컬러 짐볼 (도면의 초록·보라·노랑).
  // 보행 트랙 링(x 5.3~11.7) 바깥, 구분벽 쪽 통로에 둔다.
  [[5.00, -1.20, 0.28, 0x8f6fb8], [4.95, 0.85, 0.25, 0x7aa84f], [12.45, 2.75, 0.30, 0xd8b23f]].forEach(([bx, bz, r, col]) => {
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
  // 외벽 — 거울(z −6.8~−0.8)과 덤벨 랙 위쪽 자리
  mk(GAME.ROOM.w / 2 - 0.12, 2.00, Math.PI);
  // 수치료실 구분벽(z = wallZ) 안쪽 면. 앞 벽면 한 줄은 기구가 다 차지했다.
  mk(11.00, GAME.ZONE.hydro.wallZ - 0.22, -Math.PI / 2);
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
  tm.position.set(7.00, 0, -9.95);
  s.add(tm);                       // 콘솔이 −z(앞 벽) 쪽 — 환자는 실 안쪽을 보고 걷는다
  KIT.solid(7.00, -9.95, 0.45, 1.02);

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
  bike.position.set(8.15, 0, -10.10);
  bike.rotation.y = 0.25;
  s.add(bike);
  KIT.solid(8.15, -10.10, 0.45, 0.5);
}

// ── 재활 계단 (training stairs) ──────────────────────────────
// 계단 오르내리기는 무릎·발목 재활의 표준 과제라 어느 운동치료실에나 있다.
// 낮은 단(15cm) 3개로 올라가 평판을 밟고 반대쪽으로 내려온다. 양옆 손잡이가
// 계단 옆선을 따라 꺾여 올라가는 게 이 기구의 실루엣이다.
function buildTrainingStairs(x, z) {
  const g = new THREE.Group();
  const tread = KIT.std(0xc9a06a, { roughness: 0.5, envMapIntensity: 0.8 });
  const riser = KIT.std(0xe4e8e6, { roughness: 0.6 });
  const rail = KIT.steel(0xcfd6da);
  const TR = 0.28, DZ = 0.90, PLAT = 0.80;

  // 오르는 쪽 3단 · 평판 · 내려가는 쪽 2단. 단마다 바닥까지 채운 덩어리다.
  const step = (cx, h, w) => {
    const box = new THREE.Mesh(new THREE.BoxGeometry(w, h, DZ), riser);
    box.position.set(cx, h / 2, 0);
    box.castShadow = true; box.receiveShadow = true;
    g.add(box);
    const cap = new THREE.Mesh(KIT.rbox(w + 0.02, 0.04, DZ + 0.02, 0.008), tread);
    cap.position.set(cx, h + 0.01, 0);
    g.add(cap);
  };
  [0.15, 0.30, 0.45].forEach((h, i) => step(-PLAT / 2 - TR * (2.5 - i), h, TR));
  step(0, 0.45, PLAT);
  [0.30, 0.15].forEach((h, i) => step(PLAT / 2 + TR * (i + 0.5), h, TR));

  // 손잡이 — 계단 옆선을 따라 꺾인다 (KIT.armLinkage 가 마디를 이어 준다)
  const x0 = -PLAT / 2 - TR * 3, x1 = PLAT / 2 + TR * 2;
  [-1, 1].forEach((sz) => {
    const rz = sz * (DZ / 2 + 0.05);
    KIT.armLinkage(g, [
      [x0, 0.80, rz], [-PLAT / 2 - TR * 0.2, 1.22, rz],
      [PLAT / 2 + TR * 0.2, 1.22, rz], [x1, 0.80, rz],
    ], 0.024, rail);
    [[x0, 0.40], [-PLAT / 2 - TR * 0.2, 0.61], [PLAT / 2 + TR * 0.2, 0.61], [x1, 0.40]].forEach(([px, ph]) => {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.026, ph * 2, 8), rail);
      post.position.set(px, ph, rz);
      g.add(post);
    });
  });

  // 좌우가 비대칭이라 중심을 맞춰 놓는다
  g.position.set(x - (x0 + x1) / 2, 0, z);
  GAME.scene.add(g);
  KIT.solid(x, z, (x1 - x0) / 2 + 0.06, DZ / 2 + 0.10);
}

// ── 케이블 타워 (다목적 근력 운동기구) ───────────────────────
// 웨이트 스택 두 줄 + 상하 도르래. 어깨·몸통·다리를 한 자리에서 다 쓴다.
// 세로로 길어서 넓은 실의 시선을 잡아 주는 구조물이기도 하다.
function buildCableTower(x, z) {
  const g = new THREE.Group();
  const frame = KIT.std(0x2f3d4a, { roughness: 0.42, metalness: 0.35, envMapIntensity: 1.1 });
  const steel = KIT.steel(0xc2cbd1);
  const plate = KIT.std(0x8a939a, { roughness: 0.4, metalness: 0.6, envMapIntensity: 1.2 });
  const H = 2.20, SPAN = 1.50;

  // 기둥 · 상단 크로스바 · 베이스.
  // 기둥 두 개에 가로대 하나만 얹으면 골대처럼 보인다. 실제 기구는 뒤판과
  // 중간 가로대가 있어 사각 틀을 이루고, 웨이트 스택은 그 틀 안에 들어간다.
  [-1, 1].forEach((sz) => {
    const up = new THREE.Mesh(KIT.rbox(0.13, H, 0.13, 0.018), frame);
    up.position.set(0, H / 2, sz * SPAN / 2);
    up.castShadow = true;
    g.add(up);
  });
  [H - 0.06, 1.34].forEach((y) => {
    const cross = new THREE.Mesh(KIT.rbox(0.13, 0.12, SPAN + 0.13, 0.018), frame);
    cross.position.set(0, y, 0);
    cross.castShadow = true;
    g.add(cross);
  });
  const base = new THREE.Mesh(KIT.rbox(0.66, 0.10, SPAN + 0.26, 0.016), frame);
  base.position.y = 0.05;
  base.receiveShadow = true;
  g.add(base);
  // 뒤판 — 스택을 가리는 타공 패널
  const panel = new THREE.Mesh(KIT.rbox(0.03, H - 0.24, SPAN - 0.06, 0.006),
    KIT.std(0x263441, { roughness: 0.55, metalness: 0.25 }));
  panel.position.set(-0.16, H / 2 - 0.06, 0);
  g.add(panel);

  [-1, 1].forEach((sz) => {
    const cz2 = sz * SPAN / 2;
    // 웨이트 스택 — 판을 겹쳐 쌓아야 '무게추'로 읽힌다
    for (let i = 0; i < 12; i++) {
      const p = new THREE.Mesh(KIT.rbox(0.30, 0.058, 0.34, 0.008), plate);
      p.position.set(0.00, 0.15 + i * 0.065, cz2);
      p.castShadow = true;
      g.add(p);
    }
    // 가이드 봉 2개 + 스택 상부 캡
    [-0.12, 0.12].forEach((oz) => {
      const guide = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.013, 1.40, 8), steel);
      guide.position.set(0.00, 0.80, cz2 + oz);
      g.add(guide);
    });
    const cap = new THREE.Mesh(KIT.rbox(0.32, 0.07, 0.36, 0.01), frame);
    cap.position.set(0.00, 0.96, cz2);
    g.add(cap);
    // 상단 도르래 + 케이블
    const pulley = new THREE.Mesh(new THREE.TorusGeometry(0.055, 0.018, 8, 14), steel);
    pulley.rotation.y = Math.PI / 2;
    pulley.position.set(0.20, H - 0.20, cz2);
    g.add(pulley);
    const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.72, 6),
      KIT.std(0x2b3238, { roughness: 0.7 }));
    cable.position.set(0.253, H - 0.57, cz2);
    g.add(cable);
  });

  // 랫풀다운 바 — 양끝이 꺾인 긴 봉. 케이블 타워의 상징적인 실루엣이다.
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.019, 0.019, SPAN - 0.10, 10),
    KIT.steel(0xb0babf));
  bar.rotation.x = Math.PI / 2;
  bar.position.set(0.253, H - 0.93, 0);
  g.add(bar);
  [-1, 1].forEach((sz) => {
    const tipBar = new THREE.Mesh(new THREE.CylinderGeometry(0.019, 0.019, 0.24, 10), KIT.steel(0xb0babf));
    tipBar.position.set(0.253, H - 1.03, sz * (SPAN / 2 - 0.02));
    tipBar.rotation.x = sz * 0.9;
    g.add(tipBar);
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.16, 10),
      KIT.std(0x1f2529, { roughness: 0.55 }));
    grip.position.set(0.253, H - 0.99, sz * (SPAN / 2 - 0.13));
    grip.rotation.x = Math.PI / 2;
    g.add(grip);
  });

  // 앉는 자리 + 허벅지 고정 패드 (랫풀다운은 앉아서 한다)
  const seat = new THREE.Mesh(KIT.rbox(0.46, 0.12, 0.40, 0.03), KIT.leather(0x33404f));
  seat.position.set(0.72, 0.52, 0);
  seat.castShadow = true;
  const sPost = new THREE.Mesh(KIT.rbox(0.12, 0.46, 0.14, 0.02), frame);
  sPost.position.set(0.72, 0.24, 0);
  const thighPad = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.42, 12), KIT.leather(0x33404f));
  thighPad.rotation.x = Math.PI / 2;
  thighPad.position.set(0.50, 0.76, 0);
  const padPost = new THREE.Mesh(KIT.rbox(0.07, 0.34, 0.07, 0.014), frame);
  padPost.position.set(0.50, 0.62, 0);
  g.add(seat, sPost, thighPad, padPost);

  g.position.set(x, 0, z);
  GAME.scene.add(g);
  KIT.solid(x + 0.28, z, 0.55, SPAN / 2 + 0.14);
}

// ── 무릎 폄·굽힘 운동기구 (leg extension / curl) ───────────
// 앉아서 정강이 패드를 밀어 올리는 넙다리네갈래근 기구. 무릎 재활의 대표 장비라
// 대형 거울을 마주 보게 놓았다 — 환자가 자기 무릎 움직임을 보며 한다.
function buildLegMachine(x, z, yaw) {
  const g = new THREE.Group();
  const frame = KIT.std(0x2c4f6b, { roughness: 0.42, metalness: 0.3, envMapIntensity: 1.1 });
  const pad = KIT.leather(0x33404f);
  const steel = KIT.steel(0xc2cbd1);
  const plate = KIT.std(0x8a939a, { roughness: 0.4, metalness: 0.6, envMapIntensity: 1.2 });

  const base = new THREE.Mesh(KIT.rbox(1.26, 0.09, 0.44, 0.014), frame);
  base.position.y = 0.045;
  base.receiveShadow = true;
  g.add(base);
  // 등받이 (+x 쪽) · 좌판
  const backPost = new THREE.Mesh(KIT.rbox(0.10, 0.90, 0.14, 0.014), frame);
  backPost.position.set(0.50, 0.50, 0);
  const backPad = new THREE.Mesh(KIT.rbox(0.10, 0.52, 0.42, 0.03), pad);
  backPad.position.set(0.42, 0.74, 0);
  backPad.castShadow = true;
  const seat = new THREE.Mesh(KIT.rbox(0.48, 0.12, 0.44, 0.03), pad);
  seat.position.set(0.14, 0.46, 0);
  seat.castShadow = true;
  const seatPost = new THREE.Mesh(KIT.rbox(0.10, 0.42, 0.12, 0.014), frame);
  seatPost.position.set(0.14, 0.22, 0);
  g.add(backPost, backPad, seat, seatPost);

  // 회전축 + 레버 암 + 정강이 롤러 (무릎을 편 중간 각도로 올려 둔다)
  const pivot = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.40, 12), steel);
  pivot.rotation.x = Math.PI / 2;
  pivot.position.set(-0.10, 0.46, 0);
  g.add(pivot);
  const lever = new THREE.Group();
  [-1, 1].forEach((sz) => {
    const arm = new THREE.Mesh(KIT.rbox(0.06, 0.44, 0.05, 0.012), frame);
    arm.position.set(0, -0.22, sz * 0.19);
    lever.add(arm);
  });
  const roller = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.46, 14), pad);
  roller.rotation.x = Math.PI / 2;
  roller.position.set(0, -0.42, 0);
  roller.castShadow = true;
  lever.add(roller);
  lever.position.set(-0.10, 0.46, 0);
  lever.rotation.z = -0.85;              // 무릎 폄 중간 자세
  g.add(lever);

  // 뒤쪽 웨이트 스택
  for (let i = 0; i < 8; i++) {
    const p = new THREE.Mesh(KIT.rbox(0.26, 0.05, 0.32, 0.008), plate);
    p.position.set(0.56, 0.13 + i * 0.056, 0);
    g.add(p);
  }
  const gpost = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.013, 1.05, 8), steel);
  gpost.position.set(0.56, 0.55, 0);
  g.add(gpost);

  // 손잡이 — 앉은 사람이 잡고 몸통을 고정한다
  [-1, 1].forEach((sz) => {
    const h = new THREE.Mesh(new THREE.CylinderGeometry(0.020, 0.020, 0.26, 8), KIT.std(0x1f2529, { roughness: 0.55 }));
    h.position.set(0.24, 0.66, sz * 0.26);
    h.rotation.z = 0.5;
    g.add(h);
  });

  g.position.set(x, 0, z);
  g.rotation.y = yaw === undefined ? -Math.PI / 2 : yaw;   // 앉은 사람이 거울(−x)을 본다
  GAME.scene.add(g);
  KIT.solid(x, z, 0.30, 0.68);
}

// ── 팔 에르고미터 (UBE) ────────────────────────────────────
// 팔로 돌리는 자전거. 다리에 체중을 실을 수 없는 시기의 유산소 운동 수단이다.
function buildArmErgometer(x, z) {
  const g = new THREE.Group();
  const shell = KIT.std(0xeceff1, { roughness: 0.35, metalness: 0.15, envMapIntensity: 1.2 });
  const dark = KIT.std(0x2b3238, { roughness: 0.45 });
  const steel = KIT.steel(0xc2cbd1);

  const base = new THREE.Mesh(KIT.rbox(0.56, 0.08, 0.56, 0.018), dark);
  base.position.y = 0.04;
  base.receiveShadow = true;
  const col = new THREE.Mesh(KIT.rbox(0.18, 1.18, 0.18, 0.02), shell);
  col.position.y = 0.67;
  col.castShadow = true;
  const head = new THREE.Mesh(KIT.rbox(0.34, 0.30, 0.26, 0.03), shell);
  head.position.set(0, 1.36, 0);
  head.castShadow = true;
  const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.24, 0.15), KIT.screen(0x62d0a8));
  scr.position.set(0, 1.44, -0.132);
  scr.rotation.y = Math.PI;
  g.add(base, col, head, scr);

  // 크랭크 축 + 팔 두 개 (반대 위상)
  const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.30, 12), steel);
  axle.rotation.x = Math.PI / 2;
  axle.position.set(0, 1.20, -0.16);
  g.add(axle);
  [[-1, 0.9], [1, -0.9]].forEach(([sz, ang]) => {
    const crank = new THREE.Group();
    const arm = new THREE.Mesh(KIT.rbox(0.05, 0.34, 0.05, 0.012), dark);
    arm.position.y = 0.17;
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.14, 10), KIT.std(0x1f2529, { roughness: 0.55 }));
    grip.rotation.x = Math.PI / 2;
    grip.position.set(0, 0.34, sz * 0.09);
    crank.add(arm, grip);
    crank.position.set(0, 1.20, -0.16 + sz * 0.14);
    crank.rotation.z = ang;
    g.add(crank);
  });

  // 사용자용 의자
  const chair = new THREE.Mesh(KIT.rbox(0.42, 0.08, 0.40, 0.02), KIT.std(0x37424a, { roughness: 0.55 }));
  chair.position.set(0, 0.48, -0.78);
  chair.castShadow = true;
  const cpost = new THREE.Mesh(new THREE.CylinderGeometry(0.030, 0.030, 0.44, 8), steel);
  cpost.position.set(0, 0.24, -0.78);
  const cbase = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.24, 0.035, 12), KIT.steel(0x9aa6ad));
  cbase.position.set(0, 0.02, -0.78);
  g.add(chair, cpost, cbase);

  g.position.set(x, 0, z);
  GAME.scene.add(g);
  KIT.solid(x, z, 0.30, 0.32);
  KIT.solid(x, z - 0.78, 0.24, 0.24);
}

// ── 소도구 ───────────────────────────────────────────────────
function buildProps() {
  const s = GAME.scene;

  // 컬러 요가 매트 — 도면처럼 여러 색을 섞어 깐다.
  // 입구(z -6.8~-3.6) 앞에 깔면 들어서자마자 매트를 밟고 지나가야 해서
  // 보행 트랙 뒤편, 수치료실 문 옆 벽면 줄에 폈다.
  // 파란 매트는 p16 의 짐볼 운동 자리라 다른 둘보다 넓게 깐다 —
  // 1.7×0.9 위에 짐볼과 사람이 올라가면 매트가 방석처럼 보인다.
  [[MAT_RED, 0xc0564e, 1.7, 0.9], [MAT_BLUE, 0x4f7c9e, 2.4, 1.6], [MAT_GREEN, 0x6f9c62, 1.7, 0.9]]
    .forEach(([[x, z], col, mw, md]) => {
      const mat = new THREE.Mesh(new THREE.BoxGeometry(mw, MAT_H, md),
        KIT.std(col, { roughness: 0.62, envMapIntensity: 0.8 }));
      mat.position.set(x, MAT_H / 2, z);
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
  rack.position.set(14.15, 0, 0.70);
  rack.rotation.y = -Math.PI / 2;
  GAME.scene.add(rack);
  KIT.solid(14.15, 0.70, 0.35, 0.85);

  // 스텝박스 · 밸런스 보드
  const step = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.22, 0.4), KIT.std(0x7d9ec7, { roughness: 0.9 }));
  step.position.set(14.05, 0.11, 2.05);
  step.castShadow = true;
  GAME.scene.add(step);
  const board = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.03, 16), KIT.std(0xc89a63, { roughness: 0.5 }));
  board.position.set(14.05, 0.09, 2.75);
  board.rotation.x = 0.1;
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), KIT.std(0x37424a));
  dome.position.set(14.05, 0.045, 2.75);
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
  shelf.position.set(4.30, 0, 1.90);
  shelf.rotation.y = Math.PI / 2;
  GAME.scene.add(shelf);
  KIT.solid(4.30, 1.90, 0.25, 0.8);

  // 벽 포스터 — 구분벽 한 장, 수치료실 구분벽 한 장
  const poster = (lines, bg, col) => new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.95),
    printedMat(makeTextCanvas(lines, 512, 320, { bg, color: col, border: col, fontSize: 62 })));
  const p1 = poster(['바른 자세', '건강한 척추'], '#eaf4ea', '#2e6b3e');
  p1.position.set(GAME.ZONE.divE + 0.11, 1.9, -9.80);
  p1.rotation.y = Math.PI / 2;
  const p2 = poster(['오늘의 운동', '내일의 건강'], '#fdf2e9', '#a04000');
  p2.position.set(8.70, 1.9, GAME.ZONE.hydro.wallZ - 0.11);
  p2.rotation.y = Math.PI;
  GAME.scene.add(p1, p2);
}

// ── 환자·치료사 ──────────────────────────────────────────────
// 도면처럼 기구마다 환자와 치료사가 짝을 이룬다.
// 배정 기준은 질환 부위 — 무릎·발목·족부는 실제로 운동·보행 훈련을 한다.
function buildExercisePatients() {
  // p7 반달연골 — 매트 베드에 앉아 운동 (앉는 면 0.50).
  // 앉은 자세는 무릎부터 아래가 앞으로 내려간다. 베드 한가운데 앉히면
  // 종아리가 매트 속에 파묻혀 다리가 무릎에서 잘려 보인다 —
  // 반드시 가장자리에 걸터앉히고 다리가 바깥(+z)으로 나오게 한다.
  exerciseStation(PATIENTS[6], 7.40, -5.85, 0, 'sit');
  KIT.therapist(7.40, -4.70, Math.PI, 'handson');
  KIT.stool(8.60, -4.95);

  // p9 무릎넙다리통증은 수치료실 보행 풀로 옮겼다 (rooms/hydro.js).
  // 부하를 덜어 걷는 과제라 물속 트레드밀이 바로 그 목적의 장비다.

  // p10 발꿈치힘줄 — 천장 슬링 하네스를 매고 보행 훈련.
  // 예전에는 트랙 앞머리(8.50, −4.00)라 p7·p12 와 한 덩어리로 몰려 보였다.
  // 트랙 건너편(−x·+z 쪽) 슬링 자리로 옮겨 실 전체에 사람이 흩어지게 한다.
  // 좌표는 슬링 레일(중심 8.50/−1.10, 반지름 약 3.15) 위여야 로프가 머리 위에 온다.
  exerciseStation(PATIENTS[9], SLING_P10[0], SLING_P10[1], Math.PI / 2, 'stand');
  KIT.therapist(SLING_P10[0] + 1.15, SLING_P10[1], -Math.PI / 2, 'handson');
  // 하네스 벨트 — 도면처럼 몸통에 두르고 로프에 연결된다
  const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.26, 0.30, 14, 1, true),
    KIT.std(0x37424a, { roughness: 0.7, side: THREE.DoubleSide }));
  belt.position.set(SLING_P10[0], 1.02, SLING_P10[1]);
  GAME.scene.add(belt);

  // p12 발바닥근막염 — 리포머 캐리지(높이 0.53)에 걸터앉는다.
  // 여기도 마찬가지로 종아리가 기구에 묻히지 않도록 옆으로 다리를 낸다.
  // 거울 벽(+x) 쪽으로 물려 p7 과 간격을 벌렸다 — 셋이 z −5~−6.5 한 줄에
  // 나란히 앉아 있으면 실이 넓어져도 붐벼 보인다.
  // 거울(+x)을 마주 보고 캐리지 가장자리에 걸터앉는다 — 자세를 보며 하는
  // 기구라 거울을 등지면 기구를 놓은 뜻이 없다.
  exerciseStation(PATIENTS[11], 13.05, -5.60, Math.PI / 2, 'sit', 0.03);
  KIT.therapist(13.05, -4.40, Math.PI, 'handson');

  // p16 허리 불안정성 — 짐볼에 앉아 몸통 협응 운동.
  // 이 범주의 A등급 중재가 몸통 근력·지구력·협응 운동인데, 불안정한 면에
  // 앉는 것 자체가 그 훈련이라 매트 테이블보다 짐볼이 맞다.
  // 매트가 z = 2.60 이라 +z 를 보면 코앞이 수치료실 벽이다. −z(실 안쪽)를 보게
  // 돌려야 다가오는 학생과 마주 본다. 매트 두께만큼 띄운다.
  exerciseStation(PATIENTS[15], MAT_BLUE[0], MAT_BLUE[1], Math.PI, 'sit', MAT_H);
  // 치료사는 정면을 막지 않도록 비스듬히 옆에 선다 — 앞을 막으면 학생이
  // 환자에게 다가설 자리가 없어진다. 환자 쪽으로 몸을 튼다.
  KIT.therapist(MAT_BLUE[0] + 1.05, MAT_BLUE[1] - 0.65, -1.02, 'handson');
  KIT.stool(MAT_BLUE[0] - 1.45, MAT_BLUE[1] - 0.35);

  // p18 만성 발목 불안정성 — 평행봉 사이 워블보드 위에 선다.
  // 발판(0.06) + 보드 상판(0.12) 만큼 띄워야 발이 판에 얹힌다.
  // 봉을 따라(−x 쪽) 서게 해서 다가오는 학생을 마주본다.
  exerciseStation(PATIENTS[17], 11.30, -10.10, -Math.PI / 2, 'stand', 0.18);
  KIT.therapist(10.10, -9.30, (3 * Math.PI) / 4, 'handson');
}

// ── 균형·고유수용성 훈련 구역 ────────────────────────────────
// 만성 발목 불안정성의 일차 중재가 균형 훈련이라 전용 자리를 냈다.
// 환자는 워블보드 위에 서고, 넘어질 때 붙잡을 것이 반드시 있어야 한다.
//
// baseY — 평행봉 발판처럼 바닥이 이미 높은 곳에 올릴 때 그만큼 띄운다.
// 붙잡을 것은 평행봉이 대신하므로 여기서 난간을 또 세우지 않는다.
function buildBalanceZone(x, z, baseY) {
  const g = new THREE.Group();
  const deck = KIT.std(0x2e6b8c, { roughness: 0.55 });
  const rubber = KIT.std(0x2b3238, { roughness: 0.9 });

  // 워블보드 — 원판 + 아래 반구. 환자는 이 위에 선다.
  const board = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.21, 0.035, 24), deck);
  board.position.y = 0.10;
  board.castShadow = true;
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.085, 16, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), rubber);
  dome.position.y = 0.085;
  g.add(board, dome);

  // 폼 패드(단계 1)와 반구볼(단계 3) — 봉 사이 통로를 막지 않도록
  // 발판 길이 방향(x)으로 나란히 늘어놓는다.
  const foam = new THREE.Mesh(KIT.rbox(0.50, 0.10, 0.38, 0.02), KIT.std(0x5a7f92, { roughness: 0.95 }));
  foam.position.set(-1.05, 0.05, 0);
  foam.castShadow = true;
  g.add(foam);

  const bosu = new THREE.Mesh(new THREE.SphereGeometry(0.31, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2),
    KIT.std(0x3f7fa5, { roughness: 0.6 }));
  bosu.position.set(1.15, 0.03, 0);
  bosu.scale.y = 0.62;
  const bbase = new THREE.Mesh(new THREE.CylinderGeometry(0.31, 0.31, 0.06, 20), rubber);
  bbase.position.set(1.15, 0.03, 0);
  g.add(bosu, bbase);

  g.position.set(x, baseY || 0, z);
  GAME.scene.add(g);
}

// ── 짐볼 (스위스볼) ──────────────────────────────────────────
// 몸통 협응 운동은 불안정한 면에 앉아서 하는 것이 기본이라, 매트 테이블보다
// 짐볼이 그 자체로 중재를 설명한다.
// 앉으면 눌리므로 정구가 아니라 살짝 납작하게 만든다 — 좌면이 0.57m 로,
// 앉은 자세의 기준 좌면(STANCES.sit 의 seatY 0.56)과 맞는다.
// baseY — 요가 매트처럼 이미 높이가 있는 바닥에 올릴 때 그만큼 띄운다.
function buildGymBall(x, z, color, baseY) {
  const R = 0.33, SQ = 0.86;
  const ball = new THREE.Mesh(new THREE.SphereGeometry(R, 26, 18),
    KIT.std(color === undefined ? 0x5aa469 : color,
      { roughness: 0.34, metalness: 0.02, envMapIntensity: 1.3 }));
  ball.scale.y = SQ;
  ball.position.set(x, (baseY || 0) + R * SQ, z);
  ball.castShadow = true;
  ball.receiveShadow = true;
  GAME.scene.add(ball);
  return ball;
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
