// 2막 엔딩: 틈을 꿰맨다(설계: docs/superpowers/specs/2026-11-26-act2-rift-design.md 6절, 시안 https://claude.ai/artifact/9bi1Z6fXG7jtxA4uMFPYvZ). three.js·Math.random 금지.
// 파수꾼이 쓰러지면 결전장 가운데 틈이 벌어져 점점 커지고, 주인공은 늘 틈 쪽으로 끌린다(바람).
// 땀 자리 넷(6시 → 3시 → 9시 → 6시 — 12시는 틈에 가려 쓰지 않는다)을 차례로 한붓 수놓기:
//   구멍에서 구멍으로 걸으면 그 줄을 그은 것. 그은 지 STITCH.echo초(= 메아리가 같은 줄을 지난 때)가 지나야 실이 굳는다.
//   이미 그은 줄을 다시 지나거나 한쪽 통행 줄을 거꾸로 그으면 실이 끊어져 그 무늬만 처음부터. 두 번 끊어지면 시작할 구멍이 반짝인다(hint).
//   광산 무늬: 틈 쪽 구멍 둘이 STITCH.crumble초 뒤 빨려 든다 — 그때까지 그 구멍의 줄이 다 굳지 않았으면 처음부터.
//   틈 가장자리에 닿으면 빨려 들었다가 바깥 테두리로 내던져지고, 굳지 않은 줄은 풀린다. 실패는 없다.
//   무늬 하나를 다 꿰매면 틈이 줄어든다. 넷을 다 꿰매면 메아리가 틈으로 걸어 들어가 닫힌다(closing → closed).
import { walkable } from './path';
import { DT, WARP, type World } from './rules';
import { hourDir } from './warpmap';

export const STITCH = { center: 32, at: 12, r0: 3, grow: 0.09, rMax: 7.2, shrink: 1.6, near: 0.65, echo: WARP.delay, pull: 0.5, pullNear: 1.2, throwTo: 18, crumble: 25, margin: 2, pullHurt: 0.25 }; // pullHurt = 빨려 들면 잃는 체력(최대 체력 비율). 다하면 지워졌다 돌아와 첫 무늬부터 // close = 닫히는 연출 전체(초): 메아리가 walkIn초 걸어 들어간 뒤 틈이 오므라든다
// 닫히는 연출(설계서 6절 맨 위 다시 짠 것 + 2026-11-26 연출 보강): 초
export const CLOSE = { still: 1.2, fly: 0.7, walk: 2, look: 1, enter: 0.6, zip: 0.8, scar: 3.5, tick: 2 };
// 박자마다 끝나는 시각
export function closeMarks() {
  const still = CLOSE.still;
  const fly = still + CLOSE.fly * 4;
  const walk = fly + CLOSE.walk;
  const look = walk + CLOSE.look;
  const enter = look + CLOSE.enter;
  const sealed = enter + CLOSE.zip * 4;
  const scar = sealed + CLOSE.scar;
  return { still, fly, walk, look, enter, sealed, scar, end: scar + CLOSE.tick };
}
export type Pattern = { demo?: number[]; name: string; hour: number; holes: [number, number][]; edges: [number, number][]; oneway: number[]; crumble?: boolean };
// 무늬(화면 기준: x 오른쪽, y 위, 칸). 한붓 길이 있는지는 stitch.test.ts가 확인한다
const ring = (n: number, r: number, off: number): [number, number][] => Array.from({ length: n }, (_, i) => [Math.sin((i * 2 * Math.PI) / n + off) * r, Math.cos((i * 2 * Math.PI) / n + off) * r]);
export const PATTERNS: Pattern[] = [
  { name: '나루 사다리', hour: 6, demo: [1, 0, 3, 4, 5, 2, 1, 4], holes: [[-3, 1.5], [0, 1.5], [3, 1.5], [-3, -1.5], [0, -1.5], [3, -1.5]], edges: [[0, 1], [1, 2], [3, 4], [4, 5], [0, 3], [1, 4], [2, 5]], oneway: [] },
  { name: '방책', hour: 3, holes: [[-4.5, 2], [-1.5, 2], [1.5, 2], [4.5, 2], [-4.5, -2], [-1.5, -2], [1.5, -2], [4.5, -2]], edges: [[0, 1], [1, 2], [2, 3], [4, 5], [5, 6], [6, 7], [0, 4], [1, 5], [2, 6], [3, 7], [0, 5], [1, 6]], oneway: [] },
  { name: '결정', hour: 9, holes: [[0, 3.5], [3.5, 0], [0, -3.5], [-3.5, 0], [0, 0], [-1.75, 1.75], [1.75, 1.75], [-1.75, -1.75], [1.75, -1.75], [0, 5.5]], edges: [[0, 6], [6, 1], [1, 8], [8, 2], [2, 7], [7, 3], [3, 5], [5, 0], [4, 5], [4, 6], [4, 7], [4, 8], [5, 6], [7, 8], [0, 9], [9, 6]], oneway: [], crumble: true },
  // 해: 별 테두리 지그재그(바깥 ↔ 안쪽) + 바깥 육각 고리, 줄끼리 가로지르지 않는다. 화살표 줄 셋(0→6, 2→1, 5→4)이 고리를 거꾸로 돌게 만든다.
  // 6시(카메라 쪽) — 12시에 두면 세로로 솟은 틈에 가려진다
  { name: '해', hour: 6, holes: [...ring(6, 5, 0), ...ring(6, 2.6, Math.PI / 6)], edges: [...Array.from({ length: 6 }, (_, i) => [[i, 6 + i], [6 + i, (i + 1) % 6]] as [number, number][]).flat(), ...Array.from({ length: 6 }, (_, i) => (i === 1 || i === 4 ? [(i + 1) % 6, i] : [i, (i + 1) % 6]) as [number, number])], oneway: [0, 13, 16] },
];
export const degrees = (p: Pattern) => p.holes.map((_, i) => p.edges.filter((e) => e.includes(i)).length);

export type StitchEvent = 'tock' | 'thread' | 'look' | 'enter' | 'zip' | 'sealed' | 'flow' | 'start' | 'erased' | 'nopotion' | 'drawn' | 'snap' | 'hint' | 'done' | 'pulled' | 'crumble' | 'closed';
export type StitchState = {
  t: number; r: number; k: number; // 경과(초), 틈 반지름(칸), 지금 무늬 번호(4 = 다 꿰맴)
  holes: [number, number][]; // 지금 무늬 구멍의 월드 자리
  // drawn = 그은 줄(그은 시각), cur = 마지막으로 닿은 구멍, skip = 처음부터가 된 순간 발밑에 있던 구멍(벗어날 때까지 시작점으로 잡지 않는다), snaps = 끊어진 수, lost = 빨려 든 구멍
  drawn: { e: number; at: number }[]; start: number; cur: number; skip: number; snaps: number; crumbleT: number; lost: number[];
  phase: 'sew' | 'closing' | 'closed'; closeT: number; echoFrom: [number, number] | null; echoLook: boolean; zipFrom: number | null; events: StitchEvent[]; ver: number;
};
const state = new WeakMap<World, StitchState>();
export const stitchState = (w: World) => state.get(w) ?? null;

// 무늬 k의 구멍 월드 자리: 결전장 가운데에서 그 시각 쪽으로 STITCH.at칸, 화면 오른쪽·위로 펼친다
export function holesOf(k: number): [number, number][] {
  const p = PATTERNS[k];
  const [ox, oz] = hourDir(p.hour);
  const [rx, rz] = hourDir(3);
  const [ux, uz] = hourDir(0);
  const c = STITCH.center;
  return p.holes.map(([lx, ly]) => [c + ox * STITCH.at + rx * lx + ux * ly, c + oz * STITCH.at + rz * lx + uz * ly]);
}

export function startStitch(w: World): StitchState {
  const s: StitchState = { t: 0, r: STITCH.r0, k: 0, holes: holesOf(0), drawn: [], start: -1, cur: -1, skip: -1, snaps: 0, crumbleT: 0, lost: [], phase: 'sew', closeT: 0, echoFrom: null, echoLook: false, zipFrom: null, events: ['start'], ver: 0 };
  state.set(w, s);
  return s;
}

const sewn = (s: StitchState) => s.drawn.filter((d) => s.t - d.at >= STITCH.echo).length;
function reset(s: StitchState, ev: StitchEvent, under = -1) {
  s.drawn = [];
  s.cur = s.start = -1;
  s.skip = under;
  s.crumbleT = 0;
  s.lost = [];
  s.events.push(ev);
  s.ver++;
}
// 틈이 자랄 수 있는 끝: 구멍들 중 가운데에 가장 가까운 것에서 STITCH.margin칸 앞(rMax를 넘지 않는다)
export const riftLimit = (holes: [number, number][]) => Math.min(STITCH.rMax, Math.min(...holes.map((h) => Math.hypot(h[0] - STITCH.center, h[1] - STITCH.center))) - STITCH.margin);
// 꿰매는 동안(닫힐 때까지)은 물약을 못 마신다(world.ts drink가 묻는다) — 막혔으면 알린다
export function stitchBlocksPotion(w: World): boolean {
  const s = state.get(w);
  if (!s || s.phase === 'closed') return false;
  s.events.push('nopotion');
  return true;
}
// 광산 무늬: 틈(가운데)에 가장 가까운 구멍 둘
export const crumbleHoles = (holes: [number, number][]) => holes.map((h, i) => [Math.hypot(h[0] - STITCH.center, h[1] - STITCH.center), i]).sort((a, b) => a[0] - b[0]).slice(0, 2).map((x) => x[1]);

export function tickStitch(w: World) {
  const s = state.get(w);
  if (!s || s.phase === 'closed') return;
  s.t += DT;
  const hero = w.entities[0];
  const c = STITCH.center;
  if (s.phase === 'closing') {
    const was = s.closeT;
    s.closeT += DT;
    const T = s.closeT;
    const at = (m: number) => was < m && T >= m; // 이번 틱에 m초를 지났다
    const M = closeMarks();
    // 박자: ② 실이 하나씩 틈에 꽂힌다 → ③ 메아리가 틈 앞에서 돌아본다 → 스며든다 → ④ 땀이 아래부터 하나씩 조인다 → 닫힘 → ⑤ 흉터가 흘러간다 → ⑥ 시곗바늘이 다시 돈다
    for (let i = 0; i < 4; i++) if (at(M.still + CLOSE.fly * (i + 1))) s.events.push('thread');
    if (at(M.look)) s.events.push('look');
    if (at(M.enter)) s.events.push('enter');
    for (let i = 0; i < 4; i++) if (at(M.enter + CLOSE.zip * (i + 1))) s.events.push(i < 3 ? 'zip' : 'sealed');
    if (at(M.scar)) s.events.push('flow');
    for (let i = 0; i < 4; i++) if (at(M.scar + 0.5 * i)) s.events.push('tock'); // ⑥ 시곗바늘이 다시 째깍
    // 메아리: 제자리(정적·실) → 틈 앞까지 걷기 → 멈춰 돌아보기 → 한가운데로 들어가 스며든다(warp.ts가 이번 틱에 정한 자리를 덮어쓴다)
    const wp = w.warp;
    if (wp) {
      s.echoFrom ??= wp.echo ?? [hero.x, hero.z];
      const [fx, fz] = s.echoFrom;
      const d = Math.hypot(fx - c, fz - c) || 1;
      const edge: [number, number] = [c + ((fx - c) / d) * (s.r + 0.8), c + ((fz - c) / d) * (s.r + 0.8)];
      const ease = (k: number) => 1 - (1 - Math.min(1, Math.max(0, k))) ** 2;
      const lerp2 = (a: [number, number], b: [number, number], k: number): [number, number] => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
      s.echoLook = T >= M.walk && T < M.look;
      wp.echo = T < M.fly ? [fx, fz] : T < M.walk ? lerp2(s.echoFrom, edge, ease((T - M.fly) / CLOSE.walk)) : T < M.look ? edge : T < M.enter ? lerp2(edge, [c, c], (T - M.look) / CLOSE.enter) : null;
    }
    // 틈: 땀이 하나씩 조일 때마다 한 칸씩 오므라든다
    if (T >= M.enter) {
      if (s.zipFrom === null) s.zipFrom = s.r;
      const k = Math.min(1, (T - M.enter) / (CLOSE.zip * 4));
      const step = Math.floor(k * 4) + Math.min(1, ((k * 4) % 1) * 4); // 조일 때 툭 줄고 멈춘다
      s.r = Math.max(0, s.zipFrom * (1 - Math.min(4, step) / 4));
    }
    if (T >= M.end) (s.phase = 'closed'), s.events.push('closed'), s.ver++;
    return;
  }
  const calm = s.k === 0; // 첫 무늬(연습)는 숨 고르기: 틈이 커지지 않고 바람도 없다
  if (!calm) s.r = Math.min(riftLimit(s.holes), s.r + STITCH.grow * DT); // 지금 무늬의 가장 안쪽 구멍 앞까지만(무늬를 먹으면 못 푼다)
  if (hero.state === 'dead') return;
  // 바람: 틈 쪽으로 끌린다(가까울수록 세다)
  const [dx, dz] = [c - hero.x, c - hero.z];
  const d = Math.hypot(dx, dz) || 1;
  const pull = calm ? 0 : (STITCH.pull + STITCH.pullNear * Math.max(0, 1 - d / 20)) * DT;
  const [nx, nz] = [hero.x + (dx / d) * pull, hero.z + (dz / d) * pull];
  if (walkable(w.grid, Math.floor(nx), Math.floor(nz))) [hero.x, hero.z] = [nx, nz];
  // 빨려 들었다: 바깥 테두리로 내던지고, 굳지 않은 줄을 푼다
  if (d <= s.r + 0.3) {
    Object.assign(hero, { x: c - (dx / d) * STITCH.throwTo, z: c - (dz / d) * STITCH.throwTo, path: [], phase: 'none' });
    hero.hp -= Math.round(hero.maxHp * STITCH.pullHurt); // 체력 1/4을 잃는다(물약도 못 마신다)
    if (hero.hp <= 0) {
      // 존재가 지워졌다: 죽지 않고 6시 가장자리로 돌아와 체력이 다 차고, 틈은 처음 크기로, 첫 무늬부터
      const [ox, oz] = hourDir(6);
      Object.assign(hero, { x: c + ox * (STITCH.throwTo - 1), z: c + oz * (STITCH.throwTo - 1), hp: hero.maxHp });
      Object.assign(s, { k: 0, r: STITCH.r0, holes: holesOf(0), drawn: [], start: -1, cur: -1, skip: -1, snaps: 0, crumbleT: 0, lost: [] });
      s.events.push('erased');
      s.ver++;
      return;
    }
    const keep = sewn(s);
    s.drawn = s.drawn.slice(0, keep);
    s.cur = s.drawn.length ? walkEnd(s) : (s.start = -1);
    s.events.push('pulled');
    s.ver++;
    return;
  }
  const p = PATTERNS[s.k];
  // 구멍에 닿았다
  const h0 = s.holes.findIndex((q, i) => !s.lost.includes(i) && Math.hypot(q[0] - hero.x, q[1] - hero.z) <= STITCH.near);
  if (s.skip >= 0 && h0 !== s.skip) s.skip = -1; // 끊어진 구멍을 벗어났다
  const h = h0 === s.skip ? -1 : h0;
  if (h >= 0 && h !== s.cur) {
    if (s.cur < 0) {
      s.cur = s.start = h;
      s.ver++;
    } else {
      const e = p.edges.findIndex(([a, b]) => (a === s.cur && b === h) || (a === h && b === s.cur));
      if (e >= 0) {
        const wrong = p.oneway.includes(e) && p.edges[e][0] !== s.cur;
        if (wrong || s.drawn.some((q) => q.e === e)) {
          s.snaps++;
          reset(s, 'snap', h);
          if (s.snaps === 2) s.events.push('hint');
          return;
        }
        s.drawn.push({ e, at: s.t });
        s.cur = h;
        s.ver++;
        if (s.drawn.length === p.edges.length) s.events.push('drawn'); // 다 그었다(굳는 건 메아리가 지난 뒤)
      }
    }
  }
  // 광산: 틈 쪽 구멍이 빨려 든다
  if (p.crumble && s.drawn.length) {
    s.crumbleT += DT;
    if (s.crumbleT >= STITCH.crumble && !s.lost.length) {
      const hs = crumbleHoles(s.holes);
      const done = sewn(s);
      const ok = hs.every((i) => p.edges.every((ed, j) => !ed.includes(i) || s.drawn.slice(0, done).some((q) => q.e === j)));
      if (!ok) return reset(s, 'crumble', h0);
      s.lost = hs; // 다 굳었으면 빨려 들어도 그만
    }
  }
  // 다 그었고 다 굳었다
  if (s.drawn.length === p.edges.length && sewn(s) === p.edges.length) {
    s.k++;
    s.r = Math.max(STITCH.r0 * 0.6, s.r - STITCH.shrink);
    s.events.push('done');
    s.ver++;
    if (s.k >= PATTERNS.length) {
      s.phase = 'closing';
      return;
    }
    Object.assign(s, { holes: holesOf(s.k), drawn: [], start: -1, cur: -1, snaps: 0, crumbleT: 0, lost: [] });
  }
}

// 시작 구멍에서 그은 줄을 따라간 끝 구멍
function walkEnd(s: StitchState): number {
  let at = s.start;
  for (const d of s.drawn) {
    const [a, b] = PATTERNS[s.k].edges[d.e];
    at = a === at ? b : a;
  }
  return at;
}

// 시작할 구멍(홀수 줄 구멍. 없으면 아무 데나) — 힌트·안내
export const startHoles = (k: number) => degrees(PATTERNS[k]).flatMap((d, i) => (d % 2 ? [i] : []));
