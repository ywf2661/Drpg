// 2막 엔딩: 틈을 꿰맨다(설계: docs/superpowers/specs/2026-11-26-act2-rift-design.md 6절, 시안 https://claude.ai/artifact/9bi1Z6fXG7jtxA4uMFPYvZ). three.js·Math.random 금지.
// 파수꾼이 쓰러지면 결전장 가운데 틈이 벌어져 점점 커지고, 주인공은 늘 틈 쪽으로 끌린다(바람).
// 땀 자리 넷(6시 → 3시 → 9시 → 12시 — 주인공이 6시에서 시작하니 가까운 데부터)을 차례로 한붓 수놓기:
//   구멍에서 구멍으로 걸으면 그 줄을 그은 것. 그은 지 STITCH.echo초(= 메아리가 같은 줄을 지난 때)가 지나야 실이 굳는다.
//   이미 그은 줄을 다시 지나거나 한쪽 통행 줄을 거꾸로 그으면 실이 끊어져 그 무늬만 처음부터. 두 번 끊어지면 시작할 구멍이 반짝인다(hint).
//   광산 무늬: 틈 쪽 구멍 둘이 STITCH.crumble초 뒤 빨려 든다 — 그때까지 그 구멍의 줄이 다 굳지 않았으면 처음부터.
//   틈 가장자리에 닿으면 빨려 들었다가 바깥 테두리로 내던져지고, 굳지 않은 줄은 풀린다. 실패는 없다.
//   무늬 하나를 다 꿰매면 틈이 줄어든다. 넷을 다 꿰매면 메아리가 틈으로 걸어 들어가 닫힌다(closing → closed).
import { walkable } from './path';
import { DT, WARP, type World } from './rules';
import { hourDir } from './warpmap';

export const STITCH = { center: 32, at: 12, r0: 3, grow: 0.09, rMax: 7.2, shrink: 1.6, near: 0.65, echo: WARP.delay, pull: 0.5, pullNear: 1.2, throwTo: 18, crumble: 25, close: 3.6, walkIn: 1.8 }; // close = 닫히는 연출 전체(초): 메아리가 walkIn초 걸어 들어간 뒤 틈이 오므라든다
export type Pattern = { demo?: number[]; name: string; hour: number; holes: [number, number][]; edges: [number, number][]; oneway: number[]; crumble?: boolean };
// 무늬(화면 기준: x 오른쪽, y 위, 칸). 한붓 길이 있는지는 stitch.test.ts가 확인한다
const ring = (n: number, r: number, off: number): [number, number][] => Array.from({ length: n }, (_, i) => [Math.sin((i * 2 * Math.PI) / n + off) * r, Math.cos((i * 2 * Math.PI) / n + off) * r]);
export const PATTERNS: Pattern[] = [
  { name: '나루 사다리', hour: 6, demo: [1, 0, 3, 4, 5, 2, 1, 4], holes: [[-3, 1.5], [0, 1.5], [3, 1.5], [-3, -1.5], [0, -1.5], [3, -1.5]], edges: [[0, 1], [1, 2], [3, 4], [4, 5], [0, 3], [1, 4], [2, 5]], oneway: [] },
  { name: '방책', hour: 3, holes: [[-4.5, 2], [-1.5, 2], [1.5, 2], [4.5, 2], [-4.5, -2], [-1.5, -2], [1.5, -2], [4.5, -2]], edges: [[0, 1], [1, 2], [2, 3], [4, 5], [5, 6], [6, 7], [0, 4], [1, 5], [2, 6], [3, 7], [0, 5], [1, 6]], oneway: [] },
  { name: '결정', hour: 9, holes: [[0, 3.5], [3.5, 0], [0, -3.5], [-3.5, 0], [0, 0], [-1.75, 1.75], [1.75, 1.75], [-1.75, -1.75], [1.75, -1.75], [0, 5.5]], edges: [[0, 6], [6, 1], [1, 8], [8, 2], [2, 7], [7, 3], [3, 5], [5, 0], [4, 5], [4, 6], [4, 7], [4, 8], [5, 6], [7, 8], [0, 9], [9, 6]], oneway: [], crumble: true },
  { name: '해', hour: 0, holes: [...ring(6, 5, 0), ...ring(6, 2.6, Math.PI / 6)], edges: [...Array.from({ length: 6 }, (_, i) => [[i, 6 + i], [6 + i, (i + 1) % 6]] as [number, number][]).flat(), ...Array.from({ length: 6 }, (_, i) => [6 + i, 6 + ((i + 1) % 6)] as [number, number]), [0, 2], [2, 4], [4, 0]], oneway: [0, 7, 19] },
];
export const degrees = (p: Pattern) => p.holes.map((_, i) => p.edges.filter((e) => e.includes(i)).length);

export type StitchEvent = 'start' | 'drawn' | 'snap' | 'hint' | 'done' | 'pulled' | 'crumble' | 'closed';
export type StitchState = {
  t: number; r: number; k: number; // 경과(초), 틈 반지름(칸), 지금 무늬 번호(4 = 다 꿰맴)
  holes: [number, number][]; // 지금 무늬 구멍의 월드 자리
  drawn: { e: number; at: number }[]; start: number; cur: number; snaps: number; crumbleT: number; lost: number[]; // 그은 줄(그은 시각), 마지막으로 닿은 구멍, 끊어진 수, 빨려 든 구멍
  phase: 'sew' | 'closing' | 'closed'; closeT: number; echoFrom: [number, number] | null; events: StitchEvent[]; ver: number;
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
  const s: StitchState = { t: 0, r: STITCH.r0, k: 0, holes: holesOf(0), drawn: [], start: -1, cur: -1, snaps: 0, crumbleT: 0, lost: [], phase: 'sew', closeT: 0, echoFrom: null, events: ['start'], ver: 0 };
  state.set(w, s);
  return s;
}

const sewn = (s: StitchState) => s.drawn.filter((d) => s.t - d.at >= STITCH.echo).length;
function reset(s: StitchState, ev: StitchEvent) {
  s.drawn = [];
  s.cur = s.start = -1;
  s.crumbleT = 0;
  s.lost = [];
  s.events.push(ev);
  s.ver++;
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
    s.closeT += DT;
    // 메아리가 틈 한가운데로 걸어 들어가 스며든다(warp.ts가 이번 틱에 정한 메아리 자리를 덮어쓴다), 그다음 틈이 오므라든다
    const wp = w.warp;
    if (wp) {
      s.echoFrom ??= wp.echo ?? [hero.x, hero.z];
      const k = Math.min(1, s.closeT / STITCH.walkIn);
      const e = 1 - (1 - k) ** 2;
      wp.echo = k < 1 ? [s.echoFrom[0] + (c - s.echoFrom[0]) * e, s.echoFrom[1] + (c - s.echoFrom[1]) * e] : null;
    }
    if (s.closeT > STITCH.walkIn) s.r = Math.max(0, s.r - (DT * s.r) / Math.max(DT, STITCH.close - s.closeT + DT));
    if (s.closeT >= STITCH.close) (s.phase = 'closed'), s.events.push('closed'), s.ver++;
    return;
  }
  const calm = s.k === 0; // 첫 무늬(연습)는 숨 고르기: 틈이 커지지 않고 바람도 없다
  if (!calm) s.r = Math.min(STITCH.rMax, s.r + STITCH.grow * DT);
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
    const keep = sewn(s);
    s.drawn = s.drawn.slice(0, keep);
    s.cur = s.drawn.length ? walkEnd(s) : (s.start = -1);
    s.events.push('pulled');
    s.ver++;
    return;
  }
  const p = PATTERNS[s.k];
  // 구멍에 닿았다
  const h = s.holes.findIndex((q, i) => !s.lost.includes(i) && Math.hypot(q[0] - hero.x, q[1] - hero.z) <= STITCH.near);
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
          reset(s, 'snap');
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
      if (!ok) return reset(s, 'crumble');
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
