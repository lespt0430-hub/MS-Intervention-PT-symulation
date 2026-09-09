// 중재 처방 데이터 점검 — node test/rx.test.js
// 정답표(rx-plans.js)가 라이브러리(rx-library.js)에 실제로 있는 필드·선택지만
// 가리키는지, 권고 중재에 정답이 빠진 곳이 없는지 확인한다.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const ctx = vm.createContext({ console, module: {}, window: {} });
for (const f of ['rx-library.js', 'rx-plans.js', 'patients1.js', 'patients2.js', 'patients3.js']) {
  let src = fs.readFileSync(path.join(ROOT, f), 'utf8');
  // 각 파일이 const 로 선언한 전역을 vm 컨텍스트에 남기려면 var 로 바꾼다
  src = src.replace(/^const (RX|PATIENTS|EXAM_LIBRARY) =/m, 'var $1 =');
  src = src.replace(/^const PATIENTS = \[\];/m, 'var PATIENTS = (typeof PATIENTS !== "undefined" && PATIENTS) || [];');
  vm.runInContext(src, ctx, { filename: f });
}
const { RX, PATIENTS } = ctx;

let err = 0;
const fail = (m) => { console.log('  ✗ ' + m); err++; };
const usedProtos = new Set();
let scored = 0, unscored = 0, partial = 0;

PATIENTS.forEach((p) => {
  p.treatments.forEach((t) => {
    const key = p.id + ':' + t.id;
    const spec = RX.spec(p, t);
    usedProtos.add(spec.proto);
    const plan = RX.plans[key];

    if (!plan) {
      if (t.recommended) fail('권고 중재인데 정답표가 없다: ' + key + ' — ' + t.name);
      else unscored++;
      return;
    }
    if (!t.recommended) fail('비권고 중재에 정답표가 붙어 있다: ' + key);
    scored++;

    const byId = new Map(spec.fields.map((f) => [f.id, f]));
    const check = (bag, kind) => {
      Object.keys(bag || {}).forEach((fid) => {
        const f = byId.get(fid);
        if (!f) return fail(kind + ' 필드가 원형(' + spec.proto + ')에 없다: ' + key + '.' + fid);
        const valid = f.opts.map((o) => o.v);
        const raw = bag[fid];
        (Array.isArray(raw) ? raw : [raw]).forEach((v) => {
          if (!valid.includes(v)) fail(kind + ' 값이 선택지에 없다: ' + key + '.' + fid + ' = ' + v);
        });
      });
    };
    check(plan.best, 'best');
    check(plan.ok, 'ok');

    // ok 가 best 와 겹치면 채점이 모호해진다
    Object.keys(plan.ok || {}).forEach((fid) => {
      const b = plan.best[fid];
      (plan.ok[fid] || []).forEach((v) => {
        if (Array.isArray(b) ? b.includes(v) : b === v) fail('ok 가 best 와 겹친다: ' + key + '.' + fid + ' = ' + v);
      });
    });

    if (!plan.tip) fail('근거 문장(tip)이 없다: ' + key);
    const uncovered = spec.fields.filter((f) => plan.best[f.id] == null);
    if (uncovered.length) {
      partial++;
      console.log('  · ' + key + ' 미채점 필드 ' + uncovered.map((f) => f.id).join(','));
    }
  });
});

// 만점 처방을 넣으면 정말 1.0 이 나오는지
PATIENTS.forEach((p) => p.treatments.forEach((t) => {
  const plan = RX.plans[p.id + ':' + t.id];
  if (!plan) return;
  const spec = RX.spec(p, t);
  const perfect = {};
  Object.keys(plan.best).forEach((f) => {
    const b = plan.best[f];
    perfect[f] = Array.isArray(b) ? b[0] : b;
  });
  const s = RX.scoreOne(spec, perfect);
  if (s !== 1) fail('정답을 그대로 넣었는데 만점이 아니다: ' + p.id + ':' + t.id + ' → ' + s);
}));

console.log('');
console.log('채점 처방 ' + scored + '건 · 비채점(비권고) ' + unscored + '건 · 일부 필드만 채점 ' + partial + '건');
const unused = Object.keys(RX.protos).filter((x) => !usedProtos.has(x));
console.log('원형 ' + Object.keys(RX.protos).length + '종 중 ' + usedProtos.size + '종 사용' +
  (unused.length ? ' · 미사용: ' + unused.join(', ') : ''));
console.log(err ? '\n실패 ' + err + '건' : '\n모두 통과');
process.exit(err ? 1 : 0);
