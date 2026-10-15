// 게임 규칙의 타입과 수치표. 로직 없음.
import type { Cell, Grid } from './path';

export type Kind = 'hero' | 'minion' | 'warrior' | 'archer' | 'mage' | 'king' | 'boss';

export type State = 'idle' | 'move' | 'attack' | 'dead';

export type Command =
  | { type: 'move'; x: number; z: number }
  | { type: 'attack'; targetId: number }
  | { type: 'drink' }
  | { type: 'skill'; x?: number; z?: number } // 가르기. (x, z)가 있으면 그쪽으로
  | { type: 'open'; chestId: number } // 상자 열기(걸어가서)
  | { type: 'dash'; x?: number; z?: number }; // 돌진 베기. (x, z)가 있으면 그쪽으로

export type Point = [x: number, z: number];

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
  summoner: number; // 소환한 해골 왕의 id(-1 = 처음부터 있던 몬스터)
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

export const KING = { cd: 8, windup: 0.8, count: 2, max: 6, range: 8, gold: [80, 120] }; // 해골 왕 소환·드롭

// 금화 드롭: 확률·양(× 몬스터 층 배율). 정예는 확정 40–60, 상자는 확정 15–30 × 층 배율
export const GOLD: Record<Kind, { chance: number; lo: number; hi: number }> = {
  hero: { chance: 0, lo: 0, hi: 0 },
  minion: { chance: 0.5, lo: 3, hi: 8 },
  warrior: { chance: 0.6, lo: 8, hi: 15 },
  archer: { chance: 0.6, lo: 5, hi: 10 },
  mage: { chance: 0.6, lo: 6, hi: 12 },
  king: { chance: 0, lo: 0, hi: 0 }, // 해골 왕은 따로(확정)
  boss: { chance: 0, lo: 0, hi: 0 },
};

export const GOLD_ELITE = { lo: 40, hi: 60 };

export const GOLD_CHEST = { lo: 15, hi: 30 };

export const CHARGE = { min: 3, max: 7, windup: 0.7, speed: 9, dist: 7, hit: 0.8, mult: 1.5, cd: 7 }; // 보스 돌진

export const CHEST = { reach: 1.5, potion: 0.6, drop: 0.7 }; // 여는 거리, 물약 확률(나머지 장비), 떨어지는 거리(주인공 쪽)

export const SKILL = { cd: 4, radius: 2, mult: 1.5, aim: 2.5 }; // 가르기: 재사용 대기, 범위, 데미지 배율, 자동 조준 거리

export const DASH = { cd: 6, dist: 5, speed: 14, hit: 1, aim: 6 }; // 돌진 베기: 재사용, 거리, 속도, 길 폭(반경), 자동 조준 거리

export const ARCHER = { range: 6, speed: 9, flight: 8, hitRadius: 0.4 }; // 궁수 사거리, 화살 속도(m/s)·비행 거리·맞는 반경

// 마법사: 사거리, 화염구 속도·비행 거리·직격 반경·폭발 반경·폭발 기록 유지, 물러나는 거리
export const MAGE = { range: 7, speed: 6, flight: 9, hitRadius: 0.5, blast: 1.2, blastAge: 0.6, flee: 3 };

export const RADIUS = 0.4;

export const AGGRO = 8;

export const HIT_AT = 0.4;

export const REPATH = 0.5;

// 드롭 확률(종류별), 줍는 반경(m), 허리띠 칸 수, 회복량(최대 체력 비율)
export const POTION = { drop: { hero: 0, minion: 0.2, warrior: 0.35, archer: 0.25, mage: 0.25, king: 0, boss: 0 } as Record<Kind, number>, pickup: 0.6, max: 8, heal: 0.5 };

export const GEAR_DROP: Record<Kind, number> = { hero: 0, minion: 0.05, warrior: 0.12, archer: 0.08, mage: 0.1, king: 0, boss: 0 };

// 처치 경험치(× 몬스터 층 배율). 레벨마다 최대 체력 +10, 주인공 데미지 +5%
export const XP: Record<Kind, number> = { hero: 0, minion: 10, warrior: 25, archer: 15, mage: 20, king: 150, boss: 0 };

export const xpToNext = (level: number) => 40 + 30 * (level - 1);

export const heroMaxHp = (level: number) => STATS.hero.hp + 10 * (level - 1);

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
  king: { name: '해골 왕', hp: 260, dmg: [9, 14], interval: 1.5, speed: 2.2 },
  boss: { name: '미노타우르스', hp: 500, dmg: [12, 20], interval: 1.6, speed: 2.4 },
};
