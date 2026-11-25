// 광산 감독관(보랏빛 광산 결전, 설계: docs/superpowers/specs/2026-11-25-act2-mine-design.md 5절). three.js·Math.random 금지.
// 결전장: 가운데 섬 + 둘레 섬 넷, 빛 다리로만 잇는다(minemap.ts generateMineArena). 처음엔 남쪽 다리가 켜져 있다.
//   결정 갑옷: 평소 받는 피해 FOREMAN.armor배("막힘"). 빛 다리 위에 있을 때 다리가 꺼지면 매달리고(mine.ts drop) 그동안 ×hangMult("약점!")
//   평타·내려찍기(앞쪽 원 예고)·결정 조각 던지기(주인공 쪽 세 갈래 — 다른 섬에 있어도 날아온다). 돌진은 안 한다(허공으로 뛰어들지 않게)
//   체력 절반 아래: 둘레 섬에 광부 고블린 넷(한 번), 가끔 결정을 쳐서 켜진 다리를 바꾼다(주인공은 떨어지지 않는다)
import { face, friends, hurt, rand, roll } from './core';
import { setLit } from './mine';
import { spawnNear } from './gimmicks';
import { ARCHER, DT, type Entity, type World } from './rules';

export const FOREMAN = { armor: 0.25, slamEvery: 4, slamR: 1.8, slamAt: 1.5, windup: 0.8, slamMult: 1.6, throwEvery: 4.5, throwHalf: 3, spread: 0.3, shardMult: 0.6, swapEvery: 8, miners: 4 };
type ForemanState = { slamT: number; throwT: number; swapT: number; raised: boolean };
const state = new WeakMap<World, ForemanState>();

// true = 이번 틱은 이것으로 끝(평소 행동을 건너뛴다)
export function foreman(w: World, e: Entity, t: Entity | null): boolean {
  let s = state.get(w);
  if (!s) {
    s = { slamT: FOREMAN.slamEvery, throwT: FOREMAN.throwEvery, swapT: FOREMAN.swapEvery, raised: false };
    state.set(w, s);
    const m = w.mine;
    if (m && m.lit < 0 && m.crystals.length) setLit(w, m.crystals.reduce((a, c, k) => (c.z > m.crystals[a].z ? k : a), 0)); // 남쪽 섬 결정
  }
  const hero = w.entities[0];
  if (!t && hero.state !== 'dead') [e.target, t] = [0, hero];
  if (e.phase === 'windup') {
    if ((e.phaseT -= DT) > 0) return true;
    const [x, z] = [e.x + Math.sin(e.facing) * FOREMAN.slamAt, e.z + Math.cos(e.facing) * FOREMAN.slamAt];
    w.blasts.push({ id: w.nextItem++, x, z, age: 0, kind: 'slam' });
    for (const f of friends(w)) if (Math.hypot(f.x - x, f.z - z) <= FOREMAN.slamR) hurt(w, f, Math.round(roll(w, e) * FOREMAN.slamMult), e);
    e.phase = 'none';
    s.slamT = FOREMAN.slamEvery;
    return true;
  }
  if (e.phase !== 'none' || !t) return false;
  const half = e.hp <= e.maxHp / 2;
  if (half && !s.raised) {
    s.raised = true;
    const m = w.mine;
    const outer = (m?.crystals ?? []).filter((c) => Math.hypot(c.x - e.x, c.z - e.z) > 9);
    for (let k = 0; k < FOREMAN.miners && outer.length; k++) {
      const c = outer[(k * 2) % outer.length];
      spawnNear(w, 'minion', c.x + 0.5, c.z + 0.5, 2); // 광부 고블린(지역 졸개 그림)
    }
  }
  // 결정 조각 던지기: 주인공 쪽 세 갈래
  if ((s.throwT -= DT) <= 0) {
    s.throwT = half ? FOREMAN.throwHalf : FOREMAN.throwEvery;
    face(e, t);
    const d = Math.hypot(t.x - e.x, t.z - e.z) || 1;
    const base = Math.atan2(t.x - e.x, t.z - e.z);
    for (const k of [-1, 0, 1]) {
      const a = base + k * FOREMAN.spread;
      w.shots.push({ id: w.nextItem++, x: e.x, z: e.z, dx: Math.sin(a), dz: Math.cos(a), dmg: Math.round(roll(w, e) * FOREMAN.shardMult), left: Math.max(ARCHER.flight, d / 8 + 1), kind: 'arrow' });
    }
  }
  // 체력 절반 아래: 가끔 결정을 쳐서 켜진 다리를 바꾼다
  const m = w.mine;
  if (half && m && (s.swapT -= DT) <= 0) {
    s.swapT = FOREMAN.swapEvery;
    const others = m.crystals.map((_, k) => k).filter((k) => m.crystals[k].bridge !== (m.lit >= 0 ? m.crystals[m.lit].bridge : -1));
    if (others.length) setLit(w, others[Math.floor(rand(w) * others.length)]);
  }
  if ((s.slamT -= DT) <= 0 && Math.hypot(t.x - e.x, t.z - e.z) <= 3) {
    face(e, t);
    Object.assign(e, { phase: 'windup', phaseT: FOREMAN.windup, state: 'idle', attackT: 0, path: [] });
    w.zones.push({ id: w.nextItem++, x: e.x + Math.sin(e.facing) * FOREMAN.slamAt, z: e.z + Math.cos(e.facing) * FOREMAN.slamAt, r: FOREMAN.slamR, t: FOREMAN.windup, total: FOREMAN.windup, dmg: 0, owner: -1, kind: 'warn' });
    return true;
  }
  return false;
}
