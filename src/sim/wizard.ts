// 마법사 스킬: 마력탄(평타), 화염(화염구·불바다·잔불·운석), 냉기(서리 고리·마나 방패·서리 갑옷·눈보라), 번개(낙뢰·연쇄 번개·정전기·천둥 폭풍), 순간이동(스페이스).
// 스킬은 쓰이면 재사용 대기(초)를, 쓰지 못했으면 0을 돌려준다(칸에 적는 것은 world의 cast). 조준·지점 도구(aimDir·spot·stun)는 다른 직업도 쓴다
import { walkable } from './path';
import { steady, LEGEND_FX, BLINK, BLIZZARD, BOLT, CHAIN, COMET, DT, EMBERS, FIREBALL, FIREFIELD, FROST, FROST_ARMOR, KNOCK, ROLL, STATIC, TEMPEST, WARD, WIZ, type Blast, type Entity, type Shot, type World } from './rules';
import { emberLine, hasUnique, clearLine, dist, ext, heroMax, hurt, knock, mastered, rank, roll, skillHit, syn } from './core';

// 스킬 단계별 수치(1단계 = 기본값). 5단계가 바꾸는 수치도 여기서. 피해 배율에는 시너지가 붙는다
export const fireStat = (w: World) => ({ cd: FIREBALL.cd - 0.3 * ext(w, 'fireball'), radius: FIREBALL.radius + 0.15 * ext(w, 'fireball'), mult: (FIREBALL.mult + 0.25 * ext(w, 'fireball')) * syn(w, 'fireball') });
export const firefieldStat = (w: World) => ({ cd: FIREFIELD.cd - 0.4 * ext(w, 'firefield'), radius: FIREFIELD.radius + 0.1 * ext(w, 'firefield'), mult: (FIREFIELD.mult + 0.07 * ext(w, 'firefield')) * syn(w, 'firefield') });
export const embersStat = (w: World) => ({ time: EMBERS.time + 0.5 * ext(w, 'embers'), mult: EMBERS.mult * (1 + 0.2 * ext(w, 'embers')) });
export const cometStat = (w: World) => ({ cd: COMET.cd - 0.5 * ext(w, 'comet'), radius: COMET.radius, mult: (COMET.mult + 0.5 * ext(w, 'comet')) * syn(w, 'comet') });
export const frostStat = (w: World) => ({
  cd: FROST.cd - 0.5 * ext(w, 'frost'),
  radius: FROST.radius + 0.25 * ext(w, 'frost'),
  freeze: FROST.freeze + 0.25 * ext(w, 'frost'),
  mult: (FROST.mult + 0.15 * ext(w, 'frost')) * syn(w, 'frost'),
});
export const wardStat = (w: World) => ({ cd: WARD.cd - ext(w, 'ward'), absorb: WARD.absorb + 0.05 * ext(w, 'ward') });
export const frostArmorStat = (w: World) => ({ reduce: FROST_ARMOR.reduce + FROST_ARMOR.per * ext(w, 'frostArmor') });
export const blizzardStat = (w: World) => ({ cd: BLIZZARD.cd - 0.5 * ext(w, 'blizzard'), time: BLIZZARD.time, radius: BLIZZARD.radius, mult: (BLIZZARD.mult + 0.08 * ext(w, 'blizzard')) * syn(w, 'blizzard') });
export function boltStat(w: World) {
  const big = mastered(w, 'lightning'); // 5단계: 범위 ×1.3, 기절 ×2
  return {
    cd: BOLT.cd - 0.4 * ext(w, 'lightning'),
    radius: (BOLT.radius + 0.1 * ext(w, 'lightning')) * (big ? 1.3 : 1),
    mult: (BOLT.mult + 0.3 * ext(w, 'lightning')) * syn(w, 'lightning'),
    stun: (BOLT.stun + 0.1 * ext(w, 'lightning')) * (big ? 2 : 1),
  };
}
export const chainStat = (w: World) => ({ cd: CHAIN.cd - 0.4 * ext(w, 'chain'), count: CHAIN.count + Math.floor(ext(w, 'chain') / 2), radius: BOLT.radius, stun: BOLT.stun, mult: (CHAIN.mult + 0.3 * ext(w, 'chain')) * syn(w, 'chain') });
export const staticStat = (w: World) => ({ count: rank(w, 'static') >= 3 ? 2 : 1, mult: STATIC.mult + 0.08 * ext(w, 'static') });
export const tempestStat = (w: World) => ({ cd: TEMPEST.cd - 0.5 * ext(w, 'tempest'), strikes: TEMPEST.strikes + ext(w, 'tempest'), mult: (TEMPEST.mult + 0.2 * ext(w, 'tempest')) * syn(w, 'tempest') });

const ORB_GAP = 0.8; // 작은 화염구가 폭발 중심에서 떨어져 나오는 거리(m): 맞은 적에게서 바로 다시 터지지 않게
// 주인공이 아닌 산 것. 종류로 거른다: 잔상 자리에 선 주인공 사본(afterimage.ts)을 넘겨도 주인공이 적으로 잡히지 않게
export const foes = (w: World, _hero: Entity) => w.entities.filter((e) => e.kind !== 'hero' && e.state !== 'dead');
export const nearest = (w: World, hero: Entity, r: number) =>
  foes(w, hero)
    .filter((e) => dist(e, hero) <= r)
    .sort((a, b) => dist(a, hero) - dist(b, hero))[0];
export const blast = (w: World, kind: Blast['kind'], x: number, z: number, r?: number) => w.blasts.push({ id: w.nextItem++, x, z, r, age: 0, kind });
// 스킬에 맞은 적: 하던 휘두르기·이동·예고를 끊고 t초 기절(얼음·벼락)
export const stun = (e: Entity, t: number) => e.state !== 'dead' && !steady(e) && Object.assign(e, { state: 'idle', attackT: 0, path: [], phase: 'none', stunT: Math.max(e.stunT, t) });

// 조준 방향(단위 벡터): 조준점 → 가까운 적(range 안) → 바라보는 방향
export function aimDir(w: World, hero: Entity, range: number, x?: number, z?: number): [number, number] {
  const near = nearest(w, hero, range);
  const [tx, tz] = x !== undefined && z !== undefined ? [x, z] : near ? [near.x, near.z] : [hero.x + Math.sin(hero.facing), hero.z + Math.cos(hero.facing)];
  const d = Math.hypot(tx - hero.x, tz - hero.z);
  return d > 1e-6 ? [(tx - hero.x) / d, (tz - hero.z) / d] : [Math.sin(hero.facing), Math.cos(hero.facing)];
}

// 지점에 떨어지는 스킬의 자리: 조준점(사거리까지로 당김), 없으면 사거리 안 가까운 적. 둘 다 없으면 null(쓰지 않는다). 주인공은 그쪽을 본다
export function spot(w: World, hero: Entity, range: number, x?: number, z?: number): [number, number] | null {
  let [tx, tz] = [x, z];
  if (tx === undefined || tz === undefined) {
    const t = nearest(w, hero, range);
    if (!t) return null;
    [tx, tz] = [t.x, t.z];
  }
  const d = Math.hypot(tx - hero.x, tz - hero.z);
  if (d > range) [tx, tz] = [hero.x + ((tx - hero.x) * range) / d, hero.z + ((tz - hero.z) * range) / d];
  if (d > 1e-6) hero.facing = Math.atan2(tx - hero.x, tz - hero.z);
  return [tx, tz];
}

// 마력탄: 평타가 맞는 순간(swing) 대상 쪽으로 쏜다
export function bolt(w: World, hero: Entity, t: Entity) {
  const d = dist(hero, t) || 1;
  w.shots.push({ id: w.nextItem++, x: hero.x, z: hero.z, dx: (t.x - hero.x) / d, dz: (t.z - hero.z) / d, dmg: roll(w, hero), left: WIZ.flight, kind: 'bolt' });
}

// 화염구: 조준 방향으로 날린다(5단계는 세 갈래). 하던 평타·이동은 계속한다
export function fireball(w: World, hero: Entity, x?: number, z?: number): number {
  const [dx, dz] = aimDir(w, hero, FIREBALL.aim, x, z);
  hero.facing = Math.atan2(dx, dz);
  const st = fireStat(w);
  for (const a of mastered(w, 'fireball') ? [-FIREBALL.spread, 0, FIREBALL.spread] : [0]) {
    const [c, s] = [Math.cos(a), Math.sin(a)];
    w.shots.push({ id: w.nextItem++, x: hero.x, z: hero.z, dx: dx * c + dz * s, dz: dz * c - dx * s, dmg: Math.round(roll(w, hero) * st.mult), left: FIREBALL.flight, kind: 'fireball' });
  }
  w.casts++;
  return st.cd;
}

// 화염구 폭발: 반경 안 적 모두 피해·밀어냄. 잔불(화염 패시브)이면 그 자리가 잠시 탄다.
// 쪼개지는 구슬(전설): 작은 화염구 LEGEND_FX.orbs개가 사방으로(작은 것은 다시 쪼개지지 않는다)
// scale: 잔상이 쏜 화염구(잔불·작은 화염구에도 곱한다)
export function fireBurst(w: World, hero: Entity, x: number, z: number, dmg: number, small = false, scale = 1) {
  if (!small && hasUnique(w, 'splitOrb'))
    for (let k = 0; k < LEGEND_FX.orbs; k++) {
      const a = (k / LEGEND_FX.orbs) * Math.PI * 2 + hero.facing;
      const [dx, dz] = [Math.sin(a), Math.cos(a)];
      w.shots.push({ id: w.nextItem++, x: x + dx * ORB_GAP, z: z + dz * ORB_GAP, dx, dz, dmg: Math.round(dmg * LEGEND_FX.orbMult), left: FIREBALL.flight / 3, kind: 'fireball', small: true, scale });
    }
  blast(w, 'fire', x, z);
  const r = fireStat(w).radius;
  for (const e of foes(w, hero)) {
    const d = Math.hypot(e.x - x, e.z - z);
    if (d > r) continue;
    skillHit(w, e, dmg);
    knock(w, e, d > 1e-6 ? (e.x - x) / d : 0, d > 1e-6 ? (e.z - z) / d : 0, KNOCK.axe);
  }
  if (rank(w, 'embers')) {
    const st = embersStat(w);
    w.fires.push({ id: w.nextItem++, x0: x, z0: z, x1: x, z1: z, t: st.time, acc: 0, r: EMBERS.radius, mult: st.mult * scale });
  }
}

// 불바다: 지점이 FIREFIELD.time초 동안 불탄다
export function firefield(w: World, hero: Entity, x?: number, z?: number): number {
  const at = spot(w, hero, FIREFIELD.range, x, z);
  if (!at) return 0;
  const st = firefieldStat(w);
  w.fires.push({ id: w.nextItem++, x0: at[0], z0: at[1], x1: at[0], z1: at[1], t: FIREFIELD.time, acc: 0, r: st.radius, mult: st.mult });
  blast(w, 'fire', at[0], at[1]);
  w.casts++;
  return st.cd;
}

// 운석: COMET.delay초 뒤 지점에 떨어져 반경 안 적에게 큰 피해, 그 자리가 잠시 탄다(떨어지는 것은 ranger의 tickVolleys)
export function comet(w: World, hero: Entity, x?: number, z?: number): number {
  const at = spot(w, hero, COMET.range, x, z);
  if (!at) return 0;
  const st = cometStat(w);
  w.volleys.push({ x: at[0], z: at[1], r: st.radius, t: COMET.delay, left: 1, mult: st.mult, later: st.mult, blast: 'fire', burn: st.radius * 0.8 });
  w.casts++;
  return st.cd;
}

// 비행 중인 마력탄·화염구(fly가 부른다): 처음 닿는 몬스터에게 마력탄은 피해(정전기면 옆 적에게 튄다), 화염구는 폭발. 계속 날아가면 true
export function magicHit(w: World, hero: Entity, s: Shot): boolean {
  const r = s.kind === 'bolt' ? WIZ.hit : FIREBALL.hit;
  const t = foes(w, hero).find((e) => Math.hypot(e.x - s.x, e.z - s.z) <= r);
  if (!t) return true;
  if (s.kind === 'fireball') fireBurst(w, hero, s.x, s.z, s.dmg, s.small, s.scale);
  else {
    hurt(w, t, s.dmg, hero);
    if (rank(w, 'static')) {
      const st = staticStat(w);
      for (const e of foes(w, hero)
        .filter((e) => e !== t && dist(e, t) <= STATIC.range && clearLine(w, t, e))
        .sort((a, b) => dist(a, t) - dist(b, t))
        .slice(0, st.count)) {
        blast(w, 'spark', e.x, e.z);
        hurt(w, e, Math.round(s.dmg * st.mult), hero);
      }
    }
  }
  return false;
}

// 서리 갑옷(냉기 패시브): 냉기 스킬을 쓰면 잠시 받는 피해 감소(core의 hurt가 shoutT를 본다)
const armor = (w: World) => rank(w, 'frostArmor') && (w.shoutT = FROST_ARMOR.time);

// 서리 고리: 반경 안 적에게 피해 후 얼린다(기절 → 약점 연계). 5단계는 반경 안의 적 투사체도 지운다
export function frost(w: World, hero: Entity): number {
  const st = frostStat(w);
  blast(w, 'frost', hero.x, hero.z, st.radius); // 반경만큼 얼음 장판(렌더)
  for (const e of foes(w, hero)) {
    if (dist(e, hero) > st.radius) continue;
    skillHit(w, e, Math.round(roll(w, hero) * st.mult));
    if (stun(e, st.freeze)) blast(w, 'ice', e.x, e.z);
  }
  if (mastered(w, 'frost')) w.shots = w.shots.filter((s) => s.kind === 'axe' || s.kind === 'bolt' || s.kind === 'fireball' || Math.hypot(s.x - hero.x, s.z - hero.z) > st.radius);
  armor(w);
  w.casts++;
  return st.cd;
}

// 눈보라: BLIZZARD.time초 동안 주인공 둘레에 냉기장(tickAura가 때리고 얼린다)
export function blizzard(w: World): number {
  const st = blizzardStat(w);
  Object.assign(w, { auraT: st.time, auraAcc: BLIZZARD.tick });
  armor(w);
  w.casts++;
  return st.cd;
}

export function tickAura(w: World, hero: Entity) {
  w.auraT = Math.max(0, w.auraT - DT);
  if (hero.state === 'dead') return void (w.auraT = 0);
  if ((w.auraAcc += DT) < BLIZZARD.tick - 1e-9) return;
  w.auraAcc = 0;
  auraHit(w, hero);
}

// 눈보라 한 번: at 둘레 적에게 피해 + 잠깐 얼림(잔상 몫 눈보라도 쓴다)
export function auraHit(w: World, at: Entity) {
  const st = blizzardStat(w);
  blast(w, 'frost', at.x, at.z, st.radius);
  for (const e of foes(w, at)) {
    if (dist(e, at) > st.radius) continue;
    skillHit(w, e, Math.round(roll(w, at) * st.mult));
    stun(e, BLIZZARD.freeze);
  }
}

// 벼락 한 번: (x, z) 반경 r 안 적에게 피해 + 기절. 맞은 적들
function strike(w: World, hero: Entity, x: number, z: number, r: number, mult: number, stunT: number): Entity[] {
  const struck = foes(w, hero).filter((e) => Math.hypot(e.x - x, e.z - z) <= r);
  for (const e of struck) {
    skillHit(w, e, Math.round(roll(w, hero) * mult));
    stun(e, stunT);
  }
  return struck;
}

// 낙뢰: 조준점(사거리 BOLT.range까지로 당김), 없으면 가까운 적에게 벼락. 반경 안 적 피해 + 기절
export function lightning(w: World, hero: Entity, x?: number, z?: number): number {
  const at = spot(w, hero, BOLT.range, x, z);
  if (!at) return 0;
  const st = boltStat(w);
  blast(w, 'thunder', at[0], at[1], st.radius);
  strike(w, hero, at[0], at[1], st.radius, st.mult, st.stun);
  w.casts++;
  return st.cd;
}

// 연쇄 번개: 낙뢰처럼 떨어진 뒤 맞은 적에서 가까운 적으로 count번 튄다(튈 때 배율 CHAIN.hop)
export function chainLightning(w: World, hero: Entity, x?: number, z?: number): number {
  const at = spot(w, hero, BOLT.range, x, z);
  if (!at) return 0;
  const st = chainStat(w);
  blast(w, 'thunder', at[0], at[1], st.radius);
  const struck = strike(w, hero, at[0], at[1], st.radius, st.mult, st.stun);
  let from = struck[0];
  for (let k = 0; from && k < st.count; k++) {
    const next = foes(w, hero)
      .filter((e) => !struck.includes(e) && dist(e, from) <= CHAIN.range && clearLine(w, from, e))
      .sort((a, b) => dist(a, from) - dist(b, from))[0];
    if (!next) break;
    blast(w, 'spark', next.x, next.z);
    skillHit(w, next, Math.round(roll(w, hero) * st.mult * CHAIN.hop));
    struck.push(next);
    from = next;
  }
  w.casts++;
  return st.cd;
}

// 천둥 폭풍: 지점 둘레 여러 곳에 벼락이 TEMPEST.time초에 걸쳐 잇따라 떨어진다(해바라기 씨 배열로 고르게, 벽 칸은 건너뜀)
export function tempest(w: World, hero: Entity, x?: number, z?: number): number {
  const at = spot(w, hero, TEMPEST.range, x, z);
  if (!at) return 0;
  const st = tempestStat(w);
  for (let k = 0; k < st.strikes; k++) {
    const a = k * 2.39996 + w.nextItem, r = TEMPEST.radius * Math.sqrt((k + 0.5) / st.strikes);
    const [sx, sz] = [at[0] + Math.sin(a) * r, at[1] + Math.cos(a) * r];
    if (walkable(w.grid, Math.floor(sx), Math.floor(sz))) w.storm.push({ x: sx, z: sz, t: ((k + 1) / st.strikes) * TEMPEST.time, r: TEMPEST.hit, mult: st.mult });
  }
  w.casts++;
  return st.cd;
}

export function tickStorm(w: World, hero: Entity) {
  for (const s of w.storm) {
    if ((s.t -= DT) > 0) continue;
    blast(w, 'thunder', s.x, s.z);
    strike(w, hero, s.x, s.z, s.r, s.mult, TEMPEST.stun);
  }
  w.storm = w.storm.filter((s) => s.t > 0);
}

// 마나 방패: 최대 체력 비율만큼 피해를 흡수(hurt가 깎고, 막은 피해 일부를 공격자에게 되돌린다). 5단계: 방패가 깨지면 주변 폭발
export function ward(w: World): number {
  const st = wardStat(w);
  Object.assign(w, { wardHp: Math.round(heroMax(w) * st.absorb), wardT: WARD.time, wardBroke: false });
  armor(w);
  w.casts++;
  return st.cd;
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

// 방패(마나 방패·뼈 갑옷) 한 틱: 깨졌으면(마나 방패 5단계) 폭발, 시간이 다 되면 사라진다
export function tickWard(w: World, hero: Entity) {
  if (w.wardBroke) {
    w.wardBroke = false;
    if (mastered(w, 'ward') && hero.state !== 'dead') nova(w, hero);
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
  const id = emberLine(w, hero.x, hero.z); // 불꽃 걸음: 순간이동한 길
  const ember = w.fires.find((f) => f.id === id);
  if (ember) [ember.x1, ember.z1] = [hero.x + dx * k, hero.z + dz * k];
  Object.assign(hero, { x: hero.x + dx * k, z: hero.z + dz * k, phase: 'roll', phaseT: BLINK.guard * ROLL.speed, dx: 0, dz: 0, state: 'idle', path: hero.path.slice(-1), attackT: 0, skill: false, repathT: 0, facing: Math.atan2(dx, dz) });
  blast(w, 'blink', hero.x, hero.z);
  w.rollCd = BLINK.cd;
}
