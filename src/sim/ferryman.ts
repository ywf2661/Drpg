// 역병 걸린 뱃사공(호숫가 결전, 설계: docs/superpowers/specs/2026-11-24-act2-lake-design.md 7절). three.js·Math.random 금지.
// 물 위: 배를 타고 호수 둘레(반지름 ring)를 돈다. 원거리로만 맞는다. 몇 초마다 주인공 발밑에 등불을 던진다(떨어진 자리는 몇 번 더 타오른다).
//        물 위에 나설 때 세 번에 한 번은 물에서 마을 사람 둘을 끌어올린다.
// 나루: 주인공에게 가까운 나루에 내려 땅에서 싸운다(평타 + 삿대 휘두르기·찌르기 예고). 시간이 다 되면 가까운 나루 끝으로 가서 다시 배에 오른다.
// 체력 절반 아래: 물 위에 있는 시간이 짧아지고 등불을 둘씩 던진다.
import { face, friends, hitOf, hurt, pathTo, rand, walk } from './core';
import { spawnNear } from './gimmicks';
import { DT, HIT, type Entity, type World } from './rules';

export const FERRYMAN = {
  center: 24, ring: 8, tip: 9.5, speed: 1.9, // 호수 가운데(칸), 배가 도는 반지름·나루 끝 반지름(m), 배 빠르기(m/s)
  water: 7, waterHalf: 4.5, dock: 7, // 물 위·나루에 머무는 시간(초)
  lantern: 2.4, lanternHalf: 1.6, lanternDelay: 1.1, lanternMult: 1.1, burn: [0.8, 1.6, 2.4], burnMult: 0.35, // 등불: 간격, 예고, 피해 배율, 떨어진 뒤 다시 타오르는 때·배율
  raiseEvery: 3, raise: 2, // 물 위에 나설 때 이 번째마다 마을 사람
  swingEvery: 2.6, windup: 0.75, sweepMult: 1.3, thrustMult: 1.5, // 나루에서 삿대 기술
};
const DOCKS = [-Math.PI / 2, 0, Math.PI / 2, Math.PI]; // 북·동·남·서
export type FerrymanState = { mode: 'water' | 'dock' | 'board'; t: number; ang: number; lantern: number; laps: number; swing: number; move: 0 | 1 };

const at = (ang: number, r: number): [number, number] => [FERRYMAN.center + Math.cos(ang) * r, FERRYMAN.center + Math.sin(ang) * r];
const half = (e: Entity) => e.hp <= e.maxHp / 2;

export function ferryman(w: World, e: Entity, t: Entity | null): boolean {
  const fm = (w.fm ??= { mode: 'water', t: FERRYMAN.water, ang: Math.atan2(e.z - FERRYMAN.center, e.x - FERRYMAN.center), lantern: FERRYMAN.lantern, laps: 0, swing: FERRYMAN.swingEvery, move: 0 });
  const hero = w.entities[0];
  if (!t && hero.state !== 'dead' && fm.mode !== 'board') [e.target, t] = [0, hero]; // 결전장 어디서든 주인공을 노린다
  if (fm.mode === 'water') {
    fm.ang += (FERRYMAN.speed / FERRYMAN.ring) * DT;
    [e.x, e.z] = at(fm.ang, FERRYMAN.ring);
    Object.assign(e, { state: 'move', path: [], attackT: 0, phase: 'none' });
    e.facing = -fm.ang; // 도는 쪽(각이 커지는 쪽)
    if (!t) return true;
    if ((fm.lantern -= DT) <= 0) {
      fm.lantern = half(e) ? FERRYMAN.lanternHalf : FERRYMAN.lantern;
      const spots: [number, number][] = [[hero.x, hero.z]];
      if (half(e)) spots.push([hero.x + (rand(w) - 0.5) * 4, hero.z + (rand(w) - 0.5) * 4]);
      const dmg = hitOf(w, e, FERRYMAN.lanternMult, HIT.tell);
      for (const [x, z] of spots) {
        w.zones.push({ id: w.nextItem++, x, z, r: 1.2, t: FERRYMAN.lanternDelay, total: FERRYMAN.lanternDelay, dmg, owner: -1 });
        for (const b of FERRYMAN.burn) w.zones.push({ id: w.nextItem++, x, z, r: 1.2, t: FERRYMAN.lanternDelay + b, total: FERRYMAN.lanternDelay + b, dmg: Math.round(dmg * FERRYMAN.burnMult), owner: -1 });
      }
    }
    if ((fm.t -= DT) > 0) return true;
    // 내릴 나루: 배 앞쪽의 나루 둘 중 주인공에게 가까운 쪽(오래 돌지 않게). 배가 그 각도에 닿으면 나루 끝에 오른다
    const ahead = (d: number) => (((d - fm.ang) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    const [n1, n2] = [...DOCKS].sort((a, b) => ahead(a) - ahead(b));
    const want = dist2(at(n2, FERRYMAN.tip), hero) < dist2(at(n1, FERRYMAN.tip), hero) ? n2 : n1;
    const gap = ahead(want);
    if (gap > 0.08) return true;
    [e.x, e.z] = at(want, FERRYMAN.tip);
    Object.assign(fm, { mode: 'dock', t: FERRYMAN.dock, swing: FERRYMAN.swingEvery * 0.6 });
    Object.assign(e, { state: 'idle', repathT: 0 });
    return true;
  }
  if (fm.mode === 'dock') {
    if (e.phase === 'windup') {
      if ((e.phaseT -= DT) <= 0) strike(w, e, fm.move);
      return true;
    }
    if ((fm.t -= DT) <= 0) {
      fm.mode = 'board';
      Object.assign(e, { path: [], target: null, state: 'move', attackT: 0 });
      return true;
    }
    if (t && (fm.swing -= DT) <= 0 && Math.hypot(t.x - e.x, t.z - e.z) <= 5) {
      fm.swing = FERRYMAN.swingEvery;
      fm.move = fm.move ? 0 : 1;
      skill(w, e, t, fm.move);
      return true;
    }
    return false; // 평소처럼 쫓아가 친다
  }
  // board: 가장 가까운 나루 끝으로 걸어가 배에 오른다
  const dock = DOCKS.reduce((a, b) => (dist2(at(b, FERRYMAN.tip), e) < dist2(at(a, FERRYMAN.tip), e) ? b : a));
  const [tx, tz] = at(dock, FERRYMAN.tip);
  if (Math.hypot(tx - e.x, tz - e.z) <= 0.6 || (!e.path.length && !(e.path = pathTo(w, e, tx, tz) ?? []).length)) {
    fm.laps++;
    [e.x, e.z] = at(dock, FERRYMAN.ring);
    Object.assign(fm, { mode: 'water', ang: dock, t: half(e) ? FERRYMAN.waterHalf : FERRYMAN.water, lantern: FERRYMAN.lantern * 0.5 });
    if (fm.laps % FERRYMAN.raiseEvery === 0) for (let k = 0; k < FERRYMAN.raise; k++) spawnNear(w, 'minion', hero.x, hero.z, 2.5);
    return true;
  }
  Object.assign(e, { state: 'move', attackT: 0, target: null });
  walk(w, e);
  return true;
}

const dist2 = ([x, z]: [number, number], e: { x: number; z: number }) => (x - e.x) ** 2 + (z - e.z) ** 2;

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
