// humans.js — 리깅된 인체 모델(.glb)을 불러와 자세를 입힌다
//
// 기존 buildPatientFigure(game.js)는 캡슐·구를 조립해 사람을 만들고, 자세는
// 각 마디를 직접 배치해 냈다. 여기서는 MakeHuman으로 만든 .glb 한 벌을
// 불러와 뼈를 돌려 같은 자세를 만든다.
//
//   왜 바꾸는가 — 1인당 메시 33개 → 5개. 저사양 PC에서 먼저 막히는 것은
//   삼각형이 아니라 드로우콜이라, 인물 24명이면 드로우콜이 700개 넘게 줄어든다.
//   (측정값은 test/probe-figure-cost.mjs · test/probe-crowd.mjs 참고)
//
// 배치 규약은 buildPatientFigure 와 똑같이 맞춘다. 호출부(rooms/*.js)를
// 고치지 않아도 되도록:
//   - 누운 사람: 원점이 베개, 발끝이 +z, 등이 y=0 에 닿는다
//   - 선 사람 : 원점이 발바닥, y=0 이 바닥
//
// 담요·목베개·얼음팩 같은 질환별 소품은 사람이 아니라 침대 위의 물건이라
// game.js 의 buildPatientProps 를 그대로 불러 쓴다 (인형과 공용).
//
// 모델을 못 불러오면 예전 인형으로 되돌아간다. 수업 중에 3D가 통째로
// 안 뜨는 것보다는 인형이라도 나오는 편이 낫다.

const HUMANS = {
  enabled: true,      // false 면 전부 예전 인형으로
  models: {},         // id -> THREE.Group (원본, 복제해서 쓴다)
  loaded: false,
  missing: [],
};

// 환자 12명 + 치료사 4명. tools/roster.json 과 같은 id 를 쓴다.
HUMANS.IDS = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8', 'p9', 'p10', 'p11', 'p12',
  'staff_m', 'staff_m2', 'staff_f', 'staff_f2'];

// 치료사는 열두 자리에 서는데 모델이 둘뿐이라 어디를 봐도 같은 사람이었다.
// 남2·여2 를 번갈아 쓴다.
HUMANS.STAFF = ['staff_m', 'staff_f', 'staff_m2', 'staff_f2'];

HUMANS.path = (id) => 'assets/humans/' + id + '.glb';

// ── 불러오기 ────────────────────────────────────────────────
// 장면은 동기로 지어지는데 .glb 는 비동기로 온다. 장면을 짓는 도중에
// 기다릴 수는 없으니, 입장 버튼을 누른 뒤 로딩 화면에서 전부 받아 놓고
// 그 다음에 initGame() 을 부른다.
HUMANS.preload = function (onProgress) {
  if (!HUMANS.enabled || !window.TX || !TX.GLTFLoader) {
    HUMANS.loaded = false;
    return Promise.resolve(false);
  }
  const loader = new TX.GLTFLoader();
  let done = 0;
  const one = (id) => new Promise((resolve) => {
    loader.load(HUMANS.path(id),
      (gltf) => {
        gltf.scene.traverse((o) => {
          if (!o.isMesh) return;
          o.castShadow = true;
          o.receiveShadow = true;
          // 스킨드 메시는 뼈가 움직이면 경계상자가 실제와 어긋나, 화면 안에
          // 있는데도 컬링으로 사라지는 일이 생긴다.
          o.frustumCulled = false;
        });
        HUMANS.models[id] = gltf.scene;
        resolve(true);
      },
      undefined,
      () => { HUMANS.missing.push(id); resolve(false); });
  }).then((ok) => {
    done += 1;
    if (onProgress) onProgress(done, HUMANS.IDS.length);
    return ok;
  });

  return Promise.all(HUMANS.IDS.map(one)).then((res) => {
    HUMANS.loaded = res.some(Boolean);
    if (HUMANS.missing.length) {
      console.warn('[humans] 못 불러온 모델:', HUMANS.missing.join(', '));
    }
    return HUMANS.loaded;
  });
};

HUMANS.has = (id) => !!HUMANS.models[id];

// ── 뼈 찾기 ────────────────────────────────────────────────
// 내보내기 과정에서 'mixamorig:Hips' 의 콜론이 빠져 'mixamorigHips' 가 된다.
// 다른 출처의 모델은 콜론이 남아 있기도 해서, 접미사로 찾는다.
function boneOf(root, suffix) {
  let found = null;
  root.traverse((o) => {
    if (found || !o.isBone) return;
    if (o.name === suffix || o.name.endsWith(suffix)) found = o;
  });
  return found;
}

function collectBones(root) {
  const want = ['Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head',
    'LeftShoulder', 'LeftArm', 'LeftForeArm', 'LeftHand',
    'RightShoulder', 'RightArm', 'RightForeArm', 'RightHand',
    'LeftUpLeg', 'LeftLeg', 'LeftFoot',
    'RightUpLeg', 'RightLeg', 'RightFoot'];
  const b = {};
  want.forEach((n) => { b[n] = boneOf(root, n); });
  return b;
}

// ── 팔 자세 ────────────────────────────────────────────────
// game.js 의 자세표는 팔을 이름으로 부른다('neck','belly','knee'…).
// 여기서는 그 이름을 '손이 가야 할 자리'로 옮기고, 어깨·팔꿈치를 그 자리에
// 닿도록 푼다(2뼈 IK).
//
// 처음에는 어깨·팔꿈치의 오일러 각을 손으로 맞췄다. 그게 왜 안 되는지:
//
//   1) 각의 뜻이 뼈마다 다르다. 팔꿈치의 회전축은 어깨를 돌리면 같이 딸려
//      돌아서, "팔을 붙이고 팔꿈치를 굽힌다"가 손을 배가 아니라 등 뒤로 보냈다.
//   2) 앞뒤 오차가 정면 사진에서는 안 보인다. 정면에서 팔이 몸에 붙어 보이길래
//      맞았다고 봤는데, 그 팔은 앞으로 45° 들려 있었다. 그 사람을 눕히자
//      팔이 천장을 향해 솟았다 (test/shots/h1-캐릭터0.png).
//
// 손이 놓일 자리는 뼈에서 직접 읽는다. 사람마다 키·팔 길이가 다르므로
// 숫자를 고정하면 어떤 사람은 배를 짚고 어떤 사람은 허공을 짚는다.
//
// 좌표계는 '서 있는 모델'의 것이다 — +y 머리, +z 얼굴이 보는 앞쪽,
// +x 는 모델의 왼쪽. 눕히기 전에 자세를 다 입히므로 누운 환자에도 그대로 통한다.
//
// sx = +1 이면 왼팔, -1 이면 오른팔.
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const at = (o) => (o ? o.getWorldPosition(new THREE.Vector3()) : new THREE.Vector3());

const ARM_TARGETS = {
  // 몸 옆에 늘어뜨림 — 손이 허벅지 바깥에 닿는다
  side:    (P, sx) => P.hip.clone().add(V(sx * 0.20, -0.12, 0.03)),
  hang:    (P, sx) => P.hip.clone().add(V(sx * 0.20, -0.14, 0.03)),
  // 배 위에 손을 얹음. 몸 표면보다 조금 앞(+z)이라야 손이 배에 파묻히지 않는다
  belly:   (P, sx) => P.belly.clone().add(V(sx * 0.05, -0.02, 0.16)),
  // 아픈 목을 감쌈
  neck:    (P, sx) => P.neck.clone().add(V(sx * 0.07, -0.03, 0.11)),
  // 사타구니·고관절 앞
  hip:     (P, sx) => P.hip.clone().add(V(sx * 0.12, 0.03, 0.14)),
  // 세운 무릎을 잡음 — 같은 쪽 무릎 뼈에서 읽는다
  knee:    (P, sx) => (sx > 0 ? P.kneeL : P.kneeR).clone().add(V(0, 0.06, 0.10)),
  // 앉은 사람이 무릎 위에 손을 얹음
  lap:     (P, sx) => P.hip.clone().lerp(sx > 0 ? P.kneeL : P.kneeR, 0.65).add(V(0, 0.09, 0.02)),
  // 옆으로 웅크린 환자가 가슴 앞에 팔을 모음
  forward: (P, sx) => P.chest.clone().add(V(sx * 0.08, -0.16, 0.26)),
  // 치료사 — 환자 위로 두 손을 뻗는다. 침대 위의 환자를 만지려면 손이
  // 가슴보다 한참 아래에 있어야 한다 (상체를 숙이는 것은 lean 이 맡는다).
  reach:   (P, sx) => P.chest.clone().add(V(sx * 0.13, -0.30, 0.40)),
  // 걷는 사람의 팔 흔들기
  swingF:  (P, sx) => P.hip.clone().add(V(sx * 0.18, -0.10, 0.26)),
  swingB:  (P, sx) => P.hip.clone().add(V(sx * 0.18, -0.14, -0.22)),
};

// 자세를 잡는 데 쓰는 몸의 기준점들. 다리를 먼저 굽힌 뒤에 읽어야
// '세운 무릎을 잡는' 자세에서 손이 무릎을 따라간다.
function landmarks(bones, model) {
  model.updateMatrixWorld(true);
  return {
    neck: at(bones.Neck),
    chest: at(bones.Spine2),
    belly: at(bones.Spine),
    hip: at(bones.Hips),
    kneeR: at(bones.RightLeg),
    kneeL: at(bones.LeftLeg),
  };
}

// 뼈가 자식을 향한 방향을 target 쪽으로 돌린다.
//
// 회전축이 뼈마다 어떻게 놓여 있는지 몰라도 된다는 게 요점이다. 지금 향한
// 방향과 향해야 할 방향, 둘 사이의 최단 회전을 월드에서 구한 뒤 그것을 뼈의
// 로컬 회전으로 되돌려 넣는다.
function aim(bone, child, target) {
  if (!bone || !child) return;
  bone.updateMatrixWorld(true);
  const p = at(bone);
  const from = at(child).sub(p);
  const to = target.clone().sub(p);
  if (from.lengthSq() < 1e-10 || to.lengthSq() < 1e-10) return;
  const q = new THREE.Quaternion().setFromUnitVectors(from.normalize(), to.normalize());
  // 월드 회전 q 를 로컬에 반영: q_local' = inv(부모월드) · q · 부모월드 · q_local
  const pq = new THREE.Quaternion();
  if (bone.parent) bone.parent.getWorldQuaternion(pq);
  bone.quaternion.premultiply(pq.clone().invert().multiply(q).multiply(pq));
  bone.updateMatrixWorld(true);
}

// 어깨-팔꿈치-손 2뼈 IK.
//
// 팔꿈치가 어디로 튀어나올지는 target 만으로 정해지지 않는다(팔을 축으로
// 한 바퀴 돌 수 있다). 사람의 팔꿈치는 바깥·뒤로 빠지므로 그쪽을 힌트로 준다.
function reachArm(bones, side, target) {
  const sx = side === 'Left' ? 1 : -1;
  const up = bones[side + 'Arm'], fore = bones[side + 'ForeArm'], hand = bones[side + 'Hand'];
  if (!up || !fore || !hand) return;

  const S = at(up);
  const L1 = at(fore).distanceTo(S);
  const L2 = at(hand).distanceTo(at(fore));
  const toT = target.clone().sub(S);
  // 닿지 않는 곳을 짚으라고 하면 팔이 뽑히는 대신 쭉 뻗기만 한다
  const d = Math.min(Math.max(toT.length(), Math.abs(L1 - L2) + 1e-3), L1 + L2 - 1e-3);
  const u = toT.normalize();

  // 팔꿈치는 어깨에서 a 만큼 간 지점에서 h 만큼 옆으로 빠진다 (코사인 법칙)
  const a = (d * d + L1 * L1 - L2 * L2) / (2 * d);
  const h = Math.sqrt(Math.max(0, L1 * L1 - a * a));
  // 바깥·아래·뒤. 바깥 성분을 크게 잡았더니 앞으로 손을 뻗은 치료사의 팔꿈치가
  // 닭날개처럼 옆으로 벌어졌다 — 아래·뒤가 크고 바깥은 조금이어야 한다.
  const pole = V(sx * 0.28, -0.62, -0.73).normalize();
  const perp = pole.clone().addScaledVector(u, -pole.dot(u));
  if (perp.lengthSq() < 1e-8) perp.set(sx, 0, 0);           // 팔이 힌트와 나란하면
  perp.normalize();
  const elbow = S.clone().addScaledVector(u, a).addScaledVector(perp, h);

  aim(up, fore, elbow);
  aim(fore, hand, target);
}

// 뼈를 돌린다 — 기본 자세에 '덧붙여서'.
//
// bone.rotation.set(...) 으로 덮어쓰면 안 된다. mixamo 리그의 뼈들은 기본
// 자세에서 이미 저마다 회전값을 갖고 있어서(팔은 벌어져 있고 다리도 살짝
// 틀어져 있다), 그걸 지우면 사람이 산산조각 난 것처럼 보인다. 실제로 그렇게
// 만들었다가 치료사가 찢어진 천 조각처럼 나왔다.
//
// 기본 회전(q0)을 한 번 기억해 두고 거기에 곱한다. 뷰어(tools/viewer.html)의
// 뼈 돌려보기가 쓰는 방식과 같다.
function restOf(bone) {
  if (!bone.userData.__q0) bone.userData.__q0 = bone.quaternion.clone();
  return bone.userData.__q0;
}

function turn(bone, x, y, z) {
  if (!bone) return;
  const q0 = restOf(bone);
  const e = new THREE.Euler(x || 0, y || 0, z || 0, 'XYZ');
  bone.quaternion.copy(q0).multiply(new THREE.Quaternion().setFromEuler(e));
}

function applyArm(bones, side, poseName, marks) {
  const spot = ARM_TARGETS[poseName] || ARM_TARGETS.side;
  reachArm(bones, side, spot(marks, side === 'Left' ? 1 : -1));
}

// 소품을 놓으려면 무릎·발목이 어디로 갔는지 알아야 한다.
//
// 인형은 관절 좌표를 직접 계산해서 갖고 있었지만, 여기서는 뼈를 돌린 결과가
// 곧 관절 위치다. 자세를 다 입힌 뒤 뼈의 월드 좌표를 읽는다 — root(=out)는
// 아직 장면에 붙기 전이라 변환이 없으므로, 월드 좌표가 곧 침대 좌표다.
//
// 오른쪽/왼쪽은 모델 기준이다. 인형의 'R' 은 +x 쪽이었지만 사람 모델은 실제
// 해부학적 오른쪽(-x)이다. 자세와 소품이 같은 뼈를 보고 있으니 서로 어긋나지는
// 않는다 — 무릎을 세운 다리에 얼음팩이 올라간다.
function jointsFromBones(bones, root) {
  root.updateMatrixWorld(true);
  const j = {};
  [['R', 'Right'], ['L', 'Left']].forEach(([k, side]) => {
    const knee = at(bones[side + 'Leg']);
    const ankle = at(bones[side + 'Foot']);
    j['knee' + k] = knee;
    j['ankle' + k] = ankle;
    const d = ankle.clone().sub(knee);
    j['shankDir' + k] = d.lengthSq() > 1e-8 ? d.normalize() : new THREE.Vector3(0, 0, 1);
  });
  return j;
}

// 허리 굽힘. 양수가 앞으로 숙이는 방향이다.
// (부호는 실측했다 — 처음에 음수로 뒀더니 치료사가 뒤로 젖혔다.)
function applyLean(bones, rad) {
  turn(bones.Spine, rad * 0.40, 0, 0);
  turn(bones.Spine1, rad * 0.35, 0, 0);
  turn(bones.Spine2, rad * 0.25, 0, 0);
}

// 다리. game.js 표의 hip/knee 는 양수가 굽힘이다.
//   엉덩관절 굽힘 = UpLeg 를 +x 로
//   무릎 굽힘     = Leg 를 -x 로  (뷰어에서 실측: hip +90 / knee -90 이 앉은 자세)
function applyLeg(bones, side, spec) {
  const sign = side === 'Left' ? 1 : -1;
  turn(bones[side + 'UpLeg'], spec.hip || 0, 0, (spec.abd || 0) * sign);
  turn(bones[side + 'Leg'], -(spec.knee || 0), 0, 0);
}

// ── 만들기 ──────────────────────────────────────────────────
// opts:
//   stance  — 있으면 서 있는 사람 (STANCES 의 이름)
//   staff   — 치료사 모델 id ('staff_m' / 'staff_f')
//   poses   — 자세표 (기본은 game.js 의 PATIENT_POSES / STANCES)
HUMANS.build = function (patient, opts) {
  const o = opts || {};
  const id = o.staff || (patient && patient.id);
  const src = HUMANS.models[id];
  if (!src) return null;

  const model = TX.SkeletonUtils.clone(src);
  const bones = collectBones(model);

  // 자세표 — 누운 자세는 질환별, 선 자세는 STANCES
  // 자세표는 game.js 에 const 로 있어 window 에 붙지 않는다. 전역 스코프에서
  // 이름으로 직접 읽는다.
  const stances = (typeof STANCES !== 'undefined') ? STANCES : {};
  const lying = (typeof PATIENT_POSES !== 'undefined') ? PATIENT_POSES : {};
  const base = { roll: 0, lift: 0, legR: {}, legL: {}, armR: 'side', armL: 'side' };
  const pose = o.stance
    ? Object.assign({}, base, stances[o.stance] || {})
    : Object.assign({}, base, lying[id] || {});

  applyLeg(bones, 'Right', pose.legR || {});
  applyLeg(bones, 'Left', pose.legL || {});
  // 허리를 숙인다 — 치료사가 침대 위 환자를 만지려면 상체가 앞으로 와야 한다.
  // 한 마디에 몰아 주면 꺾인 것처럼 보여서 세 마디에 나눈다.
  if (pose.lean) applyLean(bones, pose.lean);
  // 팔은 다리 다음이다. 손이 무릎을 짚는 자세는 무릎이 어디로 갔는지부터 알아야 한다.
  const marks = landmarks(bones, model);
  applyArm(bones, 'Right', pose.armR || 'side', marks);
  applyArm(bones, 'Left', pose.armL || 'side', marks);

  if (o.stance) {
    // 앉은 사람 — 다리만 접으면 몸통은 선 키 그대로라 의자 위 40cm 에 떠 있게 된다.
    // (인형은 원점이 머리라 배치 쪽에서 높이를 내려 줬는데, 이 모델은 원점이
    //  발바닥이라 그 보정이 없다.) 골반뼈가 앉는 면에 오도록 사람을 내린다.
    if (pose.seatY) {
      model.updateMatrixWorld(true);
      const hipY = at(bones.Hips).y;
      if (hipY) model.position.y = pose.seatY - hipY;
    }

    // 선 사람 — 모델은 발바닥이 y=0 이고 얼굴이 +z 를 본다. 그대로 쓴다.
    //
    // 예전 인형도 얼굴이 +z 였고, 방 배치(rooms/*.js)의 yaw 값이 전부 그 규약에
    // 맞춰져 있다. 여기서 180° 돌렸더니 치료사 아홉 명이 일제히 환자를 등지고
    // 서서 허공에 손을 뻗었다 — 인형은 팔이 좌우 대칭이라 티가 안 났을 뿐이다.
    const g = new THREE.Group();
    g.add(model);
    return g;
  }

  // 누운 사람.
  //
  //   1) x축 -90° — 선 모델을 눕힌다. 머리가 -z, 배가 +y(천장)를 본다.
  //   2) z 로 키만큼 밀어 머리를 원점(베개)에 맞춘다.
  //   3) roll 은 몸의 긴 축(=모델의 y축) 회전이므로 눕히기 전에 건다.
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const height = size.y || 1.6;

  const roll = new THREE.Group();
  roll.rotation.y = pose.roll || 0;
  roll.add(model);

  const lay = new THREE.Group();
  lay.rotation.x = -Math.PI / 2;
  lay.add(roll);

  const out = new THREE.Group();
  // 머리 꼭대기가 베개보다 조금 안쪽에 오도록 살짝 당긴다
  lay.position.z = height - 0.10;
  // 등이 베드 면에 닿도록 띄운다.
  //
  // 처음에는 모델 bbox 의 앞뒤 두께(size.z) 절반을 썼는데, 환자복 자락이
  // 사방으로 퍼져 있어서 그 값이 몸통 두께가 아니라 치맛자락 폭이었다.
  // 환자가 베드 위에 20cm 쯤 떠 있었다. 사람 몸통 두께는 체형이 달라도
  // 크게 변하지 않으므로 고정값이 오히려 안전하다.
  lay.position.y = (pose.lift || 0) + 0.13;
  out.add(lay);

  // 질환별 소품 — 담요·목베개·무릎 받침·압박붕대·얼음팩.
  // 몸이 아니라 침대에 놓인 물건이라 roll 을 따라 돌면 안 된다. out 에 바로 건다.
  const props = pose.props || [];
  if (props.length && typeof buildPatientProps === 'function') {
    out.add(buildPatientProps(props, jointsFromBones(bones, out)));
  }
  return out;
};

window.HUMANS = HUMANS;
