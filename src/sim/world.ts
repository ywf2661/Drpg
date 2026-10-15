// 게임 규칙(sim). three.js를 import하지 않는다. 상태 변경은 step()으로만 일어난다.
import { findPath, walkable, type Cell, type Grid } from './path';

export type Kind = 'hero' | 'minion' | 'warrior' | 'archer' | 'mage' | 'boss';
export type State = 'idle' | 'move' | 'attack' | 'dead';
export type Command =
  | { type: 'move'; x: number; z: number }
  | { type: 'attack'; targetId: number }
  | { type: 'drink' }
  | { type: 'skill'; x?: number; z?: number } // 가르기. (x, z)가 있으면 그쪽으로
  | { type: 'open'; chestId: number } // 상자 열기(걸어가서)
  | { type: 'dash'; x?: number; z?: number }; // 돌진 베기. (x, z)가 있으면 그쪽으로
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
  skill: boolean; // 지금 휘두르는 것이 가르기인가
  elite: boolean; // 정예: 체력 ×3, 데미지 ×1.3, 경험치 ×4, 최고 단계 장비 확정
  // 보스 돌진: phase 예고·돌진, phaseT 예고 남은 시간 또는 돌진 남은 거리, cd 재사용 대기, (dx, dz) 돌진 방향
  phase: 'none' | 'windup' | 'charge';
  phaseT: number;
  cd: number;
  dx: number;
  dz: number;
};

// 소품(칸 좌표). 막힘은 grid에 있고, 이것은 렌더용 기록이다
export type Prop = { kind: 'brazier' | 'prop' | 'debris'; x: number; z: number };

// 바닥에 떨어진 아이템(월드 좌표). tier: 장비 단계 1~4(물약은 0)
// amount: 금화 양(금화만)
export type Item = { id: number; x: number; z: number; kind: 'potion' | 'weapon' | 'armor' | 'gold'; tier: number; amount?: number };
// 보물 상자(칸 좌표). 한 번 열면 끝
export type Chest = { id: number; x: number; z: number; open: boolean };
// 날아가는 화살. (dx, dz) 단위 방향, dmg는 쏠 때 굴린 값, left는 남은 비행 거리(m)
export type Shot = { id: number; x: number; z: number; dx: number; dz: number; dmg: number; left: number; kind: 'arrow' | 'fire' };
// 화염구 폭발 기록(렌더·소리용). age초 뒤 지운다
export type Blast = { id: number; x: number; z: number; age: number };
// 장착 장비 단계(1~4). WEAPONS·ARMORS[단계 − 1]
export type Gear = { weapon: number; armor: number };

// toStairs: 주인공이 계단 칸을 직접 눌러 가는 중. 지나가기만 해서는 내려가지 않도록
// potions: 허리띠의 물약 수, nextItem: 다음 아이템 id, maxTier: 이 층에서 떨어지는 장비의 최고 단계
// level·xp: 주인공 레벨과 현재 레벨에서 쌓인 경험치
export type World = {
  grid: Grid;
  entities: Entity[];
  rng: number;
  stairs: Cell | null;
  toStairs: boolean;
  props: Prop[];
  chests: Chest[];
  opening: number | null; // 주인공이 열러 가는 상자 id
  items: Item[];
  shots: Shot[];
  blasts: Blast[];
  nextItem: number; // 아이템·화살 공용 id
  potions: number;
  gold: number;
  power: number; // 이 층의 몬스터 배율(상자 금화에도)
  gear: Gear;
  maxTier: number;
  level: number;
  xp: number;
  skillCd: number; // 가르기 재사용까지 남은 시간(초)
  dashCd: number; // 돌진 베기 재사용까지 남은 시간(초)
  dashHit: number[]; // 이번 돌진에서 이미 맞은 적 id
  dashes: number; // 돌진 횟수(렌더·소리용)
  cleaves: number; // 가르기 타격 횟수(렌더·소리용)
};

export const DT = 1 / 60;
export const RANGE = 1.5;
export const ELITE = { hp: 3, dmg: 1.3, xp: 4 };
// 금화 드롭: 확률·양(× 몬스터 층 배율). 정예는 확정 40–60, 상자는 확정 15–30 × 층 배율
export const GOLD: Record<Kind, { chance: number; lo: number; hi: number }> = {
  hero: { chance: 0, lo: 0, hi: 0 },
  minion: { chance: 0.5, lo: 3, hi: 8 },
  warrior: { chance: 0.6, lo: 8, hi: 15 },
  archer: { chance: 0.6, lo: 5, hi: 10 },
  mage: { chance: 0.6, lo: 6, hi: 12 },
  boss: { chance: 0, lo: 0, hi: 0 },
};
export const GOLD_ELITE = { lo: 40, hi: 60 };
export const GOLD_CHEST = { lo: 15, hi: 30 };
export const CHARGE = { min: 3, max: 7, windup: 0.7, speed: 9, dist: 7, hit: 0.8, mult: 1.5, cd: 7 }; // 보스 돌진
export const CHEST = { reach: 1.5, potion: 0.6, drop: 0.7 }; // 여는 거리, 물약 확률(나머지 장비), 떨어지는 거리(주인공 쪽)
export const SKILL = { cd: 4, radius: 2, mult: 1.5, aim: 2.5 };
export const DASH = { cd: 6, dist: 5, speed: 14, hit: 1, aim: 6 }; // 돌진 베기: 재사용, 거리, 속도, 길 폭(반경), 자동 조준 거리 // 가르기: 재사용 대기, 범위, 데미지 배율, 자동 조준 거리
export const ARCHER = { range: 6, speed: 9, flight: 8, hitRadius: 0.4 }; // 궁수 사거리, 화살 속도(m/s)·비행 거리·맞는 반경
// 마법사: 사거리, 화염구 속도·비행 거리·직격 반경·폭발 반경·폭발 기록 유지, 물러나는 거리
export const MAGE = { range: 7, speed: 6, flight: 9, hitRadius: 0.5, blast: 1.2, blastAge: 0.6, flee: 3 };
export const RADIUS = 0.4;
export const AGGRO = 8;
export const HIT_AT = 0.4;
export const REPATH = 0.5;

// 드롭 확률(종류별), 줍는 반경(m), 허리띠 칸 수, 회복량(최대 체력 비율)
export const POTION = { drop: { hero: 0, minion: 0.2, warrior: 0.35, archer: 0.25, mage: 0.25, boss: 0 } as Record<Kind, number>, pickup: 0.6, max: 8, heal: 0.5 };
export const GEAR_DROP: Record<Kind, number> = { hero: 0, minion: 0.05, warrior: 0.12, archer: 0.08, mage: 0.1, boss: 0 };
// 처치 경험치(× 몬스터 층 배율). 레벨마다 최대 체력 +10, 주인공 데미지 +5%
export const XP: Record<Kind, number> = { hero: 0, minion: 10, warrior: 25, archer: 15, mage: 20, boss: 0 };
export const xpToNext = (level: number) => 40 + 30 * (level - 1);
const heroMaxHp = (level: number) => STATS.hero.hp + 10 * (level - 1);

// 레벨·경험치를 정하고 주인공 체력을 그 레벨의 최대치로(main이 층을 만들 때)
export function setLevel(w: World, level: number, xp: number) {
  w.level = level;
  w.xp = xp;
  const hero = w.entities[0];
  hero.maxHp = hero.hp = heroMaxHp(level);
}

// 경험치를 얻고, 다음 레벨 몫을 넘을 때마다 레벨업(남는 양은 이월). 레벨업하면 체력 완전 회복
function gainXp(w: World, n: number) {
  w.xp += n;
  const before = w.level;
  while (w.xp >= xpToNext(w.level)) w.xp -= xpToNext(w.level++);
  if (w.level !== before) setLevel(w, w.level, w.xp);
}

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
  archer: { name: '스켈레톤 궁수', hp: 25, dmg: [4, 7], interval: 1.8, speed: 2.2 },
  mage: { name: '스켈레톤 마법사', hp: 22, dmg: [5, 8], interval: 2.4, speed: 2 },
  boss: { name: '미노타우르스', hp: 500, dmg: [12, 20], interval: 1.6, speed: 2.4 },
};

// 맵 글자: '#' 벽, '.' 바닥, '>' 계단, 'H' 주인공, 'm' 졸개, 'w' 전사, 'W' 정예 전사, 'a' 궁수, 'g' 마법사, 'M' 보스, 'c' 상자, 'B' 화로·'o' 큰 소품(막음), ',' 잔해(지나감)

const SPAWN: Record<string, Kind | undefined> = { H: 'hero', m: 'minion', w: 'warrior', W: 'warrior', a: 'archer', g: 'mage', M: 'boss' };
const PROPS: Record<string, Prop['kind'] | undefined> = { B: 'brazier', o: 'prop', ',': 'debris' };

export function createWorld(seed: number, map: string[], power = 1): World {
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
  const entities = spawns.map((s, id): Entity => {
    const p = s.kind === 'hero' || s.kind === 'boss' ? 1 : power; // 보스는 마지막 층 기준으로 정한 수치
    const hp = Math.round(STATS[s.kind].hp * p * (s.elite ? ELITE.hp : 1));
    return { id, ...s, facing: 0, hp, maxHp: hp, power: p, state: 'idle', path: [], target: null, attackT: 0, repathT: 0, skill: false, phase: 'none', phaseT: 0, cd: 0, dx: 0, dz: 0 };
  });
  // 기본 장비(롱소드·천옷) = 장비 도입 전 주인공 수치. 게임은 main이 시작 장비를 넣는다
  return { grid, entities, rng: seed, stairs, toStairs: false, props, chests, opening: null, items: [], shots: [], blasts: [], nextItem: 0, potions: 0, gold: 0, power, gear: { weapon: 3, armor: 1 }, maxTier: 2, level: 1, xp: 0, skillCd: 0, cleaves: 0, dashCd: 0, dashHit: [], dashes: 0 };
}

export function step(w: World, cmds: Command[]): void {
  const hero = w.entities[0];
  w.skillCd = Math.max(0, w.skillCd - DT);
  w.dashCd = Math.max(0, w.dashCd - DT);
  w.blasts = w.blasts.filter((b) => (b.age += DT) <= MAGE.blastAge);
  for (const c of cmds) command(w, hero, c);
  for (const e of w.entities) {
    if (e.state === 'dead') continue; // 같은 틱 앞 순서에서 죽었을 수도 있음
    if (e !== hero) think(e, hero);
    act(w, e);
  }
  fly(w, hero);
  separate(w);
  reachChest(w, hero);
  pickup(w, hero);
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
  if (hero.state === 'dead' || hero.phase === 'charge') return; // 돌진 중에는 물약 말고는 무시
  if (c.type === 'dash') return dashStart(w, hero, c.x, c.z);
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
  w.items.push({ id: w.nextItem++, x, z, kind, tier: kind === 'potion' ? 0 : 1 + Math.floor(rand(w) * w.maxTier) });
  dropGold(w, x + (hero.z - cz) / d * 0.4, z - (hero.x - cx) / d * 0.4, GOLD_CHEST.lo, GOLD_CHEST.hi, w.power); // 옆에 금화

}

// 금화 더미(lo..hi × 배율)
function dropGold(w: World, x: number, z: number, lo: number, hi: number, power: number) {
  w.items.push({ id: w.nextItem++, x, z, kind: 'gold', tier: 0, amount: Math.round((lo + Math.floor(rand(w) * (hi - lo + 1))) * power) });
}

// 가르기 시작: 조준점(없으면 가까운 적, 그것도 없으면 지금 방향)을 보고 휘두르기. 이동·계단 의도는 멈춘다
function cleaveStart(w: World, hero: Entity, x?: number, z?: number) {
  if (w.skillCd > 0) return;
  w.toStairs = false;
  if (x !== undefined && z !== undefined) hero.facing = Math.atan2(x - hero.x, z - hero.z);
  else {
    const near = w.entities
      .filter((e) => e !== hero && e.state !== 'dead' && dist(e, hero) <= SKILL.aim)
      .sort((a, b) => dist(a, hero) - dist(b, hero))[0];
    if (near) face(hero, near);
  }
  Object.assign(hero, { state: 'attack', attackT: 0, path: [], target: null, skill: true });
  w.skillCd = SKILL.cd;
}

// 가르기 타격: 바라보는 방향 반원(내적 ≥ 0)·반경 안, 벽에 막히지 않은 적 모두
function cleave(w: World, hero: Entity) {
  const fx = Math.sin(hero.facing);
  const fz = Math.cos(hero.facing);
  for (const e of w.entities) {
    if (e === hero || e.state === 'dead') continue;
    const dx = e.x - hero.x;
    const dz = e.z - hero.z;
    if (Math.hypot(dx, dz) > SKILL.radius || dx * fx + dz * fz < 0 || !clearLine(w, hero, e)) continue;
    hurt(w, e, Math.round(roll(w, hero) * SKILL.mult));
  }
  w.cleaves++;
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

// 보스 돌진. 3~7m·시야가 트이면 예고(제자리) → 그 순간 대상 방향으로 직선 돌진 → 벽·거리·명중에서 멈춤.
// 돌진 중이면 true(평소 행동을 건너뜀)
function charge(w: World, e: Entity, t: Entity | null): boolean {
  e.cd = Math.max(0, e.cd - DT);
  if (e.phase === 'none') {
    const d = t ? dist(e, t) : 0;
    if (!t || e.cd > 0 || e.state === 'attack' || d < CHARGE.min || d > CHARGE.max || !clearLine(w, e, t)) return false;
    Object.assign(e, { phase: 'windup', phaseT: CHARGE.windup, cd: CHARGE.cd, state: 'idle', path: [] });
    face(e, t);
    return true;
  }
  if (e.phase === 'windup') {
    if (t) face(e, t);
    if ((e.phaseT -= DT) > 0) return true;
    const d = t ? dist(e, t) || 1 : 1;
    if (!t) return Object.assign(e, { phase: 'none' }), true;
    Object.assign(e, { phase: 'charge', phaseT: CHARGE.dist, dx: (t.x - e.x) / d, dz: (t.z - e.z) / d, state: 'move' });
    return true;
  }
  const hero = w.entities[0];
  if (!rush(w, e, CHARGE.speed)) return true;
  if (hero.state !== 'dead' && dist(e, hero) <= CHARGE.hit) {
    hurt(w, hero, Math.round(roll(w, e) * CHARGE.mult));
    Object.assign(e, { phase: 'none', state: 'idle' });
  }
  return true;
}

// 직선 돌진 한 틱(보스 돌진·주인공 돌진 공용): (dx, dz)로 speed만큼. 남은 거리(phaseT)를 다 썼거나 벽이면 멈추고 false
function rush(w: World, e: Entity, speed: number): boolean {
  const step = speed * DT;
  const [nx, nz] = [e.x + e.dx * step, e.z + e.dz * step];
  if (e.phaseT <= 0 || !walkable(w.grid, Math.floor(nx), Math.floor(nz))) {
    Object.assign(e, { phase: 'none', state: 'idle' });
    return false;
  }
  [e.x, e.z] = [nx, nz];
  e.phaseT -= step;
  return true;
}

// 돌진 베기 시작: 조준점(없으면 가까운 적, 그것도 없으면 지금 방향)으로. 하던 일은 모두 끊는다
function dashStart(w: World, hero: Entity, x?: number, z?: number) {
  if (w.dashCd > 0) return;
  let [dx, dz] = [Math.sin(hero.facing), Math.cos(hero.facing)];
  const near = w.entities
    .filter((e) => e !== hero && e.state !== 'dead' && dist(e, hero) <= DASH.aim)
    .sort((a, b) => dist(a, hero) - dist(b, hero))[0];
  const [tx, tz] = x !== undefined && z !== undefined ? [x, z] : near ? [near.x, near.z] : [hero.x + dx, hero.z + dz];
  const d = Math.hypot(tx - hero.x, tz - hero.z);
  if (d > 1e-6) [dx, dz] = [(tx - hero.x) / d, (tz - hero.z) / d];
  Object.assign(hero, { phase: 'charge', phaseT: DASH.dist, dx, dz, state: 'move', path: [], target: null, attackT: 0, skill: false });
  hero.facing = Math.atan2(dx, dz);
  Object.assign(w, { dashCd: DASH.cd, dashHit: [], opening: null, toStairs: false });
  w.dashes++;
}

// 돌진 한 틱: 지나가는 길 DASH.hit 안의, 이번 돌진에서 아직 안 맞은 적에게 피해
function dashStep(w: World, hero: Entity) {
  if (!rush(w, hero, DASH.speed)) return;
  for (const e of w.entities) {
    if (e === hero || e.state === 'dead' || w.dashHit.includes(e.id) || dist(e, hero) > DASH.hit) continue;
    w.dashHit.push(e.id);
    hurt(w, e, roll(w, hero));
  }
}

// 마법사: 대상이 MAGE.flee 안이면 반대쪽으로 물러난다. 물러날 곳이 없으면(구석) false → 평소처럼 시전
function flee(w: World, e: Entity, t: Entity): boolean {
  const d = dist(e, t);
  if (d >= MAGE.flee) return false;
  if ((e.repathT -= DT) <= 0 || !e.path.length) {
    e.repathT = REPATH;
    const [ux, uz] = d < 1e-6 ? [1, 0] : [(e.x - t.x) / d, (e.z - t.z) / d];
    const [gx, gz] = [Math.floor(e.x + ux * MAGE.flee), Math.floor(e.z + uz * MAGE.flee)];
    let best: Cell | null = null;
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const c: Cell = [gx + dx, gz + dz];
        const far = Math.hypot(c[0] + 0.5 - t.x, c[1] + 0.5 - t.z);
        if (walkable(w.grid, c[0], c[1]) && far > d + 1 && (!best || far > Math.hypot(best[0] + 0.5 - t.x, best[1] + 0.5 - t.z))) best = c;
      }
    }
    const p = best && findPath(w.grid, cellOf(e), best);
    e.path = p && p.length > 1 ? waypoints(p, best![0] + 0.5, best![1] + 0.5) : [];
  }
  if (!e.path.length) return false;
  walk(w, e);
  return true;
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

// 공격자 a의 데미지 굴림(무기·레벨·층 배율)
function roll(w: World, a: Entity) {
  const [lo, hi] = a.kind === 'hero' ? WEAPONS[w.gear.weapon - 1].dmg : STATS[a.kind].dmg;
  // 주인공은 레벨 보너스, 몬스터는 층 배율의 절반만(체력과 데미지에 다 곱하면 난이도가 배율의 제곱으로 오른다)
  const scale = a.kind === 'hero' ? 1 + 0.05 * (w.level - 1) : (1 + (a.power - 1) / 2) * (a.elite ? ELITE.dmg : 1);
  return Math.round((lo + Math.floor(rand(w) * (hi - lo + 1))) * scale);
}

function damage(w: World, a: Entity, t: Entity) {
  hurt(w, t, roll(w, a));
}

// 대상 t 쪽으로 화살·화염구를 쏜다(그 순간 위치를 향해 직선). 데미지는 지금 굴린다
function shoot(w: World, a: Entity, t: Entity, kind: Shot['kind']) {
  const d = dist(a, t) || 1;
  const left = kind === 'fire' ? MAGE.flight : ARCHER.flight;
  w.shots.push({ id: w.nextItem++, x: a.x, z: a.z, dx: (t.x - a.x) / d, dz: (t.z - a.z) / d, dmg: roll(w, a), left, kind });
}

// 비행: 화살은 벽·비행 끝에서 사라지고 주인공에 닿으면 피해. 화염구는 그 모든 경우에 그 자리에서 폭발
function fly(w: World, hero: Entity) {
  w.shots = w.shots.filter((s) => {
    const fire = s.kind === 'fire';
    const step = (fire ? MAGE.speed : ARCHER.speed) * DT;
    const [nx, nz] = [s.x + s.dx * step, s.z + s.dz * step];
    s.left -= step;
    if (!walkable(w.grid, Math.floor(nx), Math.floor(nz)) || s.left <= 0) {
      if (fire) explode(w, hero, s.x, s.z, s.dmg); // 벽 앞(마지막으로 있던 자리)에서
      return false;
    }
    [s.x, s.z] = [nx, nz];
    if (hero.state === 'dead' || Math.hypot(s.x - hero.x, s.z - hero.z) > (fire ? MAGE.hitRadius : ARCHER.hitRadius)) return true;
    if (fire) explode(w, hero, s.x, s.z, s.dmg);
    else hurt(w, hero, s.dmg);
    return false;
  });
}

// 화염구 폭발: 반경 안의 살아 있는 주인공에게 피해(직격과 겹쳐도 한 번), 기록을 남긴다
function explode(w: World, hero: Entity, x: number, z: number, dmg: number) {
  w.blasts.push({ id: w.nextItem++, x, z, age: 0 });
  if (hero.state !== 'dead' && Math.hypot(hero.x - x, hero.z - z) <= MAGE.blast) hurt(w, hero, dmg);
}

// 피해 적용: 주인공은 갑옷으로 줄이되 최소 1. 몬스터가 죽으면 경험치·드롭
function hurt(w: World, t: Entity, raw: number) {
  let dmg = raw;
  if (t.kind === 'hero') dmg = Math.max(1, Math.round(dmg * (1 - ARMORS[w.gear.armor - 1].reduce)));
  t.hp = Math.max(0, t.hp - dmg);
  if (t.hp > 0) return;
  t.state = 'dead';
  t.path = [];
  t.target = null;
  if (t.kind === 'hero') return;
  gainXp(w, Math.round(XP[t.kind] * t.power * (t.elite ? ELITE.xp : 1)));
  const drop = (kind: Item['kind'], tier: number) => w.items.push({ id: w.nextItem++, x: t.x, z: t.z, kind, tier });
  if (rand(w) < POTION.drop[t.kind]) drop('potion', 0);
  const g = t.elite ? { chance: 1, ...GOLD_ELITE } : GOLD[t.kind];
  if (g.chance > 0 && rand(w) < g.chance) dropGold(w, t.x + 0.3, t.z, g.lo, g.hi, t.power);
  if (t.elite) drop(rand(w) < 0.5 ? 'weapon' : 'armor', w.maxTier); // 정예는 이 층 최고 단계 확정
  else if (rand(w) < GEAR_DROP[t.kind]) drop(rand(w) < 0.5 ? 'weapon' : 'armor', 1 + Math.floor(rand(w) * w.maxTier));
}

// mulberry32. 상태가 world.rng에 있어서 같은 시드 = 같은 난수열.
function rand(w: World) {
  let t = (w.rng = (w.rng + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

const dist = (a: Entity, b: Entity) => Math.hypot(a.x - b.x, a.z - b.z);

// 사거리(궁수 ARCHER.range, 마법사 MAGE.range) 안이고, 둘 사이 직선이 벽 칸을 지나지 않아야(0.1m 간격 샘플) 칠 수 있다
function canHit(w: World, a: Entity, b: Entity) {
  const reach = a.kind === 'archer' ? ARCHER.range : a.kind === 'mage' ? MAGE.range : RANGE;
  return dist(a, b) <= reach && clearLine(w, a, b);
}

// 둘 사이 직선이 벽 칸을 지나지 않는가(0.1m 간격 샘플)
function clearLine(w: World, a: Entity, b: Entity) {
  const n = Math.ceil(dist(a, b) / 0.1);
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
