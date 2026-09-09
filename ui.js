// 진료 UI — 문진 / 이학적 검사 / 진단 / 치료계획 / 채점 리포트
const UI = {
  state: null,
  cur: null, // 현재 진료 중인 환자
  chat: [], // 표시용 대화 (첫 인사 포함)
  apiChat: [], // API 전송용 (user부터 시작)
  performed: [], // 시행한 검사 id
  selDx: null,
  selStage: null,
  selIrr: null,
  selTx: [],
  selRx: {},
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

// ── 접수 데스크에 말 걸기 ──
// 진료 모달을 여는 대신 말풍선만 띄운다. 학생이 처음 들어왔을 때 "어디부터
// 가야 하나"를 사람에게 물어보는 경로가 하나는 있어야 한다.
// 누를 때마다 다음 문장으로 넘어가고, 끝나면 처음으로 돌아간다.
UI.askDesk = function (desk) {
  if (!desk || !desk.lines || !desk.lines.length) return;
  UI._deskAt = UI._deskAt || {};
  const key = desk.name;
  const i = UI._deskAt[key] || 0;
  UI._deskAt[key] = (i + 1) % desk.lines.length;
  const more = desk.lines.length > 1 ? '   (E — 더 듣기)' : '';
  UI.toast(desk.name + ' ' + desk.role + ' — “' + desk.lines[i] + '”' + more, 7000);
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

// ── AI 회사 선택 (교수 모드) ──
// Gemini·GPT·Claude 는 부르는 주소와 모델 이름이 전부 달라서, 회사를 바꾸면
// 모델 목록도 통째로 갈아 끼워야 한다. 목록을 HTML 에 박아 두면 회사를 바꿔도
// Gemini 모델이 남아 있어, Claude 를 골라 놓고 gemini-flash 를 부르게 된다.
UI.bindProviderPicker = function () {
  const provEl = document.getElementById('inp-provider');
  const modelEl = document.getElementById('inp-model');
  if (!provEl || !modelEl) return;

  const fill = () => {
    const info = providerInfo();
    const cur = getModel();
    modelEl.innerHTML = info.models
      .map((m) => '<option value="' + m + '">' + m + '</option>').join('');
    // 교수님이 표에 없는 새 모델 이름을 쓰고 있으면 그것도 목록에 넣어 준다
    if (!info.models.includes(cur)) {
      modelEl.insertAdjacentHTML('afterbegin', '<option value="' + cur + '">' + cur + '</option>');
    }
    modelEl.value = cur;
    const hint = document.getElementById('key-hint-provider');
    if (hint) {
      hint.innerHTML = info.label + ' 키는 <b>' + info.hint + '</b>합니다. 발급: ' +
        '<a href="' + info.issue + '" target="_blank">' + info.issue.replace(/^https:\/\//, '') + '</a>';
    }
  };

  provEl.value = getProvider();
  fill();
  UI.fillModelOptions = fill;
  provEl.addEventListener('change', () => {
    setProvider(provEl.value);
    fill();
    UI.updateModeStatus();
  });
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
    const pl = providerInfo().label;
    el.textContent = getStoredKey()
      ? '✓ 이 PC에 등록된 ' + pl + ' 키로 연동됨 (' + getModel() + ').'
      : '✓ 교수님 ' + pl + ' 키로 연동됨 (' + getModel() + ') — 바로 AI 문진을 쓸 수 있습니다.';
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
  // 모델 목록은 회사(Gemini/GPT/Claude)마다 달라 HTML 에 미리 적을 수 없다.
  UI.bindProviderPicker();
  document.querySelector('input[name="chatmode"][value="' + getChatMode() + '"]').checked = true;
  UI.updateModeStatus();
  // 교수님이 서버에 키를 넣어 두었는지 물어본다. 학생은 이 결과만 보고
  // AI 문진을 고를 수 있다 — 키 자체는 브라우저로 내려오지 않는다.
  //
  // 응답이 온 뒤 라디오를 한 번 더 맞춘다. 처음 그릴 때는 아직 중계 여부를
  // 몰라 무조건 내장 답변에 체크되기 때문이다. 학생이 직접 고른 적이 없을
  // 때(저장값 없음)만 바꾸므로, 일부러 내장 답변을 고른 학생은 그대로 둔다.
  probeAiRelay().then(() => {
    if (!localStorage.getItem('ptsim_mode')) {
      const el = document.querySelector('input[name="chatmode"][value="' + getChatMode() + '"]');
      if (el) el.checked = true;
    }
    UI.updateModeStatus();
  });
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

  // 교수 모드 — AI 키 등록/해제
  document.getElementById('btn-save-key').addEventListener('click', async () => {
    const key = keyEl.value.trim();
    const msg = document.getElementById('prof-msg');
    if (!key) { msg.className = 'err'; msg.textContent = 'API 키를 입력하세요.'; return; }
    // 붙여넣은 키 생김새로 회사를 알아맞힌다 — 교수님이 회사를 안 골라도 되게.
    const guess = Object.keys(AI_PROVIDERS).find((p) => AI_PROVIDERS[p].detect(key));
    if (guess && guess !== getProvider()) {
      setProvider(guess);
      const pe = document.getElementById('inp-provider');
      if (pe) pe.value = guess;
      if (UI.fillModelOptions) UI.fillModelOptions();
    }
    localStorage.setItem('ptsim_gemini_key', key);
    const info = providerInfo();
    try {
      // Gemini 는 키로 쓸 수 있는 모델 목록을 물어볼 수 있다. 나머지 회사는
      // 그런 창구가 없어 표에 적어 둔 후보를 그대로 쓴다.
      if (getProvider() === 'gemini') {
        msg.className = ''; msg.textContent = '사용 가능한 모델 목록 불러오는 중...';
        const models = await listGeminiModels();
        if (!models.length) throw new Error('이 키로 사용 가능한 Gemini 모델이 없습니다.');
        const prev = modelEl.value;
        modelEl.innerHTML = models.map((m) => '<option value="' + m.id + '">' + m.label + '</option>').join('');
        modelEl.value = models.some((m) => m.id === prev) ? prev : pickDefaultModel(models);
        localStorage.setItem('ptsim_model', modelEl.value);
      } else {
        UI.fillModelOptions();
        localStorage.setItem('ptsim_model', modelEl.value);
      }
      // 선택된 모델로 실제 호출 테스트 (실패 시 그 회사의 기본 모델로 1회 재시도)
      msg.className = ''; msg.textContent = '연결 테스트 중... (' + modelEl.value + ')';
      try { await testApiKey(); }
      catch (e1) {
        const fb = info.fast;
        if (!fb || fb === modelEl.value) throw e1;
        modelEl.value = fb;
        localStorage.setItem('ptsim_model', fb);
        msg.textContent = '기본 모델로 재시도 중... (' + fb + ')';
        await testApiKey();
      }
      msg.className = 'ok';
      msg.textContent = '✓ ' + info.label + ' 연결 성공 (' + modelEl.value + ') — AI 문진 모드를 쓸 수 있습니다.';
    } catch (e) {
      localStorage.removeItem('ptsim_gemini_key');
      msg.className = 'err';
      msg.textContent = '연결 실패: ' + e.message +
        (getProvider() === 'anthropic'
          ? ' — Claude 는 브라우저에서 직접 부르는 것을 막는 경우가 있습니다. 그때는 중계(교수 로그인 → AI 문진 켜기)를 쓰세요.'
          : '');
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

  // 서버 기록을 다루는 교수 전용 도구만 로그인 뒤에 표시한다.
  // 이 PC의 개인 진행 기록 초기화는 시작 화면에서 학생이 직접 사용할 수 있다.
  UI.profVerified = false;
  const showTools = (on) => { if (toolsEl) toolsEl.style.display = on ? '' : 'none'; };
  showTools(false);

  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
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
        on ? { action: 'ai_set', user: id, pw, key, provider: getProvider() }
           : { action: 'ai_set', user: id, pw, enable: false },
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
      checkScriptVersion();        // 배포된 스크립트가 최신인지 미리 알려 준다
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

  // ── 배포된 앱스크립트가 최신인지 확인 ──
  //
  // 코드를 고쳐도 '새 버전' 으로 다시 배포하지 않으면 예전 코드가 계속
  // 서비스된다. 그러면 화면에는 버튼이 있는데 서버가 그 요청을 몰라서,
  // 눌러도 아무 일이 없는 것처럼 보인다(실제로 그렇게 헤맸다).
  // 로그인 직후에 한 번 물어보고, 예전 판이면 버튼을 잠가 둔다.
  const REQUIRED_SCRIPT_VERSION = 3;
  async function checkScriptVersion() {
    const btn = document.getElementById('btn-reset-all');
    const rmsg = document.getElementById('reset-all-msg');
    if (!btn) return;
    let ver = 0;
    try {
      const r = await COLLECT.call({ action: 'ping' }, 15000);
      ver = Number(r.version) || 0;
    } catch (e) {
      ver = 0;      // 'ping' 을 모르는 예전 판
    }
    const ok = ver >= REQUIRED_SCRIPT_VERSION;
    btn.disabled = !ok;
    if (rmsg) {
      rmsg.className = ok ? 'ok' : 'err';
      rmsg.innerHTML = ok
        ? '✓ 앱스크립트 최신 (v' + ver + ') — 초기화를 쓸 수 있습니다.'
        : '✗ 배포된 앱스크립트가 예전 판입니다' + (ver ? ' (v' + ver + ')' : '') +
          ' — 초기화가 동작하지 않아 버튼을 잠갔습니다.<br>' +
          '저장소의 <b>apps-script/Code.gs</b> 를 통째로 복사해 붙여넣고, ' +
          '<b>배포 → 배포 관리 → 편집(연필) → 버전을 「새 버전」으로 → 배포</b> 하세요. ' +
          '코드만 저장하고 재배포하지 않으면 예전 코드가 계속 돌아갑니다.';
    }
  }

  // ── 전체 학생 기록 초기화 ──
  // 버튼 하나로 학생 전원의 성적이 화면에서 사라지는 기능이다. 그래서
  //   ① 교수 로그인을 마친 뒤에만 보이고(showTools)
  //   ② 확인 문구를 직접 입력받고
  //   ③ 서버는 지우지 않고 보관 탭으로 옮긴다
  // 셋을 다 건다. 실수로 눌렀을 때 되돌릴 수 없는 것이 가장 위험하다.
  const resetAllBtn = document.getElementById('btn-reset-all');
  if (resetAllBtn) resetAllBtn.addEventListener('click', async () => {
    const rmsg = document.getElementById('reset-all-msg');
    const id = document.getElementById('inp-prof-id').value.trim();
    const pw = document.getElementById('inp-prof-pw').value;
    if (!UI.profVerified) {
      rmsg.className = 'err';
      rmsg.textContent = '먼저 「결과 불러오기」로 교수 로그인을 해 주세요.';
      return;
    }
    const typed = prompt(
      '구글 시트에 모인 모든 학생의 제출 기록을 비웁니다.\n' +
      '(지워지지 않고 「결과_보관_날짜시간」 탭으로 옮겨집니다)\n\n' +
      '계속하려면 아래에 초기화 라고 입력하세요.');
    if (typed === null) return;
    if (typed.trim() !== '초기화') {
      rmsg.className = 'err';
      rmsg.textContent = '입력이 「초기화」와 달라 취소했습니다.';
      return;
    }
    resetAllBtn.disabled = true;
    rmsg.className = ''; rmsg.textContent = '초기화하는 중…';
    try {
      const r = await COLLECT.call({ action: 'reset', user: id, pw }, 30000);
      rmsg.className = 'ok';
      rmsg.textContent = r.moved
        ? '✓ ' + r.moved + '건을 「' + r.archive + '」 탭으로 옮기고 새로 시작합니다.'
        : '✓ 비울 기록이 없었습니다. 이미 비어 있습니다.';
      await load();      // 빈 목록으로 화면 갱신
    } catch (e) {
      rmsg.className = 'err';
      rmsg.textContent = '초기화 실패: ' + e.message +
        ' — 앱스크립트가 예전 버전이면 reset 기능이 없습니다. Code.gs 를 새 버전으로 교체하고 새 버전으로 배포하세요.';
    }
    resetAllBtn.disabled = false;
  });
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
  UI.selStage = null;
  UI.selIrr = null;
  UI.selTx = [];
  UI.selRx = {};
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
// 진단명 하나만 고르는 게 아니라 단계와 자극성까지 판정하게 한다.
// 같은 진단이라도 단계·자극성이 다르면 CPG 권고 중재와 용량이 달라지기
// 때문이고, 이 판정이 그대로 ⑤ 처방의 근거가 된다.
UI.STAGES = [
  { v: 'acute', label: '급성 (6주 미만)' },
  { v: 'subacute', label: '아급성 (6~12주)' },
  { v: 'chronic', label: '만성 (12주 초과 · 재발성)' },
];
UI.IRRITABILITY = [
  { v: 'high', label: '높음 — 안정 시·야간 통증, 가벼운 활동에도 유발되고 오래 간다' },
  { v: 'moderate', label: '중간 — 중등도 활동에서 유발되고 몇 분 안에 가라앉는다' },
  { v: 'low', label: '낮음 — 강한 활동에서만 나타나고 곧바로 가라앉는다' },
];

UI.renderDx = function () {
  const wrap = document.getElementById('dx-list');
  const radios = (name, opts, cls) => opts.map((o) =>
    '<label class="' + cls + '"><input type="radio" name="' + name + '" value="' + o.v + '"> ' + o.label + '</label>'
  ).join('');

  wrap.innerHTML =
    '<div class="dx-section"><h4>1) 감별진단 — 가장 가능성 높은 진단 하나 (' +
    UI.cur.diagnosisOptions.length + '개 중 택 1)</h4><div class="dx-grid">' +
    UI.cur.diagnosisOptions.map((d) =>
      '<label class="dx-opt"><input type="radio" name="dx" value="' + d.id + '"> ' + d.name + '</label>'
    ).join('') + '</div></div>' +
    '<div class="dx-section"><h4>2) 단계 — 발병 후 경과</h4>' +
    '<div class="dx-inline">' + radios('stage', UI.STAGES, 'dx-chip') + '</div></div>' +
    '<div class="dx-section"><h4>3) 자극성 (irritability) — 조직이 자극에 얼마나 예민한가</h4>' +
    '<div class="dx-note">치료 강도를 정하는 기준입니다. 자극성이 높으면 낮은 등급의 가동술과 통증 없는 범위의 운동으로, 낮으면 끝범위·고부하로 갑니다.</div>' +
    radios('irr', UI.IRRITABILITY, 'dx-opt') + '</div>';

  wrap.querySelectorAll('input[name="dx"]').forEach((r) =>
    r.addEventListener('change', () => { UI.selDx = r.value; }));
  wrap.querySelectorAll('input[name="stage"]').forEach((r) =>
    r.addEventListener('change', () => { UI.selStage = r.value; }));
  wrap.querySelectorAll('input[name="irr"]').forEach((r) =>
    r.addEventListener('change', () => { UI.selIrr = r.value; }));
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
      UI.renderRx();   // 고른 중재가 바뀌면 처방 화면도 따라간다
    });
  });
  UI.renderRx();
};

// ── ⑤ 중재 처방 ──
// ④에서 고른 중재마다 실제 적용 조건(강도·시간·횟수·표적)을 정하게 한다.
// 선택은 UI.selRx[중재id][항목id] = 값 으로 모인다.
UI.renderRx = function () {
  const wrap = document.getElementById('rx-list');
  if (!wrap || !UI.cur) return;
  const p = UI.cur;
  const chosen = p.treatments.filter((t) => UI.selTx.includes(t.id));

  if (!chosen.length) {
    wrap.innerHTML = '<div class="rx-empty">④ 치료계획에서 중재를 먼저 선택하세요.<br>' +
      '선택한 중재가 여기에 하나씩 카드로 나타나고, 카드마다 적용 조건을 정하게 됩니다.</div>';
    UI.updateRxBadge();
    return;
  }

  // 카드를 전부 펼쳐 두면 스크롤이 수천 픽셀이 된다.
  // 아직 안 끝난 것 중 첫 번째만 열고 나머지는 접어 둔다.
  const firstOpen = chosen.find((t) => {
    const cur = UI.selRx[t.id] || {};
    return RX.spec(p, t).fields.some((f) => cur[f.id] == null);
  });
  const totalFields = chosen.reduce((s, t) => s + RX.spec(p, t).fields.length, 0);
  const doneFields = chosen.reduce((s, t) => {
    const cur = UI.selRx[t.id] || {};
    return s + RX.spec(p, t).fields.filter((f) => cur[f.id] != null).length;
  }, 0);

  wrap.innerHTML = '<div class="rx-summary">처방 ' + chosen.length + '건 · 항목 ' +
    doneFields + '/' + totalFields + ' 작성' +
    (firstOpen ? '' : ' — <b class="ok">모두 완료</b>') + '</div>' +
    chosen.map((t) => {
    const spec = RX.spec(p, t);
    const cur = UI.selRx[t.id] || {};
    const fields = spec.fields.map((f) => {
      const opts = f.opts.map((o) => {
        const on = cur[f.id] === o.v;
        return '<label class="rx-opt' + (on ? ' on' : '') + '">' +
          '<input type="radio" name="rx-' + t.id + '-' + f.id + '" value="' + o.v + '"' + (on ? ' checked' : '') + '>' +
          '<span class="rx-opt-label">' + o.label + '</span>' +
          (o.note ? '<span class="rx-opt-note">' + o.note + '</span>' : '') + '</label>';
      }).join('');
      return '<div class="rx-field" data-tx="' + t.id + '" data-field="' + f.id + '">' +
        '<div class="rx-field-head">' + f.label +
        (f.hint ? '<span class="rx-hint">' + f.hint + '</span>' : '') + '</div>' +
        '<div class="rx-opts">' + opts + '</div></div>';
    }).join('');

    const total = spec.fields.length;
    const done = spec.fields.filter((f) => cur[f.id] != null).length;
    return '<details class="rx-card' + (done === total ? ' complete' : '') + '"' +
      (firstOpen && firstOpen.id === t.id ? ' open' : '') + '>' +
      '<summary><span class="rx-cat">' + spec.cat + '</span>' +
      '<span class="rx-tx-name">' + t.name + '</span>' +
      '<span class="rx-progress">' + done + '/' + total + '</span></summary>' +
      '<div class="rx-body"><div class="rx-proto">' + spec.name +
      (spec.ref ? '<div class="rx-ref">' + spec.ref + '</div>' : '') + '</div>' +
      fields +
      '<div class="rx-card-foot"><button type="button" class="rx-clear" data-tx="' + t.id + '">이 처방 초기화</button></div>' +
      '</div></details>';
  }).join('');

  wrap.querySelectorAll('.rx-field input').forEach((r) => {
    r.addEventListener('change', () => {
      const fld = r.closest('.rx-field');
      const txId = fld.dataset.tx;
      if (!UI.selRx[txId]) UI.selRx[txId] = {};
      UI.selRx[txId][fld.dataset.field] = r.value;
      fld.querySelectorAll('.rx-opt').forEach((l) => l.classList.toggle('on', l.contains(r)));
      UI.refreshRxProgress(txId);
      UI.updateRxBadge();
    });
  });
  wrap.querySelectorAll('.rx-clear').forEach((b) => {
    b.addEventListener('click', () => { delete UI.selRx[b.dataset.tx]; UI.renderRx(); });
  });
  UI.updateRxBadge();
};

// 카드를 다시 그리지 않고 진행 표시만 갱신한다 (열어 둔 카드가 닫히지 않도록)
UI.refreshRxProgress = function (txId) {
  const t = UI.cur.treatments.find((x) => x.id === txId);
  if (!t) return;
  const spec = RX.spec(UI.cur, t);
  const cur = UI.selRx[txId] || {};
  const done = spec.fields.filter((f) => cur[f.id] != null).length;
  const card = document.querySelector('.rx-field[data-tx="' + txId + '"]').closest('.rx-card');
  card.querySelector('.rx-progress').textContent = done + '/' + spec.fields.length;
  card.classList.toggle('complete', done === spec.fields.length);

  // 위쪽 요약 줄도 같이 갱신한다 (카드를 다시 그리지 않으므로 직접 고친다)
  const sum = document.querySelector('.rx-summary');
  if (!sum) return;
  const chosen = UI.cur.treatments.filter((x) => UI.selTx.includes(x.id));
  let tot = 0, got = 0;
  chosen.forEach((x) => {
    const sp = RX.spec(UI.cur, x); const c = UI.selRx[x.id] || {};
    tot += sp.fields.length;
    got += sp.fields.filter((f) => c[f.id] != null).length;
  });
  sum.innerHTML = '처방 ' + chosen.length + '건 · 항목 ' + got + '/' + tot + ' 작성' +
    (got === tot ? ' — <b class="ok">모두 완료</b>' : '');
};

// 미완성 처방 개수 = 탭 배지
UI.rxIncomplete = function () {
  if (!UI.cur) return [];
  return UI.cur.treatments.filter((t) => UI.selTx.includes(t.id)).filter((t) => {
    const spec = RX.spec(UI.cur, t);
    const cur = UI.selRx[t.id] || {};
    return spec.fields.some((f) => cur[f.id] == null);
  });
};

UI.updateRxBadge = function () {
  const el = document.getElementById('rx-badge');
  if (!el) return;
  const n = UI.rxIncomplete().length;
  el.textContent = n ? String(n) : '';
  el.className = 'tab-badge' + (n ? ' warn' : '');
};

// ── 채점 ──
UI.submit = async function () {
  if (!UI.cur || UI.busy) return;
  if (!UI.selDx) { alert('진단명을 선택하세요. (③ 진단 탭)'); UI.showTab('dx'); return; }
  if (!UI.selStage) { alert('단계(급성/아급성/만성)를 판정하세요. (③ 진단 탭)'); UI.showTab('dx'); return; }
  if (!UI.selIrr) { alert('자극성(irritability)을 판정하세요. (③ 진단 탭)'); UI.showTab('dx'); return; }
  if (UI.selTx.length === 0) { alert('치료계획을 1개 이상 선택하세요. (④ 치료계획 탭)'); UI.showTab('tx'); return; }
  const incomplete = UI.rxIncomplete();
  if (incomplete.length) {
    if (!confirm('처방이 끝나지 않은 중재가 ' + incomplete.length + '개 있습니다.\n\n' +
      incomplete.map((t) => '· ' + t.name).join('\n') +
      '\n\n비워 둔 항목은 0점으로 처리됩니다. 이대로 제출할까요?')) { UI.showTab('rx'); return; }
  }
  if (UI.apiChat.length < 2) {
    if (!confirm('문진 대화가 거의 없습니다. 이대로 제출할까요? (문진 점수가 낮아집니다)')) return;
  }
  UI.busy = true;
  const btn = document.getElementById('btn-submit');
  btn.disabled = true; btn.textContent = '채점 중... (AI가 문진을 평가하고 있습니다)';

  const p = UI.cur;
  // 1) 문진 평가
  // 몇 초째 기다리는지 보여 준다. 아무 변화가 없으면 학생은 멈춘 줄 알고
  // 새로고침해 버리는데, 그러면 진료 내용이 통째로 날아간다.
  const grade = await evaluateHistoryBounded(p, UI.apiChat, (sec) => {
    btn.textContent = '채점 중... (AI가 문진을 평가하고 있습니다 · ' + sec + '초)';
  });
  let histItems = grade.items;
  if (!grade.byAI && useAI()) {
    UI.toast('AI 채점이 늦어 키워드 채점으로 처리했습니다. 점수는 정상적으로 기록됩니다.', 6000);
  }
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

  // 3) 진단 채점 — 진단명 7점 + 단계 1.5점 + 자극성 1.5점
  let dxNameScore = 0;
  if (UI.selDx === p.correctDx) dxNameScore = 7;
  else if (p.partialDx.includes(UI.selDx)) dxNameScore = 3.5;
  const gradePick = (pick, right, partial) =>
    pick === right ? 1.5 : ((partial || []).includes(pick) ? 0.75 : 0);
  const stageScore = gradePick(UI.selStage, p.correctStage, p.partialStage);
  const irrScore = gradePick(UI.selIrr, p.correctIrritability, p.partialIrritability);
  const dxScore = round1(dxNameScore + stageScore + irrScore);

  // 4) 치료 채점 — 무엇을 할지
  const recTx = p.treatments.filter((t) => t.recommended);
  const gradeW = { A: 3, B: 2, C: 1 };
  const maxW = recTx.reduce((s, t) => s + (gradeW[t.grade] || 1), 0);
  const earned = recTx.filter((t) => UI.selTx.includes(t.id)).reduce((s, t) => s + (gradeW[t.grade] || 1), 0);
  const badCount = p.treatments.filter((t) => !t.recommended && UI.selTx.includes(t.id)).length;
  const txScore = round1(Math.max(0, Math.min(10, (earned / maxW) * 10 - badCount * 2)));

  // 5) 처방 채점 — 어떻게 할지
  // 고른 중재 중 "권고 중재이면서 정답 용량이 정의된 것"만 채점한다.
  // 비권고 중재를 고른 벌점은 ④에서 이미 매겨졌으므로 여기서 또 깎지 않는다.
  const rxDetail = [];
  p.treatments.forEach((t) => {
    if (!UI.selTx.includes(t.id)) return;
    const spec = RX.spec(p, t);
    const chosenRx = UI.selRx[t.id] || {};
    const acc = t.recommended ? RX.scoreOne(spec, chosenRx) : null;
    rxDetail.push({
      txId: t.id, txName: t.name, proto: spec.proto, protoName: spec.name,
      recommended: !!t.recommended, accuracy: acc, chosen: Object.assign({}, chosenRx),
    });
  });
  const graded = rxDetail.filter((d) => d.accuracy != null);
  const rxScore = graded.length
    ? round1((graded.reduce((s, d) => s + d.accuracy, 0) / graded.length) * 10) : 0;

  const record = {
    done: true, when: new Date().toISOString(),
    chat: UI.chat, performed: UI.performed.slice(),
    dx: UI.selDx, stage: UI.selStage, irritability: UI.selIrr,
    tx: UI.selTx.slice(), rx: JSON.parse(JSON.stringify(UI.selRx)), rxDetail,
    histItems,
    scores: {
      hist: histScore, exam: examScore, dx: dxScore, tx: txScore, rx: rxScore,
      dxName: dxNameScore, dxStage: stageScore, dxIrr: irrScore,
      total: round1(histScore + examScore + dxScore + txScore + rxScore),
    },
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
  // ⑤ 처방 단계가 생기기 전에 저장된 기록도 열 수 있어야 한다.
  // 그 시절 기록에는 rx·stage·irritability 가 아예 없으므로 0으로 채운다.
  const s = Object.assign({ rx: 0, dxName: r.scores.dx, dxStage: 0, dxIrr: 0 }, r.scores);
  const missedExams = p.requiredExams.filter((id) => !r.performed.includes(id));
  const relevant = new Set([...p.requiredExams, ...p.relatedExams]);
  const unnecessary = r.performed.filter((id) => !relevant.has(id));
  const dxChosen = p.diagnosisOptions.find((d) => d.id === r.dx);
  const dxCorrect = p.diagnosisOptions.find((d) => d.id === p.correctDx);
  const gradeLabel = { A: 'A(강력 권고)', B: 'B(권고)', C: 'C(약한 근거)', X: '비권고/부적절' };

  let html = '<div class="result-head"><h3>진료 결과 리포트 — ' + p.name + '</h3>' +
    '<div class="total-score">' + s.total + ' <small>/ 50점</small></div></div>';

  html += '<div class="score-row"><span class="score-label">① 문진</span>' + bar(s.hist, 10) + '</div>';
  html += '<div class="score-row"><span class="score-label">② 이학적 검사</span>' + bar(s.exam, 10) + '</div>';
  html += '<div class="score-row"><span class="score-label">③ 진단</span>' + bar(s.dx, 10) + '</div>';
  html += '<div class="score-row"><span class="score-label">④ 치료계획</span>' + bar(s.tx, 10) + '</div>';
  html += '<div class="score-row"><span class="score-label">⑤ 중재 처방</span>' + bar(s.rx == null ? 0 : s.rx, 10) + '</div>';

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

  // 진단 상세 — 진단명 · 단계 · 자극성
  const labelOf = (list, v) => { const o = list.find((x) => x.v === v); return o ? o.label : '(미선택)'; };
  const verdict = (got, full) => got === full ? 'ok' : got > 0 ? 'warn' : 'miss';
  html += '<details open><summary>③ 진단 해설 — ' + s.dx + '/10 ' +
    '(진단명 ' + s.dxName + '/7 · 단계 ' + s.dxStage + '/1.5 · 자극성 ' + s.dxIrr + '/1.5)</summary>';
  html += '<p>선택한 진단: <b class="' + verdict(s.dxName, 7) + '">' + (dxChosen ? dxChosen.name : '-') + '</b></p>';
  if (s.dxName < 7) html += '<p>정답: <b class="ok">' + dxCorrect.name + '</b></p>';
  html += '<p class="explain">' + p.dxExplanation + '</p>';

  html += '<table class="tx-table"><tr><th>판정 항목</th><th>내가 고른 것</th><th>정답</th><th>해설</th></tr>' +
    '<tr class="' + verdict(s.dxStage, 1.5) + '"><td>단계</td><td>' + labelOf(UI.STAGES, r.stage) + '</td>' +
    '<td>' + labelOf(UI.STAGES, p.correctStage) + '</td><td>' + p.stageNote + '</td></tr>' +
    '<tr class="' + verdict(s.dxIrr, 1.5) + '"><td>자극성</td><td>' + labelOf(UI.IRRITABILITY, r.irritability) + '</td>' +
    '<td>' + labelOf(UI.IRRITABILITY, p.correctIrritability) + '</td><td>' + p.irritabilityNote + '</td></tr>' +
    '</table></details>';

  // 치료 상세
  html += '<details open><summary>④ 치료계획 상세 (CPG 권고등급 기준)</summary><table class="tx-table"><tr><th>중재</th><th>등급</th><th>선택</th><th>비고</th></tr>';
  p.treatments.forEach((t) => {
    const sel = r.tx.includes(t.id);
    const cls = t.recommended ? (sel ? 'ok' : 'miss') : (sel ? 'bad-pick' : '');
    html += '<tr class="' + cls + '"><td>' + t.name + '</td><td>' + (gradeLabel[t.grade] || t.grade) + '</td><td>' +
      (sel ? '✔' : '—') + '</td><td>' + t.note + '</td></tr>';
  });
  html += '</table><p class="cpg-ref">근거: ' + p.cpgRef + '</p></details>';

  // 처방 상세 — 항목별로 내가 고른 값과 CPG 권장 용량을 나란히 놓는다
  const detail = r.rxDetail || [];
  const gradedRx = detail.filter((d) => d.accuracy != null);
  html += '<details open><summary>⑤ 중재 처방 상세 — ' + (s.rx == null ? 0 : s.rx) + '/10' +
    (gradedRx.length ? ' (채점 대상 ' + gradedRx.length + '건)' : '') + '</summary>';
  if (!detail.length) {
    html += '<p class="miss">처방한 중재가 없습니다.</p>';
  } else {
    detail.forEach((d) => {
      const t = p.treatments.find((x) => x.id === d.txId);
      if (!t) return;
      const spec = RX.spec(p, t);
      const pct = d.accuracy == null ? null : Math.round(d.accuracy * 100);
      html += '<div class="rx-result' + (d.accuracy == null ? ' unscored' : pct >= 80 ? ' good' : pct >= 50 ? ' mid' : ' bad') + '">' +
        '<div class="rx-result-head"><b>' + t.name + '</b>' +
        '<span class="rx-result-score">' + (pct == null ? '채점 제외 (이 환자에게 권고되지 않는 중재)' : '처방 정확도 ' + pct + '%') + '</span></div>' +
        '<div class="rx-result-proto">' + spec.name + '</div>';
      html += '<table class="tx-table"><tr><th>항목</th><th>내 처방</th><th>CPG 권장</th></tr>';
      spec.fields.forEach((f) => {
        const mine = (d.chosen || {})[f.id];
        const hasKey = spec.best[f.id] != null;
        const cls = !hasKey ? '' : RX.scoreField(spec, f.id, mine) === 1 ? 'ok'
          : RX.scoreField(spec, f.id, mine) === 0.5 ? 'warn' : 'miss';
        const bestV = hasKey ? (Array.isArray(spec.best[f.id]) ? spec.best[f.id][0] : spec.best[f.id]) : null;
        html += '<tr class="' + cls + '"><td>' + f.label + '</td>' +
          '<td>' + (mine ? RX.label(spec, f.id, mine) : '<i>미선택</i>') + '</td>' +
          '<td>' + (hasKey ? RX.label(spec, f.id, bestV) : '—') + '</td></tr>';
      });
      html += '</table>';
      if (spec.tip) html += '<p class="explain">' + spec.tip + '</p>';
      html += '</div>';
    });
  }
  html += '</details>';

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
    const s = r ? r.scores : { hist: '-', exam: '-', dx: '-', tx: '-', rx: '-', total: 0 };
    total += r ? s.total : 0;
    return '<tr><td>' + (i + 1) + '</td><td>' + p.name + '</td><td>' + p.cpgRef.split(':')[0] + '</td>' +
      '<td>' + s.hist + '</td><td>' + s.exam + '</td><td>' + s.dx + '</td><td>' + s.tx + '</td>' +
      '<td>' + (s.rx == null ? '-' : s.rx) + '</td><td><b>' + s.total + '</b></td></tr>';
  }).join('');
  const avg = round1(total / PATIENTS.length);
  const grade = avg >= 45 ? 'A' : avg >= 40 ? 'B' : avg >= 35 ? 'C' : avg >= 30 ? 'D' : 'F';
  document.getElementById('final-body').innerHTML =
    '<h2>종합 성적표</h2><p class="final-student">' + UI.studentLabel() + ' · ' + new Date().toLocaleDateString('ko-KR') + '</p>' +
    '<table class="final-table"><tr><th>베드</th><th>환자</th><th>질환(CPG)</th><th>문진</th><th>검사</th><th>진단</th><th>치료</th><th>처방</th><th>총점/50</th></tr>' +
    rows + '</table>' +
    '<div class="final-total">평균 <b>' + avg + '</b> / 50점 — 등급 <b class="final-grade">' + grade + '</b></div>' +
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
    txt += '  문진 ' + s.hist + '/10, 검사 ' + s.exam + '/10, 진단 ' + s.dx + '/10, 치료 ' + s.tx + '/10, 처방 ' +
      (s.rx == null ? 0 : s.rx) + '/10 → 총점 ' + s.total + '/50\n';
    const missed = r.histItems.filter((h) => !h.elicited).map((h) => h.label);
    if (missed.length) txt += '  · 놓친 문진: ' + missed.join(' / ') + '\n';
    const missedEx = p.requiredExams.filter((id) => !r.performed.includes(id)).map((id) => findExam(p.region, id).name);
    if (missedEx.length) txt += '  · 놓친 필수검사: ' + missedEx.join(' / ') + '\n';
    if (r.stage !== p.correctStage) txt += '  · 단계 판정 오답 (정답: ' + p.correctStage + ')\n';
    if (r.irritability !== p.correctIrritability) txt += '  · 자극성 판정 오답 (정답: ' + p.correctIrritability + ')\n';
    (r.rxDetail || []).filter((d) => d.accuracy != null && d.accuracy < 0.8).forEach((d) => {
      txt += '  · 처방 용량 미흡: ' + d.txName + ' (' + Math.round(d.accuracy * 100) + '%)\n';
    });
  });
  txt += '\n' + '='.repeat(60) + '\n평균: ' + round1(total / PATIENTS.length) + ' / 50\n';
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
