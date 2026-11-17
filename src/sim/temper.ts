// 벼림 탭(기사 다섯째): 칼에 불·서리를 입혀 두고, 칼로 벨 때마다 충전을 쓴다. 설계: docs/superpowers/specs/2026-11-17-temper-tab-design.md
import { flameEdgeStat, frostEdgeStat, mastered, roll, skillHit } from './core';
import { TEMPER, type Entity, type World } from './rules';
import { stun } from './wizard';

// 칼을 비운다. 서리 칼에 맞은 횟수도 지운다
export function clearEdge(w: World): void {
  w.edge = { kind: null, left: 0, t: 0 };
  for (const e of w.entities) if (e.frost) e.frost = 0;
}

// 불 벼림 5단계: 마지막 휘두름이 맞힌 자리의 작은 화염 폭발(충전을 쓰지 않는다)
export function flameBurst(w: World, x: number, z: number): void {
  const hero = w.entities[0];
  w.blasts.push({ id: w.nextItem++, x, z, age: 0, kind: 'fire', r: TEMPER.burstR });
  for (const e of w.entities)
    if (e !== hero && e.state !== 'dead' && Math.hypot(e.x - x, e.z - z) <= TEMPER.burstR) skillHit(w, e, Math.round(roll(w, hero) * TEMPER.burst));
}

// 칼로 벤 한 번의 휘두름(hit = 맞은 적, 죽었어도). 맞은 살아 있는 적마다 강화 효과를 주고,
// use이고 누군가 맞았으면 충전 1(해방 중엔 줄지 않는다). 0이 되면 칼이 빈다
export function temper(w: World, hero: Entity, hit: Entity[], use = true): void {
  const { kind } = w.edge;
  if (!kind) return;
  const fire = kind !== 'frost';
  const ice = kind !== 'flame';
  for (const e of hit) {
    if (e.state === 'dead') continue;
    if (fire) skillHit(w, e, Math.round(roll(w, hero) * flameEdgeStat(w).mult));
    if (!ice || e.hp <= 0) continue;
    const st = frostEdgeStat(w);
    if ((e.frost = (e.frost ?? 0) + 1) < st.hits) continue;
    e.frost = 0;
    stun(e, st.freeze);
    w.blasts.push({ id: w.nextItem++, x: e.x, z: e.z, age: 0, kind: 'ice' });
  }
  if (!use || !hit.length) return;
  w.edgeSwings++;
  if (kind === 'both' || --w.edge.left > 0) return;
  if (kind === 'flame' && mastered(w, 'flameEdge')) for (const e of hit) flameBurst(w, e.x, e.z);
  clearEdge(w);
}

// 벼림 시전: 해방 중엔 나가지 않는다(0). 쓰던 칼을 비우고 새로 입힌다
function edgeCast(w: World, kind: 'flame' | 'frost'): number {
  if (w.edge.kind === 'both') return 0;
  const st = kind === 'flame' ? flameEdgeStat(w) : frostEdgeStat(w);
  clearEdge(w);
  w.edge = { kind, left: st.charges, t: 0 };
  return st.cd;
}
export const flameEdge = (w: World, _hero: Entity) => edgeCast(w, 'flame');
export const frostEdge = (w: World, _hero: Entity) => edgeCast(w, 'frost');
