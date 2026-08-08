// rooms/electro.js — ElectroRoom : 전기치료실 (중앙 복도 + 양옆 커튼 베이)
//
// '전기치료실 내부도면' 기준.
//   · 가운데를 복도가 관통하고 양옆으로 치료 베드가 줄지어 선다
//   · 베이와 베이 사이는 천장 레일에 걸린 크림색 커튼으로 나뉜다
//   · 베드마다 이동식 전기치료기 카트가 한 대씩 붙는다
//   · 복도 앞쪽(출입문 쪽)은 접수 데스크가 있는 대기 구역이다

function buildElectroRoom() {
  const Z = GAME.ZONE, E = Z.electro;
  const s = GAME.scene;
  const d = GAME.ROOM.d;

  // ── 베이 8칸 (좌 4 · 우 4) ──
  // 배정: 누워서 전기·한랭 치료를 받는 환자. 도면처럼 발끝이 복도를 향한다.
  const roster = {
    'L0': PATIENTS[2],    // p3 손목터널증후군
    'L2': PATIENTS[7],    // p8 ACL 재건 후
    'R1': PATIENTS[5],    // p6 고관절 골관절염
    'R3': PATIENTS[10],   // p11 발목 염좌
  };
  let num = 1;
  ['L', 'R'].forEach((col) => {
    const bx = col === 'L' ? E.bankL : E.bankR;
    const yaw = col === 'L' ? Math.PI / 2 : -Math.PI / 2;   // 발끝이 복도(중앙)를 향한다
    const aisleSide = col === 'L' ? 1 : -1;                 // 복도가 있는 x 방향
    E.bayZ.forEach((cz, i) => {
      const patient = roster[col + i];
      buildElectroBay(patient, patient ? num++ : 0, bx, cz, yaw, aisleSide);
    });
  });

  // ── 베이 칸막이 커튼 ──
  // 베이 사이 경계마다 한 폭씩. 외벽에서 복도 직전까지 가린다.
  ['L', 'R'].forEach((col) => {
    // 커튼은 바깥 벽에서 복도 직전까지 — 베드 중심에서 복도 쪽으로 0.2m 민 자리
    const cx = col === 'L' ? E.bankL + 0.20 : E.bankR - 0.20;
    const edges = E.bayZ.map((z) => z - E.bayHD).concat([E.bayZ[E.bayZ.length - 1] + E.bayHD]);
    edges.forEach((z) => {
      KIT.curtainPanel({ x: cx, z, yaw: 0, w: 2.5, h: 2.25, y: 1.42 });
    });
  });

  // ── 치료사 ──
  // 도면처럼 환자 곁에서 전극을 붙이거나 상태를 확인한다.
  KIT.therapist(E.bankL + 0.30, E.bayZ[0] + 1.00, Math.PI, 'handson');
  KIT.therapist(E.bankR - 0.30, E.bayZ[1] - 1.00, 0, 'handson');
  KIT.therapist(E.bankL + 0.20, E.bayZ[2] - 1.00, 0, 'handson');

  // ── 접수·대기 구역 (출입문 쪽) ──
  buildElectroFront();

  // ── 안쪽 끝: 온습포기 + 린넨 카트 ──
  const hotpack = new THREE.Group();
  const hpBody = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.85, 0.55), KIT.steel(0xd4dade));
  hpBody.position.y = 0.545; hpBody.castShadow = true;
  const hpLid = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.06, 0.57), KIT.steel(0xb8c2c8));
  hpLid.position.y = 1.0;
  const hpDial = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.02, 10), KIT.std(0x37424a));
  hpDial.rotation.x = Math.PI / 2;
  hpDial.position.set(0.2, 0.75, 0.285);
  const hpLegs = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.12, 0.45), KIT.std(0x6b767d));
  hpLegs.position.y = 0.06;
  hotpack.add(hpBody, hpLid, hpDial, hpLegs);
  hotpack.position.set(E.bankL - 0.55, 0, d / 2 - 1.2);
  s.add(hotpack);
  KIT.solid(E.bankL - 0.55, d / 2 - 1.2, 0.4, 0.32);

  // 수건 선반
  const shelf = new THREE.Group();
  const shelfMat = KIT.std(0xe8ebe6, { roughness: 0.6 });
  [-0.7, 0.7].forEach((xx) => {
    const panel = new THREE.Mesh(new THREE.BoxGeometry(0.04, 1.25, 0.36), shelfMat);
    panel.position.set(xx, 0.625, 0);
    panel.castShadow = true;
    shelf.add(panel);
  });
  [0.30, 0.75, 1.20].forEach((yy) => {
    const board = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.035, 0.34), shelfMat);
    board.position.y = yy;
    shelf.add(board);
  });
  [[-0.42, 1.30, 0xeef3f6], [-0.14, 1.30, 0xdaeaf2], [0.16, 1.30, 0xeef3f6],
   [-0.30, 0.85, 0xdaeaf2], [0.24, 0.85, 0xeef3f6]].forEach(([xx, yy, col]) => {
    const towel = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.14, 0.26), KIT.std(col, { roughness: 0.95 }));
    towel.position.set(xx, yy, 0);
    shelf.add(towel);
  });
  shelf.position.set(E.bankR + 0.55, 0, d / 2 - 1.2);
  shelf.rotation.y = Math.PI;
  s.add(shelf);
  KIT.solid(E.bankR + 0.55, d / 2 - 1.2, 0.75, 0.24);
}

// 베이 한 칸. patient가 없으면 정돈된 빈 베드만 놓는다.
function buildElectroBay(patient, num, bx, cz, yaw, aisleSide) {
  const s = GAME.scene;
  const bed = KIT.bed({ w: 0.88, l: 2.05, h: 0.64 });
  const g = bed.group;

  if (patient) {
    const fig = buildPatientFigure(patient);
    fig.position.set(0, bed.H + 0.07, bed.headZ);
    g.add(fig);
  } else {
    // 정돈된 빈 베드 — 개켜 놓은 담요
    const folded = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.12, 0.44),
      KIT.std(0xdfe8f0, { roughness: 0.95 }));
    folded.position.set(0, bed.H + 0.13, 0.55);
    folded.castShadow = true;
    g.add(folded);
  }

  g.position.set(bx, 0, cz);
  g.rotation.y = yaw;
  s.add(g);
  KIT.solid(bx, cz, 1.10, 0.50);

  if (patient) {
    KIT.registerPatient(g, patient, bx, cz, 1.25, 0.95, 1.70);
    // 발치 끝에 낮게 — 높이 두면 누운 환자를 가린다.
    // 표기는 세 치료실 모두 '이름 (성별, 나이)' 한 줄로 통일한다.
    KIT.nameplate(g, [patient.name + ' (' + patient.sex + ', ' + patient.age + '세)'],
      0, 0.94, 1.32, 0, 0.54);
  }

  // 전기치료기 카트 — 복도 쪽 발치 옆
  KIT.etCart(bx + aisleSide * 0.95, cz + 0.72, aisleSide > 0 ? -Math.PI / 2 : Math.PI / 2);
}

// ── 접수 데스크 · 대기 구역 ──────────────────────────────────
function buildElectroFront() {
  const Z = GAME.ZONE, E = Z.electro;
  const s = GAME.scene;
  const d = GAME.ROOM.d;
  const frontZ = -d / 2;

  // 데스크 (출입문에서 오른손 쪽)
  const desk = new THREE.Group();
  const top = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.07, 0.75), KIT.std(0xd9c7a8, { roughness: 0.35 }));
  top.position.y = 0.95; top.castShadow = true;
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.9, 0.62), KIT.std(0x5b7c99));
  body.position.y = 0.45;
  const monStand = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.16, 0.06), KIT.std(0x2f3b42));
  monStand.position.set(-0.4, 1.06, 0);
  const mon = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.36, 0.04), KIT.std(0x22292e, { roughness: 0.3 }));
  mon.position.set(-0.4, 1.32, 0); mon.castShadow = true;
  const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.52, 0.3), KIT.screen(0x9fd4ee));
  scr.position.set(-0.4, 1.32, 0.021);
  desk.add(top, body, monStand, mon, scr);
  desk.position.set(2.90, 0, frontZ + 1.5);
  desk.rotation.y = -Math.PI / 2;
  s.add(desk);
  KIT.solid(2.90, frontZ + 1.5, 0.42, 1.15);

  const chair = new THREE.Group();
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.07, 0.44), KIT.std(0x38526b));
  seat.position.y = 0.48; seat.castShadow = true;
  const back = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.5, 0.06), KIT.std(0x38526b));
  back.position.set(0, 0.83, 0.21);
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.4, 8), KIT.steel());
  post.position.y = 0.28;
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.28, 0.04, 10), KIT.steel(0x9aa6ad));
  base.position.y = 0.05;
  chair.add(seat, back, post, base);
  chair.position.set(3.45, 0, frontZ + 1.5);
  chair.rotation.y = Math.PI / 2;
  s.add(chair);

  // 대기 벤치 (반대편)
  const bench = new THREE.Group();
  const bseat = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.08, 2.0), KIT.wood());
  bseat.position.y = 0.44; bseat.castShadow = true;
  bench.add(bseat);
  [-0.85, 0.85].forEach((zz) => {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 0.08), KIT.steel(0x9aa6ad));
    leg.position.set(0, 0.21, zz);
    bench.add(leg);
  });
  bench.position.set(-3.15, 0, frontZ + 1.9);
  s.add(bench);
  KIT.solid(-3.15, frontZ + 1.9, 0.3, 1.05);

  // 화분 — 출입문(폭 2.2m, x -1.1~1.1) 앞을 막지 않도록 양옆 구석으로 뺀다
  KIT.plant(-2.40, frontZ + 0.45);
  KIT.plant(2.05, frontZ + 0.45, -1);

  // 정수기 — 예전 자리(x -3.55, z -6.2)는 도수치료실 개구부(z -6.75~-5.05)
  // 정면이라 문을 통째로 막았다. 대기 벤치 옆 앞쪽 구석으로 옮긴다.
  // (접수 데스크 뒤로 보내면 직원 쪽이라 대기 환자가 못 쓴다)
  KIT.waterPurifier(-3.55, frontZ + 0.48, Math.PI / 2);

  // 휠체어 (출입문 옆)
  const wc = new THREE.Group();
  const wcMat = KIT.std(0x2c3e50, { roughness: 0.5 });
  [-0.28, 0.28].forEach((xx) => {
    const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.03, 8, 18), wcMat);
    wheel.rotation.y = Math.PI / 2;
    wheel.position.set(xx, 0.28, 0.05);
    wheel.castShadow = true;
    wc.add(wheel);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.04, 10), KIT.steel(0x9aa6ad));
    hub.rotation.z = Math.PI / 2;
    hub.position.set(xx, 0.28, 0.05);
    wc.add(hub);
    const caster = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), wcMat);
    caster.position.set(xx * 0.8, 0.06, -0.32);
    wc.add(caster);
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.14, 8), wcMat);
    handle.rotation.x = Math.PI / 2;
    handle.position.set(xx * 0.7, 1.06, 0.24);
    wc.add(handle);
  });
  const wcSeat = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.05, 0.42), KIT.std(0x1f6e8c, { roughness: 0.8 }));
  wcSeat.position.set(0, 0.5, -0.05);
  const wcBack = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.5, 0.05), KIT.std(0x1f6e8c, { roughness: 0.8 }));
  wcBack.position.set(0, 0.78, 0.19);
  wc.add(wcSeat, wcBack);
  // 운동치료실 개구부(z -6.8 ~ -3.6)도, 출입문 앞도 막지 않는 구석 자리
  // 정수기 자리를 비켜 대기 벤치 옆으로 (구석은 정수기가 쓴다)
  wc.position.set(-2.28, 0, frontZ + 2.3);
  wc.rotation.y = 1.2;
  s.add(wc);
  KIT.solid(-2.28, frontZ + 2.3, 0.42, 0.42);

  // 안내 게시판 (출입문 옆 벽)
  const board = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 1.05),
    printedMat(makeTextCanvas(['진료 안내', '① 접수  ② 전기치료', '③ 도수·운동치료'], 512, 320,
      { bg: '#eef4f7', color: '#22506b', border: '#2c5f7c', fontSize: 54 })));
  board.position.set(Z.divM + 0.11, 1.85, frontZ + 5.2);
  board.rotation.y = Math.PI / 2;
  s.add(board);

  // 복도 바닥 유도선 — 출입문에서 안쪽으로 이어지는 안내 띠
  const guideCv = document.createElement('canvas');
  guideCv.width = 32; guideCv.height = 256;
  const gx = guideCv.getContext('2d');
  gx.clearRect(0, 0, 32, 256);
  gx.fillStyle = 'rgba(70,120,150,0.55)';
  for (let y = 0; y < 256; y += 32) gx.fillRect(8, y, 16, 20);
  const guide = new THREE.Mesh(new THREE.PlaneGeometry(0.18, 8.0),
    new THREE.MeshStandardMaterial({
      map: RENDER.colorTex(guideCv, 1, 6), transparent: true,
      roughness: 0.4, depthWrite: false,
    }));
  guide.rotation.x = -Math.PI / 2;
  guide.position.set(E.aisleCX, 0.005, frontZ + 5.4);
  s.add(guide);
}
