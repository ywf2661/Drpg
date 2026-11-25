// 게임 규칙(sim) 진입점: 맵 읽기(createWorld), 한 틱(step), 명령, 기본 AI·공격·충돌·줍기. three.js를 import하지 않는다.
// 수치·타입은 rules.ts, 공용 전투 도구는 core.ts, 스킬·보스 패턴·투사체는 abilities.ts. 바깥은 이 파일만 import하면 된다.
import { walkable, type Cell, type Grid } from './path';
import type { Side } from './wilds';
import { gearKeys, keyCut, recordPast, rollUnique, baseRank, canAfford, pay, resMax, resRegen, attackInterval, bagSpot, byId, gearGain, canHit, clearLine, damage, dist, dress, dropGold, face, friends, isBetter, makeEntity, pathTo, rand, randSlot, rank, rollGear, walk, wear, worn } from './core';
import { arrowStorm, fireRain, focus, hunt, pierce, pushShot, rain, shaft, spreadShot, tickTraps, tickVolleys, trap } from './ranger';
import { graveKing, boneArmor, bones, corpseBlast, curse, giant, lord, plague, prison, spear, tickAllies, tickCurses } from './necro';
import { blink, blizzard, bolt, chainLightning, comet, fireball, firefield, frost, lightning, tempest, tickAura, tickStorm, tickWard, ward } from './wizard';
import { finale, bounceAxe, charge, cleave, cleaveStart, dashStart, dashStep, execute, flee, fly, leap, leapStep, meteor, openGate, rollStart, rollStep, scare, shoot, shout, slam, spin, summon, throwAxe, tickFires, tickZones, whirl } from './abilities';
import { echoCast, flash, flashStep, graze, grazeStep, markSlash, markStart, tickCuts } from './iaido';
import { clearEdge, flameEdge, frostEdge, temper, tickEdge, unleash } from './temper';
import { flock, ride, rideStep, swoop, tickHawks } from './hawk';
import { afterimage, copyBolt, copyCast, linger, remember, retrace, swap, tickGhosts, type Recast } from './afterimage';
import { BLOCKS } from './dungeon';
import { special, specialLoot, tickGimmicks, steerBoat, touchChest } from './gimmicks';
import { makeSluice } from './sluice';
import { makeMine } from './mine';
import { ferryman } from './ferryman';
import { chief } from './chief';
import { PALADIN } from './sanctum';
import { paladin } from './paladin';
import { FINALE, GEAR_SKILLS, FIERCE, XP_CAP, GRAVE, ICICLE, type Point, type Skin, CAMP, REST, LEGEND_DROP, AGGRO, AMOVE, CAST, CHEST, COMBO, DT, ELITE_KIND_LIST, GOLD_CHEST, HIT_AT, isPassive, KEY_CD, KEYS, MAGE, POTION, RADIUS, RANK_MAX, REPATH, RESPEC, SEAL, SKILLS, TELL, TEMPER, TIER_LEVEL, TREES, startSkill, type Chest, type Ferry, type Keg, type Gate, type HeroClass, type SkillId, type SkillName, type Command, type Entity, type Exit, type Item, type Kind, type Prop, type World } from './rules';

export * from './rules';
export { afterimageStat, lingerStat, retraceStat, swapStat } from './afterimage';
export { assistStat, flockStat, rideStat, swoopStat } from './hawk';
export { blizzardStat, boltStat, chainStat, cometStat, embersStat, fireStat, firefieldStat, frostArmorStat, frostStat, staticStat, tempestStat, wardStat } from './wizard';
export { arrowStormStat, critStat, downpourStat, fireRainStat, focusStat, huntStat, pierceStat, pushStat, rainStat, snareStat, spreadStat, trapStat } from './ranger';
export { graveKingStat, boneArmorStat, bonesStat, corpseStat, curseStat, giantStat, lordStat, plagueStat, prisonStat, spearStat } from './necro';
export { wear, hurt, makeUnique, finaleStat, gearKeys, keyCut, pocket, socketRune, unsocketRune, rollRune, runeRand, type RuneTarget, hasUnique, quality, rollUnique, setCount, uniqueOf, baseRank, gearBonus, rollAffixes, rollSkillAffix, canAfford, resMax, skillCost, attackInterval, copyMods, defenseScore, moveSpeed, randSlot, worn, axeStat, heavy, bagBlocked, bagFits, bagSpot, bounceStat, burstStat, markStat, grazeStat, echoStat, flashStat, flameEdgeStat, frostEdgeStat, reforgeStat, unleashStat, cleaveStat, dashStat, discardFromBag, equipFromBag, moveGear, executeStat, gainXp, gearDiff, gearSize, heroMax, isBetter, leapStat, mastered, mod, moveInBag, rank, syn, trailStat, whirlStat, winding, rollGear, setLevel, shoutStat, weaponScore } from './core';

// 직업마다 예전 스킬 넷(트리 이전의 Q W E R). 테스트·봇의 기본 장비이고, createWorld가 기사 것을 넣는다
export const BASIC: Record<HeroClass, [SkillId, SkillId, SkillId, SkillId]> = {
  knight: ['cleave', 'dash', 'shout', 'throw'],
  wizard: ['fireball', 'frost', 'lightning', 'ward'],
  ranger: ['pierce', 'trap', 'rain', 'focus'],
  necromancer: ['bones', 'giant', 'curse', 'lord'],
};
// 직업을 바꾸고 그 직업의 예전 스킬 넷을 1단계로 Q W E R에 끼운다(테스트·봇)
export function useClass(w: World, cls: HeroClass) {
  w.cls = cls;
  w.ranks = Object.fromEntries(BASIC[cls].map((id) => [id, 1]));
  w.keys = Object.fromEntries(KEYS.map((k, i) => [k, BASIC[cls][i]])) as World['keys'];
}
// 새 판의 스킬: 첫 탭 1단계 스킬만 1단계로 Q에
export const newSkills = (cls: HeroClass): Pick<World, 'ranks' | 'keys'> => ({ ranks: { [startSkill(cls)]: 1 }, keys: { cleave: startSkill(cls), dash: null, shout: null, throw: null } });

// 맵 글자: '#' 벽, '.' 바닥, '>' 계단, 'H' 주인공, 'm' 졸개, 'w' 전사, 'a' 궁수, 'g' 마법사, 'N'·'W'·'A'·'G' 정예(졸개·전사·궁수·마법사), 'K' 해골 왕, 'M' 보스, 'c' 상자, 'B' 화로·'o' 큰 소품(막음), ',' 잔해(지나감)
// 'D' 사슬 문(닫힌 동안 막음). 기믹: 'Y' 성소, 'Q' 시련의 제단, 'I' 얼어붙은 보물(모두 상자처럼 막고 누른다), 'Z' 잠든 졸개, 'U' 모래 속 새끼 개미귀신(개미지옥 가운데), '~' 개미지옥 모래,
// 'T' 보물 고블린, 'X' 저주받은 무덤, '^' 가시 바닥, '@' 푸른 마법진, 'F'·'S'·'R' 바깥 출구(→ 초원·설원·폐허), 's'·'r' 잠긴 출구(막음), '*' 무너진 성소 입구·'%' 아직 안 열린 입구 자리(지나감), '$' 성소 5층의 성소,
// 'E' 순찰대장·'V' 상인·'P' 주민·'q' 의뢰인 주민·'L' 단서·'h' 창고(상자처럼 막고 누른다)
// 'x' 원정길 출구(야영지 → 원정대 천막), 'y' 야영지로 돌아가는 출구, 'e'·'i' 천막(2×2·4×4, 왼쪽 위 칸), 'n' 천막이 덮는 칸
// 호숫가: 'u' 물(못 걷고 시야·투사체는 지나감), 'v' 여울(느리게 걷는다), '_' 나루·다리 판자, 'l' 호숫가 출구, '!' 잠긴 호숫가 출구, '|' 통나무집 벽
// 광산: '-' 허공(물처럼 못 걷고 시야·투사체는 지나감), '+' 빛 다리(결정이 켜지면 걷는다), 'd' 결정(누른다), 'z' 광산 출구
const SPAWN: Record<string, Kind | undefined> = { H: 'hero', m: 'minion', w: 'warrior', W: 'warrior', a: 'archer', g: 'mage', N: 'minion', A: 'archer', G: 'mage', K: 'king', M: 'boss', Z: 'minion', j: 'minion', U: 'warrior', T: 'minion', X: 'minion' };
const SPAWN_SKIN: Record<string, Skin | undefined> = { U: 'antlion_small', T: 'treasure', X: 'grave' }; // 지역 스킨 대신
const CHEST_KIND: Record<string, Chest['kind']> = { Y: 'shrine', Q: 'trial', I: 'ice', E: 'elder', V: 'merchant', P: 'villager', q: 'asker', L: 'clue', J: 'beacon', k: 'keeper', O: 'seal', $: 'altar', h: 'stash', '5': 'wheel', '6': 'wheel', '8': 'wheel', '9': 'well', p: 'sick', t: 'priest', b: 'keg', d: 'crystal' };
const EXIT_TO: Record<string, Exit['to'] | undefined> = { F: 'field', S: 'snow', R: 'ruins', '*': 'sanctum', x: 'tent', y: 'camp', l: 'lake', '&': 'raid', z: 'mine' };
const LOCKED_TO: Record<string, Exit['to'] | undefined> = { s: 'snow', r: 'ruins', '%': 'sanctum', '!': 'lake' };

const PROPS: Record<string, Prop['kind'] | undefined> = { B: 'brazier', o: 'prop', ',': 'debris', e: 'tent', i: 'tentBig', n: 'pad' };

// power: 몬스터 층 배율, bossPower: 보스 배율(보스는 마지막 층 기준 수치라 층 배율 대신 회차 배율만).
// deep: 초원 너머(이야기 깊이 6부터) — 정예에 광폭·질주·불굴이 섞이고, 보스도 그중 하나를 단다
export function createWorld(seed: number, map: string[], power = 1, bossPower = 1, skins: World['skins'] = {}, deep = false): World {
  const w = map[0].length;
  const grid: Grid = { w, h: map.length, blocked: new Uint8Array(w * map.length), slow: new Uint8Array(w * map.length) };
  const spawns: { kind: Kind; x: number; z: number; elite: boolean; c: string }[] = [];
  let stairs: Cell | null = null;
  const props: Prop[] = [];
  const chests: Chest[] = [];
  const gateCells: Cell[] = [];
  const exits: Exit[] = [];
  const locked: Exit[] = [];
  const roads: Cell[] = [];
  const fords: Cell[] = [];
  const planks: Cell[] = [];
  const logs: Cell[] = [];
  const sand: Cell[] = [];
  const pits: Point[] = [];
  const spikes: Cell[] = [];
  const portals: Point[] = [];
  const kegs: Keg[] = [];
  const powder = new Set<number>();
  const stakes: Cell[] = [];
  map.forEach((row, z) =>
    [...row].forEach((c, x) => {
      const kind = SPAWN[c];
      const prop = PROPS[c];
      if (prop) props.push({ kind: prop, x, z });
      if (c === 'c' || c === 'C' || CHEST_KIND[c]) chests.push({ id: chests.length, x, z, open: false, ...((c === 'C' || c === 'k') && { guards: [] }), ...(CHEST_KIND[c] && { kind: CHEST_KIND[c] }) });
      if (c === 'D') gateCells.push([x, z]);
      if (c === '=') roads.push([x, z]);
      if (c === 'v') fords.push([x, z]), (grid.slow![z * w + x] = 1);
      if ('012347'.includes(c)) fords.push([x, z]); // 호숫가 퍼즐 물길: 그림은 물면(막힘·느림은 makeSluice)
      if (c === '_') planks.push([x, z]);
      if (c === '|') logs.push([x, z]);
      if (c === '~' || c === 'U') sand.push([x, z]);
      if (c === 'U') pits.push([x + 0.5, z + 0.5]);
      if (c === '^') spikes.push([x, z]);
      if (c === '@') portals.push([x + 0.5, z + 0.5]);
      if ('[]{'.includes(c)) stakes.push([x, z]); // 약탈자 진지: 말뚝 방책(화약통이 박힌 칸도 말뚝)
      if (c === ':' || c === ']') powder.add(z * w + x); // 도화선(방책 밑으로도)
      if (c === 'b' || c === '{') kegs.push({ x, z, fuse: -1, lit: false, wall: c === '{', done: false, chest: c === 'b' ? chests.length - 1 : -1 });
      if (EXIT_TO[c]) exits.push({ x, z, to: EXIT_TO[c]! });
      if (LOCKED_TO[c]) locked.push({ x, z, to: LOCKED_TO[c]! });
      if (BLOCKS.includes(c)) grid.blocked[z * w + x] = c === 'u' || c === 'f' || c === '-' || c === '+' ? 2 : 1;
      else if (c === '>') stairs = [x, z];
      else if (kind) spawns.push({ kind, x: x + 0.5, z: z + 0.5, elite: 'NWAG'.includes(c), c });
    }),
  );
  const ferries = pairBoats(map);
  const sluice = makeSluice(map, grid);
  const mine = makeMine(map, grid, chests);
  spawns.sort((a, b) => Number(b.kind === 'hero') - Number(a.kind === 'hero')); // 주인공 = id 0 (안정 정렬)
  if (spawns[0]?.kind !== 'hero') throw new Error('맵에 주인공(H)이 없습니다');
  // 문이 막는 통로의 방향: 양옆(x±1)이 뚫려 있으면 x 방향 통로
  const gates = gateCells.map(([x, z], id): Gate => ({ id, x, z, axis: walkable(grid, x - 1, z) || walkable(grid, x + 1, z) ? 'x' : 'z', open: false, guards: [] }));
  const entities = spawns.map((s, id) => {
    const e = dress(makeEntity(id, s.kind, s.x, s.z, s.kind === 'hero' ? 1 : s.kind === 'boss' ? bossPower : power, s.elite), SPAWN_SKIN[s.c] ? { [s.kind]: SPAWN_SKIN[s.c] } : skins);
    if (s.c === 'Z' || s.c === 'U' || s.c === 'j') e.asleep = true; // j = 물가에 잠긴 마을 사람(호숫가)
    if (s.c === 'X') e.cd = GRAVE.first;
    return e;
  });
  guardGates(grid, gates, entities);
  for (const ch of chests) if (ch.guards) ch.guards = entities.filter((e) => e.kind !== 'hero' && Math.hypot(e.x - ch.x - 0.5, e.z - ch.z - 0.5) <= CAMP.radius).map((e) => e.id);
  // 정예 특성: 시드와 id로 정한다(월드 난수열을 쓰지 않아 정예가 없던 때와 전투 굴림이 같다)
  const pool = deep ? [...ELITE_KIND_LIST, ...FIERCE] : ELITE_KIND_LIST;
  const pick = <T,>(e: Entity, list: T[]) => list[Math.floor(rand({ rng: seed + e.id * 7919 } as World) * list.length)];
  for (const e of entities) if (e.elite) e.eliteKind = pick(e, pool);
  for (const e of entities) if (deep && e.kind === 'boss') e.eliteKind = pick(e, FIERCE);
  // 기본 장비(롱소드·천옷) = 장비 도입 전 주인공 수치. 게임은 main이 시작 장비를 넣는다
  return { cls: 'knight', res: 100, pity: 0, trophies: {}, wardHp: 0, wardT: 0, wardBroke: false, storm: [], traps: [], volleys: [], focusT: 0, flashQ: [], flashHit: -1, flashPath: [], flashHits: [], cuts: [], snapped: [], echo: 0, echoOn: null, echoHit: [], echoFrom: [0, 0], grazeFrom: [0, 0], grazeHit: [], allies: [], curses: [], raised: [], grid, entities, skins, rng: seed, stairs, toStairs: false, exits, locked, talk: null, roads, fords, planks, logs, ferries, ride: null, ferryLock: -1, sluice, mine, puddles: [], cleansed: false, kegs, powder, sparks: [], stakes, broken: new Set(), amove: null, queued: null, castT: 0, props, chests, gates, opening: null, taking: null, picked: null, items: [], shots: [], blasts: [], zones: [], combos: [], fires: [], healing: null, nextItem: 0, potions: 0, gold: 0, power, xpCap: XP_CAP * bossPower, gear: { weapon: 3, armor: 1, helm: 1, boots: 1 }, mods: { weapon: [], armor: [], helm: [], boots: [] }, bag: [], runes: {}, runeRng: seed ^ 0x5bd1e995, autoEquip: true, regenAcc: 0, rest: false, land: 'dungeon', buff: null, sand, pits, spikes, spikeT: 0, portals, portalLock: false, icicleT: ICICLE.every, bossRaised: false, marked: false, sureLegend: false, relics: 0, relicDrop: -1, relicGot: -1, offer: null, bareT: 0, knightsUp: false, haloDrop: 0, horseDrop: false, past: [], haloCd: 0, pal: { rain: PALADIN.rainFirst, judge: -1, quiet: 0, burn: {}, link: {} }, swords: [], calmT: 0, lastHp: 0, rested: 0, maxTier: 2, level: 1, xp: 0, skillCd: 0, cleaves: 0, markSlashes: 0, dashCd: 0, dashHit: [], dashes: 0, shoutCd: 0, shoutT: 0, shouts: 0, casts: 0, ghosts: [], memos: [], ghostScale: 1, swaps: [], hawk: null, elem: -1, finales: [], flock: [], rideHit: [], throwCd: 0, rollCd: 0, ranks: { cleave: 1, dash: 1, shout: 1, throw: 1 }, points: 0, keys: { cleave: 'cleave', dash: 'dash', shout: 'shout', throw: 'throw' }, cdFull: { cleave: 1, dash: 1, shout: 1, throw: 1 }, trail: -1, auraT: 0, auraAcc: 0, spinT: 0, spinAcc: 0, slash: 'cleave', edge: { kind: null, left: 0, t: 0 }, edgeSwings: 0, edgeSlashes: 0, edgeHits: [], impacts: 0 };
}

// 보스를 k배로(체력·피해 배율). 경험치 상한(xpCap)은 그대로 둔다 — createWorld의 bossPower를 키우면 상한도 같이 커진다
export function toughenBoss(w: World, k: number) {
  for (const e of w.entities)
    if (e.kind === 'boss') {
      e.power *= k;
      e.hp = e.maxHp = Math.round(e.maxHp * k);
    }
}

// 봉인 문의 문지기: 문을 닫은 채로 주인공 칸에서 걸어서 닿는 몬스터(문 너머의 방에 있는 몬스터는 빼고) 중 가까운 것들
function guardGates(grid: Grid, gates: Gate[], entities: Entity[]) {
  if (!gates.length) return;
  const seen = new Uint8Array(grid.w * grid.h);
  const q = [Math.floor(entities[0].z) * grid.w + Math.floor(entities[0].x)];
  seen[q[0]] = 1;
  for (let i = 0; i < q.length; i++) {
    const [x, z] = [q[i] % grid.w, Math.floor(q[i] / grid.w)];
    for (const [nx, nz] of [[x + 1, z], [x - 1, z], [x, z + 1], [x, z - 1]])
      if (walkable(grid, nx, nz) && !seen[nz * grid.w + nx]) (seen[nz * grid.w + nx] = 1), q.push(nz * grid.w + nx);
  }
  const outside = entities.filter((e) => e.kind !== 'hero' && seen[Math.floor(e.z) * grid.w + Math.floor(e.x)]);
  for (const g of gates) {
    const d = (e: Entity) => Math.hypot(e.x - g.x - 0.5, e.z - g.z - 0.5);
    const near = [...outside].sort((a, b) => d(a) - d(b));
    g.guards = near.filter((e, i) => d(e) <= SEAL.radius || i < SEAL.min).map((e) => e.id);
  }
}

// (x, z)가 막 내린 나루(ferryLock) 곁의 배를 눌렀나
const boatAt = (w: World, x: number, z: number) =>
  w.ferries.some((f) => f.docks.some(([dx, dz], j) => dz * w.grid.w + dx === w.ferryLock && Math.hypot(x - (j ? f.b : f.a)[0], z - (j ? f.b : f.a)[1]) < 1.2));

// 나룻배 'f'를 짝짓는다: 배는 나루 끝 판자('_') 곁에 있고, 나루 반대쪽으로 물('u')만 지나 닿는 배 — 그 배도 맞은편에 나루가 있어야 짝
// (다른 줄의 배가 우연히 같은 줄에 있어도 나루 방향이 달라 짝이 되지 않는다)
function pairBoats(map: string[]): Ferry[] {
  const out: Ferry[] = [];
  const at = (x: number, z: number) => map[z]?.[x];
  map.forEach((row, z) =>
    [...row].forEach((c, x) => {
      if (c !== 'f') return;
      for (const [dx, dz] of [[1, 0], [0, 1]]) {
        if (at(x - dx, z - dz) !== '_') continue;
        let k = 1;
        while (at(x + dx * k, z + dz * k) === 'u') k++;
        if (k > 1 && at(x + dx * k, z + dz * k) === 'f' && at(x + dx * (k + 1), z + dz * (k + 1)) === '_')
          out.push({ a: [x + 0.5, z + 0.5], b: [x + dx * k + 0.5, z + dz * k + 0.5], docks: [[x - dx, z - dz], [x + dx * (k + 1), z + dz * (k + 1)]] });
      }
    }),
  );
  return out;
}

// 문지기를 모두 쓰러뜨린 문은 사슬이 풀린다(문지기가 없는 문은 스킬로만 연다)
function unseal(w: World) {
  for (const g of w.gates) if (!g.open && g.guards.length && g.guards.every((id) => w.entities[id].state === 'dead')) openGate(w, g.x, g.z);
}

export function step(w: World, cmds: Command[]): void {
  const hero = w.entities[0];
  gearKeys(w); // 전설 스킬: 장비를 바꾸는 길이 여럿이라 여기 한 곳에서 칸을 맞춘다
  w.skillCd = Math.max(0, w.skillCd - DT);
  w.dashCd = Math.max(0, w.dashCd - DT);
  w.shoutCd = Math.max(0, w.shoutCd - DT);
  w.shoutT = Math.max(0, w.shoutT - DT);
  w.focusT = Math.max(0, w.focusT - DT);
  for (const k of Object.keys(w.trophies) as (keyof World['trophies'])[]) if ((w.trophies[k]! -= DT) <= 0) delete w.trophies[k]; // 정예 사냥꾼 특성 시간
  w.throwCd = Math.max(0, w.throwCd - DT);
  w.rollCd = Math.max(0, w.rollCd - DT);
  w.haloCd = Math.max(0, w.haloCd - DT);
  recordPast(w, hero);
  if (hero.state !== 'dead') w.res = Math.min(resMax(w), w.res + resRegen(w) * DT);
  w.castT = Math.max(0, w.castT - DT);
  w.finales = w.finales.filter((f) => (f.age += DT) <= FINALE.age);
  w.blasts = w.blasts.filter((b) => (b.age += DT) <= MAGE.blastAge);
  w.combos = w.combos.filter((c) => (c.age += DT) <= COMBO.age);
  w.edgeHits = w.edgeHits.filter((h) => (h.age += DT) <= TEMPER.hitAge);
  regen(w, hero);
  if (w.wardT > 0 || w.wardBroke) tickWard(w, hero);
  if (w.storm.length) tickStorm(w, hero);
  if (w.auraT > 0) tickAura(w, hero);
  if (w.ghosts.length || w.memos.length || w.swaps.length) tickGhosts(w, hero, recast);
  if (w.traps.length) tickTraps(w, hero);
  if (w.volleys.length) tickVolleys(w, hero);
  if (w.curses.length) tickCurses(w, hero);
  tickCuts(w, hero);
  tickEdge(w);
  if (w.queued && hero.phase === 'none') {
    cmds = [w.queued, ...cmds]; // 구르기·돌진 중에 누른 이동·공격을 이제 따른다
    w.queued = null;
  }
  for (const c of cmds) command(w, hero, c);
  advance(w, hero);
  if (hero.state === 'dead') w.spinT = 0;
  if (w.spinT > 0) spin(w, hero);
  for (const e of w.entities) {
    if (e.state === 'dead') continue; // 같은 틱 앞 순서에서 죽었을 수도 있음
    if (e !== hero && special(w, e, hero)) continue; // 잠든 몬스터·무덤·보물 고블린
    if (e.stunT > 0) {
      e.stunT = Math.max(0, e.stunT - DT); // 기절: 생각도 행동도 하지 않는다
      continue;
    }
    if (e.fearT > 0) {
      e.fearT = Math.max(0, e.fearT - DT); // 공포: 도망만 친다
      scare(w, e, hero);
      continue;
    }
    if (e !== hero) think(w, e, hero);
    act(w, e);
  }
  if (w.allies.length) tickAllies(w, hero);
  fly(w, hero);
  if (w.cls === 'ranger') tickHawks(w, hero); // 매(스킬 화살 협공은 fly가 고른다)
  tickZones(w);
  if (w.fires.length) tickFires(w, hero);
  separate(w);
  reachChest(w, hero);
  pickup(w, hero);
  unseal(w);
  tickGimmicks(w, hero);
}

// '재생의'(모든 부위 합): 초당 value/10. 소수점은 쌓아 두었다가 1씩
function regen(w: World, hero: Entity) {
  if (hero.state === 'dead') return void (w.healing = null);
  // 물약: POTION.time에 걸쳐 고르게. 지금까지 줘야 할 양(내림)과 준 양의 차이만큼 → 합계가 정확하다
  const h = w.healing;
  if (h) {
    h.t += DT;
    const due = Math.min(h.total, Math.floor((h.total * h.t) / POTION.time + 1e-6));
    hero.hp = Math.min(hero.maxHp, hero.hp + due - h.given);
    h.given = due;
    if (due === h.total) w.healing = null;
  }
  const r = worn(w, 'regen');
  w.regenAcc += (r / 10) * DT;
  while (w.regenAcc >= 1) {
    w.regenAcc -= 1;
    hero.hp = Math.min(hero.maxHp, hero.hp + 1);
  }
  rest(w, hero);
}

// 모닥불 휴식(초원): 싸우지 않는 동안 화로 옆이면 체력이 조금씩 찬다
function rest(w: World, hero: Entity) {
  w.calmT = hero.hp < w.lastHp ? 0 : w.calmT + DT;
  const fire = w.props.some((p) => p.kind === 'brazier' && Math.hypot(p.x + 0.5 - hero.x, p.z + 0.5 - hero.z) <= REST.range);
  const calm = w.calmT >= REST.calm && !w.entities.some((e) => e !== hero && e.state !== 'dead' && dist(e, hero) <= AGGRO);
  if (w.rest && fire && calm && hero.hp < hero.maxHp) {
    const before = Math.floor(w.rested);
    w.rested += hero.maxHp * REST.rate * DT;
    hero.hp = Math.min(hero.maxHp, hero.hp + Math.floor(w.rested) - before);
  }
  w.lastHp = hero.hp;
}

// 주인공 발밑(POTION.pickup 이내)의 금화·룬·성물·물약은 밟으면 줍고, 장비는 주우러 간 것(w.taking)만 보관함 격자에 자리가 있으면 줍는다.
// 자동 장착이면 더 좋은 장비는 바로 입는다. 벗은 장비는 보관함으로, 자리가 없으면 발밑에(사라지는 장비는 없다)
function pickup(w: World, hero: Entity) {
  if (hero.state === 'dead') return;
  for (const it of w.items) unstick(w.grid, it);
  const fallen: Item[] = [];
  w.items = w.items.filter((it) => {
    if (Math.hypot(it.x - hero.x, it.z - hero.z) > POTION.pickup) return true;
    if (it.kind === 'gold') {
      w.gold += it.amount ?? 0;
      return false;
    }
    if (it.kind === 'rune') {
      w.runes[it.rune!] = (w.runes[it.rune!] ?? 0) + 1;
      return false;
    }
    if (it.kind === 'relic') {
      w.relics |= 1 << it.relic!;
      w.relicGot = it.relic!; // main이 알리고 저장한다
      return false;
    }
    if (it.kind === 'potion') {
      if (w.potions >= POTION.max) return true;
      w.potions++;
      return false;
    }
    if (it.id !== w.taking) return true; // 밟기만 한 장비는 그대로
    const gear = { kind: it.kind, tier: it.tier, affixes: it.affixes ?? [] };
    const up = gearGain(w, gear); // 입기 전에 잰다
    const better = w.autoEquip && isBetter(w, gear);
    const got = better ? wear(w, gear) : gear; // 보관함에 넣을 것(자동 장착이면 벗은 장비)
    const at = bagSpot(w.bag, got);
    if (at) w.bag.push({ ...got, x: at[0], y: at[1] });
    else if (better) fallen.push({ id: w.nextItem++, x: hero.x, z: hero.z, ...got });
    else return true; // 보관함이 차서 못 주웠다: taking을 남겨 막힘을 알린다
    w.taking = null;
    if (up > 1e-9) w.picked = { ...gear, up, worn: better }; // main이 줍는 순간 카드를 띄운다
    return false;
  });
  w.items.push(...fallen);
  // 길이 끝났는데 닿지 못했거나 장비가 사라졌으면 포기
  const t = w.taking === null ? null : w.items.find((i) => i.id === w.taking);
  if (w.taking !== null && (!t || (!hero.path.length && Math.hypot(t.x - hero.x, t.z - hero.z) > POTION.pickup))) w.taking = null;
}

// 배울 수 없는 까닭(배울 수 있으면 null): 다른 직업, 최고 단계, 레벨, 같은 탭 아래 단계, 포인트
export function learnBlock(w: World, id: SkillId): string | null {
  const { cls, tab, tier } = SKILLS[id];
  if (cls !== w.cls) return '다른 직업의 스킬';
  if (GEAR_SKILLS[id]) return '전설 장비가 주는 스킬';
  if (baseRank(w, id) >= RANK_MAX) return '최고 단계';
  if (w.level < TIER_LEVEL[tier]) return `레벨 ${TIER_LEVEL[tier]}부터 배울 수 있음`;
  const below = tier ? TREES[cls][tab].skills[tier - 1] : null;
  if (below && !rank(w, below)) return '바로 아래 단계 스킬을 먼저 배워야 함';
  if (w.points <= 0) return '스킬 포인트 없음';
  return null;
}

// 스킬 포인트 1을 써서 단계 +1. 처음 배운 액티브 스킬은 빈 칸에 끼운다.
// 창이 열린 동안 sim이 멈추므로 HUD는 명령 큐를 거치지 않고 learn·bind·respec을 바로 부른다(보관함과 같다)
export function learn(w: World, id: SkillId) {
  if (learnBlock(w, id)) return;
  w.ranks[id] = baseRank(w, id) + 1;
  w.points--;
  const free = KEYS.find((k) => !w.keys[k]);
  if (w.ranks[id] === 1 && !isPassive(id) && free) w.keys[free] = id;
}

// 배운 액티브 스킬을 칸에 끼운다. 다른 칸에 있었으면 맞바꾸고, 두 칸의 재사용 대기는 긴 쪽으로 맞춘다(바꿔 끼워 대기를 건너뛰지 못하게)
export function bind(w: World, key: SkillName, id: SkillId) {
  if (SKILLS[id]?.cls !== w.cls || isPassive(id) || !rank(w, id) || !KEYS.includes(key)) return;
  const from = KEYS.find((k) => w.keys[k] === id);
  if (from === key) return;
  if (from) {
    w.keys[from] = w.keys[key];
    const cd = Math.max(w[KEY_CD[from]], w[KEY_CD[key]]);
    w[KEY_CD[from]] = w[KEY_CD[key]] = cd;
    w.cdFull[from] = w.cdFull[key] = Math.max(w.cdFull[from], w.cdFull[key]);
  }
  w.keys[key] = id;
}

// 금화 RESPEC으로 스킬 포인트를 모두 되돌린다(새 판처럼 첫 스킬만 1단계로 Q에). 하던 회오리·눈보라·칼 강화는 멈춘다
export function respec(w: World) {
  const spent = Object.values(w.ranks).reduce((s, r) => s + (r ?? 0), 0) - 1;
  if (w.gold < RESPEC || spent <= 0) return;
  w.gold -= RESPEC;
  Object.assign(w, newSkills(w.cls), { points: w.points + spent, spinT: 0, auraT: 0, ghosts: [], memos: [], hawk: null, flock: [] });
  clearEdge(w);
}

// 즉시 회복. 이동·공격·계단 의도는 그대로 둔다
function drink(w: World, hero: Entity) {
  if (hero.state === 'dead' || w.potions <= 0 || hero.hp >= hero.maxHp || w.healing) return; // 차는 중에는 다시 못 마신다
  w.healing = { total: Math.round(hero.maxHp * POTION.heal), given: 0, t: 0 };
  w.potions--;
}

// 주인공이 서 있는 바깥 출구 칸(없으면 null)
export function exitAt(w: World): Exit | null {
  const [x, z] = [Math.floor(w.entities[0].x), Math.floor(w.entities[0].z)];
  return w.exits.find((e) => e.x === x && e.z === z) ?? null;
}
// 출구가 맞닿은 가장자리
export const sideOf = (w: World, e: Exit): Side => (e.z === 0 ? 'n' : e.z === w.grid.h - 1 ? 's' : e.x === 0 ? 'w' : 'e');

export function outcome(w: World): 'dead' | 'descend' | 'clear' | null {
  const hero = w.entities[0];
  if (hero.state === 'dead') return 'dead';
  if (exitAt(w)) return 'descend';
  if (w.stairs) return w.toStairs && Math.hypot(hero.x - w.stairs[0] - 0.5, hero.z - w.stairs[1] - 0.5) <= 0.5 ? 'descend' : null;
  if (w.exits.length) return null; // 출구가 있는 구역은 걸어 나가야 끝난다
  const boss = w.entities.find((e) => e.kind === 'boss');
  if (boss) return boss.state === 'dead' ? 'clear' : null; // 보스 층: 보스만 쓰러뜨리면 된다
  return w.entities.every((e) => e.kind === 'hero' || e.state === 'dead') ? 'clear' : null;
}

function command(w: World, hero: Entity, c: Command) {
  if (c.type === 'drink') return drink(w, hero);
  if (c.type === 'learn') return learn(w, c.skill);
  if (c.type === 'bind') return bind(w, c.key, c.skill);
  if (c.type === 'respec') return respec(w);
  if (hero.state === 'dead') return;
  if (c.type === 'move' && w.ferryLock >= 0 && boatAt(w, c.x, c.z)) w.ferryLock = -1; // 막 내린 나루에서 배를 누르면 바로 되돌아 탄다
  if (w.ride && c.type === 'move') return steerBoat(w, c.x, c.z); // 배 위: 누른 곳으로 배를 몬다
  if (w.ride && (c.type === 'amove' || c.type === 'open' || c.type === 'take' || c.type === 'roll')) return; // 그 밖엔 공격·스킬만
  const going = c.type === 'move' || c.type === 'amove' || c.type === 'attack' || c.type === 'open' || c.type === 'take';
  if (hero.phase !== 'none' || (going && (w.castT > 0 || (hero.state === 'attack' && hero.skill)))) {
    // 돌진·구르기 중에는 물약 말고는 못 하고, 스킬 시전 중에는 못 움직인다. 이동·공격은 마지막 것을 기억했다가 끝나면 따른다
    if (going) w.queued = c;
    return;
  }
  if (!going) {
    const cd = w.skillCd + w.dashCd + w.shoutCd + w.throwCd;
    cast(w, hero, c);
    if (hero.phase !== 'none') w.castT = 0; // 구르기·돌진은 시전을 끊는다
    else if (w.skillCd + w.dashCd + w.shoutCd + w.throwCd > cd && !hero.skill && w.spinT <= 0) w.castT = CAST; // 스킬이 나갔다(재사용 대기가 돌기 시작): 서서 시전. 회오리는 돌면서 걷는다
    return;
  }
  w.opening = null; // 다른 명령은 상자로 가던 것을 취소한다
  w.taking = null; // 주우러 가던 장비도
  w.amove = null; // 공격 이동도
  if (c.type === 'open') return goToChest(w, hero, c.chestId);
  if (c.type === 'take') return goToItem(w, hero, c.itemId);
  w.toStairs = false; // 다른 명령은 계단으로 가려던 의도를 취소한다
  if (c.type === 'attack') {
    const t = w.entities[c.targetId];
    if (!t || t === hero || t.state === 'dead') return;
    if (hero.state === 'attack' && hero.target !== t.id) {
      hero.state = 'idle'; // 다른 대상으로 바꾸면 휘두르기 취소, 같은 대상 재클릭은 유지
      hero.attackT = 0;
    }
    hero.target = t.id;
    hero.repathT = 0; // 다음 act에서 즉시 경로 계산
    return;
  }
  moveTo(w, hero, c);
}

// 액티브 스킬: (x, z)는 조준점(없으면 스스로 고른다). 쓰이면 재사용 대기(초), 쓰지 못했으면 0
type Cast = (w: World, hero: Entity, x?: number, z?: number) => number;
const CASTS: Partial<Record<SkillId, Cast>> = {
  cleave: cleaveStart, mark: markStart, graze, flash, flameEdge, frostEdge, unleash, whirl, execute, dash: dashStart, shout, leap, throw: throwAxe, bounce: bounceAxe,
  finale, graveKing,
  fireball, firefield, comet, frost, ward, blizzard, lightning, chain: chainLightning, tempest, afterimage, swap, retrace, swoop, ride, flock,
  pierce, spread: spreadShot, focus, trap, push: pushShot, hunt, rain, fireRain, arrowStorm,
  bones, giant, lord, curse, plague, corpseBlast, spear, boneArmor, prison,
};
const recast: Recast = (w, id, p, x, z) => CASTS[id]?.(w, p, x, z) ?? 0; // 잔상이 주문을 다시 쓰는 길
const CMD_KEY: Partial<Record<Command['type'], SkillName>> = { skill: 'cleave', dash: 'dash', shout: 'shout', throw: 'throw' };

// 명령 skill·dash·shout·throw = 칸 Q W E R에 끼운 스킬. 재사용 대기는 칸마다(KEY_CD). 가던 길·상자·계단은 쓴 뒤에 이어 간다
function cast(w: World, hero: Entity, c: Command) {
  if (c.type === 'roll') {
    if (w.cls !== 'wizard') return rollStart(w, hero, c.x, c.z);
    const [x0, z0, ready] = [hero.x, hero.z, w.rollCd <= 0];
    blink(w, hero, c.x, c.z);
    if (ready && w.rollCd > 0) linger(w, hero, x0, z0); // 떠난 자리
    return;
  }
  const key = CMD_KEY[c.type];
  const id = key && w.keys[key];
  if (!key || !id || !rank(w, id) || w[KEY_CD[key]] > 0) return; // 빈 칸·재사용 대기 중
  if (!canAfford(w, id)) return; // 기력·마나 부족
  const [x, z] = ['x' in c ? c.x : undefined, 'z' in c ? c.z : undefined];
  const cd = echoCast(w, id, () => CASTS[id]?.(w, hero, x, z) ?? 0);
  if (cd > 0) {
    w[KEY_CD[key]] = w.cdFull[key] = cd * keyCut(w, key); // 칸 룬
    pay(w, id); // 나갔을 때만 비용
    if (w.cls === 'wizard') w.elem = SKILLS[id].tab; // 엘리멘탈 스태프의 색·추가 피해 속성
    if (w.ghosts.length) copyCast(w, hero, id, x, z, recast); // 잔상이 따라 쓴다
    remember(w, id, hero, x, z); // 지나온 길
  }
}

function moveTo(w: World, hero: Entity, c: Extract<Command, { type: 'move' | 'amove' }>) {
  let [x, z] = [c.x, c.z];
  const s = w.stairs;
  if (s && Math.abs(Math.floor(x) - s[0]) <= 1 && Math.abs(Math.floor(z) - s[1]) <= 1) {
    [x, z] = [s[0] + 0.5, s[1] + 0.5]; // 계단 그림의 구멍(계단 칸 주변 3×3) 어디를 눌러도 중심으로
    w.toStairs = true;
  }
  // 벽·소품을 눌렀으면 주인공 쪽으로 당겨, 처음 나오는 걸을 수 있는 곳으로 간다
  const d = Math.hypot(hero.x - x, hero.z - z);
  for (let k = 0.25; k < d && !walkable(w.grid, Math.floor(x), Math.floor(z)); k += 0.25) [x, z] = [c.x + ((hero.x - c.x) * k) / d, c.z + ((hero.z - c.z) * k) / d];
  const p = pathTo(w, hero, x, z);
  if (!p) return;
  hero.path = p;
  hero.target = null;
  hero.state = 'move'; // 휘두르는 중이었다면 취소
  hero.attackT = 0;
  hero.skill = false;
  if (c.type === 'amove') w.amove = [x, z];
}

// 공격 이동: 대상이 없으면 가까운 적(AMOVE 안, 벽에 가리지 않은)을 대상으로 삼고, 적이 없으면 목적지로 다시 걷는다. 닿으면 끝
function advance(w: World, hero: Entity) {
  if (!w.amove || hero.state === 'dead' || hero.phase !== 'none') return;
  const t = hero.target === null ? null : w.entities[hero.target];
  if (t && t.state !== 'dead') return;
  const near = w.entities
    .filter((e) => e !== hero && e.state !== 'dead' && dist(e, hero) <= AMOVE && clearLine(w, hero, e))
    .sort((a, b) => dist(a, hero) - dist(b, hero))[0];
  if (near) {
    hero.target = near.id;
    hero.repathT = 0;
    return;
  }
  if (hero.state === 'attack' || hero.path.length) return; // 마지막 휘두르기가 끝나고, 쫓던 길이 지워진 뒤에
  const [x, z] = w.amove;
  const p = Math.hypot(x - hero.x, z - hero.z) > 0.3 ? pathTo(w, hero, x, z) : null;
  if (p) hero.path = p;
  else w.amove = null;
}

// 벽·소품 칸에 떨어진 아이템(상자 옆 금화 등)은 주울 수 없으니, 둘레 8칸 중 가장 가까운 걸을 수 있는 칸 안으로 옮긴다
function unstick(g: Grid, it: Item) {
  const [cx, cz] = [Math.floor(it.x), Math.floor(it.z)];
  if (walkable(g, cx, cz)) return;
  const near = (x: number, z: number) => [Math.min(x + 0.8, Math.max(x + 0.2, it.x)), Math.min(z + 0.8, Math.max(z + 0.2, it.z))];
  let best: number[] | null = null;
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    if (!walkable(g, cx + dx, cz + dz)) continue;
    const p = near(cx + dx, cz + dz);
    if (!best || Math.hypot(p[0] - it.x, p[1] - it.z) < Math.hypot(best[0] - it.x, best[1] - it.z)) best = p;
  }
  if (best) [it.x, it.z] = best;
}

// 바닥 장비로 걸어간다(닿으면 pickup이 줍는다). 이미 발밑이면 걷지 않는다
function goToItem(w: World, hero: Entity, id: number) {
  const it = w.items.find((i) => i.id === id);
  if (!it) return;
  if (Math.hypot(it.x - hero.x, it.z - hero.z) > POTION.pickup) {
    const p = pathTo(w, hero, it.x, it.z);
    if (!p) return;
    Object.assign(hero, { path: p, target: null, state: 'move', attackT: 0, skill: false });
  }
  w.taking = id;
}

// 상자 옆 걸을 수 있는 칸 중 가장 가까운 곳으로 간다
function goToChest(w: World, hero: Entity, id: number) {
  const ch = w.chests[id];
  if (!ch || ch.open) return;
  const near: Cell[] = [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]]
    .map(([dx, dz]): Cell => [ch.x + dx, ch.z + dz])
    .filter(([x, z]) => walkable(w.grid, x, z))
    .sort((a, b) => Math.hypot(a[0] + 0.5 - hero.x, a[1] + 0.5 - hero.z) - Math.hypot(b[0] + 0.5 - hero.x, b[1] + 0.5 - hero.z));
  for (const cell of near) {
    const p = pathTo(w, hero, cell[0] + 0.5, cell[1] + 0.5);
    if (!p) continue;
    Object.assign(hero, { path: p, target: null, state: 'move', attackT: 0, skill: false });
    w.opening = id;
    return;
  }
}

// 상자에 닿으면 연다: 물약 또는 장비가 상자에서 주인공 쪽으로 떨어진다. 길이 끝났는데 못 닿았으면 포기
function reachChest(w: World, hero: Entity) {
  if (w.opening === null || hero.state === 'dead') return;
  const ch = w.chests[w.opening];
  const [cx, cz] = [ch.x + 0.5, ch.z + 0.5];
  const d = Math.hypot(hero.x - cx, hero.z - cz);
  if (d > CHEST.reach) {
    if (!hero.path.length) w.opening = null;
    return;
  }
  w.opening = null;
  Object.assign(hero, { path: [], state: 'idle' }); // 닿으면 선다(대화창이 sim을 멈춰도 제자리 달리기를 하지 않게)
  if (touchChest(w, ch)) return; // 성소·시련의 제단(시작)
  if (ch.guards?.some((id) => w.entities[id].state !== 'dead')) return; // 야영지 무리·시련의 물결이 살아 있으면 잠겨 있다
  ch.open = true;
  if (ch.kind === 'keeper') w.marked = true; // 의뢰 궤: 지킴이를 다 잡고 열었다(전리품은 야영지 상자처럼)
  const [x, z] = [cx + ((hero.x - cx) / d) * CHEST.drop, cz + ((hero.z - cz) / d) * CHEST.drop];
  if (specialLoot(w, ch, x, z, x + ((hero.z - cz) / d) * 0.4, z - ((hero.x - cx) / d) * 0.4)) return; // 시련·얼음 상자
  const kind = !ch.guards && rand(w) < CHEST.potion ? 'potion' : randSlot(w); // 야영지 상자는 늘 장비
  if (kind === 'potion') w.items.push({ id: w.nextItem++, x, z, kind, tier: 0 });
  else if (rand(w) < LEGEND_DROP.chest) w.items.push({ ...rollUnique(w, x, z, w.maxTier) });
  else w.items.push(rollGear(w, x, z, kind, 1 + Math.floor(rand(w) * w.maxTier)));
  dropGold(w, x + (hero.z - cz) / d * 0.4, z - (hero.x - cx) / d * 0.4, GOLD_CHEST.lo * (ch.guards ? CAMP.gold : 1), GOLD_CHEST.hi * (ch.guards ? CAMP.gold : 1), w.power); // 옆에 금화

}

function act(w: World, e: Entity) {
  let t = byId(w, e.target);
  if (e.target !== null && (!t || t.state === 'dead')) {
    e.target = null;
    e.path = [];
    t = null;
  }
  if (e.skin === 'fallen_paladin' && paladin(w, e, t)) return; // 성기사 전용 기술(성검의 비·심판)
  if (e.skin === 'raider_chief' && chief(w, e, t)) return; // 약탈자 우두머리: 통 들이받기·내려찍기·통 던지기(돌진은 아래 charge)
  if (e.skin === 'plague_ferryman') {
    if (ferryman(w, e, t)) return; // 뱃사공: 물 위·나루·배에 오르기(돌진은 안 한다)
  } else
  if (e.kind === 'boss' && charge(w, e, t)) return;
  if (e.kind === 'hero' && e.phase === 'charge') return dashStep(w, e);
  if (e.kind === 'hero' && e.phase === 'roll') return rollStep(w, e);
  if (e.kind === 'hero' && e.phase === 'leap') return leapStep(w, e);
  if (e.kind === 'hero' && e.phase === 'graze') return grazeStep(w, e);
  if (e.kind === 'hero' && e.phase === 'ride') return rideStep(w, e);
  if (e.kind === 'hero' && e.phase === 'flash') return flashStep(w, e);
  if (e.kind === 'king' && summon(w, e, t)) return;
  if (e.kind === 'warrior' && slam(w, e, t)) return;
  if (e.kind === 'mage' && t) meteor(w, e, t);
  if (e.state === 'attack') return swing(w, e, t);
  if (e.kind === 'hero' && w.castT > 0) return void (e.state = 'idle'); // 스킬 시전 중에는 서 있는다(가던 길은 그대로)
  if (e.kind === 'mage' && t && flee(w, e, t)) return;
  if (t) {
    if (canHit(w, e, t) && e === w.entities[0] && w.spinT > 0) return void (e.state = 'idle'); // 회오리 중에는 평타 대신 돈다
    if (canHit(w, e, t)) return startSwing(e, t);
    if ((e.repathT -= DT) <= 0) {
      e.repathT = REPATH;
      e.path = pathTo(w, e, t.x, t.z) ?? [];
    }
  }
  if (e.path.length) walk(w, e);
  else e.state = 'idle';
}

// 몬스터 AI: 주인공·해골 병사 중 AGGRO 안의 가장 가까운 쪽을 대상으로 삼는다. 주인공이 죽으면 대상을 버린다.
function think(w: World, e: Entity, hero: Entity) {
  if (hero.state === 'dead') {
    e.target = null;
    e.path = [];
    return;
  }
  if (e.target !== null) return;
  const t = friends(w)
    .filter((f) => dist(e, f) <= AGGRO)
    .sort((a, b) => dist(e, a) - dist(e, b))[0];
  if (!t) return;
  e.target = t.id;
  e.repathT = 0;
}

function startSwing(e: Entity, t: Entity) {
  e.state = 'attack';
  e.attackT = 0;
  e.path = [];
  e.repathT = 0; // 휘두르기 후 대상이 멀어졌으면 기다리지 않고 바로 경로 계산
  face(e, t);
}

// 휘두르기 진행. HIT_AT 시점에 사거리 안이면 타격. 끝났을 때 대상이 여전히 사거리 안이면 바로 다음 휘두르기.
function swing(w: World, e: Entity, t: Entity | null) {
  const interval = attackInterval(w, e);
  const hitAt = TELL[e.kind] ?? interval * HIT_AT; // 근접 몬스터는 정해진 준비 시간 뒤에 맞는다
  const before = e.attackT;
  e.attackT += DT;
  if (t && !e.skill) face(e, t); // 가르기는 조준한 쪽으로 나간다
  const hitNow = before < hitAt && e.attackT >= hitAt;
  if (e.skill && hitNow) (w.slash === 'mark' ? markSlash : cleave)(w, e);
  else if (t && hitNow && canHit(w, e, t)) {
    if (e.kind === 'hero' && (w.cls === 'wizard' || w.cls === 'necromancer')) {
      bolt(w, e, t); // 강령술사의 뼈 화살도 마력탄
      if (w.ghosts.length) copyBolt(w, e, t); // 잔상도 쏜다
    }
    else if (e.kind === 'hero' && w.cls === 'ranger') shaft(w, e, t);
    else if (e.kind === 'archer') shoot(w, e, t, 'arrow');
    else if (e.kind === 'mage') shoot(w, e, t, 'fire');
    else {
      damage(w, e, t);
      if (e.kind === 'hero') temper(w, e, [t]); // 기사 평타 = 칼로 벤 휘두름
    }
  }
  if (e.attackT < interval) return;
  if (e.skill) {
    e.skill = false; // 가르기는 한 번만 휘두른다. 대상이 있으면 다음 틱에 기본 공격으로 돌아간다
    e.state = 'idle';
    e.attackT = 0;
    return;
  }
  if (t && t.state !== 'dead' && canHit(w, e, t)) {
    e.attackT -= interval;
  } else {
    e.state = 'idle';
    e.attackT = 0;
  }
}

// 살아 있는 엔티티끼리 반경 RADIUS 원이 겹치지 않게 반씩 밀어낸다. 벽 칸으로는 밀리지 않는다.
// ponytail: O(n²) 쌍 검사. 엔티티 수백 개부터는 공간 해시로 교체
function separate(w: World) {
  const alive = w.entities.filter((e) => e.state !== 'dead' && e.phase !== 'charge' && e.phase !== 'roll' && e.phase !== 'leap' && e.phase !== 'flash' && e.phase !== 'graze' && e.phase !== 'ride'); // 돌진·구르기·도약·일섬·스쳐 베기·매 타기 중에는 뚫고 지나간다
  for (let i = 0; i < alive.length; i++) {
    for (let j = i + 1; j < alive.length; j++) {
      const a = alive[i];
      const b = alive[j];
      const d = Math.hypot(b.x - a.x, b.z - a.z);
      if (d >= RADIUS * 2) continue;
      const [ux, uz] = d < 1e-6 ? [1, 0] : [(b.x - a.x) / d, (b.z - a.z) / d]; // 완전히 겹치면 x축으로 벌린다
      const push = (RADIUS * 2 - d) / 2;
      nudge(w, a, -ux * push, -uz * push);
      nudge(w, b, ux * push, uz * push);
    }
  }
}

function nudge(w: World, e: Entity, dx: number, dz: number) {
  if (e.skin === 'grave') return; // 무덤은 밀리지 않는다
  if (!walkable(w.grid, Math.floor(e.x + dx), Math.floor(e.z + dz))) return;
  e.x += dx;
  e.z += dz;
}
