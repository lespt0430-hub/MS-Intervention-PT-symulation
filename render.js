// render.js — 렌더링 파이프라인 (Three.js r185)
// 역할 분담: render.js = 빛·재질·화질, game.js = 방 구조·장비·환자 배치
//
// r128 대비 달라진 핵심
//  1) 색관리: outputColorSpace + 색상맵마다 colorSpace 지정 (안 하면 색이 물 빠져 보임)
//  2) 환경광: RoomEnvironment를 PMREM으로 구워 scene.environment 로 넣는다.
//     이게 없으면 metalness/roughness가 반사할 대상이 없어 전부 무광 플라스틱이 된다.
//  3) 절차적 PBR: 외부 파일 없이 캔버스에서 노멀맵·러프니스맵을 만들어 표면 요철을 살린다.

const RENDER = {
  quality: 'auto',     // auto | low | medium | high
  tier: 'low',         // 실제 적용된 등급
  q: null,             // 현재 프리셋 값
  composer: null,
  sun: null,
  ceilingLights: [],
  fill: null,
  maxAniso: 4,
  _envRT: null,
  _fps: { frames: 0, t0: 0, avg: 60, downgrades: 0 },
};

// ── 화질 프리셋 ──────────────────────────────────────────────
// 내장 그래픽(사무용 PC)이 기본 타깃이므로 low가 실사용 기준선이다.
// PBR 맵·환경광·색관리는 모든 등급에 적용한다 — 런타임 비용이 거의 없고
// "올드해 보임"을 없애는 효과의 대부분이 여기서 나온다.
// 등급에 따라 달라지는 것은 해상도·그림자·광원 종류·후처리뿐이다.
// 조명 방침을 바꿨다 — 예전에는 천장 등기구 6~10개가 방을 밝히고 환경광은
// 거들기만 했다. 광원 하나하나가 모든 픽셀에 계산되므로 그게 곧 프레임 저하였고,
// 광원이 점점이 박혀 있으니 밝은 얼룩과 어두운 구석이 번갈아 생겨
// 오래된 게임 화면처럼 보였다.
//
// 지금은 반대다. 밝고 고른 스튜디오 환경광(IBL)이 조명의 대부분을 맡는다.
// 환경광은 광원 수와 무관하게 큐브맵 조회 한 번이라 사실상 공짜이고,
// 사방에서 오는 빛이라 그림자 경계가 부드럽다. 직접광은 형태를 잡아 줄
// 만큼만 약하게 남긴다. 가벼워지면서 동시에 부드러워진다.
RENDER.PRESETS = {
  low: {
    pixelRatio: 1, shadow: 1024,
    ceilingCount: 3, ceilingIntensity: 1.8,
    hemi: 0.26, sun: 0.34, envIntensity: 0.68,
    post: false, aniso: 4, reflect: 0,
  },
  medium: {
    pixelRatio: 1, shadow: 1536,
    ceilingCount: 5, ceilingIntensity: 1.7,
    hemi: 0.25, sun: 0.36, envIntensity: 0.72,
    post: false, aniso: 8, reflect: 0,
  },
  high: {
    pixelRatio: 1.25, shadow: 2048,
    ceilingCount: 7, ceilingIntensity: 1.6,
    hemi: 0.24, sun: 0.38, envIntensity: 0.75,
    // 평면 반사(Reflector)는 장면을 통째로 한 번 더 그린다. 바닥에까지 쓰면
    // 그리는 양이 두 배가 된다 — 운동재활실 벽거울 하나에만 허용한다.
    post: 'bloom', aniso: 16, reflect: 0.9,
  },
};

// GPU 문자열로 등급을 추정한다. 확신이 없으면 낮게 잡는다 —
// 실습실 PC에서 20fps로 도는 것보다 조금 덜 화려하고 60fps로 도는 게 낫다.
RENDER.detectTier = function () {
  try {
    const cv = document.createElement('canvas');
    const gl = cv.getContext('webgl2') || cv.getContext('webgl');
    if (!gl) return 'low';
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const s = (ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : '').toLowerCase();
    if (!s) return 'low';
    if (/swiftshader|basic render|llvmpipe|software/.test(s)) return 'low';
    if (/rtx|radeon rx|radeon pro|geforce gtx|geforce rtx|quadro|arc a[0-9]/.test(s)) return 'high';
    if (/intel|uhd|iris|hd graphics|mesa|adreno|mali|powervr|apple gpu/.test(s)) return 'low';
    return 'medium';
  } catch (e) {
    return 'low';
  }
};

RENDER.resolveTier = function (pref) {
  RENDER.quality = pref || 'auto';
  RENDER.tier = (pref && pref !== 'auto') ? pref : RENDER.detectTier();
  RENDER.q = RENDER.PRESETS[RENDER.tier] || RENDER.PRESETS.low;
  return RENDER.tier;
};

// ── 렌더러 ───────────────────────────────────────────────────
RENDER.createRenderer = function (container) {
  const q = RENDER.q;
  const renderer = new THREE.WebGLRenderer({
    antialias: !q.post,          // 후처리(SMAA)를 쓰면 MSAA는 낭비다
    powerPreference: 'high-performance',
    stencil: false,
  });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, q.pixelRatio));
  renderer.shadowMap.enabled = true;
  // r185에서 PCFSoftShadowMap은 폐지되어 내부적으로 PCF로 되돌아간다
  // (콘솔에 경고만 남고 효과는 없었다). 처음부터 PCF로 지정한다.
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  // ACES Filmic — 하이라이트 롤오프가 부드러워 조명 주변이 '사진처럼' 잡힌다.
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  // 직접광을 줄이고 환경광으로 옮긴 뒤로는 예전 노출(0.72)이면 방 전체가
  // 어둡게 가라앉는다. 광원이 점점이 박혀 있지 않으니 노출을 올려도
  // 예전처럼 특정 지점만 하얗게 타지 않는다.
  renderer.toneMappingExposure = 0.85;
  container.appendChild(renderer.domElement);
  RENDER.maxAniso = Math.min(renderer.capabilities.getMaxAnisotropy(), q.aniso);
  return renderer;
};

// ── 환경광 (실내 IBL) ────────────────────────────────────────
// 조명의 대부분을 여기서 만든다. 한 번 구워 두면 광원 개수와 무관하게
// 큐브맵 조회 한 번으로 끝나므로, 등기구를 여러 개 켜는 것과 달리 공짜에 가깝다.
//
// three 내장 RoomEnvironment는 어둡고 잿빛이라 '흐린 날 사무실' 톤이 된다.
// 자동차 비주얼라이저 같은 화면은 넓은 소프트박스가 위에서 고르게 떨어지고
// 좌우에서 서로 다른 색온도가 채워 주는 스튜디오 조명이다 — 그걸 직접 짓는다.
RENDER._studioEnvScene = function () {
  const scene = new THREE.Scene();
  const box = new THREE.BoxGeometry(1, 1, 1);
  box.deleteAttribute('uv');    // PMREM에는 UV가 필요 없다

  // 바깥 껍데기 — 사방에서 되돌아오는 은은한 반사광
  const shell = new THREE.Mesh(box, new THREE.MeshStandardMaterial({
    color: 0xeceae6, roughness: 1, metalness: 0, side: THREE.BackSide,
  }));
  shell.scale.set(34, 11, 34);
  scene.add(shell);

  // 발광 패널. 색을 1보다 크게 주면 그만큼 밝은 광원이 된다
  // (three의 Color는 0~1로 잘리지 않는 실수값이다).
  const panel = (r, g, b, sx, sy, sz, x, y, z) => {
    const m = new THREE.MeshBasicMaterial();
    m.color.setRGB(r, g, b);
    const mesh = new THREE.Mesh(box, m);
    mesh.scale.set(sx, sy, sz);
    mesh.position.set(x, y, z);
    scene.add(mesh);
  };

  // 밝기 값은 실측으로 잡았다. 처음에 천장을 3.4로 두었더니 벽·바닥·시트가
  // 전부 하얗게 타서 커튼 주름도 명패 글자도 사라졌다 — 이 방은 흰 면이
  // 대부분이라 환경광이 조금만 세도 통째로 날아간다.
  //
  // 천장 전체를 덮는 대형 소프트박스 — 그림자를 부드럽게 만드는 주역
  panel(1.70, 1.70, 1.75, 30, 0.4, 30, 0, 5.2, 0);
  // 창 쪽(-x)에서 들어오는 시원한 낮빛
  panel(1.30, 1.45, 1.70, 0.4, 6, 22, -15, 2.0, 0);
  // 반대편(+x)은 벽에서 되돌아오는 따뜻한 반사광 — 좌우 색온도가 갈려야
  // 물체에 입체감이 생긴다. 양쪽을 같은 색으로 두면 평평해 보인다.
  panel(1.10, 0.95, 0.80, 0.4, 5, 20, 15, 1.6, 0);
  // 앞뒤로도 약하게 채워 어느 방향을 봐도 어두운 면이 생기지 않게
  panel(0.75, 0.75, 0.80, 20, 4, 0.4, 0, 1.8, -15);
  panel(0.75, 0.75, 0.80, 20, 4, 0.4, 0, 1.8, 15);

  return scene;
};

RENDER.buildEnvironment = function (renderer, scene) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = RENDER._studioEnvScene();
  RENDER._envRT = pmrem.fromScene(envScene, 0.04);
  scene.environment = RENDER._envRT.texture;
  scene.environmentIntensity = RENDER.q.envIntensity;
  envScene.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) o.material.dispose();
  });
  pmrem.dispose();
};

// ── 조명 ─────────────────────────────────────────────────────
// 실제 물리치료실은 천장 형광등이 주광원이고 창은 보조광이다.
// r128 버전은 반대(태양 위주)여서 실내 같지 않았다.
RENDER.buildLights = function (scene, room) {
  const q = RENDER.q;
  RENDER.ceilingLights = [];

  // 바닥 반사 + 하늘광 채움.
  // 아랫빛을 따뜻하게(리놀륨 바닥에서 튀어오르는 빛) 두면 위아래 색온도가 갈려
  // 단조로운 흰 실내에 깊이가 생긴다.
  const hemi = new THREE.HemisphereLight(0xe8f2fc, 0xd6c9b4, q.hemi);
  scene.add(hemi);
  RENDER.fill = hemi;

  // 창으로 들어오는 낮빛 — 방향성 그림자로 물체를 바닥에 붙여준다
  const sun = new THREE.DirectionalLight(0xffeedd, q.sun);
  sun.position.set(7, 8, 7);
  sun.castShadow = true;
  sun.shadow.mapSize.set(q.shadow, q.shadow);
  // 그림자 카메라를 방 크기에 딱 맞춘다. r128 버전은 32×32m를 덮어서
  // 텍셀이 낭비되고 그림자가 뭉개졌다. 같은 비용으로 해상도가 2배 이상 올라간다.
  const sc = sun.shadow.camera;
  sc.left = -room.w / 2 - 1; sc.right = room.w / 2 + 1;
  sc.top = room.d / 2 + 1; sc.bottom = -room.d / 2 - 1;
  sc.near = 0.5; sc.far = 30;
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.02;
  sun.target.position.set(0, 0, 0);
  scene.add(sun.target);
  scene.add(sun);
  RENDER.sun = sun;

  // 예전에 있던 반대쪽 채움광은 뺐다. 스튜디오 환경광이 사방에서 들어오므로
  // 태양을 등진 면도 이미 채워진다 — 광원 하나를 줄인 만큼 그냥 빨라진다.
  RENDER.fillSun = null;

  RENDER._addCeilingLights(scene, room);
};

// 등기구 자리는 공간 모듈(rooms/kit.js)의 GAME.ZONE.lights가 정한다.
// 벽으로 막힌 세 실을 각각 밝혀야 하므로 예전처럼 중앙 한 줄로는 안 된다.
// 목록의 3번째 값은 우선순위(0=모든 등급, 1=보통 이상, 2=높음)이고,
// 화질 등급이 낮을수록 우선순위가 높은 것부터 q.ceilingCount개만 켠다.
// 우선순위 0인 자리만으로도 세 실이 모두 커버되도록 배치해 두었다.
RENDER._addCeilingLights = function (scene, room) {
  const q = RENDER.q;
  const all = (window.GAME && GAME.ZONE && GAME.ZONE.lights) ? GAME.ZONE.lights : [[-8, 0], [0, 0], [8, 0]];
  const sorted = all.slice().sort((a, b) => (a[2] || 0) - (b[2] || 0));
  const list = sorted.slice(0, Math.min(q.ceilingCount, sorted.length));

  // 면광원(RectAreaLight)은 뺐다. 픽셀마다 LTC 적분을 도는 비싼 광원이라
  // 몇 개만 켜도 프레임이 눈에 띄게 떨어지는데, 밝고 고른 환경광을 깐 지금은
  // 눈에 보이는 차이가 거의 없다. 등기구는 '그 자리가 조금 더 밝다'는
  // 신호만 주면 충분하다.
  //
  // 감쇠(decay)를 물리값 2보다 낮춰 낙차를 완만하게 두면, 광원 수가 적어도
  // 빛이 넓게 퍼져 바닥에 밝은 점이 도드라지지 않는다.
  list.forEach(([x, z]) => {
    const light = new THREE.PointLight(0xf6f9ff, q.ceilingIntensity, 22, 1.35);
    light.position.set(x, room.h - 0.55, z);
    scene.add(light);
    RENDER.ceilingLights.push(light);
  });
};

// ── 절차적 PBR: 캔버스 → 노멀맵 ──────────────────────────────
// 밝기를 높이로 보고 Sobel 필터로 기울기를 구한다.
// OpenGL(three) 탄젠트 규약: R=+U, G=+V(위쪽). 캔버스 y는 아래로 증가하므로
// G는 "아래줄 - 위줄"이 되어야 홈이 홈으로, 돌기가 돌기로 보인다.
RENDER.normalMapFrom = function (srcCv, strength) {
  const w = srcCv.width, h = srcCv.height;
  const src = srcCv.getContext('2d').getImageData(0, 0, w, h).data;
  const lum = new Float32Array(w * h);
  for (let i = 0, p = 0; i < lum.length; i++, p += 4) {
    lum[i] = (src[p] * 0.299 + src[p + 1] * 0.587 + src[p + 2] * 0.114) / 255;
  }
  // 타일링 텍스처이므로 경계를 감싸서 읽는다 (이음선 방지)
  const at = (x, y) => lum[((y % h) + h) % h * w + (((x % w) + w) % w)];

  const out = document.createElement('canvas');
  out.width = w; out.height = h;
  const octx = out.getContext('2d');
  const dst = octx.createImageData(w, h);
  const d = dst.data;
  const k = strength === undefined ? 2.0 : strength;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const tl = at(x - 1, y - 1), tc = at(x, y - 1), tr = at(x + 1, y - 1);
      const ml = at(x - 1, y),                        mr = at(x + 1, y);
      const bl = at(x - 1, y + 1), bc = at(x, y + 1), br = at(x + 1, y + 1);
      const gx = (tl + 2 * ml + bl) - (tr + 2 * mr + br);   // = h(좌) - h(우) = -dh/du
      const gy = (bl + 2 * bc + br) - (tl + 2 * tc + tr);   // = h(아래) - h(위) = -dh/dv
      const nx = gx * k, ny = gy * k, nz = 1;
      const len = Math.sqrt(nx * nx + ny * ny + 1);
      const o = (y * w + x) * 4;
      d[o]     = (nx / len * 0.5 + 0.5) * 255;
      d[o + 1] = (ny / len * 0.5 + 0.5) * 255;
      d[o + 2] = (nz / len * 0.5 + 0.5) * 255;
      d[o + 3] = 255;
    }
  }
  octx.putImageData(dst, 0, 0);
  const t = new THREE.CanvasTexture(out);
  t.colorSpace = THREE.NoColorSpace;   // 데이터 텍스처 — sRGB 변환하면 안 된다
  return t;
};

// 밝기 → 거칠기 변환. 홈·이음선은 거칠고(무광), 매끈한 면은 광이 난다.
RENDER.roughMapFrom = function (srcCv, opt) {
  const o = opt || {};
  const base = o.base === undefined ? 0.5 : o.base;   // 밝은 부분의 거칠기
  const dark = o.dark === undefined ? 0.9 : o.dark;   // 어두운(홈) 부분의 거칠기
  const w = srcCv.width, h = srcCv.height;
  const src = srcCv.getContext('2d').getImageData(0, 0, w, h).data;
  const out = document.createElement('canvas');
  out.width = w; out.height = h;
  const octx = out.getContext('2d');
  const dst = octx.createImageData(w, h);
  const d = dst.data;
  for (let i = 0, p = 0; p < src.length; i++, p += 4) {
    const l = (src[p] * 0.299 + src[p + 1] * 0.587 + src[p + 2] * 0.114) / 255;
    const r = dark + (base - dark) * l;
    const v = Math.max(0, Math.min(255, r * 255));
    d[p] = d[p + 1] = d[p + 2] = v; d[p + 3] = 255;
  }
  octx.putImageData(dst, 0, 0);
  const t = new THREE.CanvasTexture(out);
  t.colorSpace = THREE.NoColorSpace;
  return t;
};

// 색상맵 등록 — 색공간·필터·이방성을 한 곳에서 처리한다
RENDER.colorTex = function (cv, repeatX, repeatY) {
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = RENDER.maxAniso;
  if (repeatX || repeatY) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeatX || 1, repeatY || 1);
  }
  return t;
};

/**
 * 하나의 그림 함수로 색상·노멀·러프니스 3종 맵을 갖춘 재질을 만든다.
 * @param draw   (ctx, size) => void            색상 캔버스를 그린다
 * @param opt    { size, height, repeat, rough, normalStrength, ...matProps }
 *               height: (ctx, size) => void    별도 높이 캔버스 (없으면 색상 캔버스 재사용)
 */
RENDER.pbrMaterial = function (draw, opt) {
  const o = opt || {};
  const w = o.size ? o.size[0] : 512;
  const h = o.size ? o.size[1] : w;

  // 이 캔버스들은 나중에 getImageData로 다시 읽으므로 willReadFrequently가 필요하다
  const readable = () => {
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    return cv;
  };
  const albedoCv = readable();
  draw(albedoCv.getContext('2d', { willReadFrequently: true }), w, h);

  let heightCv = albedoCv;
  if (o.height) {
    heightCv = readable();
    o.height(heightCv.getContext('2d', { willReadFrequently: true }), w, h);
  }

  const rx = o.repeat ? o.repeat[0] : 1;
  const ry = o.repeat ? o.repeat[1] : 1;
  const map = RENDER.colorTex(albedoCv, rx, ry);
  const normalMap = RENDER.normalMapFrom(heightCv, o.normalStrength);
  const roughnessMap = RENDER.roughMapFrom(heightCv, o.rough);

  [normalMap, roughnessMap].forEach((t) => {
    t.anisotropy = RENDER.maxAniso;
    if (rx !== 1 || ry !== 1) {
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(rx, ry);
    }
  });

  const props = {
    map, normalMap, roughnessMap,
    normalScale: new THREE.Vector2(o.normalScale || 1, o.normalScale || 1),
    metalness: o.metalness === undefined ? 0 : o.metalness,
    envMapIntensity: o.envMapIntensity === undefined ? 1 : o.envMapIntensity,
  };
  if (o.side) props.side = o.side;
  if (o.color !== undefined) props.color = o.color;
  return new THREE.MeshStandardMaterial(props);
};

// ── 접지 그림자 데칼 ─────────────────────────────────────────
// 그림자맵은 직사광 그림자만 만든다. 물체가 바닥에 "닿아 있다"는 느낌을 주는
// 주변광 차폐(AO)는 별도다. 저사양에서 SSAO를 못 쓰므로 데칼로 대신한다.
RENDER._aoTex = null;
RENDER.aoTexture = function () {
  if (RENDER._aoTex) return RENDER._aoTex;
  const S = 128;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d');
  const grad = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  grad.addColorStop(0.00, 'rgba(0,0,0,0.55)');
  grad.addColorStop(0.45, 'rgba(0,0,0,0.30)');
  grad.addColorStop(0.75, 'rgba(0,0,0,0.09)');
  grad.addColorStop(1.00, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, S, S);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  RENDER._aoTex = t;
  return t;
};

RENDER._aoMat = null;
RENDER.aoDecal = function (scene, cx, cz, hw, hd, y) {
  if (!RENDER._aoMat) {
    RENDER._aoMat = new THREE.MeshBasicMaterial({
      map: RENDER.aoTexture(),
      transparent: true,
      depthWrite: false,
      toneMapped: false,
    });
  }
  const m = new THREE.Mesh(new THREE.PlaneGeometry(hw * 2.9, hd * 2.9), RENDER._aoMat);
  m.rotation.x = -Math.PI / 2;
  m.position.set(cx, y === undefined ? 0.008 : y, cz);
  m.renderOrder = 1;      // 바닥·매트 위에 확실히 얹는다
  scene.add(m);
  return m;
};

// ── 바닥 반사 ────────────────────────────────────────────────
// 참고 사진의 재활치료실 바닥은 폴리싱 에폭시라 천장 조명과 장비가 그대로
// 비친다. 환경맵만으로는 이 반사가 안 나온다 — 환경맵은 방 전체를 뭉뚱그린
// 저해상도 큐브라 "무엇이 비치는지"를 표현하지 못하기 때문이다.
// 그래서 높음 등급에서만 실제 평면 반사(장면을 한 번 더 그려 뒤집어 붙임)를 켠다.
//
// 그대로 쓰면 거울이 되어 버리므로 두 가지를 손본다:
//  1) 알파로 흐리게 얹어 바닥 재질(얼룩·이음선)이 비쳐 보이게 한다
//  2) 프레넬 — 바닥을 비스듬히 볼수록 반사가 강해진다. 실제 광택면의 성질이고,
//     이게 없으면 발밑까지 똑같이 비쳐서 물웅덩이처럼 보인다.
// 바닥 평면반사는 없앴다.
//
// Reflector는 반사면마다 장면을 통째로 한 번 더 그린다. 26×19m 바닥 전체에
// 걸면 매 프레임 그리는 양이 두 배가 되고, 그게 '너무 무거워서 버벅인다'의
// 가장 큰 원인이었다. 얻는 것은 바닥에 흐릿하게 비치는 형상뿐이다.
//
// 대신 바닥 재질의 거칠기를 낮춰 환경광이 비치게 했다(rooms/layout.js).
// 밝은 스튜디오 환경광이 깔려 있으면 그것만으로 '광택 있는 병원 바닥'이 되고,
// 비용은 픽셀당 큐브맵 조회 한 번이라 사실상 0이다.
RENDER.floorReflector = null;
RENDER.buildFloorReflection = function () { return null; };

RENDER._legacyFloorReflection = function (scene, room) {
  const strength = RENDER.q.reflect || 0;
  if (!strength || !window.TX || !TX.Reflector) return null;

  const shader = {
    name: 'FloorGlossReflection',
    uniforms: {
      color: { value: null },
      tDiffuse: { value: null },
      textureMatrix: { value: null },
      strength: { value: strength },
    },
    vertexShader: [
      'uniform mat4 textureMatrix;',
      'varying vec4 vUv;',
      'varying vec3 vWorld;',
      'void main() {',
      '  vUv = textureMatrix * vec4( position, 1.0 );',
      '  vec4 wp = modelMatrix * vec4( position, 1.0 );',
      '  vWorld = wp.xyz;',
      '  gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );',
      '}',
    ].join('\n'),
    fragmentShader: [
      'uniform vec3 color;',
      'uniform sampler2D tDiffuse;',
      'uniform float strength;',
      'varying vec4 vUv;',
      'varying vec3 vWorld;',
      'void main() {',
      '  vec3 V = normalize( cameraPosition - vWorld );',
      // 바닥 법선은 +Y. 시선이 수평에 가까울수록(V.y가 0에 가까울수록) 반사가 세다
      '  float fres = pow( 1.0 - clamp( V.y, 0.0, 1.0 ), 4.0 );',
      // 스치는 각도에서 반사를 100%까지 올리면 먼 바닥이 천장 형광등을 그대로
      // 비춰서 통로가 하얗게 타 버린다. 상한을 0.62로 눌러 광택만 남긴다.
      '  float a = strength * mix( 0.12, 0.62, fres );',
      '  vec4 base = texture2DProj( tDiffuse, vUv );',
      '  gl_FragColor = vec4( base.rgb * color, a );',
      '  #include <tonemapping_fragment>',
      '  #include <colorspace_fragment>',
      '}',
    ].join('\n'),
  };

  // 반사는 흐릿하게 깔리는 것이라 원본 해상도가 필요 없다.
  // 절반 해상도면 눈에 띄는 차이 없이 픽셀 수가 1/4로 줄어든다.
  const w = Math.max(256, Math.round(window.innerWidth * 0.5));
  const h = Math.max(256, Math.round(window.innerHeight * 0.5));
  const refl = new TX.Reflector(new THREE.PlaneGeometry(room.w, room.d), {
    textureWidth: w, textureHeight: h, clipBias: 0.004,
    color: 0xdfe4e2, shader: shader,
  });
  refl.rotation.x = -Math.PI / 2;
  refl.position.y = 0.002;
  refl.material.transparent = true;
  refl.material.depthWrite = false;
  refl.renderOrder = -1;      // 바닥 위, 나머지 물체보다 먼저
  scene.add(refl);
  RENDER.floorReflector = refl;
  return refl;
};

// 운동재활실 벽거울. 바닥과 달리 프레넬을 쓰지 않는다 — 거울은 어느 각도에서
// 보든 똑같이 비치는 게 맞고, 여기서 세기를 낮추면 유리가 뿌옇게 보인다.
RENDER.wallMirrors = [];
RENDER.buildWallMirror = function (scene, width, height, x, y, z, yaw) {
  if (!RENDER.q.reflect || !window.TX || !TX.Reflector) return null;
  const w = Math.max(256, Math.round(window.innerWidth * 0.5));
  const h = Math.max(256, Math.round(window.innerHeight * 0.5));
  const m = new TX.Reflector(new THREE.PlaneGeometry(width, height), {
    textureWidth: w, textureHeight: h, clipBias: 0.004, color: 0xd6dee2,
  });
  m.position.set(x, y, z);
  m.rotation.y = yaw === undefined ? Math.PI / 2 : yaw;   // 법선이 방 안쪽을 봐야 한다
  scene.add(m);
  RENDER.wallMirrors.push(m);
  return m;
};

// ── 후처리 ───────────────────────────────────────────────────
RENDER.buildComposer = function (renderer, scene, camera) {
  const q = RENDER.q;
  if (!q.post) { RENDER.composer = null; return null; }

  const w = window.innerWidth, h = window.innerHeight;
  const composer = new TX.EffectComposer(renderer);
  composer.addPass(new TX.RenderPass(scene, camera));

  // GTAO는 뺐다. 픽셀마다 표본 16개를 도는 비싼 패스인데, 이미 접촉면마다
  // 구워 둔 그림자 데칼(RENDER.aoDecal)이 같은 역할을 공짜로 하고 있었다.
  // 둘을 겹쳐 놓으니 가구 밑이 필요 이상으로 시커멓기까지 했다.
  if (q.post === 'bloom') {
    // 형광등 패널·창을 은은하게 번지게.
    // 임계값은 톤매핑 前 선형 HDR 값 기준이다. 낮게 두면 조명을 정면으로 받는
    // 흰 명패·시트까지 광원으로 오인해 글자가 날아간다.
    const bloom = new TX.UnrealBloomPass(new THREE.Vector2(w, h), 0.12, 0.6, 1.4);
    composer.addPass(bloom);
    RENDER.bloom = bloom;
  }

  composer.addPass(new TX.SMAAPass());
  // 톤매핑·sRGB 변환은 여기서 한 번만. (렌더타깃에 그릴 때는 셰이더가
  //  톤매핑을 적용하지 않으므로 이중 적용이 아니다)
  composer.addPass(new TX.OutputPass());
  RENDER.composer = composer;
  return composer;
};

RENDER.setSize = function (renderer, camera) {
  const w = window.innerWidth, h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  if (RENDER.composer) RENDER.composer.setSize(w, h);
};

RENDER.render = function (renderer, scene, camera) {
  if (RENDER.composer) RENDER.composer.render();
  else renderer.render(scene, camera);
};

// ── 성능 감시: 느리면 자동으로 한 단계 내린다 ────────────────
// 자동(auto) 모드에서만 동작한다. 교수가 화질을 직접 고정했으면 건드리지 않는다.
// 올리는 방향으로는 절대 바꾸지 않는다 — 오르내리며 깜빡이는 게 더 나쁘다.
RENDER.tickPerf = function (renderer, scene, camera) {
  if (RENDER.quality !== 'auto' || RENDER._fps.downgrades >= 2) return;
  const f = RENDER._fps;
  const now = performance.now();
  if (!f.t0) { f.t0 = now; f.frames = 0; return; }
  f.frames++;
  const dt = now - f.t0;
  if (dt < 3000) return;                    // 3초 창으로 평균을 낸다
  f.avg = (f.frames * 1000) / dt;
  f.t0 = now; f.frames = 0;
  if (f.avg >= 38) return;

  const next = RENDER.tier === 'high' ? 'medium' : (RENDER.tier === 'medium' ? 'low' : null);
  if (!next) return;
  f.downgrades++;
  RENDER._applyTierDowngrade(next, renderer, scene, camera);
};

RENDER._applyTierDowngrade = function (tier, renderer, scene, camera) {
  RENDER.tier = tier;
  const q = RENDER.q = RENDER.PRESETS[tier];

  renderer.setPixelRatio(Math.min(window.devicePixelRatio, q.pixelRatio));

  if (RENDER.sun) {
    const sh = RENDER.sun.shadow;
    if (sh.map) { sh.map.dispose(); sh.map = null; }
    sh.mapSize.set(q.shadow, q.shadow);
    RENDER.sun.intensity = q.sun;
  }
  if (RENDER.fill) RENDER.fill.intensity = q.hemi;
  scene.environmentIntensity = q.envIntensity;

  // 천장 조명 교체 (면광원 → 점광원)
  RENDER.ceilingLights.forEach((l) => { scene.remove(l); if (l.dispose) l.dispose(); });
  RENDER.ceilingLights = [];
  RENDER._addCeilingLights(scene, GAME.ROOM);

  // 평면 반사 — 장면을 한 번 더 그리는 비용이라 등급을 내릴 때 가장 먼저 끈다.
  // 거울은 없애면 벽에 구멍이 나므로 무광 유리 재질로 갈아끼운다.
  if (!q.reflect) {
    if (RENDER.floorReflector) {
      scene.remove(RENDER.floorReflector);
      if (RENDER.floorReflector.dispose) RENDER.floorReflector.dispose();
      RENDER.floorReflector = null;
    }
    RENDER.wallMirrors.forEach((m) => {
      // 반사를 끄면 금속면이 반사할 환경이 어두워 거울이 검게 죽는다.
      // 밝은 유리면(약한 자체발광)으로 갈아끼워야 거울처럼 보인다.
      const dull = new THREE.MeshStandardMaterial({
        color: 0xcfdae1, metalness: 0.45, roughness: 0.10, envMapIntensity: 2.6,
        emissive: 0x3d4b55, emissiveIntensity: 0.45,
      });
      if (m.dispose) m.dispose();
      m.material = dull;
      m.onBeforeRender = function () {};   // Reflector의 렌더 타깃 갱신 중단
    });
    RENDER.wallMirrors = [];
  }

  // 후처리 체인 재구성
  if (RENDER.composer) { RENDER.composer.dispose(); RENDER.composer = null; }
  RENDER.buildComposer(renderer, scene, camera);

  if (typeof UI !== 'undefined' && UI.notifyQuality) UI.notifyQuality(tier, RENDER._fps.avg);
};

RENDER.stats = function () {
  return { tier: RENDER.tier, pref: RENDER.quality, fps: Math.round(RENDER._fps.avg) };
};

window.RENDER = RENDER;
