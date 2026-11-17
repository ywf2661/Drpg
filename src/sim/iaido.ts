// 발도 탭(기사 넷째): 검흔을 새기고 터뜨린다. 설계: docs/superpowers/specs/2026-11-17-iaido-tab-design.md
import { cleaveStart } from './abilities';
import { clearLine, dist, mastered, markStat, memoryStat, pathTo, roll, sheatheStat, flashStat, skillHit, syn, winding } from './core';
import { walkable } from './path';
import { temper } from './temper';
import { DT, FLASH, MARK, SHEATHE, SKILL, type Entity, type World } from './rules';
export const markDmg = (w: World, n: number, mult: number) => Math.round(roll(w, w.entities[0]) * MARK.mult * n * mult);

// 검흔 n개를 한꺼번에 터뜨린다. 터진 개수를 돌려준다(0이면 아무것도 안 함)
export function pop(w: World, e: Entity, mult: number): number {
  const n = e.marks ?? 0;
  if (!n) return 0;
  e.marks = 0;
  skillHit(w, e, markDmg(w, n, mult));
  w.blasts.push({ id: w.nextItem++, x: e.x, z: e.z, age: 0, kind: 'slash', n });
  return n;
}

// 검흔을 더하고 시간을 새로 잡는다. 한계에 닿으면(일섬 중이 아닐 때) 저절로 터진다
export function addMarks(w: World, e: Entity, n: number): void {
  const m = memoryStat(w);
  e.marks = (e.marks ?? 0) + n;
  e.markT = m.time;
  if (w.entities[0].phase !== 'flash' && e.marks >= m.cap) pop(w, e, syn(w, 'mark'));
}

// 시간이 다 된 검흔은 터지지 않고 사라진다
export function tickMarks(w: World): void {
  for (const e of w.entities) {
    if (!e.marks || e.state === 'dead') continue;
    if ((e.markT = (e.markT ?? 0) - DT) <= 0) e.marks = 0;
  }
}

export function markStart(w: World, hero: Entity, x?: number, z?: number): number {
  cleaveStart(w, hero, x, z);
  w.slash = 'mark';
  return markStat(w).cd;
}

// 그어두기 타격: 가르기와 같은 앞쪽 반원, 밀어내지 않는다. 예고 중인 적은 검흔 2(피해 전에 판정)
export function markSlash(w: World, hero: Entity): void {
  const fx = Math.sin(hero.facing);
  const fz = Math.cos(hero.facing);
  const st = markStat(w);
  const hit: Entity[] = [];
  for (const e of w.entities) {
    if (e === hero || e.state === 'dead') continue;
    const dx = e.x - hero.x;
    const dz = e.z - hero.z;
    if (Math.hypot(dx, dz) > SKILL.radius || dx * fx + dz * fz < 0 || !clearLine(w, hero, e)) continue;
    const per = winding(e) ? 2 : st.per;
    skillHit(w, e, Math.round(roll(w, hero) * st.mult));
    hit.push(e);
    if (e.hp > 0) addMarks(w, e, per);
  }
  temper(w, hero, hit);
  w.cleaves++;
  w.markSlashes++;
}

// 납도 범위 안, 시선이 트이고 검흔이 있는 살아 있는 적(가까운 순)
const sheatheTargets = (w: World, hero: Entity) =>
  w.entities
    .filter((e) => e !== hero && e.state !== 'dead' && e.marks && dist(hero, e) <= SHEATHE.range && clearLine(w, hero, e))
    .sort((a, b) => dist(hero, a) - dist(hero, b));

// 칼을 거둔다: 0.25초 뒤 터진다. 터뜨릴 검흔이 없으면 나가지 않는다(0)
export function sheathe(w: World, hero: Entity): number {
  if (!sheatheTargets(w, hero).length) return 0;
  Object.assign(hero, { phase: 'sheathe', phaseT: SHEATHE.delay, state: 'idle', attackT: 0, skill: false });
  return sheatheStat(w).cd;
}

export function sheatheStep(w: World, hero: Entity): void {
  hero.phaseT -= DT;
  if (hero.phaseT > 0) return;
  hero.phase = 'none';
  sheatheBurst(w, hero, sheatheStat(w).mult);
}

// 범위 안 검흔을 전부 터뜨린다. 5단계: 터져 죽은 적의 검흔은 가까운 적에게 옮겨붙어 바로 터진다(한 번만)
export function sheatheBurst(w: World, hero: Entity, mult: number): void {
  const spread = mastered(w, 'sheathe');
  for (const e of sheatheTargets(w, hero)) {
    const n = pop(w, e, mult);
    if (!spread || !n || e.state !== 'dead') continue;
    let next: Entity | null = null;
    for (const o of w.entities)
      if (o !== hero && o !== e && o.state !== 'dead' && dist(e, o) <= SHEATHE.spread && (!next || dist(e, o) < dist(e, next))) next = o;
    if (!next) continue;
    next.marks = (next.marks ?? 0) + n;
    pop(w, next, mult);
  }
}

// 일섬: 범위 안 적을 (검흔 많은 순, 가까운 순)으로 최대 max명 골라 차례로 꿰뚫는다. 대상이 없으면 안 나간다(0)
export function flash(w: World, hero: Entity): number {
  const st = flashStat(w);
  const ids = w.entities
    .filter((e) => e !== hero && e.state !== 'dead' && dist(hero, e) <= FLASH.range && clearLine(w, hero, e))
    .sort((a, b) => (b.marks ?? 0) - (a.marks ?? 0) || dist(hero, a) - dist(hero, b))
    .slice(0, st.max)
    .map((e) => e.id);
  if (!ids.length) return 0;
  w.flashQ = ids;
  Object.assign(hero, { state: 'idle', attackT: 0, skill: false });
  if (!hop(w, hero)) return 0;
  hero.path = hero.path.slice(-1); // 가던 목적지만 남긴다
  return st.cd;
}

// 죽은 대상을 버리고 첫 대상 쪽으로 도약을 잡는다. 대상이 없으면 false
export function hop(w: World, hero: Entity): boolean {
  while (w.flashQ.length && (w.entities.find((e) => e.id === w.flashQ[0])?.state ?? 'dead') === 'dead') w.flashQ.shift();
  const t = w.entities.find((e) => e.id === w.flashQ[0]);
  if (!t) return false;
  const d = Math.hypot(t.x - hero.x, t.z - hero.z);
  const [dx, dz] = d > 1e-6 ? [(t.x - hero.x) / d, (t.z - hero.z) / d] : [Math.sin(hero.facing), Math.cos(hero.facing)];
  Object.assign(hero, { phase: 'flash', dx, dz, phaseT: d + FLASH.past, facing: Math.atan2(dx, dz) });
  w.flashHit = -1;
  return true;
}

// 한 틱 이동. 막히면 그 도약을 끝내고, 마지막 도약이 끝나면 칼을 거두며 전부 터뜨린다
export function flashStep(w: World, hero: Entity): void {
  const step = FLASH.speed * DT;
  const [nx, nz] = [hero.x + hero.dx * step, hero.z + hero.dz * step];
  if (walkable(w.grid, Math.floor(nx), Math.floor(nz))) [hero.x, hero.z] = [nx, nz];
  else hero.phaseT = 0;
  const t = w.entities.find((e) => e.id === w.flashQ[0]);
  if (t && t.state !== 'dead' && w.flashHit !== t.id && dist(hero, t) <= FLASH.near) {
    w.flashHit = t.id;
    skillHit(w, t, Math.round(roll(w, hero) * flashStat(w).mult));
    if (t.hp > 0) addMarks(w, t, FLASH.marks);
    temper(w, hero, [t]);
  }
  if ((hero.phaseT -= step) > 0) return;
  w.flashQ.shift();
  if (hop(w, hero)) return;
  const to = hero.path[0]; // 가던 목적지: 일섬이 끝난 자리에서 길을 다시 잡는다
  Object.assign(hero, { phase: 'none', path: (to && pathTo(w, hero, to[0], to[1])) ?? [] });
  sheatheBurst(w, hero, sheatheStat(w).mult);
}
