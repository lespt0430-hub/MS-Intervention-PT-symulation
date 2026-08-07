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
RENDER.PRESETS = {
  low: {
    pixelRatio: 1, shadow: 1024, shadowType: 'pcf',
    ceiling: 'point', ceilingCount: 3, ceilingIntensity: 4.0,
    hemi: 0.16, sun: 0.62, envIntensity: 0.35,
    post: false, aniso: 4,
  },
  medium: {
    pixelRatio: 1, shadow: 2048, shadowType: 'pcfsoft',
    ceiling: 'area', ceilingCount: 3, ceilingIntensity: 4.5,
    hemi: 0.15, sun: 0.55, envIntensity: 0.40,
    post: 'aa', aniso: 8,
  },
  high: {
    pixelRatio: 1.5, shadow: 2048, shadowType: 'pcfsoft',
    ceiling: 'area', ceilingCount: 5, ceilingIntensity: 4.2,
    hemi: 0.14, sun: 0.55, envIntensity: 0.45,
    post: 'full', aniso: 16,
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
  renderer.shadowMap.type = q.shadowType === 'pcf' ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  // Khronos PBR Neutral: 병원 흰색이 하늘색으로 틀어지지 않고 하이라이트가 깨끗하다.
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 0.95;
  container.appendChild(renderer.domElement);
  RENDER.maxAniso = Math.min(renderer.capabilities.getMaxAnisotropy(), q.aniso);
  return renderer;
};

// ── 환경광 (실내 IBL) ────────────────────────────────────────
// RoomEnvironment는 three에 내장된 절차적 실내 환경이라 다운로드가 0바이트다.
// HDRI 파일(2~8MB)을 받지 않고도 금속·유리·거울이 살아난다.
RENDER.buildEnvironment = function (renderer, scene) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new TX.RoomEnvironment();
  RENDER._envRT = pmrem.fromScene(envScene, 0.04);
  scene.environment = RENDER._envRT.texture;
  scene.environmentIntensity = RENDER.q.envIntensity;
  envScene.dispose();
  pmrem.dispose();
};

// ── 조명 ─────────────────────────────────────────────────────
// 실제 물리치료실은 천장 형광등이 주광원이고 창은 보조광이다.
// r128 버전은 반대(태양 위주)여서 실내 같지 않았다.
RENDER.buildLights = function (scene, room) {
  const q = RENDER.q;
  RENDER.ceilingLights = [];

  // 바닥 반사 + 하늘광 채움
  const hemi = new THREE.HemisphereLight(0xeaf3fb, 0xdcd8d2, q.hemi);
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

  RENDER._addCeilingLights(scene, room);
};

RENDER._addCeilingLights = function (scene, room) {
  const q = RENDER.q;
  const step = q.ceilingCount === 5 ? 4 : 8;   // 5개면 x=-8..8 step4, 3개면 step8
  if (q.ceiling === 'area') TX.RectAreaLightUniformsLib.init();

  for (let x = -8; x <= 8; x += step) {
    let light;
    if (q.ceiling === 'area') {
      // 면광원: 형광등 패널의 넓고 부드러운 빛을 그대로 재현한다
      light = new THREE.RectAreaLight(0xf4f8ff, q.ceilingIntensity, 1.76, 0.5);
      light.position.set(x, room.h - 0.06, 0);
      light.lookAt(x, 0, 0);
    } else {
      // 저사양: 점광원이 훨씬 싸다. decay를 물리값(2)보다 낮춰 낙차를 부드럽게.
      light = new THREE.PointLight(0xf4f8ff, q.ceilingIntensity, 16, 1.7);
      light.position.set(x, room.h - 0.55, 0);
    }
    scene.add(light);
    RENDER.ceilingLights.push(light);
  }
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

// ── 후처리 ───────────────────────────────────────────────────
RENDER.buildComposer = function (renderer, scene, camera) {
  const q = RENDER.q;
  if (!q.post) { RENDER.composer = null; return null; }

  const w = window.innerWidth, h = window.innerHeight;
  const composer = new TX.EffectComposer(renderer);
  composer.addPass(new TX.RenderPass(scene, camera));

  if (q.post === 'full') {
    // GTAO: 접촉부에 실제 주변광 차폐를 넣는다 (외장 GPU 전용)
    const gtao = new TX.GTAOPass(scene, camera, w, h);
    gtao.blendIntensity = 0.8;
    gtao.updateGtaoMaterial({
      radius: 0.35, distanceExponent: 1.4, thickness: 0.5,
      scale: 1.0, samples: 8, screenSpaceRadius: false,
    });
    composer.addPass(gtao);
    RENDER.gtao = gtao;

    // 형광등 패널을 은은하게 번지게.
    // 임계값은 톤매핑 前 선형 HDR 값 기준이다. 0.92로 두면 조명을 정면으로 받는
    // 흰 명패·시트까지 광원으로 오인해 글자가 날아간다. 실제 발광체(패널
    // emissiveIntensity 2.3)만 걸리도록 1 이상으로 올린다.
    const bloom = new TX.UnrealBloomPass(new THREE.Vector2(w, h), 0.20, 0.5, 1.5);
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
  renderer.shadowMap.type = q.shadowType === 'pcf' ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;

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

  // 후처리 체인 재구성
  if (RENDER.composer) { RENDER.composer.dispose(); RENDER.composer = null; }
  RENDER.buildComposer(renderer, scene, camera);

  if (typeof UI !== 'undefined' && UI.notifyQuality) UI.notifyQuality(tier, RENDER._fps.avg);
};

RENDER.stats = function () {
  return { tier: RENDER.tier, pref: RENDER.quality, fps: Math.round(RENDER._fps.avg) };
};

window.RENDER = RENDER;
