// 궁수 스킬: 화살(평타), 관통 사격(Q), 덫(W), 화살비(E), 집중(R). 스페이스는 기사 구르기.
// 스킬 칸·명령·재사용 필드·단계·특성은 기사·마법사와 같은 것을 쓴다(rules의 HeroClass 설명). 명사수는 core의 hurt
import { walkable } from './path';
import { DT, KNOCK, PIERCE, RAIN, RANGER, TRAIL, TRAP, type Entity, type Shot, type SkillName, type World } from './rules';
import { dist, hurt, knock, mastered, roll, skillHit } from './core';
import { aimDir, blast, foes, nearest, stun } from './wizard';

// 스킬 단계별 수치(1단계 = 기본값)
const extra = (w: World, s: SkillName) => w.ranks[s] - 1;
export const trapStat = (w: World) => {
  const big = w.traits.dash === 2; // 덫 3개: 더 많이, 더 오래
  return { cd: TRAP.cd - 0.5 * extra(w, 'dash'), hold: (TRAP.hold + 0.2 * extra(w, 'dash')) * (big ? TRAP.bigHold : 1), max: big ? TRAP.bigMax : TRAP.max };
};
export const rainStat = (w: World) => ({
  cd: RAIN.cd - 0.5 * extra(w, 'shout'),
  radius: (RAIN.radius + 0.15 * extra(w, 'shout')) * (mastered(w, 'shout') ? RAIN.big : 1),
  mult: (RAIN.mult + 0.2 * extra(w, 'shout')) * (w.traits.shout === 2 ? RAIN.waveMult : 1), // 지속 화살비: 회당 약하게
});
export const pierceStat = (w: World) => ({ cd: PIERCE.cd - 0.3 * extra(w, 'cleave'), mult: PIERCE.mult + 0.25 * extra(w, 'cleave') });

// 화살: 평타가 맞는 순간(swing) 대상 쪽으로 쏜다
export function shaft(w: World, hero: Entity, t: Entity) {
  const d = dist(hero, t) || 1;
  w.shots.push({ id: w.nextItem++, x: hero.x, z: hero.z, dx: (t.x - hero.x) / d, dz: (t.z - hero.z) / d, dmg: roll(w, hero), left: RANGER.flight, kind: 'shaft' });
}

// 비행 중인 화살(fly가 부른다): 처음 닿는 몬스터에게 피해. 계속 날아가면 true
// 관통 사격은 맞은 적마다 한 번씩 피해·밀어냄을 주며 꿰뚫고 지나간다(밀쳐내기 특성: 멀리 밀고, 벽에 닿으면 기절)
export function arrowHit(w: World, hero: Entity, s: Shot): boolean {
  const hit = (s.hit ??= []);
  const t = foes(w, hero).find((e) => !hit.includes(e.id) && Math.hypot(e.x - s.x, e.z - s.z) <= (s.kind === 'pierce' ? PIERCE.hit : RANGER.hit));
  if (!t) return true;
  if (s.kind === 'shaft') {
    hurt(w, t, s.dmg, hero);
    return false;
  }
  hit.push(t.id);
  skillHit(w, t, s.dmg);
  const push = w.traits.cleave === 1;
  knock(w, t, s.dx, s.dz, push ? PIERCE.push : KNOCK.axe);
  if (push && !walkable(w.grid, Math.floor(t.x + s.dx * 0.5), Math.floor(t.z + s.dz * 0.5))) stun(t, PIERCE.wallStun);
  return true;
}

// 관통 사격: 조준 방향으로 꿰뚫는 화살(세 갈래 특성은 셋). 5단계는 같은 화살이 PIERCE.wait초 뒤 한 번 더
export function pierce(w: World, hero: Entity, x?: number, z?: number) {
  if (w.skillCd > 0) return;
  const [dx, dz] = aimDir(w, hero, PIERCE.aim, x, z);
  hero.facing = Math.atan2(dx, dz);
  const st = pierceStat(w);
  for (const wait of mastered(w, 'cleave') ? [0, PIERCE.wait] : [0])
    for (const a of w.traits.cleave === 2 ? [-PIERCE.spread, 0, PIERCE.spread] : [0]) {
      const [c, sn] = [Math.cos(a), Math.sin(a)];
      w.shots.push({ id: w.nextItem++, x: hero.x, z: hero.z, dx: dx * c + dz * sn, dz: dz * c - dx * sn, dmg: Math.round(roll(w, hero) * st.mult), left: PIERCE.flight, kind: 'pierce', ...(wait ? { wait } : {}) });
    }
  w.casts++;
  w.skillCd = st.cd;
}

// 덫: 조준점(사거리로 당김) → 가까운 적 → 발밑에 놓는다. 걸을 수 없는 곳이면 발밑. 최대 개수를 넘으면 오래된 것부터 없앤다
export function trap(w: World, hero: Entity, x?: number, z?: number) {
  if (w.dashCd > 0) return;
  const near = nearest(w, hero, TRAP.range);
  let [tx, tz] = x !== undefined && z !== undefined ? [x, z] : near ? [near.x, near.z] : [hero.x, hero.z];
  const d = Math.hypot(tx - hero.x, tz - hero.z);
  if (d > TRAP.range) [tx, tz] = [hero.x + ((tx - hero.x) * TRAP.range) / d, hero.z + ((tz - hero.z) * TRAP.range) / d];
  if (!walkable(w.grid, Math.floor(tx), Math.floor(tz))) [tx, tz] = [hero.x, hero.z];
  w.traps.push({ id: w.nextItem++, x: tx, z: tz });
  w.traps = w.traps.slice(-trapStat(w).max);
  w.casts++;
  w.dashCd = trapStat(w).cd;
}

// 덫 한 틱: 적이 밟으면 피해 + 묶임. 폭발 덫(특성 1)은 주변 적도 피해, 5단계는 주변 적도 묶는다
export function tickTraps(w: World, hero: Entity) {
  w.traps = w.traps.filter((t) => {
    const prey = foes(w, hero).find((e) => Math.hypot(e.x - t.x, e.z - t.z) <= TRAP.trigger);
    if (!prey) return true;
    const st = trapStat(w);
    const dmg = Math.round(roll(w, hero) * TRAP.mult);
    blast(w, 'trap', t.x, t.z);
    for (const e of foes(w, hero)) {
      const around = e !== prey && Math.hypot(e.x - t.x, e.z - t.z) <= TRAP.radius;
      if (e === prey || (around && w.traits.dash === 1)) skillHit(w, e, dmg);
      if (e === prey || (around && mastered(w, 'dash'))) stun(e, st.hold);
    }
    return false;
  });
}

// 화살비: 조준점(사거리로 당김), 없으면 가까운 적에게 RAIN.delay초 뒤 떨어진다. 조준점도 적도 없으면 쓰지 않는다
export function rain(w: World, hero: Entity, x?: number, z?: number) {
  if (w.shoutCd > 0) return;
  let [tx, tz] = [x, z];
  if (tx === undefined || tz === undefined) {
    const t = nearest(w, hero, RAIN.range);
    if (!t) return;
    [tx, tz] = [t.x, t.z];
  }
  const d = Math.hypot(tx - hero.x, tz - hero.z);
  if (d > RAIN.range) [tx, tz] = [hero.x + ((tx - hero.x) * RAIN.range) / d, hero.z + ((tz - hero.z) * RAIN.range) / d];
  if (d > 1e-6) hero.facing = Math.atan2(tx - hero.x, tz - hero.z);
  const st = rainStat(w);
  w.volleys.push({ x: tx, z: tz, r: st.radius, t: RAIN.delay, left: w.traits.shout === 2 ? RAIN.waves : 1 });
  w.casts++;
  w.shoutCd = st.cd;
}

// 화살비 한 틱: 때가 되면 반경 안 적 모두 피해. 불화살(특성 1)은 그 자리에 불길, 지속(특성 2)은 RAIN.every초마다 다시
export function tickRain(w: World, hero: Entity) {
  for (const v of w.volleys) {
    if ((v.t -= DT) > 0) continue;
    blast(w, 'rain', v.x, v.z, v.r);
    const dmg = Math.round(roll(w, hero) * rainStat(w).mult);
    for (const e of foes(w, hero)) if (Math.hypot(e.x - v.x, e.z - v.z) <= v.r) skillHit(w, e, dmg);
    if (w.traits.shout === 1) w.fires.push({ id: w.nextItem++, x0: v.x, z0: v.z, x1: v.x, z1: v.z, t: TRAIL.time, acc: 0 });
    v.left--;
    v.t = RAIN.every;
  }
  w.volleys = w.volleys.filter((v) => v.left > 0);
}
