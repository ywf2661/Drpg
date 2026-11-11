// 특수 행동: 주인공 스킬(가르기·돌진 베기), 보스 돌진, 해골 왕 소환, 마법사 물러나기, 화살·화염구.
import { findPath, walkable, type Cell } from './path';
import { ARCHER, AXE, CHARGE, DASH, DT, KING, KNOCK, MAGE, METEOR, REPATH, ROLL, SHOUT, SKILL, SLAM, type Entity, type Shot, type World } from './rules';
import { axeStat, canHit, cellOf, cleaveStat, clearLine, dashStat, dist, face, heroMax, hurt, knock, makeEntity, mastered, roll, shoutStat, skillHit, walk, waypoints } from './core';

// 가르기 시작: 조준점(없으면 가까운 적, 그것도 없으면 지금 방향)을 보고 휘두르기. 이동·계단 의도는 멈춘다
export function cleaveStart(w: World, hero: Entity, x?: number, z?: number) {
  if (w.skillCd > 0) return;
  w.toStairs = false;
  if (x !== undefined && z !== undefined) hero.facing = Math.atan2(x - hero.x, z - hero.z);
  else {
    const near = w.entities
      .filter((e) => e !== hero && e.state !== 'dead' && dist(e, hero) <= SKILL.aim)
      .sort((a, b) => dist(a, hero) - dist(b, hero))[0];
    if (near) face(hero, near);
  }
  Object.assign(hero, { state: 'attack', attackT: 0, path: [], repathT: 0, skill: true }); // 공격 대상은 유지: 끝나면 이어서 친다
  w.skillCd = cleaveStat(w).cd;
}

// 가르기 타격: 바라보는 방향 반원(내적 ≥ 0, 5단계는 한 바퀴)·반경 안, 벽에 막히지 않은 적 모두
export function cleave(w: World, hero: Entity) {
  const fx = Math.sin(hero.facing);
  const fz = Math.cos(hero.facing);
  for (const e of w.entities) {
    if (e === hero || e.state === 'dead') continue;
    const dx = e.x - hero.x;
    const dz = e.z - hero.z;
    const st = cleaveStat(w);
    if (Math.hypot(dx, dz) > st.radius || (!mastered(w, 'cleave') && dx * fx + dz * fz < 0) || !clearLine(w, hero, e)) continue; // 5단계는 한 바퀴
    skillHit(w, e, Math.round(roll(w, hero) * st.mult));
    const d = Math.hypot(dx, dz);
    knock(w, e, d > 1e-6 ? dx / d : fx, d > 1e-6 ? dz / d : fz, KNOCK.cleave);
  }
  w.cleaves++;
}

// 보스 돌진. 3~7m·시야가 트이면 예고(제자리) → 그 순간 대상 방향으로 직선 돌진 → 벽·거리·명중에서 멈춤.
// 돌진 중이면 true(평소 행동을 건너뜀)
export function charge(w: World, e: Entity, t: Entity | null): boolean {
  e.cd = Math.max(0, e.cd - DT);
  if (e.phase === 'none') {
    const d = t ? dist(e, t) : 0;
    if (!t || e.cd > 0 || e.state === 'attack' || d < CHARGE.min || d > CHARGE.max || !clearLine(w, e, t)) return false;
    Object.assign(e, { phase: 'windup', phaseT: CHARGE.windup, cd: CHARGE.cd, state: 'idle', path: [] });
    face(e, t);
    return true;
  }
  if (e.phase === 'windup') {
    if (t) face(e, t);
    if ((e.phaseT -= DT) > 0) return true;
    const d = t ? dist(e, t) || 1 : 1;
    if (!t) return Object.assign(e, { phase: 'none' }), true;
    Object.assign(e, { phase: 'charge', phaseT: CHARGE.dist, dx: (t.x - e.x) / d, dz: (t.z - e.z) / d, state: 'move' });
    return true;
  }
  const hero = w.entities[0];
  if (!rush(w, e, CHARGE.speed)) return true;
  if (hero.state !== 'dead' && dist(e, hero) <= CHARGE.hit) {
    hurt(w, hero, Math.round(roll(w, e) * CHARGE.mult), e);
    Object.assign(e, { phase: 'none', state: 'idle' });
  }
  return true;
}

// 해골 왕 소환: 대상이 가까우면 KING.cd마다 예고(제자리) 후 주변 빈 칸에 졸개. 시전 중이면 true
export function summon(w: World, e: Entity, t: Entity | null): boolean {
  e.cd = Math.max(0, e.cd - DT);
  const alive = () => w.entities.filter((m) => m.summoner === e.id && m.state !== 'dead').length;
  if (e.phase === 'none') {
    if (!t || e.cd > 0 || e.state === 'attack' || dist(e, t) > KING.range || alive() >= KING.max) return false;
    Object.assign(e, { phase: 'windup', phaseT: KING.windup, cd: KING.cd, state: 'idle', path: [] });
    return true;
  }
  if ((e.phaseT -= DT) > 0) return true;
  e.phase = 'none';
  const [cx, cz] = cellOf(e);
  const spots: Cell[] = [];
  for (let r = 1; r <= 2; r++)
    for (let dz = -r; dz <= r; dz++)
      for (let dx = -r; dx <= r; dx++)
        if (Math.max(Math.abs(dx), Math.abs(dz)) === r && walkable(w.grid, cx + dx, cz + dz)) spots.push([cx + dx, cz + dz]);
  for (const [x, z] of spots.slice(0, Math.min(KING.count, KING.max - alive()))) {
    const m = makeEntity(w.entities.length, 'minion', x + 0.5, z + 0.5, e.power, false, e.id);
    m.target = 0; // 주인공(id 0)을 바로 노린다
    w.entities.push(m);
  }
  return true;
}

// 직선 돌진 한 틱(보스 돌진·주인공 돌진 공용): (dx, dz)로 speed만큼. 남은 거리(phaseT)를 다 썼거나 벽이면 멈추고 false
export function rush(w: World, e: Entity, speed: number): boolean {
  const step = speed * DT;
  const [nx, nz] = [e.x + e.dx * step, e.z + e.dz * step];
  if (e.phaseT <= 0 || !walkable(w.grid, Math.floor(nx), Math.floor(nz))) {
    Object.assign(e, { phase: 'none', state: 'idle' });
    return false;
  }
  [e.x, e.z] = [nx, nz];
  e.phaseT -= step;
  return true;
}

// 돌진 베기 시작: 조준점(없으면 가까운 적, 그것도 없으면 지금 방향)으로. 하던 일은 모두 끊는다
export function dashStart(w: World, hero: Entity, x?: number, z?: number) {
  if (w.dashCd > 0) return;
  let [dx, dz] = [Math.sin(hero.facing), Math.cos(hero.facing)];
  const near = w.entities
    .filter((e) => e !== hero && e.state !== 'dead' && dist(e, hero) <= DASH.aim)
    .sort((a, b) => dist(a, hero) - dist(b, hero))[0];
  const [tx, tz] = x !== undefined && z !== undefined ? [x, z] : near ? [near.x, near.z] : [hero.x + dx, hero.z + dz];
  const d = Math.hypot(tx - hero.x, tz - hero.z);
  if (d > 1e-6) [dx, dz] = [(tx - hero.x) / d, (tz - hero.z) / d];
  Object.assign(hero, { phase: 'charge', phaseT: dashStat(w).dist, dx, dz, state: 'move', path: [], target: null, attackT: 0, skill: false });
  hero.facing = Math.atan2(dx, dz);
  Object.assign(w, { dashCd: dashStat(w).cd, dashHit: [], opening: null, toStairs: false });
  w.dashes++;
}

// 구르기 시작: 조준점(없으면 가까운 적의 반대쪽, 적도 없으면 바라보는 쪽)으로. 휘두르기는 끊기고 공격 대상은 유지한다
export function rollStart(w: World, hero: Entity, x?: number, z?: number) {
  if (w.rollCd > 0) return;
  let [dx, dz] = [Math.sin(hero.facing), Math.cos(hero.facing)];
  const near = w.entities
    .filter((e) => e !== hero && e.state !== 'dead' && dist(e, hero) <= ROLL.away)
    .sort((a, b) => dist(a, hero) - dist(b, hero))[0];
  const [tx, tz] = x !== undefined && z !== undefined ? [x, z] : near ? [2 * hero.x - near.x, 2 * hero.z - near.z] : [hero.x + dx, hero.z + dz];
  const d = Math.hypot(tx - hero.x, tz - hero.z);
  if (d > 1e-6) [dx, dz] = [(tx - hero.x) / d, (tz - hero.z) / d];
  Object.assign(hero, { phase: 'roll', phaseT: ROLL.dist, dx, dz, state: 'move', path: [], attackT: 0, skill: false, repathT: 0, facing: Math.atan2(dx, dz) });
  Object.assign(w, { rollCd: ROLL.cd, opening: null, toStairs: false });
}

// 구르기 한 틱: 벽에 막히면 제자리에서 구른다(무적 시간은 같다)
export function rollStep(w: World, hero: Entity) {
  const step = ROLL.speed * DT;
  const [nx, nz] = [hero.x + hero.dx * step, hero.z + hero.dz * step];
  if (walkable(w.grid, Math.floor(nx), Math.floor(nz))) [hero.x, hero.z] = [nx, nz];
  if ((hero.phaseT -= step) <= 0) Object.assign(hero, { phase: 'none', state: 'idle' });
}

// 돌진 한 틱: 지나가는 길 DASH.hit 안의, 이번 돌진에서 아직 안 맞은 적에게 피해
export function dashStep(w: World, hero: Entity) {
  if (!rush(w, hero, DASH.speed)) return;
  for (const e of w.entities) {
    if (e === hero || e.state === 'dead' || w.dashHit.includes(e.id) || dist(e, hero) > DASH.hit) continue;
    if (!w.dashHit.length && w.skillCd > 0) {
      // 연속: 돌진이 적을 맞히면 가르기가 바로 준비된다(돌진당 한 번)
      w.skillCd = 0;
      w.combos.push({ id: w.nextItem++, x: hero.x, z: hero.z, kind: 'reset', age: 0 });
    }
    w.dashHit.push(e.id);
    skillHit(w, e, Math.round(roll(w, hero) * dashStat(w).mult));
    if (e.hp <= 0 && mastered(w, 'dash')) w.dashCd = 0; // 5단계: 처치하면 다시 돌진
    const side = (e.x - hero.x) * -hero.dz + (e.z - hero.z) * hero.dx < 0 ? -1 : 1; // 돌진 길의 어느 쪽에 있는가
    knock(w, e, -hero.dz * side, hero.dx * side, KNOCK.dash);
  }
}

// 마법사: 대상이 MAGE.flee 안이면 반대쪽으로 물러난다. 물러날 곳이 없으면(구석) false → 평소처럼 시전
export function flee(w: World, e: Entity, t: Entity): boolean {
  const d = dist(e, t);
  if (d >= MAGE.flee) return false;
  if ((e.repathT -= DT) <= 0 || !e.path.length) {
    e.repathT = REPATH;
    const [ux, uz] = d < 1e-6 ? [1, 0] : [(e.x - t.x) / d, (e.z - t.z) / d];
    const [gx, gz] = [Math.floor(e.x + ux * MAGE.flee), Math.floor(e.z + uz * MAGE.flee)];
    let best: Cell | null = null;
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const c: Cell = [gx + dx, gz + dz];
        const far = Math.hypot(c[0] + 0.5 - t.x, c[1] + 0.5 - t.z);
        if (walkable(w.grid, c[0], c[1]) && far > d + 1 && (!best || far > Math.hypot(best[0] + 0.5 - t.x, best[1] + 0.5 - t.z))) best = c;
      }
    }
    const p = best && findPath(w.grid, cellOf(e), best);
    e.path = p && p.length > 1 ? waypoints(p, best![0] + 0.5, best![1] + 0.5) : [];
  }
  if (!e.path.length) return false;
  walk(w, e);
  return true;
}

// 대상 t 쪽으로 화살·화염구를 쏜다(그 순간 위치를 향해 직선). 데미지는 지금 굴린다
export function shoot(w: World, a: Entity, t: Entity, kind: Shot['kind']) {
  const d = dist(a, t) || 1;
  const left = kind === 'fire' ? MAGE.flight : ARCHER.flight;
  w.shots.push({ id: w.nextItem++, x: a.x, z: a.z, dx: (t.x - a.x) / d, dz: (t.z - a.z) / d, dmg: roll(w, a), left, kind });
}

// 전투의 함성: 반경 안 살아 있는 적을 기절(하던 휘두르기·예고·돌진도 끊김), 주인공은 잠시 받는 피해 감소
export function shout(w: World, hero: Entity) {
  if (w.shoutCd > 0) return;
  const st = shoutStat(w);
  for (const e of w.entities) {
    if (e === hero || e.state === 'dead' || dist(e, hero) > st.radius) continue;
    Object.assign(e, { stunT: st.stun, state: 'idle', attackT: 0, path: [], phase: 'none' });
    const d = dist(e, hero);
    knock(w, e, d > 1e-6 ? (e.x - hero.x) / d : 1, d > 1e-6 ? (e.z - hero.z) / d : 0, KNOCK.shout);
  }
  Object.assign(w, { shoutCd: st.cd, shoutT: SHOUT.time });
  if (mastered(w, 'shout')) hero.hp = Math.min(hero.maxHp, hero.hp + Math.round(heroMax(w) * SHOUT.heal)); // 5단계: 회복
  w.shouts++;
}

// 도끼 던지기: 조준점(없으면 가까운 적, 그것도 없으면 바라보는 방향)으로. 주인공은 하던 일을 계속한다
export function throwAxe(w: World, hero: Entity, x?: number, z?: number) {
  if (w.throwCd > 0) return;
  const near = w.entities
    .filter((e) => e !== hero && e.state !== 'dead' && dist(e, hero) <= AXE.aim)
    .sort((a, b) => dist(a, hero) - dist(b, hero))[0];
  let [dx, dz] = [Math.sin(hero.facing), Math.cos(hero.facing)];
  const [tx, tz] = x !== undefined && z !== undefined ? [x, z] : near ? [near.x, near.z] : [hero.x + dx, hero.z + dz];
  const d = Math.hypot(tx - hero.x, tz - hero.z);
  if (d > 1e-6) [dx, dz] = [(tx - hero.x) / d, (tz - hero.z) / d];
  hero.facing = Math.atan2(dx, dz);
  w.shots.push({ id: w.nextItem++, x: hero.x, z: hero.z, dx, dz, dmg: Math.round(roll(w, hero) * axeStat(w).mult), left: AXE.flight, kind: 'axe' });
  w.throwCd = axeStat(w).cd;
}

// 비행: 화살은 벽·비행 끝에서 사라지고 주인공에 닿으면 피해. 화염구는 그 모든 경우에 그 자리에서 폭발.
// 도끼(주인공)는 처음 닿는 살아 있는 몬스터에게 피해(5단계는 관통)
export function fly(w: World, hero: Entity) {
  w.shots = w.shots.filter((s) => {
    const fire = s.kind === 'fire';
    const step = (fire ? MAGE.speed : s.kind === 'axe' ? AXE.speed : ARCHER.speed) * DT;
    const [nx, nz] = [s.x + s.dx * step, s.z + s.dz * step];
    s.left -= step;
    if (!walkable(w.grid, Math.floor(nx), Math.floor(nz)) || s.left <= 0) {
      if (fire) explode(w, hero, s.x, s.z, s.dmg); // 벽 앞(마지막으로 있던 자리)에서
      return false;
    }
    [s.x, s.z] = [nx, nz];
    if (s.kind === 'axe') {
      const hit = (s.hit ??= []);
      const t = w.entities.find((e) => e !== hero && e.state !== 'dead' && !hit.includes(e.id) && Math.hypot(e.x - s.x, e.z - s.z) <= AXE.hit);
      if (t) {
        hit.push(t.id);
        skillHit(w, t, s.dmg);
        knock(w, t, s.dx, s.dz, KNOCK.axe);
      }
      return !t || mastered(w, 'throw'); // 5단계: 관통(맞힌 적은 다시 안 맞는다)
    }
    if (hero.state === 'dead' || Math.hypot(s.x - hero.x, s.z - hero.z) > (fire ? MAGE.hitRadius : ARCHER.hitRadius)) return true;
    if (fire) explode(w, hero, s.x, s.z, s.dmg);
    else hurt(w, hero, s.dmg);
    return false;
  });
}

// 화염구 폭발: 반경 안의 살아 있는 주인공에게 피해(직격과 겹쳐도 한 번), 기록을 남긴다
export function explode(w: World, hero: Entity, x: number, z: number, dmg: number) {
  w.blasts.push({ id: w.nextItem++, x, z, age: 0, kind: 'fire' });
  if (hero.state !== 'dead' && Math.hypot(hero.x - x, hero.z - z) <= MAGE.blast) hurt(w, hero, dmg);
}

// 전사 내려찍기: 대상이 사거리 안이고 대기가 끝났으면 제자리 예고 + 앞쪽 바닥에 위험 구역. 피해·종료는 tickZones가.
// 예고 중이면 true(평소 행동을 건너뜀). 대기는 대상이 있을 때만 흐른다(처음 만났을 때 한꺼번에 내려찍지 않게)
export function slam(w: World, e: Entity, t: Entity | null): boolean {
  if (e.phase === 'windup') return true;
  if (!t) return false;
  e.cd = Math.max(0, e.cd - DT);
  if (e.cd > 0 || !canHit(w, e, t)) return false;
  face(e, t);
  Object.assign(e, { phase: 'windup', cd: SLAM.cd, state: 'idle', attackT: 0, path: [] });
  const [x, z] = [e.x + Math.sin(e.facing) * SLAM.reach, e.z + Math.cos(e.facing) * SLAM.reach];
  w.zones.push({ id: w.nextItem++, x, z, r: SLAM.radius, t: SLAM.windup, total: SLAM.windup, dmg: Math.round(roll(w, e) * SLAM.mult), owner: e.id });
  return true;
}

// 마법사 불기둥: 대상이 보이는 사거리 안이고 대기가 끝났으면 대상 발밑에 위험 구역(하던 일은 계속한다)
export function meteor(w: World, e: Entity, t: Entity) {
  e.cd = Math.max(0, e.cd - DT);
  if (e.cd > 0 || dist(e, t) > MAGE.range || !clearLine(w, e, t)) return;
  e.cd = METEOR.cd;
  w.zones.push({ id: w.nextItem++, x: t.x, z: t.z, r: MAGE.blast, t: METEOR.delay, total: METEOR.delay, dmg: Math.round(roll(w, e) * METEOR.mult), owner: -1 });
}

// 위험 구역 한 틱: 주인이 죽었거나 예고가 끊겼으면 사라지고, 시간이 다 되면 반경 안의 주인공에게 피해
export function tickZones(w: World, hero: Entity) {
  w.zones = w.zones.filter((z) => {
    const owner = z.owner < 0 ? null : w.entities[z.owner];
    if (owner && (owner.state === 'dead' || owner.phase !== 'windup')) return false;
    if ((z.t -= DT) > 0) return true;
    if (!owner) explode(w, hero, z.x, z.z, z.dmg);
    else {
      owner.phase = 'none';
      w.blasts.push({ id: w.nextItem++, x: z.x, z: z.z, age: 0, kind: 'slam' });
      if (hero.state !== 'dead' && Math.hypot(hero.x - z.x, hero.z - z.z) <= z.r) hurt(w, hero, z.dmg, owner);
    }
    return false;
  });
}
