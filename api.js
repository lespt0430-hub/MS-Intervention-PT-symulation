// 문진 엔진 — 두 가지 모드
//  ① 내장 답변 모드(기본): 환자 데이터(keyHistory[].answer)를 키워드 매칭으로 답변. API 키 불필요.
//  ② AI 모드: Google Gemini 로 실시간 롤플레이 대화.
//
// AI 모드에서 키를 구하는 길은 두 가지다.
//
//   ㉠ 중계(기본) — 교수님이 구글 Apps Script 의 '스크립트 속성'에 키를 넣어 두면,
//      학생 브라우저는 키를 모른 채 그 주소로 질문만 보낸다. 학생이 키를 입력할
//      일도, 페이지 소스에서 키가 새어 나갈 일도 없다.
//   ㉡ 이 PC 키 — 교수님이 자기 PC 브라우저에 직접 등록한 키. 인터넷 수집처를
//      안 쓰거나 혼자 시험해 볼 때를 위해 남겨 둔다. 등록돼 있으면 이쪽이 우선.
//
// 정적 사이트라 소스가 그대로 공개된다. 그래서 키는 코드에도 config.js 에도
// 두지 않는다 — 적어 두는 순간 학생 누구나 소스 보기로 꺼내 갈 수 있다.
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/';

// 이 브라우저에 교수님이 직접 등록해 둔 키 (교수 모드 입력칸)
function getStoredKey() { return localStorage.getItem('ptsim_gemini_key') || ''; }

// 실제로 호출에 쓸 키.
//   ㉠ 이 PC에 등록한 키가 있으면 그것
//   ㉡ 없으면 config.js 의 geminiKey (교수님이 미리 넣어 둔 공용 키)
// 둘 다 없으면 중계(Apps Script)를 쓴다.
function getApiKey() {
  const local = getStoredKey();
  if (local) return local;
  return (((window.PTSIM_CONFIG || {}).geminiKey) || '').trim();
}
function hasApiKey() { return getApiKey().length > 0; }

// 중계 사용 가능 여부. 시작 화면에서 한 번 물어보고 기억해 둔다.
const AI_RELAY = { ready: false, checked: false };

async function probeAiRelay() {
  AI_RELAY.checked = true;
  AI_RELAY.ready = false;
  if (!window.COLLECT || !COLLECT.enabled()) return false;
  try {
    const data = await COLLECT.call({ action: 'ai_status' }, 8000);
    AI_RELAY.ready = !!data.ai;
  } catch (e) {
    AI_RELAY.ready = false;   // 옛 버전 스크립트거나 인터넷이 막힌 실습실
  }
  return AI_RELAY.ready;
}

// AI 문진을 지금 쓸 수 있는가 (학생 화면의 안내·차단 판단용)
function aiAvailable() { return hasApiKey() || AI_RELAY.ready; }
// 기본 모델 — 가벼운 것으로 잡는다.
//
// 환자 역할은 1~3문장 대답이라 큰 모델이 필요 없다. 오히려 'latest' 계열은
// 답을 쓰기 전에 '생각'을 오래 하고, 붐빌 때는 아예 응답하지 않는다.
// 실측(문진 한 마디):
//   gemini-flash-latest       30초 넘도록 무응답
//   gemini-flash-lite-latest  1.2초 · 생각 0토큰
//   gemini-3.5-flash          2.5초 · 생각 419토큰
// ── 어느 회사의 AI를 쓸 것인가 ──────────────────────────────
//
// 문진은 "환자 역할로 짧게 대답하기"라 회사가 달라도 하는 일은 같다.
// 다른 것은 주소·헤더·요청/응답 모양뿐이라, 그 셋만 표로 두고 나머지 코드는
// 공통으로 쓴다. 교수님이 가진 키가 무엇이든 그걸로 수업할 수 있어야 한다.
//
// 브라우저에서 직접 부르는 방식이라 회사마다 사정이 다르다:
//   · Gemini  — 키를 주소에 붙인다. CORS 허용.
//   · OpenAI  — Authorization 헤더. CORS 허용.
//   · Claude  — 기본적으로 브라우저 호출을 막는다. 전용 헤더를 붙여야 열린다.
// 어느 쪽이든 브라우저에 키가 있으면 학생이 꺼내 볼 수 있다. 그래서 실제
// 수업에서는 중계(교수님 Apps Script)를 쓰고, 아래 직접 호출은 교수님이
// 본인 PC에서 시험해 볼 때만 쓰는 길이다.
const AI_PROVIDERS = {
  gemini: {
    label: 'Google Gemini',
    hint: 'AIza… 로 시작',
    detect: (k) => /^AIza/.test(k),
    models: ['gemini-flash-lite-latest', 'gemini-3.5-flash', 'gemini-flash-latest', 'gemini-pro-latest'],
    fast: 'gemini-flash-lite-latest',
    judge: 'gemini-3.5-flash',
    issue: 'https://aistudio.google.com/apikey',
  },
  openai: {
    label: 'OpenAI GPT',
    hint: 'sk-… 로 시작',
    detect: (k) => /^sk-(?!ant-)/.test(k),
    models: ['gpt-4.1-mini', 'gpt-4.1', 'gpt-4o-mini', 'gpt-4o'],
    fast: 'gpt-4.1-mini',
    judge: 'gpt-4.1',
    issue: 'https://platform.openai.com/api-keys',
  },
  anthropic: {
    label: 'Anthropic Claude',
    hint: 'sk-ant-… 로 시작',
    detect: (k) => /^sk-ant-/.test(k),
    models: ['claude-haiku-4-5-20251001', 'claude-sonnet-5', 'claude-opus-5'],
    fast: 'claude-haiku-4-5-20251001',
    judge: 'claude-sonnet-5',
    issue: 'https://console.anthropic.com/settings/keys',
  },
};

// 지금 쓸 회사. 교수님이 고른 값이 있으면 그것, 없으면 키 생김새로 알아낸다 —
// 키를 붙여넣기만 해도 어느 회사인지 대개 알 수 있다(AIza / sk- / sk-ant-).
function getProvider() {
  const saved = localStorage.getItem('ptsim_ai_provider') || '';
  if (AI_PROVIDERS[saved]) return saved;
  const key = getApiKey();
  if (key) {
    const hit = Object.keys(AI_PROVIDERS).find((p) => AI_PROVIDERS[p].detect(key));
    if (hit) return hit;
  }
  return 'gemini';
}
function providerInfo(p) { return AI_PROVIDERS[p || getProvider()] || AI_PROVIDERS.gemini; }

// 회사를 바꾸면 모델도 그 회사 것으로 갈아 끼운다. 안 그러면 Claude 를 골라
// 놓고 gemini-flash 를 부르게 된다.
function setProvider(p) {
  if (!AI_PROVIDERS[p]) return;
  localStorage.setItem('ptsim_ai_provider', p);
  const cur = localStorage.getItem('ptsim_model') || '';
  if (!AI_PROVIDERS[p].models.includes(cur)) {
    localStorage.setItem('ptsim_model', AI_PROVIDERS[p].fast);
  }
}

// 환자 역할은 1~3문장 대답이라 큰 모델이 필요 없다. 회사별 '빠른 모델'이 기본.
function getModel() {
  const info = providerInfo();
  const m = localStorage.getItem('ptsim_model') || '';
  // 저장된 모델이 지금 회사 것이 아니면 무시한다 (회사를 바꾼 직후)
  return (m && (info.models.includes(m) || info.detect === undefined)) ? m
    : (m && looksLikeModelOf(m, info)) ? m : info.fast;
}

// 목록에 없는 모델이라도 이름이 그 회사 것처럼 생겼으면 존중한다 —
// 교수님이 새 모델 이름을 직접 적어 넣을 수 있어야 한다.
function looksLikeModelOf(id, info) {
  if (info === AI_PROVIDERS.gemini) return /^gemini/.test(id);
  if (info === AI_PROVIDERS.openai) return /^(gpt|o\d)/.test(id);
  if (info === AI_PROVIDERS.anthropic) return /^claude/.test(id);
  return false;
}

// 채점처럼 판단이 필요한 일은 조금 더 큰 모델로. 학생 성적이 걸려 있다.
function judgeModel() { return providerInfo().judge; }

// 사용 가능한 Gemini 모델 목록 조회 (키 등록 시 드롭다운 자동 구성)
async function listGeminiModels() {
  const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=200&key=' + encodeURIComponent(getApiKey()));
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err.error && err.error.message) || '모델 목록 조회 실패 (' + res.status + ')');
  }
  const data = await res.json();
  return (data.models || [])
    .filter((m) =>
      (m.supportedGenerationMethods || []).includes('generateContent') &&
      /gemini/.test(m.name) &&
      !/tts|image|live|audio|embed|native|robotics/.test(m.name))
    .map((m) => ({ id: m.name.replace(/^models\//, ''), label: m.displayName || m.name.replace(/^models\//, '') }));
}

// 목록에서 기본 모델 선택: flash 계열 최신 우선
function pickDefaultModel(models) {
  const ids = models.map((m) => m.id);
  if (ids.includes('gemini-flash-latest')) return 'gemini-flash-latest';
  const ver = (id) => { const m = id.match(/gemini-(\d+(?:\.\d+)?)/); return m ? parseFloat(m[1]) : 0; };
  const flash = ids.filter((id) => id.includes('flash') && !id.includes('lite'))
    .sort((a, b) => ver(b) - ver(a) || a.length - b.length);
  return flash[0] || ids[0];
}
// 문진 방식. 학생이 시작 화면에서 직접 고른 적이 있으면 그 선택을 존중하고,
// 고른 적이 없으면 **쓸 수 있는 쪽을 자동으로 고른다** — 교수님이 키를 등록해
// 두었는데도 학생이 매번 라디오를 직접 눌러야 했던 것이 문제였다.
// (저장값이 아예 없을 때만 자동 판정한다. 'offline' 이 저장돼 있으면 그건
//  학생이 일부러 내장 답변을 고른 것이므로 건드리지 않는다.)
function getChatMode() {
  const saved = localStorage.getItem('ptsim_mode');
  if (saved === 'ai' || saved === 'offline') return saved;
  return aiAvailable() ? 'ai' : 'offline';
}
function useAI() { return getChatMode() === 'ai' && aiAvailable(); }

// ── Gemini 호출 ──
//
// 요즘 flash 모델은 답을 쓰기 전에 '생각'하는 데도 토큰을 쓴다. 한도가 빠듯하면
// 생각만 하다 한도에 걸려 본문이 빈 채로 돌아온다 (실측: 한 마디 인사에 생각
// 244토큰). 그럴 때 한 번은 한도를 크게 잡아 다시 물어본다 — 학생 화면에
// "응답이 비어 있습니다" 를 띄우는 것보다 낫다.
// 모델이 붐비거나 응답이 없을 때 갈아탈 후보. 수업 중에 한 모델이 막혔다고
// 문진 전체가 멈추면 안 된다 — 실제로 gemini-flash-latest 가 무응답이었다.
// 다음 모델로 넘어가야 하는 사정들.
//
// 붐빔(503)뿐 아니라 '이 요금제에서는 못 쓰는 모델'도 여기 들어간다.
// 무료 요금제는 Pro 계열이 limit: 0 이라 아예 거절당한다 — 교수님이 모델
// 목록에서 Pro 를 골라 두면 학생 전원이 그 오류를 보게 된다.
const BUSY = /high demand|overload|unavailable|503|try again later|응답이 없습니다|quota|resource.?exhausted|rate limit|429|exceeded/i;
// 한 모델을 기다려 주는 시간. 이게 없으면 학생 화면이 하염없이 멈춰 있는다.
const CALL_TIMEOUT = 20000;
// 중계(Apps Script)를 기다려 주는 시간. 직접 호출보다 한 단계를 더 거치므로
// 조금 넉넉하게 두되, 폴백이 제때 돌 만큼은 짧아야 한다.
const RELAY_TIMEOUT = 25000;
// 채점 전체에 허용하는 시간. 이 안에 못 끝내면 키워드 채점으로 넘긴다 —
// 학생을 '채점 중...' 화면에 몇 분씩 세워 두는 것보다 낫다.
const GRADE_DEADLINE = 30000;

async function callAI(system, messages, maxTokens, jsonMode, prefer) {
  const budget = maxTokens || 1024;
  const first = prefer || getModel();
  // 갈아탈 후보도 지금 회사 것이어야 한다. 예전에는 Gemini 목록이 박혀 있어
  // Claude 를 쓰다 붐비면 gemini-3.5-flash 를 부르고 또 실패했다.
  const info = providerInfo();
  const models = [first].concat(info.models.filter((m) => m !== first));
  let lastErr = null;
  for (const model of models) {
    try {
      const out = await aiOnce(system, messages, budget, jsonMode, model);
      // 처음 고른 모델이 막혀서 여기까지 왔다면, 되는 모델을 기억해 둔다.
      // 안 그러면 학생이 질문할 때마다 같은 오류를 한 번씩 다시 겪는다.
      if (model !== first && !prefer) rememberModel(model);
      return out;
    } catch (e) {
      lastErr = e;
      if (/MAX_TOKENS|비어 있습니다/.test(e.message || '')) {
        try { return await aiOnce(system, messages, budget * 3, jsonMode, model); }
        catch (e2) { lastErr = e2; }
      }
      if (!BUSY.test(lastErr.message || '')) throw lastErr;   // 붐빔이 아니면 그대로 알린다
      console.warn('[ai] ' + model + ' 사용 불가 — 다음 모델로 넘어갑니다: ' + lastErr.message);
    }
  }
  throw lastErr;
}

// 실제로 응답한 모델을 이 브라우저에 저장한다.
// (교수님이 Pro 를 골라 뒀는데 무료 요금제라 limit:0 이던 경우가 그랬다)
function rememberModel(model) {
  try {
    localStorage.setItem('ptsim_model', model);
    const sel = document.getElementById('inp-model');
    if (sel && [...sel.options].some((o) => o.value === model)) sel.value = model;
    if (window.UI && UI.updateModeStatus) UI.updateModeStatus();
  } catch (e) { /* 저장 실패는 무시 — 다음 호출에서 다시 넘어가면 된다 */ }
}

async function aiOnce(system, messages, maxTokens, jsonMode, model) {
  model = model || getModel();
  const budget = maxTokens || 1024;
  if (!hasApiKey() && AI_RELAY.ready) {
    // 중계 — 키는 교수님 스크립트 안에 있고 여기서는 질문만 보낸다.
    // 어느 회사인지도 같이 넘긴다. 서버가 회사를 알아야 부를 주소를 정한다.
    // 중계도 직접 호출과 같은 시간만 기다린다. 예전에는 60초였는데, 그러면
    // 한 모델이 멈췄을 때 다음 모델로 넘어가기까지 1분을 서 있었고 채점이
    // 몇 분씩 걸렸다. 여기서 끊어야 폴백이 제때 돈다.
    const data = await COLLECT.call({
      action: 'ai',
      provider: getProvider(),
      model: model,
      system, messages,
      maxTokens: budget,
      jsonMode: !!jsonMode,
    }, RELAY_TIMEOUT);
    return data.text || '';
  }

  const provider = getProvider();
  const req = buildAiRequest(provider, system, messages, budget, jsonMode, model);
  let res;
  try {
    res = await fetch(req.url, {
      method: 'POST',
      headers: req.headers,
      body: JSON.stringify(req.body),
      signal: AbortSignal.timeout(CALL_TIMEOUT),
    });
  } catch (e) {
    // 시간 초과·연결 끊김 — 붐빔과 같이 취급해 다음 모델로 넘긴다.
    // Claude 는 브라우저 직접 호출이 막히면 여기로 떨어진다(CORS).
    throw new Error(model + ' 이(가) ' + Math.round(CALL_TIMEOUT / 1000) + '초 동안 응답이 없습니다');
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const msg = (err.error && (err.error.message || err.error.type)) || err.message;
    throw new Error(msg || 'API 오류 (' + res.status + ')');
  }
  const data = await res.json();
  const text = readAiText(provider, data);
  if (!text) throw new Error('응답이 비어 있습니다' + (data.stop_reason ? ' (' + data.stop_reason + ')' : ''));
  return text;
}

// 회사별 요청 만들기 — 주소·헤더·본문 모양만 다르다.
function buildAiRequest(provider, system, messages, maxTokens, jsonMode, model) {
  const key = getApiKey();
  if (provider === 'openai') {
    const body = {
      model: model,
      max_completion_tokens: maxTokens,
      messages: [{ role: 'system', content: system }].concat(
        messages.map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content }))),
    };
    if (jsonMode) body.response_format = { type: 'json_object' };
    return {
      url: 'https://api.openai.com/v1/chat/completions',
      headers: { 'content-type': 'application/json', authorization: 'Bearer ' + key },
      body,
    };
  }
  if (provider === 'anthropic') {
    // system 은 별도 필드다. JSON 모드가 따로 없어 지시로 대신한다.
    const body = {
      model: model,
      max_tokens: maxTokens,
      system: system + (jsonMode ? '\n\n반드시 JSON 하나만 출력한다. 설명·코드펜스를 붙이지 않는다.' : ''),
      messages: messages.map((m) => ({
        role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content,
      })),
    };
    return {
      url: 'https://api.anthropic.com/v1/messages',
      headers: {
        'content-type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        // 이 헤더가 없으면 브라우저에서의 호출을 아예 거절한다
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body,
    };
  }
  // gemini (기본)
  const body = {
    system_instruction: { parts: [{ text: system }] },
    contents: messages.map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    })),
    generationConfig: { maxOutputTokens: maxTokens, temperature: 0.7 },
  };
  if (jsonMode) body.generationConfig.responseMimeType = 'application/json';
  return {
    url: GEMINI_URL + model + ':generateContent?key=' + encodeURIComponent(key),
    headers: { 'content-type': 'application/json' },
    body,
  };
}

// 회사별 응답에서 본문만 꺼낸다.
function readAiText(provider, data) {
  if (provider === 'openai') {
    const c = data.choices && data.choices[0];
    return (c && c.message && c.message.content) || '';
  }
  if (provider === 'anthropic') {
    return (data.content || []).map((b) => b.text || '').join('');
  }
  const cand = data.candidates && data.candidates[0];
  const parts = cand && cand.content && cand.content.parts;
  return parts ? parts.map((p) => p.text || '').join('') : '';
}

// ── 가상환자 시스템 프롬프트 (AI 모드) ──
const PATIENT_COMMON_RULES = `너는 물리치료 실습교육용 "가상환자"다. 아래 시나리오의 인물을 일관되게 연기한다.

[절대 규칙]
1. 일반인의 언어로 말한다. 의학용어(돌림근띠, 신경뿌리병증, ROM 등)를 모르고 쓰지 않는다.
2. 답변은 1~3문장으로 짧게. 묻지 않은 정보는 먼저 말하지 않는다.
3. 진단명을 절대 말하지 않는다. 진단을 물으면 "그건 선생님이 봐주셔야죠"라고 답한다.
4. 시나리오에 명시된 의학적 사실과 절대 모순되게 답하지 않는다. 사소한 생활 정보는 인물에 맞게 자연스럽게 지어내도 된다.
5. 적신호 관련 질문(발열, 체중감소, 야간통, 대소변, 저림 등)에는 시나리오에 명시된 대로 정확히 답한다.
6. 치료와 무관하거나 부적절한 질문에는 어리둥절해하며 짧게 반응하고 본래 화제로 돌아온다.
7. 학생(물리치료사)이 인사하면 자연스럽게 인사하고 주호소를 한 마디로 말할 수 있다.
8. 반드시 한국어로, 시나리오의 성격·말투를 유지하며 답한다.

[환자 시나리오]
`;

function buildPatientSystem(patient) {
  return PATIENT_COMMON_RULES + patient.persona;
}

// ── 내장 답변 모드 (오프라인) ──
const OFFLINE_CONFUSED = [
  '네? 그건 잘... 저는 아파서 온 거라 잘 모르겠어요.',
  '음... 글쎄요. 궁금하신 건 제 증상에 대해 편하게 물어봐 주세요.',
  '그건 잘 모르겠어요. 아픈 것에 대해 물어봐 주시면 아는 대로 말씀드릴게요.',
];

function offlineReply(patient, chatHistory) {
  const text = (chatHistory[chatHistory.length - 1] || {}).content || '';
  // 진단을 물으면
  if (/진단|병명|무슨 병|뭐가 문제|병인가/.test(text)) {
    return '그건 선생님이 봐주셔야죠... 저는 잘 모르겠어요.';
  }
  // 핵심 문진 항목 키워드 매칭 (매칭 수 상위 2개 항목 답변)
  const scored = patient.keyHistory
    .map((k) => ({ k, n: k.keywords.filter((kw) => text.includes(kw)).length }))
    .filter((s) => s.n > 0)
    .sort((a, b) => b.n - a.n)
    .slice(0, 2);
  if (scored.length) {
    const reply = scored.map((s) => s.k.answer).filter(Boolean).join(' ');
    if (reply) {
      const repeated = chatHistory.some((m) => m.role === 'assistant' && m.content.includes(reply));
      return repeated ? '아까도 말씀드렸는데... ' + reply : reply;
    }
  }
  // 인사
  const userTurns = chatHistory.filter((m) => m.role === 'user').length;
  if (/안녕|반갑|처음 뵙|어서 오/.test(text)) {
    return '안녕하세요, 선생님. ' + patient.chiefComplaint + '.';
  }
  // 무관한 질문
  return OFFLINE_CONFUSED[(userTurns - 1 + OFFLINE_CONFUSED.length) % OFFLINE_CONFUSED.length];
}

// ── 문진 대화 ──
async function patientChat(patient, chatHistory) {
  // chatHistory: [{role:'user'|'assistant', content:'...'}]
  if (!useAI()) {
    await new Promise((r) => setTimeout(r, 350 + Math.random() * 450)); // 자연스러운 타이핑 지연
    return offlineReply(patient, chatHistory);
  }
  return callAI(buildPatientSystem(patient), chatHistory, 2048);
}

// ── 문진 평가 (채점) ──
// 채점은 정해진 시간 안에 끝나야 한다. AI 가 늦으면 키워드 채점으로 넘긴다 —
// 두 방식 모두 같은 형식({id, elicited})을 돌려주므로 뒤쪽 코드는 그대로 돈다.
// 학생 입장에서 '채점 중...' 이 몇 분 걸리는 것보다, 조금 거칠어도 제때
// 점수가 나오는 편이 낫다.
async function evaluateHistoryBounded(patient, chatHistory, onTick) {
  if (!useAI()) return { items: evaluateHistoryFallback(patient, chatHistory), byAI: false };
  const t0 = Date.now();
  const tick = onTick && setInterval(() => onTick(Math.round((Date.now() - t0) / 1000)), 1000);
  try {
    const items = await Promise.race([
      evaluateHistory(patient, chatHistory),
      new Promise((_, no) => setTimeout(() => no(new Error('채점 시간 초과')), GRADE_DEADLINE)),
    ]);
    return { items, byAI: true };
  } catch (e) {
    console.warn('[채점] AI 평가를 쓰지 못해 키워드 채점으로 넘어갑니다: ' + e.message);
    return { items: evaluateHistoryFallback(patient, chatHistory), byAI: false };
  } finally {
    if (tick) clearInterval(tick);
  }
}

async function evaluateHistory(patient, chatHistory) {
  if (!useAI()) return evaluateHistoryFallback(patient, chatHistory);
  const transcript = chatHistory
    .map((m) => (m.role === 'user' ? '학생: ' : '환자: ') + m.content)
    .join('\n');
  const itemList = patient.keyHistory
    .map((k) => `- id:"${k.id}" — ${k.label}`)
    .join('\n');
  // 근거 문장(evidence)은 예전에 같이 받았는데 화면에도 성적표에도 쓰지 않았다.
  // 항목이 열 개 넘게 있으니 그만큼을 매번 지어내느라 채점이 느렸다 —
  // 출력 토큰이 대기 시간을 좌우한다. id 와 참/거짓만 받는다.
  const system = `너는 물리치료 교육 평가자다. 학생과 가상환자의 문진 대화를 보고, 학생이 각 핵심 문진 항목을 질문을 통해 이끌어냈는지(elicited) 판정한다.
- 직접적 질문이 아니어도 해당 정보가 학생의 질문으로 대화에 드러났으면 elicited=true.
- 환자가 먼저 자발적으로 말한 것만 있고 학생이 묻지 않았으면 false.
- 설명·근거를 쓰지 말고 JSON만 출력한다. 다른 텍스트 금지.
형식: {"items":[{"id":"...","elicited":true}]}`;
  const user = `[핵심 문진 항목]\n${itemList}\n\n[문진 대화]\n${transcript}`;
  // 한도는 항목 수에 맞춰 잡는다. 4096 을 늘 요구하면 '생각'에 그만큼 쓰는
  // 모델이 있어 느려지고, 너무 작게 잡으면 잘려서 3배로 재시도하느라 더 느리다.
  const budget = Math.max(600, patient.keyHistory.length * 60 + 300);
  const raw = await callAI(system, [{ role: 'user', content: user }], budget, true, judgeModel());
  let parsed;
  try { parsed = JSON.parse(raw); }
  catch (e) {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('평가 응답 파싱 실패');
    parsed = JSON.parse(jsonMatch[0]);
  }
  return parsed.items || [];
}

// 키워드 매칭 채점 (내장 답변 모드 기본 채점 / AI 실패 시 폴백)
function evaluateHistoryFallback(patient, chatHistory) {
  const studentText = chatHistory
    .filter((m) => m.role === 'user')
    .map((m) => m.content)
    .join(' ');
  return patient.keyHistory.map((k) => ({
    id: k.id,
    elicited: k.keywords.some((kw) => studentText.includes(kw)),
    evidence: '(키워드 기반 판정)',
  }));
}

// API 키 유효성 확인 (교수 모드 연결 테스트)
async function testApiKey() {
  await callAI('한 단어로만 답하라.', [{ role: 'user', content: '안녕' }], 512);
  return true;
}
