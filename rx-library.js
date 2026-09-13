// 중재 처방 라이브러리 (Prescription library)
// ─────────────────────────────────────────────────────────────
// ④ 치료계획이 "무엇을 할지"라면, 이 파일은 "어떻게 할지"를 담는다.
// 학생이 TENS를 고르면 전극 위치·모드·주파수·펄스폭·강도·시간·빈도까지
// 실제 치료기를 세팅하듯 단계별로 고르게 하고, 운동치료를 고르면 표적 근육·
// 수축 형태·강도·세트/반복·빈도·진행 기준까지 처방하게 한다.
//
// 구조
//   RX.protos[protoId] = {
//     name, cat, ref,                       // 이름 / 분류 / 근거 표시
//     fields: [{ id, label, hint, opts:[{v,label,note}] }]
//   }
//   RX.plans['p1:t1'] = {                   // ← rx-plans.js 에 있다
//     proto, opts:{fieldId:[...]}, best:{fieldId:v}, ok:{fieldId:[v,...]}, tip
//   }
//
// 채점: 필드마다 best 일치 1점 / ok 일치 0.5점 / 그 외 0점.
//       환자에게 권고되는(recommended) 중재를 처방한 것만 채점한다.
//       (비권고 중재를 고른 벌점은 ④ 치료계획 점수에서 이미 반영된다)
//
// 새 치료기를 추가하려면 RX.protos 에 원형 하나를 더 쓰고,
// rx-plans.js 에서 해당 환자의 중재에 proto 이름과 정답을 연결하면 된다.

const RX = { protos: {}, plans: {} };

// ══════════════════════════════════════════════════════════════
// Ⅰ. 전기치료 · 물리적 인자 (Electrophysical agents)
// ══════════════════════════════════════════════════════════════

RX.protos.tens = {
  name: 'TENS — 경피신경전기자극', cat: '전기치료',
  ref: '전극은 자극이 목표 조직·분절을 지나가도록 놓는다. 모드에 따라 주파수·펄스폭·강도가 한 묶음으로 결정된다.',
  fields: [
    { id: 'site', label: '전극 부착 위치', hint: '전류가 목표 조직을 통과하도록 마주 보게 붙인다', opts: [
      { v: 'local', label: '통증 부위를 사이에 두고 국소 부착' },
      { v: 'derm', label: '해당 피부분절(dermatome) · 척수분절 위' },
      { v: 'nerve', label: '말초신경 주행 경로 위 (신경간 자극)' },
      { v: 'paraspinal', label: '척추 옆 해당 분절 (paraspinal)' },
      { v: 'contra', label: '반대측(건측) 대응 부위' },
      { v: 'trigger', label: '통증유발점 · 침 경혈점' },
    ]},
    { id: 'mode', label: '자극 모드', opts: [
      { v: 'conventional', label: '통상형 (conventional — 고빈도·저강도)', note: '관문조절, 즉시 진통, 지속 짧음' },
      { v: 'acupuncture', label: '침형 (acupuncture-like — 저빈도·고강도)', note: '내인성 아편유사물질, 지연 진통, 지속 김' },
      { v: 'burst', label: '버스트 (burst — 저빈도 다발)', note: '침형의 불편함을 줄인 절충형' },
      { v: 'brief_intense', label: '강한 단시간형 (brief-intense)', note: '술기 전 국소 진통' },
      { v: 'modulated', label: '조절형 (modulated — 순응 방지)' },
    ]},
    { id: 'freq', label: '주파수 (pulse rate)', opts: [
      { v: 'f2', label: '2 Hz' }, { v: 'f10', label: '10 Hz' }, { v: 'f50', label: '50 Hz' },
      { v: 'f100', label: '80~100 Hz' }, { v: 'f150', label: '150 Hz 이상' },
    ]},
    { id: 'pw', label: '펄스폭 (pulse duration)', opts: [
      { v: 'p50', label: '50 µs' }, { v: 'p100', label: '100 µs' },
      { v: 'p200', label: '150~200 µs' }, { v: 'p400', label: '300~400 µs' },
    ]},
    { id: 'amp', label: '강도 (amplitude)', hint: '환자에게 물어 확인할 감각 수준으로 정한다', opts: [
      { v: 'sensory', label: '겨우 느껴지는 감각 역치' },
      { v: 'strong_sub', label: '강하지만 편안한 감각 — 근수축 직전' },
      { v: 'motor', label: '눈에 보이는 리듬성 근수축' },
      { v: 'noxious', label: '통증을 참을 수 있는 최대' },
    ]},
    { id: 'time', label: '1회 적용 시간', opts: [
      { v: 't10', label: '10분' }, { v: 't20', label: '20분' }, { v: 't30', label: '30분' },
      { v: 't60', label: '45~60분' }, { v: 'tprn', label: '통증 있을 때 수시로(가정용)' },
    ]},
    { id: 'sched', label: '적용 빈도', opts: [
      { v: 'w1', label: '주 1회' }, { v: 'w23', label: '주 2~3회' },
      { v: 'w45', label: '주 4~5회' }, { v: 'daily', label: '매일 · 자가 적용' },
    ]},
  ],
};

RX.protos.ifc = {
  name: '간섭전류치료 (IFC)', cat: '전기치료',
  ref: '중주파 반송파 두 회로가 심부에서 교차하며 저주파 맥동을 만든다. 피부 저항이 낮아 깊은 조직에 유리하다.',
  fields: [
    { id: 'electrode', label: '전극 배치', opts: [
      { v: 'quad', label: '4극 교차 배치 (진성 간섭 — 병변을 교차점에 둔다)' },
      { v: 'bipolar', label: '2극 (예비변조 premodulated)' },
      { v: 'quad_vector', label: '4극 + 벡터 회전(자동 스캔)' },
    ]},
    { id: 'carrier', label: '반송 주파수 (carrier)', opts: [
      { v: 'c2k', label: '2,000 Hz' }, { v: 'c4k', label: '4,000 Hz' }, { v: 'c8k', label: '8,000 Hz' },
    ]},
    { id: 'amf', label: '맥동 주파수 (AMF)', opts: [
      { v: 'a1_10', label: '1~10 Hz — 근수축 · 순환' },
      { v: 'a20_50', label: '20~50 Hz — 근긴장 완화' },
      { v: 'a80_100', label: '80~100 Hz — 급성 통증(관문조절)' },
      { v: 'a100_150', label: '100~150 Hz — 강한 진통' },
    ]},
    { id: 'sweep', label: '스윕 (frequency sweep)', opts: [
      { v: 'fixed', label: '고정 (스윕 없음)' },
      { v: 'narrow', label: '좁은 스윕 (±10 Hz)' },
      { v: 'wide', label: '넓은 스윕 (±50 Hz — 순응 방지)' },
    ]},
    { id: 'amp', label: '강도', opts: [
      { v: 'sensory', label: '뚜렷한 저릿함 (감각 수준)' },
      { v: 'strong_sub', label: '강하지만 편안한 감각' },
      { v: 'motor', label: '가시적 근수축' },
    ]},
    { id: 'time', label: '1회 적용 시간', opts: [
      { v: 't10', label: '10분' }, { v: 't15', label: '15분' }, { v: 't20', label: '20분' }, { v: 't30', label: '30분' },
    ]},
    { id: 'sched', label: '적용 빈도', opts: [
      { v: 'w1', label: '주 1회' }, { v: 'w23', label: '주 2~3회' },
      { v: 'w35', label: '주 3~5회' }, { v: 'w45', label: '주 4~5회' },
    ]},
  ],
};

RX.protos.nmes = {
  name: '신경근전기자극 (NMES / 러시안전류)', cat: '전기치료',
  ref: '근력 강화·근위축 억제 목적. 강도가 곧 효과이므로 참을 수 있는 최대 수축을 끌어내고, 충분한 휴식비를 준다.',
  fields: [
    { id: 'target', label: '표적 근육', hint: '검사에서 약화가 확인된 근육에 붙인다', opts: [
      { v: 'generic', label: '(환자별 표적 근육)' },
    ]},
    { id: 'wave', label: '파형 · 전류 종류', opts: [
      { v: 'sym_bi', label: '대칭성 두방향 구형파 (큰 근육)' },
      { v: 'asym_bi', label: '비대칭성 두방향 구형파 (작은 근육)' },
      { v: 'russian', label: '러시안 전류 (2,500 Hz 반송파 · 50 bps)' },
    ]},
    { id: 'freq', label: '주파수', opts: [
      { v: 'f20', label: '20 Hz' }, { v: 'f35', label: '30~35 Hz' },
      { v: 'f50', label: '50 Hz' }, { v: 'f80', label: '80 Hz' },
    ]},
    { id: 'pw', label: '펄스폭', opts: [
      { v: 'p150', label: '150 µs' }, { v: 'p250', label: '200~300 µs' },
      { v: 'p400', label: '400 µs' }, { v: 'p600', label: '600 µs 이상' },
    ]},
    { id: 'duty', label: '수축 : 휴식 비 (on:off)', opts: [
      { v: 'd1_1', label: '10초 : 10초 (1:1) — 지구력' },
      { v: 'd1_3', label: '10초 : 30초 (1:3)' },
      { v: 'd1_5', label: '10초 : 50초 (1:5) — 근력, 피로 최소화' },
      { v: 'd1_10', label: '10초 : 100초 (1:10) — 심한 위축·초기' },
    ]},
    { id: 'amp', label: '강도', opts: [
      { v: 'sensory', label: '감각 역치 (수축 없음)' },
      { v: 'visible', label: '눈에 보이는 정도의 수축' },
      { v: 'max_tol', label: '참을 수 있는 최대 수축 (MVIC 50% 이상)' },
      { v: 'mvic10', label: '건측 MVIC의 10% 수준' },
    ]},
    { id: 'reps', label: '1회 수축 횟수', opts: [
      { v: 'r10', label: '10회' }, { v: 'r15', label: '10~15회' },
      { v: 'r30', label: '30회' }, { v: 'r50', label: '50회 이상' },
    ]},
    { id: 'posture', label: '적용 자세', opts: [
      { v: 'isometric', label: '등척성 — 고정 각도에서 자극' },
      { v: 'functional', label: '기능적 동작(앉았다 일어서기 등)과 동시 적용' },
      { v: 'rest', label: '완전 이완 상태로 누워서' },
    ]},
    { id: 'sched', label: '적용 빈도', opts: [
      { v: 'w23', label: '주 2~3회' }, { v: 'w35', label: '주 3~5회' }, { v: 'daily', label: '매일' },
    ]},
  ],
};

RX.protos.hvpc = {
  name: '고전압맥동전류 (HVPC)', cat: '전기치료',
  ref: '쌍봉 고전압·짧은 펄스. 부종 조절과 창상 치유, 통증 조절에 쓴다.',
  fields: [
    { id: 'polarity', label: '작용 전극 극성', opts: [
      { v: 'neg', label: '음극 (−) — 급성 부종 억제 · 살균' },
      { v: 'pos', label: '양극 (+) — 상피화 촉진 · 진정' },
      { v: 'alt', label: '교대 극성' },
    ]},
    { id: 'freq', label: '주파수', opts: [
      { v: 'f10', label: '10 Hz' }, { v: 'f30', label: '30 Hz' },
      { v: 'f80', label: '80~120 Hz' }, { v: 'f120', label: '120 Hz 이상' },
    ]},
    { id: 'amp', label: '강도', opts: [
      { v: 'submotor', label: '감각 수준 (운동 역치 90%)' },
      { v: 'motor', label: '가시적 근수축' },
      { v: 'strong', label: '참을 수 있는 최대' },
    ]},
    { id: 'time', label: '1회 적용 시간', opts: [
      { v: 't20', label: '20분' }, { v: 't30', label: '30분' }, { v: 't45', label: '45~60분' },
    ]},
    { id: 'sched', label: '적용 빈도', opts: [
      { v: 'w23', label: '주 2~3회' }, { v: 'daily', label: '매일' }, { v: 'bid', label: '하루 2회' },
    ]},
  ],
};

RX.protos.ultrasound = {
  name: '치료초음파 (Therapeutic ultrasound)', cat: '물리적 인자',
  ref: '주파수가 침투 깊이를, 듀티비가 온열/비온열 여부를 정한다. 조사면적은 유효방사면적(ERA)의 2~3배 이내.',
  fields: [
    { id: 'freq', label: '주파수 (침투 깊이)', opts: [
      { v: 'f1', label: '1 MHz — 깊은 조직 (3~5 cm)' },
      { v: 'f3', label: '3 MHz — 얕은 조직 (1~2 cm)' },
    ]},
    { id: 'duty', label: '듀티비 (연속/펄스)', opts: [
      { v: 'cont', label: '연속 100% — 온열 효과 (조직 신장성 ↑)' },
      { v: 'p50', label: '펄스 50%' },
      { v: 'p20', label: '펄스 20% — 비온열 (급성기·조직 치유)' },
    ]},
    { id: 'intensity', label: '강도', opts: [
      { v: 'i03', label: '0.3 W/cm²' }, { v: 'i05', label: '0.5 W/cm²' },
      { v: 'i10', label: '1.0 W/cm²' }, { v: 'i15', label: '1.5 W/cm²' }, { v: 'i20', label: '2.0 W/cm²' },
    ]},
    { id: 'time', label: '1회 조사 시간', opts: [
      { v: 't3', label: '3분' }, { v: 't5', label: '5분' }, { v: 't8', label: '8분' }, { v: 't10', label: '10분' },
    ]},
    { id: 'coupling', label: '전달 매질 · 기법', opts: [
      { v: 'gel', label: '초음파 젤 + 탐촉자 연속 이동' },
      { v: 'water', label: '수중법 (요철이 심한 부위)' },
      { v: 'phono', label: '약물도포(phonophoresis)' },
      { v: 'static', label: '탐촉자 고정 조사' },
    ]},
    { id: 'sched', label: '적용 횟수', opts: [
      { v: 'w23', label: '주 2~3회' },
      { v: 'x10_2w', label: '2주간 10회 (주 5회)' },
      { v: 'w1', label: '주 1회' },
    ]},
  ],
};

RX.protos.eswt = {
  name: '체외충격파 (ESWT)', cat: '물리적 인자',
  ref: '방사형/집속형, 에너지밀도(EFD), 총 타격수, 회기 간격이 핵심 변수. 시술 중 국소마취는 효과를 떨어뜨린다.',
  fields: [
    { id: 'type', label: '충격파 형태', opts: [
      { v: 'radial', label: '방사형 (rESWT — 넓고 얕은 병변)' },
      { v: 'focused', label: '집속형 (fESWT — 좁고 깊은 병변 · 석회)' },
    ]},
    { id: 'efd', label: '에너지밀도 (EFD)', opts: [
      { v: 'low', label: '저에너지 0.08~0.12 mJ/mm²' },
      { v: 'mid', label: '중등도 0.12~0.28 mJ/mm²' },
      { v: 'high', label: '고에너지 0.28 mJ/mm² 이상' },
    ]},
    { id: 'shots', label: '1회 타격 수', opts: [
      { v: 's1000', label: '1,000회' }, { v: 's2000', label: '2,000회' },
      { v: 's3000', label: '2,500~3,000회' }, { v: 's4000', label: '4,000회 이상' },
    ]},
    { id: 'rate', label: '타격 속도', opts: [
      { v: 'r4', label: '4 Hz' }, { v: 'r8', label: '8~10 Hz' }, { v: 'r15', label: '15 Hz' },
    ]},
    { id: 'locate', label: '조사 지점 결정', opts: [
      { v: 'palpate', label: '압통점 촉진(clinical focusing)으로 결정' },
      { v: 'us_guide', label: '초음파 영상 유도' },
      { v: 'fixed', label: '해부학적 표지만으로 고정' },
    ]},
    { id: 'sched', label: '회기 간격 · 총 횟수', opts: [
      { v: 'w1x3', label: '주 1회 × 3~5회' },
      { v: 'w2x3', label: '2주 간격 × 3회' },
      { v: 'daily', label: '매일 연속' },
    ]},
    { id: 'anes', label: '국소마취', opts: [
      { v: 'none', label: '사용하지 않음 (통증 반응을 지표로 삼는다)' },
      { v: 'local', label: '국소마취 후 시행' },
    ]},
  ],
};

RX.protos.laser = {
  name: '저출력 레이저 · 광선치료 (LLLT / 고출력 레이저)', cat: '물리적 인자',
  ref: '파장이 침투 깊이를, 조사량(J/cm²)이 생물학적 효과를 정한다.',
  fields: [
    { id: 'wave', label: '파장', opts: [
      { v: 'w650', label: '630~660 nm (적색 — 표재)' },
      { v: 'w830', label: '780~830 nm (근적외 — 중간 깊이)' },
      { v: 'w904', label: '904 nm (펄스 — 깊은 조직)' },
      { v: 'w1064', label: '1,064 nm 고출력 (심부)' },
    ]},
    { id: 'dose', label: '조사량 (지점당)', opts: [
      { v: 'd1', label: '1~2 J/cm² — 급성 · 표재' },
      { v: 'd4', label: '4~8 J/cm² — 아급성' },
      { v: 'd10', label: '10~20 J/cm² — 만성 · 심부' },
      { v: 'd50', label: '50 J/cm² 이상' },
    ]},
    { id: 'contact', label: '조사 방법', opts: [
      { v: 'point', label: '지점별 접촉 조사 (grid)' },
      { v: 'scan', label: '스캐닝 (비접촉 이동)' },
      { v: 'trigger', label: '통증유발점 · 압통점 집중' },
    ]},
    { id: 'time', label: '1회 총 조사 시간', opts: [
      { v: 't3', label: '3분' }, { v: 't5', label: '5분' }, { v: 't10', label: '10분' }, { v: 't15', label: '15분' },
    ]},
    { id: 'sched', label: '적용 빈도', opts: [
      { v: 'w23', label: '주 2~3회 × 4주' }, { v: 'w35', label: '주 3~5회 × 2주' }, { v: 'w1', label: '주 1회' },
    ]},
  ],
};

RX.protos.swd = {
  name: '심부투열 (단파투과열 · 극초단파)', cat: '물리적 인자',
  ref: '금속 삽입물·심박동기·임신·감각저하는 금기. 급성 염증기에는 연속 모드를 쓰지 않는다.',
  fields: [
    { id: 'mode', label: '출력 모드', opts: [
      { v: 'cont', label: '연속 — 온열 효과 (아급성·만성)' },
      { v: 'pulsed', label: '펄스 — 비온열 (급성 부종)' },
    ]},
    { id: 'applicator', label: '전극 · 도자', opts: [
      { v: 'capacitive', label: '축전판(capacitive) — 지방층 얕은 부위' },
      { v: 'inductive', label: '유도코일(inductive) — 근육 등 수분 많은 조직' },
      { v: 'microwave', label: '극초단파 도자' },
    ]},
    { id: 'dose', label: '용량 (환자 체감)', opts: [
      { v: 'd1', label: 'Ⅰ도 — 온감 없음 (급성)' },
      { v: 'd2', label: 'Ⅱ도 — 약한 온감 (아급성)' },
      { v: 'd3', label: 'Ⅲ도 — 뚜렷하고 편안한 온감 (만성)' },
      { v: 'd4', label: 'Ⅳ도 — 참을 수 있는 최대 (통증 직전)' },
    ]},
    { id: 'time', label: '1회 적용 시간', opts: [
      { v: 't10', label: '10분' }, { v: 't15', label: '15분' }, { v: 't20', label: '20분' }, { v: 't30', label: '30분' },
    ]},
    { id: 'sched', label: '적용 빈도', opts: [
      { v: 'w23', label: '주 2~3회' }, { v: 'w35', label: '주 3~5회' },
    ]},
    { id: 'combine', label: '병행 처치', opts: [
      { v: 'pre_stretch', label: '가열 직후 스트레칭 · 가동술 시행' },
      { v: 'alone', label: '단독 적용 후 종료' },
    ]},
  ],
};

RX.protos.hotpack = {
  name: '표층 온열 (습열팩 · 적외선)', cat: '물리적 인자',
  ref: '침투 깊이 1~2 cm. 운동·도수치료 직전 준비 목적으로 쓸 때 효과가 크다.',
  fields: [
    { id: 'agent', label: '적용 방법', opts: [
      { v: 'hydro', label: '습열팩 (hydrocollator, 71~79 ℃)' },
      { v: 'ir', label: '적외선 조사 (45~60 cm 거리)' },
      { v: 'fluido', label: '유동치료 (fluidotherapy)' },
      { v: 'warm_shower', label: '온수 샤워 · 자가 온찜질' },
    ]},
    { id: 'layer', label: '피부 보호', opts: [
      { v: 'l6', label: '수건 6~8겹 (표준)' },
      { v: 'l2', label: '수건 2겹 (얇게)' },
      { v: 'direct', label: '직접 접촉' },
    ]},
    { id: 'time', label: '1회 적용 시간', opts: [
      { v: 't10', label: '10분' }, { v: 't15', label: '15~20분' }, { v: 't30', label: '30분' }, { v: 't60', label: '1시간 이상' },
    ]},
    { id: 'timing', label: '적용 시점', opts: [
      { v: 'pre_ex', label: '운동 · 도수치료 직전 (준비)' },
      { v: 'post_ex', label: '운동 직후' },
      { v: 'standalone', label: '단독 (수동 치료로만)' },
    ]},
    { id: 'sched', label: '적용 빈도', opts: [
      { v: 'w23', label: '주 2~3회 (치료실)' }, { v: 'daily', label: '매일 자가 적용' }, { v: 'prn', label: '증상 있을 때 수시로' },
    ]},
  ],
};

RX.protos.cryo = {
  name: '한랭치료 (Cryotherapy)', cat: '물리적 인자',
  ref: '급성 손상의 통증·대사요구 감소가 목적. 냉감→작열→통증→무감각(CBAN) 순으로 반응한다.',
  fields: [
    { id: 'agent', label: '적용 방법', opts: [
      { v: 'icepack', label: '얼음팩 · 냉찜질팩' },
      { v: 'icemassage', label: '얼음 마사지 (직접 문지르기)' },
      { v: 'immersion', label: '냉수 침수 (10~15 ℃)' },
      { v: 'cryo_cuff', label: '가압 냉각 커프 (cryo-cuff)' },
      { v: 'spray', label: '냉각 스프레이 + 신장 (spray & stretch)' },
    ]},
    { id: 'time', label: '1회 적용 시간', opts: [
      { v: 't5', label: '5분 (얼음 마사지)' }, { v: 't10', label: '10분' },
      { v: 't15', label: '15~20분' }, { v: 't30', label: '30분 이상' },
    ]},
    { id: 'combine', label: '병행 처치', opts: [
      { v: 'compress_elev', label: '압박 + 거상 동시 시행' },
      { v: 'motion', label: '통증 없는 능동 운동과 병행' },
      { v: 'alone', label: '냉각 단독' },
    ]},
    { id: 'sched', label: '적용 빈도', opts: [
      { v: 'q2h', label: '2시간마다 (수상 초기 48~72시간)' },
      { v: 'tid', label: '하루 3회' },
      { v: 'post_ex', label: '운동 후에만' },
    ]},
  ],
};

RX.protos.paraffin = {
  name: '파라핀욕', cat: '물리적 인자',
  ref: '손·발처럼 굴곡이 많은 부위의 표층 가열. 52~54 ℃ 유지, 개방창·감각저하는 금기.',
  fields: [
    { id: 'method', label: '적용 방법', opts: [
      { v: 'dip_wrap', label: '담갔다 빼기 6~10회 후 비닐·수건으로 감싸기' },
      { v: 'immersion', label: '지속 침수 (담근 채 유지)' },
      { v: 'brush', label: '솔로 도포' },
    ]},
    { id: 'time', label: '유지 시간', opts: [
      { v: 't10', label: '10분' }, { v: 't15', label: '15~20분' }, { v: 't30', label: '30분' },
    ]},
    { id: 'after', label: '직후 처치', opts: [
      { v: 'rom', label: '즉시 관절가동범위 운동 · 스트레칭' },
      { v: 'rest', label: '휴식' },
    ]},
    { id: 'sched', label: '적용 빈도', opts: [
      { v: 'w23', label: '주 2~3회' }, { v: 'daily', label: '매일' },
    ]},
  ],
};

RX.protos.contrast = {
  name: '대조욕 (Contrast bath)', cat: '물리적 인자',
  ref: '온(38~44 ℃)·냉(10~18 ℃)을 교대해 혈관 운동 반응을 유도한다. 아급성 부종에 쓴다.',
  fields: [
    { id: 'ratio', label: '온 : 냉 비율', opts: [
      { v: 'r3_1', label: '온 3분 : 냉 1분' },
      { v: 'r4_1', label: '온 4분 : 냉 1분' },
      { v: 'r1_1', label: '온 1분 : 냉 1분' },
    ]},
    { id: 'start_end', label: '시작 · 종료', opts: [
      { v: 'warm_cold', label: '온으로 시작 → 냉으로 종료 (부종 감소 목적)' },
      { v: 'warm_warm', label: '온으로 시작 → 온으로 종료 (운동 전 준비)' },
    ]},
    { id: 'time', label: '총 시간', opts: [
      { v: 't15', label: '15분' }, { v: 't20', label: '20분' }, { v: 't30', label: '30분' },
    ]},
    { id: 'sched', label: '적용 빈도', opts: [
      { v: 'daily', label: '매일' }, { v: 'w35', label: '주 3~5회' },
    ]},
  ],
};

RX.protos.traction = {
  name: '기계적 견인 (Mechanical traction)', cat: '물리적 인자',
  ref: '체중 대비 견인력과 간헐/지속 여부가 핵심. 목뼈는 굽힘 각도가 분절을 결정한다.',
  fields: [
    { id: 'region', label: '적용 부위 · 자세', opts: [
      { v: 'cerv_sup', label: '목뼈 — 바로누운 자세, 굽힘 15~25°' },
      { v: 'cerv_sit', label: '목뼈 — 앉은 자세' },
      { v: 'lumb_sup', label: '허리뼈 — 바로누운 자세, 엉덩·무릎 굽힘 90/90' },
      { v: 'lumb_prone', label: '허리뼈 — 엎드린 자세' },
    ]},
    { id: 'mode', label: '견인 방식', opts: [
      { v: 'intermittent', label: '간헐 견인 (예: 견인 30초 / 이완 10초)' },
      { v: 'static', label: '지속(정적) 견인' },
    ]},
    { id: 'force', label: '견인력', opts: [
      { v: 'f7', label: '체중의 7~10 % (목뼈 초기)' },
      { v: 'f12', label: '체중의 10~15 % (목뼈 유지)' },
      { v: 'f25', label: '체중의 25 % (허리뼈 초기)' },
      { v: 'f50', label: '체중의 50 % 이상 (허리뼈 분리)' },
    ]},
    { id: 'time', label: '1회 적용 시간', opts: [
      { v: 't5', label: '5분' }, { v: 't10', label: '10분' }, { v: 't15', label: '15분' }, { v: 't20', label: '20분' },
    ]},
    { id: 'combine', label: '병행 여부', opts: [
      { v: 'with_ex', label: '운동 · 도수치료와 반드시 병행' },
      { v: 'alone', label: '견인 단독' },
    ]},
    { id: 'sched', label: '적용 빈도', opts: [
      { v: 'w23', label: '주 2~3회' }, { v: 'w35', label: '주 3~5회' },
    ]},
  ],
};

RX.protos.iontophoresis = {
  name: '이온도입법 (Iontophoresis)', cat: '전기치료',
  ref: '직류로 약물 이온을 밀어 넣는다. 용량 = 전류(mA) × 시간(min), 단위는 mA·min.',
  fields: [
    { id: 'drug', label: '약물 · 극성', opts: [
      { v: 'dexa', label: '덱사메타손 (−극, 항염)' },
      { v: 'acetic', label: '아세트산 (−극, 석회 침착)' },
      { v: 'lido', label: '리도카인 (+극, 진통)' },
    ]},
    { id: 'current', label: '전류 강도', opts: [
      { v: 'c1', label: '1 mA' }, { v: 'c2', label: '2 mA' }, { v: 'c4', label: '4 mA' },
    ]},
    { id: 'dose', label: '총 용량', opts: [
      { v: 'd20', label: '20 mA·min' }, { v: 'd40', label: '40 mA·min' }, { v: 'd80', label: '80 mA·min' },
    ]},
    { id: 'sched', label: '적용 빈도', opts: [
      { v: 'w23', label: '주 2~3회 × 2~3주' }, { v: 'w1', label: '주 1회' },
    ]},
  ],
};

// ══════════════════════════════════════════════════════════════
// Ⅱ. 도수치료 (Manual therapy)
// ══════════════════════════════════════════════════════════════

RX.protos.joint_mob = {
  name: '관절가동술 (Joint mobilization)', cat: '도수치료',
  ref: 'Maitland 등급 Ⅰ·Ⅱ는 통증 조절, Ⅲ·Ⅳ는 가동범위 회복. 자극성이 높으면 낮은 등급에서 시작한다.',
  fields: [
    { id: 'target', label: '적용 관절 · 방향', opts: [
      { v: 'generic', label: '(환자별 목표 분절 · 활주 방향)' },
    ]},
    { id: 'grade', label: 'Maitland 등급', opts: [
      { v: 'g1', label: 'Ⅰ등급 — 가동범위 시작부의 작은 진동 (통증 조절)' },
      { v: 'g2', label: 'Ⅱ등급 — 저항 전까지 큰 진동 (통증 조절)' },
      { v: 'g3', label: 'Ⅲ등급 — 저항 구간까지 큰 진동 (가동범위)' },
      { v: 'g4', label: 'Ⅳ등급 — 끝범위의 작은 진동 (가동범위)' },
      { v: 'g5', label: 'Ⅴ등급 — 고속 저진폭 도수교정(thrust)' },
    ]},
    { id: 'position', label: '관절 위치', opts: [
      { v: 'resting', label: '이완자세(open-packed) — 자극성 높을 때' },
      { v: 'mid', label: '중간범위' },
      { v: 'end', label: '가동 제한이 걸리는 끝범위' },
    ]},
    { id: 'dose', label: '진동 · 유지 용량', opts: [
      { v: 'osc30', label: '30초 × 3~5세트 (진동 2~3 Hz)' },
      { v: 'osc60', label: '60초 × 3세트' },
      { v: 'sustain', label: '지속 신장 30~60초 유지' },
      { v: 'osc15', label: '15초 × 2세트 (탐색적 소량)' },
    ]},
    { id: 'response', label: '반응 확인 · 진행 기준', opts: [
      { v: 'reassess', label: '세트마다 재평가 — 개선되면 등급 상향' },
      { v: 'pain_limit', label: '통증 증가 시 즉시 등급 하향' },
      { v: 'fixed', label: '정해진 등급으로 끝까지 시행' },
    ]},
    { id: 'sched', label: '치료 빈도 · 기간', opts: [
      { v: 'w13_612', label: '주 1~3회 × 6~12주' },
      { v: 'w23_4', label: '주 2~3회 × 4주' },
      { v: 'w12_8', label: '주 1~2회 × 8주' },
    ]},
  ],
};

RX.protos.manipulation = {
  name: '도수교정 (Thrust manipulation, HVLA)', cat: '도수치료',
  ref: '고속·저진폭 추력. 시행 전 안전성 선별(적신호·혈관·인대)이 반드시 선행한다.',
  fields: [
    { id: 'target', label: '적용 분절 · 기법', opts: [
      { v: 'generic', label: '(환자별 적용 분절)' },
    ]},
    { id: 'screen', label: '시행 전 선별', opts: [
      { v: 'full', label: '적신호 · 혈관(VBI) · 인대 안정성 선별 완료 후 시행' },
      { v: 'partial', label: '적신호만 확인하고 시행' },
      { v: 'none', label: '선별 없이 시행' },
    ]},
    { id: 'dose', label: '1회 시행 횟수', opts: [
      { v: 'x1', label: '방향당 1회' },
      { v: 'x2', label: '방향당 최대 2회 (캐비테이션 없으면 재시도)' },
      { v: 'x5', label: '캐비테이션이 날 때까지 반복' },
    ]},
    { id: 'combine', label: '병행 중재', opts: [
      { v: 'with_ex', label: '교정 직후 운동 프로그램 시행 (필수 병행)' },
      { v: 'alone', label: '도수교정 단독' },
    ]},
    { id: 'sched', label: '치료 빈도 · 기간', opts: [
      { v: 'w23_2', label: '주 2~3회 × 2~4주' },
      { v: 'w12_6', label: '주 1~2회 × 6주' },
      { v: 'once', label: '1회만 시행 후 재평가' },
    ]},
  ],
};

RX.protos.mwm = {
  name: '이동을 동반한 가동술 (Mulligan MWM / SNAG)', cat: '도수치료',
  ref: '치료사가 부속운동을 유지한 채 환자가 능동으로 움직인다. 통증이 없어야(PILL: Pain-free, Instant, Long-Lasting) 옳은 방향이다.',
  fields: [
    { id: 'target', label: '적용 관절 · 활주 방향', opts: [
      { v: 'generic', label: '(환자별 활주 방향)' },
    ]},
    { id: 'criteria', label: '방향 결정 기준', opts: [
      { v: 'painfree', label: '통증 없이 가동범위가 즉시 늘어나는 방향을 채택' },
      { v: 'restricted', label: '제한된 방향으로 강하게 밀기' },
      { v: 'random', label: '표준 방향으로 일괄 적용' },
    ]},
    { id: 'dose', label: '반복 용량', opts: [
      { v: 'r3x6', label: '6~10회 × 3세트' },
      { v: 'r3x10', label: '10회 × 3세트' },
      { v: 'r1x3', label: '3회 × 1세트 (초회 반응 확인)' },
    ]},
    { id: 'overpressure', label: '끝범위 가압', opts: [
      { v: 'yes', label: '환자 자신이 끝범위에서 가압 추가' },
      { v: 'no', label: '가압 없이 능동 범위까지만' },
    ]},
    { id: 'home', label: '자가 적용', opts: [
      { v: 'belt', label: '벨트 · 수건을 이용한 자가 SNAG 교육' },
      { v: 'clinic', label: '치료실에서만 시행' },
    ]},
    { id: 'sched', label: '치료 빈도', opts: [
      { v: 'w23', label: '주 2~3회' }, { v: 'w12', label: '주 1~2회' }, { v: 'daily', label: '매일 자가 시행' },
    ]},
  ],
};

RX.protos.stm = {
  name: '연부조직 가동술 · 근막이완 (STM / IASTM)', cat: '도수치료',
  ref: '근육·근막의 신장성 회복과 통증 감소. 압력은 조직 저항이 풀리는 것을 느끼며 조절한다.',
  fields: [
    { id: 'target', label: '표적 조직', opts: [
      { v: 'generic', label: '(환자별 표적 연부조직)' },
    ]},
    { id: 'technique', label: '기법', opts: [
      { v: 'deep_stroke', label: '깊은 세로 활주 (deep longitudinal stroke)' },
      { v: 'cross_fiber', label: '가로 마찰 (transverse friction)' },
      { v: 'trigger', label: '통증유발점 허혈성 압박 (ischemic compression)' },
      { v: 'iastm', label: '도구를 이용한 연부조직 가동술 (IASTM)' },
      { v: 'mfr', label: '지속적 근막이완 (myofascial release)' },
    ]},
    { id: 'pressure', label: '압력 · 통증 수준', opts: [
      { v: 'p_light', label: '통증 없는 가벼운 압력' },
      { v: 'p_mid', label: 'NRS 3~4의 견딜 만한 압력' },
      { v: 'p_high', label: 'NRS 7 이상의 강한 압력' },
    ]},
    { id: 'dose', label: '적용 시간', opts: [
      { v: 'd60', label: '부위당 60~90초' },
      { v: 'd3', label: '부위당 3~5분' },
      { v: 'd10', label: '총 10분 이상' },
    ]},
    { id: 'after', label: '직후 처치', opts: [
      { v: 'stretch_ex', label: '즉시 스트레칭 · 능동 운동으로 새 범위 정착' },
      { v: 'ice', label: '냉각' },
      { v: 'none', label: '없음' },
    ]},
    { id: 'sched', label: '치료 빈도', opts: [
      { v: 'w23', label: '주 2~3회' }, { v: 'w12', label: '주 1~2회' },
    ]},
  ],
};

RX.protos.met = {
  name: '근에너지기법 (MET) · 수축-이완', cat: '도수치료',
  ref: '환자의 등척성 수축 후 이완을 이용해 가동범위를 늘린다. 수축 강도는 최대의 20% 내외면 충분하다.',
  fields: [
    { id: 'target', label: '표적 근육 · 방향', opts: [
      { v: 'generic', label: '(환자별 표적 근육)' },
    ]},
    { id: 'contract', label: '수축 강도', opts: [
      { v: 'c20', label: '최대 수의수축의 20 % (가벼운 저항)' },
      { v: 'c50', label: '최대의 50 %' },
      { v: 'c100', label: '최대 수축' },
    ]},
    { id: 'hold', label: '수축 유지 시간', opts: [
      { v: 'h5', label: '5초' }, { v: 'h10', label: '7~10초' }, { v: 'h20', label: '20초' },
    ]},
    { id: 'relax', label: '이완 후 처리', opts: [
      { v: 'new_barrier', label: '이완 후 새로운 제한점까지 수동으로 이동' },
      { v: 'return', label: '시작 자세로 되돌림' },
    ]},
    { id: 'reps', label: '반복 횟수', opts: [
      { v: 'r3', label: '3~5회' }, { v: 'r8', label: '8~10회' }, { v: 'r1', label: '1회' },
    ]},
    { id: 'sched', label: '시행 빈도', opts: [
      { v: 'w23', label: '주 2~3회' }, { v: 'daily', label: '매일 자가 시행' },
    ]},
  ],
};

RX.protos.neural_mob = {
  name: '신경가동술 (Neural mobilization)', cat: '도수치료',
  ref: '증상 유발이 아니라 신경의 미끄러짐 회복이 목적. 자극성이 높으면 활주(slider), 낮으면 긴장(tensioner)으로 진행한다.',
  fields: [
    { id: 'target', label: '표적 신경', opts: [
      { v: 'median', label: '정중신경' }, { v: 'ulnar', label: '자신경' }, { v: 'radial', label: '노신경' },
      { v: 'sciatic', label: '궁둥신경' }, { v: 'femoral', label: '넙다리신경' },
    ]},
    { id: 'technique', label: '기법', opts: [
      { v: 'slider', label: '활주(slider) — 한쪽 관절은 늘리고 다른 쪽은 줄여 장력을 일정하게' },
      { v: 'tensioner', label: '긴장(tensioner) — 양 끝을 동시에 늘려 장력 부하' },
      { v: 'prox_first', label: '몸쪽 부위부터 단계적으로 부하' },
    ]},
    { id: 'range', label: '가동 범위 기준', opts: [
      { v: 'symptom_free', label: '증상이 나타나기 직전까지만' },
      { v: 'onset', label: '가벼운 증상이 막 느껴지는 지점까지' },
      { v: 'max', label: '증상이 확실히 재현될 때까지' },
    ]},
    { id: 'dose', label: '반복 용량', opts: [
      { v: 'r10x3', label: '10회 × 2~3세트 (천천히 리듬 있게)' },
      { v: 'r30', label: '30회 연속' },
      { v: 'hold30', label: '끝범위 30초 유지 × 3회' },
    ]},
    { id: 'sched', label: '시행 빈도', opts: [
      { v: 'daily_home', label: '치료실 주 2~3회 + 매일 가정 자가 시행' },
      { v: 'w23', label: '주 2~3회 치료실에서만' },
      { v: 'bid', label: '하루 2~3회' },
    ]},
  ],
};

RX.protos.stretch = {
  name: '스트레칭 (Stretching)', cat: '도수치료 · 운동',
  ref: '유지 시간과 강도가 핵심. 자극성이 높은 조직에는 짧고 자주, 낮으면 길고 강하게.',
  fields: [
    { id: 'target', label: '표적 조직', opts: [
      { v: 'generic', label: '(환자별 표적 근육 · 관절주머니)' },
    ]},
    { id: 'type', label: '스트레칭 방식', opts: [
      { v: 'static', label: '정적 스트레칭' },
      { v: 'pnf', label: 'PNF 수축-이완' },
      { v: 'dynamic', label: '동적 스트레칭' },
      { v: 'low_load_long', label: '저강도 장시간 신장 (low-load prolonged stretch)' },
      { v: 'ballistic', label: '반동(ballistic) 스트레칭' },
    ]},
    { id: 'intensity', label: '강도 (통증 기준)', opts: [
      { v: 'painfree', label: '통증이 전혀 없는 범위 (고자극성)' },
      { v: 'mild', label: '가벼운 당김 · NRS 2~3까지 (중간 자극성)' },
      { v: 'end_range', label: '끝범위에서 강한 당김 · NRS 4~5 (저자극성)' },
    ]},
    { id: 'hold', label: '유지 시간', opts: [
      { v: 'h10', label: '10초' }, { v: 'h30', label: '30초' },
      { v: 'h60', label: '60초' }, { v: 'h5m', label: '5~10분 (저강도 장시간)' },
    ]},
    { id: 'reps', label: '반복', opts: [
      { v: 'r3', label: '3회' }, { v: 'r5', label: '5회' }, { v: 'r10', label: '10회' },
    ]},
    { id: 'sched', label: '시행 빈도', opts: [
      { v: 'daily', label: '하루 1회 · 매일' },
      { v: 'tid', label: '하루 2~3회 · 매일' },
      { v: 'w35', label: '주 3~5회' },
      { v: 'w2', label: '주 2회' },
    ]},
  ],
};

RX.protos.massage = {
  name: '마사지 · 도수 배출요법', cat: '도수치료',
  ref: '순환 촉진과 통증·긴장 완화. 부종에는 몸쪽부터 비워 내는 순서가 중요하다.',
  fields: [
    { id: 'technique', label: '기법', opts: [
      { v: 'effleurage', label: '가볍게 쓸기 (effleurage)' },
      { v: 'petrissage', label: '주무르기 (petrissage)' },
      { v: 'friction', label: '문지르기 (friction)' },
      { v: 'mld', label: '도수 림프배출 (manual lymph drainage)' },
    ]},
    { id: 'direction', label: '방향', opts: [
      { v: 'prox_first', label: '몸쪽부터 비우고 먼쪽으로 진행' },
      { v: 'to_heart', label: '먼쪽 → 몸쪽 (심장 방향)' },
      { v: 'local', label: '병변 부위 국소' },
    ]},
    { id: 'time', label: '적용 시간', opts: [
      { v: 't5', label: '5분' }, { v: 't10', label: '10분' }, { v: 't20', label: '20분 이상' },
    ]},
    { id: 'sched', label: '시행 빈도', opts: [
      { v: 'w23', label: '주 2~3회' }, { v: 'daily', label: '매일' },
    ]},
  ],
};

RX.protos.dry_needling = {
  name: '드라이니들링 (Dry needling)', cat: '도수치료',
  ref: '통증유발점에 자침해 국소연축반응(LTR)을 유도한다. 시행 후 신장·운동으로 마무리한다.',
  fields: [
    { id: 'target', label: '표적 근육 · 유발점', opts: [
      { v: 'generic', label: '(환자별 표적 유발점)' },
    ]},
    { id: 'depth', label: '자침 깊이', opts: [
      { v: 'superficial', label: '표재 자침 (5~10 mm)' },
      { v: 'deep', label: '심부 자침 — 유발점 관통' },
    ]},
    { id: 'ltr', label: '국소연축반응 (LTR)', opts: [
      { v: 'until_ltr', label: 'LTR이 소실될 때까지 pistoning' },
      { v: 'single', label: '1회 자침 후 유지' },
      { v: 'ignore', label: 'LTR 확인하지 않음' },
    ]},
    { id: 'dwell', label: '유침 시간', opts: [
      { v: 'immediate', label: '즉시 제거 (fast-in fast-out)' },
      { v: 'd10', label: '10분 유침' }, { v: 'd20', label: '20분 유침' },
    ]},
    { id: 'after', label: '직후 처치', opts: [
      { v: 'stretch_ex', label: '신장 + 능동 운동으로 마무리, 통증 반응 교육' },
      { v: 'none', label: '없음' },
    ]},
    { id: 'sched', label: '시행 빈도', opts: [
      { v: 'w1', label: '주 1회' }, { v: 'w2', label: '주 2회' }, { v: 'w23_4', label: '주 2~3회 × 4주' },
    ]},
  ],
};

// ══════════════════════════════════════════════════════════════
// Ⅲ. 운동치료 (Therapeutic exercise)
// ══════════════════════════════════════════════════════════════

RX.protos.strength = {
  name: '근력강화 운동 (Resistance training)', cat: '운동치료',
  ref: '표적 근육 · 수축 형태 · 강도(%1RM) · 세트/반복 · 빈도 · 진행 기준을 모두 정해야 처방이 된다.',
  fields: [
    { id: 'target', label: '표적 근육', hint: 'MMT · 기능검사에서 약화가 확인된 근육', opts: [
      { v: 'generic', label: '(환자별 표적 근육)' },
    ]},
    { id: 'mode', label: '수축 형태', opts: [
      { v: 'isometric', label: '등척성 (isometric) — 통증·부하 제한 시기' },
      { v: 'concentric', label: '구심성 중심' },
      { v: 'eccentric', label: '원심성 강조' },
      { v: 'isotonic', label: '등장성 (구심 + 원심 전 범위)' },
      { v: 'closed_chain', label: '닫힌사슬 (closed kinetic chain)' },
      { v: 'open_chain', label: '열린사슬 (open kinetic chain)' },
    ]},
    { id: 'load', label: '강도 (부하)', opts: [
      { v: 'bw', label: '체중 · 무저항 (자세 조절 우선)' },
      { v: 'l40', label: '1RM의 30~50 % — 저부하 고반복' },
      { v: 'l60', label: '1RM의 60~70 % — 중등도' },
      { v: 'l80', label: '1RM의 70~85 % — 고부하 근력' },
      { v: 'rpe', label: '주관적 운동강도 RPE 6~8 / 통증 NRS 3 이하 유지' },
    ]},
    { id: 'volume', label: '세트 × 반복', opts: [
      { v: 'v3x10', label: '10~12회 × 3세트' },
      { v: 'v3x15', label: '15~20회 × 3세트' },
      { v: 'v3x6', label: '6~8회 × 3~4세트' },
      { v: 'iso10', label: '10초 유지 × 10회' },
      { v: 'v1x10', label: '10회 × 1세트' },
    ]},
    { id: 'rest', label: '세트 간 휴식', opts: [
      { v: 'r30', label: '30초' }, { v: 'r60', label: '60~90초' }, { v: 'r180', label: '2~3분' },
    ]},
    { id: 'sched', label: '빈도 · 기간', opts: [
      { v: 'w2', label: '주 2회' }, { v: 'w23', label: '주 2~3회' },
      { v: 'w35', label: '주 3~5회' }, { v: 'daily', label: '매일' },
      { v: 'w15', label: '주 1~5회 (환자 상태에 맞춰 조정)' },
    ]},
    { id: 'progress', label: '진행 기준', opts: [
      { v: 'pain_rule', label: '운동 중·다음 날 통증이 NRS 5를 넘지 않으면 부하 증가' },
      { v: 'rep_rule', label: '목표 반복을 여유 있게 채우면 5~10 % 증량' },
      { v: 'time_rule', label: '2주마다 일괄 증량' },
      { v: 'none', label: '동일 부하 유지' },
    ]},
  ],
};

RX.protos.eccentric = {
  name: '원심성 부하 운동 (Eccentric / Heavy Slow Resistance)', cat: '운동치료',
  ref: '힘줄병증의 핵심 중재. Alfredson 프로토콜은 12주간 하루 2회 · 15회 3세트 × 2종.',
  fields: [
    { id: 'target', label: '표적 힘줄 · 근육', opts: [
      { v: 'generic', label: '(환자별 표적)' },
    ]},
    { id: 'protocol', label: '프로토콜', opts: [
      { v: 'alfredson', label: 'Alfredson 원심성 (무릎 폄 + 무릎 굽힘 두 자세)' },
      { v: 'hsr', label: '고중량 저속 저항운동 (HSR — 구심+원심 6초)' },
      { v: 'silbernagel', label: 'Silbernagel 통증 감시 진행 프로그램' },
      { v: 'iso_first', label: '등척성 통증조절 → 원심성 순차 진행' },
    ]},
    { id: 'volume', label: '세트 × 반복', opts: [
      { v: 'v3x15', label: '15회 × 3세트 (각 자세)' },
      { v: 'v3x8', label: '6~8회 × 3~4세트 (HSR)' },
      { v: 'v3x10', label: '10회 × 3세트' },
    ]},
    { id: 'tempo', label: '동작 속도', opts: [
      { v: 'slow3', label: '내리는 데 3초 (천천히)' },
      { v: 'slow6', label: '구심 3초 + 원심 3초 (총 6초)' },
      { v: 'fast', label: '빠르게 반동으로' },
    ]},
    { id: 'load_rule', label: '부하 결정 기준', opts: [
      { v: 'painful_ok', label: '통증이 있어도 수행 — 견딜 만하면 체중·배낭으로 증량' },
      { v: 'painfree_only', label: '통증이 전혀 없는 부하만 사용' },
      { v: 'nrs5', label: '통증 NRS 5 이하, 다음 날 아침 뻣뻣함이 악화되지 않는 선' },
    ]},
    { id: 'sched', label: '빈도 · 기간', opts: [
      { v: 'bid_12w', label: '하루 2회 · 매일 · 12주' },
      { v: 'w3_12w', label: '주 3회 · 12주' },
      { v: 'w2_6w', label: '주 2회 · 6주' },
    ]},
    { id: 'load_mgmt', label: '병행 부하 관리', opts: [
      { v: 'modify', label: '증상을 악화시키는 활동량을 일시 조절하되 완전 휴식은 하지 않음' },
      { v: 'rest', label: '증상이 없어질 때까지 완전 휴식' },
      { v: 'nochange', label: '활동 그대로 유지' },
    ]},
  ],
};

RX.protos.motor_control = {
  name: '운동조절 · 심부근 활성 훈련 (Motor control training)', cat: '운동치료',
  ref: '무게보다 정확도. 낮은 강도에서 표적근의 선택적 활성과 대상작용 억제를 먼저 만든다.',
  fields: [
    { id: 'target', label: '표적 근육 · 과제', opts: [
      { v: 'generic', label: '(환자별 표적)' },
    ]},
    { id: 'feedback', label: '피드백 방법', opts: [
      { v: 'biofeedback', label: '압력 바이오피드백 · 초음파 영상' },
      { v: 'tactile', label: '촉각 · 도수 유도' },
      { v: 'mirror', label: '거울 · 영상 시각 피드백' },
      { v: 'verbal', label: '구두 지시만' },
    ]},
    { id: 'intensity', label: '수축 강도', opts: [
      { v: 'low', label: '최대의 20~30 % — 대상작용 없이 유지 가능한 수준' },
      { v: 'mid', label: '최대의 50 %' },
      { v: 'max', label: '최대 수축' },
    ]},
    { id: 'volume', label: '유지 · 반복', opts: [
      { v: 'h10x10', label: '10초 유지 × 10회' },
      { v: 'h5x10x3', label: '5초 유지 × 10회 × 3세트' },
      { v: 'h30x3', label: '30초 유지 × 3회' },
    ]},
    { id: 'progress', label: '진행 순서', opts: [
      { v: 'to_function', label: '분리 수축 → 자세 유지 → 사지 부하 → 실제 과제(작업·스포츠) 통합' },
      { v: 'load_first', label: '곧바로 고부하 저항운동으로 진행' },
      { v: 'static_only', label: '누운 자세 분리 수축만 반복' },
    ]},
    { id: 'sched', label: '빈도', opts: [
      { v: 'daily', label: '매일 (하루 1~2회)' },
      { v: 'w35', label: '주 3~5회' },
      { v: 'w2', label: '주 2회' },
    ]},
  ],
};

RX.protos.endurance = {
  name: '근지구력 훈련 (Endurance training)', cat: '운동치료',
  ref: '저부하·고반복·짧은 휴식. 자세 유지근의 피로 저항을 목표로 한다.',
  fields: [
    { id: 'target', label: '표적 근육', opts: [ { v: 'generic', label: '(환자별 표적 근육)' } ]},
    { id: 'load', label: '강도', opts: [
      { v: 'l30', label: '1RM의 30~40 %' }, { v: 'l50', label: '1RM의 50 %' },
      { v: 'bw', label: '체중 · 자세 유지' },
    ]},
    { id: 'volume', label: '세트 × 반복 / 유지', opts: [
      { v: 'v2x20', label: '20~25회 × 2~3세트' },
      { v: 'hold', label: '지속 유지 시간을 점진적으로 연장 (예: 20초 → 60초)' },
      { v: 'v3x15', label: '15회 × 3세트' },
    ]},
    { id: 'rest', label: '휴식', opts: [
      { v: 'r30', label: '30초 이하' }, { v: 'r60', label: '60초' }, { v: 'r120', label: '2분' },
    ]},
    { id: 'sched', label: '빈도 · 기간', opts: [
      { v: 'w35_6', label: '주 3~5회 × 6주 이상' },
      { v: 'w23', label: '주 2~3회' },
      { v: 'daily', label: '매일' },
    ]},
  ],
};

RX.protos.balance = {
  name: '균형 · 고유감각 훈련 (Balance / Proprioceptive training)', cat: '운동치료',
  ref: '지지면·시각·과제 난이도를 한 번에 하나씩만 올린다.',
  fields: [
    { id: 'base', label: '지지 조건', opts: [
      { v: 'double_firm', label: '두 발 · 단단한 바닥' },
      { v: 'single_firm', label: '한 발 · 단단한 바닥' },
      { v: 'single_foam', label: '한 발 · 불안정면(폼·에어패드)' },
      { v: 'dynamic', label: '보드 · 트램폴린 등 동적 지지면' },
    ]},
    { id: 'vision', label: '시각 조건', opts: [
      { v: 'eyes_open', label: '눈 뜨고' },
      { v: 'eyes_closed', label: '눈 감고' },
      { v: 'head_move', label: '머리 움직임 · 시선 이동 동반' },
    ]},
    { id: 'task', label: '과제 난이도', opts: [
      { v: 'static', label: '정적 유지' },
      { v: 'reach', label: '멀리뻗기 · 상지 과제 동반' },
      { v: 'perturb', label: '외부 교란(밀기·공 주고받기) 대응' },
      { v: 'sport', label: '종목 특이 동작 통합' },
    ]},
    { id: 'volume', label: '용량', opts: [
      { v: 'v30x3', label: '30초 × 3~5회 (조건별)' },
      { v: 'v10min', label: '총 10~20분' },
      { v: 'v3x10', label: '10회 × 3세트' },
    ]},
    { id: 'sched', label: '빈도 · 기간', opts: [
      { v: 'daily_4w', label: '매일 · 4주 이상' },
      { v: 'w35_6', label: '주 3~5회 × 6주' },
      { v: 'w2', label: '주 2회' },
    ]},
  ],
};

RX.protos.plyometric = {
  name: '플라이오메트릭 · 착지 훈련 (Plyometric / Landing)', cat: '운동치료',
  ref: '스포츠 복귀 단계 중재. 착지 정렬(무릎 안쪽 무너짐 방지)을 질적으로 지도해야 예방 효과가 난다.',
  fields: [
    { id: 'stage', label: '단계', opts: [
      { v: 'bilateral', label: '양발 수직 점프 · 착지 (낮은 높이)' },
      { v: 'unilateral', label: '한 발 점프 · 착지' },
      { v: 'multiplanar', label: '다면(전후·좌우·회전) 점프 · 컷팅' },
      { v: 'sport', label: '종목 특이 무작위 반응 과제' },
    ]},
    { id: 'cue', label: '지도 방식', opts: [
      { v: 'quality_feedback', label: '착지 정렬을 실시간 피드백 — 무릎 안쪽 무너짐 · 몸통 기울임 교정' },
      { v: 'count_only', label: '횟수만 채우도록 지시' },
      { v: 'video', label: '영상 촬영 후 지연 피드백' },
    ]},
    { id: 'volume', label: '용량', opts: [
      { v: 'v3x8', label: '6~10회 × 3세트' },
      { v: 'contacts', label: '세션당 접지 100~120회 이하' },
      { v: 'v5x20', label: '20회 × 5세트' },
    ]},
    { id: 'rest', label: '세트 간 휴식', opts: [
      { v: 'r60', label: '60초' }, { v: 'r120', label: '2~3분 (질 유지)' }, { v: 'r15', label: '15초' },
    ]},
    { id: 'sched', label: '빈도 · 기간', opts: [
      { v: 'w23_6', label: '주 2~3회 × 6주 이상 (시즌 중 유지)' },
      { v: 'w1', label: '주 1회' },
      { v: 'daily', label: '매일' },
    ]},
    { id: 'criteria', label: '진입 · 복귀 기준', opts: [
      { v: 'lsi90', label: '사지대칭지수(LSI) 90 % 이상 · 통증/부종 없음일 때 진행' },
      { v: 'time', label: '수술·손상 후 경과 기간만으로 판단' },
      { v: 'pain', label: '통증만 없으면 진행' },
    ]},
  ],
};

RX.protos.rom_ex = {
  name: '관절가동범위 운동 · 자가 가동 운동 (ROM exercise)', cat: '운동치료',
  ref: '가동범위 유지·회복이 목적. 자극성이 높으면 능동보조 범위에서 자주, 낮으면 끝범위까지.',
  fields: [
    { id: 'target', label: '표적 관절 · 방향', opts: [ { v: 'generic', label: '(환자별 표적 방향)' } ]},
    { id: 'assist', label: '운동 형태', opts: [
      { v: 'passive', label: '수동 (PROM)' },
      { v: 'aarom', label: '능동보조 (막대기 · 도르래 · 반대손 이용)' },
      { v: 'active', label: '능동 (AROM)' },
      { v: 'pendulum', label: '진자운동 (Codman)' },
    ]},
    { id: 'range', label: '범위 기준', opts: [
      { v: 'painfree', label: '통증 없는 범위 안에서만' },
      { v: 'to_onset', label: '통증이 막 시작되는 지점까지' },
      { v: 'into_pain', label: '통증을 참고 끝범위까지 밀어붙임' },
    ]},
    { id: 'volume', label: '용량', opts: [
      { v: 'v10x3', label: '10회 × 2~3세트 (방향별)' },
      { v: 'v20', label: '20회 × 1세트' },
      { v: 'hold', label: '끝범위 10~30초 유지 × 5회' },
    ]},
    { id: 'sched', label: '빈도', opts: [
      { v: 'tid', label: '하루 2~3회 · 매일' },
      { v: 'daily', label: '하루 1회 · 매일' },
      { v: 'w23', label: '주 2~3회' },
    ]},
  ],
};

RX.protos.mdt = {
  name: '방향선호 기반 반복운동 (MDT · 중심화 절차)', cat: '운동치료',
  ref: '증상을 몸 중심으로 이동시키는(중심화) 방향을 찾아 그 방향으로만 반복한다. 말초화되면 방향이 틀린 것이다.',
  fields: [
    { id: 'direction', label: '운동 방향', opts: [
      { v: 'extension', label: '폄(신전) 방향 반복운동 (엎드려 팔굽혀 올리기 등)' },
      { v: 'flexion', label: '굽힘(굴곡) 방향 반복운동' },
      { v: 'lateral', label: '가쪽 이동(lateral shift) 교정 후 폄' },
      { v: 'rotation', label: '돌림 방향' },
    ]},
    { id: 'criteria', label: '방향 결정 기준', opts: [
      { v: 'centralize', label: '증상이 몸 중심으로 이동(중심화)하는 방향을 채택' },
      { v: 'painfree', label: '가장 안 아픈 방향을 채택' },
      { v: 'rom', label: '가동범위가 가장 큰 방향을 채택' },
      { v: 'protocol', label: '진단명에 따라 정해진 방향을 일괄 적용' },
    ]},
    { id: 'volume', label: '1세트 반복 수', opts: [
      { v: 'r10', label: '10~15회' }, { v: 'r5', label: '5회' }, { v: 'r30', label: '30회' },
    ]},
    { id: 'sched', label: '수행 빈도', opts: [
      { v: 'q2h', label: '깨어 있는 동안 1~2시간마다 (하루 6~8세트)' },
      { v: 'tid', label: '하루 3회' },
      { v: 'w23', label: '주 2~3회 치료실에서' },
    ]},
    { id: 'monitor', label: '반응 감시', opts: [
      { v: 'peripheralize', label: '증상이 말초로 번지면 즉시 중단하고 방향 재평가' },
      { v: 'push', label: '통증이 늘어도 정해진 횟수를 채운다' },
      { v: 'none', label: '따로 감시하지 않는다' },
    ]},
    { id: 'posture', label: '병행 자세 교육', opts: [
      { v: 'lordosis', label: '앉을 때 허리 굽힘 유지를 피하고 지지 쿠션 사용' },
      { v: 'flex_rest', label: '통증 시 웅크린 자세로 휴식' },
      { v: 'none', label: '자세 교육 없음' },
    ]},
  ],
};

RX.protos.aerobic = {
  name: '유산소 운동 (Aerobic exercise)', cat: '운동치료',
  ref: 'FITT 원칙으로 처방한다. 통증 부위에 부하가 적은 방식(자전거·수중)을 우선 고려한다.',
  fields: [
    { id: 'mode', label: '운동 종류', opts: [
      { v: 'walk', label: '걷기 · 트레드밀' },
      { v: 'bike', label: '고정식 자전거 (체중부하 적음)' },
      { v: 'aqua', label: '수중 걷기 · 수영' },
      { v: 'elliptical', label: '일립티컬 · 로잉' },
    ]},
    { id: 'intensity', label: '강도', opts: [
      { v: 'i40', label: '여유심박수의 40~59 % (중등도 하한)' },
      { v: 'i60', label: '여유심박수의 60~75 % (중등도)' },
      { v: 'rpe', label: 'RPE 12~14 (약간 힘듦 — 대화 가능)' },
      { v: 'max', label: '최대 강도 인터벌' },
    ]},
    { id: 'time', label: '1회 시간', opts: [
      { v: 't10', label: '10분씩 나눠서 총 30분' },
      { v: 't30', label: '연속 30분' },
      { v: 't60', label: '60분' },
    ]},
    { id: 'sched', label: '빈도', opts: [
      { v: 'w35', label: '주 3~5회' }, { v: 'w5', label: '주 5회 이상 (총 150분/주)' }, { v: 'w2', label: '주 2회' },
    ]},
  ],
};

RX.protos.gait_train = {
  name: '보행 · 기능적 과제 훈련', cat: '운동치료',
  ref: '실제로 못 하는 동작(PSFS에서 확인된 과제)을 그대로 훈련 과제로 삼는다.',
  fields: [
    { id: 'task', label: '훈련 과제', opts: [ { v: 'generic', label: '(환자별 목표 과제)' } ]},
    { id: 'assist', label: '보조 · 환경', opts: [
      { v: 'parallel', label: '평행봉 안에서' },
      { v: 'aid', label: '보조기구(지팡이 · 워커) 사용' },
      { v: 'aqua', label: '수중(부력으로 체중부하 감소)' },
      { v: 'independent', label: '보조 없이 지면에서' },
    ]},
    { id: 'load', label: '체중부하 조건', opts: [
      { v: 'nwb', label: '비체중부하' }, { v: 'pwb', label: '부분 체중부하 (통증 허용 범위)' },
      { v: 'fwb', label: '완전 체중부하' },
    ]},
    { id: 'volume', label: '용량', opts: [
      { v: 'v10min', label: '10~15분 × 2세트' },
      { v: 'v3x10', label: '10회 × 3세트 (과제 반복)' },
      { v: 'distance', label: '목표 거리 · 시간을 매주 10 %씩 증가' },
    ]},
    { id: 'sched', label: '빈도', opts: [
      { v: 'w23', label: '주 2~3회' }, { v: 'w35', label: '주 3~5회' }, { v: 'daily', label: '매일' },
    ]},
  ],
};

RX.protos.aquatic = {
  name: '수중운동 (Aquatic therapy)', cat: '운동치료',
  ref: '부력으로 관절 부하를 줄이고 점성으로 저항을 준다. 수심이 곧 체중부하율이다.',
  fields: [
    { id: 'depth', label: '수심 (체중부하)', opts: [
      { v: 'neck', label: '목 높이 — 체중의 약 10 %' },
      { v: 'chest', label: '가슴 높이 — 체중의 약 25~35 %' },
      { v: 'waist', label: '허리 높이 — 체중의 약 50 %' },
    ]},
    { id: 'temp', label: '수온', opts: [
      { v: 't34', label: '33~35 ℃ — 이완 · 통증 조절' },
      { v: 't30', label: '28~31 ℃ — 활발한 운동' },
    ]},
    { id: 'content', label: '운동 내용', opts: [
      { v: 'walk', label: '수중 보행 · 체중이동 · 균형' },
      { v: 'rom', label: '부력 보조 관절가동범위 운동' },
      { v: 'resist', label: '수중 저항기구를 이용한 근력운동' },
      { v: 'halliwick', label: '할리윅 · 바트라가츠 등 특수 접근' },
    ]},
    { id: 'time', label: '1회 시간', opts: [
      { v: 't20', label: '20분' }, { v: 't30', label: '30~40분' }, { v: 't60', label: '60분' },
    ]},
    { id: 'sched', label: '빈도', opts: [
      { v: 'w23', label: '주 2~3회' }, { v: 'w1', label: '주 1회' }, { v: 'w35', label: '주 3~5회' },
    ]},
  ],
};

RX.protos.bfr = {
  name: '혈류제한 저강도 운동 (BFR training)', cat: '운동치료',
  ref: '고부하를 견딜 수 없는 시기에 저부하로 근비대를 얻는다. 동맥폐색압(LOP) 기준으로 커프압을 정한다.',
  fields: [
    { id: 'pressure', label: '커프압', opts: [
      { v: 'p40', label: '동맥폐색압의 40~50 % (상지)' },
      { v: 'p80', label: '동맥폐색압의 60~80 % (하지)' },
      { v: 'p100', label: '완전 폐색' },
    ]},
    { id: 'load', label: '운동 부하', opts: [
      { v: 'l20', label: '1RM의 20~30 %' }, { v: 'l50', label: '1RM의 50 %' }, { v: 'l70', label: '1RM의 70 %' },
    ]},
    { id: 'volume', label: '세트 × 반복', opts: [
      { v: 'v30_15', label: '30-15-15-15회 × 4세트' },
      { v: 'v3x10', label: '10회 × 3세트' },
    ]},
    { id: 'rest', label: '세트 간 휴식 · 커프', opts: [
      { v: 'r30_on', label: '30초 휴식 · 커프 유지' },
      { v: 'r60_off', label: '60초 휴식 · 커프 해제' },
    ]},
    { id: 'sched', label: '빈도', opts: [
      { v: 'w23', label: '주 2~3회' }, { v: 'w35', label: '주 3~5회' },
    ]},
  ],
};

// ══════════════════════════════════════════════════════════════
// Ⅳ. 보조기 · 테이핑 · 교육 · 협진
// ══════════════════════════════════════════════════════════════

RX.protos.taping = {
  name: '테이핑 (Taping)', cat: '보조 중재',
  ref: '목적에 따라 테이프 종류와 장력이 다르다. 지지·제한이면 비탄력, 감각 입력이면 탄력테이프.',
  fields: [
    { id: 'purpose', label: '목적', opts: [
      { v: 'support', label: '관절 지지 · 가동 제한' },
      { v: 'realign', label: '정렬 교정 (예: 무릎뼈 안쪽 활주)' },
      { v: 'facilitate', label: '근 활성 촉진 · 감각 입력' },
      { v: 'edema', label: '부종 · 순환 개선' },
    ]},
    { id: 'tape', label: '테이프 종류', opts: [
      { v: 'rigid', label: '비탄력 스포츠 테이프' },
      { v: 'kinesio', label: '탄력 키네시오 테이프' },
      { v: 'mcconnell', label: '맥코넬 테이핑 (비탄력 + 언더랩)' },
    ]},
    { id: 'tension', label: '장력', opts: [
      { v: 'none', label: '0 % (자연 장력)' },
      { v: 't25', label: '15~25 % (경도)' },
      { v: 't50', label: '50 % 이상 (중~고도)' },
    ]},
    { id: 'check', label: '적용 직후 확인', opts: [
      { v: 'symptom_test', label: '유발 동작을 다시 시켜 통증이 즉시 줄었는지 확인 후 유지' },
      { v: 'none', label: '확인 없이 유지' },
    ]},
    { id: 'duration', label: '유지 기간', opts: [
      { v: 'd1', label: '치료 세션 동안만' },
      { v: 'd3', label: '2~3일 착용 후 교체' },
      { v: 'd7', label: '1주 이상 연속' },
    ]},
  ],
};

RX.protos.orthosis = {
  name: '보조기 · 부목 · 깔창 (Orthosis)', cat: '보조 중재',
  ref: '착용 시점(주간/야간)과 기간을 정하지 않으면 처방이 아니다. 장기 고정은 위축·의존을 만든다.',
  fields: [
    { id: 'device', label: '장치 종류', opts: [ { v: 'generic', label: '(환자별 장치)' } ]},
    { id: 'position', label: '고정 위치 · 각도', opts: [
      { v: 'neutral', label: '중립 위치' },
      { v: 'functional', label: '기능적 위치 (약간 폄)' },
      { v: 'protective', label: '손상 조직을 짧게 두는 보호 위치' },
      { v: 'corrective', label: '교정 위치 — 변형을 반대 방향으로 밀어 유지 (측만 브레이스 등)' },
    ]},
    { id: 'wear', label: '착용 시점', opts: [
      { v: 'night', label: '야간 착용' },
      { v: 'day_task', label: '주간 · 증상 유발 활동 시' },
      { v: 'full', label: '하루 종일 상시' },
    ]},
    { id: 'period', label: '착용 기간', opts: [
      { v: 'p2w', label: '2주 이내(단기 보호)' },
      { v: 'p1_3m', label: '1~3개월' },
      { v: 'p6m', label: '6개월 이상 · 무기한' },
    ]},
    { id: 'combine', label: '병행 조건', opts: [
      { v: 'with_ex', label: '운동 · 활동 수정과 반드시 병행 (의존 방지)' },
      { v: 'alone', label: '보조기 단독' },
    ]},
  ],
};

RX.protos.education = {
  name: '환자 교육 · 활동 수정 (Education)', cat: '교육 · 상담',
  ref: '무엇을 말하느냐만큼 어떤 틀로 말하느냐가 결과를 바꾼다. 병리해부학 위주의 겁주는 설명은 회피 행동을 키운다.',
  fields: [
    { id: 'content', label: '핵심 교육 내용', opts: [ { v: 'generic', label: '(환자별 교육 주제)' } ]},
    { id: 'frame', label: '설명 틀', opts: [
      { v: 'reassure_active', label: '안심 + 활동 유지 권장 (예후가 양호함을 근거와 함께)' },
      { v: 'pathoanatomy', label: '구조 손상 · 퇴행성 변화 중심의 병리해부학적 설명' },
      { v: 'biopsychosocial', label: '통증의 생물심리사회적 이해 · 통증신경생리 교육' },
      { v: 'rest_protect', label: '휴식과 보호를 강조' },
    ]},
    { id: 'method', label: '전달 방법', opts: [
      { v: 'verbal_written', label: '구두 설명 + 그림·유인물 제공' },
      { v: 'demo', label: '직접 시범 후 환자가 재현하도록 확인 (teach-back)' },
      { v: 'verbal', label: '구두 설명만' },
      { v: 'app', label: '영상 · 앱으로 대체' },
    ]},
    { id: 'behavior', label: '행동 목표', opts: [
      { v: 'goal_setting', label: '환자와 함께 구체적 목표 설정 · 활동 단계적 재개' },
      { v: 'ergonomic', label: '작업환경 · 자세 조정 (모니터 높이 · 휴식 주기 등)' },
      { v: 'load_mgmt', label: '부하 관리 (증상 유발 활동의 양·빈도 조절)' },
      { v: 'avoid', label: '증상 유발 활동을 전면 회피' },
    ]},
    { id: 'reinforce', label: '강화 · 추적', opts: [
      { v: 'each_visit', label: '매 방문마다 재확인 · 필요 시 수정' },
      { v: 'once', label: '초진 때 한 번' },
    ]},
  ],
};

RX.protos.hep = {
  name: '가정운동 프로그램 (HEP) · 준수 전략', cat: '교육 · 상담',
  ref: '가정운동의 효과는 준수도가 좌우한다. 개수를 줄이고 기록·점검 장치를 붙인다.',
  fields: [
    { id: 'count', label: '처방 운동 개수', opts: [
      { v: 'c2_3', label: '2~3가지 (핵심만)' },
      { v: 'c5', label: '4~5가지' },
      { v: 'c8', label: '8가지 이상' },
    ]},
    { id: 'sched', label: '수행 빈도', opts: [
      { v: 'daily', label: '하루 1회 · 매일' },
      { v: 'bid', label: '하루 2회 · 매일' },
      { v: 'w35', label: '주 3~5회' },
    ]},
    { id: 'adherence', label: '준수 전략', opts: [
      { v: 'log_review', label: '운동일지 작성 + 다음 방문 때 함께 검토' },
      { v: 'teachback', label: '치료실에서 직접 수행시켜 정확도 확인 후 귀가' },
      { v: 'handout', label: '유인물만 제공' },
      { v: 'reminder', label: '휴대폰 알림 설정' },
    ]},
    { id: 'progress', label: '난이도 조정', opts: [
      { v: 'criteria', label: '통증·수행 능력 기준을 정해 스스로 진행하도록 교육' },
      { v: 'visit', label: '방문할 때마다 치료사가 조정' },
      { v: 'fixed', label: '동일하게 유지' },
    ]},
  ],
};

RX.protos.referral = {
  name: '협진 · 의뢰 (Referral)', cat: '협진',
  ref: '의뢰 사유·시점·의뢰 후 물리치료 계획을 함께 정한다.',
  fields: [
    { id: 'to', label: '의뢰 대상', opts: [
      { v: 'ortho', label: '정형외과 · 재활의학과' },
      { v: 'neuro', label: '신경과 · 신경외과' },
      { v: 'internal', label: '내과 (전신질환 감별)' },
      { v: 'surgeon', label: '수술 상담' },
      { v: 'nutrition', label: '영양사 · 체중관리 (의사와 협력)' },
      { v: 'psych', label: '심리 · 정신건강 (통증 대처 · 복귀 불안)' },
    ]},
    { id: 'reason', label: '의뢰 사유', opts: [
      { v: 'injection', label: '주사(스테로이드 등) 병행이 물리치료 효과를 높일 때' },
      { v: 'redflag', label: '적신호 소견 · 신경학적 결손 진행' },
      { v: 'nonresponse', label: '적절한 보존치료에 반응하지 않을 때' },
      { v: 'imaging', label: '영상 확인 필요' },
      { v: 'comorbid', label: '동반 요인(체중 · 대사 · 심리)이 치료 결과를 좌우할 때' },
      { v: 'decision', label: '수술 여부 · 복귀 시점 등 공동 의사결정이 필요할 때' },
    ]},
    { id: 'timing', label: '시점', opts: [
      { v: 'now', label: '즉시' },
      { v: 'after_trial', label: '4~6주 보존치료 후 반응이 없으면' },
      { v: 'concurrent', label: '물리치료와 동시 진행' },
    ]},
    { id: 'pt_plan', label: '의뢰 후 물리치료', opts: [
      { v: 'continue', label: '물리치료를 중단하지 않고 병행 · 주사 후 운동으로 효과 유지' },
      { v: 'hold', label: '결과가 나올 때까지 물리치료 보류' },
    ]},
  ],
};

RX.protos.regimen = {
  name: '일반 요법 (기간 · 빈도)', cat: '기타',
  ref: '파라미터가 따로 없는 중재도 적용 기간과 빈도는 정해야 한다.',
  fields: [
    { id: 'time', label: '1회 적용 시간', opts: [
      { v: 't10', label: '10분' }, { v: 't20', label: '20분' }, { v: 't30', label: '30분' }, { v: 'all_day', label: '하루 종일' },
    ]},
    { id: 'sched', label: '빈도', opts: [
      { v: 'w23', label: '주 2~3회' }, { v: 'w35', label: '주 3~5회' }, { v: 'daily', label: '매일' },
    ]},
    { id: 'period', label: '적용 기간', opts: [
      { v: 'p2w', label: '2주' }, { v: 'p6w', label: '4~6주' }, { v: 'p3m', label: '3개월 이상' },
    ]},
  ],
};

// ══════════════════════════════════════════════════════════════
// Ⅴ. 부위별 선택지 풀 (표적 근육 · 분절 · 조직 · 과제 · 장치 · 교육주제)
// ─────────────────────────────────────────────────────────────
// "어떤 근육을 강화할 것인가"는 중재 처방의 핵심이지만, 정답인 중재에만
// 그럴듯한 목록을 붙이면 목록만 보고 정답을 알아챈다. 그래서 표적 목록은
// 환자의 부위(region)로 정해지고, 그 환자의 모든 중재가 같은 목록을 쓴다.
// ══════════════════════════════════════════════════════════════

RX.pools = {
  // ── 표적 근육 ─────────────────────────────────────────────
  muscle: {
    cervical: [
      { v: 'dnf', label: '깊은목굽힘근 (목긴근 · 머리긴근)' },
      { v: 'deep_ext', label: '목 깊은폄근 (뭇갈래근 · 반가시근)' },
      { v: 'scap', label: '어깨가슴 안정화근 (아래등세모근 · 앞톱니근)' },
      { v: 'upper_trap', label: '위등세모근 · 어깨올림근 (과활성 — 이완 대상)' },
      { v: 'scm', label: '목빗근 · 목갈비근 (대상작용 근육)' },
      { v: 'sh_girdle', label: '어깨이음뼈 전반 (어깨세모근 · 돌림근띠)' },
    ],
    shoulder: [
      { v: 'rc', label: '돌림근띠 (가시위근 · 가시아래근 · 작은원근 · 어깨밑근)' },
      { v: 'scap', label: '어깨뼈 안정화근 (앞톱니근 · 중간/아래등세모근)' },
      { v: 'ext_rot', label: '가쪽돌림근 (가시아래근 · 작은원근)' },
      { v: 'deltoid', label: '어깨세모근' },
      { v: 'pec_lat', label: '큰가슴근 · 넓은등근 (단축 — 신장 대상)' },
      { v: 'post_cap', label: '뒤쪽 관절주머니 · 뒤쪽 어깨근육 (단축)' },
    ],
    wrist: [
      { v: 'thenar', label: '엄지두덩근 (짧은엄지벌림근 · 짧은엄지굽힘근)' },
      { v: 'w_ext', label: '손목폄근군' },
      { v: 'w_flex', label: '손목굽힘근군' },
      { v: 'intrinsic', label: '손 내재근 (벌레근 · 뼈사이근)' },
      { v: 'scap_post', label: '어깨가슴 · 자세 조절근 (몸쪽 사슬)' },
    ],
    lumbar: [
      { v: 'multifidus', label: '허리 뭇갈래근 (분절 안정화근)' },
      { v: 'tra', label: '배가로근 · 골반바닥근' },
      { v: 'ext', label: '허리·등 폄근 (척주세움근) 지구력' },
      { v: 'oblique', label: '배빗근 (몸통 회전 조절)' },
      { v: 'glute', label: '큰볼기근 · 중간볼기근 (엉덩관절 신전·측방 안정)' },
      { v: 'hip_flex', label: '엉덩허리근 (단축 — 신장 대상)' },
    ],
    hip: [
      { v: 'abd', label: '엉덩관절 벌림근 (중간볼기근 · 작은볼기근)' },
      { v: 'ext_rot', label: '깊은 가쪽돌림근 (궁둥구멍근 등 짧은 돌림근군)' },
      { v: 'glute_max', label: '큰볼기근 (엉덩관절 폄)' },
      { v: 'iliopsoas', label: '엉덩허리근 (굽힘근 — 유연성/조절)' },
      { v: 'quad_ham', label: '넙다리네갈래근 · 넙다리뒤근육' },
      { v: 'trunk', label: '몸통 · 골반 조절근 (배가로근 · 뭇갈래근)' },
    ],
    knee: [
      { v: 'quad', label: '넙다리네갈래근 (안쪽넓은근 포함)' },
      { v: 'ham', label: '넙다리뒤근육 (슬괵근)' },
      { v: 'hip_post', label: '엉덩관절 뒤가쪽 근육 (중간볼기근 · 큰볼기근 · 가쪽돌림근)' },
      { v: 'calf', label: '장딴지근 · 가자미근' },
      { v: 'itb_tfl', label: '넙다리근막긴장근 · 엉덩정강띠 (단축)' },
      { v: 'trunk', label: '몸통 · 골반 조절근' },
    ],
    ankle: [
      { v: 'peroneal', label: '종아리근 (긴/짧은종아리근 — 가쪽번짐)' },
      { v: 'triceps', label: '장딴지근 · 가자미근 (발바닥굽힘)' },
      { v: 'tib_ant', label: '앞정강근 (발등굽힘)' },
      { v: 'tib_post', label: '뒤정강근 (안쪽세로활 지지)' },
      { v: 'intrinsic', label: '발 내재근' },
      { v: 'hip_prox', label: '엉덩관절 몸쪽 조절근 (중간볼기근 등)' },
    ],
    spine: [
      { v: 'concave', label: '오목(오목쪽) 몸통 근육 — 단축·저활성 (신장 + 재활성)' },
      { v: 'convex', label: '볼록(볼록쪽) 몸통 근육 — 신장·약화 (교정 방향 수축)' },
      { v: 'multifidus', label: '분절 안정화근 (뭇갈래근 · 배가로근)' },
      { v: 'ext', label: '몸통 폄근 지구력 (척주세움근)' },
      { v: 'scap', label: '어깨가슴 안정화근 (어깨이음뼈 정렬)' },
      { v: 'hip_glute', label: '엉덩관절 벌림근 · 폄근 (골반 정렬)' },
    ],
    foot: [
      { v: 'intrinsic', label: '발 내재근 (짧은엄지굽힘근 · 발바닥네모근)' },
      { v: 'tib_post', label: '뒤정강근 (엎침 조절)' },
      { v: 'triceps', label: '장딴지근 · 가자미근' },
      { v: 'peroneal', label: '종아리근' },
      { v: 'hip_prox', label: '엉덩관절 몸쪽 조절근' },
    ],
  },

  // ── 표적 관절 · 분절 · 활주 방향 ───────────────────────────
  joint: {
    cervical: [
      { v: 'c0_2', label: '위목뼈 C0-1 · C1-2 (돌림 · 굽힘-돌림)' },
      { v: 'c45', label: '중간목뼈 C4-5 · C5-6 뒤-앞쪽(PA) 활주' },
      { v: 'c67', label: '아래목뼈 C6-7 · 목가슴 이음부' },
      { v: 'thoracic', label: '위·중간 등뼈 T1-T6' },
      { v: 'first_rib', label: '첫째 갈비뼈' },
      { v: 'cerv_lat', label: '목뼈 가쪽 활주 (신경 감압 방향)' },
    ],
    shoulder: [
      { v: 'gh_inf', label: '오목위팔관절 아래쪽 활주 (벌림 회복)' },
      { v: 'gh_post', label: '오목위팔관절 뒤쪽 활주 (안쪽돌림 회복)' },
      { v: 'gh_ant', label: '오목위팔관절 앞쪽 활주 (가쪽돌림 회복)' },
      { v: 'st', label: '어깨가슴 관절 (어깨뼈 활주)' },
      { v: 'ac_sc', label: '봉우리빗장 · 복장빗장 관절' },
      { v: 'thoracic', label: '등뼈 폄 가동성' },
    ],
    wrist: [
      { v: 'carpal', label: '손목뼈 · 손목굴 (손목뼈 활주)' },
      { v: 'radiocarpal', label: '노손목관절 · 먼쪽 노자관절' },
      { v: 'cervical', label: '목뼈 (몸쪽 연관 부위)' },
      { v: 'elbow', label: '팔꿈치 · 아래팔' },
    ],
    lumbar: [
      { v: 'l45', label: '허리뼈 L4-5 · L5-S1 뒤-앞쪽(PA) 활주' },
      { v: 'l13', label: '허리뼈 L1-L3' },
      { v: 'tl', label: '등허리 이음부 T12-L1' },
      { v: 'si', label: '엉치엉덩관절' },
      { v: 'hip', label: '엉덩관절 (허리 부하 분산)' },
    ],
    hip: [
      { v: 'hip_lat', label: '엉덩관절 가쪽(측방) 활주 · 견인' },
      { v: 'hip_post', label: '엉덩관절 뒤쪽 활주 (굽힘·안쪽돌림 회복)' },
      { v: 'hip_ant', label: '엉덩관절 앞쪽 활주 (폄·가쪽돌림 회복)' },
      { v: 'lumbar', label: '허리뼈 (연관 분절)' },
      { v: 'si', label: '엉치엉덩관절' },
    ],
    knee: [
      { v: 'tf_ext', label: '정강넙다리관절 — 폄 방향 가동 (완전 폄 회복)' },
      { v: 'tf_flex', label: '정강넙다리관절 — 굽힘 방향 가동' },
      { v: 'patella', label: '무릎뼈 활주 (안쪽 · 위아래)' },
      { v: 'ptf', label: '몸쪽 정강종아리관절' },
      { v: 'hip_ankle', label: '인접 관절 — 엉덩관절 · 발목 가동성' },
    ],
    ankle: [
      { v: 'talus_post', label: '목말뼈 뒤쪽 활주 (발등굽힘 제한 개선)' },
      { v: 'talus_ant', label: '목말뼈 앞→뒤 가동술 (급성기 통증 없는 범위)' },
      { v: 'fibula', label: '먼쪽 종아리뼈 활주' },
      { v: 'subtalar', label: '목말밑관절 · 중간발목관절' },
      { v: 'toes', label: '발허리발가락관절 (특히 엄지)' },
    ],
    spine: [
      { v: 'apex_thoracic', label: '주만곡 정점 등뼈 분절 (오목쪽 뒤-앞 활주)' },
      { v: 'tl', label: '등허리 이음부 T12-L1' },
      { v: 'lumbar', label: '허리뼈 분절 (2차 만곡 부위)' },
      { v: 'ribs', label: '갈비뼈 · 갈비척추관절 (가슴우리 가동성 — 오목쪽 확장)' },
      { v: 'hip', label: '엉덩관절 (골반 정렬 연관)' },
    ],
    foot: [
      { v: 'talocrural', label: '목말종아리관절 발등굽힘 가동술' },
      { v: 'subtalar', label: '목말밑관절 · 중간발목관절' },
      { v: 'mtp1', label: '첫째 발허리발가락관절 (윈들라스 기전)' },
      { v: 'midfoot', label: '중간발 관절군' },
    ],
  },

  // ── 표적 연부조직 ─────────────────────────────────────────
  tissue: {
    cervical: [
      { v: 'upper_trap', label: '위등세모근 · 어깨올림근' },
      { v: 'subocc', label: '뒤통수밑근군' },
      { v: 'scalene', label: '목갈비근 · 목빗근' },
      { v: 'pec_minor', label: '작은가슴근' },
      { v: 'levator_scap', label: '어깨올림근 부착부' },
    ],
    shoulder: [
      { v: 'post_cap', label: '뒤쪽 관절주머니 · 뒤쪽 어깨근육' },
      { v: 'pec', label: '큰가슴근 · 작은가슴근' },
      { v: 'rc_tendon', label: '돌림근띠 힘줄 부착부' },
      { v: 'biceps', label: '위팔두갈래근 긴갈래 힘줄고랑' },
      { v: 'lat', label: '넓은등근 · 큰원근' },
    ],
    wrist: [
      { v: 'tcl', label: '가로손목인대 · 손목굴 연부조직' },
      { v: 'flexor', label: '손목굽힘근군 · 아래팔 앞쪽' },
      { v: 'median_path', label: '정중신경 주행 경로 연부조직' },
      { v: 'thenar', label: '엄지두덩 · 손바닥널힘줄' },
    ],
    lumbar: [
      { v: 'paraspinal', label: '허리 척주세움근 · 등허리근막' },
      { v: 'ql', label: '허리네모근' },
      { v: 'glute_piri', label: '볼기근 · 궁둥구멍근' },
      { v: 'ham', label: '넙다리뒤근육' },
      { v: 'iliopsoas', label: '엉덩허리근' },
    ],
    hip: [
      { v: 'iliopsoas', label: '엉덩허리근 · 넙다리곧은근' },
      { v: 'tfl_itb', label: '넙다리근막긴장근 · 엉덩정강띠' },
      { v: 'piriformis', label: '궁둥구멍근 · 깊은 돌림근군' },
      { v: 'adductor', label: '모음근군' },
      { v: 'capsule', label: '엉덩관절 앞쪽 관절주머니' },
    ],
    knee: [
      { v: 'itb_lat', label: '엉덩정강띠 · 가쪽 지지띠' },
      { v: 'quad', label: '넙다리네갈래근 · 무릎뼈 힘줄' },
      { v: 'ham_calf', label: '넙다리뒤근육 · 장딴지' },
      { v: 'fat_pad', label: '무릎뼈아래 지방체 주변' },
      { v: 'popliteal', label: '오금 부위 연부조직' },
    ],
    ankle: [
      { v: 'achilles', label: '발꿈치힘줄 중간부 (부착부에서 2~7 cm)' },
      { v: 'achilles_ins', label: '발꿈치힘줄 부착부' },
      { v: 'triceps', label: '장딴지근 · 가자미근 근복' },
      { v: 'atfl', label: '앞목말종아리인대 주변 · 가쪽 부위' },
      { v: 'plantar', label: '발바닥근막' },
    ],
    spine: [
      { v: 'concave_para', label: '오목쪽 척주세움근 · 허리네모근 (단축)' },
      { v: 'lat_ql', label: '넓은등근 · 몸통 가쪽 근막 (오목쪽 측면)' },
      { v: 'ham', label: '넙다리뒤근육' },
      { v: 'iliopsoas', label: '엉덩허리근' },
      { v: 'pec', label: '큰가슴근 · 작은가슴근 (어깨 앞쪽 단축)' },
    ],
    foot: [
      { v: 'plantar', label: '발바닥근막 (안쪽 발꿈치뼈 결절 부착부)' },
      { v: 'triceps', label: '장딴지근 · 가자미근' },
      { v: 'achilles', label: '발꿈치힘줄' },
      { v: 'intrinsic', label: '발 내재근 · 발바닥 연부조직' },
    ],
  },

  // ── 목표 기능 과제 ────────────────────────────────────────
  task: {
    cervical: [
      { v: 'desk', label: '장시간 앉은 작업 — 중립 자세 유지와 휴식 주기' },
      { v: 'driving', label: '운전 중 고개 돌리기 · 후방 확인' },
      { v: 'overhead', label: '머리 위 선반 물건 꺼내기' },
      { v: 'carry', label: '가방 · 물건 들고 이동' },
    ],
    shoulder: [
      { v: 'overhead', label: '머리 위로 팔 들어 올리기 (선반 · 빨래 널기)' },
      { v: 'behind_back', label: '등 뒤로 손 돌리기 (속옷 · 뒷주머니)' },
      { v: 'hair', label: '머리 감기 · 빗기' },
      { v: 'carry', label: '무게 있는 물건 들기' },
    ],
    wrist: [
      { v: 'grip', label: '쥐기 · 집기 (동전 · 카드 · 단추)' },
      { v: 'repetitive', label: '계산대 반복 스캔 · 물건 옮기기' },
      { v: 'keyboard', label: '키보드 · 마우스 사용' },
      { v: 'open_jar', label: '병뚜껑 열기 등 강한 쥐기' },
    ],
    lumbar: [
      { v: 'lift', label: '중량물 들기 · 내리기 (엉덩관절 경첩 동작)' },
      { v: 'transfer', label: '환자 이송 · 체위 변경' },
      { v: 'sit_stand', label: '앉았다 일어서기 · 앉은 자세 지속' },
      { v: 'walk', label: '걷기 · 지구력 활동' },
      { v: 'bend', label: '반복적으로 굽혔다 펴기' },
    ],
    hip: [
      { v: 'squat', label: '스쿼트 · 앉았다 일어서기' },
      { v: 'single_leg', label: '한 다리 지지 · 계단 오르내리기' },
      { v: 'cut', label: '달리기 중 방향 전환 · 슈팅' },
      { v: 'dance', label: '무용 동작 (아라베스크 · 피루엣)' },
      { v: 'walk', label: '보행 · 지팡이 사용 보행' },
    ],
    knee: [
      { v: 'squat', label: '스쿼트 · 계단 오르내리기' },
      { v: 'run', label: '달리기 — 케이던스 · 착지 방식' },
      { v: 'land', label: '점프 착지 · 방향 전환' },
      { v: 'hike', label: '경사 보행 · 등산' },
      { v: 'gait', label: '평지 보행 (체중부하 정상화)' },
    ],
    ankle: [
      { v: 'balance', label: '한 발 서기 · 불안정면 균형' },
      { v: 'gait', label: '보행 — 발뒤꿈치 닿기부터 밀기까지' },
      { v: 'run_jump', label: '달리기 · 점프 · 방향 전환' },
      { v: 'stairs', label: '계단 · 사다리 작업' },
      { v: 'hike', label: '등산 · 울퉁불퉁한 지면' },
    ],
    spine: [
      { v: 'adl_posture', label: '일상 자세에서 자가교정 유지 (앉기 · 서기)' },
      { v: 'school_sit', label: '장시간 수업 중 앉은 자세' },
      { v: 'carry', label: '가방 메기 · 물건 들기' },
      { v: 'sport', label: '체육 · 스포츠 활동 참여' },
      { v: 'sleep', label: '수면 자세' },
    ],
    foot: [
      { v: 'stand', label: '장시간 서 있기 · 근무 중 체중 부하' },
      { v: 'first_step', label: '아침 첫 발 딛기 · 앉았다 일어난 직후 보행' },
      { v: 'walk', label: '보행 거리 늘리기' },
      { v: 'stairs', label: '계단 · 경사' },
    ],
  },

  // ── 보조기 · 장치 ─────────────────────────────────────────
  device: {
    cervical: [
      { v: 'collar', label: '목뼈 보조기(칼라)' },
      { v: 'pillow', label: '경추 지지 베개 · 요추 지지쿠션' },
      { v: 'ergonomic', label: '모니터 받침 · 작업대 조정 장치' },
    ],
    shoulder: [
      { v: 'sling', label: '팔걸이(슬링)' },
      { v: 'taping', label: '어깨 지지 테이핑' },
      { v: 'posture', label: '자세 보조 밴드' },
    ],
    wrist: [
      { v: 'neutral_splint', label: '중립 자세 손목 보조기 (0~5° 폄)' },
      { v: 'mcp_splint', label: '손목 + MCP 관절 포함 보조기' },
      { v: 'ext_splint', label: '손목 폄 위치 고정 보조기' },
      { v: 'glove', label: '압박 장갑 · 손목 밴드' },
    ],
    lumbar: [
      { v: 'lso', label: '허리 보조대 (요추 보호대)' },
      { v: 'lumbar_roll', label: '허리 지지 쿠션 (앉은 자세용)' },
      { v: 'work_aid', label: '이송 보조기구 · 작업대 높이 조절' },
    ],
    hip: [
      { v: 'cane', label: '지팡이 (반대측 손 사용)' },
      { v: 'hip_brace', label: '엉덩관절 보조기' },
      { v: 'seat', label: '높은 좌면 의자 · 좌식 회피 보조' },
    ],
    knee: [
      { v: 'hinged', label: '경첩형 무릎 보조기 (측방 보호 · 시상면 허용)' },
      { v: 'functional_acl', label: '기능성 ACL 보조기' },
      { v: 'sleeve', label: '무릎 슬리브 · 스트랩' },
      { v: 'crutch', label: '목발 · 체중부하 보조' },
      { v: 'immobilizer', label: '무릎 고정 부목 (원통형)' },
      { v: 'prefab_orthosis', label: '기성 발보조기 (안창 — 엎침 조절)' },
      { v: 'custom_orthosis', label: '맞춤 발보조기' },
    ],
    ankle: [
      { v: 'lace_brace', label: '끈 조임식 발목 보조기 (활동 시)' },
      { v: 'semi_rigid', label: '반강성 발목 브레이스 · 스터럽' },
      { v: 'tape', label: '발목 테이핑' },
      { v: 'cast', label: '석고 고정 · 워커부츠' },
      { v: 'heel_lift', label: '뒤꿈치 올림 패드' },
      { v: 'prefab_orthosis', label: '기성 발보조기 (안창)' },
      { v: 'custom_orthosis', label: '맞춤 발보조기' },
      { v: 'night_splint', label: '야간 부목 (발등굽힘 유지)' },
    ],
    spine: [
      { v: 'tlso', label: '경성 흉요천추 보조기 (TLSO — 쉐노형 등 맞춤 브레이스)' },
      { v: 'soft_brace', label: '연성 보조대 · 자세 교정 밴드' },
      { v: 'night_brace', label: '야간 전용 과교정 브레이스' },
      { v: 'shoe_lift', label: '신발 높이 보정 (다리 길이 차)' },
      { v: 'ergonomic', label: '책·가방·책상 조정 (양쪽 어깨 배낭 등)' },
    ],
    foot: [
      { v: 'prefab_orthosis', label: '기성 발보조기 (안창)' },
      { v: 'custom_orthosis', label: '맞춤 발보조기' },
      { v: 'night_splint', label: '야간 부목 (발등굽힘 유지)' },
      { v: 'rocker', label: '로커바텀 신발 · 신발 교대' },
      { v: 'heel_pad', label: '힐 패드 (충격 완화)' },
    ],
  },

  // ── 교육 주제 ─────────────────────────────────────────────
  edu: {
    _common: [
      { v: 'prognosis', label: '자연 경과와 예후 — 대개 좋아진다는 점을 근거와 함께' },
      { v: 'stay_active', label: '활동 유지 · 조기 일상 복귀의 중요성' },
      { v: 'load_mgmt', label: '부하 관리 — 증상 유발 활동의 양과 빈도 조절' },
      { v: 'ergonomic', label: '작업 환경 · 자세 조정' },
      { v: 'self_monitor', label: '적신호 자가 감시 기준과 재방문 시점' },
      { v: 'exercise_why', label: '운동이 왜 필요한지 · 순응도의 중요성' },
      { v: 'structure_damage', label: '구조 손상 · 퇴행성 변화의 정도와 위험' },
      { v: 'rest_protect', label: '휴식과 보호의 필요성' },
    ],
  },
};

// "(환자별 …)" 자리표시 필드를 부위별 풀로 바꾼다.
RX.POOL_FOR = {
  'nmes.target': 'muscle', 'strength.target': 'muscle', 'met.target': 'muscle',
  'motor_control.target': 'muscle', 'endurance.target': 'muscle', 'eccentric.target': 'tissue',
  'joint_mob.target': 'joint', 'manipulation.target': 'joint', 'mwm.target': 'joint',
  'rom_ex.target': 'joint',
  'stm.target': 'tissue', 'dry_needling.target': 'tissue', 'stretch.target': 'tissue',
  'gait_train.task': 'task', 'orthosis.device': 'device', 'education.content': 'edu',
};

RX.pool = function (poolName, region) {
  const p = RX.pools[poolName];
  if (!p) return null;
  return p[region] || p._common || null;
};

// ══════════════════════════════════════════════════════════════
// Ⅵ. 조회 · 채점 헬퍼
// ══════════════════════════════════════════════════════════════

// 중재 이름만 보고 원형을 추정한다 (rx-plans.js 에 항목이 없을 때의 안전망).
RX.INFER = [
  [/TENS|경피신경/i, 'tens'],
  [/간섭전류|IFC/i, 'ifc'],
  [/신경근전기자극|NMES|러시안|전기자극/i, 'nmes'],
  [/고전압|HVPC/i, 'hvpc'],
  [/초음파/i, 'ultrasound'],
  [/충격파|ESWT/i, 'eswt'],
  [/레이저|광선/i, 'laser'],
  [/단파|극초단파|투과열|투열/i, 'swd'],
  [/온찜질|습열|온열|핫팩|적외선/i, 'hotpack'],
  [/한랭|냉치료|얼음|아이싱|냉찜질/i, 'cryo'],
  [/파라핀/i, 'paraffin'],
  [/대조욕/i, 'contrast'],
  [/견인/i, 'traction'],
  [/이온도입/i, 'iontophoresis'],
  [/도수기법|도수교정|manipulation|thrust/i, 'manipulation'],
  [/가동술|관절가동|mobilization/i, 'joint_mob'],
  [/Mulligan|MWM|SNAG|이동을 동반/i, 'mwm'],
  [/근막|연부조직|IASTM|유발점 압박/i, 'stm'],
  [/근에너지|수축-이완|MET/i, 'met'],
  [/신경가동|신경활주|neural/i, 'neural_mob'],
  [/드라이니들|dry needling/i, 'dry_needling'],
  [/마사지|림프/i, 'massage'],
  [/스트레칭|신장 운동|자가 신장/i, 'stretch'],
  [/방향선호|중심화|맥켄지|MDT|반복운동|굽힘 운동|윌리엄스|가쪽 이동|lateral shift/i, 'mdt'],
  [/원심성|eccentric|Alfredson|HSR/i, 'eccentric'],
  [/균형|고유감각|감각운동|proprioc/i, 'balance'],
  [/플라이오|점프|착지|컷팅/i, 'plyometric'],
  [/운동조절|협응|심부|깊은목굽힘근|신경근육 훈련|신경근 훈련/i, 'motor_control'],
  [/지구력/i, 'endurance'],
  [/유산소|에어로빅|자전거|걷기 운동/i, 'aerobic'],
  [/수중|풀 치료|아쿠아/i, 'aquatic'],
  [/보행|기능적 과제|기능 훈련/i, 'gait_train'],
  [/혈류제한|BFR/i, 'bfr'],
  [/테이핑|테이프/i, 'taping'],
  [/보조기|부목|깔창|안창|칼라|슬링|브레이스|고정/i, 'orthosis'],
  [/가정운동|홈 ?운동|자가 운동 프로그램|HEP/i, 'hep'],
  [/교육|상담|활동 수정|생활방식/i, 'education'],
  [/의뢰|협진|주사/i, 'referral'],
  [/ROM 운동|관절가동범위 운동|진자운동|Codman/i, 'rom_ex'],
  [/강화|근력|저항운동/i, 'strength'],
];

RX.inferProto = function (name) {
  for (const [re, id] of RX.INFER) if (re.test(name)) return id;
  return 'regimen';
};

// 환자의 중재 한 건에 대한 처방 설계를 완성해 돌려준다.
// { proto, name, cat, ref, fields:[...], best:{}, ok:{}, tip }
// 표적 근육·분절 목록은 환자의 부위(region)로 정해지므로, 같은 환자의
// 모든 중재가 같은 목록을 본다 — 목록만 보고 정답을 눈치챌 수 없다.
RX.spec = function (patient, tx) {
  const plan = RX.plans[patient.id + ':' + tx.id] || {};
  const protoId = plan.proto || RX.inferProto(tx.name);
  const proto = RX.protos[protoId] || RX.protos.regimen;
  const fields = proto.fields.map((f) => {
    if (plan.opts && plan.opts[f.id]) return Object.assign({}, f, { opts: plan.opts[f.id] });
    const poolName = RX.POOL_FOR[protoId + '.' + f.id];
    if (poolName) {
      const pool = RX.pool(poolName, patient.region);
      if (pool) return Object.assign({}, f, { opts: pool });
    }
    return f;
  }).concat(plan.fields || []);
  return {
    proto: protoId, name: proto.name, cat: proto.cat, ref: proto.ref,
    fields,
    best: plan.best || {}, ok: plan.ok || {},
    tip: plan.tip || '',
    scored: !!plan.best,   // 정답이 정의된 처방만 채점한다
  };
};

// 학생이 고른 값 하나를 채점한다 → 1 / 0.5 / 0
RX.scoreField = function (spec, fieldId, value) {
  if (value == null || value === '') return 0;
  const best = spec.best[fieldId];
  if (best != null && (Array.isArray(best) ? best.includes(value) : best === value)) return 1;
  const ok = spec.ok[fieldId];
  if (ok != null && (Array.isArray(ok) ? ok.includes(value) : ok === value)) return 0.5;
  return 0;
};

// 중재 한 건의 처방 정확도 (0~1). 정답이 정의된 필드만 분모로 센다.
RX.scoreOne = function (spec, chosen) {
  const graded = spec.fields.filter((f) => spec.best[f.id] != null);
  if (!graded.length) return null;
  const got = graded.reduce((s, f) => s + RX.scoreField(spec, f.id, (chosen || {})[f.id]), 0);
  return got / graded.length;
};

// 보기 좋은 라벨로 바꾼다
RX.label = function (spec, fieldId, value) {
  const f = spec.fields.find((x) => x.id === fieldId);
  if (!f) return value || '—';
  const o = f.opts.find((x) => x.v === value);
  return o ? o.label : (value || '(미선택)');
};

// 정답 용량을 사람이 읽는 문장으로 (결과 리포트용)
RX.bestText = function (spec) {
  return spec.fields.filter((f) => spec.best[f.id] != null).map((f) => {
    const b = spec.best[f.id];
    const v = Array.isArray(b) ? b[0] : b;
    return f.label + ': ' + RX.label(spec, f.id, v);
  }).join(' · ');
};

if (typeof module !== 'undefined' && module.exports) module.exports = { RX };
