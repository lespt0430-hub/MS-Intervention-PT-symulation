// rooms/manual.js — ManualRoom : 도수치료실 (프라이빗 룸 4개 + 안쪽 복도)
//
// '도수치료실 내부도면' 기준.
//   · 복도 한 줄을 두고 그 바깥쪽으로 독립된 방 4개가 나란히 붙는다
//   · 방마다: 도수치료 전용 베드(남색 레자) 1대 · 머리맡 협탁 + 탁상 조명 ·
//             문 옆 옷장 · 반대편 수납장 · 창가 커튼 · 벽 액자 · 치료사 1명
//   · 각 방 문에는 방 번호와 환자 이름표가 붙어 있다

function buildManualRoom() {
  const M = GAME.ZONE.manual;
  const xOuter = -GAME.ROOM.w / 2;          // 외벽
  const blockZ0 = M.roomZ[0] - M.roomHD - 0.10;   // 룸 블록 앞면
  const blockZ1 = M.roomZ[3] + M.roomHD + 0.10;   // 룸 블록 뒷면

  // ── 룸 블록의 벽 ──
  // 앞뒤 마구리 + 방 사이 칸막이 3장 (모두 x 방향으로 뻗는다)
  [blockZ0, blockZ1].forEach((z) => {
    KIT.wallRun({ axis: 'x', at: z, from: xOuter, to: M.corrWall, t: 0.16 });
  });
  [0, 1, 2].forEach((i) => {
    const z = (M.roomZ[i] + M.roomZ[i + 1]) / 2;
    KIT.wallRun({ axis: 'x', at: z, from: xOuter, to: M.corrWall, t: 0.16 });
  });
  // 복도 쪽 벽 — 방마다 문이 하나씩 뚫린다
  KIT.wallRun({
    axis: 'z', at: M.corrWall, from: blockZ0, to: blockZ1, t: 0.16,
    openings: M.roomZ.map((z) => ({ c: z, w: 1.0, h: 2.15 })),
  });

  // ── 복도 ──
  buildManualCorridor();

  // ── 방 4개 ──
  // 배정: 경추·견관절·요추·고관절 — 도수치료 적응증인 환자를 넣는다.
  const roster = [
    { p: PATIENTS[0], side: 1 },    // p1 목통증
    { p: PATIENTS[1], side: -1 },   // p2 오십견
    { p: PATIENTS[3], side: 1 },    // p4 급성 요통
    { p: PATIENTS[4], side: -1 },   // p5 고관절 FAI
  ];
  roster.forEach((r, i) => buildManualBay(r.p, i + 1, M.roomZ[i], r.side));
}

// 방 하나. cz = 방 중심 z, side = 치료사가 서는 쪽(+1 이면 +z 쪽)
function buildManualBay(patient, num, cz, side) {
  const Z = GAME.ZONE, M = Z.manual;
  const s = GAME.scene;
  const xOuter = -GAME.ROOM.w / 2;
  const inX = xOuter + 0.10;                 // 외벽 안쪽면
  const doorX = M.corrWall - 0.08;           // 복도벽 안쪽면
  const hd = M.roomHD - 0.08;                // 칸막이 안쪽면까지

  // ── 치료 베드 (머리쪽 -x, 발끝 +x) ──
  const bed = KIT.bed({ w: 0.86, l: 2.05, h: 0.66 });
  const g = bed.group;
  const fig = buildPatientFigure(patient);
  fig.position.set(0, bed.H + 0.07, bed.headZ);
  g.add(fig);
  g.position.set(M.bedX, 0, cz);
  g.rotation.y = Math.PI / 2;                // 로컬 +z(발끝) → 월드 +x
  s.add(g);
  KIT.solid(M.bedX, cz, 1.10, 0.50);
  KIT.registerPatient(g, patient, M.bedX, cz, 1.25, 0.95, 1.72);

  // 환자 이름표 — 발치 끝에 낮게. 어느 실인지는 문 앞 사인이 알려주므로
  // 여기에는 이름(성별, 나이)만 적는다.
  KIT.nameplate(g, [patient.name + ' (' + patient.sex + ', ' + patient.age + '세)'],
    0, 0.96, 1.34, 0, 0.54);

  // ── 치료사 — 베드 어깨 옆에 서서 손을 얹는다 ──
  KIT.therapist(M.bedX - 0.55, cz + side * 0.80, side > 0 ? Math.PI : 0, 'handson');
  KIT.stool(M.bedX + 0.55, cz + side * 0.95);

  // ── 가구 ──
  // 머리맡 협탁 + 탁상 조명 (도면의 노란 불빛)
  KIT.lampTable(inX + 0.32, cz - side * 0.95, Math.PI / 2);
  // 문 옆 옷장 (키 큰 목재장)
  KIT.cabinet(doorX - 0.30, cz - side * 0.95, -Math.PI / 2, 1.15, 2.00, 0.55);
  // 반대편 낮은 수납장
  KIT.cabinet(M.bedX + 0.30, cz + side * hd - side * 0.22, 0, 1.20, 0.78, 0.40);
  // 창가 커튼 한 폭 (외벽 창을 반쯤 가린다)
  KIT.curtainPanel({ x: inX + 0.10, z: cz + 0.62, yaw: Math.PI / 2, w: 1.5, h: 2.1, y: 1.20 });
  // 벽 액자
  KIT.frameArt(M.bedX - 0.40, 1.72, cz - side * (hd - 0.03), side > 0 ? 0 : Math.PI, 0.86, 0.56);

  // ── 문 (열린 상태) + 문 옆 유리 사이드라이트 ──
  const frame = KIT.portal(M.corrWall, cz, Math.PI / 2, 1.0, null, { h: 2.15, t: 0.30 });
  const leaf = new THREE.Mesh(new THREE.BoxGeometry(0.92, 2.10, 0.045), KIT.wood());
  leaf.position.set(0.46, 1.05, 0);
  const leafG = new THREE.Group();
  leafG.add(leaf);
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.13, 8), KIT.steel(0x9aa5ab));
  handle.rotation.x = Math.PI / 2;
  handle.position.set(0.84, 1.02, 0.05);
  leafG.add(handle);
  leafG.position.set(-0.46, 0, 0);
  leafG.rotation.y = 1.25;                   // 방 안쪽(-x)으로 열려 있다
  frame.add(leafG);

  // 문 옆 세로 유리 — 도면처럼 복도에서 방 안이 살짝 비친다
  const sidelite = new THREE.Mesh(new THREE.PlaneGeometry(0.30, 1.9),
    new THREE.MeshStandardMaterial({
      color: 0xdff0f4, roughness: 0.08, metalness: 0, envMapIntensity: 2.0,
      transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false,
    }));
  sidelite.position.set(M.corrWall, 1.20, cz + 0.85);
  sidelite.rotation.y = Math.PI / 2;
  s.add(sidelite);

  // ── 문 앞 실명 사인 (복도 쪽) ──
  // 예전에는 환자 이름표에 '도수 N실'을 같이 적었는데, 방 이름은 들어가기 전에
  // 문에서 읽어야 한다. 벽 바깥(복도 쪽 x = corrWall + …)에 붙여야 보인다.
  // 눈높이(1.68m) 문 옆 사인 — 실제 병원도 방 이름은 문 옆에 붙인다.
  // 문 위(2.3m)에 달면 복도가 좁아 고개를 들어야 읽힌다.
  const roomSign = new THREE.Mesh(new THREE.PlaneGeometry(0.58, 0.24),
    printedMat(makeTextCanvas(['도수 ' + num + '실'], 384, 160, { bg: '#2c5f7c', color: '#ffffff', fontSize: 96 }),
      { roughness: 0.4, envMapIntensity: 1.1 }));
  // 문선(폭 0.5 + 문설주 0.16, 복도로 0.15 튀어나옴)에 가리지 않도록
  // 문 중심에서 1.02m 떨어뜨린다. 붙여 달면 기둥에 글자 절반이 먹힌다.
  roomSign.position.set(M.corrWall + 0.13, 1.68, cz + 1.02);
  roomSign.rotation.y = Math.PI / 2;
  s.add(roomSign);
  // 문 위 번호 — 복도 끝에서 방을 셀 때 쓰는 보조 표시 (목재 헤더 위)
  const doorPlate = new THREE.Mesh(new THREE.PlaneGeometry(0.26, 0.18),
    printedMat(makeTextCanvas([String(num).padStart(2, '0')], 200, 140, { border: '#2c5f7c', color: '#2c5f7c', fontSize: 88 }),
      { roughness: 0.45, envMapIntensity: 1.0 }));
  doorPlate.position.set(M.corrWall + 0.13, 2.66, cz);
  doorPlate.rotation.y = Math.PI / 2;
  s.add(doorPlate);
}

// ── 복도 ─────────────────────────────────────────────────────
// 도면의 복도에는 린넨 수납장과 화분이 있고, 끝에서 전기치료실로 이어진다.
function buildManualCorridor() {
  const Z = GAME.ZONE, M = Z.manual;
  const s = GAME.scene;
  const d = GAME.ROOM.d;

  // 복도 천장 라인등 두 줄은 layout이 이미 깔았다. 여기서는 가구만.
  KIT.cabinet(M.corrCX - 0.05, -d / 2 + 0.45, 0, 1.6, 1.85, 0.48);     // 린넨장 (복도 앞끝)
  KIT.cabinet(M.corrCX - 0.05, d / 2 - 0.45, Math.PI, 1.6, 0.85, 0.48); // 뒤끝 낮은 수납장
  KIT.plant(M.corrCX + 0.35, -d / 2 + 1.5);
  KIT.plant(M.corrCX - 0.35, d / 2 - 1.6, -1);

  // 복도 벽 안내 사인 — 어느 방향이 몇 번 방인지
  const guide = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.42),
    printedMat(makeTextCanvas(['도수치료실 01–04', '→ 안쪽 방향'], 512, 200, { border: '#2c5f7c', fontSize: 52 }),
      { roughness: 0.5, envMapIntensity: 1.0 }));
  guide.position.set(Z.divM - 0.11, 1.65, M.entryZ + 1.9);
  guide.rotation.y = -Math.PI / 2;
  s.add(guide);

  // 손소독제 스탠드 (복도 입구)
  const san = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.1, 8), KIT.steel());
  pole.position.y = 0.55;
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.16, 0.03, 10), KIT.steel(0x9aa6ad));
  base.position.y = 0.02;
  const box = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.2, 0.1), KIT.std(0xf4f6f8, { roughness: 0.4 }));
  box.position.y = 1.16;
  san.add(pole, base, box);
  san.position.set(M.corrCX + 0.55, 0, M.entryZ - 1.0);
  s.add(san);
  KIT.solid(M.corrCX + 0.55, M.entryZ - 1.0, 0.18, 0.18);
}
