// rooms/electro.js — ElectroRoom : 전기치료실 (중앙 복도 + 양옆 커튼 베이)
//
// '전기치료실 내부도면' 기준.
//   · 가운데를 복도가 관통하고 양옆으로 치료 베드가 줄지어 선다
//   · 베이와 베이 사이는 천장 레일에 걸린 크림색 커튼으로 나뉜다
//   · 베드마다 이동식 전기치료기 카트가 한 대씩 붙는다
//   · 두 베이는 특수치료 베이다 — 체외충격파(ESWT)와 고출력 레이저(HILT)
//   · 복도 앞쪽(출입문 쪽)은 접수 데스크가 있는 대기 구역이다

function buildElectroRoom() {
  const Z = GAME.ZONE, E = Z.electro;
  const s = GAME.scene;
  const d = GAME.ROOM.d;

  // ── 베이 8칸 (좌 4 · 우 4) ──
  // 배정: 누워서 전기·한랭 치료를 받는 환자. 도면처럼 발끝이 복도를 향한다.
  // device: 그 베이에 붙는 기기. 'laser'·'eswt' 는 전기치료기 카트를 대신한다.
  const roster = {
    'L0': { p: PATIENTS[2] },                        // p3  손목터널증후군
    'L1': { p: PATIENTS[13], device: 'ctrac' },      // p14 경추 신경근병증 — 간헐적 경추 견인
    'L2': { p: PATIENTS[7], device: 'laser' },       // p8  ACL 재건 후 — 무릎에 고출력 레이저
    'L3': { p: PATIENTS[14], device: 'ltrac' },      // p15 요추 신경근병증 — 엎드린 간헐 요추 견인
    'R0': { p: PATIENTS[16] },                       // p17 MCL 염좌 — 급성기 한랭·전기치료
    'R1': { p: PATIENTS[5] },                        // p6  고관절 골관절염
    'R3': { p: PATIENTS[10], device: 'eswt' },       // p11 발목 염좌 — 발목에 체외충격파
    // R2 는 비워 둔다 — 케이스를 더 넣을 때 쓰는 자리다.
  };
  let num = 1;
  ['L', 'R'].forEach((col) => {
    const bx = col === 'L' ? E.bankL : E.bankR;
    const yaw = col === 'L' ? Math.PI / 2 : -Math.PI / 2;   // 발끝이 복도(중앙)를 향한다
    const aisleSide = col === 'L' ? 1 : -1;                 // 복도가 있는 x 방향
    E.bayZ.forEach((cz, i) => {
      const r = roster[col + i] || {};
      buildElectroBay(r.p, r.p ? num++ : 0, bx, cz, yaw, aisleSide, r.device);
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
  KIT.therapist(E.bankL + 0.20, E.bayZ[2] - 1.00, 0, 'handson');   // 레이저 베이
  // 견인 베이 둘 — 견인력을 올리는 동안 환자 옆을 지킨다
  KIT.therapist(E.bankL + 0.35, E.bayZ[1] + 0.95, Math.PI, 'handson');   // 경추 견인
  KIT.therapist(E.bankL + 0.35, E.bayZ[3] + 0.95, Math.PI, 'handson');   // 요추 견인
  KIT.therapist(E.bankR - 0.35, E.bayZ[0] + 0.95, Math.PI, 'handson');   // MCL 급성기 베이
  // 체외충격파 베이 — 발끝(복도) 쪽에 서서 발목에 핸드피스를 댄다
  KIT.therapist(E.bankR - 1.30, E.bayZ[3], Math.PI / 2, 'handson');

  // 특수치료 안내 — 복도에서 어느 베이가 무엇인지 읽힌다
  const spec = new THREE.Mesh(new THREE.PlaneGeometry(1.55, 0.60),
    printedMat(makeTextCanvas(['특수치료 베이', '② 경추견인 ③ 레이저 ④ 요추견인 ⑦ 충격파'], 512, 200,
      { bg: '#22506b', color: '#ffffff', fontSize: 54 }),
      { roughness: 0.35, envMapIntensity: 1.1 }));
  spec.position.set(Z.divM + 0.11, 2.05, E.bayZ[2]);
  spec.rotation.y = Math.PI / 2;
  s.add(spec);

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
// device 를 주면 전기치료기 카트 대신 그 기기를 붙인다.
function buildElectroBay(patient, num, bx, cz, yaw, aisleSide, device) {
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

  // 기기 — 기본은 이동식 전기치료기 카트, 특수치료 베이는 그 자리를 대신 쓴다.
  // 관절 암이 달린 기기는 시술 방향(로컬 +z)이 베드를 향해야 하므로
  // 베드 옆(+z 쪽)에 세우고 yaw 를 π 로 돌려 팔이 베드 위로 넘어오게 한다.
  if (device === 'laser') {
    KIT.laserUnit(bx + aisleSide * 0.55, cz + 0.86, Math.PI);
  } else if (device === 'eswt') {
    // 충격파는 발목·발에 대므로 발치(복도) 쪽으로 물려 세운다
    KIT.eswtUnit(bx + aisleSide * 0.80, cz + 0.75, Math.PI);
  } else if (device === 'ctrac' || device === 'lumbar' || device === 'ltrac') {
    // 견인기는 머리맡(로컬 -z)에 세우고 로프가 환자 쪽(+z)으로 뻗게 둔다.
    // 베드는 머리쪽이 바깥 벽이므로 기기도 벽 쪽에 붙는다.
    KIT.tractionUnit(bx - aisleSide * 0.30, cz - 1.42, 0,
      device === 'ctrac' ? 'cervical' : 'lumbar');
  } else {
    KIT.etCart(bx + aisleSide * 0.95, cz + 0.72, aisleSide > 0 ? -Math.PI / 2 : Math.PI / 2);
  }
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

  // ── 접수 직원 ──
  // 데스크 뒤(+x)에 앉아 −x 쪽 대기 구역을 마주본다. 앉은 자세의 기준 좌면은
  // 0.56m 인데 이 의자는 0.48m 이라 그만큼 내려 앉힌다.
  const front = KIT.therapist(3.45, frontZ + 1.5, -Math.PI / 2, 'sit');
  front.position.y = -0.08;

  // 전산 처리용 키보드 — 손이 놓이는 자리에 둔다. 모니터만 있으면
  // 앉아서 화면만 보고 있는 사람으로 읽힌다.
  const kbd = new THREE.Mesh(new THREE.BoxGeometry(0.40, 0.02, 0.15),
    KIT.std(0x2f3b42, { roughness: 0.5 }));
  kbd.position.set(2.78, 1.0, frontZ + 1.5);
  kbd.rotation.y = -Math.PI / 2;
  s.add(kbd);

  // 말 걸기 등록 — 학생이 처음 들어와 "어디부터 가지?" 할 때의 안내 창구.
  // 인원수는 배치와 어긋나면 안 되므로 실제 배정과 같이 적는다
  // (도수 5 · 전기 7 · 운동 5 · 수치료 2 = 19).
  KIT.registerDesk(2.90, frontZ + 1.5, 0.9, 1.3, {
    name: '유가람', role: '접수 물리치료사',
    lines: [
      '어서 오세요. 실습 오셨죠? 접수 도와드릴게요. 가운 입으시고 바로 들어가시면 됩니다.',
      '오늘 환자분은 모두 열아홉 분이세요. 여기 전기치료실에 일곱 분, 왼쪽 도수치료실에 다섯 분, 오른쪽 운동치료실에 다섯 분, 그 안쪽 수치료실에 두 분 계십니다.',
      '순서는 정해 두지 않았어요. 환자분 앞에 서서 E 를 누르시면 문진부터 시작됩니다.',
      '진행은 문진 → 이학적 검사 → 진단 → 치료계획 순서예요. 검사는 필요한 것만 고르세요. 안 해도 될 검사를 많이 넣으면 점수가 깎입니다.',
      '열아홉 분 다 보시면 종합 성적표가 열려요. 급하게 안 하셔도 되니 한 분씩 꼼꼼히 보세요.',
    ],
  });

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

  // 안내 게시판 — 도수치료실 구분벽(−x)에 건다.
  // 예전에는 frontZ + 5.2 였는데, 실 깊이를 19m→22m 로 늘리자 frontZ 가 같이
  // 밀려 판이 도수치료실 개구부(z −6.75~−5.05) 한가운데를 가로막았다.
  // 개구부는 entryZ 로 고정돼 있어 frontZ 를 따라오지 않는다 — 그래서 이제는
  // 앞쪽 구석의 정수기 옆에 붙여, 깊이를 또 바꿔도 문을 막을 일이 없게 한다.
  const board = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 1.05),
    printedMat(makeTextCanvas(['진료 안내', '① 접수  ② 전기치료', '③ 도수·운동치료'], 512, 320,
      { bg: '#eef4f7', color: '#22506b', border: '#2c5f7c', fontSize: 54 })));
  board.position.set(Z.divM + 0.11, 1.85, frontZ + 1.75);
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
