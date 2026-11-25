// 약탈자 우두머리(약탈자 진지 결전, 설계: docs/superpowers/specs/2026-11-24-act2-raid-design.md 4절). three.js·Math.random 금지.
// 평타(고기칼)·돌진(보스 원형의 charge)은 평소대로. 여기서 더하는 것:
//   돌진하다 화약통을 들이받으면 통이 곧 터지고 우두머리는 CHIEF.stun초 기절 — 그동안만 맞는다(core.ts hurt). 통을 사이에 두고 꾀어내는 것이 결전의 퍼즐
//   화약통은 군막에서 하나씩 굴러 나와 마당에 멈춰 선다(마당에 CHIEF.kegs개까지)
//   내려찍기: 앞쪽 원 예고 뒤 큰 피해. 화약통 던지기: 주인공 발밑에 불붙은 통(곧 터진다)
//   체력 절반 아래: 군막에서 약탈자 넷(한 번), 통을 둘씩
import { face, friends, hitOf, hurt, rand } from './core';
import { walkable } from './path';
import { spawnNear } from './gimmicks';
import { kegAt } from './powder';
import { DT, HIT, POWDER, type Entity, type World } from './rules';

export const CHIEF = { kegs: 3, rollEvery: 5, rollFirst: 1.5, stun: 3, bump: 1.3, throwEvery: 5, throwHalf: 3.5, slamEvery: 4, slamR: 1.7, slamAt: 1.5, windup: 0.8, slamMult: 1.6, raiders: 4 };
type ChiefState = { throwT: number; slamT: number; raised: boolean; rollT: number };
const state = new WeakMap<World, ChiefState>();

// true = 이번 틱은 이것으로 끝(평소 행동을 건너뛴다)
export function chief(w: World, e: Entity, t: Entity | null): boolean {
  const s = state.get(w) ?? { throwT: CHIEF.throwEvery, slamT: CHIEF.slamEvery, raised: false, rollT: CHIEF.rollFirst };
  state.set(w, s);
  const hero = w.entities[0];
  if (!t && hero.state !== 'dead') [e.target, t] = [0, hero];
  if ((s.rollT -= DT) <= 0) {
    s.rollT = CHIEF.rollEvery;
    if (w.kegs.filter((k) => !k.done && !k.lit).length < CHIEF.kegs) rollKeg(w, hero);
  }
  // 돌진 중 화약통을 들이받는다
  if (e.phase === 'charge') {
    const keg = w.kegs.find((k) => !k.done && Math.hypot(kegAt(k)[0] - e.x, kegAt(k)[1] - e.z) <= CHIEF.bump);
    if (keg) {
      Object.assign(keg, { lit: true, fuse: 0.05, bump: true }); // 꾀어낸 주인공은 통 바로 뒤에 서 있다 — 그 폭발로 벌받지 않게
      Object.assign(e, { phase: 'none', state: 'idle', stunT: CHIEF.stun, path: [] });
      w.combos.push({ id: w.nextItem++, x: e.x, z: e.z, kind: 'stunned', age: 0 }); // "약점!" — 이제 때릴 때
      return true;
    }
    return false;
  }
  if (e.phase === 'windup' && s.slamT < 0) {
    // 내려찍기 예고 중(돌진 예고와 가르려고 slamT를 음수로 둔다)
    if ((e.phaseT -= DT) > 0) return true;
    const [x, z] = [e.x + Math.sin(e.facing) * CHIEF.slamAt, e.z + Math.cos(e.facing) * CHIEF.slamAt];
    w.blasts.push({ id: w.nextItem++, x, z, age: 0, kind: 'slam' });
    for (const f of friends(w)) if (Math.hypot(f.x - x, f.z - z) <= CHIEF.slamR) hurt(w, f, hitOf(w, e, CHIEF.slamMult, HIT.big), e);
    Object.assign(e, { phase: 'none' });
    s.slamT = CHIEF.slamEvery;
    return true;
  }
  if (e.phase !== 'none' || !t) return false;
  const half = e.hp <= e.maxHp / 2;
  if (half && !s.raised) {
    s.raised = true;
    const tents = w.props.filter((p) => p.kind === 'tent' || p.kind === 'tentBig');
    for (let k = 0; k < CHIEF.raiders; k++) {
      const p = tents[k % Math.max(1, tents.length)];
      spawnNear(w, 'minion', p ? p.x + 1 : e.x, p ? p.z + 1 : e.z, 2);
    }
  }
  if ((s.throwT -= DT) <= 0) {
    s.throwT = half ? CHIEF.throwHalf : CHIEF.throwEvery;
    for (let n = half ? 2 : 1; n > 0; n--) {
      const [x, z] = [Math.floor(t.x + (rand(w) - 0.5) * (n > 1 ? 4 : 1.2)), Math.floor(t.z + (rand(w) - 0.5) * (n > 1 ? 4 : 1.2))];
      if (!walkable(w.grid, x, z)) continue;
      w.kegs.push({ x, z, fuse: POWDER.fuse, lit: true, wall: false, done: false, chest: -1 });
      w.zones.push({ id: w.nextItem++, x: x + 0.5, z: z + 0.5, r: POWDER.r, t: POWDER.fuse, total: POWDER.fuse, dmg: 0, owner: -1, kind: 'warn' });
    }
    face(e, t);
  }
  if ((s.slamT -= DT) <= 0 && Math.hypot(t.x - e.x, t.z - e.z) <= 3) {
    face(e, t);
    s.slamT = -1;
    Object.assign(e, { phase: 'windup', phaseT: CHIEF.windup, state: 'idle', attackT: 0, path: [] });
    w.zones.push({ id: w.nextItem++, x: e.x + Math.sin(e.facing) * CHIEF.slamAt, z: e.z + Math.cos(e.facing) * CHIEF.slamAt, r: CHIEF.slamR, t: CHIEF.windup, total: CHIEF.windup, dmg: 0, owner: -1, kind: 'warn' });
    return true;
  }
  return false;
}

// 군막 하나에서 마당으로 통이 굴러 나와 멈춘다(주인공 발밑·다른 통 곁은 피한다)
function rollKeg(w: World, hero: Entity) {
  const tents = w.props.filter((p) => p.kind === 'tent'); // 쓰러진 군막 자리에서도(통이 끊기지 않게)
  if (!tents.length) return;
  const p = tents[Math.floor(rand(w) * tents.length)];
  const [sx, sz] = [p.x + 1, p.z + 1];
  for (let tries = 0; tries < 20; tries++) {
    const a = rand(w) * Math.PI * 2, r = 4 + rand(w) * 6;
    const [tx, tz] = [24 + Math.cos(a) * r, 24 + Math.sin(a) * r];
    if (!walkable(w.grid, Math.floor(tx), Math.floor(tz)) || Math.hypot(tx - hero.x, tz - hero.z) < 2.5 || w.kegs.some((k) => !k.done && Math.hypot(kegAt(k)[0] - tx, kegAt(k)[1] - tz) < 2)) continue;
    w.kegs.push({ x: Math.floor(sx), z: Math.floor(sz), fx: sx, fz: sz, roll: [tx, tz], fuse: -1, lit: false, wall: false, done: false, chest: -1 });
    return;
  }
}
