/* Local-only visual review. No score collection, stored student state or AI API code is loaded. */
(() => {
  'use strict';
  const errors = [];
  const people = [];
  let state = '소스 로딩 중';
  let frameStats = null;
  let frames = 0;
  let measureStart = performance.now();
  let fps = 0;
  let view = '입구';
  const byId = (id) => document.getElementById(id);
  const updateErrors = () => {
    if (!byId('review-errors')) return;
    byId('review-error-title').textContent = `오류 / 경고 ${errors.length}`;
    byId('review-errors').textContent = errors.slice(-16).join('\n\n') || '없음';
  };
  const log = (kind, value) => {
    const message = `${kind}: ${value}`;
    if (!errors.includes(message)) errors.push(message);
    updateErrors();
  };
  window.addEventListener('error', (event) => {
    log('오류', event.message || `리소스 로드 실패: ${event.target?.src || event.target?.href || '알 수 없음'}`);
  }, true);
  window.addEventListener('unhandledrejection', (event) => log('Promise 오류', event.reason?.stack || event.reason));
  window.addEventListener('securitypolicyviolation', (event) => log('외부 통신 차단', event.blockedURI));
  ['error', 'warn'].forEach((kind) => {
    const original = console[kind].bind(console);
    console[kind] = (...args) => {
      original(...args);
      log(kind, args.map((item) => item?.message || String(item)).join(' '));
    };
  });

  // game.js needs these display callbacks. Clinical UI and collection are intentionally absent.
  window.UI = {
    isModalOpen: () => false,
    isDone: () => false,
    openConsult: () => { byId('review-status').textContent = '그래픽 검증에서는 진료 입력을 열지 않습니다.'; },
    askDesk: () => { byId('review-status').textContent = '그래픽 검증에서는 접수 대화를 열지 않습니다.'; },
    notifyQuality: () => {},
  };

  // Camera coordinates from test/shoot.js; no browser-driver or CDP dependency.
  const zones = [
    ['입구', 0, -8.5, 180, -3], ['전기치료실', 0, -1, 180, -5],
    ['운동치료실', 8.3, -8.4, 180, -5], ['운동기구', 9.5, -2, 180, -5],
    ['슬링', 6.15, -1.7, 180, 2], ['리포머', 10.60, -5.45, 270, -4],
    ['수치료실', 5.4, 3.7, 200, -6], ['수치료입구', 5.4, 1.2, 180, -2],
    ['수치료창', 8.2, 4.3, 248, -4], ['수치료실 구분벽', 8.6, 4.2, 200, -1],
    ['케이블', 6.6, -0.3, 90, -3], ['보행풀', 5.9, 3.8, 180, -5],
    ['전신풀', 8.2, 4.6, 200, -8], ['도수복도', -5.7, -4.6, 180, -5],
    ['도수룸', -9.4, -3.6, 90, -5], ['특수치료', -1.2, 2.2, 160, -6],
    ['충격파', 1.1, 7.6, -47, -8], ['기구라인', 8.5, -5.6, 0, -3],
    ['도수5실', -9.4, 7.2, 90, -5], ['경추견인', -1.3, 0.8, 110, -6],
    ['요추견인', -1.3, 6.4, 110, -6], ['균형훈련', 11.3, -7.9, 0, -8],
    ['짐볼', 9.3, 0.5, 180, -6], ['접수데스크', 1.3, -9.5, 275, -4],
    ['안내판', -1.9, -9.6, 100, -2],
  ];
  const resetMeasurement = () => { frames = 0; measureStart = performance.now(); fps = 0; };
  function setView(name, x, z, yaw, pitch) {
    GAME.keys = {};
    GAME.turn = 0;
    GAME.look = 0;
    GAME.player.x = x;
    GAME.player.z = z;
    GAME.yaw = yaw;
    GAME.pitch = pitch;
    view = name;
    byId('review-view').textContent = `현재 시점: ${view}`;
    resetMeasurement();
    setTimeout(updateAssets, 180);
  }
  function lookAt(name, position, target) {
    const dx = target.x - position.x, dz = target.z - position.z;
    setView(name, position.x, position.z, Math.atan2(-dx, -dz),
      Math.atan2(target.y - 1.6, Math.hypot(dx, dz)));
  }
  function showPerson(person, bed, side) {
    if (person) {
      GAME.scene.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(person.object);
      const center = box.getCenter(new THREE.Vector3());
      const quat = person.object.getWorldQuaternion(new THREE.Quaternion());
      // Standing figures face local +z; lying figures have feet in local +z.
      const direction = new THREE.Vector3(side ? -1.65 : 0, 0, side ? 0.7 : 1.9).applyQuaternion(quat);
      direction.y = 0;
      const position = center.clone().add(direction);
      const target = center.clone();
      if (person.stance) target.y = Math.min(box.max.y - 0.30, box.min.y + 1.20);
      lookAt(`${person.label} · ${side ? '옆면' : '정면'}`, position, target);
    } else if (bed) {
      const direction = new THREE.Vector3(side ? -1.4 : 0, 0, side ? 0.7 : 1.9);
      direction.applyQuaternion(bed.group.getWorldQuaternion(new THREE.Quaternion()));
      lookAt(`${bed.patient.id} ${bed.patient.name} · ${side ? '옆면' : '정면'}`,
        new THREE.Vector3(bed.cx + direction.x, 1.6, bed.cz + direction.z),
        new THREE.Vector3(bed.cx, 0.95, bed.cz));
    }
  }
  function addButton(parent, label, callback) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.addEventListener('click', callback);
    parent.appendChild(button);
    return button;
  }
  function buildControls() {
    zones.forEach(([name, x, z, yaw, pitch]) => addButton(byId('review-zones'), name,
      () => setView(name, x, z, yaw * Math.PI / 180, pitch * Math.PI / 180)));
    [...GAME.beds].sort((a, b) => Number(a.patient.id.slice(1)) - Number(b.patient.id.slice(1))).forEach((bed) => {
      const person = people.find((entry) => entry.id === bed.patient.id && !entry.staff);
      const row = document.createElement('div');
      row.className = 'patient';
      const label = document.createElement('span');
      label.textContent = `${bed.patient.id} ${bed.patient.name}`;
      row.appendChild(label);
      addButton(row, `${bed.patient.id} 정면`, () => showPerson(person, bed, false));
      addButton(row, `${bed.patient.id} 옆면`, () => showPerson(person, bed, true));
      byId('review-patients').appendChild(row);
    });
    byId('review-patients-title').textContent = `환자 가까이 보기 (${GAME.beds.length} / ${PATIENTS.length}명)`;
    const staff = people.filter((entry) => entry.staff);
    staff.forEach((person, i) => {
      person.label = `스태프 ${i + 1} (${person.id})`;
      addButton(byId('review-staff'), `스태프 ${i + 1}`, () => showPerson(person, null, false));
    });
    byId('review-staff-title').textContent = `스태프 가까이 보기 (${staff.length}명)`;
  }

  // renderer.info normally resets inside EVERY renderer.render, hiding reflection and post costs.
  // Keep autoReset disabled for the entire app frame, reset once before, then read after all passes.
  function instrumentRendering() {
    const original = RENDER.render;
    RENDER.render = function (renderer, scene, camera) {
      const autoReset = renderer.info.autoReset;
      renderer.info.autoReset = false;
      renderer.info.reset();
      const started = performance.now();
      try {
        return original.call(this, renderer, scene, camera);
      } finally {
        const info = renderer.info.render;
        frameStats = {
          calls: info.calls, triangles: info.triangles, lines: info.lines, points: info.points,
          cpu: performance.now() - started,
        };
        renderer.info.autoReset = autoReset;
        frames += 1;
        const elapsed = performance.now() - measureStart;
        if (elapsed >= 1000) { fps = frames * 1000 / elapsed; frames = 0; measureStart = performance.now(); }
      }
    };
  }
  function updateMetrics() {
    if (!window.GAME?.renderer || !frameStats) return;
    const renderer = GAME.renderer;
    const gl = renderer.getContext();
    const debug = gl.getExtension('WEBGL_debug_renderer_info');
    const gpu = debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    const fmt = (value) => Number(value).toLocaleString('en-US');
    byId('review-metrics').textContent = [
      `실제 화질: ${RENDER.tier} (설정 ${GAME.qualityPref}) · FPS ${fps.toFixed(1)}`,
      `최근 프레임 draw calls: ${fmt(frameStats.calls)}`,
      `최근 프레임 triangles: ${fmt(frameStats.triangles)}`,
      `lines ${fmt(frameStats.lines)} · points ${fmt(frameStats.points)}`,
      `렌더 제출 CPU: ${frameStats.cpu.toFixed(1)}ms (GPU 시간 아님)`,
      `캔버스 ${renderer.domElement.width} × ${renderer.domElement.height} · DPR ${renderer.getPixelRatio()}`,
      `geometries ${renderer.info.memory.geometries} · textures ${renderer.info.memory.textures} · shaders ${renderer.info.programs?.length || 0}`,
      `정적 메시 통합: ${RENDER.batchStats ? `${RENDER.batchStats.parts}개 → ${RENDER.batchStats.batches}개 (draw call 후보 ${RENDER.batchStats.saved}개 절감)` : '적용 대기'}`,
      `환자 ${GAME.beds.length}/${PATIENTS.length} · 인체 모델 ${Object.keys(HUMANS.models).length}/${HUMANS.IDS.length}`,
      `좌표 x=${GAME.player.x.toFixed(2)}, z=${GAME.player.z.toFixed(2)}, yaw=${(GAME.yaw * 180 / Math.PI).toFixed(1)}°, pitch=${(GAME.pitch * 180 / Math.PI).toFixed(1)}°`,
      '※ 그림자·거울 반사·후처리 포함, 최근 앱 프레임의 info.render 합계',
      `GPU: ${gpu}`,
    ].join('\n');
  }
  function updateAssets() {
    let meshes = 0, skinned = 0, reflectors = 0, vertices = 0;
    GAME.scene.traverse((object) => {
      if (object.isMesh) { meshes += 1; vertices += object.geometry?.attributes?.position?.count || 0; }
      if (object.isSkinnedMesh) skinned += 1;
      if (object.isReflector || object.type === 'Reflector') reflectors += 1;
    });
    const ids = GAME.beds.map((bed) => bed.patient.id);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(0, 0), GAME.camera);
    const centerHits = ray.intersectObjects(GAME.scene.children, true).slice(0, 6).map((hit) => {
      const mat = Array.isArray(hit.object.material) ? hit.object.material[0] : hit.object.material;
      return `${hit.distance.toFixed(2)}m ${hit.object.name || hit.object.type} ${mat?.color ? '#' + mat.color.getHexString() : ''}`;
    });
    const missing = PATIENTS.filter((patient) => !ids.includes(patient.id)).map((patient) => patient.id);
    byId('review-assets').textContent = [
      `HUMANS.loaded: ${HUMANS.loaded}`,
      `불러온 모델: ${Object.keys(HUMANS.models).join(', ')}`,
      `로드 실패: ${HUMANS.missing.join(', ') || '없음'}`,
      `환자 누락: ${missing.join(', ') || '없음'}`,
      `환자 ID 중복: ${ids.length - new Set(ids).size}`,
      `실제 리깅 인체 생성: 환자 ${people.filter((entry) => !entry.staff).length}, 스태프 ${people.filter((entry) => entry.staff).length}`,
      `장면 Mesh ${meshes} · SkinnedMesh ${skinned} · Reflector ${reflectors}`,
      `정적 메시 통합: ${RENDER.batchStats ? JSON.stringify(RENDER.batchStats) : '적용 대기'}`,
      `화면 중앙 물체: ${centerHits.join(' | ') || '없음'}`,
      `장면 전체 정점(인스턴스별 합계): ${vertices.toLocaleString('en-US')}`,
      '통신: 동일 출처의 정적 asset만 허용. config/collect/api/ui 미포함.',
    ].join('\n');
  }

  document.addEventListener('DOMContentLoaded', async () => {
    updateErrors();
    if (!['localhost', '127.0.0.1', '[::1]'].includes(location.hostname)) {
      byId('review-status').textContent = '이 페이지는 localhost 또는 127.0.0.1 로컬 서버에서만 실행됩니다.';
      return;
    }
    const params = new URLSearchParams(location.search);
    const quality = ['low', 'medium', 'high', 'auto'].includes(params.get('quality')) ? params.get('quality') : 'low';
    byId('review-quality').value = quality;
    byId('review-quality').addEventListener('change', (event) => {
      const url = new URL(location.href);
      url.searchParams.set('quality', event.target.value);
      location.assign(url.href);
    });
    byId('review-hide').addEventListener('click', () => document.body.classList.add('capture'));
    byId('review-refresh').addEventListener('click', resetMeasurement);
    document.addEventListener('keydown', (event) => {
      if (event.code === 'KeyH' && !['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement.tagName)) {
        document.body.classList.toggle('capture');
      }
    });
    try {
      if (!window.THREE || !window.HUMANS || !window.RENDER) throw new Error('필수 그래픽 스크립트 로드 실패');
      if (params.get('nobatch') === '1') {
        RENDER.batchStatic = () => ({ parts: 0, batches: 0, saved: 0 });
      }
      state = '인체 모델 로딩';
      await HUMANS.preload((done, total) => { byId('review-status').textContent = `인체 모델 로딩 ${done} / ${total}`; });
      const build = HUMANS.build;
      HUMANS.build = function (patient, opts) {
        const object = build.call(this, patient, opts);
        if (object) people.push({
          object, id: opts?.staff || patient?.id, staff: !!opts?.staff, stance: opts?.stance,
          label: patient ? `${patient.id} ${patient.name}` : opts?.staff,
        });
        return object;
      };
      GAME.qualityPref = quality;
      instrumentRendering();
      state = '장면 구성';
      byId('review-status').textContent = '장면과 재질 구성 중…';
      initGame();
      buildControls();
      updateAssets();
      state = '준비 완료';
      byId('review-status').textContent = `${state} · 환자 ${GAME.beds.length}명 / 스태프 ${people.filter((entry) => entry.staff).length}명`;
      updateMetrics();
      setInterval(updateMetrics, 750);
      setTimeout(updateAssets, 2200);
    } catch (error) {
      byId('review-status').textContent = `${state} 중 오류`;
      log('시작 실패', error.stack || error.message);
    }
  });
})();
