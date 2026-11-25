// 타락한 성기사 전용 기술(설계: docs/superpowers/specs/2026-11-19-paladin-skills-design.md). 수치는 sanctum.ts의 PALADIN.
// 빛의 사슬: 켜진 성소마다 성기사와 빛줄, 닿으면 데인다. 성검의 비: 표식 → 성검이 꽂혀 잠시 벽. 심판: 체력 절반부터, 곁만 빼고 방 전체. three.js·Math.random 금지.
import { face, friends, hitOf, hurt, rand, roll } from './core';
import { walkable } from './path';
import { PALADIN } from './sanctum';
import { DT, HIT, type Chest, type Entity, type World, type Zone } from './rules';

export const paladinOf = (w: World) => w.entities.find((e) => e.kind === 'boss' && e.skin === 'fallen_paladin' && e.state !== 'dead');

// 빛줄이 이어진 성소: 성기사가 살아 있고 기절하지 않았고 성검의 비가 진행 중이 아니면, 켜진 성소 전부
export function litBeams(w: World): Chest[] {
  const b = paladinOf(w);
  if (!b || b.stunT > 0 || b.phase === 'raise' || w.pal.quiet > 0) return [];
  return w.chests.filter((c) => c.kind === 'altar' && !c.open);
}

// 점 (px, pz)에서 선분 a→b까지 거리
function segDist(px: number, pz: number, ax: number, az: number, bx: number, bz: number) {
  const [dx, dz] = [bx - ax, bz - az];
  const s = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz || 1)));
  return Math.hypot(px - ax - dx * s, pz - az - dz * s);
}

// 성기사 한 틱의 바깥일(행동은 paladin): 빛줄 피해
export function tickPaladin(w: World) {
  w.pal.quiet = Math.max(0, w.pal.quiet - DT);
  // 꽂힌 성검: 시간이 다 되면 칸을 다시 연다(성기사가 죽었어도)
  for (const s of w.swords) if ((s.t -= DT) <= 0) w.grid.blocked[s.z * w.grid.w + s.x] = 0;
  w.swords = w.swords.filter((s) => s.t > 0);
  for (const id in w.pal.burn) w.pal.burn[id] = Math.max(0, w.pal.burn[id] - DT);
  const b = paladinOf(w);
  if (b && w.pal.judge < 0 && b.hp <= b.maxHp / 2) w.pal.judge = PALADIN.judgeFirst; // 체력 절반 아래: 심판이 풀린다
  const lit = litBeams(w);
  // 새로 잇는 빛줄은 beamWarn초 동안 바닥에 예고만(데지 않는다). 끊긴 줄은 잊는다(다시 이으면 또 예고)
  for (const id in w.pal.link) if (!lit.some((c) => c.id === +id)) delete w.pal.link[id];
  for (const c of lit) w.pal.link[c.id] = c.id in w.pal.link ? Math.max(0, w.pal.link[c.id] - DT) : PALADIN.beamWarn;
  const beams = lit.filter((c) => w.pal.link[c.id] <= 0);
  if (!b || !beams.length) return;
  for (const f of friends(w)) {
    if ((w.pal.burn[f.id] ?? 0) > 0) continue;
    if (!beams.some((c) => segDist(f.x, f.z, b.x, b.z, c.x + 0.5, c.z + 0.5) <= PALADIN.beamR)) continue;
    w.pal.burn[f.id] = PALADIN.beamEvery;
    hurt(w, f, Math.round(roll(w, b) * PALADIN.beamMult));
  }
}

// 성기사 한 틱의 행동. 기술을 치켜들거나 기도하는 중이면 true(평소 행동을 건너뜀). 대상이 있을 때만 기다림이 흐른다
export function paladin(w: World, e: Entity, t: Entity | null): boolean {
  if (t) w.pal.rain -= DT;
  if (t && w.pal.judge > 0) w.pal.judge = Math.max(0, w.pal.judge - DT);
  if (e.phase === 'pray') {
    if ((e.phaseT -= DT) > 1e-6) return true;
    judge(w, e);
    e.phase = 'none';
    return true;
  }
  if (e.phase === 'raise') {
    if ((e.phaseT -= DT) > 1e-6) return true;
    rainMarks(w, e);
    e.phase = 'none';
    return true;
  }
  if (e.phase !== 'none' || !t) return false; // 휘두르던 평타는 끊고 기술로(곁에서 쉬지 않고 휘둘러도 쓰게)
  if (w.pal.judge === 0 && w.pal.quiet <= 0) {
    Object.assign(e, { phase: 'pray', phaseT: PALADIN.judgeWindup, state: 'idle', attackT: 0, path: [] });
    w.pal.judge = PALADIN.judgeCd;
    return true;
  }
  if (w.pal.rain <= 0) {
    Object.assign(e, { phase: 'raise', phaseT: PALADIN.raise, state: 'idle', attackT: 0, path: [] });
    w.pal.rain = PALADIN.rainCd;
    face(e, t);
    return true;
  }
  return false;
}

// 심판: 성기사 곁(judgeSafe) 밖의 주인공·아군 전부
function judge(w: World, e: Entity) {
  w.blasts.push({ id: w.nextItem++, x: e.x, z: e.z, age: 0, kind: 'slam' });
  for (const f of friends(w))
    if (Math.hypot(f.x - e.x, f.z - e.z) > PALADIN.judgeSafe) {
      w.blasts.push({ id: w.nextItem++, x: f.x, z: f.z, age: 0, kind: 'fire' });
      hurt(w, f, hitOf(w, e, PALADIN.judgeMult, HIT.big));
    }
}

// 성검 표식: 주인공 발밑 + 곁 하나 + 성기사 둘레에서 무작위. 성소 곁은 비운다(바칠 자리를 막지 않게)
function rainMarks(w: World, e: Entity) {
  const hero = w.entities[0];
  const altars = w.chests.filter((c) => c.kind === 'altar');
  const marks: [number, number][] = [];
  const ok = (x: number, z: number, gap: number) => walkable(w.grid, x, z) && altars.every((c) => Math.hypot(x - c.x, z - c.z) >= PALADIN.altarGap) && marks.every(([mx, mz]) => Math.hypot(mx - x, mz - z) >= gap);
  const pick = (cells: [number, number][]) => cells.length && marks.push(cells[Math.floor(rand(w) * cells.length)]);
  const [hx, hz] = [Math.floor(hero.x), Math.floor(hero.z)];
  if (ok(hx, hz, 0)) marks.push([hx, hz]);
  pick(([[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]] as const).map(([a, b]): [number, number] => [hx + a, hz + b]).filter(([x, z]) => ok(x, z, 1)));
  const R = Math.ceil(PALADIN.rainRange);
  const around: [number, number][] = [];
  for (let z = Math.floor(e.z) - R; z <= Math.floor(e.z) + R; z++) for (let x = Math.floor(e.x) - R; x <= Math.floor(e.x) + R; x++) if (Math.hypot(x + 0.5 - e.x, z + 0.5 - e.z) <= PALADIN.rainRange) around.push([x, z]);
  while (marks.length < PALADIN.rainCount && pick(around.filter(([x, z]) => ok(x, z, PALADIN.rainGap))));
  for (const [x, z] of marks) w.zones.push({ id: w.nextItem++, x: x + 0.5, z: z + 0.5, r: PALADIN.swordR, t: PALADIN.rainDelay, total: PALADIN.rainDelay, dmg: hitOf(w, e, PALADIN.swordMult, HIT.tell), owner: -1, kind: 'sword' });
  w.pal.quiet = PALADIN.rainDelay + PALADIN.swordWall; // 칼이 다 사라질 때까지 빛줄을 끈다
}

// 성검이 꽂힌다: 반경 안의 주인공·아군이 다치고, 그 칸에 아무도 없으면 swordWall초 동안 벽
export function landSword(w: World, z: Zone) {
  w.blasts.push({ id: w.nextItem++, x: z.x, z: z.z, age: 0, kind: 'slam' });
  for (const f of friends(w)) if (Math.hypot(f.x - z.x, f.z - z.z) <= z.r) hurt(w, f, z.dmg);
  const [x, cz] = [Math.floor(z.x), Math.floor(z.z)];
  // 선 칸, 그리고 대지 강타로 뛰는 중이면 내릴 칸(체공 중엔 칸을 확인하지 않아 벽 안에 내려앉는다)
  const on = (e: Entity, t: number) => Math.floor(e.x + e.dx * t) === x && Math.floor(e.z + e.dz * t) === cz;
  const taken = [...w.entities, ...w.allies].some((e) => e.state !== 'dead' && (on(e, 0) || (e.phase === 'leap' && on(e, e.phaseT))));
  if (taken || !walkable(w.grid, x, cz)) return;
  w.grid.blocked[cz * w.grid.w + x] = 1;
  w.swords.push({ id: z.id, x, z: cz, t: PALADIN.swordWall });
}
