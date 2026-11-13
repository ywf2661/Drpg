// 마법사 스킬: 마력탄(평타), 화염구(Q), 서리 고리(W), 낙뢰(E), 마나 방패(R), 순간이동(스페이스).
// 스킬 칸·명령·재사용 필드(skillCd·dashCd·shoutCd·throwCd·rollCd)·단계·특성은 기사와 같은 것을 쓴다(rules의 HeroClass 설명)
import { walkable } from './path';
import { BLINK, BOLT, DT, FIREBALL, FROST, KNOCK, ROLL, TRAIL, WARD, WIZ, type Entity, type Shot, type SkillName, type World } from './rules';
import { clearLine, dist, heroMax, hurt, knock, mastered, roll, skillHit } from './core';

// 스킬 단계별 수치(1단계 = 기본값). 특성·5단계가 바꾸는 수치도 여기서
const extra = (w: World, s: SkillName) => w.ranks[s] - 1;
export const fireStat = (w: World) => ({ cd: FIREBALL.cd - 0.3 * extra(w, 'cleave'), radius: FIREBALL.radius + 0.15 * extra(w, 'cleave'), mult: FIREBALL.mult + 0.25 * extra(w, 'cleave') });
export const frostStat = (w: World) => ({
  cd: FROST.cd - 0.5 * extra(w, 'dash'),
  radius: FROST.radius + 0.25 * extra(w, 'dash'),
  freeze: (FROST.freeze + 0.25 * extra(w, 'dash')) * (w.traits.dash === 1 ? FROST.prison : 1), // 얼음 감옥
  mult: FROST.mult + 0.15 * extra(w, 'dash'),
});
export function boltStat(w: World) {
  const wide = w.traits.shout === 2 ? BOLT.wide : 1; // 천둥: 넓고 약하게
  const big = mastered(w, 'shout'); // 5단계: 범위 ×1.3, 기절 ×2
  return {
    cd: BOLT.cd - 0.4 * extra(w, 'shout'),
    radius: (BOLT.radius + 0.1 * extra(w, 'shout')) * wide * (big ? 1.3 : 1),
    mult: (BOLT.mult + 0.3 * extra(w, 'shout')) * (wide > 1 ? BOLT.wideMult : 1),
    stun: (BOLT.stun + 0.1 * extra(w, 'shout')) * (big ? 2 : 1),
  };
}
export const wardStat = (w: World) => ({ cd: WARD.cd - extra(w, 'throw'), absorb: WARD.absorb + 0.05 * extra(w, 'throw') });

const foes = (w: World, hero: Entity) => w.entities.filter((e) => e !== hero && e.state !== 'dead');
const nearest = (w: World, hero: Entity, r: number) =>
  foes(w, hero)
    .filter((e) => dist(e, hero) <= r)
    .sort((a, b) => dist(a, hero) - dist(b, hero))[0];
const blast = (w: World, kind: 'fire' | 'thunder' | 'spark' | 'frost' | 'ice' | 'blink' | 'heal' | 'nova', x: number, z: number, r?: number) => w.blasts.push({ id: w.nextItem++, x, z, r, age: 0, kind });
// 스킬에 맞은 적: 하던 휘두르기·이동·예고를 끊고 t초 기절(얼음·벼락)
const stun = (e: Entity, t: number) => e.state !== 'dead' && Object.assign(e, { state: 'idle', attackT: 0, path: [], phase: 'none', stunT: Math.max(e.stunT, t) });

// 조준 방향(단위 벡터): 조준점 → 가까운 적(range 안) → 바라보는 방향
function aimDir(w: World, hero: Entity, range: number, x?: number, z?: number): [number, number] {
  const near = nearest(w, hero, range);
  const [tx, tz] = x !== undefined && z !== undefined ? [x, z] : near ? [near.x, near.z] : [hero.x + Math.sin(hero.facing), hero.z + Math.cos(hero.facing)];
  const d = Math.hypot(tx - hero.x, tz - hero.z);
  return d > 1e-6 ? [(tx - hero.x) / d, (tz - hero.z) / d] : [Math.sin(hero.facing), Math.cos(hero.facing)];
}

// 마력탄: 평타가 맞는 순간(swing) 대상 쪽으로 쏜다
export function bolt(w: World, hero: Entity, t: Entity) {
  const d = dist(hero, t) || 1;
  w.shots.push({ id: w.nextItem++, x: hero.x, z: hero.z, dx: (t.x - hero.x) / d, dz: (t.z - hero.z) / d, dmg: roll(w, hero), left: WIZ.flight, kind: 'bolt' });
}

// 화염구: 조준 방향으로 날린다(5단계는 세 갈래). 하던 평타·이동은 계속한다
export function fireball(w: World, hero: Entity, x?: number, z?: number) {
  if (w.skillCd > 0) return;
  const [dx, dz] = aimDir(w, hero, FIREBALL.aim, x, z);
  hero.facing = Math.atan2(dx, dz);
  const st = fireStat(w);
  for (const a of mastered(w, 'cleave') ? [-FIREBALL.spread, 0, FIREBALL.spread] : [0]) {
    const [c, s] = [Math.cos(a), Math.sin(a)];
    w.shots.push({ id: w.nextItem++, x: hero.x, z: hero.z, dx: dx * c + dz * s, dz: dz * c - dx * s, dmg: Math.round(roll(w, hero) * st.mult), left: FIREBALL.flight, kind: 'fireball' });
  }
  w.casts++;
  w.skillCd = st.cd;
}

// 화염구 폭발: 반경 안 적 모두 피해·밀어냄. 불바다(특성 1)면 그 자리가 잠시 불탄다
export function fireBurst(w: World, hero: Entity, x: number, z: number, dmg: number) {
  blast(w, 'fire', x, z);
  const r = fireStat(w).radius;
  for (const e of foes(w, hero)) {
    const d = Math.hypot(e.x - x, e.z - z);
    if (d > r) continue;
    skillHit(w, e, dmg);
    knock(w, e, d > 1e-6 ? (e.x - x) / d : 0, d > 1e-6 ? (e.z - z) / d : 0, KNOCK.axe);
  }
  if (w.traits.cleave === 1) w.fires.push({ id: w.nextItem++, x0: x, z0: z, x1: x, z1: z, t: TRAIL.time, acc: 0 });
}

// 비행 중인 마력탄·화염구(fly가 부른다): 처음 닿는 몬스터에게 마력탄은 피해, 화염구는 폭발. 계속 날아가면 true.
// 관통 화염구(특성 2)는 맞은 적마다 터지며 지나간다
export function magicHit(w: World, hero: Entity, s: Shot): boolean {
  const r = s.kind === 'bolt' ? WIZ.hit : FIREBALL.hit;
  const hit = (s.hit ??= []);
  const t = foes(w, hero).find((e) => !hit.includes(e.id) && Math.hypot(e.x - s.x, e.z - s.z) <= r);
  if (!t) return true;
  if (s.kind === 'bolt') {
    hurt(w, t, s.dmg, hero);
    return false;
  }
  hit.push(t.id);
  fireBurst(w, hero, s.x, s.z, s.dmg);
  return w.traits.cleave === 2;
}

// 서리 고리: 반경 안 적에게 피해 후 얼린다(기절 → 약점 연계). 5단계는 반경 안의 적 투사체도 지운다, 서리 갑옷(특성 2)은 받는 피해 감소
export function frost(w: World, hero: Entity) {
  if (w.dashCd > 0) return;
  const st = frostStat(w);
  blast(w, 'frost', hero.x, hero.z, st.radius); // 반경만큼 얼음 장판(렌더)
  for (const e of foes(w, hero)) {
    if (dist(e, hero) > st.radius) continue;
    skillHit(w, e, Math.round(roll(w, hero) * st.mult));
    if (stun(e, st.freeze)) blast(w, 'ice', e.x, e.z);
  }
  if (mastered(w, 'dash')) w.shots = w.shots.filter((s) => s.kind === 'axe' || s.kind === 'bolt' || s.kind === 'fireball' || Math.hypot(s.x - hero.x, s.z - hero.z) > st.radius);
  if (w.traits.dash === 2) w.shoutT = FROST.armorTime;
  w.casts++;
  w.dashCd = st.cd;
}

// 낙뢰: 조준점(사거리 BOLT.range까지로 당김), 없으면 가까운 적에게 벼락. 반경 안 적 피해 + 기절.
// 조준점도 적도 없으면 쓰지 않는다. 연쇄 번개(특성 1): 맞은 적에서 가까운 적으로 BOLT.chain번 튄다
export function lightning(w: World, hero: Entity, x?: number, z?: number) {
  if (w.shoutCd > 0) return;
  let [tx, tz] = [x, z];
  if (tx === undefined || tz === undefined) {
    const t = nearest(w, hero, BOLT.range);
    if (!t) return;
    [tx, tz] = [t.x, t.z];
  }
  const d = Math.hypot(tx - hero.x, tz - hero.z);
  if (d > BOLT.range) [tx, tz] = [hero.x + ((tx - hero.x) * BOLT.range) / d, hero.z + ((tz - hero.z) * BOLT.range) / d];
  if (d > 1e-6) hero.facing = Math.atan2(tx - hero.x, tz - hero.z);
  const st = boltStat(w);
  blast(w, 'thunder', tx, tz, st.radius);
  if (w.traits.shout === 2) {
    // 천둥: 범위 안 여러 곳에 벼락이 잇따라 떨어진다(피해는 첫 벼락에 한 번. 해바라기 씨 배열로 고르게, 벽 칸은 건너뜀)
    for (let k = 0; k < BOLT.storm; k++) {
      const a = k * 2.39996 + w.nextItem, r = st.radius * 0.85 * Math.sqrt((k + 0.6) / BOLT.storm);
      const [x, z] = [tx + Math.sin(a) * r, tz + Math.cos(a) * r];
      if (walkable(w.grid, Math.floor(x), Math.floor(z))) w.storm.push({ x, z, t: ((k + 1) / BOLT.storm) * BOLT.stormTime });
    }
  }
  const struck: Entity[] = [];
  for (const e of foes(w, hero)) {
    if (Math.hypot(e.x - tx, e.z - tz) > st.radius) continue;
    skillHit(w, e, Math.round(roll(w, hero) * st.mult));
    stun(e, st.stun);
    struck.push(e);
  }
  if (w.traits.shout === 1 && struck.length) {
    let from = struck[0];
    for (let k = 0; k < BOLT.chain; k++) {
      const next = foes(w, hero)
        .filter((e) => !struck.includes(e) && dist(e, from) <= BOLT.chainRange && clearLine(w, from, e))
        .sort((a, b) => dist(a, from) - dist(b, from))[0];
      if (!next) break;
      blast(w, 'spark', next.x, next.z);
      skillHit(w, next, Math.round(roll(w, hero) * st.mult * BOLT.chainMult));
      struck.push(next);
      from = next;
    }
  }
  w.casts++;
  w.shoutCd = st.cd;
}

// 마나 방패: 최대 체력 비율만큼 피해를 흡수(hurt가 깎는다). 치유(특성 1)는 방패 대신 즉시 회복. 5단계: 방패가 깨지면(치유는 쓸 때) 주변 폭발
export function ward(w: World, hero: Entity) {
  if (w.throwCd > 0) return;
  const st = wardStat(w);
  if (w.traits.throw === 1) {
    hero.hp = Math.min(hero.maxHp, hero.hp + Math.round(heroMax(w) * WARD.heal));
    blast(w, 'heal', hero.x, hero.z);
    if (mastered(w, 'throw')) nova(w, hero);
  } else Object.assign(w, { wardHp: Math.round(heroMax(w) * st.absorb), wardT: WARD.time, wardBroke: false });
  w.casts++;
  w.throwCd = st.cd;
}

function nova(w: World, hero: Entity) {
  blast(w, 'nova', hero.x, hero.z);
  for (const e of foes(w, hero)) {
    const d = dist(e, hero);
    if (d > WARD.nova) continue;
    skillHit(w, e, Math.round(roll(w, hero) * WARD.novaMult));
    knock(w, e, d > 1e-6 ? (e.x - hero.x) / d : 1, d > 1e-6 ? (e.z - hero.z) / d : 0, KNOCK.cleave);
  }
}

// 방패 한 틱: 깨졌으면(5단계) 폭발, 시간이 다 되면 사라진다
// 천둥의 뒤이은 벼락: 때가 되면 낙뢰 효과를 띄운다
export function tickStorm(w: World) {
  for (const s of w.storm) if ((s.t -= DT) <= 0) blast(w, 'thunder', s.x, s.z);
  w.storm = w.storm.filter((s) => s.t > 0);
}

export function tickWard(w: World, hero: Entity) {
  if (w.wardBroke) {
    w.wardBroke = false;
    if (mastered(w, 'throw') && hero.state !== 'dead') nova(w, hero);
  }
  if (w.wardT > 0 && (w.wardT = Math.max(0, w.wardT - DT)) === 0) w.wardHp = 0;
}

// 순간이동: 조준점 쪽으로 BLINK.dist까지(조준점이 더 가까우면 거기까지), 벽 앞에서 멈춘다. 조준이 없으면 가까운 적의 반대쪽.
// 도착 후 BLINK.guard초 무적(구르기와 같은 phase 'roll', 움직이지 않는다)
export function blink(w: World, hero: Entity, x?: number, z?: number) {
  if (w.rollCd > 0) return;
  const aimed = x !== undefined && z !== undefined;
  const near = nearest(w, hero, ROLL.away);
  const [tx, tz] = aimed ? [x, z] : near ? [2 * hero.x - near.x, 2 * hero.z - near.z] : [hero.x + Math.sin(hero.facing), hero.z + Math.cos(hero.facing)];
  const d = Math.hypot(tx - hero.x, tz - hero.z);
  const [dx, dz] = d > 1e-6 ? [(tx - hero.x) / d, (tz - hero.z) / d] : [Math.sin(hero.facing), Math.cos(hero.facing)];
  const max = aimed ? Math.min(BLINK.dist, d) : BLINK.dist;
  let k = 0;
  while (k + 0.1 <= max && walkable(w.grid, Math.floor(hero.x + dx * (k + 0.1)), Math.floor(hero.z + dz * (k + 0.1)))) k += 0.1;
  blast(w, 'blink', hero.x, hero.z);
  Object.assign(hero, { x: hero.x + dx * k, z: hero.z + dz * k, phase: 'roll', phaseT: BLINK.guard * ROLL.speed, dx: 0, dz: 0, state: 'idle', path: [], attackT: 0, skill: false, repathT: 0, facing: Math.atan2(dx, dz) });
  blast(w, 'blink', hero.x, hero.z);
  Object.assign(w, { rollCd: BLINK.cd, opening: null, toStairs: false });
}
