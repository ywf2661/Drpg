// 게임 규칙(sim) 진입점: 맵 읽기(createWorld), 한 틱(step), 명령, 기본 AI·공격·충돌·줍기. three.js를 import하지 않는다.
// 수치·타입은 rules.ts, 공용 전투 도구는 core.ts, 스킬·보스 패턴·투사체는 abilities.ts. 바깥은 이 파일만 import하면 된다.
import { findPath, walkable, type Cell, type Grid } from './path';
import { attackInterval, canHit, cellOf, damage, dist, dropGold, face, heroMax, isBetter, makeEntity, mod, rand, rollGear, walk, waypoints } from './core';
import { charge, cleave, cleaveStart, dashStart, dashStep, flee, fly, shoot, shout, summon, throwAxe } from './abilities';
import { AGGRO, CHEST, DT, GOLD_CHEST, HIT_AT, MAGE, POTION, RADIUS, RANK_MAX, REPATH, type Chest, type SkillName, type Command, type Entity, type Kind, type Prop, type World } from './rules';

export * from './rules';
export { armorScore, attackInterval, axeStat, cleaveStat, dashStat, heroMax, isBetter, mod, rollGear, setLevel, shoutStat, weaponScore } from './core';

// 맵 글자: '#' 벽, '.' 바닥, '>' 계단, 'H' 주인공, 'm' 졸개, 'w' 전사, 'W' 정예 전사, 'a' 궁수, 'g' 마법사, 'K' 해골 왕, 'M' 보스, 'c' 상자, 'B' 화로·'o' 큰 소품(막음), ',' 잔해(지나감)
const SPAWN: Record<string, Kind | undefined> = { H: 'hero', m: 'minion', w: 'warrior', W: 'warrior', a: 'archer', g: 'mage', K: 'king', M: 'boss' };

const PROPS: Record<string, Prop['kind'] | undefined> = { B: 'brazier', o: 'prop', ',': 'debris' };

// power: 몬스터 층 배율, bossPower: 보스 배율(보스는 마지막 층 기준 수치라 층 배율 대신 회차 배율만)
export function createWorld(seed: number, map: string[], power = 1, bossPower = 1): World {
  const w = map[0].length;
  const grid: Grid = { w, h: map.length, blocked: new Uint8Array(w * map.length) };
  const spawns: { kind: Kind; x: number; z: number; elite: boolean }[] = [];
  let stairs: Cell | null = null;
  const props: Prop[] = [];
  const chests: Chest[] = [];
  map.forEach((row, z) =>
    [...row].forEach((c, x) => {
      const kind = SPAWN[c];
      const prop = PROPS[c];
      if (prop) props.push({ kind: prop, x, z });
      if (c === 'c') chests.push({ id: chests.length, x, z, open: false });
      if (c === '#' || c === 'B' || c === 'o' || c === 'c') grid.blocked[z * w + x] = 1;
      else if (c === '>') stairs = [x, z];
      else if (kind) spawns.push({ kind, x: x + 0.5, z: z + 0.5, elite: c === 'W' });
    }),
  );
  spawns.sort((a, b) => Number(b.kind === 'hero') - Number(a.kind === 'hero')); // 주인공 = id 0 (안정 정렬)
  if (spawns[0]?.kind !== 'hero') throw new Error('맵에 주인공(H)이 없습니다');
  const entities = spawns.map((s, id) => makeEntity(id, s.kind, s.x, s.z, s.kind === 'hero' ? 1 : s.kind === 'boss' ? bossPower : power, s.elite));
  // 기본 장비(롱소드·천옷) = 장비 도입 전 주인공 수치. 게임은 main이 시작 장비를 넣는다
  return { grid, entities, rng: seed, stairs, toStairs: false, props, chests, opening: null, items: [], shots: [], blasts: [], nextItem: 0, potions: 0, gold: 0, power, gear: { weapon: 3, armor: 1 }, mods: { weapon: [], armor: [] }, regenAcc: 0, maxTier: 2, level: 1, xp: 0, skillCd: 0, cleaves: 0, dashCd: 0, dashHit: [], dashes: 0, shoutCd: 0, shoutT: 0, shouts: 0, throwCd: 0, ranks: { cleave: 1, dash: 1, shout: 1, throw: 1 }, points: 0 };
}

export function step(w: World, cmds: Command[]): void {
  const hero = w.entities[0];
  w.skillCd = Math.max(0, w.skillCd - DT);
  w.dashCd = Math.max(0, w.dashCd - DT);
  w.shoutCd = Math.max(0, w.shoutCd - DT);
  w.shoutT = Math.max(0, w.shoutT - DT);
  w.throwCd = Math.max(0, w.throwCd - DT);
  w.blasts = w.blasts.filter((b) => (b.age += DT) <= MAGE.blastAge);
  regen(w, hero);
  for (const c of cmds) command(w, hero, c);
  for (const e of w.entities) {
    if (e.state === 'dead') continue; // 같은 틱 앞 순서에서 죽었을 수도 있음
    if (e.stunT > 0) {
      e.stunT = Math.max(0, e.stunT - DT); // 기절: 생각도 행동도 하지 않는다
      continue;
    }
    if (e !== hero) think(e, hero);
    act(w, e);
  }
  fly(w, hero);
  separate(w);
  reachChest(w, hero);
  pickup(w, hero);
}

// 갑옷 '재생의': 초당 value/10. 소수점은 쌓아 두었다가 1씩
function regen(w: World, hero: Entity) {
  const r = mod(w.mods.armor, 'regen');
  if (!r || hero.state === 'dead') return;
  w.regenAcc += (r / 10) * DT;
  while (w.regenAcc >= 1) {
    w.regenAcc -= 1;
    hero.hp = Math.min(hero.maxHp, hero.hp + 1);
  }
}

// 주인공 발밑(POTION.pickup 이내)의 물약은 허리띠가 찰 때까지, 장비는 지금보다 좋을 때만 줍는다
function pickup(w: World, hero: Entity) {
  if (hero.state === 'dead') return;
  w.items = w.items.filter((it) => {
    if (Math.hypot(it.x - hero.x, it.z - hero.z) > POTION.pickup) return true;
    if (it.kind === 'gold') {
      w.gold += it.amount ?? 0;
      return false;
    }
    if (it.kind === 'potion') {
      if (w.potions >= POTION.max) return true;
      w.potions++;
      return false;
    }
    if (!isBetter(w, it)) return true;
    w.gear[it.kind] = it.tier;
    w.mods[it.kind] = it.affixes ?? [];
    if (it.kind === 'armor') {
      // '튼튼한'이 바뀌면 최대 체력도: 늘어난 만큼은 채우고, 줄면 넘치는 만큼만 깎는다
      const max = heroMax(w);
      hero.hp = Math.min(max, hero.hp + Math.max(0, max - hero.maxHp));
      hero.maxHp = max;
    }
    return false;
  });
}

// 스킬 포인트 1을 써서 단계 +1(최대 RANK_MAX)
function learn(w: World, s: SkillName) {
  if (w.points <= 0 || w.ranks[s] >= RANK_MAX) return;
  w.ranks[s]++;
  w.points--;
}

// 즉시 회복. 이동·공격·계단 의도는 그대로 둔다
function drink(w: World, hero: Entity) {
  if (hero.state === 'dead' || w.potions <= 0 || hero.hp >= hero.maxHp) return;
  hero.hp = Math.min(hero.maxHp, hero.hp + Math.round(hero.maxHp * POTION.heal));
  w.potions--;
}

export function outcome(w: World): 'dead' | 'descend' | 'clear' | null {
  const hero = w.entities[0];
  if (hero.state === 'dead') return 'dead';
  if (w.stairs) return w.toStairs && Math.hypot(hero.x - w.stairs[0] - 0.5, hero.z - w.stairs[1] - 0.5) <= 0.5 ? 'descend' : null;
  const boss = w.entities.find((e) => e.kind === 'boss');
  if (boss) return boss.state === 'dead' ? 'clear' : null; // 보스 층: 보스만 쓰러뜨리면 된다
  return w.entities.every((e) => e.kind === 'hero' || e.state === 'dead') ? 'clear' : null;
}

function command(w: World, hero: Entity, c: Command) {
  if (c.type === 'drink') return drink(w, hero);
  if (c.type === 'learn') return learn(w, c.skill);
  if (hero.state === 'dead' || hero.phase === 'charge') return; // 돌진 중에는 물약 말고는 무시
  if (c.type === 'dash') return dashStart(w, hero, c.x, c.z);
  if (c.type === 'shout') return shout(w, hero);
  if (c.type === 'throw') return throwAxe(w, hero, c.x, c.z);
  w.opening = null; // 다른 명령은 상자로 가던 것을 취소한다
  if (c.type === 'skill') return cleaveStart(w, hero, c.x, c.z);
  if (c.type === 'open') return goToChest(w, hero, c.chestId);
  w.toStairs = false; // 다른 명령은 계단으로 가려던 의도를 취소한다
  if (c.type === 'attack') {
    const t = w.entities[c.targetId];
    if (!t || t === hero || t.state === 'dead') return;
    if (hero.state === 'attack' && hero.target !== t.id) {
      hero.state = 'idle'; // 다른 대상으로 바꾸면 휘두르기(가르기 포함) 취소, 같은 대상 재클릭은 유지
      hero.attackT = 0;
      hero.skill = false;
    }
    hero.target = t.id;
    hero.repathT = 0; // 다음 act에서 즉시 경로 계산
    return;
  }
  let [x, z] = [c.x, c.z];
  const s = w.stairs;
  if (s && Math.abs(Math.floor(x) - s[0]) <= 1 && Math.abs(Math.floor(z) - s[1]) <= 1) {
    [x, z] = [s[0] + 0.5, s[1] + 0.5]; // 계단 그림의 구멍(계단 칸 주변 3×3) 어디를 눌러도 중심으로
    w.toStairs = true;
  }
  const p = findPath(w.grid, cellOf(hero), [Math.floor(x), Math.floor(z)]);
  if (!p) return;
  hero.path = waypoints(p, x, z);
  hero.target = null;
  hero.state = 'move'; // 휘두르는 중이었다면 취소
  hero.attackT = 0;
  hero.skill = false;
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
    const p = findPath(w.grid, cellOf(hero), cell);
    if (!p) continue;
    Object.assign(hero, { path: waypoints(p, cell[0] + 0.5, cell[1] + 0.5), target: null, state: 'move', attackT: 0, skill: false });
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
  ch.open = true;
  const [x, z] = [cx + ((hero.x - cx) / d) * CHEST.drop, cz + ((hero.z - cz) / d) * CHEST.drop];
  const kind = rand(w) < CHEST.potion ? 'potion' : rand(w) < 0.5 ? 'weapon' : 'armor';
  if (kind === 'potion') w.items.push({ id: w.nextItem++, x, z, kind, tier: 0 });
  else w.items.push(rollGear(w, x, z, kind, 1 + Math.floor(rand(w) * w.maxTier)));
  dropGold(w, x + (hero.z - cz) / d * 0.4, z - (hero.x - cx) / d * 0.4, GOLD_CHEST.lo, GOLD_CHEST.hi, w.power); // 옆에 금화

}

function act(w: World, e: Entity) {
  let t = e.target === null ? null : w.entities[e.target];
  if (t && t.state === 'dead') {
    e.target = null;
    e.path = [];
    t = null;
  }
  if (e.kind === 'boss' && charge(w, e, t)) return;
  if (e.kind === 'hero' && e.phase === 'charge') return dashStep(w, e);
  if (e.kind === 'king' && summon(w, e, t)) return;
  if (e.state === 'attack') return swing(w, e, t);
  if (e.kind === 'mage' && t && flee(w, e, t)) return;
  if (t) {
    if (canHit(w, e, t)) return startSwing(e, t);
    if ((e.repathT -= DT) <= 0) {
      e.repathT = REPATH;
      const p = findPath(w.grid, cellOf(e), cellOf(t));
      e.path = p ? waypoints(p, t.x, t.z) : [];
    }
  }
  if (e.path.length) walk(w, e);
  else e.state = 'idle';
}

// 몬스터 AI: 주인공이 AGGRO 안에 들어오면 대상으로 삼는다. 주인공이 죽으면 대상을 버린다.
function think(e: Entity, hero: Entity) {
  if (hero.state === 'dead') {
    e.target = null;
    e.path = [];
    return;
  }
  if (e.target === null && dist(e, hero) <= AGGRO) {
    e.target = hero.id;
    e.repathT = 0;
  }
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
  const hitAt = interval * HIT_AT;
  const before = e.attackT;
  e.attackT += DT;
  if (t) face(e, t);
  const hitNow = before < hitAt && e.attackT >= hitAt;
  if (e.skill && hitNow) cleave(w, e);
  else if (t && hitNow && canHit(w, e, t)) {
    if (e.kind === 'archer') shoot(w, e, t, 'arrow');
    else if (e.kind === 'mage') shoot(w, e, t, 'fire');
    else damage(w, e, t);
  }
  if (e.attackT < interval) return;
  if (e.skill) {
    e.skill = false; // 가르기는 한 번만 휘두르고 멈춘다
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
  const alive = w.entities.filter((e) => e.state !== 'dead' && e.phase !== 'charge'); // 돌진 중에는 뚫고 지나간다
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
  if (!walkable(w.grid, Math.floor(e.x + dx), Math.floor(e.z + dz))) return;
  e.x += dx;
  e.z += dz;
}
