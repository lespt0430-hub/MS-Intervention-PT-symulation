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
function getModel() {
  const m = localStorage.getItem('ptsim_model') || '';
  return m.startsWith('gemini') ? m : 'gemini-flash-lite-latest';
}

// 채점처럼 판단이 필요한 일은 조금 더 큰 모델로. 학생 성적이 걸려 있다.
const JUDGE_MODEL = 'gemini-3.5-flash';

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
function getChatMode() { return localStorage.getItem('ptsim_mode') === 'ai' ? 'ai' : 'offline'; }
function useAI() { return getChatMode() === 'ai' && aiAvailable(); }

// ── Gemini 호출 ──
//
// 요즘 flash 모델은 답을 쓰기 전에 '생각'하는 데도 토큰을 쓴다. 한도가 빠듯하면
// 생각만 하다 한도에 걸려 본문이 빈 채로 돌아온다 (실측: 한 마디 인사에 생각
// 244토큰). 그럴 때 한 번은 한도를 크게 잡아 다시 물어본다 — 학생 화면에
// "응답이 비어 있습니다" 를 띄우는 것보다 낫다.
// 모델이 붐비거나 응답이 없을 때 갈아탈 후보. 수업 중에 한 모델이 막혔다고
// 문진 전체가 멈추면 안 된다 — 실제로 gemini-flash-latest 가 무응답이었다.
const FALLBACK_MODELS = ['gemini-3.5-flash', 'gemini-flash-latest'];
const BUSY = /high demand|overload|unavailable|503|try again later|응답이 없습니다/i;
// 한 모델을 기다려 주는 시간. 이게 없으면 학생 화면이 하염없이 멈춰 있는다.
const CALL_TIMEOUT = 20000;

async function callGemini(system, messages, maxTokens, jsonMode, prefer) {
  const budget = maxTokens || 1024;
  const first = prefer || getModel();
  const models = [first].concat(FALLBACK_MODELS.filter((m) => m !== first));
  let lastErr = null;
  for (const model of models) {
    try {
      return await geminiOnce(system, messages, budget, jsonMode, model);
    } catch (e) {
      lastErr = e;
      if (/MAX_TOKENS|비어 있습니다/.test(e.message || '')) {
        try { return await geminiOnce(system, messages, budget * 3, jsonMode, model); }
        catch (e2) { lastErr = e2; }
      }
      if (!BUSY.test(lastErr.message || '')) throw lastErr;   // 붐빔이 아니면 그대로 알린다
      console.warn('[ai] ' + model + ' 혼잡 — 다음 모델로 넘어갑니다');
    }
  }
  throw lastErr;
}

async function geminiOnce(system, messages, maxTokens, jsonMode, model) {
  model = model || getModel();
  if (!hasApiKey() && AI_RELAY.ready) {
    // 중계 — 키는 교수님 스크립트 안에 있고 여기서는 질문만 보낸다
    const data = await COLLECT.call({
      action: 'ai',
      model: model,
      system, messages,
      maxTokens: maxTokens || 1024,
      jsonMode: !!jsonMode,
    }, 60000);
    return data.text || '';
  }
  const url = GEMINI_URL + model + ':generateContent?key=' + encodeURIComponent(getApiKey());
  const body = {
    system_instruction: { parts: [{ text: system }] },
    contents: messages.map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    })),
    generationConfig: { maxOutputTokens: maxTokens || 1024, temperature: 0.7 },
  };
  if (jsonMode) body.generationConfig.responseMimeType = 'application/json';
  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(CALL_TIMEOUT),
    });
  } catch (e) {
    // 시간 초과·연결 끊김 — 붐빔과 같이 취급해 다음 모델로 넘긴다
    throw new Error(model + ' 이(가) ' + Math.round(CALL_TIMEOUT / 1000) + '초 동안 응답이 없습니다');
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err.error && err.error.message) || 'API 오류 (' + res.status + ')');
  }
  const data = await res.json();
  const cand = data.candidates && data.candidates[0];
  const parts = cand && cand.content && cand.content.parts;
  if (!parts || !parts.length) {
    throw new Error('응답이 비어 있습니다' + (cand && cand.finishReason ? ' (' + cand.finishReason + ')' : ''));
  }
  return parts.map((p) => p.text || '').join('');
}

// ── 가상환자 시스템 프롬프트 (AI 모드) ──
const PATIENT_COMMON_RULES = `너는 물리치료 실습교육용 "가상환자"다. 아래 시나리오의 인물을 일관되게 연기한다.

[절대 규칙]
1. 일반인의 언어로 말한다. 의학용어(회전근개, 신경근병증, ROM 등)를 모르고 쓰지 않는다.
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
  return callGemini(buildPatientSystem(patient), chatHistory, 2048);
}

// ── 문진 평가 (채점) ──
async function evaluateHistory(patient, chatHistory) {
  if (!useAI()) return evaluateHistoryFallback(patient, chatHistory);
  const transcript = chatHistory
    .map((m) => (m.role === 'user' ? '학생: ' : '환자: ') + m.content)
    .join('\n');
  const itemList = patient.keyHistory
    .map((k) => `- id:"${k.id}" — ${k.label}`)
    .join('\n');
  const system = `너는 물리치료 교육 평가자다. 학생과 가상환자의 문진 대화를 보고, 학생이 각 핵심 문진 항목을 질문을 통해 이끌어냈는지(elicited) 판정한다.
- 직접적 질문이 아니어도 해당 정보가 학생의 질문으로 대화에 드러났으면 elicited=true.
- 환자가 먼저 자발적으로 말한 것만 있고 학생이 묻지 않았으면 false.
- 반드시 JSON만 출력한다. 다른 텍스트 금지.
형식: {"items":[{"id":"...","elicited":true,"evidence":"근거가 된 학생 질문 발췌(간단히)"}]}`;
  const user = `[핵심 문진 항목]\n${itemList}\n\n[문진 대화]\n${transcript}`;
  const raw = await callGemini(system, [{ role: 'user', content: user }], 4096, true, JUDGE_MODEL);
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
  await callGemini('한 단어로만 답하라.', [{ role: 'user', content: '안녕' }], 512);
  return true;
}
