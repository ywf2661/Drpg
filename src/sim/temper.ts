// 벼림 탭(기사 다섯째): 칼에 불·서리를 입혀 두고, 칼로 벨 때마다 충전을 쓴다. 설계: docs/superpowers/specs/2026-11-17-temper-tab-design.md
import { clearLine, dist, flameEdgeStat, frostEdgeStat, mastered, rank, reforgeStat, roll, skillHit, unleashStat } from './core';
import { DT, TEMPER, type Entity, type World } from './rules';
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
  if (use && kind === 'both') edgeSlash(w, hero); // 해방: 휘두를 때마다(빈 휘두름도) 칼날의 빛이 앞으로
  if (!use || !hit.length) return;
  w.edgeSwings++;
  if (kind === 'both' || --w.edge.left > 0) return;
  if (kind === 'flame' && mastered(w, 'flameEdge')) for (const e of hit) flameBurst(w, e.x, e.z);
  clearEdge(w);
}

// 덧벼림(패시브): 충전이 남은 불·서리 칼을 다른 강화(next)로 갈아입으면 남은 충전이 주인공 둘레로 한꺼번에 터진다(충전을 쓰지 않는다).
// 같은 벼림을 다시 쓰면 터지지 않고 충전만 새로 찬다
export function reforge(w: World, hero: Entity, next: 'flame' | 'frost' | 'both'): void {
  const { kind, left } = w.edge;
  if (!rank(w, 'reforge') || (kind !== 'flame' && kind !== 'frost') || kind === next || left <= 0) return;
  const st = reforgeStat(w);
  w.blasts.push({ id: w.nextItem++, x: hero.x, z: hero.z, age: 0, kind: kind === 'flame' ? 'fire' : 'ice', r: st.radius });
  for (const e of w.entities) {
    if (e === hero || e.state === 'dead' || dist(e, hero) > st.radius) continue;
    skillHit(w, e, Math.round(left * roll(w, hero) * st.mult));
    if (kind === 'frost') stun(e, TEMPER.reforgeFreeze);
  }
}

// 벼림 시전: 해방 중엔 나가지 않는다(0). 쓰던 칼은 (덧벼림이면 터뜨리고) 비우고 새로 입힌다
function edgeCast(w: World, kind: 'flame' | 'frost'): number {
  if (w.edge.kind === 'both') return 0;
  const st = kind === 'flame' ? flameEdgeStat(w) : frostEdgeStat(w);
  reforge(w, w.entities[0], kind);
  clearEdge(w);
  w.edge = { kind, left: st.charges, t: 0 };
  return st.cd;
}
export const flameEdge = (w: World, _hero: Entity) => edgeCast(w, 'flame');
export const frostEdge = (w: World, _hero: Entity) => edgeCast(w, 'frost');

// 검기 해방(궁극): 불과 서리가 함께, 충전 없이 정해진 시간 동안. 해방 중엔 다시 못 쓴다
export function unleash(w: World, hero: Entity): number {
  if (w.edge.kind === 'both') return 0;
  const st = unleashStat(w);
  reforge(w, hero, 'both');
  clearEdge(w);
  w.edge = { kind: 'both', left: 0, t: st.time };
  return st.cd;
}

// 해방 시간: 다 되면 칼이 빈다(명령보다 먼저 — 끝나는 틱의 휘두름엔 참격이 없다)
export function tickEdge(w: World): void {
  if (w.edge.kind === 'both' && (w.edge.t -= DT) <= 0) clearEdge(w);
}

// 해방 참격: 바라보는 쪽 앞 TEMPER.len, 칼선에서 옆으로 폭의 절반 안, 시선이 트인 적. 맞은 적은 강화 효과도(충전·참격은 다시 안 씀)
export function edgeSlash(w: World, hero: Entity): void {
  const [fx, fz] = [Math.sin(hero.facing), Math.cos(hero.facing)];
  const st = unleashStat(w);
  const hit: Entity[] = [];
  for (const e of w.entities) {
    if (e === hero || e.state === 'dead') continue;
    const [dx, dz] = [e.x - hero.x, e.z - hero.z];
    const along = dx * fx + dz * fz;
    if (along < 0 || along > TEMPER.len + 1e-6 || Math.abs(dx * fz - dz * fx) > TEMPER.width / 2 || !clearLine(w, hero, e)) continue;
    skillHit(w, e, Math.round(roll(w, hero) * st.mult));
    hit.push(e);
  }
  w.edgeSlashes++;
  temper(w, hero, hit, false);
}
