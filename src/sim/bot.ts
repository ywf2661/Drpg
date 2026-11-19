// 테스트용 봇: sim만으로 1~5층을 끝까지 플레이한다(밸런스 회귀 테스트·조정용).
import { bossScale, FLOORS, floorPower } from './dungeon';
import { makeMap, opposite, type Side } from './wilds';
import { buy, deathGold, sell } from '../shop';
import { depthOf, isPassive, MARK_LETTER, markBit, openLands, STORY } from './rules';
import { toughenBoss, uniqueOf, BASIC, canAfford, copyMods, createWorld, exitAt, sideOf, KEY_CD, KEYS, LANDS, learnBlock, newSkills, type Land, DT, isBetter, outcome, RANGE, ROLL, setLevel, step, TELL, TREES, winding, type BagItem, type Command, type Gear, type HeroClass, type SkillId, type SkillName, type World } from './world';

type Carry = { pity: number; cls: HeroClass; potions: number; gear: Gear; mods: World['mods']; level: number; xp: number; gold: number; ranks: World['ranks']; keys: World['keys']; points: number; bag: BagItem[] };
const START = (cls: HeroClass): Carry => ({ pity: 0, cls, potions: 2, gear: { weapon: 2, armor: 2, helm: 2, boots: 2 }, mods: { weapon: [], armor: [], helm: [], boots: [] }, level: 1, xp: 0, gold: 0, ...newSkills(cls), points: 0, bag: [] });
// 봇이 포인트를 넣는 스킬: 예전 스킬 넷(BASIC)과, 그중 궁극기에 이르는 같은 탭의 아래 단계들. 칸은 BASIC 순서 그대로
// 칸 이름은 옛 이름 그대로다: dash=스쳐 베기, shout=일섬, throw=가르기(칼의 여운이 실린다)
const IAIDO: SkillId[] = ['mark', 'graze', 'flash', 'cleave']; // 발도 빌드의 칸 순서(Q W E R)
const IAIDO_LEARN: SkillId[] = [...IAIDO, 'echo'];
// 회오리 빌드(dash=회오리)와, 거기에 불 벼림 1점만 얹은 벼림 빌드(throw=불 벼림). 벼림 밸런스 측정용
const WHIRL: SkillId[] = ['cleave', 'whirl', 'shout', 'throw'];
const TEMPER: SkillId[] = ['cleave', 'whirl', 'shout', 'flameEdge'];
// 잔상 빌드: 마법사 기본 빌드의 서리 고리(dash 칸)를 잔상 남기기로. 잔상 밸런스 측정용
const AFTER: SkillId[] = ['fireball', 'afterimage', 'lightning', 'ward'];
export type Build = 'basic' | 'iaido' | 'whirl' | 'temper' | 'afterimage';
const SLOTS: Record<Build, SkillId[] | null> = { basic: null, iaido: IAIDO, whirl: WHIRL, temper: TEMPER, afterimage: AFTER };
const LEARN = (cls: HeroClass, build: Build = 'basic'): SkillId[] => (build === 'iaido' ? IAIDO_LEARN : SLOTS[build] ?? BASIC[cls]).flatMap((id) => { const t = TREES[cls].find((t) => t.skills.includes(id))!; return t.skills.slice(0, t.skills.indexOf(id) + 1); });
// 빌드 스킬을 다 찍은 뒤 남는 포인트: 그 스킬들이 있는 탭의 패시브까지(칸이 필요 없고, 같은 탭 포인트는 시너지로 피해도 올린다)
const MORE = (cls: HeroClass, build: Build = 'basic'): SkillId[] => {
  const tabs = new Set(LEARN(cls, build).map((id) => TREES[cls].findIndex((t) => t.skills.includes(id))));
  return TREES[cls].filter((_, i) => tabs.has(i)).flatMap((t) => t.skills.slice(0, t.skills.findIndex(isPassive) + 1));
};
const THINK = Math.round(0.25 / DT); // 봇은 0.25초마다 판단

function makeFloor(seed: number, n: number, c: Carry, land: Land, from: Side): World {
  return loadCarry(createWorld(seed, makeMap(seed, n, land, from), floorPower(n), 1, LANDS[land].skins), c, land, Math.min(4, n + 1));
}
function loadCarry(w: World, c: Carry, land: Land, maxTier: number): World {
  w.cls = c.cls;
  w.land = land;
  w.potions = c.potions;
  w.gear = { ...c.gear };
  w.mods = copyMods(c.mods);
  w.gold = c.gold;
  w.ranks = { ...c.ranks };
  w.keys = { ...c.keys };
  w.points = c.points;
  w.bag = [...c.bag];
  w.pity = c.pity;
  w.maxTier = maxTier;
  setLevel(w, c.level, c.xp);
  return w;
}

// 간단한 플레이어: 체력이 낮으면 물약, 가까운 적부터 공격, 스킬은 뻔한 상황에만(무리면 가르기, 둘러싸이거나 보스 예고면 함성,
// 멀리서 쏘는 적에겐 도끼·돌진), 좋은 아이템 줍기, 다 잡으면 계단(바깥 지역은 같은 지역 출구). dodge면 바닥의 예고 구역은 걸어 나가고 평타·화살·화염구는 굴러서 피한다
function think(w: World, skills: boolean, dodge: boolean, land: Land = 'dungeon', build: Build = 'basic'): Command[] {
  const hero = w.entities[0];
  const cmds: Command[] = [];
  if (hero.hp < hero.maxHp * 0.6 && w.potions > 0) cmds.push({ type: 'drink' }); // 서서히 차므로 미리 마신다
  const d = (x: number, z: number) => Math.hypot(x - hero.x, z - hero.z);
  // 닫힌 사슬 문이 있으면 걸어서 갈 수 있는 곳만 상대한다(문 뒤의 적·아이템은 문을 연 뒤에)
  const closed = w.gates.filter((g) => !g.open);
  const seen = closed.length ? reachable(w, hero.x, hero.z) : null;
  const ok = (x: number, z: number) => !seen || seen[Math.floor(z) * w.grid.w + Math.floor(x)] === 1;
  const foes = w.entities.filter((e) => e.kind !== 'hero' && e.state !== 'dead' && ok(e.x, e.z)).sort((a, b) => d(a.x, a.z) - d(b.x, b.z));
  const near = (r: number) => foes.filter((e) => d(e.x, e.z) < r).length;
  const ready = (k: SkillName) => !!w.keys[k] && w[KEY_CD[k]] <= 0 && canAfford(w, w.keys[k]!); // 칸에 스킬이 있고 재사용 대기가 끝났고 기력·마나가 된다
  const wiz = w.cls === 'wizard';
  const rng = w.cls === 'ranger';
  const nec = w.cls === 'necromancer';
  if (skills && w.points > 0) {
    // 포인트는 배울 수 있는 것 중 가장 낮은 단계부터(같으면 LEARN 순서)
    const free = (ids: SkillId[]) => ids.filter((id) => !learnBlock(w, id) && !(id === 'flameEdge' && w.ranks.flameEdge)); // 불 벼림은 1점만
    const first = free(LEARN(w.cls, build));
    const can = first.length ? first : free(MORE(w.cls, build));
    if (can.length) cmds.push({ type: 'learn', skill: can.reduce((a, b) => ((w.ranks[b] ?? 0) < (w.ranks[a] ?? 0) ? b : a)) });
  }
  // 예전 스킬 넷은 예전 칸에(봇의 판단이 칸 이름을 스킬로 본다)
  const slots = SLOTS[build] ?? BASIC[w.cls];
  if (skills) KEYS.forEach((k, i) => w.ranks[slots[i]] && w.keys[k] !== slots[i] && cmds.push({ type: 'bind', key: k, skill: slots[i] }));
  // 예고된 위험 구역 안이면 다른 일은 접고 바깥으로 걸어 나간다
  const zone = dodge && w.zones.find((z) => d(z.x, z.z) < z.r + 0.3);
  if (zone) {
    const k = d(zone.x, zone.z) || 1;
    return [...cmds, { type: 'move', x: zone.x + ((hero.x - zone.x) / k) * (zone.r + 1.2), z: zone.z + ((hero.z - zone.z) / k) * (zone.r + 1.2) }];
  }
  // 평타를 준비 중인 적이 닿을 거리거나 화살·화염구가 코앞이면 구른다(적 반대쪽, 구르는 동안 무적)
  const swings = foes.filter((e) => e.state === 'attack' && winding(e) && d(e.x, e.z) < RANGE + 0.3);
  if (dodge && swings.length && hero.phase === 'none') {
    // 받아치기가 되면 가르기(마법사는 서리 고리, 궁수는 관통 사격)로 끊고, 아니면 맞기 직전에 구른다(순간이동)
    if (skills && !wiz && !nec && ready('cleave')) return [...cmds, { type: 'skill', x: swings[0].x, z: swings[0].z }];
    if (skills && wiz && ready('dash')) return [...cmds, { type: 'dash' }];
    if (ROLL.on && w.rollCd <= 0 && swings.some((e) => e.attackT >= TELL[e.kind]! - 0.3)) return [...cmds, { type: 'roll' }];
  }
  if (dodge && ROLL.on && w.rollCd <= 0 && hero.phase === 'none' && w.shots.some((s) => (s.kind === 'arrow' || s.kind === 'fire') && d(s.x, s.z) < 2.5)) return [...cmds, { type: 'roll' }];
  if (wiz) {
    // 마법사: 화염구는 가까운 적에게, 낙뢰는 보스·해골 왕 또는 가까운 적에게, 붙으면 서리 고리, 맞고 있으면 방패
    const t = foes.find((e) => d(e.x, e.z) < 8);
    const big = foes.find((e) => (e.kind === 'boss' || e.kind === 'king') && d(e.x, e.z) < 8);
    if (skills && t && ready('cleave')) cmds.push({ type: 'skill', x: t.x, z: t.z });
    if (skills && (big ?? t) && ready('shout')) cmds.push({ type: 'shout', x: (big ?? t)!.x, z: (big ?? t)!.z });
    if (build === 'afterimage') {
      // 잔상: 적이 4m 안에 둘 이상이면 그 자리에 남기고 물러선다(조준 없는 순간이동 = 가까운 적의 반대쪽)
      if (skills && ready('dash') && near(4) >= 2) cmds.push({ type: 'dash' }, ...(ROLL.on && w.rollCd <= 0 ? [{ type: 'roll' } as Command] : []));
    } else if (skills && ready('dash') && (near(2.5) >= 2 || (big?.phase === 'windup' && d(big.x, big.z) < 3))) cmds.push({ type: 'dash' });
    if (skills && ready('throw') && (hero.hp < hero.maxHp * 0.7 || near(2) >= 2)) cmds.push({ type: 'throw' });
  } else if (rng) {
    // 궁수: 관통 사격은 가까운 적에게, 다가오는 적 앞에 덫, 화살비는 보스·해골 왕 또는 가까운 적에게, 적이 보이면 집중.
    // 붙으면 굴러서 거리를 벌린다(조준 없는 구르기 = 가까운 적의 반대쪽)
    const t = foes.find((e) => d(e.x, e.z) < 8);
    const big = foes.find((e) => (e.kind === 'boss' || e.kind === 'king') && d(e.x, e.z) < 8);
    const close = foes.find((e) => d(e.x, e.z) < 4);
    if (skills && t && ready('cleave')) cmds.push({ type: 'skill', x: t.x, z: t.z });
    if (skills && close && ready('dash')) cmds.push({ type: 'dash', x: close.x, z: close.z });
    if (skills && (big ?? t) && ready('shout')) cmds.push({ type: 'shout', x: (big ?? t)!.x, z: (big ?? t)!.z });
    if (skills && t && ready('throw')) cmds.push({ type: 'throw' });
    if (dodge && ROLL.on && w.rollCd <= 0 && hero.phase === 'none' && near(2) >= 1) return [...cmds, { type: 'roll' }];
  } else if (nec) {
    // 강령술사: 적이 보이면 해골·시체 거인, 표식은 보스·해골 왕 또는 가까운 적에게, 보스거나 여럿이면 해골 왕
    const t = foes.find((e) => d(e.x, e.z) < 8);
    const big = foes.find((e) => (e.kind === 'boss' || e.kind === 'king') && d(e.x, e.z) < 8);
    if (skills && t && ready('cleave')) cmds.push({ type: 'skill' });
    if (skills && (big ?? t) && ready('shout')) cmds.push({ type: 'shout', x: (big ?? t)!.x, z: (big ?? t)!.z });
    if (skills && t && ready('dash')) cmds.push({ type: 'dash' });
    if (skills && ready('throw') && (big || near(6) >= 3)) cmds.push({ type: 'throw' });
  } else if (build !== 'iaido' && near(2) >= 2) cmds.push({ type: 'skill' });
  if (skills && w.cls === 'knight' && build === 'iaido') {
    // 발도: 무리면 일섬, 가까운 적은 스쳐 베기로 지나가고, 붙은 적엔 그어두기, 둘 넘게 붙으면 가르기(칼의 여운이 실린다)
    const f = foes[0];
    if (near(6) >= 3 && ready('shout')) cmds.push({ type: 'shout' });
    else if (f && d(f.x, f.z) < 5 && ready('dash')) cmds.push({ type: 'dash', x: f.x, z: f.z });
    else if (f && d(f.x, f.z) < 2 && ready('cleave')) cmds.push({ type: 'skill', x: f.x, z: f.z });
    if (ready('throw') && near(2) >= 2) cmds.push({ type: 'throw' });
  } else if (skills && w.cls === 'knight' && (build === 'whirl' || build === 'temper')) {
    // 회오리: 붙은 적이 둘 넘으면 돈다. 벼림 빌드는 칼이 비었으면 그 직전에 불 벼림
    const big = foes.find((e) => (e.kind === 'boss' || e.kind === 'king') && d(e.x, e.z) < 7);
    if (ready('shout') && (near(3) >= 2 || big?.phase === 'windup')) cmds.push({ type: 'shout' });
    if (ready('dash') && (near(2) >= 2 || (big && d(big.x, big.z) < 2))) {
      if (build === 'temper' && !w.edge.kind && ready('throw')) cmds.push({ type: 'throw' });
      cmds.push({ type: 'dash' });
    }
    const shooter = foes.find((e) => (e.kind === 'archer' || e.kind === 'mage') && d(e.x, e.z) > 2.5 && d(e.x, e.z) < 8);
    if (build === 'whirl' && shooter && ready('throw')) cmds.push({ type: 'throw', x: shooter.x, z: shooter.z });
  } else if (skills && w.cls === 'knight') {
    const big = foes.find((e) => (e.kind === 'boss' || e.kind === 'king') && d(e.x, e.z) < 7);
    if (ready('shout') && (near(3) >= 2 || big?.phase === 'windup')) cmds.push({ type: 'shout' });
    const shooter = foes.find((e) => (e.kind === 'archer' || e.kind === 'mage') && d(e.x, e.z) > 2.5 && d(e.x, e.z) < 8);
    if (shooter && ready('throw')) cmds.push({ type: 'throw', x: shooter.x, z: shooter.z });
    else if (shooter && ready('dash') && d(shooter.x, shooter.z) > 3.5) cmds.push({ type: 'dash', x: shooter.x, z: shooter.z });
  }
  const wanted = w.items.find((i) => ok(i.x, i.z) && (i.kind === 'gold' ? true : i.kind === 'potion' ? w.potions < 8 : isBetter(w, i)));
  if (foes.length && (d(foes[0].x, foes[0].z) < 9 || !wanted)) {
    if (hero.target !== foes[0].id) cmds.push({ type: 'attack', targetId: foes[0].id });
  } else if (wanted) cmds.push({ type: 'move', x: wanted.x, z: wanted.z });
  else if (closed.length && !ok(w.stairs ? w.stairs[0] : -1, w.stairs ? w.stairs[1] : -1)) {
    // 갈 곳이 문으로 막혔다(계단, 또는 문 뒤의 보스·적): 닿을 수 있는 가장 가까운 문 앞으로 가서 도끼로 연다
    const doors = closed
      .map((g) => ({ g, side: ([[1, 0], [-1, 0], [0, 1], [0, -1]] as const).map(([dx, dz]) => [g.x + dx, g.z + dz] as const).find(([x, z]) => ok(x, z)) }))
      .filter((o) => o.side)
      .sort((a, b) => d(a.g.x + 0.5, a.g.z + 0.5) - d(b.g.x + 0.5, b.g.z + 0.5));
    const door = doors[0];
    const opener = nec ? 'shout' : wiz || rng ? 'skill' : 'throw'; // 마법사는 화염구, 궁수는 관통 사격, 강령술사는 저주로 연다
    if (door && d(door.g.x + 0.5, door.g.z + 0.5) < 2 && ready(opener === 'skill' ? 'cleave' : opener)) cmds.push({ type: opener, x: door.g.x + 0.5, z: door.g.z + 0.5 });
    else if (door) cmds.push({ type: 'move', x: door.side![0] + 0.5, z: door.side![1] + 0.5 });
  } else {
    const exit = w.exits.find((e) => e.to === land);
    if (exit) cmds.push({ type: 'move', x: exit.x + 0.5, z: exit.z + 0.5 });
    else if (w.stairs) cmds.push({ type: 'move', x: w.stairs[0] + 0.5, z: w.stairs[1] + 0.5 });
  }
  return cmds;
}

// 주인공이 걸어서 갈 수 있는 칸(1). 길찾기는 벽 모서리를 대각선으로 못 지나므로 4방향으로 이어진 칸과 같다
function reachable(w: World, x: number, z: number): Uint8Array {
  const { w: gw, h, blocked } = w.grid;
  const seen = new Uint8Array(gw * h);
  const q = [Math.floor(z) * gw + Math.floor(x)];
  seen[q[0]] = 1;
  for (let i = 0; i < q.length; i++) {
    const [cx, cz] = [q[i] % gw, Math.floor(q[i] / gw)];
    for (const [nx, nz] of [[cx + 1, cz], [cx - 1, cz], [cx, cz + 1], [cx, cz - 1]]) {
      const n = nz * gw + nx;
      if (nx < 0 || nz < 0 || nx >= gw || nz >= h || blocked[n] || seen[n]) continue;
      seen[n] = 1;
      q.push(n);
    }
  }
  return seen;
}

// 상점: 보관함을 다 팔고(봇은 자동 장착만 쓴다), 물약을 8개까지 채운다
function shopping(c: Carry): Carry {
  while (c.bag.length) c = sell(c, 0);
  return potionsOnly(c);
}
// 떠돌이 상인(구역 사이): 물약만
function potionsOnly(c: Carry): Carry {
  while (buy(c, 'potion') !== c) c = buy(c, 'potion');
  return c;
}

// 한 판: 층마다 최대 3번 다시 시도(사망 시 그 층 진입 상태로). 결과: 깼는지, 총 사망 수, 최종 레벨, 주운 고유 장비 수(봇은 입지 않고 판다)
export function playthrough(seed: number, skills = true, dodge = true, cls: HeroClass = 'knight', land: Land = 'dungeon', build: Build = 'basic') {
  let carry = START(cls);
  let deaths = 0;
  let uniques = 0;
  let time = 0; // 깬 구역에 쓴 sim 시간(초)
  let from: Side = 'w'; // 들어온 가장자리(바깥 지역): 나간 출구의 맞은편
  for (let n = 1; n <= FLOORS; n++) {
    let done = false;
    for (let attempt = 0; attempt < 4 && !done; attempt++) {
      const w = makeFloor(seed * 100 + n * 10 + attempt, n, carry, land, from);
      for (let t = 0; t < 600 / DT; t++) {
        step(w, t % THINK === 0 ? think(w, skills, dodge, land, build) : []);
        const o = outcome(w);
        if (o === 'dead') break;
        if (o === 'descend' || o === 'clear') {
          time += t * DT;
          const ex = exitAt(w);
          if (ex) from = opposite[sideOf(w, ex)];
          uniques += w.bag.filter((it) => uniqueOf(it)).length;
          carry = shopping({ pity: w.pity, cls: w.cls, potions: w.potions, gear: { ...w.gear }, mods: w.mods, level: w.level, xp: w.xp, gold: w.gold, ranks: { ...w.ranks }, keys: { ...w.keys }, points: w.points, bag: w.bag });
          done = true;
          break;
        }
      }
      if (!done) {
        deaths++;
        carry = { ...carry, gold: deathGold(carry.gold) };
      }
    }
    if (!done) return { cleared: false, deaths, level: carry.level, floor: n, uniques, time };
  }
  return { cleared: true, deaths, level: carry.level, floor: FLOORS, uniques, time };
}

// 이야기 순서대로 이어서(설계서 6): 한 캐릭터가 초원 → 설원 → 미궁 → 폐허를 레벨·장비·금화를 들고 간다(회차 0).
// 초원이 아닌 지역은 야영지 → 초원 1구역 → 그 지역 1구역. 죽으면 야영지로(그 구역 진입 상태, 금화 절반) → 다시 초원 1구역부터.
// 구역 사이엔 물약만 사고, 장비 팔기는 야영지에서만. 결과: 지역마다 시도 수(야영지를 떠난 횟수)·사망·sim 시간(초)·깬 뒤 레벨·죽은 구역
export function story(seed: number, cls: HeroClass = 'knight', build: Build = 'basic', maxTries = 15, extra?: number) {
  let carry = shopping(START(cls)); // 야영지 상인
  const out: { land: Land; tries: number; deaths: number; time: number; level: number; cleared: boolean; died: string[]; killed: number; taken: number }[] = []; // killed: 잡은 몬스터 최대 체력 합, taken: 받은 피해 합
  let k = 0;
  for (let stage = 0; stage < STORY.length; stage++) {
    const goal = STORY[stage].land;
    const r = { land: goal, tries: 0, deaths: 0, time: 0, level: carry.level, cleared: false, died: [] as string[], killed: 0, taken: 0 };
    out.push(r);
    while (!r.cleared && r.tries < maxTries) {
      r.tries++;
      // 야영지에서 나가 초원 1구역부터: [지역, 구역]
      let [land, n, from] = ['field' as Land, 1, 'w' as Side];
      let c = carry;
      for (;;) {
        const s = seed * 1_000_003 + k++ * 7919; // 멀리 띄운다: 지도 생성이 실패하면 시드 + 1로 다시 만들어 이웃 시드는 같은 지도가 된다
        const w = createWorld(s, makeMap(s, n, land, from, openLands(stage), goal === land && markBit(n) ? MARK_LETTER[STORY[stage].quest.kind] : undefined), floorPower(depthOf(land, n), 0, extra), 1, LANDS[land].skins, depthOf(land, n) > FLOORS);
        loadCarry(w, c, land, Math.min(4, depthOf(land, n) + 1));
        toughenBoss(w, bossScale(depthOf(land, n)));
        const target = land === 'field' && goal !== 'field' ? goal : land; // 초원 1구역에선 그 지역 출구로
        let o: ReturnType<typeof outcome> = null;
        let t = 0;
        const alive = new Set(w.entities.filter((e) => e.kind !== 'hero').map((e) => e.id));
        for (; t < 600 / DT && !o; t++) {
          const hp = w.entities[0].hp;
          step(w, t % THINK === 0 ? think(w, true, true, target, build) : []);
          r.taken += Math.max(0, hp - w.entities[0].hp);
          o = outcome(w);
          if (o === 'descend' && (exitAt(w)?.to ?? 'dungeon') !== target) o = null; // 지나가다 밟은 다른 출구: 게임에선 상인 창에서 '머문다'
        }
        r.time += t * DT;
        for (const e of w.entities) if (alive.has(e.id) && e.state === 'dead') r.killed += e.maxHp;
        if (o !== 'descend' && o !== 'clear') {
          r.deaths++;
          r.died.push(`${land}${n}${o ? '' : '(시간)'}`);
          carry = shopping({ ...c, gold: deathGold(c.gold) }); // 야영지: 그 구역에 들어올 때의 상태로
          break;
        }
        c = { pity: w.pity, cls: w.cls, potions: w.potions, gear: { ...w.gear }, mods: w.mods, level: w.level, xp: w.xp, gold: w.gold, ranks: { ...w.ranks }, keys: { ...w.keys }, points: w.points, bag: w.bag };
        if (o === 'clear') {
          if (land !== goal) throw new Error(`엉뚱한 보스: ${land}`);
          carry = shopping(c);
          r.cleared = true;
          r.level = c.level;
          break;
        }
        const ex = exitAt(w);
        const to: Land = ex ? ex.to : 'dungeon';
        [n, from] = [to === land ? n + 1 : 1, ex ? opposite[sideOf(w, ex)] : 'w'];
        land = to;
        c = potionsOnly(c);
      }
    }
    if (!r.cleared) break;
  }
  return out;
}
