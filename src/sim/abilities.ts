// 특수 행동: 주인공 스킬(가르기·돌진 베기), 보스 돌진, 해골 왕 소환, 마법사 물러나기, 화살·화염구.
import { findPath, seeThrough, walkable, type Cell } from './path';
import { FINALE, steady, ARCHER, AXE, BOUNCE, CHAIN_AXE, BURST, CHARGE, DASH, DT, EXECUTE, FIREBALL, KEY_CD, KING, KNOCK, LEAP, MAGE, METEOR, PIERCE, RANGER, REPATH, ROLL, ECHO, SHOUT, SKILL, SLAM, STATS, TRAIL, TREASURE, WHIRL, WIZ, type Entity, type Shot, type World } from './rules';
import { fireBurst, magicHit, nearest, stun } from './wizard';
import { arrowHit } from './ranger';
import { landSword } from './paladin';
import { temper } from './temper';
import { crossSegs, echoCut, halfSegs, ringSegs } from './iaido';
import { finaleStat, emberLine, hasUnique, axeStat, bounceStat, heavy, burstStat, canHit, cellOf, cleaveStat, clearLine, cutCd, dashStat, dist, executeStat, face, friends, heroMax, hurt, keyOf, knock, leapStat, makeEntity, mastered, pathTo, rank, roll, shoutStat, skillHit, trailStat, walk, waypoints, whirlStat } from './core';

// 기사 스킬은 쓰이면 재사용 대기(초)를, 쓰지 못했으면 0을 돌려준다. 칸의 재사용 대기는 world의 cast가 적는다

// 가르기 시작: 조준점(없으면 가까운 적, 그것도 없으면 지금 방향)을 보고 휘두르기. 가던 길은 휘두른 뒤에 이어 간다
export function cleaveStart(w: World, hero: Entity, x?: number, z?: number): number {
  if (rank(w, 'chainAxe')) hookStart(w, hero, x, z);
  else swingCleave(w, hero, x, z);
  return cleaveStat(w).cd;
}
function swingCleave(w: World, hero: Entity, x?: number, z?: number) {
  if (x !== undefined && z !== undefined) hero.facing = Math.atan2(x - hero.x, z - hero.z);
  else {
    const near = w.entities
      .filter((e) => e !== hero && e.state !== 'dead' && dist(e, hero) <= SKILL.aim)
      .sort((a, b) => dist(a, hero) - dist(b, hero))[0];
    if (near) face(hero, near);
  }
  w.slash = 'cleave';
  Object.assign(hero, { state: 'attack', attackT: 0, repathT: 0, skill: true }); // 공격 대상은 유지: 끝나면 이어서 친다
}

// 사슬 가르기(사슬 도끼를 배우면 가르기가 이것으로): 조준점(없으면 사거리 안의 가까운 적, 그것도 없으면 바라보는 방향)으로
// 사슬 도끼를 던진다. 처음 맞은 적을 끌고 와 앞에 놓고 가르기. 빗나가거나 무거운 적이면 가르지 않는다. 날기·끌기는 hookFly
const hookRange = (w: World) => CHAIN_AXE.range + CHAIN_AXE.grow * Math.max(0, rank(w, 'chainAxe') - 1);
function hookStart(w: World, hero: Entity, x?: number, z?: number) {
  const range = hookRange(w);
  const near = w.entities.filter((e) => e !== hero && e.state !== 'dead' && dist(e, hero) <= range && clearLine(w, hero, e)).sort((a, b) => dist(a, hero) - dist(b, hero))[0];
  const [tx, tz] = x !== undefined && z !== undefined ? [x, z] : near ? [near.x, near.z] : [hero.x + Math.sin(hero.facing), hero.z + Math.cos(hero.facing)];
  const d = Math.hypot(tx - hero.x, tz - hero.z);
  if (d > 1e-6) hero.facing = Math.atan2(tx - hero.x, tz - hero.z);
  w.shots.push({ id: w.nextItem++, x: hero.x, z: hero.z, dx: Math.sin(hero.facing), dz: Math.cos(hero.facing), dmg: 0, left: range, kind: 'hook' });
}
function hookFly(w: World, hero: Entity, s: Shot): boolean {
  const t = s.drag !== undefined ? w.entities[s.drag] : undefined;
  if (s.back) {
    // 되감기: 끌고 오는 적을 도끼에 붙여 주인공 앞까지
    const d = Math.hypot(hero.x - s.x, hero.z - s.z);
    const step = CHAIN_AXE.back * DT;
    const [nx, nz] = [s.x + ((hero.x - s.x) / (d || 1)) * step, s.z + ((hero.z - s.z) / (d || 1)) * step];
    if (!t || t.state === 'dead' || d - step <= CHAIN_AXE.hold || !walkable(w.grid, Math.floor(nx), Math.floor(nz))) return hookEnd(w, hero, t);
    [s.x, s.z, t.x, t.z] = [nx, nz, nx, nz];
    Object.assign(t, { state: 'idle', attackT: 0, path: [], repathT: 0, phase: 'none', stunT: Math.max(t.stunT, 2 * DT) }); // 끌려오는 동안은 아무것도 못 한다
    return true;
  }
  const step = CHAIN_AXE.speed * DT;
  const [nx, nz] = [s.x + s.dx * step, s.z + s.dz * step];
  s.left -= step;
  if (!seeThrough(w.grid, Math.floor(nx), Math.floor(nz)) || s.left <= 0) {
    openGate(w, Math.floor(nx), Math.floor(nz));
    return hookEnd(w, hero);
  }
  [s.x, s.z] = [nx, nz];
  const hit = w.entities.find((e) => e !== hero && e.state !== 'dead' && Math.hypot(e.x - s.x, e.z - s.z) <= AXE.hit);
  if (!hit) return true;
  if (heavy(hit)) return hookEnd(w, hero, hit); // 무거운 적은 끌려오지 않고, 주인공도 가지 않는다
  Object.assign(s, { back: true, drag: hit.id, x: hit.x, z: hit.z });
  return true;
}
// 사슬이 끝났다: 끌려온 적이 살아 있으면(5단계면 기절) 그쪽으로 가르기. 빗나감·무거운 적·끌려오다 죽은 적이면 가르지 않는다
function hookEnd(w: World, hero: Entity, t?: Entity): false {
  if (!t || t.state === 'dead' || heavy(t)) return false;
  if (mastered(w, 'chainAxe')) stun(t, CHAIN_AXE.stun);
  swingCleave(w, hero, t.x, t.z);
  return false;
}

// 회오리: 휘두르지 않고 돈다. 걷던 길·공격 대상은 그대로(돌면서 따라간다)
export function whirl(w: World, hero: Entity): number {
  const st = whirlStat(w);
  Object.assign(w, { spinT: st.time, spinAcc: WHIRL.tick });
  if (hero.state === 'attack') Object.assign(hero, { state: 'idle', attackT: 0, skill: false });
  return st.cd;
}

// 처형: 닿는 거리 안의 적 하나(조준점에 가장 가까운, 없으면 가장 가까운)를 벤다. 체력이 낮으면(보스·해골 왕 제외) 단칼에,
// 아니면 큰 피해. 죽이면 주변 적이 공포에 질려 도망친다. 닿는 적이 없으면 쓰지 않는다
export function execute(w: World, hero: Entity, x?: number, z?: number): number {
  const st = executeStat(w);
  const [ax, az] = x !== undefined && z !== undefined ? [x, z] : [hero.x, hero.z];
  const t = w.entities
    .filter((e) => e !== hero && e.state !== 'dead' && dist(e, hero) <= EXECUTE.reach && clearLine(w, hero, e))
    .sort((a, b) => Math.hypot(a.x - ax, a.z - az) - Math.hypot(b.x - ax, b.z - az))[0];
  if (!t) return 0;
  face(hero, t);
  const big = t.kind === 'boss' || t.kind === 'king';
  if (!big && t.hp <= t.maxHp * st.below) hurt(w, t, t.hp, hero);
  else skillHit(w, t, Math.round(roll(w, hero) * st.mult));
  const d = dist(t, hero) || 1;
  knock(w, t, (t.x - hero.x) / d, (t.z - hero.z) / d, KNOCK.cleave);
  w.blasts.push({ id: w.nextItem++, x: t.x, z: t.z, age: 0, kind: 'slam' });
  w.cleaves++;
  temper(w, hero, [t]);
  echoCut(w, 'execute', () => crossSegs(t.x, t.z, ECHO.x, true), [t]); // 칼의 여운: X자
  if (t.hp <= 0) {
    if (rank(w, 'burst')) burst(w, hero, [t]);
    for (const e of w.entities)
      if (e !== hero && e.state !== 'dead' && e.kind !== 'boss' && e.kind !== 'king' && !steady(e) && dist(e, t) <= EXECUTE.fearR) Object.assign(e, { fearT: EXECUTE.fear, state: 'idle', attackT: 0, path: [], phase: 'none' });
  }
  return st.cd;
}

// 종언(칼리버X): 최대 체력의 FINALE.hp를 잃고(1은 남는다) 조준 쪽(없으면 가까운 적 쪽) 넓은 부채꼴의 적 모두에게 큰 피해
export function finale(w: World, hero: Entity, x?: number, z?: number): number {
  if (x !== undefined && z !== undefined) hero.facing = Math.atan2(x - hero.x, z - hero.z);
  else {
    const near = w.entities.filter((e) => e !== hero && e.state !== 'dead' && dist(e, hero) <= FINALE.radius).sort((a, b) => dist(a, hero) - dist(b, hero))[0];
    if (near) face(hero, near);
  }
  const st = finaleStat(w);
  hero.hp = Math.max(1, hero.hp - Math.round(hero.maxHp * FINALE.hp));
  const [fx, fz, cos] = [Math.sin(hero.facing), Math.cos(hero.facing), Math.cos(((FINALE.arc / 2) * Math.PI) / 180)];
  for (const e of w.entities) {
    if (e === hero || e.state === 'dead') continue;
    const [dx, dz] = [e.x - hero.x, e.z - hero.z];
    const d = Math.hypot(dx, dz);
    if (d > FINALE.radius || (d > 1e-6 && (dx * fx + dz * fz) / d < cos) || !clearLine(w, hero, e)) continue;
    skillHit(w, e, Math.round(roll(w, hero) * st.mult));
    knock(w, e, d > 1e-6 ? dx / d : fx, d > 1e-6 ? dz / d : fz, KNOCK.cleave);
  }
  w.finales.push({ id: w.nextItem++, x: hero.x, z: hero.z, dir: hero.facing, age: 0 });
  return st.cd;
}

// 가르기 타격: 바라보는 방향 반원(내적 ≥ 0, 5단계는 한 바퀴)·반경 안, 벽에 막히지 않은 적 모두
export function cleave(w: World, hero: Entity) {
  const fx = Math.sin(hero.facing);
  const fz = Math.cos(hero.facing);
  const killed: Entity[] = [];
  const hit: Entity[] = [];
  for (const e of w.entities) {
    if (e === hero || e.state === 'dead') continue;
    const dx = e.x - hero.x;
    const dz = e.z - hero.z;
    const st = cleaveStat(w);
    if (Math.hypot(dx, dz) > st.radius || (!mastered(w, 'cleave') && dx * fx + dz * fz < 0) || !clearLine(w, hero, e)) continue; // 5단계는 한 바퀴
    skillHit(w, e, Math.round(roll(w, hero) * st.mult));
    hit.push(e);
    const d = Math.hypot(dx, dz);
    knock(w, e, d > 1e-6 ? dx / d : fx, d > 1e-6 ? dz / d : fz, KNOCK.cleave);
    if (e.hp <= 0) killed.push(e);
  }
  if (rank(w, 'burst')) burst(w, hero, killed);
  temper(w, hero, hit);
  w.cleaves++;
  const r = cleaveStat(w).radius;
  echoCut(w, 'cleave', () => (mastered(w, 'cleave') ? ringSegs(hero.x, hero.z, r) : halfSegs(hero, r)), hit); // 칼의 여운: 벤 모양 그대로
}

// 회오리 한 틱: WHIRL.tick마다 둘레 한 바퀴의 적을 벤다(밀어내지 않는다 — 계속 붙어서 갈린다)
export function spin(w: World, hero: Entity) {
  w.spinT = Math.max(0, w.spinT - DT);
  // 칼의 여운: 다 돈 자리에 원(도는 동안 벤 적은 어디 있든 맞는다)
  if (!w.spinT) echoCut(w, 'whirl', () => ringSegs(hero.x, hero.z, whirlStat(w).radius), w.entities.filter((e) => w.echoHit.includes(e.id)));
  if ((w.spinAcc += DT) < WHIRL.tick - 1e-9) return;
  w.spinAcc = 0;
  const st = whirlStat(w);
  const killed: Entity[] = [];
  const hit: Entity[] = [];
  for (const e of w.entities) {
    if (e === hero || e.state === 'dead' || dist(e, hero) > st.radius || !clearLine(w, hero, e)) continue;
    skillHit(w, e, Math.round(roll(w, hero) * st.mult));
    hit.push(e);
    if (e.hp <= 0) killed.push(e);
  }
  if (rank(w, 'burst')) burst(w, hero, killed);
  temper(w, hero, hit);
  if (w.echoOn === 'whirl') w.echoHit.push(...hit.map((e) => e.id));
  w.cleaves++;
}

// 시체 폭발(검술 패시브)·시체 폭발(강령술사 궁극): 죽은 적마다 그 자리에서 터져 주변 적에게 최대 체력에 비례한 피해.
// 터져서 죽은 적도 줄에 넣어 이어서 터진다
export function burst(w: World, hero: Entity, dead: Entity[], hp = burstStat(w).hp, radius = BURST.radius) {
  for (let i = 0; i < dead.length; i++) {
    const c = dead[i];
    w.blasts.push({ id: w.nextItem++, x: c.x, z: c.z, age: 0, kind: 'fire' });
    for (const e of w.entities) {
      if (e === hero || e.state === 'dead' || Math.hypot(e.x - c.x, e.z - c.z) > radius) continue;
      hurt(w, e, Math.round(c.maxHp * hp), hero);
      if (e.hp <= 0) dead.push(e);
    }
  }
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
  if (!rush(w, e, CHARGE.speed)) return true;
  const hit = friends(w).find((f) => dist(e, f) <= CHARGE.hit);
  if (hit) {
    hurt(w, hit, Math.round(roll(w, e) * CHARGE.mult), e);
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
export function dashStart(w: World, hero: Entity, x?: number, z?: number): number {
  let [dx, dz] = [Math.sin(hero.facing), Math.cos(hero.facing)];
  const near = w.entities
    .filter((e) => e !== hero && e.state !== 'dead' && dist(e, hero) <= DASH.aim)
    .sort((a, b) => dist(a, hero) - dist(b, hero))[0];
  const [tx, tz] = x !== undefined && z !== undefined ? [x, z] : near ? [near.x, near.z] : [hero.x + dx, hero.z + dz];
  const d = Math.hypot(tx - hero.x, tz - hero.z);
  if (d > 1e-6) [dx, dz] = [(tx - hero.x) / d, (tz - hero.z) / d];
  Object.assign(hero, { phase: 'charge', phaseT: dashStat(w).dist, dx, dz, state: 'move', path: [], target: null, attackT: 0, skill: false });
  hero.facing = Math.atan2(dx, dz);
  Object.assign(w, { dashHit: [], opening: null, toStairs: false });
  if (w.echoOn === 'dash') w.echoFrom = [hero.x, hero.z];
  w.trail = rank(w, 'trail') ? w.nextItem : -1;
  if (rank(w, 'trail')) w.fires.push({ id: w.nextItem++, x0: hero.x, z0: hero.z, x1: hero.x, z1: hero.z, t: TRAIL.time, acc: 0, r: TRAIL.width, mult: trailStat(w).mult }); // 불길: 돌진하며 늘어난다
  w.dashes++;
  return dashStat(w).cd;
}

// 대지 강타: 조준점(없으면 가까운 적, 그것도 없으면 바라보는 쪽)으로 LEAP.range까지 뛰어오른다(벽 앞에서 멈춤).
// LEAP.air초 동안 날아가며(무적, 적을 넘는다) 내린 자리에서 leapLand
export function leap(w: World, hero: Entity, x?: number, z?: number): number {
  const near = nearest(w, hero, LEAP.range);
  const [tx, tz] = x !== undefined && z !== undefined ? [x, z] : near ? [near.x, near.z] : [hero.x + Math.sin(hero.facing) * LEAP.range, hero.z + Math.cos(hero.facing) * LEAP.range];
  const d = Math.hypot(tx - hero.x, tz - hero.z);
  const [dx, dz] = d > 1e-6 ? [(tx - hero.x) / d, (tz - hero.z) / d] : [Math.sin(hero.facing), Math.cos(hero.facing)];
  let k = 0;
  while (k + 0.1 <= Math.min(LEAP.range, d) && walkable(w.grid, Math.floor(hero.x + dx * (k + 0.1)), Math.floor(hero.z + dz * (k + 0.1)))) k += 0.1;
  // dx, dz = 초당 이동량(뛰는 거리와 상관없이 LEAP.air초에 내린다), phaseT = 남은 체공 시간
  Object.assign(hero, { phase: 'leap', phaseT: LEAP.air, dx: (dx * k) / LEAP.air, dz: (dz * k) / LEAP.air, state: 'idle', path: hero.path.slice(-1), attackT: 0, skill: false, repathT: 0, facing: Math.atan2(dx, dz) });
  Object.assign(w, { opening: null, toStairs: false });
  w.dashes++;
  return leapStat(w).cd;
}

// 대지 강타 체공 한 틱. 다 날았으면 내린 자리 둘레의 적에게 피해·기절·밀어냄
export function leapStep(w: World, hero: Entity) {
  const t = Math.min(DT, hero.phaseT); // 마지막 틱은 남은 만큼만(조준한 자리를 넘어 벽에 박히지 않게)
  [hero.x, hero.z] = [hero.x + hero.dx * t, hero.z + hero.dz * t];
  if ((hero.phaseT -= DT) > 1e-9) return;
  const to = hero.path[0];
  Object.assign(hero, { phase: 'none', dx: 0, dz: 0, path: (to && pathTo(w, hero, to[0], to[1])) ?? [] });
  const st = leapStat(w);
  w.blasts.push({ id: w.nextItem++, x: hero.x, z: hero.z, age: 0, kind: 'slam' });
  const hit: Entity[] = [];
  for (const e of w.entities) {
    if (e === hero || e.state === 'dead') continue;
    const r = dist(e, hero);
    if (r > st.radius) continue;
    skillHit(w, e, Math.round(roll(w, hero) * st.mult));
    hit.push(e);
    stun(e, LEAP.stun);
    knock(w, e, r > 1e-6 ? (e.x - hero.x) / r : 1, r > 1e-6 ? (e.z - hero.z) / r : 0, KNOCK.shout);
  }
  temper(w, hero, hit);
  echoCut(w, 'leap', () => crossSegs(hero.x, hero.z, st.radius * 2, false), hit); // 칼의 여운: 십자
  w.shouts++; // 땅 울림 그림·소리
}

// 구르기 시작: 조준점(없으면 가까운 적의 반대쪽, 적도 없으면 바라보는 쪽)으로. 휘두르기는 끊기고 공격 대상·가던 목적지는 유지한다
export function rollStart(w: World, hero: Entity, x?: number, z?: number) {
  if (w.rollCd > 0) return;
  let [dx, dz] = [Math.sin(hero.facing), Math.cos(hero.facing)];
  const near = w.entities
    .filter((e) => e !== hero && e.state !== 'dead' && dist(e, hero) <= ROLL.away)
    .sort((a, b) => dist(a, hero) - dist(b, hero))[0];
  const [tx, tz] = x !== undefined && z !== undefined ? [x, z] : near ? [2 * hero.x - near.x, 2 * hero.z - near.z] : [hero.x + dx, hero.z + dz];
  const d = Math.hypot(tx - hero.x, tz - hero.z);
  if (d > 1e-6) [dx, dz] = [(tx - hero.x) / d, (tz - hero.z) / d];
  Object.assign(hero, { phase: 'roll', phaseT: ROLL.dist, dx, dz, state: 'move', path: hero.path.slice(-1), attackT: 0, skill: false, repathT: 0, facing: Math.atan2(dx, dz) });
  w.rollCd = ROLL.cd;
  w.trail = emberLine(w, hero.x, hero.z); // 불꽃 걸음: 구르며 늘어나는 불길
}


// 구르기 한 틱: 벽에 막히면 제자리에서 구른다(무적 시간은 같다)
export function rollStep(w: World, hero: Entity) {
  const step = ROLL.speed * DT;
  const [nx, nz] = [hero.x + hero.dx * step, hero.z + hero.dz * step];
  if (walkable(w.grid, Math.floor(nx), Math.floor(nz))) [hero.x, hero.z] = [nx, nz];
  const ember = w.fires.find((f) => f.id === w.trail);
  if (ember) [ember.x1, ember.z1] = [hero.x, hero.z];
  if ((hero.phaseT -= step) > 0) return;
  const to = hero.path[0]; // 가던 목적지: 구른 자리에서 길을 다시 잡는다
  Object.assign(hero, { phase: 'none', state: 'idle', path: (to && pathTo(w, hero, to[0], to[1])) ?? [] });
}

// 돌진 한 틱: 지나가는 길 DASH.hit 안의, 이번 돌진에서 아직 안 맞은 적에게 피해. 불길(돌격 패시브)은 길을 따라 늘어난다
export function dashStep(w: World, hero: Entity) {
  // 칼의 여운: 멈춘 자리까지 직선
  if (!rush(w, hero, DASH.speed)) return echoCut(w, 'dash', () => [[w.echoFrom[0], w.echoFrom[1], hero.x, hero.z]], w.entities.filter((e) => w.dashHit.includes(e.id)));
  const trail = w.fires.find((f) => f.id === w.trail);
  if (trail) [trail.x1, trail.z1] = [hero.x, hero.z];
  const first = !w.dashHit.length; // 돌진 하나 = 휘두름 하나: 처음 맞힌 틱에만 충전을 쓴다
  const hit: Entity[] = [];
  for (const e of w.entities) {
    if (e === hero || e.state === 'dead' || w.dashHit.includes(e.id) || dist(e, hero) > DASH.hit) continue;
    const q = keyOf(w, 'cleave');
    if (!w.dashHit.length && q && w[KEY_CD[q]] > 0) {
      // 연속: 돌진이 적을 맞히면 가르기가 바로 준비된다(돌진당 한 번)
      cutCd(w, 'cleave', Infinity);
      w.combos.push({ id: w.nextItem++, x: hero.x, z: hero.z, kind: 'reset', age: 0 });
    }
    w.dashHit.push(e.id);
    hit.push(e);
    skillHit(w, e, Math.round(roll(w, hero) * dashStat(w).mult));
    if (e.hp <= 0 && mastered(w, 'dash')) cutCd(w, 'dash', Infinity); // 5단계: 처치하면 다시 돌진
    const side = (e.x - hero.x) * -hero.dz + (e.z - hero.z) * hero.dx < 0 ? -1 : 1; // 돌진 길의 어느 쪽에 있는가
    knock(w, e, -hero.dz * side, hero.dx * side, KNOCK.dash);
  }
  if (hit.length) temper(w, hero, hit, first);
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

// 전투의 함성: 반경 안 살아 있는 적을 기절(하던 휘두르기·예고·돌진도 끊김)·밀어냄, 주인공은 잠시 받는 피해 감소
export function shout(w: World, hero: Entity): number {
  const st = shoutStat(w);
  for (const e of w.entities) {
    if (e === hero || e.state === 'dead' || dist(e, hero) > st.radius) continue;
    stun(e, st.stun);
    const d = dist(e, hero);
    knock(w, e, d > 1e-6 ? (e.x - hero.x) / d : 1, d > 1e-6 ? (e.z - hero.z) / d : 0, KNOCK.shout);
  }
  w.shoutT = SHOUT.time;
  if (mastered(w, 'shout')) hero.hp = Math.min(hero.maxHp, hero.hp + Math.round(heroMax(w) * SHOUT.heal)); // 5단계: 회복
  w.shouts++;
  return st.cd;
}

// 공포에 질린 적의 한 틱: 주인공 반대쪽으로 걷는다. 막히면 옆으로, 그것도 막히면(구석) 서서 떤다
export function scare(w: World, e: Entity, hero: Entity) {
  const d = dist(e, hero) || 1;
  const [ux, uz] = [(e.x - hero.x) / d, (e.z - hero.z) / d];
  const s = (e.skin === 'treasure' ? TREASURE.speed : STATS[e.kind].speed) * DT; // 보물 고블린은 빨리 도망친다
  e.state = 'idle';
  for (const [dx, dz] of [[ux, uz], [-uz, ux], [uz, -ux]]) {
    if (!walkable(w.grid, Math.floor(e.x + dx * 0.5), Math.floor(e.z + dz * 0.5))) continue;
    Object.assign(e, { x: e.x + dx * s, z: e.z + dz * s, facing: Math.atan2(dx, dz), state: 'move' });
    return;
  }
}

// 불 한 틱(불길·불바다·잔불·운석·불화살): TRAIL.tick마다 선분(점)에서 r 안의 적에게 굴림 × mult. 시간이 다 되면 꺼진다
export function tickFires(w: World, hero: Entity) {
  w.fires = w.fires.filter((f) => {
    if ((f.acc += DT) >= TRAIL.tick - 1e-9) {
      f.acc = 0;
      const [sx, sz] = [f.x1 - f.x0, f.z1 - f.z0];
      const len2 = sx * sx + sz * sz;
      for (const e of w.entities) {
        if (e === hero || e.state === 'dead') continue;
        const k = len2 > 1e-9 ? Math.min(1, Math.max(0, ((e.x - f.x0) * sx + (e.z - f.z0) * sz) / len2)) : 0; // 선분 위 가장 가까운 점
        if (Math.hypot(e.x - f.x0 - sx * k, e.z - f.z0 - sz * k) <= f.r) hurt(w, e, Math.round(roll(w, hero) * f.mult), hero);
      }
    }
    return (f.t -= DT) > 0;
  });
}

// 도끼 던지기(5단계는 관통)·튕기는 도끼: 조준점(없으면 가까운 적·닫힌 문, 그것도 없으면 바라보는 방향)으로. 주인공은 하던 일을 계속한다
export function throwAxe(w: World, hero: Entity, x?: number, z?: number): number {
  const st = axeStat(w);
  hurl(w, hero, Math.round(roll(w, hero) * st.mult), { through: mastered(w, 'throw') }, x, z);
  return st.cd;
}
export function bounceAxe(w: World, hero: Entity, x?: number, z?: number): number {
  const st = bounceStat(w);
  hurl(w, hero, Math.round(roll(w, hero) * st.mult), { bounce: st.count }, x, z);
  return st.cd;
}

function hurl(w: World, hero: Entity, dmg: number, more: Partial<Shot>, x?: number, z?: number) {
  // 자동 조준: 가까운 적, 또는 바로 앞의 닫힌 문 중 더 가까운 쪽
  const doors = w.gates.filter((g) => !g.open).map((g) => ({ x: g.x + 0.5, z: g.z + 0.5 }));
  const near = [...w.entities.filter((e) => e !== hero && e.state !== 'dead' && dist(e, hero) <= AXE.aim), ...doors.filter((g) => Math.hypot(g.x - hero.x, g.z - hero.z) <= AXE.gate)]
    .sort((a, b) => Math.hypot(a.x - hero.x, a.z - hero.z) - Math.hypot(b.x - hero.x, b.z - hero.z))[0];
  let [dx, dz] = [Math.sin(hero.facing), Math.cos(hero.facing)];
  const [tx, tz] = x !== undefined && z !== undefined ? [x, z] : near ? [near.x, near.z] : [hero.x + dx, hero.z + dz];
  const d = Math.hypot(tx - hero.x, tz - hero.z);
  if (d > 1e-6) [dx, dz] = [(tx - hero.x) / d, (tz - hero.z) / d];
  hero.facing = Math.atan2(dx, dz);
  w.shots.push({ id: w.nextItem++, x: hero.x, z: hero.z, dx, dz, dmg, left: AXE.flight, kind: 'axe', ...more });
}

// 그 칸의 닫힌 문과, 거기에 붙어 있는(4방향) 닫힌 문들을 연다: 칸이 뚫리고 먼지가 인다
export function openGate(w: World, x: number, z: number) {
  const first = w.gates.find((g) => !g.open && g.x === x && g.z === z);
  const queue = first ? [first] : [];
  for (const g of queue) {
    if (g.open) continue;
    g.open = true;
    w.grid.blocked[g.z * w.grid.w + g.x] = 0;
    w.blasts.push({ id: w.nextItem++, x: g.x + 0.5, z: g.z + 0.5, age: 0, kind: 'slam' });
    queue.push(...w.gates.filter((o) => !o.open && Math.abs(o.x - g.x) + Math.abs(o.z - g.z) === 1));
  }
}

// 비행: 화살은 벽·비행 끝에서 사라지고 주인공에 닿으면 피해. 화염구(몬스터)는 그 모든 경우에 그 자리에서 폭발.
// 마법사의 마력탄·화염구는 wizard.ts(화염구는 벽·비행 끝에서도 폭발), 궁수의 화살은 ranger.ts.
// 도끼(주인공)는 처음 닿는 살아 있는 몬스터에게 피해(through면 관통, bounce면 튕김)
export function fly(w: World, hero: Entity) {
  w.shots = w.shots.filter((s) => {
    if (s.wait) {
      // 뒤따르는 화살(관통 사격 5단계): 기다리는 동안 주인공 자리에 있다
      s.wait = Math.max(0, s.wait - DT);
      [s.x, s.z] = [hero.x, hero.z];
      return true;
    }
    if (s.kind === 'hook') return hookFly(w, hero, s);
    const fire = s.kind === 'fire';
    const speed = { fire: MAGE.speed, axe: AXE.speed, arrow: ARCHER.speed, bolt: WIZ.speed, fireball: FIREBALL.speed, shaft: RANGER.speed, pierce: PIERCE.speed }[s.kind];
    const step = speed * DT;
    const [nx, nz] = [s.x + s.dx * step, s.z + s.dz * step];
    s.left -= step;
    const wall = !seeThrough(w.grid, Math.floor(nx), Math.floor(nz)); // 물 위는 날아간다
    if (wall || s.left <= 0) {
      if (fire) explode(w, s.x, s.z, s.dmg); // 벽 앞(마지막으로 있던 자리)에서
      if (s.kind === 'axe' || s.kind === 'fireball' || s.kind === 'bolt' || s.kind === 'shaft' || s.kind === 'pierce') openGate(w, Math.floor(nx), Math.floor(nz)); // 도끼·마법이 사슬 문에 맞으면 열린다
      if (s.kind === 'fireball') fireBurst(w, hero, s.x, s.z, s.dmg, s.small, s.scale);
      if (s.kind === 'axe' && !s.back && boomerang(w, s)) {
        // 돌아오는 도끼날: 주인공에게 되돌아온다(맞힌 적도 다시 맞는다)
        const d = Math.hypot(hero.x - s.x, hero.z - s.z) || 1;
        return !!Object.assign(s, { back: true, dx: (hero.x - s.x) / d, dz: (hero.z - s.z) / d, left: d, hit: [] });
      }
      if (s.kind === 'pierce' && wall && !s.ricochet && hasUnique(w, 'hawkHood')) {
        // 매의 눈 두건: 막힌 축의 방향을 뒤집어 한 번 튕긴다(모서리면 둘 다)
        const bx = !seeThrough(w.grid, Math.floor(nx), Math.floor(s.z));
        const bz = !seeThrough(w.grid, Math.floor(s.x), Math.floor(nz));
        return !!Object.assign(s, { ricochet: true, hit: [], dx: bx || !bz ? -s.dx : s.dx, dz: bz || !bx ? -s.dz : s.dz, left: Math.max(s.left, PIERCE.flight / 2) });
      }
      return false;
    }
    [s.x, s.z] = [nx, nz];
    if (s.kind === 'bolt' || s.kind === 'fireball') return magicHit(w, hero, s); // 마법사
    if (s.kind === 'shaft' || s.kind === 'pierce') return arrowHit(w, hero, s); // 궁수
    if (s.kind === 'axe') {
      const hit = (s.hit ??= []);
      const t = w.entities.find((e) => e !== hero && e.state !== 'dead' && !hit.includes(e.id) && Math.hypot(e.x - s.x, e.z - s.z) <= AXE.hit);
      if (t) {
        hit.push(t.id);
        skillHit(w, t, s.dmg);
        knock(w, t, s.dx, s.dz, KNOCK.axe);
        if (s.bounce !== undefined) {
          // 튕김: 아직 안 맞은 가까운 적(시야가 트인)에게로 방향을 바꾼다. 없거나 횟수를 다 쓰면 사라진다
          const next = w.entities
            .filter((e) => e !== hero && e.state !== 'dead' && !hit.includes(e.id) && dist(e, t) <= BOUNCE.range && clearLine(w, t, e))
            .sort((a, b) => dist(a, t) - dist(b, t))[0];
          if (!s.bounce || !next) return false;
          const d = dist(next, t) || 1;
          Object.assign(s, { bounce: s.bounce - 1, x: t.x, z: t.z, dx: (next.x - t.x) / d, dz: (next.z - t.z) / d, left: AXE.flight });
          return true;
        }
      }
      return !t || !!s.through || boomerang(w, s); // 관통(맞힌 적은 다시 안 맞는다). 돌아오는 도끼날도 꿰뚫는다
    }
    const v = friends(w).find((e) => Math.hypot(s.x - e.x, s.z - e.z) <= (fire ? MAGE.hitRadius : ARCHER.hitRadius)); // 해골 병사도 맞는다
    if (!v) return true;
    if (fire) explode(w, s.x, s.z, s.dmg);
    else hurt(w, v, s.dmg);
    return false;
  });
}

// 돌아오는 도끼날을 쥐었고, 튕기는 도끼가 아니다
const boomerang = (w: World, s: Shot) => s.bounce === undefined && hasUnique(w, 'boomerang');

// 화염구 폭발: 반경 안의 살아 있는 주인공·해골 병사에게 피해(직격과 겹쳐도 한 번), 기록을 남긴다
export function explode(w: World, x: number, z: number, dmg: number, kind: 'fire' | 'ice' = 'fire') {
  w.blasts.push({ id: w.nextItem++, x, z, age: 0, kind });
  for (const e of friends(w)) if (Math.hypot(e.x - x, e.z - z) <= MAGE.blast) hurt(w, e, dmg);
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
export function tickZones(w: World) {
  w.zones = w.zones.filter((z) => {
    const owner = z.owner < 0 ? null : w.entities[z.owner];
    if (owner && (owner.state === 'dead' || owner.phase !== 'windup')) return false;
    if ((z.t -= DT) > 0) return true;
    if (z.kind === 'warn') return false;
    if (!owner) z.kind === 'sword' ? landSword(w, z) : explode(w, z.x, z.z, z.dmg, z.kind);
    else {
      owner.phase = 'none';
      w.blasts.push({ id: w.nextItem++, x: z.x, z: z.z, age: 0, kind: 'slam' });
      for (const e of friends(w)) if (Math.hypot(e.x - z.x, e.z - z.z) <= z.r) hurt(w, e, z.dmg, owner);
    }
    return false;
  });
}
