// 강령술사 스킬: 뼈 화살(평타 = 마법사 마력탄), 해골 병사(Q), 생명 흡수(W), 저주(E), 뼈 갑옷(R). 스페이스는 기사 구르기.
// 스킬 칸·명령·재사용 필드·단계·특성은 다른 직업과 같은 것을 쓴다(rules의 HeroClass 설명). 저주 배율은 core의 hurt
import { walkable } from './path';
import { BONE_ARMOR, BONES, CURSE, DRAIN, DT, HIT_AT, RADIUS, REPATH, type Ally, type Entity, type SkillName, type World } from './rules';
import { clearLine, dist, face, heroMax, hurt, makeEntity, mastered, pathTo, roll, skillHit, walk } from './core';
import { openGate } from './abilities';
import { blast, foes, nearest } from './wizard';

const extra = (w: World, s: SkillName) => w.ranks[s] - 1;
export function bonesStat(w: World) {
  const horde = w.traits.cleave === 1;
  const strong = w.traits.cleave === 2;
  const more = (horde ? BONES.horde : 0) + (mastered(w, 'cleave') ? 1 : 0);
  return {
    cd: BONES.cd - 0.4 * extra(w, 'cleave'),
    count: BONES.count + more,
    max: BONES.max + more,
    life: BONES.life * (strong ? BONES.strongLife : 1),
    hp: Math.round(heroMax(w) * BONES.hp * (strong ? BONES.strongLife : 1)), // 몬스터에게 맞아 0이 되면 무너진다
    mult: (BONES.mult + 0.08 * extra(w, 'cleave')) * (horde ? BONES.hordeMult : 1) * (strong ? BONES.strong : 1),
  };
}
export const drainStat = (w: World) => ({
  cd: DRAIN.cd - 0.5 * extra(w, 'dash'),
  radius: DRAIN.radius * (w.traits.dash === 1 ? DRAIN.wide : 1),
  mult: DRAIN.mult + 0.2 * extra(w, 'dash'),
  heal: DRAIN.heal * (w.traits.dash === 2 ? 2 : 1),
});
export const curseStat = (w: World) => ({
  cd: CURSE.cd - 0.5 * extra(w, 'shout'),
  radius: (CURSE.radius + 0.15 * extra(w, 'shout')) * (w.traits.shout === 1 ? CURSE.wide : 1),
  time: CURSE.time + 0.5 * extra(w, 'shout'),
  amp: CURSE.amp + 0.05 * extra(w, 'shout'),
});
export const armorStat = (w: World) => ({ cd: BONE_ARMOR.cd - extra(w, 'throw'), absorb: BONE_ARMOR.absorb + 0.05 * extra(w, 'throw') });

// (x, z) 둘레에 해골 n기를 일으킨다. 최대 수를 넘으면 오래된 것부터 무너진다
export function raise(w: World, x: number, z: number, n: number) {
  const st = bonesStat(w);
  for (let k = 0; k < n; k++) {
    const a = (k / Math.max(1, n)) * Math.PI * 2 + w.nextItem;
    const [sx, sz] = [x + Math.sin(a) * 0.8, z + Math.cos(a) * 0.8];
    const [ax, az] = walkable(w.grid, Math.floor(sx), Math.floor(sz)) ? [sx, sz] : [x, z];
    const b: Ally = { ...makeEntity(-(w.nextItem++) - 1, 'minion', ax, az, 1), life: st.life, hp: st.hp, maxHp: st.hp }; // 음수 id: core의 byId
    w.allies.push(b);
    blast(w, 'blink', ax, az);
  }
  w.allies = w.allies.slice(-st.max);
}

// 해골 병사: 주인공 둘레에 소환
export function bones(w: World, hero: Entity) {
  if (w.skillCd > 0) return;
  const st = bonesStat(w);
  raise(w, hero.x, hero.z, st.count);
  w.casts++;
  w.skillCd = st.cd;
}

// 해골 한 틱: 주인공 가까이(BONES.aggro 안)의 적을 쫓아 근접 공격, 적이 없으면 주인공 뒤를 따른다. 시간이 다 되거나 맞아 죽으면 사라진다.
// 해골에게 맞은 몬스터는 주인공 대신 그 해골을 노린다(보스·해골 왕은 한눈팔지 않는다)
// ponytail: 해골끼리·몬스터와는 겹치지 않게 해골만 밀린다(separate는 entities만 본다)
export function tickAllies(w: World, hero: Entity) {
  const st = bonesStat(w);
  w.allies.forEach((a, i) => {
    a.life -= DT;
    if (a.state === 'dead') return;
    if (hero.state === 'dead') return void (a.state = 'idle');
    let t = a.target === null ? null : w.entities[a.target];
    if (!t || t.state === 'dead' || dist(t, hero) > BONES.aggro + 2) t = null; // 주인공에게서 너무 멀어지면 놓는다
    t ??= foes(w, hero)
      .filter((e) => dist(e, hero) <= BONES.aggro && clearLine(w, a, e))
      .sort((p, q) => dist(p, a) - dist(q, a))[0] ?? null;
    a.target = t?.id ?? null;
    if (a.state === 'attack') {
      const before = a.attackT;
      a.attackT += DT;
      if (t) face(a, t);
      if (t && before < BONES.interval * HIT_AT && a.attackT >= BONES.interval * HIT_AT && dist(a, t) <= BONES.reach + 0.3) {
        hurt(w, t, Math.round(roll(w, hero) * st.mult), hero);
        if (t.target === hero.id && t.kind !== 'boss' && t.kind !== 'king') t.target = a.id;
      }
      if (a.attackT >= BONES.interval) Object.assign(a, { state: 'idle', attackT: 0 });
      return;
    }
    if (t && dist(a, t) <= BONES.reach) return void Object.assign(a, { state: 'attack', attackT: 0, path: [] });
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
  for (const a of w.allies) if (gone(a)) blast(w, 'blink', a.x, a.z);
  w.allies = w.allies.filter((a) => !gone(a));
}

// 생명 흡수: 반경 안(벽에 가리지 않은) 적 모두 피해, 준 피해의 일부 회복. 5단계: 맞힌 적이 있으면 해골 1기
export function drain(w: World, hero: Entity) {
  if (w.dashCd > 0) return;
  const st = drainStat(w);
  let dealt = 0;
  for (const e of foes(w, hero)) {
    if (dist(e, hero) > st.radius || !clearLine(w, hero, e)) continue;
    const hp = e.hp;
    skillHit(w, e, Math.round(roll(w, hero) * st.mult));
    dealt += hp - e.hp;
    blast(w, 'spark', e.x, e.z);
  }
  hero.hp = Math.min(hero.maxHp, hero.hp + Math.round(dealt * st.heal));
  blast(w, 'heal', hero.x, hero.z);
  if (dealt > 0 && mastered(w, 'dash')) raise(w, hero.x, hero.z, 1);
  w.casts++;
  w.dashCd = st.cd;
}

// 저주: 조준점(사거리로 당김), 없으면 가까운 적. 조준점도 적도 없으면 쓰지 않는다. 반경 안의 닫힌 사슬 문은 녹는다
export function curse(w: World, hero: Entity, x?: number, z?: number) {
  if (w.shoutCd > 0) return;
  let [tx, tz] = [x, z];
  if (tx === undefined || tz === undefined) {
    const t = nearest(w, hero, CURSE.range);
    if (!t) return;
    [tx, tz] = [t.x, t.z];
  }
  const d = Math.hypot(tx - hero.x, tz - hero.z);
  if (d > CURSE.range) [tx, tz] = [hero.x + ((tx - hero.x) * CURSE.range) / d, hero.z + ((tz - hero.z) * CURSE.range) / d];
  if (d > 1e-6) hero.facing = Math.atan2(tx - hero.x, tz - hero.z);
  const st = curseStat(w);
  w.curses.push({ id: w.nextItem++, x: tx, z: tz, r: st.radius, t: st.time, acc: 0, amp: st.amp });
  blast(w, 'curse', tx, tz, st.radius);
  for (const g of w.gates) if (!g.open && Math.hypot(g.x + 0.5 - tx, g.z + 0.5 - tz) <= st.radius + 0.5) openGate(w, g.x, g.z);
  w.casts++;
  w.shoutCd = st.cd;
}

// 저주 한 틱: 역병(특성 2)은 CURSE.tick마다 피해, 5단계는 안의 시체를 해골로(시체마다 한 번)
export function tickCurses(w: World, hero: Entity) {
  for (const c of w.curses) {
    const inside = (e: Entity) => e !== hero && Math.hypot(e.x - c.x, e.z - c.z) <= c.r;
    if (w.traits.shout === 2 && (c.acc += DT) >= CURSE.tick - 1e-9) {
      c.acc = 0;
      const dmg = Math.round(roll(w, hero) * CURSE.plague);
      for (const e of foes(w, hero)) if (inside(e)) hurt(w, e, dmg, hero);
    }
    if (mastered(w, 'shout'))
      for (const e of w.entities)
        if (e.state === 'dead' && inside(e) && !w.raised.includes(e.id)) {
          w.raised.push(e.id);
          raise(w, e.x, e.z, 1);
        }
    c.t -= DT;
  }
  w.curses = w.curses.filter((c) => c.t > 0);
}

// 뼈 갑옷: 최대 체력 비율만큼 흡수(마나 방패 장치: core의 hurt가 깎고, 가시 뼈(특성 2)는 반사, 5단계는 wizard의 tickWard가 폭발).
// 시체 일으키기(특성 1): 해골도 일으킨다
export function boneArmor(w: World, hero: Entity) {
  if (w.throwCd > 0) return;
  const st = armorStat(w);
  Object.assign(w, { wardHp: Math.round(heroMax(w) * st.absorb), wardT: BONE_ARMOR.time, wardBroke: false });
  if (w.traits.throw === 1) raise(w, hero.x, hero.z, BONE_ARMOR.raise);
  w.casts++;
  w.throwCd = st.cd;
}
