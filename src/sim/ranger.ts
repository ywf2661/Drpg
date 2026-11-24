// 궁수 스킬: 화살(평타), 사격(관통 사격·세 갈래·치명·집중), 사냥(덫·밀쳐내기 사격·덫 숙련·사냥터), 하늘(화살비·불화살·폭우·화살 폭풍). 스페이스는 기사 구르기.
// 스킬은 쓰이면 재사용 대기(초)를, 쓰지 못했으면 0을 돌려준다. 명사수는 core의 hurt. 떨어지는 화살비·운석(tickVolleys)은 직업과 무관하게 돈다
import { walkable } from './path';
import { STORM_BOW, ARROW_STORM, CRIT, DOWNPOUR, DT, FIRE_RAIN, FOCUS, HUNT, KNOCK, PIERCE, PUSH, RAIN, RANGER, SNARE, SPREAD, TRAIL, TRAP, type Entity, type Shot, type World } from './rules';
import { hasUnique, cdExt, ext, hurt, knock, mastered, rand, rank, roll, skillHit, syn } from './core';
import { aimDir, blast, foes, nearest, spot, stun } from './wizard';
import { assist } from './hawk';

// 스킬 단계별 수치(1단계 = 기본값). 피해 배율에는 시너지가 붙는다
export const pierceStat = (w: World) => ({ cd: PIERCE.cd - 0.3 * cdExt(w, 'pierce'), mult: (PIERCE.mult + 0.25 * ext(w, 'pierce')) * syn(w, 'pierce') });
export const spreadStat = (w: World) => ({ cd: SPREAD.cd - 0.3 * cdExt(w, 'spread'), count: mastered(w, 'spread') ? SPREAD.max : 3, mult: (SPREAD.mult + 0.2 * ext(w, 'spread')) * syn(w, 'spread') });
export const critStat = (w: World) => ({ chance: CRIT.chance * rank(w, 'crit') });
export const focusStat = (w: World) => ({ cd: FOCUS.cd - cdExt(w, 'focus'), time: FOCUS.time + 0.5 * ext(w, 'focus') });
export const trapStat = (w: World) => ({
  cd: TRAP.cd - 0.5 * cdExt(w, 'trap'),
  hold: (TRAP.hold + 0.2 * ext(w, 'trap')) * (1 + SNARE.hold * rank(w, 'snare')),
  max: TRAP.max + (rank(w, 'snare') ? 1 : 0),
  mult: TRAP.mult * syn(w, 'trap'),
});
export const pushStat = (w: World) => ({ cd: PUSH.cd - 0.3 * cdExt(w, 'push'), mult: (PUSH.mult + 0.2 * ext(w, 'push')) * syn(w, 'push') });
export const snareStat = (w: World) => ({ blast: SNARE.blast + 0.1 * ext(w, 'snare') });
export const huntStat = (w: World) => ({ cd: HUNT.cd - 0.5 * cdExt(w, 'hunt'), count: HUNT.count + ext(w, 'hunt'), mult: (HUNT.mult + 0.2 * ext(w, 'hunt')) * syn(w, 'hunt') });
export const rainStat = (w: World) => ({
  cd: RAIN.cd - 0.5 * cdExt(w, 'rain'),
  radius: (RAIN.radius + 0.15 * ext(w, 'rain')) * (mastered(w, 'rain') ? RAIN.big : 1),
  mult: (RAIN.mult + 0.2 * ext(w, 'rain')) * syn(w, 'rain'),
});
export const fireRainStat = (w: World) => ({ cd: FIRE_RAIN.cd - 0.5 * cdExt(w, 'fireRain'), radius: RAIN.radius + 0.15 * ext(w, 'fireRain'), mult: (FIRE_RAIN.mult + 0.2 * ext(w, 'fireRain')) * syn(w, 'fireRain') });
export const downpourStat = (w: World) => ({ waves: Math.ceil(rank(w, 'downpour') / 2) }); // 화살비·불화살이 더 내리는 횟수
export const arrowStormStat = (w: World) => ({ cd: ARROW_STORM.cd - 0.5 * cdExt(w, 'arrowStorm'), count: ARROW_STORM.count + ext(w, 'arrowStorm'), mult: (ARROW_STORM.mult + 0.2 * ext(w, 'arrowStorm')) * syn(w, 'arrowStorm') });

// 치명(사격 패시브): 화살 피해 2배 확률. 배우지 않았으면 난수를 쓰지 않는다
const crit = (w: World) => (rank(w, 'crit') && rand(w) < critStat(w).chance ? 2 : 1);

// 화살: 평타가 맞는 순간(swing) 대상 쪽으로 쏜다. 집중 중에는 조금 벌어진 두 발
export function shaft(w: World, hero: Entity, t: Entity) {
  const d = Math.hypot(t.x - hero.x, t.z - hero.z) || 1;
  const [dx, dz] = [(t.x - hero.x) / d, (t.z - hero.z) / d];
  for (const a of w.focusT > 0 ? [-FOCUS.spread / 2, FOCUS.spread / 2] : [0]) {
    const [c, sn] = [Math.cos(a), Math.sin(a)];
    w.shots.push({ id: w.nextItem++, x: hero.x, z: hero.z, dx: dx * c + dz * sn, dz: dz * c - dx * sn, dmg: roll(w, hero) * crit(w), left: RANGER.flight, kind: 'shaft' });
  }
}

// 천둥새의 장궁: 화살이 맞힌 적 둘레의 다른 모든 적에게 번개(다시 튀지 않는다)
function storm(w: World, hero: Entity, t: Entity, dmg: number) {
  if (!hasUnique(w, 'stormBow')) return;
  for (const e of foes(w, hero)) {
    if (e === t || Math.hypot(e.x - t.x, e.z - t.z) > STORM_BOW.radius) continue;
    hurt(w, e, Math.max(1, Math.round(dmg * STORM_BOW.mult)), hero);
    w.blasts.push({ id: w.nextItem++, x: e.x, z: e.z, age: 0, kind: 'spark', fx: t.x, fz: t.z });
  }
}

// 비행 중인 화살(fly가 부른다): 처음 닿는 몬스터에게 피해. 계속 날아가면 true
// 관통 사격·뼈 창은 맞은 적마다 한 번씩 피해·밀어냄을 주며 꿰뚫고 지나간다(밀쳐내기 사격: 멀리 밀고, 벽에 닿으면 기절)
export function arrowHit(w: World, hero: Entity, s: Shot): boolean {
  const hit = (s.hit ??= []);
  const t = foes(w, hero).find((e) => !hit.includes(e.id) && Math.hypot(e.x - s.x, e.z - s.z) <= (s.kind === 'pierce' ? PIERCE.hit : RANGER.hit));
  if (!t) return true;
  if (s.kind === 'shaft') {
    hurt(w, t, s.dmg, hero);
    storm(w, hero, t, s.dmg);
    return false;
  }
  hit.push(t.id);
  skillHit(w, t, s.dmg);
  storm(w, hero, t, s.dmg);
  assist(w, t); // 협공(매)
  knock(w, t, s.dx, s.dz, s.push ? PUSH.dist : KNOCK.axe);
  if (s.push && !walkable(w.grid, Math.floor(t.x + s.dx * 0.5), Math.floor(t.z + s.dz * 0.5))) stun(t, PUSH.stun);
  return true;
}

// 꿰뚫는 화살들을 조준 방향 둘레 angles(라디안)로. waits: 같은 화살이 이만큼 뒤에 또(관통 사격 5단계)
function volley(w: World, hero: Entity, mult: number, angles: number[], more: Partial<Shot>, x?: number, z?: number, waits = [0]) {
  const [dx, dz] = aimDir(w, hero, PIERCE.aim, x, z);
  hero.facing = Math.atan2(dx, dz);
  for (const wait of waits)
    for (const a of angles) {
      const [c, sn] = [Math.cos(a), Math.sin(a)];
      w.shots.push({ id: w.nextItem++, x: hero.x, z: hero.z, dx: dx * c + dz * sn, dz: dz * c - dx * sn, dmg: Math.round(roll(w, hero) * mult) * crit(w), left: PIERCE.flight, kind: 'pierce', ...more, ...(wait ? { wait } : {}) });
    }
  w.casts++;
}

// 관통 사격: 조준 방향으로 꿰뚫는 화살. 5단계는 같은 화살이 PIERCE.wait초 뒤 한 번 더
export function pierce(w: World, hero: Entity, x?: number, z?: number): number {
  const st = pierceStat(w);
  volley(w, hero, st.mult, [0], {}, x, z, mastered(w, 'pierce') ? [0, PIERCE.wait] : [0]);
  return st.cd;
}

// 세 갈래: 꿰뚫는 화살이 부채꼴로(5단계 다섯 발)
export function spreadShot(w: World, hero: Entity, x?: number, z?: number): number {
  const st = spreadStat(w);
  volley(w, hero, st.mult, Array.from({ length: st.count }, (_, k) => (k - (st.count - 1) / 2) * SPREAD.angle), {}, x, z);
  return st.cd;
}

// 밀쳐내기 사격: 맞은 적을 멀리 밀어내는 꿰뚫는 화살. 벽에 부딪히면 기절
export function pushShot(w: World, hero: Entity, x?: number, z?: number): number {
  const st = pushStat(w);
  volley(w, hero, st.mult, [0], { push: true }, x, z);
  return st.cd;
}

// 덫: 조준점(사거리로 당김) → 가까운 적 → 발밑에 놓는다. 걸을 수 없는 곳이면 발밑. 최대 개수를 넘으면 오래된 것부터 없앤다(사냥터 덫은 세지 않는다)
export function trap(w: World, hero: Entity, x?: number, z?: number): number {
  const st = trapStat(w);
  const near = nearest(w, hero, TRAP.range);
  let [tx, tz] = x !== undefined && z !== undefined ? [x, z] : near ? [near.x, near.z] : [hero.x, hero.z];
  const d = Math.hypot(tx - hero.x, tz - hero.z);
  if (d > TRAP.range) [tx, tz] = [hero.x + ((tx - hero.x) * TRAP.range) / d, hero.z + ((tz - hero.z) * TRAP.range) / d];
  if (!walkable(w.grid, Math.floor(tx), Math.floor(tz))) [tx, tz] = [hero.x, hero.z];
  w.traps.push({ id: w.nextItem++, x: tx, z: tz, mult: st.mult });
  const old = w.traps.filter((t) => !t.keep).slice(0, -st.max);
  w.traps = w.traps.filter((t) => !old.includes(t));
  w.casts++;
  return st.cd;
}

// 사냥터: 지점(없으면 발밑) 둘레에 덫을 둥글게 한꺼번에 깐다
export function hunt(w: World, hero: Entity, x?: number, z?: number): number {
  const [cx, cz] = spot(w, hero, HUNT.range, x, z) ?? [hero.x, hero.z];
  const st = huntStat(w);
  for (let k = 0; k < st.count; k++) {
    const a = (k / st.count) * Math.PI * 2;
    const [tx, tz] = [cx + Math.sin(a) * HUNT.ring, cz + Math.cos(a) * HUNT.ring];
    if (walkable(w.grid, Math.floor(tx), Math.floor(tz))) w.traps.push({ id: w.nextItem++, x: tx, z: tz, mult: st.mult, keep: true });
  }
  w.casts++;
  return st.cd;
}

// 덫 한 틱: 적이 밟으면 피해 + 묶임(보스·해골 왕은 피해만). 덫 숙련(사냥 패시브)은 주변 적도 피해, 덫 5단계는 주변 적도 묶는다
export function tickTraps(w: World, hero: Entity) {
  w.traps = w.traps.filter((t) => {
    const prey = foes(w, hero).find((e) => Math.hypot(e.x - t.x, e.z - t.z) <= TRAP.trigger);
    if (!prey) return true;
    const st = trapStat(w);
    const dmg = Math.round(roll(w, hero) * t.mult);
    const around = rank(w, 'snare') ? Math.round(dmg * snareStat(w).blast) : 0;
    blast(w, 'trap', t.x, t.z);
    for (const e of foes(w, hero)) {
      const near = e !== prey && Math.hypot(e.x - t.x, e.z - t.z) <= TRAP.radius;
      if (e === prey) skillHit(w, e, dmg);
      else if (near && around) skillHit(w, e, around);
      const big = e.kind === 'boss' || e.kind === 'king'; // 보스·해골 왕은 덫을 부수고 지나간다(묶이지 않는다)
      if (!big && (e === prey || (near && mastered(w, 'trap')))) stun(e, st.hold);
    }
    return false;
  });
}

// 화살비·불화살: 지점(사거리로 당김), 없으면 가까운 적에게 RAIN.delay초 뒤 떨어진다. 폭우(하늘 패시브)면 몇 번 더 약하게
function shower(w: World, hero: Entity, r: number, mult: number, burn: number | undefined, x?: number, z?: number): boolean {
  const at = spot(w, hero, RAIN.range, x, z);
  if (!at) return false;
  w.volleys.push({ x: at[0], z: at[1], r, t: RAIN.delay, left: 1 + downpourStat(w).waves, mult, later: mult * DOWNPOUR.mult, blast: 'rain', burn });
  w.casts++;
  return true;
}
export function rain(w: World, hero: Entity, x?: number, z?: number): number {
  const st = rainStat(w);
  return shower(w, hero, st.radius, st.mult, undefined, x, z) ? st.cd : 0;
}
export function fireRain(w: World, hero: Entity, x?: number, z?: number): number {
  const st = fireRainStat(w);
  return shower(w, hero, st.radius, st.mult, st.radius, x, z) ? st.cd : 0;
}

// 화살 폭풍: 주인공 둘레 여기저기에 화살비가 ARROW_STORM.time초에 걸쳐 잇따라 떨어진다
export function arrowStorm(w: World, hero: Entity): number {
  const st = arrowStormStat(w);
  for (let k = 0; k < st.count; k++) {
    const a = rand(w) * Math.PI * 2, r = ARROW_STORM.spread * Math.sqrt(rand(w));
    w.volleys.push({ x: hero.x + Math.sin(a) * r, z: hero.z + Math.cos(a) * r, r: ARROW_STORM.radius, t: RAIN.delay + (k / st.count) * ARROW_STORM.time, left: 1, mult: st.mult, later: st.mult, blast: 'rain' });
  }
  w.casts++;
  return st.cd;
}

// 화살비·운석 한 틱: 때가 되면 반경 안 적 모두 피해, burn이면 그 자리에 불. 남은 횟수가 있으면 DOWNPOUR.every초 뒤 다시(× later)
export function tickVolleys(w: World, hero: Entity) {
  for (const v of w.volleys) {
    if ((v.t -= DT) > 0) continue;
    blast(w, v.blast, v.x, v.z, v.r);
    const dmg = Math.round(roll(w, hero) * v.mult);
    for (const e of foes(w, hero))
      if (Math.hypot(e.x - v.x, e.z - v.z) <= v.r) {
        skillHit(w, e, dmg);
        if (v.blast === 'rain') assist(w, e); // 협공(매): 화살비만(운석은 아니다)
      }
    if (v.burn) w.fires.push({ id: w.nextItem++, x0: v.x, z0: v.z, x1: v.x, z1: v.z, t: TRAIL.time, acc: 0, r: v.burn, mult: TRAIL.mult * (v.scale ?? 1) });
    v.left--;
    v.t = DOWNPOUR.every;
    v.mult = v.later;
  }
  w.volleys = w.volleys.filter((v) => v.left > 0);
}

// 집중: 잠시 공격 속도가 빨라지고(core의 attackInterval) 화살이 두 발씩. 5단계는 core의 hurt
export function focus(w: World, hero: Entity): number {
  const st = focusStat(w);
  w.focusT = st.time;
  blast(w, 'heal', hero.x, hero.z);
  w.casts++;
  return st.cd;
}
