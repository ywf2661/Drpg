// 공용 전투·이동 도구: 난수, 거리·시야, 데미지·피해·드롭, 레벨, 걷기. world·abilities가 함께 쓴다.
import { findPath, walkable, type Cell } from './path';
import { AFFIXES, ARCHER, ARMORS, DT, ELITE, SHOUT, GEAR_DROP, GOLD, GOLD_ELITE, KING, MAGE, POTION, QUALITY, RANGE, STATS, WEAPONS, XP, heroMaxHp, xpToNext, type Affix, type AffixKind, type Entity, type Item, type Kind, type Point, type World } from './rules';

// 레벨·경험치를 정하고 주인공 체력을 그 레벨의 최대치로(main이 층을 만들 때)
export function setLevel(w: World, level: number, xp: number) {
  w.level = level;
  w.xp = xp;
  const hero = w.entities[0];
  hero.maxHp = hero.hp = heroMax(w);
}

// 주인공 최대 체력 = 레벨 + 갑옷의 '튼튼한' 옵션
export const heroMax = (w: World) => heroMaxHp(w.level) + mod(w.mods.armor, 'life');

// 옵션 목록에서 한 종류의 값 합
export const mod = (list: Affix[], kind: AffixKind) => list.reduce((s, a) => s + (a.kind === kind ? a.value : 0), 0);

// 장비 점수(자동 장착 비교). 무기 = 옵션을 반영한 초당 데미지(흡혈은 가산), 갑옷 = 버티는 체력(재생·가시 가산)
export function weaponScore(tier: number, aff: Affix[]): number {
  const wpn = WEAPONS[tier - 1];
  const avg = (wpn.dmg[0] + wpn.dmg[1]) / 2;
  const p = (k: AffixKind) => mod(aff, k) / 100;
  return ((avg * (1 + p('dmg')) * (1 + p('crit')) * (1 + p('speed'))) / wpn.interval) * (1 + 2 * p('leech'));
}

export function armorScore(tier: number, aff: Affix[]): number {
  const reduce = Math.min(0.75, ARMORS[tier - 1].reduce + mod(aff, 'guard') / 100);
  return ((100 + mod(aff, 'life')) / (1 - reduce)) * (1 + mod(aff, 'regen') / 100) * (1 + (0.3 * mod(aff, 'thorns')) / 100);
}

// 바닥 장비가 지금 장착한 것보다 나은가
export function isBetter(w: World, it: Item): boolean {
  if (it.kind === 'weapon') return weaponScore(it.tier, it.affixes ?? []) > weaponScore(w.gear.weapon, w.mods.weapon) + 1e-9;
  if (it.kind === 'armor') return armorScore(it.tier, it.affixes ?? []) > armorScore(w.gear.armor, w.mods.armor) + 1e-9;
  return false;
}

// 장비 아이템 굴림: 등급(옵션 0·1·2개) → 부위에 맞는 서로 다른 옵션, 값은 범위 안 균등
export function rollGear(w: World, x: number, z: number, kind: 'weapon' | 'armor', tier: number, boosted = false): Item {
  const odds = boosted ? QUALITY.boosted : QUALITY.normal;
  const r = rand(w);
  const n = r < odds[0] ? 0 : r < odds[0] + odds[1] ? 1 : 2;
  const pool = (Object.keys(AFFIXES) as AffixKind[]).filter((k) => AFFIXES[k].slot === kind);
  const affixes: Affix[] = [];
  for (let i = 0; i < n; i++) {
    const k = pool.splice(Math.floor(rand(w) * pool.length), 1)[0];
    const { lo, hi } = AFFIXES[k];
    affixes.push({ kind: k, value: lo + Math.floor(rand(w) * (hi - lo + 1)) });
  }
  return { id: w.nextItem++, x, z, kind, tier, affixes };
}

// 경험치를 얻고, 다음 레벨 몫을 넘을 때마다 레벨업(남는 양은 이월). 레벨업하면 체력 완전 회복
export function gainXp(w: World, n: number) {
  w.xp += n;
  const before = w.level;
  while (w.xp >= xpToNext(w.level)) w.xp -= xpToNext(w.level++);
  if (w.level !== before) setLevel(w, w.level, w.xp);
}

export function makeEntity(id: number, kind: Kind, x: number, z: number, power: number, elite = false, summoner = -1): Entity {
  const hp = Math.round(STATS[kind].hp * power * (elite ? ELITE.hp : 1));
  return { id, kind, x, z, elite, summoner, stunT: 0, facing: 0, hp, maxHp: hp, power, state: 'idle', path: [], target: null, attackT: 0, repathT: 0, skill: false, phase: 'none', phaseT: 0, cd: 0, dx: 0, dz: 0 };
}

// 한 번 휘두르는 데 걸리는 시간. 주인공은 장착 무기를 따른다
export function attackInterval(w: World, e: Entity): number {
  return e.kind === 'hero' ? WEAPONS[w.gear.weapon - 1].interval / (1 + mod(w.mods.weapon, 'speed') / 100) : STATS[e.kind].interval;
}

// 공격자 a의 데미지 굴림(무기·레벨·층 배율)
export function roll(w: World, a: Entity) {
  const [lo, hi] = a.kind === 'hero' ? WEAPONS[w.gear.weapon - 1].dmg : STATS[a.kind].dmg;
  // 주인공은 레벨 보너스, 몬스터는 층 배율의 절반만(체력과 데미지에 다 곱하면 난이도가 배율의 제곱으로 오른다)
  // 주인공의 무기 옵션: 데미지%, 치명타(옵션이 있을 때만 굴림 → 옵션 없는 판은 난수열이 그대로)
  const scale = a.kind === 'hero' ? (1 + 0.05 * (w.level - 1)) * (1 + mod(w.mods.weapon, 'dmg') / 100) : (1 + (a.power - 1) / 2) * (a.elite ? ELITE.dmg : 1);
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
  let dmg = raw;
  // 주인공: 갑옷(+단단한) 감소, 전투의 함성 중이면 추가 감소
  if (t.kind === 'hero') dmg = Math.max(1, Math.round(dmg * (1 - Math.min(0.75, ARMORS[w.gear.armor - 1].reduce + mod(w.mods.armor, 'guard') / 100)) * (w.shoutT > 0 ? 1 - SHOUT.reduce : 1)));
  const dealt = Math.min(t.hp, dmg);
  t.hp = Math.max(0, t.hp - dmg);
  const hero = w.entities[0];
  const leech = from?.kind === 'hero' ? Math.round((dealt * mod(w.mods.weapon, 'leech')) / 100) : 0;
  if (leech > 0 && hero.state !== 'dead') hero.hp = Math.min(hero.maxHp, hero.hp + leech);
  const thorns = t.kind === 'hero' && from && from.state !== 'dead' ? Math.round((dealt * mod(w.mods.armor, 'thorns')) / 100) : 0;
  if (thorns > 0) hurt(w, from!, thorns);
  if (t.hp > 0) return dealt;
  t.state = 'dead';
  t.path = [];
  t.target = null;
  if (t.kind === 'hero') return dealt;
  if (t.kind === 'king') {
    // 해골 왕: 최고 단계 장비(마법 이상)·금화·물약 확정
    gainXp(w, Math.round(XP.king * t.power));
    w.items.push(rollGear(w, t.x, t.z, rand(w) < 0.5 ? 'weapon' : 'armor', w.maxTier, true));
    w.items.push({ id: w.nextItem++, x: t.x - 0.3, z: t.z, kind: 'potion', tier: 0 });
    dropGold(w, t.x + 0.3, t.z, KING.gold[0], KING.gold[1], t.power);
    return dealt;
  }
  gainXp(w, Math.round(XP[t.kind] * t.power * (t.elite ? ELITE.xp : 1)));
  const drop = (kind: Item['kind'], tier: number) => w.items.push({ id: w.nextItem++, x: t.x, z: t.z, kind, tier });
  if (rand(w) < POTION.drop[t.kind]) drop('potion', 0);
  const g = t.elite ? { chance: 1, ...GOLD_ELITE } : GOLD[t.kind];
  if (g.chance > 0 && rand(w) < g.chance) dropGold(w, t.x + 0.3, t.z, g.lo, g.hi, t.power);
  if (t.elite) w.items.push(rollGear(w, t.x, t.z, rand(w) < 0.5 ? 'weapon' : 'armor', w.maxTier, true)); // 정예: 최고 단계·마법 이상 확정
  else if (rand(w) < GEAR_DROP[t.kind]) w.items.push(rollGear(w, t.x, t.z, rand(w) < 0.5 ? 'weapon' : 'armor', 1 + Math.floor(rand(w) * w.maxTier)));
  return dealt;
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
  const reach = a.kind === 'archer' ? ARCHER.range : a.kind === 'mage' ? MAGE.range : RANGE;
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
  let budget = STATS[e.kind].speed * DT;
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
