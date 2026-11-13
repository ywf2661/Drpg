// 공용 전투·이동 도구: 난수, 거리·시야, 데미지·피해·드롭, 레벨, 걷기. world·abilities가 함께 쓴다.
import { findPath, walkable, type Cell } from './path';
import { AFFIXES, ARCHER, BAG, CLASSES, FROST, SLOTS, WARD, WIZ, type Gear, type HeroClass, type Slot, AXE, COMBO, DASH, DMG_SCALE, DT, ELITE, METEOR, MONSTER_DMG, RANK_MAX, SHOUT, SKILL, SLAM, TELL, type SkillName, GEAR_DROP, GOLD, GOLD_ELITE, KING, MAGE, POTION, QUALITY, RANGE, STATS, XP, heroMaxHp, xpToNext, type Affix, type AffixKind, type BagItem, type Entity, type GearItem, GEAR_SIZE, type Item, type Kind, type Point, type World } from './rules';

// 레벨·경험치를 정하고 주인공 체력을 그 레벨의 최대치로(main이 층을 만들 때)
export function setLevel(w: World, level: number, xp: number) {
  w.level = level;
  w.xp = xp;
  const hero = w.entities[0];
  hero.maxHp = hero.hp = heroMax(w);
}

// 스킬 단계별 수치(1단계 = 기본값, 단계마다 조금씩 강해진다)
const extra = (w: World, s: SkillName) => w.ranks[s] - 1;
export const cleaveStat = (w: World) => ({ cd: SKILL.cd - 0.3 * extra(w, 'cleave'), radius: SKILL.radius + 0.2 * extra(w, 'cleave'), mult: SKILL.mult + 0.2 * extra(w, 'cleave') });
export const dashStat = (w: World) => ({ cd: DASH.cd - 0.5 * extra(w, 'dash'), dist: DASH.dist + 0.5 * extra(w, 'dash'), mult: 1 + 0.2 * extra(w, 'dash') });
export const shoutStat = (w: World) => ({
  cd: SHOUT.cd - extra(w, 'shout'),
  stun: SHOUT.stun + 0.3 * extra(w, 'shout'),
  reduce: SHOUT.reduce + 0.04 * extra(w, 'shout'),
  radius: SHOUT.radius + 0.3 * extra(w, 'shout'),
});
export const axeStat = (w: World) => ({ cd: AXE.cd - 0.2 * extra(w, 'throw'), mult: AXE.mult + 0.25 * extra(w, 'throw') });

// 5단계 완성 효과가 있는가(가르기 한 바퀴, 돌진 처치 시 초기화, 함성 회복, 도끼 관통)
export const mastered = (w: World, s: SkillName) => w.ranks[s] >= RANK_MAX;

// 공격을 준비 중인가: 예고 자세(내려찍기·돌진·소환)이거나 근접 평타가 아직 맞기 전. 붉게 보이고, 스킬로 치면 받아치기
export const winding = (e: Entity) => e.phase === 'windup' || (e.state === 'attack' && e.attackT < (TELL[e.kind] ?? 0));

// 스킬 피해(가르기·돌진·도끼). 연계: 예고 중인 적은 받아치기 ×2, 기절한 적은 약점 ×1.5, 공포로 도망치는 적은 등 뒤 ×2(기록을 남겨 화면에 글자가 뜬다)
export function skillHit(w: World, e: Entity, raw: number) {
  const kind = winding(e) ? 'counter' : e.stunT > 0 ? 'stunned' : e.fearT > 0 ? 'back' : null;
  if (kind) w.combos.push({ id: w.nextItem++, x: e.x, z: e.z, kind, age: 0 });
  hurt(w, e, kind ? Math.round(raw * COMBO[kind]) : raw, w.entities[0]);
}

// 주인공 최대 체력 = 직업·레벨 + 투구 + 모든 부위의 '튼튼한' 옵션
export const heroMax = (w: World) => heroMaxHp(w.level, w.cls) + CLASSES[w.cls].helms[w.gear.helm - 1].hp + worn(w, 'life');

// 옵션 목록에서 한 종류의 값 합
export const mod = (list: Affix[], kind: AffixKind) => list.reduce((s, a) => s + (a.kind === kind ? a.value : 0), 0);
// 부위별 옵션 목록 복사(층·상점으로 넘길 때)
export const copyMods = (m: World['mods']): World['mods'] => ({ weapon: [...m.weapon], armor: [...m.armor], helm: [...m.helm], boots: [...m.boots] });
// 장착한 모든 부위에서 한 종류의 값 합
const total = (m: World['mods'], kind: AffixKind) => SLOTS.reduce((s, sl) => s + mod(m[sl], kind), 0);
export const worn = (w: World, kind: AffixKind) => total(w.mods, kind);

// 이동 속도(m/s). 주인공은 신발 + '날랜' 옵션
export const moveSpeed = (w: World, e: Entity) => (e.kind === 'hero' ? STATS.hero.speed * (1 + CLASSES[w.cls].boots[w.gear.boots - 1].move + worn(w, 'move') / 100) : STATS[e.kind].speed);

// 장비 점수(자동 장착 비교). 무기 = 옵션을 반영한 초당 데미지(흡혈은 가산), 방어구(갑옷·투구·신발) = 세 부위를 합쳐 버티는 체력(재생·가시·이동 속도 가산)
export function weaponScore(tier: number, aff: Affix[], cls: HeroClass = 'knight'): number {
  const wpn = CLASSES[cls].weapons[tier - 1];
  const avg = (wpn.dmg[0] + wpn.dmg[1]) / 2;
  const p = (k: AffixKind) => mod(aff, k) / 100;
  return ((avg * (1 + p('dmg')) * (1 + p('crit')) * (1 + p('speed'))) / wpn.interval) * (1 + 2 * p('leech'));
}

export function defenseScore(g: Gear, m: World['mods'], cls: HeroClass = 'knight'): number {
  const c = CLASSES[cls];
  const p = (k: AffixKind) => total(m, k) / 100;
  const reduce = Math.min(0.75, c.armors[g.armor - 1].reduce + p('guard'));
  const move = c.boots[g.boots - 1].move + p('move');
  return ((100 + c.helms[g.helm - 1].hp + total(m, 'life')) / (1 - reduce)) * (1 + p('regen')) * (1 + 0.3 * p('thorns')) * (1 + 0.5 * move);
}

// 장비 점수 − 입은 장비의 점수(양수면 더 좋다)
export function gearDiff(w: World, it: GearItem): number {
  if (it.kind === 'weapon') return weaponScore(it.tier, it.affixes, w.cls) - weaponScore(w.gear.weapon, w.mods.weapon, w.cls);
  return defenseScore({ ...w.gear, [it.kind]: it.tier }, { ...w.mods, [it.kind]: it.affixes }, w.cls) - defenseScore(w.gear, w.mods, w.cls);
}

// 장비가 지금 장착한 것보다 나은가
export function isBetter(w: World, it: Item | GearItem): boolean {
  if (it.kind === 'potion' || it.kind === 'gold') return false;
  return gearDiff(w, { kind: it.kind, tier: it.tier, affixes: it.affixes ?? [] }) > 1e-9;
}

// 장비를 입고 벗은 장비를 돌려준다. '튼튼한'이 바뀌면 체력 비율을 유지한다(맞바꿈이 공짜라서 이득도 손해도 없게).
// 반올림하지 않는다: 서로 다른 갑옷을 번갈아 입을 때 반올림이 쌓이면 체력이 오를 수 있다
export function wear(w: World, it: GearItem): GearItem {
  const old: GearItem = { kind: it.kind, tier: w.gear[it.kind], affixes: w.mods[it.kind] };
  w.gear[it.kind] = it.tier;
  w.mods[it.kind] = it.affixes;
  const hero = w.entities[0];
  const max = heroMax(w);
  hero.hp *= max / hero.maxHp;
  hero.maxHp = max;
  return old;
}

// 보관함 조작. 창이 열린 동안 sim이 멈추므로 명령 큐를 거치지 않고 바로 부른다(난수 없음).
// ponytail: 멀티플레이를 넣을 때 명령으로 옮기고, 서버가 틱 사이에 처리하게 할 것
// 벗은 장비는 크기가 다를 수 있다: 같은 자리 → 빈 자리 순으로 놓고, 둘 다 안 되면 입지 않는다(false)
export function equipFromBag(w: World, i: number): boolean {
  const it = w.bag[i];
  if (w.entities[0].state === 'dead' || !it) return false;
  const old: GearItem = { kind: it.kind, tier: w.gear[it.kind], affixes: w.mods[it.kind] };
  const rest = w.bag.filter((_, k) => k !== i);
  const at = bagFits(rest, old, it.x, it.y) ? [it.x, it.y] : bagSpot(rest, old);
  if (!at) return false;
  wear(w, it);
  w.bag[i] = { ...old, x: at[0], y: at[1] };
  return true;
}

// 그 칸으로 옮긴다(격자 밖·겹침이면 그대로). 층 입구 기록과 객체를 나눠 쓰므로 새 객체로 바꾼다
export function moveInBag(w: World, i: number, x: number, y: number) {
  const it = w.bag[i];
  if (w.entities[0].state !== 'dead' && it && bagFits(w.bag, it, x, y, i)) w.bag[i] = { ...it, x, y };
}

export const gearSize = (it: Pick<GearItem, 'kind' | 'tier'>) => GEAR_SIZE[it.kind][it.tier - 1];

// (x, y)에 놓을 수 있는가: 격자 안이고 다른 장비(skip번 제외)와 겹치지 않는다
export function bagFits(bag: BagItem[], it: Pick<GearItem, 'kind' | 'tier'>, x: number, y: number, skip = -1): boolean {
  const [w, h] = gearSize(it);
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x + w > BAG.w || y + h > BAG.h) return false;
  return bag.every((o, k) => {
    const [ow, oh] = gearSize(o);
    return k === skip || x >= o.x + ow || o.x >= x + w || y >= o.y + oh || o.y >= y + h;
  });
}

// 놓을 수 있는 첫 자리(왼쪽 열부터 위에서 아래로). 없으면 null
export function bagSpot(bag: BagItem[], it: Pick<GearItem, 'kind' | 'tier'>): [number, number] | null {
  for (let x = 0; x < BAG.w; x++) for (let y = 0; y < BAG.h; y++) if (bagFits(bag, it, x, y)) return [x, y];
  return null;
}

export function discardFromBag(w: World, i: number) {
  if (w.entities[0].state !== 'dead' && w.bag[i]) w.bag.splice(i, 1);
}

// 보관함에 자리가 없어 발밑 장비를 못 줍는 중인가
export function bagBlocked(w: World): boolean {
  const hero = w.entities[0];
  return w.items.some((it) => it.kind !== 'potion' && it.kind !== 'gold' && Math.hypot(it.x - hero.x, it.z - hero.z) <= POTION.pickup && !bagSpot(w.bag, { kind: it.kind, tier: it.tier }));
}

// 장비 아이템 굴림: 등급(옵션 0·1·2개) → 부위에 맞는 서로 다른 옵션, 값은 범위 안 균등
export function rollGear(w: World, x: number, z: number, kind: Slot, tier: number, boosted = false): Item {
  const odds = boosted ? QUALITY.boosted : QUALITY.normal;
  const r = rand(w);
  const n = r < odds[0] ? 0 : r < odds[0] + odds[1] ? 1 : 2;
  const pool = (Object.keys(AFFIXES) as AffixKind[]).filter((k) => AFFIXES[k].slots.includes(kind));
  const affixes: Affix[] = [];
  for (let i = 0; i < n; i++) {
    const k = pool.splice(Math.floor(rand(w) * pool.length), 1)[0];
    const { lo, hi } = AFFIXES[k];
    affixes.push({ kind: k, value: lo + Math.floor(rand(w) * (hi - lo + 1)) });
  }
  return { id: w.nextItem++, x, z, kind, tier, affixes };
}

// 떨어뜨릴 장비 부위(고르게)
export const randSlot = (w: World): Slot => SLOTS[Math.floor(rand(w) * SLOTS.length)];

// 경험치를 얻고, 다음 레벨 몫을 넘을 때마다 레벨업(남는 양은 이월). 레벨업하면 체력 완전 회복
export function gainXp(w: World, n: number) {
  w.xp += n;
  const before = w.level;
  while (w.xp >= xpToNext(w.level)) w.xp -= xpToNext(w.level++);
  w.points += w.level - before; // 레벨마다 스킬 포인트 1
  if (w.level !== before) setLevel(w, w.level, w.xp);
}

export function makeEntity(id: number, kind: Kind, x: number, z: number, power: number, elite = false, summoner = -1): Entity {
  const hp = Math.round(STATS[kind].hp * power * (elite ? ELITE.hp : 1));
  return { id, kind, x, z, elite, summoner, stunT: 0, fearT: 0, facing: 0, hp, maxHp: hp, power, state: 'idle', path: [], target: null, attackT: 0, repathT: 0, skill: false, phase: 'none', phaseT: 0, cd: kind === 'warrior' ? SLAM.first + (id % 3) : kind === 'mage' ? METEOR.first + (id % 3) : 0, dx: 0, dz: 0 };
}

// 한 번 휘두르는 데 걸리는 시간. 주인공은 장착 무기를 따른다
export function attackInterval(w: World, e: Entity): number {
  return e.kind === 'hero' ? CLASSES[w.cls].weapons[w.gear.weapon - 1].interval / (1 + mod(w.mods.weapon, 'speed') / 100) : STATS[e.kind].interval;
}

// 공격자 a의 데미지 굴림(무기·레벨·층 배율)
export function roll(w: World, a: Entity) {
  const [lo, hi] = a.kind === 'hero' ? CLASSES[w.cls].weapons[w.gear.weapon - 1].dmg : STATS[a.kind].dmg;
  // 주인공은 레벨 보너스, 몬스터는 층 배율의 절반만(체력과 데미지에 다 곱하면 난이도가 배율의 제곱으로 오른다)
  // 주인공의 무기 옵션: 데미지%, 치명타(옵션이 있을 때만 굴림 → 옵션 없는 판은 난수열이 그대로)
  const scale = a.kind === 'hero' ? (1 + 0.05 * (w.level - 1)) * (1 + mod(w.mods.weapon, 'dmg') / 100) : (1 + (a.power - 1) * DMG_SCALE) * MONSTER_DMG * (a.elite ? ELITE.dmg : 1);
  const crit = a.kind === 'hero' ? mod(w.mods.weapon, 'crit') : 0;
  const twice = crit > 0 && rand(w) < crit / 100 ? 2 : 1;
  return Math.round((lo + Math.floor(rand(w) * (hi - lo + 1))) * scale) * twice;
}

export function damage(w: World, a: Entity, t: Entity) {
  hurt(w, t, roll(w, a), a);
}

// 피해 적용: 주인공은 갑옷(+단단한)으로 줄이되 최소 1. from이 주인공이면 흡혈, 근접(from)이 주인공을 치면 가시 반사.
// 몬스터가 죽으면 경험치·드롭. 실제로 준 피해를 돌려준다
export function hurt(w: World, t: Entity, raw: number, from?: Entity): number {
  if (t.kind === 'hero' && t.phase === 'roll') {
    w.combos.push({ id: w.nextItem++, x: t.x, z: t.z, kind: 'dodge', age: 0 }); // 구르는 중: 무적
    return 0;
  }
  let dmg = raw;
  // 주인공: 갑옷(+단단한) 감소, 함성·서리 갑옷 중이면 추가 감소, 마나 방패가 먼저 흡수(반사 특성이면 근접 공격자에게 일부 되돌림)
  if (t.kind === 'hero') {
    dmg = Math.max(1, Math.round(dmg * (1 - Math.min(0.75, CLASSES[w.cls].armors[w.gear.armor - 1].reduce + worn(w, 'guard') / 100)) * (w.shoutT > 0 ? 1 - (w.cls === 'wizard' ? FROST.armor : shoutStat(w).reduce) : 1)));
    const absorbed = Math.min(w.wardHp, dmg);
    if (absorbed > 0) {
      w.wardHp -= absorbed;
      dmg -= absorbed;
      if (w.traits.throw === 2 && from && from.state !== 'dead') hurt(w, from, Math.round(absorbed * WARD.reflect));
      if (!w.wardHp) w.wardBroke = true; // 깨짐(5단계 폭발은 wizard.ts가 다음 틱에)
    }
  }
  const dealt = Math.min(t.hp, dmg);
  t.hp = Math.max(0, t.hp - dmg);
  const hero = w.entities[0];
  const leech = from?.kind === 'hero' ? Math.round((dealt * mod(w.mods.weapon, 'leech')) / 100) : 0;
  if (leech > 0 && hero.state !== 'dead') hero.hp = Math.min(hero.maxHp, hero.hp + leech);
  const thorns = t.kind === 'hero' && from && from.state !== 'dead' ? Math.round((dealt * worn(w, 'thorns')) / 100) : 0;
  if (thorns > 0) hurt(w, from!, thorns);
  if (t.hp > 0) return dealt;
  t.state = 'dead';
  t.path = [];
  t.target = null;
  if (t.kind === 'hero') return dealt;
  if (t.kind === 'king') {
    // 해골 왕: 최고 단계 장비(마법 이상)·금화·물약 확정
    gainXp(w, Math.round(XP.king * t.power));
    w.items.push(rollGear(w, t.x, t.z, randSlot(w), w.maxTier, true));
    w.items.push({ id: w.nextItem++, x: t.x - 0.3, z: t.z, kind: 'potion', tier: 0 });
    dropGold(w, t.x + 0.3, t.z, KING.gold[0], KING.gold[1], t.power);
    return dealt;
  }
  gainXp(w, Math.round(XP[t.kind] * t.power * (t.elite ? ELITE.xp : 1)));
  const drop = (kind: Item['kind'], tier: number) => w.items.push({ id: w.nextItem++, x: t.x, z: t.z, kind, tier });
  if (rand(w) < POTION.drop[t.kind]) drop('potion', 0);
  const g = t.elite ? { chance: 1, ...GOLD_ELITE } : GOLD[t.kind];
  if (g.chance > 0 && rand(w) < g.chance) dropGold(w, t.x + 0.3, t.z, g.lo, g.hi, t.power);
  if (t.elite) w.items.push(rollGear(w, t.x, t.z, randSlot(w), w.maxTier, true)); // 정예: 최고 단계·마법 이상 확정
  else if (rand(w) < GEAR_DROP[t.kind]) w.items.push(rollGear(w, t.x, t.z, randSlot(w), 1 + Math.floor(rand(w) * w.maxTier)));
  return dealt;
}

// 스킬에 맞아 밀려남: 단위 방향 (dx, dz)로 d만큼 0.1m씩, 벽 앞에서 멈춘다. 살아 있으면 하던 휘두르기·이동·예고가 끊긴다.
// 보스·해골 왕은 밀리지도 끊기지도 않는다. 죽은 적도 밀린다(시체가 날아간다). 난수를 쓰지 않는다
export function knock(w: World, e: Entity, dx: number, dz: number, d: number) {
  w.impacts++;
  if (e.kind === 'boss' || e.kind === 'king') return;
  for (let i = Math.round(d / 0.1); i > 0 && walkable(w.grid, Math.floor(e.x + dx * 0.1), Math.floor(e.z + dz * 0.1)); i--) {
    e.x += dx * 0.1;
    e.z += dz * 0.1;
  }
  if (e.hp > 0) Object.assign(e, { state: 'idle', attackT: 0, path: [], repathT: 0, phase: 'none' }); // 예고 자세(내려찍기)도 끊긴다
}

// 금화 더미(lo..hi × 배율)
export function dropGold(w: World, x: number, z: number, lo: number, hi: number, power: number) {
  w.items.push({ id: w.nextItem++, x, z, kind: 'gold', tier: 0, amount: Math.round((lo + Math.floor(rand(w) * (hi - lo + 1))) * power) });
}

// mulberry32. 상태가 world.rng에 있어서 같은 시드 = 같은 난수열.
export function rand(w: World) {
  let t = (w.rng = (w.rng + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export const dist = (a: Entity, b: Entity) => Math.hypot(a.x - b.x, a.z - b.z);

// 사거리(궁수 ARCHER.range, 마법사 MAGE.range) 안이고, 둘 사이 직선이 벽 칸을 지나지 않아야(0.1m 간격 샘플) 칠 수 있다
export function canHit(w: World, a: Entity, b: Entity) {
  const reach = a.kind === 'archer' ? ARCHER.range : a.kind === 'mage' ? MAGE.range : a.kind === 'hero' && w.cls === 'wizard' ? WIZ.range : RANGE;
  return dist(a, b) <= reach && clearLine(w, a, b);
}

// 둘 사이 직선이 벽 칸을 지나지 않는가(0.1m 간격 샘플)
export function clearLine(w: World, a: Entity, b: Entity) {
  const n = Math.ceil(dist(a, b) / 0.1);
  for (let i = 1; i < n; i++) {
    if (!walkable(w.grid, Math.floor(a.x + ((b.x - a.x) * i) / n), Math.floor(a.z + ((b.z - a.z) * i) / n))) return false;
  }
  return true;
}

export function face(e: Entity, t: Entity) {
  e.facing = Math.atan2(t.x - e.x, t.z - e.z);
}

export const cellOf = (e: Entity): Cell => [Math.floor(e.x), Math.floor(e.z)];

// 칸 경로 → 월드 좌표 웨이포인트. 시작 칸은 빼고, 마지막은 정확한 목표 지점.
export const waypoints = (cells: Cell[], x: number, z: number): Point[] => [
  ...cells.slice(1, -1).map(([cx, cz]): Point => [cx + 0.5, cz + 0.5]),
  [x, z],
];

export function walk(w: World, e: Entity) {
  e.state = 'move';
  let budget = moveSpeed(w, e) * DT;
  while (budget > 0 && e.path.length) {
    const [px, pz] = e.path[0];
    const dx = px - e.x;
    const dz = pz - e.z;
    const d = Math.hypot(dx, dz);
    if (d > 1e-6) e.facing = Math.atan2(dx, dz);
    if (d <= budget) {
      e.x = px;
      e.z = pz;
      budget -= d;
      e.path.shift();
      continue;
    }
    const nx = e.x + (dx / d) * budget;
    const nz = e.z + (dz / d) * budget;
    // 충돌로 밀려난 뒤 직선 이동이 벽을 가로지르면 현재 칸에서 목적지까지 경로를 다시 계산한다
    if (!walkable(w.grid, Math.floor(nx), Math.floor(nz))) {
      const [fx, fz] = e.path[e.path.length - 1];
      const p = findPath(w.grid, cellOf(e), [Math.floor(fx), Math.floor(fz)]);
      e.path = p ? waypoints(p, fx, fz) : [];
      return;
    }
    e.x = nx;
    e.z = nz;
    budget = 0;
  }
}
