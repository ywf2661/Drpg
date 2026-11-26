// 2막 엔딩 그림: 틈을 꿰맨다(sim/stitch.ts, 시안 https://claude.ai/artifact/9bi1Z6fXG7jtxA4uMFPYvZ). sim은 읽기만 한다.
//   큰 틈: 명멸의 틈 셰이더(wardenfx)를 틈 반지름만큼 키워 가운데에 세우고, 꿰맨 땀마다 X자 빛 실을 겹친다. 바닥은 틈만큼 검게 뚫린다
//   바람: 먼지 줄기가 소용돌이로 틈에 감겨 든다(가까울수록 빠르다)
//   무늬: 구멍(시작할 금빛 구멍은 첫 무늬와 힌트 때만), 안 그은 줄 = 옅은 점선, 그은 줄 = 금빛, 굳은 실 = 빛나는 하늘빛, 한쪽 통행 줄 = 화살표.
//   광산 무늬의 빨려 들 구멍은 때가 다가오면 붉게 깜빡인다
import * as THREE from 'three';
import { CLOSE, closeMarks, holesOf, PATTERNS, STITCH, crumbleHoles, startHoles, stitchState, type StitchState } from '../sim/stitch';
import type { World } from '../sim/world';
import { tearGeo, tearMat } from './wardenfx';

export const stitchGroup = new THREE.Group();
// 첫 무늬 시범: 띠 속에서 빛나는 바늘이 한붓 길(PATTERNS[0].demo)을 따라 그려 보인다. main이 경과 시간을 넘긴다(null = 끝)
export const STITCH_DEMO = 3.5;
let demo: number | null = null;
export const setStitchDemo = (t: number | null) => (demo = t);
const C = STITCH.center;
const MOTES = 260;
const add = (color: number, opacity = 1) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
const MAT = { next: add(0xbfeaff, 0.95), dash: add(0x9fdcff, 0.35), drawn: add(0xffd36a, 0.9), sewn: add(0xdff1ff, 1), hole: add(0x9fdcff, 0.9), gold: add(0xffcf5a, 1), warn: add(0xff4a3a, 1) };
const STRIP = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
const RING = new THREE.RingGeometry(0.28, 0.4, 20).rotateX(-Math.PI / 2);
const ARROW = new THREE.ShapeGeometry(new THREE.Shape([new THREE.Vector2(0, 0.35), new THREE.Vector2(0.25, -0.2), new THREE.Vector2(-0.25, -0.2)])).rotateX(Math.PI / 2); // +z를 가리키는 세모

type Fx = { flyer: THREE.Mesh; flyLine: THREE.Line; scar: THREE.Mesh; mt: number; absorbed: boolean; needle: THREE.Mesh; trail: THREE.Group; burst: { m: THREE.Mesh; t: number } | null; world: World; tear: THREE.Mesh; u: Record<string, THREE.IUniform>; hole: THREE.Mesh; motes: THREE.Points; seeds: Float32Array; pattern: THREE.Group; ver: number; k: number; holes: THREE.Mesh[]; crosses: THREE.Group };
let fx: Fx | null = null;

// 바닥에 눕힌 띠: a → b, 폭 wd
function strip(a: [number, number], b: [number, number], wd: number, mat: THREE.Material, y = 0.04): THREE.Mesh {
  const m = new THREE.Mesh(STRIP, mat);
  const [dx, dz] = [b[0] - a[0], b[1] - a[1]];
  m.position.set((a[0] + b[0]) / 2, y, (a[1] + b[1]) / 2);
  m.rotation.y = Math.atan2(dx, dz);
  m.scale.set(wd, 1, Math.hypot(dx, dz));
  m.renderOrder = 2;
  return m;
}

function build(world: World): Fx {
  stitchGroup.clear();
  const u = { uOpen: { value: 1 }, uTime: { value: 0 }, uSeed: { value: 3.3 } };
  const tear = new THREE.Mesh(tearGeo, tearMat(u, false));
  tear.add(new THREE.Mesh(tearGeo, tearMat(u, true)));
  (tear.children[0] as THREE.Mesh).renderOrder = 6;
  tear.renderOrder = 5;
  tear.rotation.y = Math.PI / 4;
  tear.position.set(C, 0, C);
  const crosses = new THREE.Group(); // X자 땀(틈 판 위, 아래에서 위로)
  tear.add(crosses);
  const hole = new THREE.Mesh(new THREE.CircleGeometry(1, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x030208, depthWrite: false, toneMapped: false }));
  hole.position.set(C, 0.035, C);
  hole.renderOrder = 1;
  const rim = new THREE.Mesh(new THREE.RingGeometry(1, 1.035, 48).rotateX(-Math.PI / 2), add(0xb45cff, 0.7));
  rim.position.y = 0.002;
  hole.add(rim);
  const seeds = new Float32Array(MOTES * 3);
  for (let i = 0; i < MOTES; i++) seeds.set([((i * 2654435761) % 1000) / 1000 * Math.PI * 2, ((i * 40503) % 997) / 997, ((i * 9301 + 49297) % 233280) / 233280], i * 3);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MOTES * 3), 3));
  const motes = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xc8b8ff, size: 3, sizeAttenuation: false, transparent: true, opacity: 0.7, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending }));
  motes.frustumCulled = false;
  const pattern = new THREE.Group();
  const needle = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 8), add(0xffffff, 1));
  needle.add(new THREE.Mesh(new THREE.SphereGeometry(0.5, 12, 8), add(0xffcf5a, 0.35)));
  needle.renderOrder = 4;
  const trail = new THREE.Group();
  // ② 날아가는 실: 빛 구슬 + 지나온 줄
  const flyer = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 8), add(0xffffff, 1));
  flyer.add(new THREE.Mesh(new THREE.SphereGeometry(0.45, 12, 8), add(0x9fdcff, 0.35)));
  flyer.renderOrder = 8;
  const lg = new THREE.BufferGeometry();
  lg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(2 * 3), 3));
  const flyLine = new THREE.Line(lg, new THREE.LineBasicMaterial({ color: 0xdff1ff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, toneMapped: false }));
  flyLine.frustumCulled = false;
  // ⑤ 닫힌 자리의 흉터: 세로로 남는 빛 꿰맨 자국
  const scar = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 4).translate(0, 2, 0), new THREE.MeshBasicMaterial({ color: 0xeaf6ff, transparent: true, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
  scar.position.set(C, 0, C);
  scar.rotation.y = Math.PI / 4;
  scar.renderOrder = 8;
  stitchGroup.add(flyer, flyLine, scar);
  stitchGroup.add(tear, hole, motes, pattern, needle, trail); // 바닥 구멍: 틈의 경계(빨려 드는 선)가 보이게, 테는 가늘게
  return { flyer, flyLine, scar, mt: 0, absorbed: false, needle, trail, burst: null, world, tear, u, hole, motes, seeds, pattern, ver: -1, k: -1, holes: [], crosses };
}

// 무늬를 다시 깐다(그은 줄·굳은 실이 바뀔 때)
function layPattern(f: Fx, s: StitchState) {
  f.pattern.clear();
  f.holes = [];
  if (s.phase !== 'sew') return;
  const p = PATTERNS[s.k];
  const H = s.holes;
  const sewnN = s.drawn.filter((d) => s.t - d.at >= STITCH.echo).length;
  p.edges.forEach(([a, b], e) => {
    const i = s.drawn.findIndex((d) => d.e === e);
    if (i < 0) {
      // 옅은 점선: 짧은 띠 여러 개(지금 선 구멍에서 이어 갈 수 있는 줄은 굵고 밝게)
      const next = s.cur >= 0 && (a === s.cur || (b === s.cur && !p.oneway.includes(e)));
      const n = Math.max(2, Math.round(Math.hypot(H[b][0] - H[a][0], H[b][1] - H[a][1]) / 0.6));
      for (let k = 0; k < n; k++) if (k % 2 === 0) {
        const t0 = k / n, t1 = (k + 1) / n;
        f.pattern.add(strip([H[a][0] + (H[b][0] - H[a][0]) * t0, H[a][1] + (H[b][1] - H[a][1]) * t0], [H[a][0] + (H[b][0] - H[a][0]) * t1, H[a][1] + (H[b][1] - H[a][1]) * t1], next ? 0.12 : 0.07, next ? MAT.next : MAT.dash));
      }
    } else f.pattern.add(strip(H[a], H[b], i < sewnN ? 0.13 : 0.09, i < sewnN ? MAT.sewn : MAT.drawn, 0.045));
    if (p.oneway.includes(e)) {
      const m = new THREE.Mesh(ARROW, MAT.gold);
      m.position.set((H[a][0] + H[b][0]) / 2, 0.05, (H[a][1] + H[b][1]) / 2);
      m.rotation.y = Math.atan2(H[b][0] - H[a][0], H[b][1] - H[a][1]);
      m.renderOrder = 2;
      f.pattern.add(m);
    }
  });
  const gold = s.k === 0 || s.snaps >= 2 ? startHoles(s.k) : [];
  H.forEach(([x, z], i) => {
    if (s.lost.includes(i)) return;
    const m = new THREE.Mesh(RING, gold.includes(i) ? MAT.gold : MAT.hole.clone());
    m.position.set(x, 0.05, z);
    m.renderOrder = 2;
    if (i === s.cur) m.scale.setScalar(1.35);
    f.pattern.add(m);
    f.holes[i] = m;
  });
}

export function tickStitchFx(time: number, dt: number, world: World) {
  const s = stitchState(world);
  if (!s) {
    if (fx && fx.world !== world) (stitchGroup.clear(), (fx = null));
    return;
  }
  if (!fx || fx.world !== world) fx = build(world);
  const f = fx;
  // 큰 틈: 반지름만큼(닫히면 사라진다)
  const k = s.r / STITCH.r0;
  f.tear.visible = s.r > 0.02;
  f.hole.scale.setScalar(Math.max(0.01, s.r));
  f.hole.visible = s.r > 0.02;
  f.tear.scale.set(1.2 + k * 1.3, 0.9 + k * 0.55, 1);
  f.u.uTime.value = time;
  f.u.uOpen.value = Math.min(1, s.r / 0.8);
  const M = closeMarks();
  const T = s.phase === 'closing' ? s.closeT : s.phase === 'closed' ? M.end : 0;
  // X자 땀: ② 실이 날아와 꽂힐 때마다 하나씩(꿰매는 동안엔 없다)
  const done = s.phase === 'sew' ? 0 : Math.max(0, Math.min(4, Math.floor((T - M.still) / CLOSE.fly)));
  while (f.crosses.children.length < done) {
    const i = f.crosses.children.length;
    const x = new THREE.Group();
    for (const sgn of [1, -1]) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 0.09), add(0xdff1ff, 1));
      m.rotation.z = sgn * 0.5;
      x.add(m);
    }
    x.position.set(0, 0.6 + i * 0.8, 0.02);
    x.renderOrder = 7;
    f.crosses.add(x);
  }
  // ② 날아가는 실: 그 무늬 자리에서 틈의 땀 자리로 호를 그리며
  const fi = Math.floor((T - M.still) / CLOSE.fly);
  const flying = s.phase === 'closing' && T >= M.still && fi < 4;
  f.flyer.visible = f.flyLine.visible = flying;
  if (flying) {
    const H = holesOf(fi);
    const [sx, sz] = [H.reduce((a, q) => a + q[0], 0) / H.length, H.reduce((a, q) => a + q[1], 0) / H.length];
    const p = ((T - M.still) % CLOSE.fly) / CLOSE.fly;
    const e = p * p;
    const ty = (0.6 + fi * 0.8) * (0.9 + k * 0.55); // 틈 판의 그 땀 높이
    f.flyer.position.set(sx + (C - sx) * e, 0.3 + (ty - 0.3) * e + Math.sin(p * Math.PI) * 2.5, sz + (C - sz) * e);
    const lp = f.flyLine.geometry.attributes.position as THREE.BufferAttribute;
    lp.setXYZ(0, sx, 0.05, sz);
    lp.setXYZ(1, f.flyer.position.x, f.flyer.position.y, f.flyer.position.z);
    lp.needsUpdate = true;
    (f.flyLine.material as THREE.LineBasicMaterial).opacity = 0.9 * (1 - p * 0.6);
  }
  // ⑤ 흉터: 닫힌 뒤 남았다가 빛 가루로 흘러간다
  const sk = (T - M.sealed) / CLOSE.scar;
  f.scar.visible = s.phase !== 'sew' && sk >= 0 && sk < 1;
  if (f.scar.visible) {
    f.scar.scale.set(1, 1 - sk * 0.3, 1);
    f.scar.position.y = sk * 0.8;
    (f.scar.material as THREE.MeshBasicMaterial).opacity = (1 - sk) * (0.8 + 0.2 * Math.sin(time * 9));
  }
  // 바람: 소용돌이. ① 정적이면 멈춰 서고, 닫힌 뒤엔 빛 가루가 되어 위로 흘러간다
  const pos = f.motes.geometry.attributes.position as THREE.BufferAttribute;
  if (!(s.phase === 'closing' && T < M.still)) f.mt += dt;
  const rising = s.phase !== 'sew' && T >= M.sealed;
  (f.motes.material as THREE.PointsMaterial).opacity = rising ? 0.8 * Math.max(0, 1 - (T - M.sealed) / (CLOSE.scar + CLOSE.tick)) : 0.7;
  for (let i = 0; i < MOTES; i++) {
    const [a0, h, sp] = [f.seeds[i * 3], f.seeds[i * 3 + 1], f.seeds[i * 3 + 2]];
    if (rising) {
      const u = T - M.sealed;
      const d = 0.3 + h * 3 + u * (0.4 + sp);
      pos.setXYZ(i, C + Math.cos(a0) * d, 0.3 + ((h * 4 + u * (0.6 + sp * 0.8)) % 6), C + Math.sin(a0) * d);
      continue;
    }
    const life = (f.mt * (0.18 + sp * 0.25) + h) % 1;
    const d = s.r + 1 + (1 - life) * 22;
    const a = a0 + life * 3;
    pos.setXYZ(i, C + Math.cos(a) * d, 0.2 + h * 2.2 * (1 - life), C + Math.sin(a) * d);
  }
  pos.needsUpdate = true;
  // 무늬
  // 시범 바늘: 구멍에서 구멍으로 같은 빠르기, 지나온 길은 금빛 줄로 남는다
  const seq = PATTERNS[0].demo!;
  f.needle.visible = demo !== null && s.k === 0;
  f.trail.clear();
  if (demo !== null && s.k === 0) {
    const go = Math.min(1, demo / (STITCH_DEMO - 0.4)) * (seq.length - 1);
    const i = Math.min(seq.length - 2, Math.floor(go));
    const [a, b] = [s.holes[seq[i]], s.holes[seq[i + 1]]];
    const k = go - i;
    f.needle.position.set(a[0] + (b[0] - a[0]) * k, 0.5, a[1] + (b[1] - a[1]) * k);
    for (let j = 0; j < i; j++) f.trail.add(strip(s.holes[seq[j]], s.holes[seq[j + 1]], 0.1, MAT.drawn, 0.05));
    f.trail.add(strip(a, [f.needle.position.x, f.needle.position.z], 0.1, MAT.drawn, 0.05));
  }
  // 메아리가 틈에 스며드는 순간: 가운데에서 큰 빛 고리
  if (s.phase === 'closing' && T >= M.look && !f.absorbed) {
    f.absorbed = true;
    const m = new THREE.Mesh(new THREE.RingGeometry(0.7, 1, 48).rotateX(-Math.PI / 2), add(0xc4a9ff, 1));
    m.position.set(C, 0.08, C);
    m.renderOrder = 3;
    stitchGroup.add(m);
    if (f.burst) f.burst.m.removeFromParent();
    f.burst = { m, t: 0 };
    f.u.uOpen.value = 1.6;
  }
  if (s.phase === 'closing' && T >= M.look && T < M.enter + 0.4) f.u.uOpen.value = 1 + 0.8 * Math.sin(Math.min(1, (T - M.look) / (CLOSE.enter + 0.4)) * Math.PI); // 스며들 때 틈 안이 하얗게 차오른다
  // 땀 하나 완성: 그 무늬 자리에서 빛 고리가 퍼진다
  if (f.k >= 0 && s.k > f.k) {
    const H = f.holes.filter(Boolean).map((m) => m.position);
    const m = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 48).rotateX(-Math.PI / 2), add(0xdff1ff, 1));
    m.position.set(H.reduce((a, p) => a + p.x, 0) / H.length, 0.06, H.reduce((a, p) => a + p.z, 0) / H.length);
    m.renderOrder = 3;
    stitchGroup.add(m);
    f.burst = { m, t: 0 };
  }
  if (f.burst) {
    f.burst.t += dt;
    f.burst.m.scale.setScalar(1 + f.burst.t * 9);
    (f.burst.m.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 1 - f.burst.t / 1.2);
    if (f.burst.t > 1.2) (f.burst.m.removeFromParent(), (f.burst = null));
  }
  const p0 = PATTERNS[s.k];
  MAT.drawn.opacity = p0 && s.drawn.length === p0.edges.length ? 0.6 + 0.4 * Math.sin(time * 10) : 0.9; // 다 그었다: 메아리를 기다리며 맥동
  if (s.ver !== f.ver || s.k !== f.k || Math.floor(s.t * 4) !== Math.floor((s.t - dt) * 4)) {
    [f.ver, f.k] = [s.ver, s.k];
    layPattern(f, s);
  }
  // 광산: 빨려 들 구멍이 깜빡인다(마지막 8초)
  if (PATTERNS[s.k]?.crumble && s.drawn.length && !s.lost.length) {
    const left = STITCH.crumble - s.crumbleT;
    for (const i of crumbleHoles(s.holes)) {
      const m = f.holes[i];
      if (m && left < 8) m.material = Math.sin(time * (14 - left)) > 0 ? MAT.warn : MAT.hole;
    }
  }
}
