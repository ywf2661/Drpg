// 역병 걸린 뱃사공(호숫가 결전, 설계: docs/superpowers/specs/2026-11-26-ferryman-rework-design.md). three.js·Math.random 금지.
// 뱃사공은 호수 가운데 배 위에 떠서 오염된 운석을 주인공에게 떨어뜨린다. 나루마다 바퀴가 있고, 돌리면:
//   drain: 물이 배 한 칸만큼 남을 때까지 빠지고(마른 바닥에서 마을 사람이 기어 나온다), 돌린 바퀴는 부서진다
//   dry: 배가 바닥에 걸린다 — 딜 타이밍. 뱃사공은 배 둘레에 삿대(휘두르기·찌르기 예고)
//   fill: 물이 가운데부터 차오른다. 물 안의 주인공·소환수는 밀려나고(피해 없음), 몬스터는 빠져 죽는다
//   full: 물이 다 찼다. 바퀴가 다 부서졌으면 가장 오래된 것이 고쳐진다(돌고 돈다)
// 물은 반지름 하나(r)로: 결전장 호수 칸 중 가운데에서 r 안의 칸만 물(막힘 2), 나머지는 마른 바닥. 나루 판자는 늘 걷는다
// 체력 절반 아래: 운석 둘(하나는 둘레), 기어 나오는 마을 사람이 는다
import { face, friends, hitOf, hurt, rand } from './core';
import { spawnNear } from './gimmicks';
import { DT, HIT, type Chest, type Entity, type World } from './rules';

export const FERRYMAN = {
  center: 24, full: 12, low: 0.75, // 호수 가운데(m), 물이 찼을 때·빠졌을 때 반지름(m) — low: 배 자리 네 칸만 남고 바로 곁에서 근접이 닿는다
  drain: 3, dry: 8, fill: 8, // 물이 빠지는·바닥에 걸린·다시 차는 시간(초)
  comet: 3, cometHalf: 2.4, cometDelay: 1.3, cometR: 1.8, cometMult: 1.3, // 오염된 운석: 간격(절반 아래), 예고, 반지름, 피해 배율
  crawl: 3, crawlHalf: 5, // 물이 빠질 때 기어 나오는 마을 사람
  swingEvery: 2.6, windup: 0.75, sweepMult: 1.3, thrustMult: 1.5, // 딜 타이밍의 삿대 기술
  wheelOut: 14, wheelSide: 2, // 바퀴 자리: 나루 축을 따라 가운데에서(칸), 나루 옆으로(칸)
  hp: 0.6, // 체력 배율: 딜 타이밍 5~6번에 쓰러지게(봇 probe — 기사·레벨 50·4단계 옵션 없음)
};
// wheels: 바퀴(상자 id 차례)마다 0 = 멀쩡, n = n번째로 부서짐. broke = 지금까지 부순 수
export type FerrymanState = { phase: 'full' | 'drain' | 'dry' | 'fill'; t: number; r: number; comet: number; swing: number; move: 0 | 1; wheels: number[]; ids: number[]; broke: number; lake: number[]; crawl: number };
const DOCKS: [number, number][] = [[0, -1], [1, 0], [0, 1], [-1, 0]]; // 북·동·남·서
const half = (e: Entity) => e.hp <= e.maxHp / 2;
const C = FERRYMAN.center;
const fromC = (x: number, z: number) => Math.hypot(x - C, z - C);

// 결전 준비(처음 움직일 때 한 번): 호수 칸 목록, 나루마다 바퀴 상자
function setup(w: World): FerrymanState {
  const g = w.grid;
  const lake: number[] = [];
  for (let i = 0; i < g.w * g.h; i++) if (g.blocked[i] === 2) lake.push(i);
  const ids: number[] = [];
  for (const [dx, dz] of DOCKS) {
    const [x, z] = [Math.floor(C + dx * FERRYMAN.wheelOut - dz * FERRYMAN.wheelSide), Math.floor(C + dz * FERRYMAN.wheelOut + dx * FERRYMAN.wheelSide)];
    const ch: Chest = { id: w.chests.length, x, z, open: false, kind: 'wheel' };
    w.chests.push(ch);
    g.blocked[z * g.w + x] = 1;
    ids.push(ch.id);
  }
  return { phase: 'full', t: 0, r: FERRYMAN.full, comet: FERRYMAN.comet, swing: FERRYMAN.swingEvery * 0.6, move: 0, wheels: [0, 0, 0, 0], ids, broke: 0, lake, crawl: 0 };
}

// 물 반지름을 칸에 적는다. 딜 타이밍엔 배 둘레 물웅덩이까지 걷는다(배가 바닥에 얹혔다 — 남은 물은 그림으로만)
function flood(w: World, fm: FerrymanState) {
  const g = w.grid;
  for (const i of fm.lake) g.blocked[i] = fm.phase !== 'dry' && fromC((i % g.w) + 0.5, Math.floor(i / g.w) + 0.5) < fm.r ? 2 : 0;
}

// 바퀴를 눌렀다(touchChest): 물이 다 찼고 멀쩡한 바퀴면 물을 뺀다
export function turnLakeWheel(w: World, ch: Chest) {
  const fm = w.fm;
  const k = fm ? fm.ids.indexOf(ch.id) : -1;
  if (!fm || k < 0 || fm.phase !== 'full' || fm.wheels[k]) return;
  fm.wheels[k] = ++fm.broke;
  const b = w.entities.find((e) => e.skin === 'plague_ferryman');
  Object.assign(fm, { phase: 'drain', t: FERRYMAN.drain, crawl: b && half(b) ? FERRYMAN.crawlHalf : FERRYMAN.crawl });
}

export function ferryman(w: World, e: Entity, t: Entity | null): boolean {
  if (!w.fm) e.hp = e.maxHp = Math.round(e.maxHp * FERRYMAN.hp);
  const fm = (w.fm ??= setup(w));
  const hero = w.entities[0];
  if (e.state === 'dead') return true;
  [e.x, e.z] = [C, C]; // 배 위에서 움직이지 않는다
  Object.assign(e, { path: [], state: 'idle', attackT: 0 });
  if (!t && hero.state !== 'dead') [e.target, t] = [0, hero]; // 결전장 어디서든 주인공을 노린다
  tide(w, fm);
  if (!t) return true;
  if (fm.phase === 'dry') {
    if (e.phase === 'windup') {
      if ((e.phaseT -= DT) <= 0) strike(w, e, fm.move);
    } else if ((fm.swing -= DT) <= 0 && Math.hypot(t.x - e.x, t.z - e.z) <= 5) {
      fm.swing = FERRYMAN.swingEvery;
      fm.move = fm.move ? 0 : 1;
      skill(w, e, t, fm.move);
    }
    return true;
  }
  e.phase = 'none';
  if ((fm.comet -= DT) <= 0) {
    fm.comet = half(e) ? FERRYMAN.cometHalf : FERRYMAN.comet;
    const spots: [number, number][] = [[t.x, t.z]];
    if (half(e)) spots.push([t.x + (rand(w) - 0.5) * 6, t.z + (rand(w) - 0.5) * 6]);
    for (const [x, z] of spots) w.zones.push({ id: w.nextItem++, x, z, r: FERRYMAN.cometR, t: FERRYMAN.cometDelay, total: FERRYMAN.cometDelay, dmg: hitOf(w, e, FERRYMAN.cometMult, HIT.tell), owner: -1, kind: 'plague' });
  }
  return true;
}

// 물: 단계마다 반지름을 옮기고 칸에 적는다. 빠지는 동안 마을 사람이 기어 나오고, 차오르는 동안 밀어내고 빠뜨린다
function tide(w: World, fm: FerrymanState) {
  if (fm.phase === 'full') return;
  fm.t -= DT;
  const { full, low } = FERRYMAN;
  if (fm.phase === 'drain') {
    fm.r = low + (full - low) * Math.max(0, fm.t / FERRYMAN.drain);
    if (fm.crawl > 0 && fm.t <= (FERRYMAN.drain * (fm.crawl - 1)) / (fm.crawl + 1)) {
      fm.crawl--; // 빠지는 동안 고르게 하나씩
      spawnNear(w, 'minion', C, C, fm.r + 0.8 + rand(w) * (full - 1.5 - fm.r));
    }
  } else if (fm.phase === 'fill') fm.r = low + (full - low) * Math.min(1, 1 - fm.t / FERRYMAN.fill);
  flood(w, fm);
  if (fm.phase === 'fill') {
    const g = w.grid;
    const onBed = (x: number, z: number) => fm.lake.includes(Math.floor(z) * g.w + Math.floor(x));
    for (const f of friends(w)) {
      const d = fromC(f.x, f.z);
      if (d >= fm.r + 0.35 || !onBed(f.x, f.z)) continue;
      const k = (fm.r + 0.4) / Math.max(0.01, d);
      [f.x, f.z] = [C + (f.x - C) * k, C + (f.z - C) * k];
      f.path = [];
    }
    for (const m of w.entities) if (m.kind !== 'hero' && m.kind !== 'boss' && m.id >= 0 && m.state !== 'dead' && onBed(m.x, m.z) && fromC(m.x, m.z) < fm.r) Object.assign(m, { hp: 0, state: 'dead', path: [], target: null, pooled: true }); // 빠져 죽는다(경험치·드롭 없음)
  }
  if (fm.t > 0) return;
  if (fm.phase === 'drain') Object.assign(fm, { phase: 'dry', t: FERRYMAN.dry, r: low, swing: FERRYMAN.swingEvery * 0.5 });
  else if (fm.phase === 'dry') Object.assign(fm, { phase: 'fill', t: FERRYMAN.fill });
  else {
    Object.assign(fm, { phase: 'full', r: full, comet: FERRYMAN.comet * 0.5 });
    if (fm.wheels.every((k) => k > 0)) {
      const oldest = fm.wheels.indexOf(Math.min(...fm.wheels));
      fm.wheels[oldest] = 0; // 넷 다 부서졌으면 가장 오래된 것을 고친다
    }
  }
  flood(w, fm);
}

// 삿대 기술 예고(바닥에 'warn' 구역만 — 피해는 strike): 0 = 휘두르기(앞쪽 부채꼴), 1 = 찌르기(앞으로 긴 줄)
function skill(w: World, e: Entity, t: Entity, kind: 0 | 1) {
  face(e, t);
  const [ux, uz] = [Math.sin(e.facing), Math.cos(e.facing)];
  Object.assign(e, { phase: 'windup', phaseT: FERRYMAN.windup, state: 'idle', attackT: 0, path: [] });
  const warn = (x: number, z: number, r: number) => w.zones.push({ id: w.nextItem++, x, z, r, t: FERRYMAN.windup, total: FERRYMAN.windup, dmg: 0, owner: -1, kind: 'warn' });
  if (kind === 0) for (const a of [-0.9, 0, 0.9]) warn(e.x + Math.sin(e.facing + a) * 1.9, e.z + Math.cos(e.facing + a) * 1.9, 1.1);
  else for (const d of [1.4, 2.6, 3.8]) warn(e.x + ux * d, e.z + uz * d, 0.6);
}

function strike(w: World, e: Entity, kind: 0 | 1) {
  e.phase = 'none';
  const [ux, uz] = [Math.sin(e.facing), Math.cos(e.facing)];
  w.blasts.push({ id: w.nextItem++, x: e.x + ux * 1.5, z: e.z + uz * 1.5, age: 0, kind: 'slash' });
  for (const f of friends(w)) {
    const [dx, dz] = [f.x - e.x, f.z - e.z];
    const along = dx * ux + dz * uz, side = Math.abs(dx * uz - dz * ux);
    const hit = kind === 0 ? Math.hypot(dx, dz) <= 3.1 && along >= Math.hypot(dx, dz) * Math.cos(1.35) : along >= 0 && along <= 4.4 && side <= 0.8;
    if (hit) hurt(w, f, hitOf(w, e, kind === 0 ? FERRYMAN.sweepMult : FERRYMAN.thrustMult, HIT.big), e);
  }
}
