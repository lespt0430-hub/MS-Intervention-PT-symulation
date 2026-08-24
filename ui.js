// 진료 UI — 문진 / 이학적 검사 / 진단 / 치료계획 / 채점 리포트
const UI = {
  state: null,
  cur: null, // 현재 진료 중인 환자
  chat: [], // 표시용 대화 (첫 인사 포함)
  apiChat: [], // API 전송용 (user부터 시작)
  performed: [], // 시행한 검사 id
  selDx: null,
  selTx: [],
  busy: false,
};

// ── 상태 저장 ──
// 분반·학번·이름을 따로 받는다. 예전에는 "202412345 홍길동"처럼 한 칸에
// 몰아 받아서 엑셀에서 학번만 골라 정렬하거나 분반별로 나누는 게 안 됐다.
function defaultState() { return { className: '', studentId: '', studentName: '', records: {} }; }
// 저장 키 v2 — 12명 체제 개편으로 환자 번호가 바뀌어 구버전(10명) 기록과 분리
UI.load = function () {
  try { UI.state = JSON.parse(localStorage.getItem('ptsim_state_v2')) || defaultState(); }
  catch (e) { UI.state = defaultState(); }
};
UI.save = function () { localStorage.setItem('ptsim_state_v2', JSON.stringify(UI.state)); };
UI.isDone = function (pid) { return !!(UI.state.records[pid] && UI.state.records[pid].done); };
UI.isModalOpen = function () {
  return document.getElementById('consult-modal').style.display === 'flex' ||
         document.getElementById('start-screen').style.display !== 'none' ||
         document.getElementById('final-modal').style.display === 'flex';
};

// ── 로딩·화질 ──
UI.showLoading = function (on, text) {
  const el = document.getElementById('loading-screen');
  if (!el) return;
  if (text) document.getElementById('loading-text').textContent = text;
  el.style.display = on ? 'flex' : 'none';
};

// 자동 화질 조정이 등급을 내렸을 때 학생에게 조용히 알린다.
// 갑자기 화면이 달라지면 고장으로 오해하기 때문이다.
UI.toast = function (text, ms) {
  const el = document.getElementById('hud-toast');
  if (!el) return;
  el.textContent = text;
  el.style.display = 'block';
  clearTimeout(UI._toastT);
  UI._toastT = setTimeout(() => { el.style.display = 'none'; }, ms || 6000);
};

UI.notifyQuality = function (tier, fps) {
  const label = { low: '낮음', medium: '보통', high: '높음' }[tier] || tier;
  const el = document.getElementById('hud-toast');
  if (!el) return;
  el.textContent = '이 PC 성능에 맞춰 화질을 「' + label + '」으로 낮췄습니다 (' + Math.round(fps) + 'fps)';
  el.style.display = 'block';
  clearTimeout(UI._toastT);
  UI._toastT = setTimeout(() => { el.style.display = 'none'; }, 5000);
};

// ── 시작 화면 ──
UI.updateModeStatus = function () {
  const el = document.getElementById('mode-status');
  const mode = document.querySelector('input[name="chatmode"]:checked').value;
  if (mode === 'offline') {
    el.className = 'ok';
    el.textContent = '✓ 바로 시작할 수 있습니다. 환자별로 준비된 답변으로 문진이 진행됩니다.';
  } else if (AI_RELAY.ready && !hasApiKey()) {
    el.className = 'ok';
    el.textContent = '✓ 교수님이 등록해 둔 AI로 문진합니다 — 학생은 따로 키를 넣지 않아도 됩니다.';
  } else if (hasApiKey()) {
    el.className = 'ok';
    el.textContent = getStoredKey()
      ? '✓ 이 PC에 등록된 Gemini 키로 연동됨 (' + getModel() + ').'
      : '✓ 교수님 Gemini 키로 연동됨 (' + getModel() + ') — 바로 AI 문진을 쓸 수 있습니다.';
  } else if (!AI_RELAY.checked) {
    el.className = '';
    el.textContent = 'AI 연동을 확인하는 중…';
  } else {
    el.className = 'err';
    el.textContent = '✗ AI 문진을 아직 쓸 수 없습니다. 교수님이 AI 키를 등록해야 켜집니다 ' +
      '(PROFESSOR_SETUP.md의 「AI 문진 켜기」).';
  }
};

UI.initStart = function () {
  UI.load();
  const nameEl = document.getElementById('inp-name');
  const classEl = document.getElementById('inp-class');
  const sidEl = document.getElementById('inp-sid');
  const keyEl = document.getElementById('inp-key');
  const modelEl = document.getElementById('inp-model');
  nameEl.value = UI.state.studentName || '';
  sidEl.value = UI.state.studentId || '';
  // 분반은 한 실습실에서 모두 같으므로, 교수님이 config.js에 적어 두었으면
  // 그 값을 채워 준다. 학생이 매번 타이핑하면 표기가 제각각이 되어
  // 엑셀에서 분반별로 묶이지 않는다.
  classEl.value = UI.state.className
    || ((window.PTSIM_CONFIG && PTSIM_CONFIG.className) || '');
  // 입력칸에는 '이 PC에 등록한 키'만 보여 준다. config.js 의 공용 키까지
  // 여기 채우면 교수님이 지우려다 헷갈린다 (지워도 config 값이 계속 쓰인다).
  keyEl.value = getStoredKey();
  modelEl.value = getModel();
  if (modelEl.value !== getModel()) { // 저장된 모델이 기본 옵션에 없으면 추가
    modelEl.insertAdjacentHTML('afterbegin', '<option value="' + getModel() + '">' + getModel() + '</option>');
    modelEl.value = getModel();
  }
  document.querySelector('input[name="chatmode"][value="' + getChatMode() + '"]').checked = true;
  UI.updateModeStatus();
  // 교수님이 서버에 키를 넣어 두었는지 물어본다. 학생은 이 결과만 보고
  // AI 문진을 고를 수 있다 — 키 자체는 브라우저로 내려오지 않는다.
  probeAiRelay().then(UI.updateModeStatus);
  document.querySelectorAll('input[name="chatmode"]').forEach((r) => {
    r.addEventListener('change', () => {
      localStorage.setItem('ptsim_mode', r.value);
      UI.updateModeStatus();
    });
  });

  // 화질 — 이 PC에 저장된 선택을 복원한다 (실습실 PC에 한 번 맞춰두면 유지됨)
  const qEl = document.getElementById('inp-quality');
  if (qEl) {
    qEl.value = localStorage.getItem('ptsim_quality') || 'auto';
    const hint = document.getElementById('quality-hint');
    const showHint = () => {
      if (!hint) return;
      const guess = (typeof RENDER !== 'undefined') ? RENDER.detectTier() : 'low';
      const label = { low: '낮음', medium: '보통', high: '높음' }[guess];
      hint.textContent = qEl.value === 'auto'
        ? '이 PC는 「' + label + '」으로 판정됩니다. 실행 중 프레임이 떨어지면 자동으로 더 낮춥니다.'
        : '화질을 고정했습니다. 프레임이 떨어져도 자동으로 낮추지 않습니다.';
    };
    showHint();
    qEl.addEventListener('change', () => {
      localStorage.setItem('ptsim_quality', qEl.value);
      showHint();
    });
  }

  // 학생 입장
  document.getElementById('btn-start').addEventListener('click', () => {
    const name = nameEl.value.trim();
    const sid = sidEl.value.trim();
    const cls = classEl.value.trim();
    const msg = document.getElementById('start-msg');
    const mode = document.querySelector('input[name="chatmode"]:checked').value;
    // 셋 다 있어야 한다. 하나라도 비면 교수님이 결과를 누구 것인지 못 가린다.
    if (!cls) { msg.className = 'err'; msg.textContent = '분반을 입력하세요.'; classEl.focus(); return; }
    if (!sid) { msg.className = 'err'; msg.textContent = '학번을 입력하세요.'; sidEl.focus(); return; }
    if (!name) { msg.className = 'err'; msg.textContent = '이름을 입력하세요.'; nameEl.focus(); return; }
    if (mode === 'ai' && !aiAvailable()) {
      msg.className = 'err';
      msg.textContent = AI_RELAY.checked
        ? 'AI 문진은 교수님이 AI 키를 등록해야 켜집니다. 지금은 「내장 답변 모드」로 진행해 주세요.'
        : 'AI 연동을 확인하는 중입니다. 잠시 후 다시 눌러 주세요.';
      return;
    }
    if (!window.THREE) { msg.textContent = '3D 엔진을 아직 불러오는 중입니다. 잠시 후 다시 눌러 주세요.'; return; }

    UI.state.studentName = name;
    UI.state.studentId = sid;
    UI.state.className = cls;
    UI.save();
    localStorage.setItem('ptsim_mode', mode);
    const qEl = document.getElementById('inp-quality');
    GAME.qualityPref = qEl ? qEl.value : 'auto';
    localStorage.setItem('ptsim_quality', GAME.qualityPref);

    document.getElementById('start-screen').style.display = 'none';
    UI.showLoading(true, '물리치료실을 준비하고 있습니다…');

    // 사람 모델(.glb)을 먼저 받아 둔다.
    //
    // 장면은 동기로 지어지는데 모델은 비동기로 온다. 장면을 짓는 도중에는
    // 기다릴 수가 없으므로, 로딩 화면이 떠 있는 지금 전부 받아 놓고 그 다음에
    // initGame() 을 부른다. 못 받아도 그냥 진행한다 — 예전 인형으로 나온다.
    const ready = (window.HUMANS && HUMANS.enabled)
      ? HUMANS.preload((n, total) =>
          UI.showLoading(true, '사람 모델을 불러오는 중… (' + n + '/' + total + ')'))
        .catch(() => false)
      : Promise.resolve(false);

    ready.then(() => {
    UI.showLoading(true, '물리치료실을 준비하고 있습니다…');
    // 장면 생성에는 절차적 PBR 맵 계산(수백 ms)이 포함되어 그 동안 화면이 멈춘다.
    // 두 프레임 양보해 로딩 화면이 실제로 그려진 뒤에 시작한다.
    requestAnimationFrame(() => requestAnimationFrame(() => {
      try {
        initGame();
        // 저장된 진행 상황 복원
        Object.keys(UI.state.records).forEach((pid) => { if (UI.state.records[pid].done) markBedDone(pid); });
        UI.updateProgress();
      } catch (err) {
        UI.showLoading(true, '3D 화면을 시작할 수 없습니다: ' + err.message);
        console.error(err);
        return;
      }
      UI.showLoading(false);
    }));
    });
  });

  // 교수 모드 — Gemini 키 등록/해제
  document.getElementById('btn-save-key').addEventListener('click', async () => {
    const key = keyEl.value.trim();
    const msg = document.getElementById('prof-msg');
    if (!key) { msg.className = 'err'; msg.textContent = 'API 키를 입력하세요.'; return; }
    localStorage.setItem('ptsim_gemini_key', key);
    try {
      // 1) 이 키로 사용 가능한 모델 목록을 불러와 드롭다운 구성
      msg.className = ''; msg.textContent = '사용 가능한 모델 목록 불러오는 중...';
      const models = await listGeminiModels();
      if (!models.length) throw new Error('이 키로 사용 가능한 Gemini 모델이 없습니다.');
      const prev = modelEl.value;
      modelEl.innerHTML = models.map((m) => '<option value="' + m.id + '">' + m.label + '</option>').join('');
      modelEl.value = models.some((m) => m.id === prev) ? prev : pickDefaultModel(models);
      localStorage.setItem('ptsim_model', modelEl.value);
      // 2) 선택된 모델로 실제 호출 테스트 (실패 시 권장 모델로 1회 자동 재시도)
      msg.textContent = '연결 테스트 중... (' + modelEl.value + ')';
      try { await testApiKey(); }
      catch (e1) {
        const fb = pickDefaultModel(models);
        if (!fb || fb === modelEl.value) throw e1;
        modelEl.value = fb;
        localStorage.setItem('ptsim_model', fb);
        msg.textContent = '권장 모델로 재시도 중... (' + fb + ')';
        await testApiKey();
      }
      msg.className = 'ok';
      msg.textContent = '✓ 연결 성공 (' + modelEl.value + ') — 모델 ' + models.length + '개 사용 가능. AI 문진 모드를 쓸 수 있습니다.';
    } catch (e) {
      localStorage.removeItem('ptsim_gemini_key');
      msg.className = 'err'; msg.textContent = '연결 실패: ' + e.message;
    }
    UI.updateModeStatus();
  });
  // 모델 변경 시 즉시 저장
  modelEl.addEventListener('change', () => {
    localStorage.setItem('ptsim_model', modelEl.value);
    UI.updateModeStatus();
  });
  document.getElementById('btn-del-key').addEventListener('click', () => {
    localStorage.removeItem('ptsim_gemini_key');
    keyEl.value = '';
    const msg = document.getElementById('prof-msg');
    msg.className = ''; msg.textContent = 'API 연동이 해제되었습니다.';
    UI.updateModeStatus();
  });

  UI.bindCollect();
};

// ── 교수 모드 · 학생 결과 조회 ───────────────────────────────
// 비밀번호는 이 코드가 아니라 구글 Apps Script 쪽에 저장되어 그쪽에서 대조한다.
// (정적 사이트라 소스가 공개되므로, 브라우저에서 비교하면 아무 의미가 없다)
UI.bindCollect = function () {
  const statusEl = document.getElementById('collect-status');
  const msgEl = document.getElementById('collect-msg');
  const resEl = document.getElementById('collect-result');
  const loginBtn = document.getElementById('btn-prof-login');
  const resetBtn = document.getElementById('btn-reset');
  const toolsEl = document.getElementById('prof-tools');
  if (!loginBtn) return;

  // 교수 전용 도구는 로그인 전에는 화면에 아예 없다.
  //
  // 예전에는 시작 화면에 초기화 버튼이 그냥 놓여 있어서, 학생이 자기 진행을
  // 통째로 날리거나 다음 학생이 앞사람 기록을 지우고 시작하는 사고가 날 수
  // 있었다. 서버가 아이디·비밀번호를 확인해 준 뒤에만 나타난다 (브라우저에서
  // 비교하면 소스가 공개된 정적 사이트에서는 아무 의미가 없다).
  UI.profVerified = false;
  const showTools = (on) => { if (toolsEl) toolsEl.style.display = on ? '' : 'none'; };
  showTools(false);

  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      if (!UI.profVerified) {
        msgEl.className = 'err';
        msgEl.textContent = '먼저 교수 아이디·비밀번호로 로그인하세요.';
        return;
      }
      const n = Object.keys(UI.state.records || {}).length;
      if (!confirm('이 컴퓨터에 저장된 진료 기록 ' + n + '건을 모두 지웁니다.\n' +
                   '(구글 시트에 이미 제출된 기록은 그대로 남습니다)\n\n계속할까요?')) return;
      UI.state.records = {};
      UI.save();
      location.reload();
    });
  }

  const showStatus = () => {
    if (!window.COLLECT) return;
    const pending = COLLECT.pendingCount();
    if (!COLLECT.enabled()) {
      statusEl.innerHTML = '수집처가 설정되지 않았습니다 — 결과는 각 PC에만 저장됩니다. ' +
        '<b>config.js</b>의 <b>collectUrl</b>을 채우면 자동 수집이 켜집니다.';
      return;
    }
    statusEl.innerHTML = '수집 켜짐 ✓' + (pending ? ' · 이 PC에 미전송 <b>' + pending + '건</b> 대기 중' : '');
  };
  showStatus();

  // 접속하자마자 밀린 전송분을 올린다 (시험 중 인터넷이 잠깐 끊겼던 경우)
  if (window.COLLECT && COLLECT.enabled()) COLLECT.flush().then(showStatus);

  UI.collectRows = [];

  // ── AI 문진 켜기/끄기 (교수 전용) ──────────────────────────
  // 키는 서버(Apps Script 스크립트 속성)에만 저장된다. 교수님이 Apps Script
  // 편집기를 열지 않고도 학기 시작에 켜고 끝에 끌 수 있게 하려고 둔 통로다.
  const aiStateEl = document.getElementById('ai-state');
  const aiKeyEl = document.getElementById('inp-ai-key');
  const showAiState = () => {
    if (!aiStateEl) return;
    aiStateEl.innerHTML = AI_RELAY.ready
      ? '현재 <b>켜짐</b> — 학생이 키 입력 없이 AI 문진을 쓸 수 있습니다.'
      : '현재 <b>꺼짐</b> — 학생은 내장 답변 모드로 실습합니다.';
  };
  const aiSet = async (on) => {
    const id = document.getElementById('inp-prof-id').value.trim();
    const pw = document.getElementById('inp-prof-pw').value;
    const key = aiKeyEl ? aiKeyEl.value.trim() : '';
    if (on && !key) { msgEl.className = 'err'; msgEl.textContent = 'Gemini API 키를 입력하세요.'; return; }
    msgEl.className = '';
    msgEl.textContent = on ? 'AI 문진을 켜는 중… (키가 실제로 되는지 확인합니다)' : 'AI 문진을 끄는 중…';
    try {
      const r = await COLLECT.call(
        on ? { action: 'ai_set', user: id, pw, key } : { action: 'ai_set', user: id, pw, enable: false },
        45000);
      AI_RELAY.ready = !!r.ai;
      AI_RELAY.checked = true;
      if (aiKeyEl) aiKeyEl.value = '';
      msgEl.className = 'ok';
      msgEl.textContent = r.ai
        ? '✓ AI 문진을 켰습니다 — 이제 모든 학생이 바로 쓸 수 있습니다.'
        : '✓ AI 문진을 껐습니다 — 저장된 키도 서버에서 지웠습니다.';
      showAiState();
      UI.updateModeStatus();
    } catch (e) {
      msgEl.className = 'err';
      msgEl.textContent = 'AI 설정 실패: ' + e.message;
    }
  };
  const aiOn = document.getElementById('btn-ai-on');
  const aiOff = document.getElementById('btn-ai-off');
  if (aiOn) aiOn.addEventListener('click', () => aiSet(true));
  if (aiOff) aiOff.addEventListener('click', () => aiSet(false));

  const xlsxBtn = document.getElementById('btn-xlsx');
  const render = (rows) => {
    UI.collectRows = rows;
    // 제출이 아직 없어도 도구는 열어 둔다 — 초기화는 그때도 써야 한다.
    if (xlsxBtn) {
      xlsxBtn.disabled = !rows.length;
      xlsxBtn.title = rows.length ? '' : '아직 받을 기록이 없습니다';
    }
    if (!rows.length) {
      resEl.innerHTML = '<div class="collect-empty">아직 제출된 결과가 없습니다.</div>';
      return;
    }
    // 학생별 요약 — 상세 전체는 엑셀로 받아 보는 편이 낫다.
    // 동명이인이 있을 수 있으므로 학번을 열쇠로 묶는다.
    const byStudent = {};
    rows.forEach((r) => {
      const k = (r.studentId || '') + ' ' + (r.student || '');
      if (!byStudent[k]) {
        byStudent[k] = { cls: r.className || '', sid: r.studentId || '', name: r.student || '(이름없음)',
          n: 0, sum: 0, last: '' };
      }
      byStudent[k].n += 1;
      byStudent[k].sum += Number(r.total) || 0;
      if (!byStudent[k].last || r.submittedAt > byStudent[k].last) byStudent[k].last = r.submittedAt;
    });
    // 분반 → 학번 순으로 정렬해야 교수님이 출석부와 나란히 놓고 볼 수 있다
    const list = Object.values(byStudent).sort((a, b) =>
      (a.cls || '').localeCompare(b.cls || '') || String(a.sid).localeCompare(String(b.sid)));
    let html = '<div class="collect-sum">학생 <b>' + list.length + '명</b> · 제출 <b>' + rows.length + '건</b></div>' +
      '<table class="collect-table"><thead><tr><th>분반</th><th>학번</th><th>이름</th>' +
      '<th>완료</th><th>평균</th><th>합계</th><th>최근 제출</th></tr></thead><tbody>';
    list.forEach((s) => {
      html += '<tr><td>' + s.cls + '</td><td>' + s.sid + '</td><td>' + s.name + '</td>' +
        '<td>' + s.n + ' / ' + PATIENTS.length + '</td>' +
        '<td>' + (s.sum / s.n).toFixed(1) + '</td><td>' + s.sum.toFixed(1) + '</td>' +
        '<td>' + String(s.last).replace('T', ' ').slice(0, 16) + '</td></tr>';
    });
    html += '</tbody></table>';
    resEl.innerHTML = html;
  };

  const load = async () => {
    const id = document.getElementById('inp-prof-id').value.trim();
    const pw = document.getElementById('inp-prof-pw').value;
    if (!window.COLLECT || !COLLECT.enabled()) {
      msgEl.className = 'err';
      msgEl.textContent = '수집처가 설정되지 않았습니다. PROFESSOR_SETUP.md를 참고해 config.js를 채워 주세요.';
      return;
    }
    if (!id || !pw) { msgEl.className = 'err'; msgEl.textContent = '아이디와 비밀번호를 입력하세요.'; return; }
    msgEl.className = ''; msgEl.textContent = '불러오는 중…';
    loginBtn.disabled = true;
    try {
      const rows = await COLLECT.fetchAll(id, pw);
      msgEl.className = 'ok';
      msgEl.textContent = '✓ 교수 로그인 · 제출 ' + rows.length +
        '건을 불러왔습니다 (학생이 어느 컴퓨터에서 했든 전부).';
      UI.profVerified = true;      // 교수 전용 도구를 여기서 연다
      showTools(true);
      // 로그인한 김에 AI 상태도 서버에 다시 물어본다 (다른 PC에서 켜 뒀을 수 있다)
      probeAiRelay().then(() => { showAiState(); UI.updateModeStatus(); });
      showAiState();
      render(rows);
    } catch (e) {
      msgEl.className = 'err';
      msgEl.textContent = '불러오기 실패: ' + e.message;
      resEl.innerHTML = '';
      UI.profVerified = false;
      showTools(false);
    }
    loginBtn.disabled = false;
  };

  loginBtn.addEventListener('click', load);
  document.getElementById('btn-collect-refresh').addEventListener('click', load);
  document.getElementById('inp-prof-pw').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') load();
  });
  document.getElementById('btn-xlsx').addEventListener('click', () => {
    if (!UI.collectRows.length) return;
    COLLECT.downloadXlsx(UI.collectRows);
  });

  // 수집처를 안 쓰거나 인터넷이 막힌 실습실에서도 결과를 회수할 수 있어야 한다.
  // 이 PC 에 남아 있는 기록만 엑셀로 떨군다 (학생 PC 를 돌며 받는 용도).
  const localBtn = document.getElementById('btn-xlsx-local');
  if (localBtn) localBtn.addEventListener('click', () => {
    const rows = COLLECT.localRows();
    if (!rows.length) {
      msgEl.className = 'err';
      msgEl.textContent = '이 컴퓨터에 저장된 진료 기록이 없습니다.';
      return;
    }
    const who = (UI.state.studentName || '이PC').replace(/[\\/:*?"<>|]/g, '_');
    COLLECT.downloadXlsx(rows,
      '가상환자시뮬레이션_' + who + '_' + new Date().toISOString().slice(0, 10) + '.xlsx');
    msgEl.className = 'ok';
    msgEl.textContent = '✓ 이 PC 기록 ' + rows.length + '건을 엑셀로 저장했습니다.';
  });
};

// 학생 표기 — "분반 · 학번 이름". 성적표·파일이름이 제각각이면 교수님이
// 회수할 때 누구 것인지 맞춰 보기 어렵다.
UI.studentLabel = function () {
  const st = UI.state || {};
  const idName = [st.studentId, st.studentName].filter(Boolean).join(' ');
  return [st.className, idName].filter(Boolean).join(' · ') || '(미입력)';
};

UI.updateProgress = function () {
  const done = PATIENTS.filter((p) => UI.isDone(p.id)).length;
  document.getElementById('hud-progress').textContent = '진료 완료 ' + done + ' / ' + PATIENTS.length;
  if (done === PATIENTS.length) document.getElementById('btn-final').style.display = 'inline-block';
};

// ── 진료 모달 ──
UI.openConsult = function (patient) {
  UI.cur = patient;
  const modal = document.getElementById('consult-modal');
  modal.style.display = 'flex';
  document.getElementById('cm-title').textContent =
    patient.name + ' (' + patient.sex + ', ' + patient.age + '세, ' + patient.job + ')';

  if (UI.isDone(patient.id)) {
    // 완료된 환자 → 결과만 보기
    const r = UI.state.records[patient.id];
    UI.showTab('result');
    UI.renderResult(r);
    document.querySelectorAll('.cm-tab').forEach((t) => { t.style.display = t.dataset.tab === 'result' ? '' : 'none'; });
    return;
  }
  document.querySelectorAll('.cm-tab').forEach((t) => { t.style.display = t.dataset.tab === 'result' ? 'none' : ''; });

  // 새 진료 세션
  UI.chat = [{ role: 'assistant', content: '(환자가 베드에 누워 있다) 안녕하세요, 선생님... ' + patient.chiefComplaint }];
  UI.apiChat = [];
  UI.performed = [];
  UI.selDx = null;
  UI.selTx = [];
  UI.renderChat();
  UI.renderExams();
  UI.renderDx();
  UI.renderTx();
  UI.showTab('chat');
};

UI.closeConsult = function () {
  document.getElementById('consult-modal').style.display = 'none';
  UI.cur = null;
};

UI.showTab = function (tab) {
  document.querySelectorAll('.cm-tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === tab));
  document.querySelectorAll('.cm-pane').forEach((p) => { p.style.display = p.id === 'pane-' + tab ? 'flex' : 'none'; });
  document.querySelector('.cm-footer').style.display = tab === 'result' ? 'none' : 'flex';
};

// ── ① 문진 (AI 대화) ──
UI.renderChat = function () {
  const box = document.getElementById('chat-box');
  const note = useAI()
    ? '<div class="sys-note">🤖 AI 문진 모드 — Gemini와 자유롭게 대화하며 문진하세요.</div>'
    : '<div class="sys-note">📋 내장 답변 모드 — 준비된 환자 답변으로 진행됩니다. 핵심 항목을 구체적으로 질문해 보세요.</div>';
  box.innerHTML = note + UI.chat.map((m) =>
    '<div class="msg ' + (m.role === 'user' ? 'me' : 'pt') + '"><span class="who">' +
    (m.role === 'user' ? '나 (물리치료사)' : UI.cur.name) + '</span>' + escapeHtml(m.content) + '</div>'
  ).join('');
  box.scrollTop = box.scrollHeight;
};

UI.sendChat = async function () {
  if (UI.busy || !UI.cur) return;
  const inp = document.getElementById('chat-input');
  const text = inp.value.trim();
  if (!text) return;
  inp.value = '';
  UI.busy = true;
  UI.chat.push({ role: 'user', content: text });
  UI.apiChat.push({ role: 'user', content: text });
  UI.renderChat();
  const box = document.getElementById('chat-box');
  box.insertAdjacentHTML('beforeend', '<div class="msg pt typing" id="typing">...</div>');
  box.scrollTop = box.scrollHeight;
  try {
    const reply = await patientChat(UI.cur, UI.apiChat);
    UI.chat.push({ role: 'assistant', content: reply });
    UI.apiChat.push({ role: 'assistant', content: reply });
  } catch (e) {
    UI.chat.push({ role: 'assistant', content: '(연결 오류: ' + e.message + ')' });
    UI.apiChat.pop(); // 실패한 user 메시지 제거하여 재시도 가능하게
  }
  UI.busy = false;
  UI.renderChat();
};

// ── ② 이학적 검사 ──
UI.renderExams = function () {
  const p = UI.cur;
  const exams = getExamsForRegion(p.region);
  const cats = [...new Set(exams.map((e) => e.cat))];
  const wrap = document.getElementById('exam-list');
  wrap.innerHTML = cats.map((cat) =>
    '<div class="exam-cat"><h4>' + cat + '</h4>' +
    exams.filter((e) => e.cat === cat).map((e) => {
      const donecls = UI.performed.includes(e.id) ? ' performed' : '';
      return '<button class="exam-btn' + donecls + '" data-id="' + e.id + '">' + e.name + '</button>';
    }).join('') + '</div>'
  ).join('');
  wrap.querySelectorAll('.exam-btn').forEach((btn) => {
    btn.addEventListener('click', () => UI.doExam(btn.dataset.id));
  });
};

UI.doExam = function (id) {
  const p = UI.cur;
  if (!UI.performed.includes(id)) UI.performed.push(id);
  const exam = findExam(p.region, id);
  const result = p.examResults[id] || '특이소견 없음.';
  const log = document.getElementById('exam-log');
  log.insertAdjacentHTML('beforeend',
    '<div class="exam-result"><b>' + exam.name + '</b><br>' + escapeHtml(result) + '</div>');
  log.scrollTop = log.scrollHeight;
  UI.renderExams();
};

// ── ③ 진단 ──
UI.renderDx = function () {
  const wrap = document.getElementById('dx-list');
  wrap.innerHTML = UI.cur.diagnosisOptions.map((d) =>
    '<label class="dx-opt"><input type="radio" name="dx" value="' + d.id + '"> ' + d.name + '</label>'
  ).join('');
  wrap.querySelectorAll('input').forEach((r) => {
    r.addEventListener('change', () => { UI.selDx = r.value; });
  });
};

// ── ④ 치료계획 ──
UI.renderTx = function () {
  const wrap = document.getElementById('tx-list');
  wrap.innerHTML = UI.cur.treatments.map((t) =>
    '<label class="tx-opt"><input type="checkbox" value="' + t.id + '"> ' + t.name + '</label>'
  ).join('');
  wrap.querySelectorAll('input').forEach((c) => {
    c.addEventListener('change', () => {
      UI.selTx = [...wrap.querySelectorAll('input:checked')].map((x) => x.value);
    });
  });
};

// ── 채점 ──
UI.submit = async function () {
  if (!UI.cur || UI.busy) return;
  if (!UI.selDx) { alert('진단을 선택하세요. (③ 진단 탭)'); UI.showTab('dx'); return; }
  if (UI.selTx.length === 0) { alert('치료계획을 1개 이상 선택하세요. (④ 치료계획 탭)'); UI.showTab('tx'); return; }
  if (UI.apiChat.length < 2) {
    if (!confirm('문진 대화가 거의 없습니다. 이대로 제출할까요? (문진 점수가 낮아집니다)')) return;
  }
  UI.busy = true;
  const btn = document.getElementById('btn-submit');
  btn.disabled = true; btn.textContent = '채점 중... (AI가 문진을 평가하고 있습니다)';

  const p = UI.cur;
  // 1) 문진 평가
  let histItems;
  try { histItems = await evaluateHistory(p, UI.apiChat); }
  catch (e) { histItems = evaluateHistoryFallback(p, UI.apiChat); }
  // 누락 항목 보정 (평가에 빠진 id는 미유도 처리)
  histItems = p.keyHistory.map((k) => {
    const found = histItems.find((i) => i.id === k.id);
    return { id: k.id, label: k.label, elicited: !!(found && found.elicited), evidence: (found && found.evidence) || '' };
  });
  const histScore = round1((histItems.filter((i) => i.elicited).length / p.keyHistory.length) * 10);

  // 2) 검사 채점
  const hits = p.requiredExams.filter((id) => UI.performed.includes(id));
  const relevant = new Set([...p.requiredExams, ...p.relatedExams]);
  const base = (hits.length / p.requiredExams.length) * 8;
  const eff = UI.performed.length > 0
    ? (UI.performed.filter((id) => relevant.has(id)).length / UI.performed.length) * 2 : 0;
  const examScore = round1(base + eff);

  // 3) 진단 채점
  let dxScore = 0;
  if (UI.selDx === p.correctDx) dxScore = 10;
  else if (p.partialDx.includes(UI.selDx)) dxScore = 5;

  // 4) 치료 채점
  const recTx = p.treatments.filter((t) => t.recommended);
  const gradeW = { A: 3, B: 2, C: 1 };
  const maxW = recTx.reduce((s, t) => s + (gradeW[t.grade] || 1), 0);
  const earned = recTx.filter((t) => UI.selTx.includes(t.id)).reduce((s, t) => s + (gradeW[t.grade] || 1), 0);
  const badCount = p.treatments.filter((t) => !t.recommended && UI.selTx.includes(t.id)).length;
  const txScore = round1(Math.max(0, Math.min(10, (earned / maxW) * 10 - badCount * 2)));

  const record = {
    done: true, when: new Date().toISOString(),
    chat: UI.chat, performed: UI.performed.slice(),
    dx: UI.selDx, tx: UI.selTx.slice(),
    histItems,
    scores: { hist: histScore, exam: examScore, dx: dxScore, tx: txScore, total: round1(histScore + examScore + dxScore + txScore) },
  };
  UI.state.records[p.id] = record;
  UI.save();
  markBedDone(p.id);
  UI.updateProgress();
  // 교수님 시트로 결과 전송 (설정되어 있을 때만).
  // 채점 화면을 막지 않도록 기다리지 않는다. 실패하면 보관함에 쌓였다가
  // 다음 제출·다음 접속 때 자동으로 다시 올라간다.
  if (window.COLLECT && COLLECT.enabled()) {
    COLLECT.submit(p, record, {
      className: UI.state.className,
      studentId: UI.state.studentId,
      studentName: UI.state.studentName,
    }).then((r) => {
      if (r && r.ok === false) UI.toast('결과 전송이 지연되고 있습니다 — 자동으로 다시 시도합니다 (대기 ' + r.queued + '건)');
    });
  }

  btn.disabled = false; btn.textContent = '진료 완료 · 채점하기';
  UI.busy = false;
  document.querySelectorAll('.cm-tab').forEach((t) => { t.style.display = t.dataset.tab === 'result' ? '' : 'none'; });
  UI.showTab('result');
  UI.renderResult(record);
};

// ── 결과 리포트 ──
function bar(score, max) {
  const pct = Math.round((score / max) * 100);
  const cls = pct >= 80 ? 'good' : pct >= 50 ? 'mid' : 'bad';
  return '<div class="bar"><div class="bar-fill ' + cls + '" style="width:' + pct + '%"></div></div>' +
         '<span class="bar-num">' + score + ' / ' + max + '</span>';
}

UI.renderResult = function (r) {
  const p = UI.cur;
  const s = r.scores;
  const missedExams = p.requiredExams.filter((id) => !r.performed.includes(id));
  const relevant = new Set([...p.requiredExams, ...p.relatedExams]);
  const unnecessary = r.performed.filter((id) => !relevant.has(id));
  const dxChosen = p.diagnosisOptions.find((d) => d.id === r.dx);
  const dxCorrect = p.diagnosisOptions.find((d) => d.id === p.correctDx);
  const gradeLabel = { A: 'A(강력 권고)', B: 'B(권고)', C: 'C(약한 근거)', X: '비권고/부적절' };

  let html = '<div class="result-head"><h3>진료 결과 리포트 — ' + p.name + '</h3>' +
    '<div class="total-score">' + s.total + ' <small>/ 40점</small></div></div>';

  html += '<div class="score-row"><span class="score-label">① 문진</span>' + bar(s.hist, 10) + '</div>';
  html += '<div class="score-row"><span class="score-label">② 이학적 검사</span>' + bar(s.exam, 10) + '</div>';
  html += '<div class="score-row"><span class="score-label">③ 진단</span>' + bar(s.dx, 10) + '</div>';
  html += '<div class="score-row"><span class="score-label">④ 치료계획</span>' + bar(s.tx, 10) + '</div>';

  // 문진 상세
  html += '<details open><summary>① 문진 상세 — 핵심 항목 ' + r.histItems.filter((i) => i.elicited).length + '/' + r.histItems.length + ' 유도</summary><ul>';
  r.histItems.forEach((i) => {
    html += '<li class="' + (i.elicited ? 'ok' : 'miss') + '">' + (i.elicited ? '✓' : '✗') + ' ' + i.label + '</li>';
  });
  html += '</ul></details>';

  // 검사 상세
  html += '<details open><summary>② 검사 상세</summary>';
  if (missedExams.length) {
    html += '<p class="miss"><b>누락된 필수검사:</b> ' + missedExams.map((id) => findExam(p.region, id).name).join(', ') + '</p>';
  } else {
    html += '<p class="ok">필수검사를 모두 시행했습니다. 훌륭합니다!</p>';
  }
  if (unnecessary.length) {
    html += '<p class="warn"><b>관련성 낮은 검사:</b> ' + unnecessary.map((id) => findExam(p.region, id).name).join(', ') + '</p>';
  }
  html += '</details>';

  // 진단 상세
  html += '<details open><summary>③ 진단 해설</summary>';
  html += '<p>선택한 진단: <b class="' + (s.dx === 10 ? 'ok' : s.dx === 5 ? 'warn' : 'miss') + '">' + (dxChosen ? dxChosen.name : '-') + '</b></p>';
  if (s.dx < 10) html += '<p>정답: <b class="ok">' + dxCorrect.name + '</b></p>';
  html += '<p class="explain">' + p.dxExplanation + '</p></details>';

  // 치료 상세
  html += '<details open><summary>④ 치료계획 상세 (CPG 권고등급 기준)</summary><table class="tx-table"><tr><th>중재</th><th>등급</th><th>선택</th><th>비고</th></tr>';
  p.treatments.forEach((t) => {
    const sel = r.tx.includes(t.id);
    const cls = t.recommended ? (sel ? 'ok' : 'miss') : (sel ? 'bad-pick' : '');
    html += '<tr class="' + cls + '"><td>' + t.name + '</td><td>' + (gradeLabel[t.grade] || t.grade) + '</td><td>' +
      (sel ? '✔' : '—') + '</td><td>' + t.note + '</td></tr>';
  });
  html += '</table><p class="cpg-ref">근거: ' + p.cpgRef + '</p></details>';

  document.getElementById('pane-result').innerHTML =
    '<div class="result-scroll">' + html + '</div>' +
    '<div class="result-actions"><button onclick="UI.closeConsult()" class="btn-primary">물리치료실로 돌아가기</button></div>';
};

// ── 종합 리포트 ──
UI.showFinal = function () {
  const modal = document.getElementById('final-modal');
  modal.style.display = 'flex';
  let total = 0;
  let rows = PATIENTS.map((p, i) => {
    const r = UI.state.records[p.id];
    const s = r ? r.scores : { hist: '-', exam: '-', dx: '-', tx: '-', total: 0 };
    total += r ? s.total : 0;
    return '<tr><td>' + (i + 1) + '</td><td>' + p.name + '</td><td>' + p.cpgRef.split(':')[0] + '</td>' +
      '<td>' + s.hist + '</td><td>' + s.exam + '</td><td>' + s.dx + '</td><td>' + s.tx + '</td><td><b>' + s.total + '</b></td></tr>';
  }).join('');
  const avg = round1(total / PATIENTS.length);
  const grade = avg >= 36 ? 'A' : avg >= 32 ? 'B' : avg >= 28 ? 'C' : avg >= 24 ? 'D' : 'F';
  document.getElementById('final-body').innerHTML =
    '<h2>종합 성적표</h2><p class="final-student">' + UI.studentLabel() + ' · ' + new Date().toLocaleDateString('ko-KR') + '</p>' +
    '<table class="final-table"><tr><th>베드</th><th>환자</th><th>질환(CPG)</th><th>문진</th><th>검사</th><th>진단</th><th>치료</th><th>총점/40</th></tr>' +
    rows + '</table>' +
    '<div class="final-total">평균 <b>' + avg + '</b> / 40점 — 등급 <b class="final-grade">' + grade + '</b></div>' +
    '<div class="result-actions">' +
    '<button class="btn-primary" onclick="UI.downloadReport()">결과 다운로드 (.txt)</button> ' +
    '<button class="btn-secondary" onclick="window.print()">인쇄</button> ' +
    '<button class="btn-secondary" onclick="document.getElementById(\'final-modal\').style.display=\'none\'">닫기</button></div>';
};

UI.downloadReport = function () {
  let txt = '근골격계 물리치료 가상환자 시뮬레이션 — 결과 리포트\n';
  txt += '학생: ' + UI.state.studentName + ' / 일시: ' + new Date().toLocaleString('ko-KR') + '\n';
  txt += '='.repeat(60) + '\n';
  let total = 0;
  PATIENTS.forEach((p, i) => {
    const r = UI.state.records[p.id];
    if (!r) return;
    const s = r.scores;
    total += s.total;
    txt += '\n[베드 ' + (i + 1) + '] ' + p.name + ' — ' + p.cpgRef + '\n';
    txt += '  문진 ' + s.hist + '/10, 검사 ' + s.exam + '/10, 진단 ' + s.dx + '/10, 치료 ' + s.tx + '/10 → 총점 ' + s.total + '/40\n';
    const missed = r.histItems.filter((h) => !h.elicited).map((h) => h.label);
    if (missed.length) txt += '  · 놓친 문진: ' + missed.join(' / ') + '\n';
    const missedEx = p.requiredExams.filter((id) => !r.performed.includes(id)).map((id) => findExam(p.region, id).name);
    if (missedEx.length) txt += '  · 놓친 필수검사: ' + missedEx.join(' / ') + '\n';
  });
  txt += '\n' + '='.repeat(60) + '\n평균: ' + round1(total / PATIENTS.length) + ' / 40\n';
  const blob = new Blob(['﻿' + txt], { type: 'text/plain;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = '가상환자시뮬레이션_결과_'
    + ([UI.state.studentId, UI.state.studentName].filter(Boolean).join('_') || '결과')
      .replace(/[\/:*?"<>|]/g, '_') + '.txt';
  a.click();
};

// ── 유틸 ──
function round1(n) { return Math.round(n * 10) / 10; }
function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
}

// ── 이벤트 바인딩 ──
window.addEventListener('DOMContentLoaded', () => {
  UI.initStart();
  document.querySelectorAll('.cm-tab').forEach((t) => {
    t.addEventListener('click', () => UI.showTab(t.dataset.tab));
  });
  document.getElementById('btn-close-consult').addEventListener('click', () => {
    if (UI.cur && !UI.isDone(UI.cur.id)) {
      if (!confirm('진료를 중단하고 나갈까요? (이 환자의 기록은 저장되지 않습니다)')) return;
    }
    UI.closeConsult();
  });
  document.getElementById('btn-submit').addEventListener('click', () => UI.submit());
  document.getElementById('chat-send').addEventListener('click', () => UI.sendChat());
  document.getElementById('chat-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); UI.sendChat(); }
  });
  document.getElementById('btn-final').addEventListener('click', () => UI.showFinal());
});
