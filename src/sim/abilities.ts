// 특수 행동: 주인공 스킬(가르기·돌진 베기), 보스 돌진, 해골 왕 소환, 마법사 물러나기, 화살·화염구.
import { findPath, walkable, type Cell } from './path';
import { ARCHER, AXE, BOUNCE, BURST, CHARGE, DASH, DT, FEAR, FIREBALL, KING, KNOCK, MAGE, METEOR, PIERCE, RANGER, PULL, REPATH, ROLL, SHOUT, SKEWER, SKILL, SLAM, STATS, STUCK, TRAIL, WHIRL, WIZ, type Entity, type Shot, type World } from './rules';
import { fireBurst, magicHit } from './wizard';
import { arrowHit } from './ranger';
import { axeStat, canHit, cellOf, cleaveStat, clearLine, dashStat, dist, face, heroMax, hurt, knock, makeEntity, mastered, roll, shoutStat, skillHit, walk, waypoints } from './core';

// 가르기 시작: 조준점(없으면 가까운 적, 그것도 없으면 지금 방향)을 보고 휘두르기. 이동·계단 의도는 멈춘다
export function cleaveStart(w: World, hero: Entity, x?: number, z?: number) {
  if (w.skillCd > 0) return;
  if (w.traits.cleave === 1) {
    // 회오리: 휘두르지 않고 돈다. 걷던 길·공격 대상은 그대로(돌면서 따라간다)
    Object.assign(w, { skillCd: cleaveStat(w).cd, spinT: WHIRL.time + (mastered(w, 'cleave') ? WHIRL.extra : 0), spinAcc: WHIRL.tick });
    if (hero.state === 'attack') Object.assign(hero, { state: 'idle', attackT: 0, skill: false });
    return;
  }
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
  const killed: Entity[] = [];
  for (const e of w.entities) {
    if (e === hero || e.state === 'dead') continue;
    const dx = e.x - hero.x;
    const dz = e.z - hero.z;
    const st = cleaveStat(w);
    if (Math.hypot(dx, dz) > st.radius || (!mastered(w, 'cleave') && dx * fx + dz * fz < 0) || !clearLine(w, hero, e)) continue; // 5단계는 한 바퀴
    skillHit(w, e, Math.round(roll(w, hero) * st.mult));
    const d = Math.hypot(dx, dz);
    knock(w, e, d > 1e-6 ? dx / d : fx, d > 1e-6 ? dz / d : fz, KNOCK.cleave);
    if (e.hp <= 0) killed.push(e);
  }
  if (w.traits.cleave === 2) burst(w, hero, killed);
  w.cleaves++;
}

// 회오리 한 틱: WHIRL.tick마다 가르기 범위 한 바퀴의 적을 벤다(밀어내지 않는다 — 계속 붙어서 갈린다)
export function spin(w: World, hero: Entity) {
  w.spinT = Math.max(0, w.spinT - DT);
  if ((w.spinAcc += DT) < WHIRL.tick - 1e-9) return;
  w.spinAcc = 0;
  const st = cleaveStat(w);
  for (const e of w.entities) {
    if (e === hero || e.state === 'dead' || dist(e, hero) > st.radius || !clearLine(w, hero, e)) continue;
    skillHit(w, e, Math.round(roll(w, hero) * st.mult * WHIRL.mult));
  }
  w.cleaves++;
}

// 시체 폭발: 죽은 적마다 그 자리에서 터져 주변 적에게 최대 체력에 비례한 피해. 터져서 죽은 적도 줄에 넣어 이어서 터진다
function burst(w: World, hero: Entity, dead: Entity[]) {
  for (let i = 0; i < dead.length; i++) {
    const c = dead[i];
    w.blasts.push({ id: w.nextItem++, x: c.x, z: c.z, age: 0, kind: 'fire' });
    for (const e of w.entities) {
      if (e === hero || e.state === 'dead' || Math.hypot(e.x - c.x, e.z - c.z) > BURST.radius) continue;
      hurt(w, e, Math.round(c.maxHp * BURST.hp), hero);
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
  if (w.traits.dash === 2) w.fires.push({ id: w.nextItem++, x0: hero.x, z0: hero.z, x1: hero.x, z1: hero.z, t: TRAIL.time, acc: 0 }); // 불길: 돌진하며 늘어난다
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
// 꼬치(특성 1): 맞은 적을 주인공 앞에 꿰어 끌고 가고, 벽에서 멈추면 박아서 기절 + 추가 피해. 보스·해골 왕은 끌려가지 않는다
export function dashStep(w: World, hero: Entity) {
  const skewer = w.traits.dash === 1;
  const step = DASH.speed * DT;
  const wall = hero.phaseT > 0 && !walkable(w.grid, Math.floor(hero.x + hero.dx * step), Math.floor(hero.z + hero.dz * step));
  const going = rush(w, hero, DASH.speed);
  const trail = w.traits.dash === 2 && w.fires.at(-1);
  if (trail) [trail.x1, trail.z1] = [hero.x, hero.z];
  const held = skewer ? w.dashHit.map((id) => w.entities[id]).filter((e) => e.state !== 'dead' && e.kind !== 'boss' && e.kind !== 'king') : [];
  if (!going) {
    if (!wall) return;
    for (const e of held) {
      e.stunT = Math.max(e.stunT, SKEWER.stun); // 먼저 기절 → 박는 피해에 약점 배율이 붙는다
      w.blasts.push({ id: w.nextItem++, x: e.x, z: e.z, age: 0, kind: 'slam' });
      skillHit(w, e, Math.round(roll(w, hero) * dashStat(w).mult * SKEWER.mult));
      if (e.hp <= 0 && mastered(w, 'dash')) w.dashCd = 0;
    }
    return;
  }
  for (const e of held) {
    const [cx, cz] = [hero.x + hero.dx * SKEWER.hold, hero.z + hero.dz * SKEWER.hold];
    if (walkable(w.grid, Math.floor(cx), Math.floor(cz))) [e.x, e.z] = [cx, cz];
    Object.assign(e, { stunT: Math.max(e.stunT, 0.1), state: 'idle', attackT: 0, path: [], phase: 'none' }); // 꿰인 동안은 아무것도 못 한다
  }
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
    if (skewer) knock(w, e, hero.dx, hero.dz, 0); // 옆으로 밀지 않고 꿴다(타격감·끊기만)
    else knock(w, e, -hero.dz * side, hero.dx * side, KNOCK.dash);
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
    const big = e.kind === 'boss' || e.kind === 'king'; // 보스·해골 왕은 겁먹지도 끌려오지도 않는다(기절만)
    Object.assign(e, { state: 'idle', attackT: 0, path: [], phase: 'none' }, w.traits.shout === 2 && !big ? { fearT: FEAR.time } : { stunT: st.stun });
    const d = dist(e, hero);
    const [ux, uz] = d > 1e-6 ? [(e.x - hero.x) / d, (e.z - hero.z) / d] : [1, 0];
    if (w.traits.shout === 1) knock(w, e, -ux, -uz, Math.max(0, d - PULL.to)); // 끌어당김
    else knock(w, e, ux, uz, KNOCK.shout);
  }
  Object.assign(w, { shoutCd: st.cd, shoutT: SHOUT.time });
  if (mastered(w, 'shout')) hero.hp = Math.min(hero.maxHp, hero.hp + Math.round(heroMax(w) * SHOUT.heal)); // 5단계: 회복
  w.shouts++;
}

// 공포에 질린 적의 한 틱: 주인공 반대쪽으로 걷는다. 막히면 옆으로, 그것도 막히면(구석) 서서 떤다
export function scare(w: World, e: Entity, hero: Entity) {
  const d = dist(e, hero) || 1;
  const [ux, uz] = [(e.x - hero.x) / d, (e.z - hero.z) / d];
  const s = STATS[e.kind].speed * DT;
  e.state = 'idle';
  for (const [dx, dz] of [[ux, uz], [-uz, ux], [uz, -ux]]) {
    if (!walkable(w.grid, Math.floor(e.x + dx * 0.5), Math.floor(e.z + dz * 0.5))) continue;
    Object.assign(e, { x: e.x + dx * s, z: e.z + dz * s, facing: Math.atan2(dx, dz), state: 'move' });
    return;
  }
}

// 불길 한 틱: TRAIL.tick마다 길(선분)에서 TRAIL.width 안의 적에게 피해. 시간이 다 되면 꺼진다
export function tickFires(w: World, hero: Entity) {
  w.fires = w.fires.filter((f) => {
    if ((f.acc += DT) >= TRAIL.tick - 1e-9) {
      f.acc = 0;
      const [sx, sz] = [f.x1 - f.x0, f.z1 - f.z0];
      const len2 = sx * sx + sz * sz;
      for (const e of w.entities) {
        if (e === hero || e.state === 'dead') continue;
        const k = len2 > 1e-9 ? Math.min(1, Math.max(0, ((e.x - f.x0) * sx + (e.z - f.z0) * sz) / len2)) : 0; // 선분 위 가장 가까운 점
        if (Math.hypot(e.x - f.x0 - sx * k, e.z - f.z0 - sz * k) <= TRAIL.width) hurt(w, e, Math.round(roll(w, hero) * TRAIL.mult), hero);
      }
    }
    return (f.t -= DT) > 0;
  });
}

// 박힌 도끼 뽑기: 박힌 적 앞으로 순간이동(주인공 쪽 STUCK.gap, 막혔으면 적의 자리)해 뽑으며 주변을 터뜨린다
function recall(w: World, hero: Entity, axe: Shot) {
  const t = w.entities[axe.stuck!];
  w.shots = w.shots.filter((s) => s !== axe);
  const d = dist(hero, t) || 1;
  const [x, z] = [t.x + ((hero.x - t.x) / d) * STUCK.gap, t.z + ((hero.z - t.z) / d) * STUCK.gap];
  [hero.x, hero.z] = walkable(w.grid, Math.floor(x), Math.floor(z)) ? [x, z] : [t.x, t.z];
  Object.assign(hero, { path: [], state: 'idle', attackT: 0, skill: false, target: t.id, repathT: 0 });
  face(hero, t);
  Object.assign(w, { opening: null, toStairs: false });
  w.blasts.push({ id: w.nextItem++, x: t.x, z: t.z, age: 0, kind: 'fire' });
  for (const e of w.entities) {
    if (e === hero || e.state === 'dead' || dist(e, t) > STUCK.radius) continue;
    skillHit(w, e, Math.round(roll(w, hero) * axeStat(w).mult * STUCK.mult));
    const k = dist(e, t);
    if (e !== t && k > 1e-6) knock(w, e, (e.x - t.x) / k, (e.z - t.z) / k, KNOCK.axe);
  }
  w.dashes++; // 순간이동 소리
}

// 도끼 던지기: 조준점(없으면 가까운 적, 그것도 없으면 바라보는 방향)으로. 주인공은 하던 일을 계속한다.
// 박힌 도끼(특성 2)가 있으면 던지지 않고 뽑으러 간다(재사용 대기와 무관)
export function throwAxe(w: World, hero: Entity, x?: number, z?: number) {
  const stuck = w.shots.find((s) => s.stuck !== undefined);
  if (stuck) return recall(w, hero, stuck);
  if (w.throwCd > 0) return;
  // 자동 조준: 가까운 적, 또는 바로 앞의 닫힌 문 중 더 가까운 쪽
  const doors = w.gates.filter((g) => !g.open).map((g) => ({ x: g.x + 0.5, z: g.z + 0.5 }));
  const near = [...w.entities.filter((e) => e !== hero && e.state !== 'dead' && dist(e, hero) <= AXE.aim), ...doors.filter((g) => Math.hypot(g.x - hero.x, g.z - hero.z) <= AXE.gate)]
    .sort((a, b) => Math.hypot(a.x - hero.x, a.z - hero.z) - Math.hypot(b.x - hero.x, b.z - hero.z))[0];
  let [dx, dz] = [Math.sin(hero.facing), Math.cos(hero.facing)];
  const [tx, tz] = x !== undefined && z !== undefined ? [x, z] : near ? [near.x, near.z] : [hero.x + dx, hero.z + dz];
  const d = Math.hypot(tx - hero.x, tz - hero.z);
  if (d > 1e-6) [dx, dz] = [(tx - hero.x) / d, (tz - hero.z) / d];
  hero.facing = Math.atan2(dx, dz);
  w.shots.push({ id: w.nextItem++, x: hero.x, z: hero.z, dx, dz, dmg: Math.round(roll(w, hero) * axeStat(w).mult), left: AXE.flight, kind: 'axe' });
  w.throwCd = axeStat(w).cd;
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
// 도끼(주인공)는 처음 닿는 살아 있는 몬스터에게 피해(5단계는 관통)
export function fly(w: World, hero: Entity) {
  const added: Shot[] = [];
  w.shots = w.shots.filter((s) => {
    if (s.stuck !== undefined) {
      // 박힌 도끼: 적을 따라다니다가 그 적이 죽으면 사라진다
      const t = w.entities[s.stuck];
      [s.x, s.z] = [t.x, t.z];
      return t.state !== 'dead';
    }
    if (s.wait) {
      // 뒤따르는 화살(관통 사격 5단계): 기다리는 동안 주인공 자리에 있다
      s.wait = Math.max(0, s.wait - DT);
      [s.x, s.z] = [hero.x, hero.z];
      return true;
    }
    const fire = s.kind === 'fire';
    const speed = { fire: MAGE.speed, axe: AXE.speed, arrow: ARCHER.speed, bolt: WIZ.speed, fireball: FIREBALL.speed, shaft: RANGER.speed, pierce: PIERCE.speed }[s.kind];
    const step = speed * DT;
    const [nx, nz] = [s.x + s.dx * step, s.z + s.dz * step];
    s.left -= step;
    if (!walkable(w.grid, Math.floor(nx), Math.floor(nz)) || s.left <= 0) {
      if (fire) explode(w, hero, s.x, s.z, s.dmg); // 벽 앞(마지막으로 있던 자리)에서
      if (s.kind === 'axe' || s.kind === 'fireball' || s.kind === 'bolt' || s.kind === 'shaft' || s.kind === 'pierce') openGate(w, Math.floor(nx), Math.floor(nz)); // 도끼·마법이 사슬 문에 맞으면 열린다
      if (s.kind === 'fireball') fireBurst(w, hero, s.x, s.z, s.dmg);
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
        if (w.traits.throw === 1) {
          // 튕김: 아직 안 맞은 가까운 적(시야가 트인)에게로 방향을 바꾼다. 없거나 횟수를 다 쓰면 사라진다
          const left = s.bounce ?? BOUNCE.count * (mastered(w, 'throw') ? 2 : 1);
          const next = w.entities
            .filter((e) => e !== hero && e.state !== 'dead' && !hit.includes(e.id) && dist(e, t) <= BOUNCE.range && clearLine(w, t, e))
            .sort((a, b) => dist(a, t) - dist(b, t))[0];
          if (!left || !next) return false;
          const d = dist(next, t) || 1;
          Object.assign(s, { bounce: left - 1, x: t.x, z: t.z, dx: (next.x - t.x) / d, dz: (next.z - t.z) / d, left: AXE.flight });
          return true;
        }
        // 박힘: 살아남은 적에게 하나만 박힌다
        if (w.traits.throw === 2 && t.hp > 0 && ![...w.shots, ...added].some((o) => o.stuck !== undefined)) added.push({ ...s, id: w.nextItem++, x: t.x, z: t.z, stuck: t.id });
      }
      return !t || mastered(w, 'throw'); // 5단계: 관통(맞힌 적은 다시 안 맞는다)
    }
    if (hero.state === 'dead' || Math.hypot(s.x - hero.x, s.z - hero.z) > (fire ? MAGE.hitRadius : ARCHER.hitRadius)) return true;
    if (fire) explode(w, hero, s.x, s.z, s.dmg);
    else hurt(w, hero, s.dmg);
    return false;
  });
  w.shots.push(...added);
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
