// 3D 물리치료실 — Three.js r185
// 1인칭 이동(WASD + 마우스), 환자 12명, 접근 시 E키로 진료 시작
// 역할 분담
//   render.js  = 빛·재질·화질 파이프라인
//   rooms/*.js = 공간(외벽·구분벽·세 치료실의 가구와 사람 배치)
//   game.js    = 인체 인형·조작·진료 판정
// 공간은 도면 4장(전체/운동/전기/도수)을 그대로 옮긴 것이다. rooms/kit.js 참고.

const GAME = {
  scene: null, camera: null, renderer: null,
  yaw: Math.PI, pitch: 0,   // 출입문에서 안쪽(+z)을 본다
  keys: {},
  player: { x: 0, z: -8.4, speed: 3.2 },   // 출입문 안쪽 — 정면이 전기치료실 중앙 복도
  beds: [], // {patient, group, checkSprite, cx, cz, hw, hd}
  obstacles: [], // 벽·장비 충돌 박스 {cx, cz, hw, hd}
  nearPatient: null,
  locked: false,
  lastT: 0,
  // 마우스 감도 — 예전 값(0.0022)은 살짝만 움직여도 화면이 홱 돌아가서
  // 목표 환자를 지나쳤다. 절반으로 낮추고, 한 프레임에 들어오는 이동량도
  // 제한해 마우스가 튈 때 시야가 통째로 돌아가는 일을 막는다.
  mouseSens: 0.0014,
  turn: 0,        // 화면 버튼 좌우 회전 (-1 왼쪽 / +1 오른쪽)
  look: 0,        // 화면 버튼 상하 시선 (+1 위 / -1 아래)
  turnSpeed: 1.5, // rad/s
  qualityPref: 'auto',  // index.html이 시작 전에 채운다
  ROOM: { w: 26, d: 19, h: 3.4 }, // x: -13..13, z: -9.5..9.5
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
  // 공간 — 도면의 세 실을 모듈별로 짓는다 (rooms/*.js)
  buildLayout();          // 외벽·바닥·천장·구분벽·간판·천장조명
  buildManualRoom();      // 도수치료실 (프라이빗 룸 4개)
  buildElectroRoom();     // 전기치료실 (중앙 복도 + 커튼 베이)
  buildExerciseRoom();    // 운동치료실 (트랙·슬링·기구)
  buildContactShadows();
  // 반사는 방·장비가 모두 들어온 뒤에 붙인다 (비칠 대상이 있어야 한다)
  RENDER.buildFloorReflection(c.scene, c.ROOM);
  RENDER.buildComposer(c.renderer, c.scene, c.camera);
  bindControls();
  animate();
}

// 가구 밑에 접지 그림자를 깔아 물체가 바닥에 떠 보이지 않게 한다.
// KIT.solid로 등록된 가구만 대상이다 — 벽(KIT.wallSolid)까지 깔면 바닥이 시커메진다.
function buildContactShadows() {
  (GAME.aoSpots || []).forEach((o) => {
    if (o.hw < 0.15 || o.hd < 0.15) return;   // 얇은 판정은 제외
    RENDER.aoDecal(GAME.scene, o.cx, o.cz, Math.min(o.hw, 1.4), Math.min(o.hd, 1.4));
  });
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

// 서 있는/앉아 있는 사람의 자세. 누운 리그를 그대로 세워서 쓴다.
// (누운 리그는 "머리 -z, 발 +z, 배가 +y" 좌표계라, X축으로 90° 세우면
//  머리 위·발 아래·배가 +z 를 보는 선 자세가 그대로 나온다.)
const STANCES = {
  stand:  { legR: { hip: 0.04 }, legL: { hip: -0.04 }, armR: 'hang', armL: 'hang' },
  walk:   { legR: { hip: 0.42, knee: 0.10 }, legL: { hip: -0.30, knee: 0.30 }, armR: 'swingB', armL: 'swingF' },
  // 앉기: 고관절·무릎 90°. 엉덩이가 앉는 면에 오도록 배치 쪽에서 y를 잡는다.
  sit:    { legR: { hip: 1.52, knee: 1.52 }, legL: { hip: 1.52, knee: 1.52 }, armR: 'lap', armL: 'lap' },
  // 치료사가 환자 위로 손을 얹은 자세 (도수치료·촉진)
  handson: { legR: { hip: 0.10 }, legL: { hip: -0.10 }, armR: 'reach', armL: 'reach' },
};

// 환자복 원단 — 국내 병원 환자복의 연한 하늘색 세로 줄무늬.
// 단색으로 두면 옷이 아니라 색칠한 플라스틱으로 보인다. 줄무늬가 있어야
// 천으로 읽히고, 세로줄이라 몸의 굴곡을 따라 휘어 입체감도 같이 산다.
// 환자 12명이 같은 원단을 쓰므로 한 번만 만들어 돌려 쓴다.
let GOWN_TEX = null;
function patientGownTexture() {
  if (GOWN_TEX) return GOWN_TEX;
  const cv = document.createElement('canvas');
  cv.width = 128; cv.height = 16;
  const g = cv.getContext('2d');
  g.fillStyle = '#e7eef3'; g.fillRect(0, 0, 128, 16);
  for (let x = 0; x < 128; x += 16) {
    g.fillStyle = 'rgba(122,158,184,0.42)'; g.fillRect(x, 0, 3, 16);
    g.fillStyle = 'rgba(122,158,184,0.16)'; g.fillRect(x + 6, 0, 1.5, 16);
  }
  GOWN_TEX = RENDER.colorTex(cv, 3, 1);   // 몸통을 세 바퀴 도는 간격
  return GOWN_TEX;
}

function buildPatientFigure(patient, opts) {
  const o = opts || {};
  const col = patient.colors || {};
  const M = {
    // 피부는 완전 무광이 아니다 — 약한 광택이 있어야 사람 피부로 읽힌다
    skin: new THREE.MeshStandardMaterial({ color: col.skin || 0xf1c8a8, roughness: 0.52, envMapIntensity: 0.9 }),
    hair: new THREE.MeshStandardMaterial({ color: col.hair || 0x2b2b2b, roughness: 0.5, envMapIntensity: 0.8 }),
    shirt: new THREE.MeshStandardMaterial({ color: col.blanket || 0xa8c8e0, roughness: 0.92, envMapIntensity: 0.5 }),
    pants: new THREE.MeshStandardMaterial({ color: col.pants || 0x8195a6, roughness: 0.92, envMapIntensity: 0.5 }),
    white: new THREE.MeshStandardMaterial({ color: 0xf5f5f5, roughness: 0.9, envMapIntensity: 0.5 }),
    // 옷 — 환자는 환자복, 치료사는 남색 스크럽. 회전면 한 장이라 안쪽 면도
    // 보이므로 DoubleSide 여야 목둘레·밑단이 뚫려 보이지 않는다.
    gown: o.badge
      ? new THREE.MeshStandardMaterial({
          color: col.blanket || 0x415d87, roughness: 0.86,
          envMapIntensity: 0.55, side: THREE.DoubleSide,
        })
      : new THREE.MeshStandardMaterial({
          color: 0xdbe6ee, map: patientGownTexture(), roughness: 0.94,
          envMapIntensity: 0.5, side: THREE.DoubleSide,
        }),
    // 얼음팩 — 반투명하고 젖은 표면
    ice: new THREE.MeshStandardMaterial({ color: 0xbfe3f5, roughness: 0.12, metalness: 0.05, envMapIntensity: 1.4, transparent: true, opacity: 0.86 }),
    // 담요는 반원통 껍질이라 안쪽 면도 보인다 → DoubleSide
    blanket: new THREE.MeshStandardMaterial({ color: 0xdfe8f0, roughness: 0.97, envMapIntensity: 0.4, side: THREE.DoubleSide }),
    sheet: new THREE.MeshStandardMaterial({ color: 0xf4f7fa, roughness: 0.95, envMapIntensity: 0.4 }),
  };
  // 누운 자세는 질환별 표(PATIENT_POSES), 선 자세는 STANCES에서 가져온다.
  const base = { roll: 0, lift: 0, legR: {}, legL: {}, armR: 'side', armL: 'side', foot: 'up', props: [] };
  const pose = o.stance
    ? Object.assign(base, STANCES[o.stance] || STANCES.stand)
    : Object.assign(base, PATIENT_POSES[patient.id] || {});

  const fig = new THREE.Group();  // 침대 기준 (소품용)
  const body = new THREE.Group(); // 몸 좌표계 — roll/lift 적용
  body.rotation.z = pose.roll;
  body.position.y = pose.lift;
  fig.add(body);

  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  // 팔다리 한 마디. 원기둥이 아니라 캡슐(양끝이 둥근 막대)로 만든다.
  //
  // 원기둥은 끝이 납작하게 잘려서, 관절마다 원판 모서리가 실루엣에 드러난다.
  // 그게 인형을 뻣뻣하고 조립식으로 보이게 하던 원인이었다. 캡슐로 두면
  // 끝이 반구라 이웃 마디와 매끄럽게 이어진다.
  //
  // 원통부 길이는 (전체길이 - r). 반구가 양 끝에서 r/2씩 삐져나와 이웃 마디와
  // 겹치므로 관절에 틈이 생기지 않는다.
  //
  // 처음엔 (전체길이 - 2r)로 잡아 총 길이를 정확히 맞췄는데, 그러면 마디 끝이
  // 관절점에 딱 멈춰서 팔꿈치·무릎마다 틈이 벌어져 조립식 인형으로 보였다.
  // 반대로 (전체길이)로 두면 마디마다 r씩 늘어나 팔다리가 40%씩 길어진다.
  // r 하나만 빼는 지금 값이 관절은 메우면서 비율은 거의 유지한다.
  const seg = (a, b, r, mat, parent) => {
    const dir = new THREE.Vector3().subVectors(b, a);
    const len = dir.length();
    const m = new THREE.Mesh(
      new THREE.CapsuleGeometry(r, Math.max(0.004, len - r), 3, 12), mat);
    m.position.copy(a).addScaledVector(dir, 0.5);
    m.quaternion.setFromUnitVectors(V(0, 1, 0), dir.normalize());
    m.castShadow = true;
    (parent || body).add(m);
    return m;
  };
  // 구 분할을 20×16에서 14×10으로 낮췄다. 손·관절처럼 화면에서 몇 픽셀밖에
  // 안 되는 것에 640삼각형씩 쓰고 있었다 — 눈에 띄는 차이 없이 절반 이하로 준다.
  const ball = (p, r, mat, parent) => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(r, 14, 10), mat);
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
    const m = new THREE.Mesh(new THREE.SphereGeometry(1, 18, 12), mat);
    m.scale.set(rx, ry, rz);
    m.position.copy(p); m.castShadow = true;
    (parent || body).add(m);
    return m;
  };

  // 머리·얼굴
  // 머리만은 분할을 높게 유지한다. 진료 중 얼굴을 가까이서 보게 되는데
  // 여기가 각지면 나머지를 아무리 다듬어도 인형처럼 보인다.
  const headC = V(0, 0.15, 0);
  const headMesh = new THREE.Mesh(new THREE.SphereGeometry(0.11, 26, 20), M.skin);
  headMesh.position.copy(headC); headMesh.castShadow = true;
  body.add(headMesh);
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.115, 24, 18, 0, Math.PI * 2, 0, Math.PI * 0.55), M.hair);
  hair.position.copy(headC);
  // 머리카락은 정수리(-z)를 중심으로 뒤통수·옆머리까지 덮고 얼굴(+y)만 비운다.
  // 예전 값(누운 자세 -0.55,-0.45)은 덮는 방향이 너무 아래로 쏠려서
  // 누운 환자를 위에서 내려다보면 정수리가 훤히 벗겨져 보였다.
  hair.quaternion.setFromUnitVectors(V(0, 1, 0), V(0, -0.30, -1).normalize());
  hair.castShadow = true;
  body.add(hair);
  if (patient.sex === '여') ball(V(0, 0.08, -0.13), 0.055, M.hair); // 묶은 머리

  // ── 얼굴: 눈·눈썹·코·입·귀 ──
  // 누운 리그에서 얼굴은 +y(천장)를 본다. 자세를 세우면 그대로 정면이 된다.
  // 좌표는 머리 구(중심 y=0.15, 반지름 0.11)의 표면에 맞춘 값이라
  // 이목구비가 얼굴 밖으로 떠오르거나 두피 속에 묻히지 않는다.
  // 이목구비는 머리카락이 덮는 영역(정수리 쪽) 바깥, 즉 얼굴면에만 놓는다.
  if (Math.abs(pose.roll) < 2) {          // 엎드린 자세면 얼굴이 안 보인다
    const lip = new THREE.MeshStandardMaterial({ color: 0xbe7d76, roughness: 0.62 });
    [-1, 1].forEach((s) => {
      ellip(V(s * 0.038, 0.250, 0.010), 0.019, 0.011, 0.014, M.white);    // 흰자
      ball(V(s * 0.038, 0.256, 0.008), 0.0095, M.hair);                   // 눈동자
      const brow = box(V(s * 0.040, 0.248, -0.005), 0.032, 0.007, 0.010, M.hair);
      brow.rotation.z = -s * 0.14;                                        // 눈썹
    });
    ellip(V(0, 0.252, 0.050), 0.016, 0.021, 0.027, M.skin);               // 코
    box(V(0, 0.232, 0.070), 0.042, 0.008, 0.013, lip);                    // 입
  }
  // 귀 — 머리카락(반지름 0.115) 바깥으로 나오도록 살짝 벌려 붙인다
  [-1, 1].forEach((s) => ellip(V(s * 0.108, 0.140, 0.030), 0.016, 0.030, 0.022, M.skin));

  // 왼쪽 가슴 명찰 (치료사용) — 흉곽 타원면 위에 붙인다
  if (o.badge) {
    const badge = new THREE.Mesh(new THREE.PlaneGeometry(0.095, 0.036),
      new THREE.MeshStandardMaterial({
        map: makeTextCanvas([o.badge], 256, 96, { bg: '#f4f7fa', color: '#1f3350', fontSize: 46 }),
        roughness: 0.5, side: THREE.DoubleSide,
      }));
    // 옷을 입히면서 가슴 표면이 바깥으로 밀렸다 — 예전 y(0.196)로 두면
    // 명찰이 스크럽 안에 묻힌다. 옷 단면(반지름 0.250 × 납작계수 0.52)의
    // 표면에 맞춰 올린다.
    badge.position.set(-0.105, 0.234, 0.345);
    badge.rotation.x = -Math.PI / 2;      // 판의 앞면이 가슴 바깥(+y)을 본다
    body.add(badge);
  }

  // ── 몸통 ──
  // 예전에는 흉곽 타원체 + 골반 타원체 + 어깨 공 2개, 넷을 따로 놓았다.
  // 그래서 허리에 이음매가 지고 어깨가 얹어 놓은 공처럼 보였다 — 사람이
  // 아니라 눈사람으로 읽히던 가장 큰 원인이다.
  //
  // 목 아래부터 사타구니까지를 회전면(lathe) 하나로 뽑는다. 옆선이 끊기지
  // 않고 어깨→가슴→허리→엉덩이가 한 덩어리로 이어진다.
  //
  // 리그 규약: z가 머리(0)에서 발(+) 방향, y가 배 쪽. 그래서 회전축을
  // +Y에서 +Z로 눕히고(rotation.x), 단면을 눌러 앞뒤로 납작하게 만든다
  // (사람 몸통은 원기둥이 아니라 좌우로 넓은 타원 단면이다).
  const lathe = (profile, mat, flat, yCenter, seg2) => {
    const pts = profile.map(([r, z]) => new THREE.Vector2(r, z));
    const m = new THREE.Mesh(new THREE.LatheGeometry(pts, seg2 || 20), mat);
    m.rotation.x = Math.PI / 2;        // 회전축 +Y → +Z (머리→발)
    m.scale.set(1, 1, flat);           // 로컬 z(회전 뒤 월드 y)를 눌러 납작하게
    m.position.set(0, yCenter === undefined ? 0.10 : yCenter, 0);
    m.castShadow = true;
    body.add(m);
    return m;
  };

  seg(V(0, 0.13, 0.06), V(0, 0.115, 0.20), 0.05, M.skin);   // 목
  // 옷깃 아래로는 옷이 항상 몸보다 굵어야 한다. 처음에 몸통이 더 굵은 구간이
  // 생겨서 어깨·쇄골이 옷 밖으로 뚫고 나왔고, 화면에서는 '민소매 원피스를 입은
  // 것'처럼 보였다. 아래 두 단면은 같은 z에서 옷 > 몸이 되도록 맞춰 둔 값이다.
  lathe([
    [0.105, 0.165],                      // 목 아래 (여기부터 옷깃 위 — 맨살로 보이는 게 맞다)
    [0.145, 0.215],
    [0.192, 0.262],                      // 어깨 — 팔이 붙는 높이
    [0.215, 0.300],
    [0.222, 0.400],                      // 가슴
    [0.205, 0.520],
    [0.183, 0.640],                      // 허리
    [0.196, 0.780],
    [0.198, 0.880],                      // 엉덩이
    [0.175, 0.960],
    [0.120, 1.000],
  ], M.skin, 0.52);

  // ── 옷 ──
  // 몸통 위에 한 장짜리 옷을 덧씌운다. 이게 이음매가 남아 있을 만한 자리
  // (어깨·허리·고관절)를 통째로 덮어 버린다. 실제로도 환자는 환자복을,
  // 치료사는 스크럽을 입고 있으니 현실감과 구조가 같은 방향이다.
  // 치료사 상의는 엉덩이 위에서 끝나고 통이 곧다(스크럽).
  // 환자복은 조금 더 길고 밑단이 살짝 퍼진다.
  const staff = !!o.badge;
  lathe(staff ? [
    [0.162, 0.215],                      // 목둘레 — 몸통(0.145)보다 굵게 잡아야 덮인다
    [0.205, 0.245],
    [0.238, 0.275],                      // 어깨
    [0.246, 0.320],
    [0.248, 0.460],                      // 가슴
    [0.236, 0.620],                      // 허리
    [0.243, 0.800],
    [0.244, 0.920],                      // 밑단 — 곧게 떨어뜨린다
  ] : [
    [0.162, 0.215],
    [0.205, 0.245],
    [0.238, 0.275],
    [0.246, 0.320],
    [0.250, 0.460],
    [0.235, 0.620],
    [0.248, 0.800],
    [0.260, 0.960],
    [0.265, 1.060],                      // 환자복 밑단 — 살짝 퍼짐
  ], M.gown, 0.52, 0.10, 24);

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
      // ── 선 자세용 (몸을 세우면 +z가 발쪽 = 아래가 된다) ──
      case 'hang':   return { S, elbow: V(s * 0.24, 0.02, 0.52), hand: V(s * 0.25, 0.00, 0.80) };
      case 'swingF': return { S, elbow: V(s * 0.23, 0.16, 0.48), hand: V(s * 0.22, 0.30, 0.72) };
      case 'swingB': return { S, elbow: V(s * 0.23, -0.12, 0.48), hand: V(s * 0.22, -0.24, 0.72) };
      case 'lap':    return { S, elbow: V(s * 0.24, 0.02, 0.50), hand: V(s * 0.15, 0.30, 0.66) };
      case 'reach':  return { S, elbow: V(s * 0.27, 0.16, 0.44), hand: V(s * 0.18, 0.46, 0.60) };
      default:        return { S, elbow: V(s * 0.25, 0.10, 0.52), hand: V(s * 0.26, 0.10, 0.76) }; // side
    }
  };
  [[pose.armR, 1], [pose.armL, -1]].forEach(([kind, s]) => {
    const a = armTargets(kind, s);
    // 위팔은 맨살로 두고 어깨 쪽 절반만 소매로 덮는다. 예전에는 위팔 전체가
    // 옷 색이라 팔이 몸통에서 떨어져 나온 별개의 막대로 보였다 —
    // 소매 끝에서 팔이 나오는 형태여야 몸에 붙어 있는 팔로 읽힌다.
    seg(a.S, a.elbow, 0.048, M.skin);
    const sleeveEnd = a.S.clone().lerp(a.elbow, 0.46);
    seg(a.S.clone().lerp(a.elbow, -0.10), sleeveEnd, 0.058, M.gown);
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

  if (!o.stance) return fig;

  // 누운 리그를 X축으로 90° 세운다. 바깥 그룹으로 한 번 감싸야 호출부가
  // rotation.y(바라보는 방향)를 자유롭게 줄 수 있다 (오일러 순서 충돌 방지).
  fig.rotation.x = Math.PI / 2;
  const upright = new THREE.Group();
  upright.add(fig);
  // 원점이 머리 높이에 오므로, 바닥에 발이 닿도록 들어올린다
  upright.position.y = o.stance === 'sit' ? 1.40 : 1.78;
  return upright;
}

// 치료사 — 환자와 같은 리그를 쓰되 도면처럼 남색 스크럽 상하의를 입힌다.
// 환자복(연한 하늘색·회색)과 색이 확실히 갈려야 실습생이 한눈에 구분한다.
function buildTherapist(stance, skin, hair) {
  return buildPatientFigure(
    // 노출을 낮춘 뒤 남색 0x33456b가 거의 검게 눌려서 한 톤 올렸다
    { id: '_staff', colors: { skin: skin || 0xf0c6a4, hair: hair || 0x241f1c, blanket: 0x415d87, pants: 0x35486a } },
    { stance: stance || 'stand', badge: '물리치료사' }
  );
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
    // 마우스가 튀는 순간(창 전환·저가 광마우스)에는 movementX가 수백까지 올라간다.
    // 한 프레임 회전량을 제한하지 않으면 그때 화면이 통째로 돌아가 버린다.
    const cap = (v) => Math.max(-90, Math.min(90, v));
    GAME.yaw -= cap(e.movementX) * GAME.mouseSens;
    GAME.pitch -= cap(e.movementY) * GAME.mouseSens;
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

  bindScreenPad();

  // F3 — 교수용 성능 표시 (적용된 화질 등급 / 실측 FPS)
  document.addEventListener('keydown', (e) => {
    if (e.code !== 'F3') return;
    e.preventDefault();
    const el = document.getElementById('hud-perf');
    if (el) el.style.display = el.style.display === 'block' ? 'none' : 'block';
  });
}

// ── 화면 조작판 (마우스·키보드를 못 쓰는 환경용) ──────────────
// 터치스크린·트랙패드만 있는 PC에서도 클릭만으로 이동·회전·진료가 되어야 한다.
// 버튼은 누르고 있는 동안 계속 눌린 것으로 처리한다(키보드와 같은 방식).
function bindScreenPad() {
  const pad = document.getElementById('screen-pad');
  if (!pad) return;

  const apply = (act, on) => {
    switch (act) {
      case 'fwd':   GAME.keys['KeyW'] = on; break;
      case 'back':  GAME.keys['KeyS'] = on; break;
      case 'left':  GAME.keys['KeyA'] = on; break;
      case 'right': GAME.keys['KeyD'] = on; break;
      case 'turnL': GAME.turn = on ? -1 : 0; break;
      case 'turnR': GAME.turn = on ? 1 : 0; break;
      case 'lookU': GAME.look = on ? 1 : 0; break;
      case 'lookD': GAME.look = on ? -1 : 0; break;
    }
  };

  pad.querySelectorAll('[data-act]').forEach((btn) => {
    const act = btn.getAttribute('data-act');
    const press = (e) => {
      e.preventDefault();
      btn.classList.add('on');
      apply(act, true);
      // 손가락을 버튼 밖으로 끌고 나가도 pointerup을 받도록 잡아 둔다
      if (btn.setPointerCapture && e.pointerId !== undefined) {
        try { btn.setPointerCapture(e.pointerId); } catch (err) { /* 무시 */ }
      }
    };
    const release = (e) => {
      if (e) e.preventDefault();
      btn.classList.remove('on');
      apply(act, false);
    };
    btn.addEventListener('pointerdown', press);
    btn.addEventListener('pointerup', release);
    btn.addEventListener('pointercancel', release);
    btn.addEventListener('pointerleave', release);
    btn.addEventListener('contextmenu', (e) => e.preventDefault());
  });

  const eBtn = document.getElementById('pad-interact');
  if (eBtn) {
    eBtn.addEventListener('click', (e) => {
      e.preventDefault();
      if (!GAME.nearPatient) return;
      if (document.pointerLockElement) document.exitPointerLock();
      UI.openConsult(GAME.nearPatient);
    });
  }
}

// 조작판을 놓쳤을 때 키가 눌린 채로 남지 않도록 정리한다
function releaseScreenPad() {
  GAME.turn = 0; GAME.look = 0;
  ['KeyW', 'KeyA', 'KeyS', 'KeyD'].forEach((k) => { GAME.keys[k] = false; });
  const pad = document.getElementById('screen-pad');
  if (pad) pad.querySelectorAll('.on').forEach((b) => b.classList.remove('on'));
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
  const padBtn = document.getElementById('pad-interact');
  if (padBtn) padBtn.classList.toggle('ready', !!best);
  const prompt = document.getElementById('hud-prompt');
  // 포인터 잠금 여부와 무관하게 띄운다 — 화면 조작판으로만 다니는 경우에도
  // 지금 누구 앞에 서 있는지 알려줘야 E 버튼을 누를 수 있다.
  if (best) {
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

  if (modal) {
    releaseScreenPad();
  } else {
    // 포인터 잠금 없이도 이동한다 — 화면 조작판만 쓰는 학생도 있기 때문이다.
    if (GAME.turn) GAME.yaw -= GAME.turn * GAME.turnSpeed * dt;
    if (GAME.look) {
      GAME.pitch += GAME.look * GAME.turnSpeed * 0.6 * dt;
      GAME.pitch = Math.max(-1.2, Math.min(1.2, GAME.pitch));
    }
    movePlayer(dt);
  }
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
