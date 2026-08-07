// 문진 엔진 — 두 가지 모드
//  ① 내장 답변 모드(기본): 환자 데이터(keyHistory[].answer)를 키워드 매칭으로 답변. API 키 불필요.
//  ② AI 모드: 교수 모드에서 등록한 Google Gemini API 키로 실시간 롤플레이 대화.
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/';

function getApiKey() { return localStorage.getItem('ptsim_gemini_key') || ''; }
function hasApiKey() { return getApiKey().length > 0; }
function getModel() {
  const m = localStorage.getItem('ptsim_model') || '';
  return m.startsWith('gemini') ? m : 'gemini-flash-latest';
}

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
function useAI() { return getChatMode() === 'ai' && hasApiKey(); }

// ── Gemini API 호출 ──
async function callGemini(system, messages, maxTokens, jsonMode) {
  const model = getModel();
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
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
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
  const raw = await callGemini(system, [{ role: 'user', content: user }], 4096, true);
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
