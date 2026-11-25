// 강령술사 스킬: 뼈 화살(평타 = 마법사 마력탄), 소환(해골 소환·시체 거인·해골 숙련·해골 왕 강림), 저주(죽음의 표식·역병·표식 숙련·시체 폭발),
// 뼈(뼈 창·뼈 갑옷·생명 흡수·뼈 감옥). 스페이스는 기사 구르기. 스킬은 쓰이면 재사용 대기(초)를, 쓰지 못했으면 0을 돌려준다.
// 표식 배율·생명 흡수는 core의 hurt, 뼈 갑옷은 마나 방패와 같은 흡수(wardHp)
import { walkable } from './path';
import { LEGEND2, RANGE, STATS, GRAVE_KING, LEGEND_FX, BONE_ARMOR, BONE_KINDS, BONE_MASTERY, BONES, CORPSE, CURSE, CURSE_MASTERY, DT, GIANT, HIT_AT, LORD, PIERCE, PLAGUE, PRISON, RADIUS, REPATH, SPEAR, WIZ, type Ally, type Entity, type Kind, type SkillId, type World } from './rules';
import { hasUnique, clearLine, dist, cdExt, ext, face, heroMax, hurt, makeEntity, mastered, pathTo, rank, roll, skillHit, syn, walk } from './core';
import { burst, openGate } from './abilities';
import { aimDir, blast, foes, spot, stun } from './wizard';

type BoneKind = keyof typeof BONE_KINDS;
export function bonesStat(w: World) {
  const r = w.ranks.bones ?? 1;
  const m = rank(w, 'boneMastery'); // 해골 숙련
  const count = BONES.count + (r >= 3 ? 1 : 0) + (mastered(w, 'bones') ? 1 : 0) + (m >= BONE_MASTERY.at ? 1 : 0) + (hasUnique(w, 'boneShroud') ? LEGEND_FX.bones : 0); // 뼈 왕의 수의
  // 검사 → 궁수 → 법사 순서로 되풀이. 궁수·법사는 단계가 올라야 섞인다
  const kinds = Array.from({ length: count }, (_, k): BoneKind => (k % 3 === 1 && r >= BONES.archerAt ? 'archer' : k % 3 === 2 && r >= BONES.mageAt ? 'mage' : 'minion'));
  return {
    cd: BONES.cd - 0.4 * cdExt(w, 'bones'),
    count,
    kinds,
    max: count + 2,
    life: Infinity, // 해골·거인은 시간이 다하지 않는다(맞아 무너지거나 다시 부르면 물러난다). 해골 왕만 시간제
    hp: Math.round(heroMax(w) * BONES.hp * (1 + BONE_MASTERY.hp * m)), // 몬스터에게 맞아 0이 되면 무너진다
    mult: (BONES.mult + 0.08 * ext(w, 'bones')) * syn(w, 'bones') * (1 + BONE_MASTERY.mult * m),
  };
}
export const giantStat = (w: World) => ({
  cd: GIANT.cd - cdExt(w, 'giant'),
  life: Infinity,
  hp: Math.round(heroMax(w) * (GIANT.hp + 0.25 * ext(w, 'giant'))),
  mult: (GIANT.mult + 0.1 * ext(w, 'giant')) * syn(w, 'giant'),
});
export const lordStat = (w: World) => ({
  cd: LORD.cd - 2 * cdExt(w, 'lord'),
  life: LORD.life,
  hp: Math.round(heroMax(w) * (LORD.hp + 0.3 * ext(w, 'lord'))),
  mult: (LORD.mult + 0.15 * ext(w, 'lord')) * syn(w, 'lord'),
});
export const curseStat = (w: World) => ({
  cd: CURSE.cd - 0.5 * cdExt(w, 'curse'),
  radius: (CURSE.radius + 0.15 * ext(w, 'curse')) * (1 + CURSE_MASTERY.radius * rank(w, 'curseMastery')),
  time: CURSE.time + 0.5 * ext(w, 'curse'),
  amp: CURSE.amp + 0.05 * ext(w, 'curse') + CURSE_MASTERY.amp * rank(w, 'curseMastery'),
});
export const plagueStat = (w: World) => ({ cd: PLAGUE.cd - 0.4 * cdExt(w, 'plague'), radius: PLAGUE.radius + 0.15 * ext(w, 'plague'), mult: (PLAGUE.mult + 0.06 * ext(w, 'plague')) * syn(w, 'plague') });
export const corpseStat = (w: World) => ({ cd: CORPSE.cd - 0.5 * cdExt(w, 'corpseBlast'), hp: (CORPSE.hp + 0.05 * ext(w, 'corpseBlast')) * syn(w, 'corpseBlast') });
export const spearStat = (w: World) => ({ cd: SPEAR.cd - 0.1 * cdExt(w, 'spear'), mult: (SPEAR.mult + 0.3 * ext(w, 'spear')) * syn(w, 'spear') });
export const boneArmorStat = (w: World) => ({ cd: BONE_ARMOR.cd - 0.5 * cdExt(w, 'boneArmor'), absorb: BONE_ARMOR.absorb + 0.05 * ext(w, 'boneArmor') });
export const prisonStat = (w: World) => ({ cd: PRISON.cd - 0.5 * cdExt(w, 'prison'), radius: PRISON.radius + 0.1 * ext(w, 'prison'), time: PRISON.time + 0.25 * ext(w, 'prison'), mult: (PRISON.mult + 0.2 * ext(w, 'prison')) * syn(w, 'prison') });

const isBone = (a: Ally) => a.kind !== 'warrior' && a.kind !== 'king'; // 거인·왕은 해골 수에 세지 않는다
// 스킬을 다시 쓰면 그 스킬로 부른 소환수는 물러난다
function dismiss(w: World, from: SkillId) {
  for (const a of w.allies) if (a.from === from) blast(w, 'blink', a.x, a.z);
  w.allies = w.allies.filter((a) => a.from !== from);
}

// 소환수 하나를 (x, z)에. same 종류가 max를 넘으면 오래된 것부터 무너진다
function spawn(w: World, x: number, z: number, kind: Kind, st: Pick<Ally, 'life' | 'hp' | 'mult' | 'reach' | 'interval' | 'splash'>, same: (a: Ally) => boolean, max: number, more: Partial<Ally> = {}) {
  const a: Ally = { ...makeEntity(-(w.nextItem++) - 1, kind, x, z, 1), ...more, ...st, maxHp: st.hp, lifeMax: st.life }; // 음수 id: core의 byId
  w.allies.push(a);
  blast(w, 'blink', x, z);
  const over = w.allies.filter(same).slice(0, -max);
  w.allies = w.allies.filter((o) => !over.includes(o));
  return a;
}

// (x, z) 둘레에 해골 n기를 일으킨다(종류는 해골 소환 단계의 순서대로)
export function raise(w: World, x: number, z: number, n: number, from?: SkillId) {
  const st = bonesStat(w);
  for (let k = 0; k < n; k++) {
    const a = (k / Math.max(1, n)) * Math.PI * 2 + w.nextItem;
    const [sx, sz] = [x + Math.sin(a) * 0.8, z + Math.cos(a) * 0.8];
    const [ax, az] = walkable(w.grid, Math.floor(sx), Math.floor(sz)) ? [sx, sz] : [x, z];
    const kind = st.kinds[k % st.kinds.length];
    const b: { hp: number; mult: number; interval: number; reach: number; splash?: number } = BONE_KINDS[kind];
    spawn(w, ax, az, kind, { life: st.life, hp: Math.round(st.hp * b.hp), mult: st.mult * b.mult, reach: b.reach, interval: b.interval, splash: b.splash }, isBone, st.max, { from });
  }
}

// 해골 소환: 주인공 둘레에 소환(먼저 부른 해골은 물러난다)
export function bones(w: World, hero: Entity): number {
  const st = bonesStat(w);
  dismiss(w, 'bones');
  raise(w, hero.x, hero.z, st.count, 'bones');
  w.casts++;
  return st.cd;
}

// 시체 거인: 튼튼한 거인 하나(다시 쓰면 바뀐다). 나타나며 주변 적(보스·해골 왕 제외)의 눈길을 끈다
export function giant(w: World, hero: Entity): number {
  const st = giantStat(w);
  dismiss(w, 'giant');
  const g = spawn(w, hero.x, hero.z, 'warrior', { life: st.life, hp: st.hp, mult: st.mult, reach: GIANT.reach, interval: GIANT.interval }, (a) => a.kind === 'warrior', 1, { skin: 'zombie', elite: true, from: 'giant' });
  for (const e of foes(w, hero)) if (dist(e, g) <= GIANT.taunt && e.kind !== 'boss' && e.kind !== 'king') e.target = g.id;
  w.casts++;
  return st.cd;
}

// 해골 왕 강림: 가장 센 소환수 하나, 휘두르면 주변도 함께 맞고, 있는 동안 다른 소환수 피해 증가. 5단계: 해골도 함께
export function lord(w: World, hero: Entity): number {
  const st = lordStat(w);
  dismiss(w, 'lord');
  spawn(w, hero.x, hero.z, 'king', { life: st.life, hp: st.hp, mult: st.mult, reach: LORD.reach, interval: LORD.interval, splash: LORD.splash }, (a) => a.from === 'lord' && a.kind === 'king', 1, { from: 'lord' });
  if (mastered(w, 'lord')) raise(w, hero.x, hero.z, LORD.guard, 'lord');
  w.casts++;
  return st.cd;
}

// 소환수 한 틱: 표식 안의 적이 먼저, 아니면 주인공 가까이(BONES.aggro 안)의 적을 쫓아 공격, 적이 없으면 주인공 뒤를 따른다. 시간이 다 되거나 맞아 죽으면 사라진다.
// 소환수에게 맞은 몬스터는 주인공 대신 그 소환수를 노린다(보스·해골 왕은 한눈팔지 않는다)
// ponytail: 소환수끼리·몬스터와는 겹치지 않게 소환수만 밀린다(separate는 entities만 본다)
export const graveKingStat = (w: World) => ({ cd: GRAVE_KING.cd - cdExt(w, 'graveKing'), hp: Math.round(heroMax(w) * GRAVE_KING.hp), mult: (GRAVE_KING.mult + 0.25 * ext(w, 'graveKing')) * syn(w, 'graveKing') });
// 무덤 왕의 귀환(갇힌 왕의 두개골): 주인공 앞(조준점 쪽)에 거대한 해골 왕의 상반신이 솟아, 주인공을 따라다니며 곁의 적을 모두 내리친다
export function graveKing(w: World, hero: Entity, x?: number, z?: number): number {
  const st = graveKingStat(w);
  if (x !== undefined && z !== undefined) hero.facing = Math.atan2(x - hero.x, z - hero.z);
  let [gx, gz] = [hero.x + Math.sin(hero.facing) * GRAVE_KING.ahead, hero.z + Math.cos(hero.facing) * GRAVE_KING.ahead];
  if (!walkable(w.grid, Math.floor(gx), Math.floor(gz))) [gx, gz] = [hero.x, hero.z];
  dismiss(w, 'graveKing');
  spawn(w, gx, gz, 'king', { life: GRAVE_KING.life, hp: st.hp, mult: st.mult, reach: GRAVE_KING.reach, interval: GRAVE_KING.interval }, (a) => a.from === 'graveKing', 1, { from: 'graveKing', escort: true });
  return st.cd;
}

// 「뼈 피리」 행진: 해골 병사 모두를 주인공 뒤 한 줄로 세워 가리킨 쪽으로 marchDist m 돌격시킨다. 지나며 닿은 적마다 한 번. 해골이 없으면 쓰지 않는다
export function march(w: World, hero: Entity, x?: number, z?: number): number {
  const line = w.allies.filter((a) => isBone(a) && a.state !== 'dead' && a.from !== 'curse' && !a.decoy);
  if (!line.length) return 0;
  if (x !== undefined && z !== undefined) hero.facing = Math.atan2(x - hero.x, z - hero.z);
  const [dx, dz] = [Math.sin(hero.facing), Math.cos(hero.facing)];
  line.forEach((a, k) => {
    const [sx, sz] = [hero.x - dx * 0.6 * k, hero.z - dz * 0.6 * k];
    if (walkable(w.grid, Math.floor(sx), Math.floor(sz))) [a.x, a.z] = [sx, sz];
    Object.assign(a, { rush: { dx, dz, left: LEGEND2.marchDist, hit: [] }, state: 'move', path: [], target: null, facing: hero.facing });
  });
  return LEGEND2.marchCd;
}

// 「도망자의 장화」: 구른 자리에 허수아비. decoyR 안의 몬스터(보스 빼고)가 decoyT초 동안 허수아비를 노린다
export function decoy(w: World, x: number, z: number) {
  const d = spawn(w, x, z, 'warrior', { life: LEGEND2.decoyT, hp: 9999, mult: 0, reach: 0, interval: 99 }, (a) => !!a.decoy, 1, { decoy: true });
  for (const e of w.entities) if (e.kind !== 'hero' && e.kind !== 'boss' && e.state !== 'dead' && dist(e, d) <= LEGEND2.decoyR) Object.assign(e, { target: d.id, repathT: 0 });
}

// 「원정대 깃발창」 깃발 꽂기: 가리킨 곳(벽이면 발밑)에 깃발, 원정대 병사 둘이 bannerLife초 싸운다. 다시 쓰면 앞의 병사는 물러난다
export function banner(w: World, hero: Entity, x?: number, z?: number): number {
  let [bx, bz] = x !== undefined && z !== undefined ? [x, z] : [hero.x + Math.sin(hero.facing) * 2, hero.z + Math.cos(hero.facing) * 2];
  if (!walkable(w.grid, Math.floor(bx), Math.floor(bz))) [bx, bz] = [hero.x, hero.z];
  dismiss(w, 'banner');
  blast(w, 'slam', bx, bz);
  for (const o of [-0.7, 0.7]) {
    const ok = walkable(w.grid, Math.floor(bx + o), Math.floor(bz));
    spawn(w, ok ? bx + o : bx, bz, 'warrior', { life: LEGEND2.bannerLife, hp: Math.round(heroMax(w) * LEGEND2.bannerHp), mult: LEGEND2.bannerMult, reach: RANGE, interval: 1.2 }, (a) => a.from === 'banner', 2, { from: 'banner' });
  }
  return LEGEND2.bannerCd;
}

export function tickAllies(w: World, hero: Entity) {
  const aura = w.allies.some((a) => a.kind === 'king' && a.from === 'lord') ? LORD.aura : 1;
  const marked = (e: Entity) => w.curses.some((c) => c.amp > 0 && Math.hypot(e.x - c.x, e.z - c.z) <= c.r);
  const near = (a: Ally, list: Entity[]) => list.sort((p, q) => dist(p, a) - dist(q, a))[0] ?? null;
  w.allies.forEach((a, i) => {
    a.life -= DT;
    if (a.state === 'dead') return;
    if (hero.state === 'dead') return void (a.state = 'idle');
    if (a.decoy) return; // 허수아비는 서 있기만 한다
    if (a.rush) {
      const r = a.rush;
      const s = Math.min(r.left, LEGEND2.marchSpeed * DT);
      const [nx, nz] = [a.x + r.dx * s, a.z + r.dz * s];
      if (!walkable(w.grid, Math.floor(nx), Math.floor(nz))) return void (a.rush = undefined); // 벽에 닿으면 멈춘다
      [a.x, a.z] = [nx, nz];
      r.left -= s;
      for (const e of foes(w, hero))
        if (dist(e, a) <= 0.9 && !r.hit.includes(e.id)) {
          r.hit.push(e.id);
          hurt(w, e, Math.round(roll(w, hero) * LEGEND2.marchMult), hero);
        }
      if (r.left <= 0) a.rush = undefined;
      return;
    }
    let t = a.target === null ? null : w.entities[a.target];
    if (!t || t.state === 'dead' || (dist(t, hero) > BONES.aggro + 2 && !marked(t))) t = null; // 주인공에게서 너무 멀어지면 놓는다
    if (!t || !marked(t)) t = near(a, foes(w, hero).filter(marked)) ?? t; // 죽음의 표식: 하던 싸움을 두고 달려든다
    t ??= near(a, foes(w, hero).filter((e) => dist(e, hero) <= BONES.aggro && clearLine(w, a, e)));
    if (a.escort) t = near(a, foes(w, hero).filter((e) => dist(e, a) <= a.reach)); // 무덤 왕: 적을 쫓지 않고 닿는 적만 친다(없으면 아래에서 주인공 곁으로)
    a.target = t?.id ?? null;
    if (a.state === 'attack') {
      const before = a.attackT;
      a.attackT += DT;
      if (t) face(a, t);
      if (t && before < a.interval * HIT_AT && a.attackT >= a.interval * HIT_AT && dist(a, t) <= a.reach + 0.3) {
        const dmg = Math.round(roll(w, hero) * a.mult * (a.kind === 'king' ? 1 : aura));
        const d = dist(a, t) || 1;
        const at = t;
        if (a.kind === 'archer') w.shots.push({ id: w.nextItem++, x: a.x, z: a.z, dx: (t.x - a.x) / d, dz: (t.z - a.z) / d, dmg, left: WIZ.flight, kind: 'bolt' }); // 뼈 화살(주인공 평타와 같은 탄)
        else for (const e of a.escort ? foes(w, hero).filter((e) => dist(e, a) <= a.reach) : a.splash ? foes(w, hero).filter((e) => dist(e, at) <= a.splash!) : [t]) hurt(w, e, dmg, hero);
        if (a.kind === 'mage') blast(w, 'spark', t.x, t.z);
        if (t.target === hero.id && t.kind !== 'boss' && t.kind !== 'king') t.target = a.id;
      }
      if (a.attackT >= a.interval) Object.assign(a, { state: 'idle', attackT: 0 });
      return;
    }
    if (t && dist(a, t) <= a.reach && (a.reach < 2 || clearLine(w, a, t))) return void Object.assign(a, { state: 'attack', attackT: 0, path: [] });
    // 따라가기: 주인공 뒤쪽 부채꼴의 제자리
    const ang = hero.facing + Math.PI + (i - (w.allies.length - 1) / 2) * 0.7;
    let [gx, gz] = t ? [t.x, t.z] : [hero.x + Math.sin(ang) * 1.5, hero.z + Math.cos(ang) * 1.5];
    if (!walkable(w.grid, Math.floor(gx), Math.floor(gz))) [gx, gz] = [hero.x, hero.z];
    if (!t && Math.hypot(gx - a.x, gz - a.z) < 0.6) return void Object.assign(a, { state: 'idle', path: [] });
    if ((a.repathT -= DT) <= 0 || !a.path.length) {
      a.repathT = REPATH;
      a.path = pathTo(w, a, gx, gz) ?? [];
    }
    walk(w, a);
  });
  for (const a of w.allies) {
    for (const o of [...w.entities, ...w.allies]) {
      if (o === a || o.state === 'dead') continue;
      const d = Math.hypot(a.x - o.x, a.z - o.z);
      if (d >= RADIUS * 2 || d < 1e-6) continue;
      const k = (RADIUS * 2 - d) / d / 2;
      const [nx, nz] = [a.x + (a.x - o.x) * k, a.z + (a.z - o.z) * k];
      if (walkable(w.grid, Math.floor(nx), Math.floor(nz))) [a.x, a.z] = [nx, nz];
    }
  }
  const gone = (a: Ally) => a.life <= 0 || a.state === 'dead';
  for (const a of w.allies) {
    if (!gone(a)) continue;
    blast(w, 'blink', a.x, a.z);
    if (isBone(a) && hasUnique(w, 'boneShroud')) {
      // 뼈 왕의 수의: 해골이 쓰러지면 그 자리가 터진다
      blast(w, 'fire', a.x, a.z);
      for (const e of foes(w, hero)) if (dist(e, a) <= LEGEND_FX.boneBlastR) hurt(w, e, Math.round(roll(w, hero) * a.mult * LEGEND_FX.boneBlast), hero);
    }
    if (a.kind !== 'warrior' || !mastered(w, 'giant')) continue;
    // 시체 거인 5단계: 쓰러지며 터진다
    blast(w, 'fire', a.x, a.z);
    for (const e of foes(w, hero)) if (dist(e, a) <= GIANT.burst) hurt(w, e, Math.round(roll(w, hero) * GIANT.burstMult), hero);
  }
  w.allies = w.allies.filter((a) => !gone(a));
}

// 죽음의 표식(코드에서는 curse): 지점(사거리로 당김), 없으면 가까운 적. 반경 안의 닫힌 사슬 문은 녹는다
export function curse(w: World, hero: Entity, x?: number, z?: number): number {
  const at = spot(w, hero, CURSE.range, x, z);
  if (!at) return 0;
  const [tx, tz] = at;
  const st = curseStat(w);
  w.curses.push({ id: w.nextItem++, x: tx, z: tz, r: st.radius, t: st.time, acc: 0, amp: st.amp, plague: 0 });
  blast(w, 'curse', tx, tz, st.radius);
  for (const g of w.gates) if (!g.open && Math.hypot(g.x + 0.5 - tx, g.z + 0.5 - tz) <= st.radius + 0.5) openGate(w, g.x, g.z);
  w.casts++;
  return st.cd;
}

// 역병: 지점이 PLAGUE.time초 동안 썩어 안의 적이 PLAGUE.tick마다 피해(소환수가 먼저 노리지는 않는다)
export function plague(w: World, hero: Entity, x?: number, z?: number): number {
  const at = spot(w, hero, PLAGUE.range, x, z);
  if (!at) return 0;
  const st = plagueStat(w);
  w.curses.push({ id: w.nextItem++, x: at[0], z: at[1], r: st.radius, t: PLAGUE.time, acc: 0, amp: 0, plague: st.mult });
  blast(w, 'curse', at[0], at[1], st.radius);
  w.casts++;
  return st.cd;
}

// 표식·역병 한 틱: 역병은 PLAGUE.tick마다 피해, 표식 5단계는 안의 시체를 해골로(시체마다 한 번)
export function tickCurses(w: World, hero: Entity) {
  for (const c of w.curses) {
    const inside = (e: Entity) => e !== hero && Math.hypot(e.x - c.x, e.z - c.z) <= c.r;
    if (c.plague && (c.acc += DT) >= PLAGUE.tick - 1e-9) {
      c.acc = 0;
      const dmg = Math.round(roll(w, hero) * c.plague);
      for (const e of foes(w, hero)) if (inside(e)) hurt(w, e, dmg, hero);
    }
    const doctor = hasUnique(w, 'plagueStaff');
    if (c.amp > 0 && (doctor || mastered(w, 'curse')))
      for (const e of w.entities)
        if (e.state === 'dead' && inside(e) && !w.raised.includes(e.id)) {
          w.raised.push(e.id);
          if (doctor) spawn(w, e.x, e.z, e.kind, { life: LEGEND2.plagueLife, hp: e.maxHp, mult: 1, reach: RANGE, interval: STATS[e.kind].interval }, (a) => a.from === 'curse', 99, { from: 'curse', skin: e.skin }); // 「역병 의사의 지팡이」: 그 모습 그대로 일어난다
          else raise(w, e.x, e.z, 1);
        }
    c.t -= DT;
  }
  w.curses = w.curses.filter((c) => c.t > 0);
}

// 시체 폭발: 지점(없으면 발밑) 둘레의 아직 안 쓴 시체가 모두 터진다(터져 죽은 적도 이어서). 시체가 없으면 쓰지 않는다
export function corpseBlast(w: World, hero: Entity, x?: number, z?: number): number {
  const [cx, cz] = spot(w, hero, CORPSE.range, x, z) ?? [hero.x, hero.z];
  const dead = w.entities.filter((e) => e !== hero && e.state === 'dead' && !w.raised.includes(e.id) && Math.hypot(e.x - cx, e.z - cz) <= CORPSE.radius);
  if (!dead.length) return 0;
  const st = corpseStat(w);
  const before = w.entities.filter((e) => e.state === 'dead').length;
  burst(w, hero, dead, st.hp, CORPSE.blast);
  w.raised.push(...w.entities.filter((e) => e !== hero && e.state === 'dead').map((e) => e.id)); // 터진 시체(이어서 죽은 것도)는 다시 못 쓴다
  if (w.entities.filter((e) => e.state === 'dead').length > before) w.shouts++; // 연쇄로 죽였다: 땅 울림
  w.casts++;
  return st.cd;
}

// 뼈 창: 조준 방향으로 꿰뚫는 창(관통 사격과 같은 화살로 난다 — ranger의 arrowHit)
export function spear(w: World, hero: Entity, x?: number, z?: number): number {
  const st = spearStat(w);
  const [dx, dz] = aimDir(w, hero, PIERCE.aim, x, z);
  hero.facing = Math.atan2(dx, dz);
  w.shots.push({ id: w.nextItem++, x: hero.x, z: hero.z, dx, dz, dmg: Math.round(roll(w, hero) * st.mult), left: PIERCE.flight, kind: 'pierce' });
  w.casts++;
  return st.cd;
}

// 뼈 갑옷: 최대 체력 비율만큼 피해를 흡수(마나 방패와 같은 wardHp, 되돌림·폭발은 없다)
export function boneArmor(w: World): number {
  const st = boneArmorStat(w);
  Object.assign(w, { wardHp: Math.round(heroMax(w) * st.absorb), wardT: BONE_ARMOR.time, wardBroke: false });
  w.casts++;
  return st.cd;
}

// 뼈 감옥: 지점 둘레의 적을 뼈벽에 가둔다(피해 + 묶음, 보스·해골 왕은 짧게)
export function prison(w: World, hero: Entity, x?: number, z?: number): number {
  const at = spot(w, hero, PRISON.range, x, z);
  if (!at) return 0;
  const st = prisonStat(w);
  blast(w, 'curse', at[0], at[1], st.radius);
  blast(w, 'slam', at[0], at[1]);
  for (const e of foes(w, hero)) {
    if (Math.hypot(e.x - at[0], e.z - at[1]) > st.radius) continue;
    skillHit(w, e, Math.round(roll(w, hero) * st.mult));
    stun(e, e.kind === 'boss' || e.kind === 'king' ? PRISON.big : st.time);
    blast(w, 'ice', e.x, e.z);
  }
  w.casts++;
  return st.cd;
}
