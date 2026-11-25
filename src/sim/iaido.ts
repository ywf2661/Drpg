// 발도 탭(기사 넷째): 바닥에 칼선을 긋고, 1초 뒤 한꺼번에 베인다. 설계: docs/superpowers/specs/2026-11-18-iaido-cutline-design.md
import { cleaveStart } from './abilities';
import { clearLine, cutCd, dist, echoStat, flashStat, grazeStat, markStat, mastered, pathTo, rank, roll, skillHit } from './core';
import { walkable } from './path';
import { temper } from './temper';
import { CUT, DT, ECHO, FLASH, GRAZE, SKILL, type Cut, type Entity, type Point, type SkillId, type World } from './rules';

type Seg = Cut['segs'][number];

// 꺾은선 → 선분들
export function polySegs(pts: Point[]): Seg[] {
  return pts.slice(1).map((p, i) => [pts[i][0], pts[i][1], p[0], p[1]]);
}
// (cx, cz) 둘레 반지름 r의 호. 각은 facing과 같은 기준(0 = +z, sin = x)
export function arcSegs(cx: number, cz: number, r: number, a0: number, a1: number, n = 12): Seg[] {
  const pts: Point[] = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    pts.push([cx + Math.sin(a) * r, cz + Math.cos(a) * r]);
  }
  return polySegs(pts);
}
export const ringSegs = (cx: number, cz: number, r: number) => arcSegs(cx, cz, r, 0, Math.PI * 2, 24);
export const halfSegs = (hero: Entity, r: number) => arcSegs(hero.x, hero.z, r, hero.facing - Math.PI / 2, hero.facing + Math.PI / 2);
// 가운데 (x, z)에서 길이 len인 두 선: diag면 X자, 아니면 십자
export function crossSegs(x: number, z: number, len: number, diag: boolean): Seg[] {
  const h = len / 2;
  const [a, b] = diag ? [h * Math.SQRT1_2, h * Math.SQRT1_2] : [h, 0];
  return [[x - a, z - b, x + a, z + b], [x - b, z + a, x + b, z - a]];
}

// 칼선을 긋는다. 그을 때 벤 적(hit)은 베이는 순간 어디 있든 맞는다
export function addCut(w: World, segs: Seg[], mult: number, hit: Entity[], src: SkillId, t: number = CUT.delay): void {
  w.cuts.push({ id: w.nextItem++, segs, t, mult, hit: hit.filter((e) => e.state !== 'dead').map((e) => e.id), src });
}

export function segDist(x: number, z: number, [x0, z0, x1, z1]: Seg): number {
  const [sx, sz] = [x1 - x0, z1 - z0];
  const l2 = sx * sx + sz * sz;
  const k = l2 > 1e-9 ? Math.min(1, Math.max(0, ((x - x0) * sx + (z - z0) * sz) / l2)) : 0;
  return Math.hypot(x - x0 - sx * k, z - z0 - sz * k);
}

// 칼선이 베인다: 그을 때 벤 적과, 지금 선 가까이 있는 적. 한 칼선은 한 적을 한 번만
function snap(w: World, hero: Entity, c: Cut): void {
  w.snapped.push(c);
  if (w.snapped.length > 32) w.snapped.shift(); // 렌더가 읽고 지나간 것
  let killed = false;
  for (const e of w.entities) {
    if (e === hero || e.state === 'dead') continue;
    if (!c.hit.includes(e.id) && !c.segs.some((s) => segDist(e.x, e.z, s) <= CUT.near)) continue;
    skillHit(w, e, Math.round(roll(w, hero) * c.mult));
    w.blasts.push({ id: w.nextItem++, x: e.x, z: e.z, age: 0, kind: 'slash', n: 1 });
    if (e.hp <= 0) killed = true;
  }
  if (killed && c.src === 'graze' && mastered(w, 'graze')) cutCd(w, 'graze', Infinity); // 5단계: 베여 죽으면 다시
}

// 칼선 한 틱: 시간이 다 된 칼선이 베인다
export function tickCuts(w: World, hero: Entity): void {
  if (!w.cuts.length) return;
  for (const c of w.cuts) c.t -= DT;
  const due = w.cuts.filter((c) => c.t <= 1e-9);
  if (!due.length) return;
  w.cuts = w.cuts.filter((c) => c.t > 1e-9);
  for (const c of due) snap(w, hero, c);
}

// 그어두기
export function markStart(w: World, hero: Entity, x?: number, z?: number): number {
  cleaveStart(w, hero, x, z);
  w.slash = 'mark';
  return markStat(w).cd;
}

// 그어두기 타격: 가르기와 같은 앞쪽 반원(5단계는 한 바퀴)을 약하게 베고, 그 둘레에 칼선을 남긴다. 밀어내지 않는다
export function markSlash(w: World, hero: Entity): void {
  const fx = Math.sin(hero.facing);
  const fz = Math.cos(hero.facing);
  const st = markStat(w);
  const round = mastered(w, 'mark');
  const hit: Entity[] = [];
  for (const e of w.entities) {
    if (e === hero || e.state === 'dead') continue;
    const dx = e.x - hero.x;
    const dz = e.z - hero.z;
    if (Math.hypot(dx, dz) > SKILL.radius || (!round && dx * fx + dz * fz < 0) || !clearLine(w, hero, e)) continue;
    skillHit(w, e, Math.round(roll(w, hero) * st.mult));
    hit.push(e);
  }
  addCut(w, round ? ringSegs(hero.x, hero.z, SKILL.radius) : halfSegs(hero, SKILL.radius), st.cut, hit, 'mark');
  temper(w, hero, hit);
  w.cleaves++;
  w.markSlashes++;
}

// 스쳐 베기: 조준한 쪽(없으면 가까운 적, 그것도 없으면 바라보는 쪽)으로 GRAZE.dist를 순식간에 지나간다(무적)
export function graze(w: World, hero: Entity, x?: number, z?: number): number {
  let [dx, dz] = [Math.sin(hero.facing), Math.cos(hero.facing)];
  const near = w.entities
    .filter((e) => e !== hero && e.state !== 'dead' && dist(e, hero) <= GRAZE.dist)
    .sort((a, b) => dist(a, hero) - dist(b, hero))[0];
  const [tx, tz] = x !== undefined && z !== undefined ? [x, z] : near ? [near.x, near.z] : [hero.x + dx, hero.z + dz];
  const d = Math.hypot(tx - hero.x, tz - hero.z);
  if (d > 1e-6) [dx, dz] = [(tx - hero.x) / d, (tz - hero.z) / d];
  Object.assign(hero, { phase: 'graze', phaseT: GRAZE.dist, dx, dz, state: 'idle', attackT: 0, skill: false, facing: Math.atan2(dx, dz), path: hero.path.slice(-1) });
  Object.assign(w, { grazeFrom: [hero.x, hero.z], grazeHit: [], opening: null, toStairs: false });
  return grazeStat(w).cd;
}

// 스쳐 베기 한 틱: 지나치는 적을 기억해 두고(바로 베지는 않는다), 끝나면 지나온 길에 칼선
export function grazeStep(w: World, hero: Entity): void {
  const step = GRAZE.speed * DT;
  const [nx, nz] = [hero.x + hero.dx * step, hero.z + hero.dz * step];
  if (walkable(w.grid, Math.floor(nx), Math.floor(nz))) [hero.x, hero.z] = [nx, nz];
  else hero.phaseT = 0;
  const hit = w.entities.filter((e) => e !== hero && e.state !== 'dead' && !w.grazeHit.includes(e.id) && dist(e, hero) <= GRAZE.near);
  if (hit.length) {
    temper(w, hero, hit, !w.grazeHit.length); // 스쳐 베기 하나 = 휘두름 하나
    w.grazeHit.push(...hit.map((e) => e.id));
  }
  if ((hero.phaseT -= step) > 0) return;
  const to = hero.path[0]; // 가던 목적지: 멈춘 자리에서 길을 다시 잡는다
  Object.assign(hero, { phase: 'none', path: (to && pathTo(w, hero, to[0], to[1])) ?? [] });
  addCut(w, [[w.grazeFrom[0], w.grazeFrom[1], hero.x, hero.z]], grazeStat(w).cut, w.entities.filter((e) => w.grazeHit.includes(e.id)), 'graze');
}

// 칼의 여운: 베는 스킬은 칸을 채우고, 칸이 가득하면 다음 다른 탭 베기(TAKES)가 벤 모양 그대로 칼선을 남긴다
const SLASHES: SkillId[] = ['cleave', 'downcut', 'dash', 'leap', 'mark', 'graze', 'flash'];
const TAKES: SkillId[] = ['cleave', 'downcut', 'dash', 'leap'];
export function echoCast(w: World, id: SkillId, cast: () => number): number {
  if (!rank(w, 'echo') || !SLASHES.includes(id)) return cast();
  const arm = w.echo >= ECHO.need && TAKES.includes(id);
  const prev = w.echoOn;
  if (arm) Object.assign(w, { echoOn: id, echoHit: [] });
  const cd = cast();
  if (cd <= 0) {
    if (arm) w.echoOn = prev; // 나가지 않았다
    return cd;
  }
  w.echo = arm ? 0 : Math.min(ECHO.need, w.echo + 1);
  return cd;
}
// 여운을 실은 스킬이 벨 때 그 모양의 칼선을 남긴다
export function echoCut(w: World, id: SkillId, segs: () => Seg[], hit: Entity[]): void {
  if (w.echoOn !== id) return;
  w.echoOn = null;
  addCut(w, segs(), echoStat(w).cut, hit, 'echo');
}

// 일섬: 범위 안 적을 가까운 순으로 최대 max명 골라 차례로 꿰뚫는다. 대상이 없으면 안 나간다(0)
export function flash(w: World, hero: Entity): number {
  const st = flashStat(w);
  const ids = w.entities
    .filter((e) => e !== hero && e.state !== 'dead' && dist(hero, e) <= FLASH.range && clearLine(w, hero, e))
    .sort((a, b) => dist(hero, a) - dist(hero, b))
    .slice(0, st.max)
    .map((e) => e.id);
  if (!ids.length) return 0;
  Object.assign(w, { flashQ: ids, flashPath: [[hero.x, hero.z]], flashHits: [] });
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

// 한 틱 이동. 막히면 그 도약을 끝낸다. 마지막 도약이 끝나면 지나온 길에 칼선을 긋고, 칼을 넣으며 바닥의 칼선을 모두 벤다
export function flashStep(w: World, hero: Entity): void {
  const step = FLASH.speed * DT;
  const [nx, nz] = [hero.x + hero.dx * step, hero.z + hero.dz * step];
  if (walkable(w.grid, Math.floor(nx), Math.floor(nz))) [hero.x, hero.z] = [nx, nz];
  else hero.phaseT = 0;
  const t = w.entities.find((e) => e.id === w.flashQ[0]);
  if (t && t.state !== 'dead' && w.flashHit !== t.id && dist(hero, t) <= FLASH.near) {
    w.flashHit = t.id;
    w.flashHits.push(t.id);
    skillHit(w, t, Math.round(roll(w, hero) * flashStat(w).mult));
    temper(w, hero, [t]);
  }
  if ((hero.phaseT -= step) > 0) return;
  w.flashQ.shift();
  w.flashPath.push([hero.x, hero.z]);
  if (hop(w, hero)) return;
  const to = hero.path[0]; // 가던 목적지: 일섬이 끝난 자리에서 길을 다시 잡는다
  Object.assign(hero, { phase: 'none', path: (to && pathTo(w, hero, to[0], to[1])) ?? [] });
  addCut(w, polySegs(w.flashPath), flashStat(w).cut, w.entities.filter((e) => w.flashHits.includes(e.id)), 'flash');
  const all = w.cuts;
  w.cuts = [];
  for (const c of all) snap(w, hero, c);
  if (rank(w, 'echo')) w.echo = ECHO.need;
}
