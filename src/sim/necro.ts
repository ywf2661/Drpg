// 강령술사 스킬: 뼈 화살(평타 = 마법사 마력탄), 해골 소환(Q), 시체 거인(W), 죽음의 표식(E), 해골 왕 강림(R). 스페이스는 기사 구르기.
// 스킬 칸·명령·재사용 필드·단계·특성은 다른 직업과 같은 것을 쓴다(rules의 HeroClass 설명). 표식 배율은 core의 hurt
import { walkable } from './path';
import { BONE_KINDS, BONES, CURSE, DT, GIANT, HIT_AT, LORD, RADIUS, REPATH, WIZ, type Ally, type Entity, type Kind, type SkillName, type World } from './rules';
import { clearLine, dist, face, heroMax, hurt, makeEntity, mastered, pathTo, roll, walk } from './core';
import { openGate } from './abilities';
import { blast, foes, nearest } from './wizard';

const extra = (w: World, s: SkillName) => w.ranks[s] - 1;
type BoneKind = keyof typeof BONE_KINDS;
export function bonesStat(w: World) {
  const horde = w.traits.cleave === 1;
  const strong = w.traits.cleave === 2;
  const rank = w.ranks.cleave;
  const count = BONES.count + (rank >= 3 ? 1 : 0) + (mastered(w, 'cleave') ? 1 : 0) + (horde ? BONES.horde : 0);
  // 검사 → 궁수 → 법사 순서로 되풀이. 궁수·법사는 단계가 올라야 섞인다
  const kinds = Array.from({ length: count }, (_, k): BoneKind => (k % 3 === 1 && rank >= BONES.archerAt ? 'archer' : k % 3 === 2 && rank >= BONES.mageAt ? 'mage' : 'minion'));
  return {
    cd: BONES.cd - 0.4 * extra(w, 'cleave'),
    count,
    kinds,
    max: count + 2,
    life: BONES.life * (strong ? BONES.strongLife : 1),
    hp: Math.round(heroMax(w) * BONES.hp * (strong ? BONES.strongLife : 1)), // 몬스터에게 맞아 0이 되면 무너진다
    mult: (BONES.mult + 0.08 * extra(w, 'cleave')) * (horde ? BONES.hordeMult : 1) * (strong ? BONES.strong : 1),
  };
}
export const giantStat = (w: World) => ({
  cd: GIANT.cd - extra(w, 'dash'),
  life: GIANT.life,
  hp: Math.round(heroMax(w) * (GIANT.hp + 0.25 * extra(w, 'dash')) * (w.traits.dash === 1 ? GIANT.thick : 1)),
  mult: GIANT.mult + 0.1 * extra(w, 'dash'),
});
export const lordStat = (w: World) => ({
  cd: LORD.cd - 2 * extra(w, 'throw'),
  life: LORD.life * (w.traits.throw === 2 ? LORD.long : 1),
  hp: Math.round(heroMax(w) * (LORD.hp + 0.3 * extra(w, 'throw'))),
  mult: LORD.mult + 0.15 * extra(w, 'throw'),
});
export const curseStat = (w: World) => ({
  cd: CURSE.cd - 0.5 * extra(w, 'shout'),
  radius: (CURSE.radius + 0.15 * extra(w, 'shout')) * (w.traits.shout === 1 ? CURSE.wide : 1),
  time: CURSE.time + 0.5 * extra(w, 'shout'),
  amp: CURSE.amp + 0.05 * extra(w, 'shout'),
});

const isBone = (a: Ally) => a.kind !== 'warrior' && a.kind !== 'king'; // 거인·왕은 해골 수에 세지 않는다
// 소환수 하나를 (x, z)에. same 종류가 max를 넘으면 오래된 것부터 무너진다
function spawn(w: World, x: number, z: number, kind: Kind, st: Pick<Ally, 'life' | 'hp' | 'mult' | 'reach' | 'interval' | 'splash'>, same: (a: Ally) => boolean, max: number, more: Partial<Entity> = {}) {
  const a: Ally = { ...makeEntity(-(w.nextItem++) - 1, kind, x, z, 1), ...more, ...st, maxHp: st.hp }; // 음수 id: core의 byId
  w.allies.push(a);
  blast(w, 'blink', x, z);
  const over = w.allies.filter(same).slice(0, -max);
  w.allies = w.allies.filter((o) => !over.includes(o));
  return a;
}

// (x, z) 둘레에 해골 n기를 일으킨다(종류는 해골 소환 단계의 순서대로)
export function raise(w: World, x: number, z: number, n: number) {
  const st = bonesStat(w);
  for (let k = 0; k < n; k++) {
    const a = (k / Math.max(1, n)) * Math.PI * 2 + w.nextItem;
    const [sx, sz] = [x + Math.sin(a) * 0.8, z + Math.cos(a) * 0.8];
    const [ax, az] = walkable(w.grid, Math.floor(sx), Math.floor(sz)) ? [sx, sz] : [x, z];
    const kind = st.kinds[k % st.kinds.length];
    const b: { hp: number; mult: number; interval: number; reach: number; splash?: number } = BONE_KINDS[kind];
    spawn(w, ax, az, kind, { life: st.life, hp: Math.round(st.hp * b.hp), mult: st.mult * b.mult, reach: b.reach, interval: b.interval, splash: b.splash }, isBone, st.max);
  }
}

// 해골 소환: 주인공 둘레에 소환
export function bones(w: World, hero: Entity) {
  if (w.skillCd > 0) return;
  const st = bonesStat(w);
  raise(w, hero.x, hero.z, st.count);
  w.casts++;
  w.skillCd = st.cd;
}

// 시체 거인: 튼튼한 거인 하나(다시 쓰면 바뀐다). 나타나며 주변 적(보스·해골 왕 제외)의 눈길을 끈다. 강타(특성 2): 때릴 때 주변도 함께
export function giant(w: World, hero: Entity) {
  if (w.dashCd > 0) return;
  const st = giantStat(w);
  const g = spawn(w, hero.x, hero.z, 'warrior', { life: st.life, hp: st.hp, mult: st.mult, reach: GIANT.reach, interval: GIANT.interval, splash: w.traits.dash === 2 ? GIANT.smash : undefined }, (a) => a.kind === 'warrior', 1, { skin: 'zombie', elite: true });
  for (const e of foes(w, hero)) if (dist(e, g) <= GIANT.taunt && e.kind !== 'boss' && e.kind !== 'king') e.target = g.id;
  w.casts++;
  w.dashCd = st.cd;
}

// 해골 왕 강림: 가장 센 소환수 하나, 휘두르면 주변도 함께 맞는다. 군주(특성 1): 왕이 있는 동안 다른 소환수 피해 증가. 5단계: 해골도 함께
export function lord(w: World, hero: Entity) {
  if (w.throwCd > 0) return;
  const st = lordStat(w);
  spawn(w, hero.x, hero.z, 'king', { life: st.life, hp: st.hp, mult: st.mult, reach: LORD.reach, interval: LORD.interval, splash: LORD.splash }, (a) => a.kind === 'king', 1);
  if (mastered(w, 'throw')) raise(w, hero.x, hero.z, LORD.guard);
  w.casts++;
  w.throwCd = st.cd;
}

// 소환수 한 틱: 표식 안의 적이 먼저, 아니면 주인공 가까이(BONES.aggro 안)의 적을 쫓아 공격, 적이 없으면 주인공 뒤를 따른다. 시간이 다 되거나 맞아 죽으면 사라진다.
// 소환수에게 맞은 몬스터는 주인공 대신 그 소환수를 노린다(보스·해골 왕은 한눈팔지 않는다)
// ponytail: 소환수끼리·몬스터와는 겹치지 않게 소환수만 밀린다(separate는 entities만 본다)
export function tickAllies(w: World, hero: Entity) {
  const aura = w.traits.throw === 1 && w.allies.some((a) => a.kind === 'king') ? LORD.aura : 1;
  const marked = (e: Entity) => w.curses.some((c) => Math.hypot(e.x - c.x, e.z - c.z) <= c.r);
  const near = (a: Ally, list: Entity[]) => list.sort((p, q) => dist(p, a) - dist(q, a))[0] ?? null;
  w.allies.forEach((a, i) => {
    a.life -= DT;
    if (a.state === 'dead') return;
    if (hero.state === 'dead') return void (a.state = 'idle');
    let t = a.target === null ? null : w.entities[a.target];
    if (!t || t.state === 'dead' || (dist(t, hero) > BONES.aggro + 2 && !marked(t))) t = null; // 주인공에게서 너무 멀어지면 놓는다
    if (!t || !marked(t)) t = near(a, foes(w, hero).filter(marked)) ?? t; // 죽음의 표식: 하던 싸움을 두고 달려든다
    t ??= near(a, foes(w, hero).filter((e) => dist(e, hero) <= BONES.aggro && clearLine(w, a, e)));
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
        else for (const e of a.splash ? foes(w, hero).filter((e) => dist(e, at) <= a.splash!) : [t]) hurt(w, e, dmg, hero);
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
    if (a.kind !== 'warrior' || !mastered(w, 'dash')) continue;
    // 시체 거인 5단계: 쓰러지며 터진다
    blast(w, 'fire', a.x, a.z);
    for (const e of foes(w, hero)) if (dist(e, a) <= GIANT.burst) hurt(w, e, Math.round(roll(w, hero) * GIANT.burstMult), hero);
  }
  w.allies = w.allies.filter((a) => !gone(a));
}

// 죽음의 표식(코드에서는 curse): 조준점(사거리로 당김), 없으면 가까운 적. 조준점도 적도 없으면 쓰지 않는다. 반경 안의 닫힌 사슬 문은 녹는다
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

// 표식 한 틱: 역병(특성 2)은 CURSE.tick마다 피해, 5단계는 안의 시체를 해골로(시체마다 한 번)
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
