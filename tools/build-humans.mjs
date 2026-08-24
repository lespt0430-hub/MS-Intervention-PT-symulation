// build-humans.mjs — 환자 12명 + 치료사를 한 번에 만든다
//
//   node tools/build-humans.mjs            전부
//   node tools/build-humans.mjs p3 p6      일부만 (id 로 지정)
//   node tools/build-humans.mjs --keep     감축 전 원본도 남긴다
//
// tools/roster.json 의 사양대로 Blender(MPFB2)를 돌려 .glb 를 뽑고,
// 이어서 gltf-transform 으로 삼각형을 감축한다. 결과는 assets/humans/ 에
// <id>.glb 로 떨어진다.
//
// 한 명당 Blender 를 새로 띄운다. 느리지만(1인당 40~90초) 한 사람에서
// 실패해도 나머지가 멀쩡하고, 실패한 사람만 다시 돌릴 수 있다.

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const OUT = path.join(root, 'assets', 'humans');
const RAW = path.join(root, 'assets', 'humans', '_raw');

// 감축비. 파일럿에서 0.27 이 지금 인형과 비슷한 삼각형 수(약 9~10k)로 떨어졌다.
// 더 줄이면 얼굴이 뭉개지고, 더 두면 삼각형이 배로 뛴다.
const RATIO = 0.27;

const BLENDER = [
  'C:/Program Files/Blender Foundation/Blender 5.2/blender.exe',
  'C:/Program Files/Blender Foundation/Blender 4.2/blender.exe',
  '/usr/bin/blender',
].find((p) => fs.existsSync(p));

if (!BLENDER) {
  console.error('Blender 를 찾지 못했습니다. tools/build-humans.mjs 의 BLENDER 목록에 경로를 추가하세요.');
  process.exit(1);
}

const args = process.argv.slice(2);
const KEEP = args.includes('--keep');
const only = args.filter((a) => !a.startsWith('--'));

const roster = JSON.parse(fs.readFileSync(path.join(here, 'roster.json'), 'utf8'));
const people = [
  ...roster.patients.map((p) => ({ ...p, garment: p.garment || 'gown' })),
  ...roster.staff.map((p) => ({ ...p, garment: p.garment || 'scrub' })),
].filter((p) => only.length === 0 || only.includes(p.id));

if (!people.length) {
  console.error('해당하는 id 가 없습니다:', only.join(', '));
  process.exit(1);
}

fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(RAW, { recursive: true });

// npx 는 윈도우에서 shell 을 거쳐야 실행된다. 그런데 shell:true 면 인자가
// 따옴표 없이 그대로 이어 붙는데, 이 프로젝트 경로에는 공백이 들어 있어서
// (…\시뮬레이션 2\…) 절대경로를 넘기면 공백에서 잘려 엉뚱한 파일을 찾는다.
// 항상 프로젝트 폴더 기준 상대경로로 바꾸고 따옴표로 감싼다.
const rel = (p) => path.relative(root, p).split(path.sep).join('/');
const gltf = (...a) => spawnSync('npx',
  ['--prefix', '.build', 'gltf-transform', ...a.map((x) => `"${x}"`)],
  { cwd: root, encoding: 'utf8', shell: true, maxBuffer: 32 * 1024 * 1024 });

const tri = (file) => {
  // gltf-transform inspect 출력에서 삼각형 합계만 뽑는다
  const r = gltf('inspect', rel(file));
  const txt = (r.stdout || '').replace(/\u001b\[[0-9;]*m/g, '');
  let sum = 0;
  for (const m of txt.matchAll(/TRIANGLES\s*│\s*\d+\s*│\s*([\d,]+)/g)) {
    sum += parseInt(m[1].replace(/,/g, ''), 10) || 0;
  }
  return sum;
};

const rows = [];
let failed = 0;

for (const p of people) {
  const t0 = Date.now();
  const raw = path.join(RAW, p.id + '.glb');
  const out = path.join(OUT, p.id + '.glb');
  process.stdout.write(`${p.id.padEnd(8)} ${String(p.name).padEnd(9)} ${p.age}세 ${p.sex} … `);

  const r = spawnSync(BLENDER, [
    '--background', '--online-mode', '--python', path.join(here, 'mpfb_make_human.py'), '--',
    '--out', raw,
    '--age', String(p.age),
    '--sex', p.sex,
    '--height-m', String((p.height_cm / 100).toFixed(3)),
    '--weight', String(p.weight),
    '--muscle', String(p.muscle),
    '--skin', p.skin,
    '--hair', p.hair,
    '--hairstyle', p.hair_style || 'short',
    '--garment', p.garment,
  ], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

  const log = (r.stdout || '') + (r.stderr || '');
  if (!fs.existsSync(raw)) {
    console.log('실패');
    const err = log.split('\n').filter((l) => /Error|Traceback|Exception/i.test(l)).slice(0, 4);
    err.forEach((l) => console.log('         ' + l.trim()));
    failed++;
    continue;
  }

  fs.rmSync(out, { force: true });
  const s = gltf('simplify', rel(raw), rel(out), '--ratio', String(RATIO), '--error', '0.01');
  if (!fs.existsSync(out)) {
    console.log('감축 실패 — 원본을 그대로 씁니다');
    const why = ((s.stdout || '') + (s.stderr || '')).replace(/\[[0-9;]*m/g, '')
      .split('\n').filter((l) => /error|Error/.test(l)).slice(0, 2);
    why.forEach((l) => console.log('         ' + l.trim()));
    fs.copyFileSync(raw, out);
  }

  const kb = Math.round(fs.statSync(out).size / 1024);
  const t = tri(out);
  const secs = ((Date.now() - t0) / 1000).toFixed(0);
  const height = (log.match(/HEIGHT_FIT [\d.]+ -> ([\d.]+)/) || [])[1] || '?';
  console.log(`${String(t).padStart(6)}삼각형  ${String(kb).padStart(4)}KB  ${height}m  (${secs}초)`);
  rows.push({ id: p.id, name: p.name, age: p.age, sex: p.sex, tris: t, kb, height });

  if (!KEEP) fs.rmSync(raw, { force: true });
}

if (!KEEP) fs.rmSync(RAW, { recursive: true, force: true });

console.log('\n' + '─'.repeat(62));
const totalTris = rows.reduce((a, b) => a + b.tris, 0);
const totalKb = rows.reduce((a, b) => a + b.kb, 0);
console.log(`  만든 사람      ${rows.length}명` + (failed ? `  (실패 ${failed}명)` : ''));
console.log(`  삼각형 합계    ${totalTris.toLocaleString()}`);
console.log(`  용량 합계      ${(totalKb / 1024).toFixed(1)} MB`);
console.log(`  1인 평균       ${Math.round(totalTris / (rows.length || 1)).toLocaleString()}삼각형 / ${Math.round(totalKb / (rows.length || 1))}KB`);
console.log('─'.repeat(62));
console.log('  참고: 지금 인형은 1인당 8,736삼각형 / 메시 33개(=드로우콜 33)');
console.log('  결과물:', path.relative(root, OUT));

if (failed) process.exitCode = 1;
