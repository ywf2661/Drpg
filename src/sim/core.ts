// 공용 전투·이동 도구: 난수, 거리·시야, 데미지·피해·드롭, 레벨, 걷기. world·abilities가 함께 쓴다.
import { findPath, walkable, type Cell, type Grid } from './path';
import { REWIND, RUNE, RUNE_DROP, STAT_RUNES, runeAffix, runeRow, plainAffixes, socketsOf, runesIn, type Rune, KNIGHT_LATE, steady, GOLD_CHEST, PIT, SHRINE, SLEEP, TREASURE, SET_HUNTER, BONE_KINDS, LEGEND_FX, LEGEND_DROP, UNIQUES, UNIQUE_LIST, type UniqueId, RANK_OVER, SKILL_AFFIX, COST_OVERRIDE, ENERGY, MANA, RESOURCE, TIER_COST, AFFIXES, ARCHER, AXE_STORM, AXES, BONES, BOUNCE, BURST, DRAIN, EXECUTE, FOCUS, FROST_ARMOR, KEY_CD, KEYS, LEAP, SKILLS, SYNERGY, TRAIL, TEMPER, MARK, GRAZE, ECHO, FLASH, TREES, WHIRL, type Ally, RANGER, BAG, CLASSES, SLOTS, WARD, WIZ, type Gear, type HeroClass, type Slot, AXE, COMBO, DASH, DMG_SCALE, DT, ELITE, ELITE_FX, SKINS, METEOR, MONSTER_DMG, RANK_MAX, SHOUT, SKILL, SLAM, TELL, type SkillId, type SkillName, GEAR_DROP, GOLD, GOLD_ELITE, KING, MAGE, POTION, QUALITY, RANGE, STATS, XP, heroMaxHp, xpToNext, type Affix, type AffixKind, type BagItem, type Entity, type GearItem, GEAR_SIZE, type Item, type Kind, type Point, type World } from './rules';
import { HORSE, warded } from './sanctum';

// 레벨·경험치를 정하고 주인공 체력을 그 레벨의 최대치로(main이 층을 만들 때)
export function setLevel(w: World, level: number, xp: number) {
  w.level = level;
  w.xp = xp;
  const hero = w.entities[0];
  hero.maxHp = hero.hp = heroMax(w);
  w.res = resMax(w); // 층에 들어갈 때·레벨업 때 가득
}

// 기력·마나 최대치와 초당 회복(기력은 고정, 마나는 레벨마다 는다)
export const resMax = (w: World) => (RESOURCE[w.cls] === 'energy' ? ENERGY.max : MANA.max + MANA.perLevel * (w.level - 1));
export const resRegen = (w: World) => (RESOURCE[w.cls] === 'energy' ? ENERGY.regen : MANA.regen + MANA.regenPerLevel * (w.level - 1));
// 스킬 비용: 덮어쓰기가 있으면 그것, 아니면 트리 등급(0 1단계, 1 2단계, 2 패시브 = 0, 3 궁극)
export function skillCost(cls: HeroClass, id: SkillId): number {
  const t = TIER_COST[RESOURCE[cls]];
  return COST_OVERRIDE[id] ?? [t.tier1, t.tier2, 0, t.ultimate][SKILLS[id].tier];
}
export const canAfford = (w: World, id: SkillId) => w.res >= skillCost(w.cls, id);
export const pay = (w: World, id: SkillId) => void (w.res -= skillCost(w.cls, id));

// 스킬 단계(0 = 안 배움) = 포인트로 찍은 기본 단계 + 장비 보너스(배운 스킬만, 초월 상한 RANK_MAX + RANK_OVER).
// 1단계에서 더 올린 단계 수(수치 표의 기본값 = 1단계), 5단계 완성 효과
export const baseRank = (w: World, id: SkillId) => w.ranks[id] ?? 0;
// 한 옵션이 그 스킬에 주는 단계 보너스
const bonusOf = (a: Affix, id: SkillId) => (a.kind === 'skill' ? (a.skill === id ? a.value : 0) : a.kind === 'tab' ? (a.tab === SKILLS[id].tab ? a.value : 0) : a.kind === 'allSkills' ? a.value : 0);
export const gearBonus = (w: World, id: SkillId) => SLOTS.reduce((s, sl) => s + w.mods[sl].reduce((t, a) => t + bonusOf(a, id), 0), 0);
export function rank(w: World, id: SkillId) {
  const base = baseRank(w, id);
  return base ? Math.min(base + gearBonus(w, id), RANK_MAX + RANK_OVER) : 0;
}
export const ext = (w: World, id: SkillId) => Math.max(0, rank(w, id) - 1);
export const mastered = (w: World, id: SkillId) => rank(w, id) >= RANK_MAX;
// 시너지: 같은 탭의 다른 스킬에 찍은 포인트마다 피해 +SYNERGY
export function syn(w: World, id: SkillId) {
  const { cls, tab } = SKILLS[id];
  return 1 + SYNERGY * TREES[cls][tab].skills.reduce((s, o) => s + (o === id ? 0 : rank(w, o)), 0);
}
// 그 스킬을 끼운 칸(없으면 undefined)과, 그 칸의 재사용 대기를 by초 줄이기(Infinity = 바로 준비)
export const keyOf = (w: World, id: SkillId) => KEYS.find((k) => w.keys[k] === id);
export function cutCd(w: World, id: SkillId, by: number) {
  const k = keyOf(w, id);
  if (k) w[KEY_CD[k]] = Math.max(0, w[KEY_CD[k]] - by);
}

// 기사 스킬의 단계별 수치(1단계 = 기본값, 단계마다 조금씩 강해진다). 피해 배율에는 시너지가 붙는다
const axeMod = (w: World) => ({ cd: 1 - AXES.cd * rank(w, 'axes'), dmg: 1 + AXES.dmg * rank(w, 'axes') }); // 도끼 숙련
export const cleaveStat = (w: World) => ({ cd: SKILL.cd - 0.3 * ext(w, 'cleave'), radius: SKILL.radius + 0.2 * ext(w, 'cleave'), mult: (SKILL.mult + 0.2 * ext(w, 'cleave')) * syn(w, 'cleave') });
export const whirlStat = (w: World) => ({ cd: WHIRL.cd - 0.4 * ext(w, 'whirl'), time: WHIRL.time + (mastered(w, 'whirl') ? WHIRL.extra : 0), radius: SKILL.radius + 0.15 * ext(w, 'whirl'), mult: (WHIRL.mult + 0.08 * ext(w, 'whirl')) * syn(w, 'whirl') });
export const burstStat = (w: World) => ({ hp: BURST.hp + 0.05 * ext(w, 'burst') });
export const executeStat = (w: World) => ({ cd: EXECUTE.cd - 0.5 * ext(w, 'execute'), below: EXECUTE.below + 0.03 * ext(w, 'execute'), mult: (EXECUTE.mult + 0.4 * ext(w, 'execute')) * syn(w, 'execute') });
export const dashStat = (w: World) => ({ cd: DASH.cd - 0.5 * ext(w, 'dash'), dist: DASH.dist + 0.5 * ext(w, 'dash'), mult: (1 + 0.2 * ext(w, 'dash')) * syn(w, 'dash') });
export const shoutStat = (w: World) => ({
  cd: SHOUT.cd - ext(w, 'shout'),
  stun: SHOUT.stun + 0.3 * ext(w, 'shout'),
  reduce: SHOUT.reduce + 0.04 * ext(w, 'shout'),
  radius: SHOUT.radius + 0.3 * ext(w, 'shout'),
});
export const trailStat = (w: World) => ({ mult: TRAIL.mult * (1 + 0.25 * ext(w, 'trail')) });
export const leapStat = (w: World) => ({ cd: LEAP.cd - 0.5 * ext(w, 'leap'), radius: LEAP.radius, mult: (LEAP.mult + 0.3 * ext(w, 'leap')) * syn(w, 'leap') });
export const axeStat = (w: World) => ({ cd: (AXE.cd - 0.2 * ext(w, 'throw')) * axeMod(w).cd, mult: (AXE.mult + 0.25 * ext(w, 'throw')) * syn(w, 'throw') * axeMod(w).dmg });
export const bounceStat = (w: World) => ({ cd: (BOUNCE.cd - 0.2 * ext(w, 'bounce')) * axeMod(w).cd, count: BOUNCE.count * (mastered(w, 'bounce') ? 2 : 1), mult: (BOUNCE.mult + 0.2 * ext(w, 'bounce')) * syn(w, 'bounce') * axeMod(w).dmg });
export const axeStormStat = (w: World) => ({ cd: (AXE_STORM.cd - 0.5 * ext(w, 'axeStorm')) * axeMod(w).cd, count: AXE_STORM.count + ext(w, 'axeStorm'), mult: (AXE_STORM.mult + 0.2 * ext(w, 'axeStorm')) * syn(w, 'axeStorm') * axeMod(w).dmg });
// 발도 탭
// 발도 탭. 칼선 배율에는 시너지를 넣어 둔다(그을 때 정해진다)
export const markStat = (w: World) => ({ cd: MARK.cd - 0.1 * ext(w, 'mark'), mult: MARK.hit * syn(w, 'mark'), cut: (MARK.cut + 0.1 * ext(w, 'mark')) * syn(w, 'mark') });
export const grazeStat = (w: World) => ({ cd: GRAZE.cd - 0.3 * ext(w, 'graze'), cut: (GRAZE.cut + 0.2 * ext(w, 'graze')) * syn(w, 'graze') });
export const echoStat = (w: World) => ({ need: ECHO.need, cut: (ECHO.cut + 0.1 * ext(w, 'echo')) * syn(w, 'echo') });
// 벼림 탭. 덧벼림 단계마다 충전 +1
const edgeCharges = (w: World) => TEMPER.charges + ext(w, 'reforge');
export const flameEdgeStat = (w: World) => ({ cd: TEMPER.flameCd, mult: (TEMPER.flame + 0.1 * ext(w, 'flameEdge')) * syn(w, 'flameEdge'), charges: edgeCharges(w) });
export const frostEdgeStat = (w: World) => ({ cd: TEMPER.frostCd, hits: mastered(w, 'frostEdge') ? 2 : TEMPER.hits, freeze: TEMPER.freeze + 0.15 * ext(w, 'frostEdge'), charges: edgeCharges(w) });
export const reforgeStat = (w: World) => ({ radius: TEMPER.reforgeR, mult: (TEMPER.reforge + 0.05 * ext(w, 'reforge')) * syn(w, 'reforge') });
export const unleashStat = (w: World) => ({ cd: TEMPER.cd - 0.5 * ext(w, 'unleash'), time: TEMPER.time + 0.5 * ext(w, 'unleash'), mult: TEMPER.slash * syn(w, 'unleash') });
export const flashStat = (w: World) => ({ cd: FLASH.cd - 0.5 * ext(w, 'flash'), max: FLASH.max + ext(w, 'flash'), mult: FLASH.hit * syn(w, 'flash'), cut: FLASH.cut * syn(w, 'flash') });

// 공격을 준비 중인가: 예고 자세(내려찍기·돌진·소환)이거나 근접 평타가 아직 맞기 전. 붉게 보이고, 스킬로 치면 받아치기
export const winding = (e: Entity) => e.phase === 'windup' || (e.state === 'attack' && e.attackT < (TELL[e.kind] ?? 0));

// 스킬 피해(가르기·돌진·도끼). 연계: 예고 중인 적은 받아치기 ×2, 기절한 적은 약점 ×1.5, 공포로 도망치는 적은 등 뒤 ×2(기록을 남겨 화면에 글자가 뜬다)
// 광전사의 손잡이: 스킬 피해 × (1 + 분노). 결투자의 투구: 받아치기면 모든 칸 재사용 대기 −1초, 자원 +15
export function skillHit(w: World, e: Entity, raw: number) {
  const kind = winding(e) ? 'counter' : e.stunT > 0 ? 'stunned' : e.fearT > 0 ? 'back' : null;
  if (kind) w.combos.push({ id: w.nextItem++, x: e.x, z: e.z, kind, age: 0 });
  const r = 1 + rage(w);
  hurt(w, e, kind ? Math.round(raw * r * COMBO[kind]) : r === 1 ? raw : Math.round(raw * r), w.entities[0]);
  if (kind === 'counter' && hasUnique(w, 'duelist')) {
    for (const k of KEYS) w[KEY_CD[k]] = Math.max(0, w[KEY_CD[k]] - LEGEND_FX.duelCd);
    w.res = Math.min(resMax(w), w.res + LEGEND_FX.duelRes);
  }
}
// 광전사의 손잡이의 분노: 잃은 체력 비율 × LEGEND_FX.rage
export function rage(w: World) {
  const hero = w.entities[0];
  return hasUnique(w, 'berserker') && hero.maxHp > 0 ? LEGEND_FX.rage * Math.max(0, 1 - hero.hp / hero.maxHp) : 0;
}

// 주인공 최대 체력 = 직업·레벨 + 투구 + 모든 부위의 '튼튼한' 옵션
// 왕관 없는 왕의 망토: × LEGEND_FX.cloakHp
export const heroMax = (w: World) => Math.round((heroMaxHp(w.level, w.cls) + CLASSES[w.cls].helms[w.gear.helm - 1].hp + worn(w, 'life')) * (hasUnique(w, 'crownless') ? LEGEND_FX.cloakHp : 1));

// 옵션 목록에서 한 종류의 값 합
export const mod = (list: Affix[], kind: AffixKind) => list.reduce((s, a) => s + (a.kind === kind ? a.value : 0), 0);
// 부위별 옵션 목록 복사(층·상점으로 넘길 때)
export const copyMods = (m: World['mods']): World['mods'] => ({ weapon: [...m.weapon], armor: [...m.armor], helm: [...m.helm], boots: [...m.boots] });
// 장착한 모든 부위에서 한 종류의 값 합
const total = (m: World['mods'], kind: AffixKind) => SLOTS.reduce((s, sl) => s + mod(m[sl], kind), 0);
export const worn = (w: World, kind: AffixKind) => total(w.mods, kind);

// 이동 속도(m/s). 주인공은 신발 + '날랜' 옵션
export const moveSpeed = (w: World, e: Entity) => (e.kind === 'hero' ? STATS.hero.speed * (1 + CLASSES[w.cls].boots[w.gear.boots - 1].move + worn(w, 'move') / 100) * (w.trophies.swift ? ELITE_FX.swiftMove : 1) * (w.trophies.rushing ? SET_HUNTER.rush : 1) * (w.buff?.kind === 'haste' ? 1 + SHRINE.haste : 1) * (w.pits.some(([x, z]) => Math.hypot(e.x - x, e.z - z) <= PIT.r) ? PIT.slow : 1) : w.allies.includes(e as Ally) ? BONES.speed : STATS[e.kind].speed * (e.eliteKind === 'swift' ? ELITE_FX.swiftMove : e.eliteKind === 'rushing' ? ELITE_FX.rush : 1) * (e.skin ? SKINS[e.skin].speed : 1));

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

// 스킬 보너스의 점수 배율: 배운 스킬에 붙는 보너스 단계마다 +SKILL_SCORE
const SKILL_SCORE = 0.08;
const skillFactor = (w: World, list: Affix[]) => 1 + SKILL_SCORE * Object.keys(w.ranks).reduce((s, id) => s + (baseRank(w, id as SkillId) ? list.reduce((t, a) => t + bonusOf(a, id as SkillId), 0) : 0), 0);
const armorMods = (m: World['mods']) => [...m.armor, ...m.helm, ...m.boots];

// [이 장비를 입었을 때 점수, 지금 점수]. 무기는 공격, 방어구는 생존(갑옷·투구·신발 합)
function gearScores(w: World, it: GearItem): [number, number] {
  if (it.kind === 'weapon') return [weaponScore(it.tier, it.affixes, w.cls) * skillFactor(w, it.affixes), weaponScore(w.gear.weapon, w.mods.weapon, w.cls) * skillFactor(w, w.mods.weapon)];
  const m = { ...w.mods, [it.kind]: it.affixes };
  return [defenseScore({ ...w.gear, [it.kind]: it.tier }, m, w.cls) * skillFactor(w, armorMods(m)), defenseScore(w.gear, w.mods, w.cls) * skillFactor(w, armorMods(w.mods))];
}
// 장비 점수 − 입은 장비의 점수(양수면 더 좋다)
export function gearDiff(w: World, it: GearItem): number {
  const [a, b] = gearScores(w, it);
  return a - b;
}
// 입으면 몇 배 강해지나 − 1 (0.18 = 18% 강해짐). 줍는 순간 카드에 쓴다
export function gearGain(w: World, it: GearItem): number {
  const [a, b] = gearScores(w, it);
  return b > 0 ? a / b - 1 : 0;
}

// 장비가 지금 장착한 것보다 나은가
export function isBetter(w: World, it: Item | GearItem): boolean {
  if (it.kind === 'potion' || it.kind === 'gold' || it.kind === 'rune' || it.kind === 'relic') return false;
  if (uniqueOf({ affixes: it.affixes ?? [] }) || uniqueOf({ affixes: w.mods[it.kind] })) return false; // 고유 장비는 자동 장착이 입히지도 벗기지도 않는다(빌드는 플레이어가 고른다)
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
export function bagFits(bag: BagItem[], it: Pick<GearItem, 'kind' | 'tier'>, x: number, y: number, skip = -1, grid = BAG): boolean {
  const [w, h] = gearSize(it);
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x + w > grid.w || y + h > grid.h) return false;
  return bag.every((o, k) => {
    const [ow, oh] = gearSize(o);
    return k === skip || x >= o.x + ow || o.x >= x + w || y >= o.y + oh || o.y >= y + h;
  });
}

// 놓을 수 있는 첫 자리(왼쪽 열부터 위에서 아래로). 없으면 null
export function bagSpot(bag: BagItem[], it: Pick<GearItem, 'kind' | 'tier'>, grid = BAG): [number, number] | null {
  for (let x = 0; x < grid.w; x++) for (let y = 0; y < grid.h; y++) if (bagFits(bag, it, x, y, -1, grid)) return [x, y];
  return null;
}

// 보관함 ↔ 창고(또는 같은 격자 안): from의 i번을 to(grid 크기)의 at 칸으로. at이 없으면 첫 빈자리. 못 놓으면 그대로(false)
export function moveGear(from: BagItem[], i: number, to: BagItem[], grid: { w: number; h: number }, at?: [number, number]): boolean {
  const it = from[i];
  const same = from === to;
  const spot = !it ? null : at ? (bagFits(to, it, at[0], at[1], same ? i : -1, grid) ? at : null) : bagSpot(to, it, grid);
  if (!spot) return false;
  const moved = { ...it, x: spot[0], y: spot[1] };
  if (same) from[i] = moved;
  else from.splice(i, 1), to.push(moved);
  return true;
}

export function discardFromBag(w: World, i: number) {
  if (w.entities[0].state !== 'dead' && w.bag[i]) pocket(w, w.bag.splice(i, 1)[0].affixes);
}

// 룬 주머니에 넣기(버리거나 판 장비의 꽂힌 룬은 돌아온다)
export function pocket(w: Pick<World, 'runes'>, list: Affix[]) {
  for (const a of runesIn(list)) w.runes[a.r!] = (w.runes[a.r!] ?? 0) + 1;
}
// 룬을 꽂을 장비: 입은 부위(Slot) 또는 보관함 번호
export type RuneTarget = Slot | number;
const targetAffixes = (w: World, t: RuneTarget) => (typeof t === 'number' ? w.bag[t]?.affixes : w.mods[t]);
function setAffixes(w: World, t: RuneTarget, list: Affix[]) {
  if (typeof t === 'number') w.bag[t] = { ...w.bag[t], affixes: list };
  else wear(w, { kind: t, tier: w.gear[t], affixes: list }); // 체력 룬이면 최대 체력 비율을 맞춘다
}
// 룬 꽂기: 주머니에 있고 빈 소켓이 있으면(창이 열린 동안 바로 — 보관함 조작과 같다)
export function socketRune(w: World, t: RuneTarget, r: Rune): boolean {
  const list = targetAffixes(w, t);
  const a = runeAffix(r);
  if (w.entities[0].state === 'dead' || !list || !a || !w.runes[r] || runesIn(list).length >= socketsOf(list)) return false;
  if (a.skill && SKILLS[a.skill].cls !== w.cls) return false;
  w.runes[r]!--;
  if (!w.runes[r]) delete w.runes[r];
  setAffixes(w, t, [...list, a]);
  return true;
}
// 꽂힌 룬 k번째를 빼서 주머니로(대가 없음)
export function unsocketRune(w: World, t: RuneTarget, k: number): boolean {
  const list = targetAffixes(w, t);
  const a = list && runesIn(list)[k];
  if (w.entities[0].state === 'dead' || !a) return false;
  pocket(w, [a]);
  setAffixes(w, t, list.filter((o) => o !== a));
  return true;
}
// 칸의 재사용 대기 배율(칸 룬 합계, 상한 RUNE.cutMax%)
export const keyCut = (w: World, key: SkillName) => 1 - Math.min(RUNE.cutMax, SLOTS.reduce((s, sl) => s + w.mods[sl].reduce((t, a) => t + (a.kind === 'keyCd' && a.key === key ? a.value : 0), 0), 0)) / 100;

// 소켓 굴림(전용 난수)
function rollSocket(w: World): Affix {
  const r = runeRand(w);
  const [a, b] = RUNE.sockets;
  return { kind: 'socket', value: r < a ? 1 : r < a + b ? 2 : 3 };
}
// 지금 지역의 룬 하나: odds = [흔함, 보통, 드묾] 확률. 야영지면 null
export function rollRune(w: World, odds: number[]): Rune | null {
  const row = runeRow(w.land);
  if (row < 0) return null;
  const pick = <T>(list: T[]) => list[Math.floor(runeRand(w) * list.length)];
  const r = runeRand(w);
  if (r < odds[0]) return pick(Object.keys(STAT_RUNES).filter((k) => STAT_RUNES[k].land === w.land));
  return `${pick(TREES[w.cls].map((t) => t.skills[row]))}+${r < odds[0] + odds[1] ? 1 : 2}`;
}
// 쓰러진 적의 룬: 잡몹은 가끔, 정예·해골 왕 하나, 보스 둘 + 칸 룬(낮은 확률, 의뢰를 다 끝냈으면 확정)
function dropRunes(w: World, t: Entity) {
  const put = (r: Rune | null) => r && w.items.push({ id: w.nextItem++, x: t.x + (runeRand(w) - 0.5) * 0.8, z: t.z + (runeRand(w) - 0.5) * 0.8, kind: 'rune', tier: 0, rune: r });
  if (t.kind === 'boss') {
    for (let i = 0; i < RUNE_DROP.boss; i++) put(rollRune(w, RUNE_DROP.odds.boss));
    const row = runeRow(w.land);
    if (row >= 0 && (w.sureLegend || runeRand(w) < RUNE_DROP.key)) put(`key:${KEYS[row]}`);
  } else if (t.elite || t.kind === 'king') put(rollRune(w, RUNE_DROP.odds.elite));
  else if (runeRand(w) < RUNE_DROP.mob) put(rollRune(w, RUNE_DROP.odds.mob));
}

// 보관함에 자리가 없어 주우러 간 발밑 장비를 못 줍는 중인가
export function bagBlocked(w: World): boolean {
  const hero = w.entities[0];
  return w.items.some((it) => it.id === w.taking && it.kind !== 'potion' && it.kind !== 'gold' && it.kind !== 'rune' && it.kind !== 'relic' && Math.hypot(it.x - hero.x, it.z - hero.z) <= POTION.pickup && !bagSpot(w.bag, { kind: it.kind, tier: it.tier }));
}

// 장비 아이템 굴림: 등급(옵션 0·1·2개) → 부위에 맞는 서로 다른 옵션, 값은 범위 안 균등
export function rollGear(w: World, x: number, z: number, kind: Slot, tier: number, boosted = false): Item {
  const odds = boosted ? QUALITY.boosted : QUALITY.normal;
  const r = rand(w);
  const n = r < odds[0] ? 0 : r < odds[0] + odds[1] ? 1 : 2;
  return { id: w.nextItem++, x, z, kind, tier, affixes: [...rollAffixes(w, kind, n), rollSocket(w)] };
}

// 부위에 맞는 서로 다른 무작위 옵션 n개. 희귀(2개)는 SKILL_AFFIX.tab 확률로 마지막 하나가 탭 +1
export function rollAffixes(w: World, kind: Slot, n: number, skip: AffixKind[] = []): Affix[] {
  const pool = (Object.keys(AFFIXES) as AffixKind[]).filter((k) => AFFIXES[k].slots.includes(kind) && !AFFIXES[k].special && !skip.includes(k));
  const affixes: Affix[] = [];
  for (let i = 0; i < n; i++) {
    const k = pool.splice(Math.floor(rand(w) * pool.length), 1)[0];
    const { lo, hi } = AFFIXES[k];
    affixes.push(k === 'skill' ? rollSkillAffix(w, n >= 2) : { kind: k, value: lo + Math.floor(rand(w) * (hi - lo + 1)) });
  }
  if (n >= 2 && !skip.includes('tab') && rand(w) < SKILL_AFFIX.tab) affixes[n - 1] = { kind: 'tab', value: 1, tab: Math.floor(rand(w) * TREES[w.cls].length) };
  return affixes;
}

// 지금 직업의 스킬 하나 +1(희귀면 SKILL_AFFIX.two 확률로 +2)
export function rollSkillAffix(w: World, rare: boolean): Affix {
  const ids = TREES[w.cls].flatMap((t) => t.skills);
  const id = ids[Math.floor(rand(w) * ids.length)];
  return { kind: 'skill', value: rare && rand(w) < SKILL_AFFIX.two ? 2 : 1, skill: id };
}

// 고유 장비(전설·세트): 옵션 목록 맨 앞의 표식으로 알아본다
export const uniqueOf = (it: { affixes: Affix[] }): UniqueId | undefined => (it.affixes[0]?.kind === 'unique' ? it.affixes[0].u : undefined);
export const hasUnique = (w: World, id: UniqueId) => SLOTS.some((s) => uniqueOf({ affixes: w.mods[s] }) === id);
// 입은 세트 조각 수
export function setCount(w: World) {
  return SLOTS.filter((s) => {
    const u = uniqueOf({ affixes: w.mods[s] });
    return !!u && !!UNIQUES[u].set;
  }).length;
}
// 등급: 0 일반, 1 마법, 2 희귀, 3 전설, 4 세트
export function quality(it: { affixes: Affix[] }): number {
  const u = uniqueOf(it);
  return u ? (UNIQUES[u].set ? 4 : 3) : Math.min(2, plainAffixes(it.affixes).length);
}

// 고유 장비 굴림: 세트 조각(LEGEND_DROP.set, 입지도 갖지도 않은 부위를 missing 확률로) 또는 전설(지금 직업 것 + 공용).
// 옵션 = 표식 + 고정(탭·1단계 스킬은 여기서 굴림) + 무작위 1~2(고정과 다른 종류)
export function rollUnique(w: World, x: number, z: number, tier: number): Item {
  const pick = <T>(list: T[]) => list[Math.floor(rand(w) * list.length)];
  let u: UniqueId;
  const pool = UNIQUE_LIST.filter((id) => !UNIQUES[id].only); // 정해진 보스만 떨구는 것은 빼고
  if (rand(w) < LEGEND_DROP.set) {
    const sets = pool.filter((id) => UNIQUES[id].set);
    const owned = new Set([...SLOTS.map((s) => uniqueOf({ affixes: w.mods[s] })), ...w.bag.map((it) => uniqueOf(it))]);
    const missing = sets.filter((id) => !owned.has(id));
    u = pick(missing.length && rand(w) < LEGEND_DROP.missing ? missing : sets);
  } else u = pick(pool.filter((id) => !UNIQUES[id].set && (!UNIQUES[id].cls || UNIQUES[id].cls === w.cls)));
  return makeUnique(w, u, x, z, tier);
}
// 고유 장비 u 하나를 만든다
export function makeUnique(w: World, u: UniqueId, x: number, z: number, tier: number): Item {
  const pick = <T>(list: T[]) => list[Math.floor(rand(w) * list.length)];
  const def = UNIQUES[u];
  const fixed = def.fixed.map((f): Affix => (f === 'tab' ? { kind: 'tab', value: 1, tab: Math.floor(rand(w) * TREES[w.cls].length) } : f === 'tier1' ? { kind: 'skill', value: 1, skill: pick(TREES[w.cls]).skills[0] } : { ...f }));
  const n = rand(w) < 0.5 ? 1 : 2;
  const affixes: Affix[] = [{ kind: 'unique', value: 0, u }, ...fixed, ...rollAffixes(w, def.slot, n, fixed.map((a) => a.kind))];
  return { id: w.nextItem++, x, z, kind: def.slot, tier, affixes: [...affixes, rollSocket(w)] };
}

// 고유 장비 판정(확률 p). 성공하면 바닥에(toBag면 보관함 먼저 — 층이 끝나 바닥 것을 못 줍는 보스)
function dropUnique(w: World, t: Entity, p: number, toBag = false): boolean {
  if (rand(w) >= p) return false;
  const it = rollUnique(w, t.x, t.z, w.maxTier);
  if (toBag) toBagOrFloor(w, it);
  else w.items.push(it);
  return true;
}
// 보관함에 자리가 있으면 보관함, 없으면 바닥(층이 끝나 바닥 것을 못 줍는 보스)
function toBagOrFloor(w: World, it: Item) {
  const at = bagSpot(w.bag, it as GearItem);
  if (at) w.bag.push({ kind: it.kind as Slot, tier: it.tier, affixes: it.affixes!, x: at[0], y: at[1] });
  else w.items.push(it);
}

// 「금 간 빛 고리」: 쓰고 있으면 틱마다 주인공 자리·체력을 남긴다(가장 오래된 것 = REWIND.back초 전)
export function recordPast(w: World, hero: Entity) {
  if (!hasUnique(w, 'crackedHalo') || hero.state === 'dead') return void (w.past.length = 0);
  w.past.push([hero.x, hero.z, hero.hp]);
  if (w.past.length > Math.round(REWIND.back / DT)) w.past.shift();
}
// 쓰러질 피해를 받았다: 고리가 차 있으면 가장 오래된 기록으로 되감고 true.
// 그 칸이 그사이 막혔으면(성검의 비가 꽂힌 칼 벽 등) 지금 쪽으로 가까운 기록 중 걸을 수 있는 첫 칸으로
function rewind(w: World, hero: Entity): boolean {
  if (w.haloCd > 0 || !w.past.length || !hasUnique(w, 'crackedHalo')) return false;
  const [x, z, hp] = w.past.find(([px, pz]) => walkable(w.grid, Math.floor(px), Math.floor(pz))) ?? [hero.x, hero.z, 1];
  Object.assign(hero, { x, z, hp: Math.max(1, hp), path: [], target: null });
  w.past.length = 0;
  w.haloCd = REWIND.cd;
  return true;
}

// 불꽃 걸음(전설): (x, z)에서 시작하는 불길을 놓고 id를 돌려준다(없으면 -1). 구르기는 따라 늘이고, 순간이동은 끝점을 바로 정한다
export function emberLine(w: World, x: number, z: number): number {
  if (!hasUnique(w, 'emberStep')) return -1;
  w.fires.push({ id: w.nextItem, x0: x, z0: z, x1: x, z1: z, t: LEGEND_FX.emberTime, acc: 0, r: TRAIL.width, mult: TRAIL.mult });
  return w.nextItem++;
}

// 떨어뜨릴 장비 부위(고르게)
export const randSlot = (w: World): Slot => SLOTS[Math.floor(rand(w) * SLOTS.length)];

// 경험치를 얻고, 다음 레벨 몫을 넘을 때마다 레벨업(남는 양은 이월). 레벨업하면 체력 완전 회복
export function gainXp(w: World, n: number) {
  w.xp += w.buff?.kind === 'wisdom' ? Math.round(n * (1 + SHRINE.wisdom)) : n; // 지혜의 성소
  const before = w.level;
  while (w.xp >= xpToNext(w.level)) w.xp -= xpToNext(w.level++);
  w.points += w.level - before; // 레벨마다 스킬 포인트 1
  if (w.level !== before) setLevel(w, w.level, w.xp);
}

export function makeEntity(id: number, kind: Kind, x: number, z: number, power: number, elite = false, summoner = -1): Entity {
  const hp = Math.round(STATS[kind].hp * power * (elite ? ELITE.hp : 1));
  return { id, kind, x, z, elite, summoner, stunT: 0, fearT: 0, facing: 0, hp, maxHp: hp, power, state: 'idle', path: [], target: null, attackT: 0, repathT: 0, skill: false, phase: 'none', phaseT: 0, cd: kind === 'warrior' ? SLAM.first + (id % 3) : kind === 'mage' ? METEOR.first + (id % 3) : 0, dx: 0, dz: 0 };
}

// 맵의 스킨을 입힌다(그림·이름은 skin을 보고, 체력은 여기서 곱한다)
export function dress(e: Entity, skins: World['skins']): Entity {
  const s = skins?.[e.kind];
  if (s) Object.assign(e, { skin: s, hp: Math.round(e.hp * SKINS[s].hp), maxHp: Math.round(e.maxHp * SKINS[s].hp) });
  return e;
}

// 한 번 휘두르는 데 걸리는 시간. 주인공은 장착 무기를 따른다
export function attackInterval(w: World, e: Entity): number {
  return e.kind === 'hero' ? CLASSES[w.cls].weapons[w.gear.weapon - 1].interval / (1 + worn(w, 'speed') / 100) / (w.focusT > 0 ? 1 + FOCUS.speed : 1) / (1 + rage(w)) / (w.trophies.swift ? ELITE_FX.swiftAttack : 1) / (w.trophies.frenzied ? SET_HUNTER.frenzy : 1) / (w.buff?.kind === 'haste' ? 1 + SHRINE.haste : 1) : STATS[e.kind].interval / (e.eliteKind === 'swift' ? ELITE_FX.swiftAttack : e.eliteKind === 'frenzied' ? ELITE_FX.frenzy : 1); // 궁수 집중 중엔 빠르게
}

// 공격자 a의 데미지 굴림(무기·레벨·층 배율)
export function roll(w: World, a: Entity) {
  const [lo, hi] = a.kind === 'hero' ? CLASSES[w.cls].weapons[w.gear.weapon - 1].dmg : STATS[a.kind].dmg;
  // 주인공은 레벨 보너스, 몬스터는 층 배율의 절반만(체력과 데미지에 다 곱하면 난이도가 배율의 제곱으로 오른다)
  // 주인공의 무기 옵션: 데미지%, 치명타(옵션이 있을 때만 굴림 → 옵션 없는 판은 난수열이 그대로)
  const scale = a.kind === 'hero' ? (1 + 0.05 * (w.level - 1) + (w.cls === 'knight' ? KNIGHT_LATE.dmg * Math.max(0, w.level - KNIGHT_LATE.from) : 0)) * (1 + worn(w, 'dmg') / 100) * (w.trophies.warlord ? SET_HUNTER.aura : 1) * (w.buff?.kind === 'fury' ? 1 + SHRINE.fury : 1) : (1 + (a.power - 1) * DMG_SCALE) * MONSTER_DMG * (a.elite ? ELITE.dmg : 1) * (led(w, a) ? ELITE_FX.auraDmg : 1);
  const crit = a.kind === 'hero' ? worn(w, 'crit') : 0;
  const twice = crit > 0 && rand(w) < crit / 100 ? 2 : 1;
  return Math.round((lo + Math.floor(rand(w) * (hi - lo + 1))) * scale * (a.kind === 'hero' ? w.ghostScale : 1)) * twice; // 잔상 몫이면 줄인다
}

// 통솔하는 정예가 가까이 있는 (다른) 몬스터인가
const led = (w: World, a: Entity) => w.entities.some((e) => e.eliteKind === 'warlord' && e !== a && e.state !== 'dead' && dist(e, a) <= ELITE_FX.auraRange);

// 몬스터가 칠 수 있는 편: 살아 있는 주인공과 해골 병사
export const friends = (w: World): Entity[] => [w.entities[0], ...w.allies].filter((e) => e.state !== 'dead');
// 대상 id → 엔티티. 해골 병사는 entities 밖이라 id가 음수다. 사라졌으면 null
export const byId = (w: World, id: number | null): Entity | null => (id === null ? null : (id < 0 ? w.allies.find((a) => a.id === id) : w.entities[id]) ?? null);

export function damage(w: World, a: Entity, t: Entity) {
  hurt(w, t, roll(w, a), a);
}

// 피해 적용: 주인공은 갑옷(+단단한)으로 줄이되 최소 1. from이 주인공이면 흡혈, 근접(from)이 주인공을 치면 가시 반사.
// 몬스터가 죽으면 경험치·드롭. 실제로 준 피해를 돌려준다
export function hurt(w: World, t: Entity, raw: number, from?: Entity): number {
  if (t.kind === 'hero' && (t.phase === 'roll' || t.phase === 'leap' || t.phase === 'flash' || t.phase === 'graze' || t.phase === 'ride')) {
    w.combos.push({ id: w.nextItem++, x: t.x, z: t.z, kind: 'dodge', age: 0 }); // 구르는 중: 무적
    return 0;
  }
  if (t.kind === 'boss' && warded(w)) {
    if (from?.kind === 'hero' || !w.combos.some((c) => c.kind === 'ward' && c.age < 0.5)) w.combos.push({ id: w.nextItem++, x: t.x, z: t.z, kind: 'ward', age: 0 }); // 빛 고리: 성소를 꺼야 맞는다
    return 0;
  }
  // 궁수의 명사수: 멀리 있는 적에게 더 아프게
  let dmg = from?.kind === 'hero' && t.kind !== 'hero' && w.cls === 'ranger' && dist(from, t) > RANGER.far ? Math.round(raw * RANGER.farMult) : raw;
  // 강령술사의 표식: 구역 안의 적은 모든 피해를 더 받는다(겹치면 가장 센 것. 역병 구역은 0)
  const amp = t.kind !== 'hero' && t.id >= 0 ? Math.max(0, ...w.curses.filter((c) => Math.hypot(t.x - c.x, t.z - c.z) <= c.r).map((c) => c.amp)) : 0;
  if (amp) dmg = Math.round(dmg * (1 + amp));
  if (from?.kind === 'hero' && (t.elite || t.kind === 'boss' || t.kind === 'king') && setCount(w) >= 2) dmg = Math.round(dmg * SET_HUNTER.dmg); // 정예 사냥꾼 2부위
  // 주인공: 갑옷(+단단한) 감소, 함성·서리 갑옷 중이면 추가 감소, 마나 방패·뼈 갑옷이 먼저 흡수(마나 방패는 공격자에게 일부 되돌림)
  if (t.kind !== 'hero' && asleep(t)) wake(w, t); // 잠든 몬스터는 맞으면 깬다
  if (t.skin === 'treasure' && !t.cd) Object.assign(t, { cd: 1, fearT: TREASURE.run }); // 보물 고블린: 멀리서 맞아도 도망
  if (t.kind === 'hero') {
    if (w.buff?.kind === 'guard') dmg = Math.round(dmg * (1 - SHRINE.guard)); // 수호의 성소
    if (w.trophies.unyielding) dmg = Math.round(dmg * SET_HUNTER.steady); // 불굴의 정예에게서 얻은 특성
    dmg = Math.max(1, Math.round(dmg * (1 - Math.min(0.75, CLASSES[w.cls].armors[w.gear.armor - 1].reduce + worn(w, 'guard') / 100)) * (w.shoutT > 0 ? 1 - (w.cls === 'wizard' ? FROST_ARMOR.reduce + FROST_ARMOR.per * ext(w, 'frostArmor') : shoutStat(w).reduce) : 1)));
    const absorbed = Math.min(w.wardHp, dmg);
    if (absorbed > 0) {
      w.wardHp -= absorbed;
      dmg -= absorbed;
      if (rank(w, 'ward') && from && from.state !== 'dead') hurt(w, from, Math.round(absorbed * WARD.reflect));
      if (!w.wardHp) w.wardBroke = true; // 깨짐(5단계 폭발은 wizard.ts가 다음 틱에)
    }
  }
  const dealt = Math.min(t.hp, dmg);
  t.hp = Math.max(0, t.hp - dmg);
  if (t.kind === 'hero' && !t.hp && rewind(w, t)) return dealt; // 「금 간 빛 고리」: 쓰러지는 대신 되감긴다
  const hero = w.entities[0];
  const leech = from?.kind === 'hero' ? Math.round((dealt * worn(w, 'leech')) / 100) + Math.round(dealt * DRAIN.per * rank(w, 'drain')) + (w.trophies.vampiric ? Math.round(dealt * SET_HUNTER.leech) : 0) : 0; // 무기 흡혈 + 생명 흡수(강령술사. 해골이 준 피해도)
  if (leech > 0 && hero.state !== 'dead') hero.hp = Math.min(hero.maxHp, hero.hp + leech);
  const thorns = t.kind === 'hero' && from && from.state !== 'dead' ? Math.round((dealt * worn(w, 'thorns')) / 100) : 0;
  if (thorns > 0) hurt(w, from!, thorns);
  if (t.kind === 'hero' && from?.eliteKind === 'vampiric' && from.state !== 'dead') from.hp = Math.min(from.maxHp, from.hp + dealt * ELITE_FX.leech); // 흡혈의 정예
  if (t.hp > 0) return dealt;
  t.state = 'dead';
  t.path = [];
  t.target = null;
  if (t.kind === 'hero' || t.id < 0) return dealt; // 해골 병사는 경험치도 드롭도 없다(tickAllies가 치운다)
  if (from?.kind === 'hero' && w.focusT > 0 && mastered(w, 'focus')) cutCd(w, 'focus', FOCUS.kill); // 집중 5단계: 처치하면 재사용이 준다
  if (from?.kind === 'hero') trophyKill(w, t);
  dropRunes(w, t);
  if (t.kind === 'king') {
    // 해골 왕: 최고 단계 장비(마법 이상)·금화·물약 확정
    gainXp(w, Math.round(XP.king * Math.min(t.power, w.xpCap)));
    w.items.push(rollGear(w, t.x, t.z, randSlot(w), Math.min(4, w.maxTier + 1), true));
    dropUnique(w, t, LEGEND_DROP.boss);
    w.items.push({ id: w.nextItem++, x: t.x - 0.3, z: t.z, kind: 'potion', tier: 0 });
    dropGold(w, t.x + 0.3, t.z, KING.gold[0], KING.gold[1], t.power);
    return dealt;
  }
  // 기도하는 자: 「금 간 빛 고리」(haloDrop 확률, 아니면 평소 전설)·작은 목마(처음)
  if (t.kind === 'boss' && w.haloDrop > 0 && rand(w) < w.haloDrop) toBagOrFloor(w, makeUnique(w, 'crackedHalo', t.x, t.z, w.maxTier));
  else if (t.kind === 'boss') dropUnique(w, t, w.sureLegend ? 1 : LEGEND_DROP.boss, true);
  if (t.kind === 'boss' && w.horseDrop) w.items.push({ id: w.nextItem++, x: t.x - 0.6, z: t.z + 0.3, kind: 'relic', tier: 0, relic: HORSE });
  if (t.kind === 'boss' && w.relicDrop >= 0) w.items.push({ id: w.nextItem++, x: t.x, z: t.z + 0.6, kind: 'relic', tier: 0, relic: w.relicDrop }); // 지역 보스의 성물
  if (t.skin === 'treasure') treasureDrop(w, t);
  gainXp(w, Math.round(XP[t.kind] * Math.min(t.power, w.xpCap) * (t.elite ? ELITE.xp : 1)));
  // 폭발하는 정예: 죽은 자리에 불기둥과 같은 예고 구역. 분열하는 정예: 그 자리에서 졸개들이 일어난다(separate가 떼어 놓는다)
  if (t.eliteKind === 'volatile') w.zones.push({ id: w.nextItem++, x: t.x, z: t.z, r: MAGE.blast, t: ELITE_FX.blastDelay, total: ELITE_FX.blastDelay, dmg: Math.round(roll(w, t) * ELITE_FX.blastMult), owner: -1 });
  if (t.eliteKind === 'splitting')
    for (let i = 0; i < ELITE_FX.split; i++) w.entities.push(Object.assign(dress(makeEntity(w.entities.length, 'minion', t.x + (i ? 0.1 : -0.1), t.z, t.power), w.skins), { target: 0 }));
  const drop = (kind: Item['kind'], tier: number) => w.items.push({ id: w.nextItem++, x: t.x, z: t.z, kind, tier });
  if (rand(w) < POTION.drop[t.kind]) drop('potion', 0);
  const g = t.elite ? { chance: 1, ...GOLD_ELITE } : GOLD[t.kind];
  if (g.chance > 0 && rand(w) < g.chance) dropGold(w, t.x + 0.3, t.z, g.lo, g.hi, t.power);
  if (t.elite) {
    if (from?.kind === 'hero' && setCount(w) >= 2) w.res = Math.min(resMax(w), w.res + SET_HUNTER.res); // 정예 사냥꾼 2부위
    if (from?.kind === 'hero' && setCount(w) >= 4 && t.eliteKind) w.trophies[t.eliteKind] = SET_HUNTER.time; // 4부위: 그 특성을 얻는다
    w.items.push(rollGear(w, t.x, t.z, randSlot(w), Math.min(4, w.maxTier + 1), true)); // 정예: 최고 단계보다 하나 위(상점 강화가 없어 장비는 정예가 올린다)·마법 이상 확정
    w.pity = dropUnique(w, t, LEGEND_DROP.elite + w.pity) ? 0 : w.pity + LEGEND_DROP.pity; // 운 보정
  }
  else if (rand(w) < GEAR_DROP[t.kind]) w.items.push(rollGear(w, t.x, t.z, randSlot(w), 1 + Math.floor(rand(w) * w.maxTier)));
  return dealt;
}

// 정예 사냥꾼 4부위로 얻은 특성의 처치 효과. 폭발: 잡은 적 자리가 바로 터진다(그 폭발로 죽은 적도 — 연쇄).
// 분열: 잡은 적 자리에 잠깐 서는 해골 병사(강령술사의 해골과 같은 장치, 최대 SET_HUNTER.allyMax)
function trophyKill(w: World, t: Entity) {
  const hero = w.entities[0];
  if (w.trophies.volatile) {
    w.blasts.push({ id: w.nextItem++, x: t.x, z: t.z, age: 0, kind: 'fire' });
    const dmg = Math.round(roll(w, hero) * SET_HUNTER.blastMult);
    for (const e of w.entities) if (e !== hero && e.state !== 'dead' && dist(e, t) <= SET_HUNTER.blastR) hurt(w, e, dmg, hero);
  }
  if (w.trophies.splitting) {
    const b = BONE_KINDS.minion;
    const hp = Math.round(heroMax(w) * BONES.hp);
    w.allies.push({ ...makeEntity(-(w.nextItem++) - 1, 'minion', t.x, t.z, 1), life: SET_HUNTER.allyLife, lifeMax: SET_HUNTER.allyLife, mult: BONES.mult * b.mult, reach: b.reach, interval: b.interval, hp, maxHp: hp });
    const temp = w.allies.filter((a) => a.lifeMax === SET_HUNTER.allyLife);
    const over = temp.slice(0, -SET_HUNTER.allyMax);
    w.allies = w.allies.filter((a) => !over.includes(a));
  }
}

// 스킬에 맞아 밀려남: 단위 방향 (dx, dz)로 d만큼 0.1m씩, 벽 앞에서 멈춘다. 살아 있으면 하던 휘두르기·이동·예고가 끊긴다.
// 보스·해골 왕은 밀리지도 끊기지도 않는다. 죽은 적도 밀린다(시체가 날아간다). 난수를 쓰지 않는다
export function knock(w: World, e: Entity, dx: number, dz: number, d: number) {
  w.impacts++;
  if (e.kind === 'boss' || e.kind === 'king' || e.skin === 'grave' || steady(e)) return;
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
  return mulberry((w.rng = (w.rng + 0x6d2b79f5) | 0));
}
// 소켓·룬 굴림 전용(rand 순서를 흔들지 않아 기존 드롭·봇 결과가 그대로)
export function runeRand(w: World) {
  return mulberry((w.runeRng = (w.runeRng + 0x6d2b79f5) | 0));
}
function mulberry(t: number) {
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export const dist = (a: Entity, b: Entity) => Math.hypot(a.x - b.x, a.z - b.z);

// 사거리(궁수 ARCHER.range, 마법사 MAGE.range) 안이고, 둘 사이 직선이 벽 칸을 지나지 않아야(0.1m 간격 샘플) 칠 수 있다
export function canHit(w: World, a: Entity, b: Entity) {
  const reach = a.kind === 'archer' ? ARCHER.range : a.kind === 'mage' ? MAGE.range : a.kind === 'hero' && (w.cls === 'wizard' || w.cls === 'necromancer') ? WIZ.range : a.kind === 'hero' && w.cls === 'ranger' ? RANGER.range : RANGE;
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

// 두 점 사이를 몸 폭(양옆 margin)으로 지나갈 수 있는가(0.1m 간격 샘플)
function openLine(g: Grid, ax: number, az: number, bx: number, bz: number, margin = 0.3) {
  const d = Math.hypot(bx - ax, bz - az);
  const n = Math.max(1, Math.ceil(d / 0.1));
  const [sx, sz] = d > 1e-6 ? [(-(bz - az) / d) * margin, ((bx - ax) / d) * margin] : [0, 0];
  for (let i = 0; i <= n; i++) {
    const [x, z] = [ax + ((bx - ax) * i) / n, az + ((bz - az) * i) / n];
    if (!walkable(g, Math.floor(x), Math.floor(z)) || !walkable(g, Math.floor(x + sx), Math.floor(z + sz)) || !walkable(g, Math.floor(x - sx), Math.floor(z - sz))) return false;
  }
  return true;
}

// e가 (x, z)로 가는 웨이포인트(길이 없으면 null). 주인공은 곧장 갈 수 있는 가장 먼 점으로 건너뛰어 직선으로 걷는다
// ponytail: 주인공만 편다(경로 길이² × 직선 검사). 몬스터도 펴려면 검사 횟수를 줄일 것
export function pathTo(w: World, e: Entity, x: number, z: number): Point[] | null {
  const p = findPath(w.grid, cellOf(e), [Math.floor(x), Math.floor(z)]);
  if (!p) return null;
  const pts = waypoints(p, x, z);
  if (e.kind !== 'hero') return pts;
  const out: Point[] = [];
  let [cx, cz] = [e.x, e.z];
  for (let i = 0; i < pts.length; ) {
    let j = pts.length - 1;
    while (j > i && !openLine(w.grid, cx, cz, pts[j][0], pts[j][1])) j--;
    out.push(pts[j]);
    [cx, cz] = pts[j];
    i = j + 1;
  }
  return out;
}

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
      e.path = pathTo(w, e, fx, fz) ?? [];
      return;
    }
    e.x = nx;
    e.z = nz;
    budget = 0;
  }
}

export const asleep = (e: Entity) => !!e.asleep; // 잠든 몬스터(얼음 속 개미·모래 속 개미귀신)
// 잠든 몬스터를 깨운다(둘레 SLEEP.chain m 안의 잠든 몬스터도)
export function wake(w: World, e: Entity) {
  const queue = [e];
  for (const m of queue) {
    if (!asleep(m)) continue;
    Object.assign(m, { asleep: false, target: 0, repathT: 0 });
    queue.push(...w.entities.filter((o) => o.state !== 'dead' && asleep(o) && dist(o, m) <= SLEEP.chain));
  }
}

// 보물 고블린을 잡았다: 둘레에 금화 더미 여럿과 장비(마법 이상)
function treasureDrop(w: World, t: Entity) {
  for (let i = 0; i < TREASURE.gold; i++) {
    const a = (i / TREASURE.gold) * Math.PI * 2;
    dropGold(w, t.x + Math.sin(a) * 0.8, t.z + Math.cos(a) * 0.8, GOLD_CHEST.lo, GOLD_CHEST.hi, t.power);
  }
  for (let i = 0; i < TREASURE.gear; i++) w.items.push(rollGear(w, t.x + (i ? 0.4 : -0.4), t.z, randSlot(w), 1 + Math.floor(rand(w) * w.maxTier), true));
}
