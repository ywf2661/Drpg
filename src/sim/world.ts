// 게임 규칙(sim). three.js를 import하지 않는다. 상태 변경은 step()으로만 일어난다.
import { findPath, walkable, type Cell, type Grid } from './path';

export type Kind = 'hero' | 'minion' | 'warrior' | 'boss';
export type State = 'idle' | 'move' | 'attack' | 'dead';
export type Command = { type: 'move'; x: number; z: number } | { type: 'attack'; targetId: number } | { type: 'drink' };
type Point = [x: number, z: number];

export type Entity = {
  id: number;
  kind: Kind;
  x: number;
  z: number;
  facing: number; // 라디안, atan2(dx, dz). 0 = +z 방향
  hp: number;
  maxHp: number;
  power: number; // 층 배율. 체력·데미지에 곱한다(주인공은 1)
  state: State;
  path: Point[]; // 남은 웨이포인트(월드 좌표)
  target: number | null; // 공격 대상 id
  attackT: number; // 현재 휘두르기 경과 시간(초)
  repathT: number; // 다음 경로 재계산까지 남은 시간(초)
};

// 소품(칸 좌표). 막힘은 grid에 있고, 이것은 렌더용 기록이다
export type Prop = { kind: 'brazier' | 'prop' | 'debris'; x: number; z: number };

// 바닥에 떨어진 아이템(월드 좌표). tier: 장비 단계 1~4(물약은 0)
export type Item = { id: number; x: number; z: number; kind: 'potion' | 'weapon' | 'armor'; tier: number };
// 장착 장비 단계(1~4). WEAPONS·ARMORS[단계 − 1]
export type Gear = { weapon: number; armor: number };

// toStairs: 주인공이 계단 칸을 직접 눌러 가는 중. 지나가기만 해서는 내려가지 않도록
// potions: 허리띠의 물약 수, nextItem: 다음 아이템 id, maxTier: 이 층에서 떨어지는 장비의 최고 단계
export type World = {
  grid: Grid;
  entities: Entity[];
  rng: number;
  stairs: Cell | null;
  toStairs: boolean;
  props: Prop[];
  items: Item[];
  nextItem: number;
  potions: number;
  gear: Gear;
  maxTier: number;
};

export const DT = 1 / 60;
export const RANGE = 1.5;
export const RADIUS = 0.4;
export const AGGRO = 8;
export const HIT_AT = 0.4;
export const REPATH = 0.5;

// 드롭 확률(종류별), 줍는 반경(m), 허리띠 칸 수, 회복량(최대 체력 비율)
export const POTION = { drop: { hero: 0, minion: 0.2, warrior: 0.35, boss: 0 } as Record<Kind, number>, pickup: 0.6, max: 8, heal: 0.5 };
export const GEAR_DROP: Record<Kind, number> = { hero: 0, minion: 0.05, warrior: 0.12, boss: 0 };
export const WEAPONS: { name: string; dmg: [number, number]; interval: number }[] = [
  { name: '단검', dmg: [4, 7], interval: 0.6 },
  { name: '숏소드', dmg: [6, 10], interval: 0.7 },
  { name: '롱소드', dmg: [8, 12], interval: 0.8 },
  { name: '그레이트소드', dmg: [11, 17], interval: 1.0 },
];
export const ARMORS: { name: string; reduce: number }[] = [
  { name: '천옷', reduce: 0 },
  { name: '가죽 갑옷', reduce: 0.1 },
  { name: '사슬 갑옷', reduce: 0.2 },
  { name: '판금 갑옷', reduce: 0.3 },
];

export const STATS: Record<Kind, { name: string; hp: number; dmg: [number, number]; interval: number; speed: number }> = {
  hero: { name: '기사', hp: 100, dmg: [8, 12], interval: 0.8, speed: 4 }, // 데미지·간격은 실제로는 장착 무기(WEAPONS)
  minion: { name: '스켈레톤 졸개', hp: 30, dmg: [3, 5], interval: 1.2, speed: 2.5 },
  warrior: { name: '스켈레톤 전사', hp: 60, dmg: [6, 9], interval: 1.4, speed: 2 },
  boss: { name: '미노타우르스', hp: 300, dmg: [10, 16], interval: 1.6, speed: 2.4 },
};

// 맵 글자: '#' 벽, '.' 바닥, '>' 계단, 'H' 주인공, 'm' 졸개, 'w' 전사, 'M' 보스, 'B' 화로·'o' 큰 소품(막음), ',' 잔해(지나감)

const SPAWN: Record<string, Kind | undefined> = { H: 'hero', m: 'minion', w: 'warrior', M: 'boss' };
const PROPS: Record<string, Prop['kind'] | undefined> = { B: 'brazier', o: 'prop', ',': 'debris' };

export function createWorld(seed: number, map: string[], power = 1): World {
  const w = map[0].length;
  const grid: Grid = { w, h: map.length, blocked: new Uint8Array(w * map.length) };
  const spawns: { kind: Kind; x: number; z: number }[] = [];
  let stairs: Cell | null = null;
  const props: Prop[] = [];
  map.forEach((row, z) =>
    [...row].forEach((c, x) => {
      const kind = SPAWN[c];
      const prop = PROPS[c];
      if (prop) props.push({ kind: prop, x, z });
      if (c === '#' || c === 'B' || c === 'o') grid.blocked[z * w + x] = 1;
      else if (c === '>') stairs = [x, z];
      else if (kind) spawns.push({ kind, x: x + 0.5, z: z + 0.5 });
    }),
  );
  spawns.sort((a, b) => Number(b.kind === 'hero') - Number(a.kind === 'hero')); // 주인공 = id 0 (안정 정렬)
  if (spawns[0]?.kind !== 'hero') throw new Error('맵에 주인공(H)이 없습니다');
  const entities = spawns.map((s, id): Entity => {
    const p = s.kind === 'hero' || s.kind === 'boss' ? 1 : power; // 보스는 마지막 층 기준으로 정한 수치
    const hp = Math.round(STATS[s.kind].hp * p);
    return { id, ...s, facing: 0, hp, maxHp: hp, power: p, state: 'idle', path: [], target: null, attackT: 0, repathT: 0 };
  });
  // 기본 장비(롱소드·천옷) = 장비 도입 전 주인공 수치. 게임은 main이 시작 장비를 넣는다
  return { grid, entities, rng: seed, stairs, toStairs: false, props, items: [], nextItem: 0, potions: 0, gear: { weapon: 3, armor: 1 }, maxTier: 2 };
}

export function step(w: World, cmds: Command[]): void {
  const hero = w.entities[0];
  for (const c of cmds) command(w, hero, c);
  for (const e of w.entities) {
    if (e.state === 'dead') continue; // 같은 틱 앞 순서에서 죽었을 수도 있음
    if (e !== hero) think(e, hero);
    act(w, e);
  }
  separate(w);
  pickup(w, hero);
}

// 주인공 발밑(POTION.pickup 이내)의 물약은 허리띠가 찰 때까지, 장비는 지금보다 좋을 때만 줍는다
function pickup(w: World, hero: Entity) {
  if (hero.state === 'dead') return;
  w.items = w.items.filter((it) => {
    if (Math.hypot(it.x - hero.x, it.z - hero.z) > POTION.pickup) return true;
    if (it.kind === 'potion') {
      if (w.potions >= POTION.max) return true;
      w.potions++;
      return false;
    }
    if (it.tier <= w.gear[it.kind]) return true;
    w.gear[it.kind] = it.tier;
    return false;
  });
}

// 한 번 휘두르는 데 걸리는 시간. 주인공은 장착 무기를 따른다
export function attackInterval(w: World, e: Entity): number {
  return e.kind === 'hero' ? WEAPONS[w.gear.weapon - 1].interval : STATS[e.kind].interval;
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
  if (hero.state === 'dead') return;
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
}

function act(w: World, e: Entity) {
  let t = e.target === null ? null : w.entities[e.target];
  if (t && t.state === 'dead') {
    e.target = null;
    e.path = [];
    t = null;
  }
  if (e.state === 'attack') return swing(w, e, t);
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
  if (t && before < hitAt && e.attackT >= hitAt && canHit(w, e, t)) damage(w, e, t);
  if (e.attackT < interval) return;
  if (t && t.state !== 'dead' && canHit(w, e, t)) {
    e.attackT -= interval;
  } else {
    e.state = 'idle';
    e.attackT = 0;
  }
}

function damage(w: World, a: Entity, t: Entity) {
  const [lo, hi] = a.kind === 'hero' ? WEAPONS[w.gear.weapon - 1].dmg : STATS[a.kind].dmg;
  let dmg = Math.round((lo + Math.floor(rand(w) * (hi - lo + 1))) * a.power);
  if (t.kind === 'hero') dmg = Math.max(1, Math.round(dmg * (1 - ARMORS[w.gear.armor - 1].reduce)));
  t.hp = Math.max(0, t.hp - dmg);
  if (t.hp > 0) return;
  t.state = 'dead';
  t.path = [];
  t.target = null;
  if (t.kind === 'hero') return;
  const drop = (kind: Item['kind'], tier: number) => w.items.push({ id: w.nextItem++, x: t.x, z: t.z, kind, tier });
  if (rand(w) < POTION.drop[t.kind]) drop('potion', 0);
  if (rand(w) < GEAR_DROP[t.kind]) drop(rand(w) < 0.5 ? 'weapon' : 'armor', 1 + Math.floor(rand(w) * w.maxTier));
}

// mulberry32. 상태가 world.rng에 있어서 같은 시드 = 같은 난수열.
function rand(w: World) {
  let t = (w.rng = (w.rng + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

const dist = (a: Entity, b: Entity) => Math.hypot(a.x - b.x, a.z - b.z);

// 사거리 안이고, 둘 사이 직선이 벽 칸을 지나지 않아야(0.1m 간격 샘플) 칠 수 있다
function canHit(w: World, a: Entity, b: Entity) {
  const d = dist(a, b);
  if (d > RANGE) return false;
  const n = Math.ceil(d / 0.1);
  for (let i = 1; i < n; i++) {
    if (!walkable(w.grid, Math.floor(a.x + ((b.x - a.x) * i) / n), Math.floor(a.z + ((b.z - a.z) * i) / n))) return false;
  }
  return true;
}

function face(e: Entity, t: Entity) {
  e.facing = Math.atan2(t.x - e.x, t.z - e.z);
}

const cellOf = (e: Entity): Cell => [Math.floor(e.x), Math.floor(e.z)];

// 칸 경로 → 월드 좌표 웨이포인트. 시작 칸은 빼고, 마지막은 정확한 목표 지점.
const waypoints = (cells: Cell[], x: number, z: number): Point[] => [
  ...cells.slice(1, -1).map(([cx, cz]): Point => [cx + 0.5, cz + 0.5]),
  [x, z],
];

function walk(w: World, e: Entity) {
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

// 살아 있는 엔티티끼리 반경 RADIUS 원이 겹치지 않게 반씩 밀어낸다. 벽 칸으로는 밀리지 않는다.
// ponytail: O(n²) 쌍 검사. 엔티티 수백 개부터는 공간 해시로 교체
function separate(w: World) {
  const alive = w.entities.filter((e) => e.state !== 'dead');
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
