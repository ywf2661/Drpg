// 문지기 사제(사암 신전 결전, 설계: docs/superpowers/specs/2026-11-26-act2-temple-design.md 5절). three.js·Math.random 금지.
// 결전장: 담 + 고리 둘 + 봉인(templemap.ts generateTempleArena), 해 틈은 동쪽.
//   빛 밖에서는 맞지 않는다("막힘"), 햇빛 안에서는 KEEPER.lit배(core.hurt). 칸막이에 짓이겨지지 않는다(떠 있다 — temple.ts)
//   떠다닌다: 고리 벽을 넘어 곧장 주인공 곁(KEEPER.near m)으로 간다 — 그래서 빛줄기로 꾀어낼 수 있다
//   봉인 문양(주인공 발밑 원 예고 → 폭발), 저주 구슬(주인공 쪽 세 갈래), 고리 돌리기(빛이 지나는 가장 안쪽 고리를 돌려 빛을 줄인다)
//   체력 절반 아래: 붕대 망령 넷(한 번), 고리를 더 자주 돌린다
import { face, roll } from './core';
import { spawnNear } from './gimmicks';
import { inLight, turnRing } from './temple';
import { ARCHER, DT, MAGE, type Entity, type World } from './rules';

export const KEEPER = { lit: 1.5, near: 1.6, speed: 2.2, sigilEvery: 5, sigilTell: 1.1, sigilMult: 1.6, orbEvery: 4, orbHalf: 2.8, spread: 0.32, orbMult: 0.6, turnEvery: 10, turnHalf: 6, mummies: 4 };
type KeeperState = { sigilT: number; orbT: number; turnT: number; raised: boolean };
const state = new WeakMap<World, KeeperState>();

// 빛 안에서만 맞는다(core.hurt가 묻는다)
export const keeperShielded = (w: World, e: Entity) => !inLight(w, e);

// true = 이번 틱은 이것으로 끝(평소 행동은 하지 않는다 — 걷기·평타 대신 떠다니며 주문만)
export function keeper(w: World, e: Entity): boolean {
  let s = state.get(w);
  if (!s) state.set(w, (s = { sigilT: KEEPER.sigilEvery, orbT: KEEPER.orbEvery, turnT: KEEPER.turnEvery, raised: false }));
  const hero = w.entities[0];
  if (hero.state === 'dead') return true;
  e.target = 0;
  const half = e.hp <= e.maxHp / 2;
  // 떠다니기: 벽을 넘어 주인공 곁으로
  const d = Math.hypot(hero.x - e.x, hero.z - e.z);
  if (d > KEEPER.near) {
    const k = Math.min(1, (KEEPER.speed * DT) / d);
    e.x += (hero.x - e.x) * k;
    e.z += (hero.z - e.z) * k;
    e.state = 'move';
  } else e.state = 'idle';
  face(e, hero);
  e.path = [];
  if (half && !s.raised) {
    s.raised = true;
    const t = w.temple;
    for (let k = 0; k < KEEPER.mummies && t; k++) {
      const a = (k * Math.PI) / 2 + Math.PI / 4;
      spawnNear(w, 'minion', t.cx + 0.5 + Math.cos(a) * (t.wall - 2), t.cz + 0.5 + Math.sin(a) * (t.wall - 2), 1.5, -1, 'mummy');
    }
  }
  // 봉인 문양: 주인공 발밑에 예고 원 → 폭발
  if ((s.sigilT -= DT) <= 0) {
    s.sigilT = KEEPER.sigilEvery;
    w.zones.push({ id: w.nextItem++, x: hero.x, z: hero.z, r: MAGE.blast, t: KEEPER.sigilTell, total: KEEPER.sigilTell, dmg: Math.round(roll(w, e) * KEEPER.sigilMult), owner: -1 });
  }
  // 저주 구슬: 주인공 쪽 세 갈래
  if ((s.orbT -= DT) <= 0) {
    s.orbT = half ? KEEPER.orbHalf : KEEPER.orbEvery;
    const base = Math.atan2(hero.x - e.x, hero.z - e.z);
    for (const k of [-1, 0, 1]) {
      const a = base + k * KEEPER.spread;
      w.shots.push({ id: w.nextItem++, x: e.x, z: e.z, dx: Math.sin(a), dz: Math.cos(a), dmg: Math.round(roll(w, e) * KEEPER.orbMult), left: Math.max(ARCHER.flight, d / 8 + 1), kind: 'arrow' });
    }
  }
  // 고리 돌리기: 빛이 지나가는 가장 안쪽 고리(빛이 고리 하나도 못 지나면 그대로 — 바깥 복도의 빛은 늘 남는다)
  const t = w.temple;
  if (t && (s.turnT -= DT) <= 0) {
    s.turnT = half ? KEEPER.turnHalf : KEEPER.turnEvery;
    const through = t.rings.map((g, k) => (t.reach < g.r ? k : -1)).filter((k) => k >= 0);
    if (through.length) turnRing(w, through[0]); // rings는 안 → 밖 순서
  }
  return true;
}
