// 2막 엔딩 그림: 틈을 꿰맨다(sim/stitch.ts, 시안 https://claude.ai/artifact/9bi1Z6fXG7jtxA4uMFPYvZ). sim은 읽기만 한다.
//   큰 틈: 명멸의 틈 셰이더(wardenfx)를 틈 반지름만큼 키워 가운데에 세우고, 꿰맨 땀마다 X자 빛 실을 겹친다. 바닥은 틈만큼 검게 뚫린다
//   바람: 먼지 줄기가 소용돌이로 틈에 감겨 든다(가까울수록 빠르다)
//   무늬: 구멍(시작할 금빛 구멍은 첫 무늬와 힌트 때만), 안 그은 줄 = 옅은 점선, 그은 줄 = 금빛, 굳은 실 = 빛나는 하늘빛, 한쪽 통행 줄 = 화살표.
//   광산 무늬의 빨려 들 구멍은 때가 다가오면 붉게 깜빡인다
import * as THREE from 'three';
import { PATTERNS, STITCH, crumbleHoles, startHoles, stitchState, type StitchState } from '../sim/stitch';
import type { World } from '../sim/world';
import { tearGeo, tearMat } from './wardenfx';

export const stitchGroup = new THREE.Group();
const C = STITCH.center;
const MOTES = 260;
const add = (color: number, opacity = 1) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
const MAT = { next: add(0xbfeaff, 0.95), dash: add(0x9fdcff, 0.35), drawn: add(0xffd36a, 0.9), sewn: add(0xdff1ff, 1), hole: add(0x9fdcff, 0.9), gold: add(0xffcf5a, 1), warn: add(0xff4a3a, 1) };
const STRIP = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
const RING = new THREE.RingGeometry(0.28, 0.4, 20).rotateX(-Math.PI / 2);
const ARROW = new THREE.ShapeGeometry(new THREE.Shape([new THREE.Vector2(0, 0.35), new THREE.Vector2(0.25, -0.2), new THREE.Vector2(-0.25, -0.2)])).rotateX(Math.PI / 2); // +z를 가리키는 세모

type Fx = { burst: { m: THREE.Mesh; t: number } | null; world: World; tear: THREE.Mesh; u: Record<string, THREE.IUniform>; hole: THREE.Mesh; motes: THREE.Points; seeds: Float32Array; pattern: THREE.Group; ver: number; k: number; holes: THREE.Mesh[]; crosses: THREE.Group };
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
  const rim = new THREE.Mesh(new THREE.RingGeometry(1, 1.12, 40).rotateX(-Math.PI / 2), add(0xb45cff, 0.7));
  rim.position.y = 0.002;
  hole.add(rim);
  const seeds = new Float32Array(MOTES * 3);
  for (let i = 0; i < MOTES; i++) seeds.set([((i * 2654435761) % 1000) / 1000 * Math.PI * 2, ((i * 40503) % 997) / 997, ((i * 9301 + 49297) % 233280) / 233280], i * 3);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MOTES * 3), 3));
  const motes = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xc8b8ff, size: 3, sizeAttenuation: false, transparent: true, opacity: 0.7, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending }));
  motes.frustumCulled = false;
  const pattern = new THREE.Group();
  stitchGroup.add(tear, motes, pattern); // 바닥 구멍(보라 테 원)은 그리지 않는다(사용자)
  return { burst: null, world, tear, u, hole, motes, seeds, pattern, ver: -1, k: -1, holes: [], crosses };
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
  f.tear.scale.set(1.2 + k * 1.3, 0.9 + k * 0.55, 1);
  f.u.uTime.value = time;
  f.u.uOpen.value = Math.min(1, s.r / 0.8);
  // X자 땀
  const done = Math.min(4, s.k);
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
  // 바람: 소용돌이
  const pos = f.motes.geometry.attributes.position as THREE.BufferAttribute;
  const wind = s.phase === 'closed' ? 0 : 1;
  (f.motes.material as THREE.PointsMaterial).opacity = 0.7 * wind;
  for (let i = 0; i < MOTES; i++) {
    const [a0, h, sp] = [f.seeds[i * 3], f.seeds[i * 3 + 1], f.seeds[i * 3 + 2]];
    const life = (time * (0.18 + sp * 0.25) + h) % 1;
    const d = s.r + 1 + (1 - life) * 22;
    const a = a0 + life * 3;
    pos.setXYZ(i, C + Math.cos(a) * d, 0.2 + h * 2.2 * (1 - life), C + Math.sin(a) * d);
  }
  pos.needsUpdate = true;
  // 무늬
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
