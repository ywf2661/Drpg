// 게임 규칙의 타입과 수치표. 로직 없음.
import type { Cell, Grid } from './path';

export type Kind = 'hero' | 'minion' | 'warrior' | 'archer' | 'mage' | 'king' | 'boss';
// 주인공 직업. 스킬 4칸(SkillName)과 명령(skill·dash·shout·throw·roll)은 같고, 직업마다 하는 일이 다르다:
// 기사 = 가르기·돌진 베기·전투의 함성·도끼 던지기·구르기, 마법사 = 화염구·서리 고리·낙뢰·마나 방패·순간이동,
// 궁수 = 관통 사격·덫·화살비·집중·구르기
export type HeroClass = 'knight' | 'wizard' | 'ranger';

export type State = 'idle' | 'move' | 'attack' | 'dead';

export type Command =
  | { type: 'move'; x: number; z: number }
  | { type: 'attack'; targetId: number }
  | { type: 'drink' }
  | { type: 'skill'; x?: number; z?: number } // 가르기. (x, z)가 있으면 그쪽으로
  | { type: 'open'; chestId: number } // 상자 열기(걸어가서)
  | { type: 'dash'; x?: number; z?: number } // 돌진 베기. (x, z)가 있으면 그쪽으로
  | { type: 'shout'; x?: number; z?: number } // 전투의 함성(기사) · 낙뢰(마법사, (x, z)가 있으면 그 지점)
  | { type: 'roll'; x?: number; z?: number } // 구르기(무적). (x, z)가 있으면 그쪽으로, 없으면 가까운 적의 반대쪽
  | { type: 'throw'; x?: number; z?: number } // 도끼 던지기. (x, z)가 있으면 그쪽으로
  | { type: 'learn'; skill: SkillName } // 스킬 포인트로 단계 올리기
  | { type: 'trait'; skill: SkillName; pick: number }; // 특성 고르기(1 또는 2). 3단계부터, 바꿀 때는 금화
export type SkillName = 'cleave' | 'dash' | 'shout' | 'throw'; // 스킬 칸(Q W E R). 이름은 기사 기준, 마법사는 같은 칸에 화염구·서리 고리·낙뢰·마나 방패

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
  elite: boolean; // 정예: 체력 ×3, 데미지 ×1.15, 경험치 ×4, 최고 단계 장비 확정
  // 보스 돌진: phase 예고·돌진, phaseT 예고 남은 시간 또는 돌진 남은 거리, cd 재사용 대기, (dx, dz) 돌진 방향
  phase: 'none' | 'windup' | 'charge' | 'roll'; // roll = 주인공 구르기(phaseT 남은 거리)
  phaseT: number;
  cd: number;
  dx: number;
  dz: number;
  summoner: number; // 소환한 해골 왕의 id(-1 = 처음부터 있던 몬스터)
  stunT: number; // 기절 남은 시간(초). 기절 중엔 아무것도 하지 않는다
  fearT: number; // 공포 남은 시간(초). 주인공 반대쪽으로 도망친다
};

// 소품(칸 좌표). 막힘은 grid에 있고, 이것은 렌더용 기록이다
export type Prop = { kind: 'brazier' | 'prop' | 'debris'; x: number; z: number };

// 장비 부위
export type Slot = 'weapon' | 'armor' | 'helm' | 'boots';
export const SLOTS: Slot[] = ['weapon', 'armor', 'helm', 'boots'];
// 바닥에 떨어진 아이템(월드 좌표). tier: 장비 단계 1~4(물약은 0)
// amount: 금화 양(금화만)
export type Item = { id: number; x: number; z: number; kind: 'potion' | 'gold' | Slot; tier: number; amount?: number; affixes?: Affix[] };
// 마법 옵션. value는 정수(효과 단위는 AFFIXES 설명)
export type AffixKind = 'dmg' | 'speed' | 'leech' | 'crit' | 'life' | 'guard' | 'regen' | 'thorns' | 'move';
export type Affix = { kind: AffixKind; value: number };

// 장비 하나(부위·단계·옵션)
export type GearItem = { kind: Slot; tier: number; affixes: Affix[] };
// 보관함 격자에 놓인 장비. (x, y) = 왼쪽 위 칸
export type BagItem = GearItem & { x: number; y: number };
export const BAG = { w: 10, h: 4 };
// 장비가 차지하는 칸 [가로, 세로], 단계 순
export const GEAR_SIZE: Record<GearItem['kind'], [number, number][]> = {
  weapon: [[1, 2], [1, 3], [1, 3], [2, 3]],
  armor: [[2, 2], [2, 2], [2, 3], [2, 3]],
  helm: [[2, 2], [2, 2], [2, 2], [2, 2]],
  boots: [[2, 2], [2, 2], [2, 2], [2, 2]],
};

// 사슬로 묶인 쇠창살 문(칸 좌표). 닫힌 동안 그 칸은 막혀 있고, 도끼가 맞으면 붙어 있는 문과 함께 열린다.
// axis: 막고 있는 통로의 방향(렌더가 문 그림을 고른다)
export type Gate = { id: number; x: number; z: number; axis: 'x' | 'z'; open: boolean };

// 보물 상자(칸 좌표). 한 번 열면 끝
export type Chest = { id: number; x: number; z: number; open: boolean };

// 날아가는 화살. (dx, dz) 단위 방향, dmg는 쏠 때 굴린 값, left는 남은 비행 거리(m)
// hit: 관통 도끼(5단계)·관통 화염구가 이미 맞힌 적 id
// 주인공 것(몬스터만 맞음): axe = 도끼, bolt = 마법사 마력탄(평타), fireball = 마법사 화염구
export type Shot = { id: number; x: number; z: number; dx: number; dz: number; dmg: number; left: number; kind: 'arrow' | 'fire' | 'axe' | 'bolt' | 'fireball' | 'shaft' | 'pierce'; hit?: number[]; bounce?: number; stuck?: number; wait?: number }; // bounce: 남은 튕김, stuck: 박힌 적 id(그 적을 따라다닌다), wait: 이 시간(초) 동안 주인공 자리에서 기다렸다 난다. shaft = 궁수 화살, pierce = 관통 사격

// 스킬 연계 기록(렌더용 글자). counter = 받아치기, stunned = 약점, reset = 돌진 → 가르기 준비. age초 뒤 지운다
export type Combo = { id: number; x: number; z: number; kind: 'counter' | 'stunned' | 'back' | 'reset' | 'dodge'; age: number }; // back = 공포로 도망치는 적

// 돌진 '불길'이 남긴 불타는 길(선분). t초 동안, acc가 TRAIL.tick을 넘을 때마다 길 위의 적에게 피해
export type Fire = { id: number; x0: number; z0: number; x1: number; z1: number; t: number; acc: number };

// 화염구 폭발 기록(렌더·소리용). age초 뒤 지운다
// slam = 전사 내려찍기가 떨어진 자리, 나머지는 마법사: thunder 낙뢰, spark 연쇄 번개, frost 서리 고리(시전자), ice 얼어붙은 적, blink 순간이동, heal 치유, nova 방패 폭발
export type Blast = { id: number; x: number; z: number; r?: number; age: number; kind: 'fire' | 'slam' | 'thunder' | 'spark' | 'frost' | 'ice' | 'blink' | 'heal' | 'nova' | 'trap' | 'rain' };

// 바닥의 위험 구역(예고 공격). t초 뒤 반경 r 안의 주인공에게 dmg. total = 처음의 t(렌더 진행도).
// owner: 예고 자세를 유지해야 하는 몬스터 id(끊기면 구역도 사라진다), -1 = 이미 떨어지는 중(못 끊음)
export type Zone = { id: number; x: number; z: number; r: number; t: number; total: number; dmg: number; owner: number };

// 장착 장비 단계(1~4). WEAPONS·ARMORS·HELMS·BOOTS[단계 − 1]
export type Gear = Record<Slot, number>;

// toStairs: 주인공이 계단 칸을 직접 눌러 가는 중. 지나가기만 해서는 내려가지 않도록
// potions: 허리띠의 물약 수, nextItem: 다음 아이템 id, maxTier: 이 층에서 떨어지는 장비의 최고 단계
// level·xp: 주인공 레벨과 현재 레벨에서 쌓인 경험치
export type World = {
  cls: HeroClass;
  grid: Grid;
  entities: Entity[];
  rng: number;
  stairs: Cell | null;
  toStairs: boolean;
  props: Prop[];
  chests: Chest[];
  gates: Gate[];
  opening: number | null; // 주인공이 열러 가는 상자 id
  items: Item[];
  shots: Shot[];
  blasts: Blast[];
  zones: Zone[];
  combos: Combo[];
  fires: Fire[];
  healing: { total: number; given: number; t: number } | null; // 마신 물약이 차는 중(합계·준 양·지난 시간)
  nextItem: number; // 아이템·화살 공용 id
  potions: number;
  gold: number;
  power: number; // 이 층의 몬스터 배율(상자 금화에도)
  gear: Gear;
  mods: Record<Slot, Affix[]>; // 장착 장비의 마법 옵션
  bag: BagItem[]; // 보관함(BAG 격자, 서로 겹치지 않는다)
  autoEquip: boolean; // 밟은 장비가 더 좋으면 바로 입는다
  regenAcc: number; // 재생 옵션의 소수점 회복 누적
  maxTier: number;
  level: number;
  xp: number;
  skillCd: number; // 가르기 재사용까지 남은 시간(초)
  dashCd: number; // 돌진 베기 재사용까지 남은 시간(초)
  dashHit: number[]; // 이번 돌진에서 이미 맞은 적 id
  dashes: number; // 돌진 횟수(렌더·소리용)
  cleaves: number; // 가르기 타격 횟수(렌더·소리용)
  shoutCd: number; // 전투의 함성 재사용까지(초)
  shoutT: number; // 받는 피해 감소가 남은 시간(초): 기사 함성, 마법사 서리 갑옷
  wardHp: number; // 마나 방패가 흡수할 남은 피해(0 = 없음)
  wardT: number; // 마나 방패 남은 시간(초)
  wardBroke: boolean; // 이번 틱에 방패가 깨졌다(5단계 폭발)
  storm: { x: number; z: number; t: number }[]; // 천둥: 뒤이어 떨어질 벼락(보이기만, t초 뒤)
  traps: { id: number; x: number; z: number }[]; // 궁수가 놓은 덫(오래된 것부터)
  volleys: { x: number; z: number; r: number; t: number; left: number }[]; // 떨어질 화살비(t초 뒤, left번 남음)
  shouts: number; // 함성 횟수(렌더·소리용)
  casts: number; // 마법사 스킬 시전 횟수(렌더용: 시전 동작)
  throwCd: number; // 도끼 던지기 재사용까지(초)
  rollCd: number; // 구르기 재사용까지(초)
  ranks: Record<SkillName, number>; // 스킬 단계 1~RANK_MAX
  points: number; // 남은 스킬 포인트(레벨업마다 1)
  traits: Record<SkillName, number>; // 스킬마다 고른 특성(0 = 아직, 1·2). TRAIT.rank단계부터 고른다
  spinT: number; // 회오리 남은 시간(초)
  spinAcc: number; // 회오리 다음 타격까지 쌓인 시간
  impacts: number; // 스킬이 적을 맞힌 누적 횟수(렌더용: 멈춤·흔들림)
};

export const DT = 1 / 60;

export const RANGE = 1.5;

// 몬스터 데미지 = 기본 × (1 + (층 배율 − 1) × DMG_SCALE) × MONSTER_DMG. 1~2층은 거의 그대로, 깊을수록 가파르게
// (마법 옵션·스킬 도입 후 봇 테스트로 정함: 5층 ×2.2. 스킬을 쓰면 확실히 덜 죽게)
export const DMG_SCALE = 2;
export const MONSTER_DMG = 2.5; // 공통 배율(밸런스 손잡이). 투구·신발이 생기면서 2 → 2.5(봇 사망 수를 그 전과 맞춤)
export const ELITE = { hp: 3, dmg: 1.15, xp: 4 };
// 마법 옵션: 붙는 부위들, 이름(접두어), 값 범위. dmg·speed·leech·crit·guard·thorns·move는 %, life는 체력, regen은 초당 1/10.
// 여러 부위에 붙은 같은 옵션은 더한다
export const AFFIXES: Record<AffixKind, { slots: Slot[]; name: string; lo: number; hi: number }> = {
  dmg: { slots: ['weapon'], name: '날카로운', lo: 15, hi: 30 },
  speed: { slots: ['weapon'], name: '신속한', lo: 8, hi: 15 },
  leech: { slots: ['weapon'], name: '흡혈의', lo: 4, hi: 8 },
  crit: { slots: ['weapon'], name: '치명적인', lo: 8, hi: 15 },
  life: { slots: ['armor', 'helm', 'boots'], name: '튼튼한', lo: 15, hi: 30 },
  guard: { slots: ['armor', 'helm'], name: '단단한', lo: 5, hi: 10 },
  regen: { slots: ['armor', 'boots'], name: '재생의', lo: 5, hi: 15 },
  thorns: { slots: ['armor', 'helm'], name: '가시', lo: 20, hi: 40 },
  move: { slots: ['boots'], name: '날랜', lo: 5, hi: 10 },
};
// 옵션 0·1·2개(일반·마법·희귀) 확률. boosted = 정예·해골 왕
export const QUALITY = { normal: [0.6, 0.32, 0.08], boosted: [0, 0.7, 0.3] };

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

export const RANK_MAX = 5;
export const COMBO = { counter: 2, stunned: 1.5, back: 2, age: 0.6 }; // 연계 배율(예고 중·기절 중·도망치는 적에게 스킬), 기록 유지 시간
// 특성: 고를 수 있는 단계, 바꾸는 값(금화)
export const TRAIT = { rank: 3, respec: 100 };
export const WHIRL = { time: 2, extra: 1, tick: 0.25, mult: 0.25 }; // 가르기 1 회오리: 시간, 5단계 추가 시간, 타격 간격, 타격당 배율(× 가르기 배율)
export const BURST = { radius: 1.6, hp: 0.4 }; // 가르기 2 시체 폭발: 반경, 피해(시체 최대 체력 비율)
export const SKEWER = { hold: 0.7, stun: 1.5, mult: 1 }; // 돌진 1 꼬치: 끌고 가는 거리(주인공 앞), 벽에 박힌 기절·추가 피해(× 돌진 배율)
export const TRAIL = { time: 3, tick: 0.5, width: 0.8, mult: 0.35 }; // 돌진 2 불길: 유지 시간, 피해 간격, 길 폭(반경), 한 번 피해 배율
export const PULL = { to: 1.1 }; // 함성 1 끌어당김: 주인공에게서 이 거리까지
export const FEAR = { time: 4 }; // 함성 2 공포: 도망치는 시간
export const BOUNCE = { count: 3, range: 5 }; // 도끼 1 튕김: 횟수(5단계는 두 배), 다음 적을 찾는 거리
export const STUCK = { radius: 2, mult: 1.5, gap: 1 }; // 도끼 2 박힌 도끼: 뽑을 때 폭발 반경·배율(× 도끼 배율), 순간이동해 서는 거리
export const KNOCK = { cleave: 0.9, dash: 0.7, axe: 0.6, shout: 0.4 }; // 스킬에 맞은 적이 밀려나는 거리(m)
export const SHOUT = { cd: 15, radius: 4, stun: 2, time: 6, reduce: 0.3, heal: 0.15 }; // 전투의 함성: 재사용, 범위, 기절, 피해 감소 시간·비율, 5단계의 회복(최대 체력 비율)
export const AXE = { cd: 2.5, speed: 12, flight: 8, hit: 0.5, mult: 1.2, aim: 8, gate: 3 }; // 도끼 던지기: 재사용, 속도, 비행 거리, 맞는 반경, 배율, 자동 조준(적), 자동 조준(닫힌 문)
export const DASH = { cd: 6, dist: 5, speed: 14, hit: 1, aim: 6 }; // 돌진 베기: 재사용, 거리, 속도, 길 폭(반경), 자동 조준 거리

// 구르기: 재사용, 거리, 속도(거리 ÷ 속도 = 무적 시간), 조준이 없을 때 피할 적을 찾는 거리
export const ROLL = { cd: 1, dist: 3, speed: 9, away: 4 };
// 근접 평타의 준비 시간(초): 휘두르기 시작 후 이만큼 지나야 맞는다. 남은 휘두르기 시간이 빈틈. 없는 종류는 간격 × HIT_AT
export const TELL: Partial<Record<Kind, number>> = { minion: 0.5, warrior: 0.8, king: 0.9, boss: 0.9 };

export const ARCHER = { range: 6, speed: 9, flight: 8, hitRadius: 0.4 }; // 궁수 사거리, 화살 속도(m/s)·비행 거리·맞는 반경

// 마법사: 사거리, 화염구 속도·비행 거리·직격 반경·폭발 반경·폭발 기록 유지, 물러나는 거리
export const MAGE = { range: 7, speed: 6, flight: 9, hitRadius: 0.5, blast: 1.2, blastAge: 0.6, flee: 3 };

// 전사 내려찍기: 재사용, 첫 대기(대상을 잡은 뒤, + id % 3초로 엇갈림), 예고 시간, 앞쪽 거리, 반경, 배율
export const SLAM = { cd: 6, first: 2, windup: 0.8, reach: 1, radius: 1.3, mult: 2 };
// 마법사 불기둥: 재사용, 첫 대기(+ id % 3초), 떨어지기까지, 배율. 반경은 MAGE.blast
export const METEOR = { cd: 7, first: 3, delay: 1.2, mult: 1.5 };

export const RADIUS = 0.4;

export const AGGRO = 8;

export const HIT_AT = 0.4;

export const REPATH = 0.5;

// 드롭 확률(종류별), 줍는 반경(m), 허리띠 칸 수, 회복량(최대 체력 비율)
export const POTION = { drop: { hero: 0, minion: 0.2, warrior: 0.35, archer: 0.25, mage: 0.25, king: 0, boss: 0 } as Record<Kind, number>, pickup: 0.6, max: 8, heal: 0.5, time: 4 }; // time: 회복에 걸리는 시간(초)

export const GEAR_DROP: Record<Kind, number> = { hero: 0, minion: 0.05, warrior: 0.12, archer: 0.08, mage: 0.1, king: 0, boss: 0 };

// 처치 경험치(× 몬스터 층 배율). 레벨마다 최대 체력 +10, 주인공 데미지 +5%
export const XP: Record<Kind, number> = { hero: 0, minion: 10, warrior: 25, archer: 15, mage: 20, king: 150, boss: 0 };

export const xpToNext = (level: number) => 40 + 30 * (level - 1);

export const heroMaxHp = (level: number, cls: HeroClass = 'knight') => CLASSES[cls].hp + CLASSES[cls].perLevel * (level - 1);

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

// 투구: 최대 체력 +hp
export const HELMS: { name: string; hp: number }[] = [
  { name: '천 두건', hp: 0 },
  { name: '가죽 두건', hp: 10 },
  { name: '사슬 두건', hp: 20 },
  { name: '판금 투구', hp: 30 },
];

// 신발: 이동 속도 +move(비율)
export const BOOTS: { name: string; move: number }[] = [
  { name: '샌들', move: 0 },
  { name: '가죽 장화', move: 0.05 },
  { name: '사슬 장화', move: 0.1 },
  { name: '판금 장화', move: 0.15 },
];

// 직업: 이름, 체력(1레벨, 레벨당), 부위별 단계 표. 투구 체력·신발 속도는 직업 공통이고 이름(외형)만 다르다
type ClassDef = { name: string; hp: number; perLevel: number; weapons: typeof WEAPONS; armors: typeof ARMORS; helms: typeof HELMS; boots: typeof BOOTS };
const named = <T>(table: T[], names: string[]) => table.map((t, k) => ({ ...t, name: names[k] }));
export const CLASSES: Record<HeroClass, ClassDef> = {
  knight: { name: '기사', hp: 100, perLevel: 10, weapons: WEAPONS, armors: ARMORS, helms: HELMS, boots: BOOTS },
  // 마법사: 체력·방어가 낮고 멀리서 친다(마력탄 사거리 WIZ.range). 지팡이 초당 데미지는 같은 단계 검의 약 0.85배.
  // 체력·스킬 수치는 봇 테스트로 정함(30판: 클리어·사망 수가 기사와 비슷하게, 피하지 않으면 훨씬 어렵게)
  wizard: {
    name: '마법사',
    hp: 70,
    perLevel: 6,
    weapons: [
      { name: '완드', dmg: [4, 7], interval: 0.7 },
      { name: '마법 막대', dmg: [5, 9], interval: 0.8 },
      { name: '지팡이', dmg: [7, 11], interval: 0.9 },
      { name: '대지팡이', dmg: [9, 14], interval: 1.0 },
    ],
    armors: [
      { name: '천옷', reduce: 0 },
      { name: '견습 로브', reduce: 0.05 },
      { name: '마도 로브', reduce: 0.12 },
      { name: '대마법사 로브', reduce: 0.2 },
    ],
    helms: named(HELMS, ['천 머리띠', '견습 두건', '마도 두건', '대마법사 두건']),
    boots: named(BOOTS, ['샌들', '견습 장화', '마도 장화', '대마법사 장화']),
  },
  // 궁수: 체력·방어가 기사와 마법사 사이, 가장 멀리서 쏜다(RANGER.range). 범위가 없어 활 초당 데미지는 검과 비슷하다
  ranger: {
    name: '궁수',
    hp: 85,
    perLevel: 8,
    weapons: [
      { name: '새총', dmg: [4, 7], interval: 0.65 },
      { name: '단궁', dmg: [6, 10], interval: 0.75 },
      { name: '장궁', dmg: [8, 13], interval: 0.85 },
      { name: '대궁', dmg: [11, 18], interval: 1.05 },
    ],
    armors: [
      { name: '천옷', reduce: 0 },
      { name: '가죽 갑옷', reduce: 0.07 },
      { name: '사냥꾼 갑옷', reduce: 0.14 },
      { name: '순찰자 사슬 갑옷', reduce: 0.22 },
    ],
    helms: named(HELMS, ['천 두건', '사냥꾼 두건', '가죽 두건', '사슬 두건']),
    boots: named(BOOTS, ['샌들', '가죽 장화', '사냥꾼 장화', '사슬 장화']),
  },
};
// 부위별 단계 표(이름·수치)
export const gearTable = (cls: HeroClass): Record<Slot, { name: string }[]> => ({ weapon: CLASSES[cls].weapons, armor: CLASSES[cls].armors, helm: CLASSES[cls].helms, boots: CLASSES[cls].boots });

// 마법사. 마력탄(평타): 사거리, 속도, 비행 거리, 맞는 반경
export const WIZ = { range: 6.5, speed: 12, flight: 8, hit: 0.45 };
// 화염구(Q): 재사용, 속도, 비행 거리, 맞는 반경, 폭발 반경, 배율, 5단계 세 갈래 각도(라디안), 자동 조준 거리
export const FIREBALL = { cd: 5, speed: 11, flight: 9, hit: 0.5, radius: 1.6, mult: 1.5, spread: 0.3, aim: 8 };
// 서리 고리(W): 재사용, 반경, 얼리는 시간, 배율, 얼음 감옥 배수, 서리 갑옷(받는 피해 감소·시간)
export const FROST = { cd: 9, radius: 3.5, freeze: 1.2, mult: 0.8, prison: 1.75, armor: 0.3, armorTime: 5 };
// 낙뢰(E): 재사용, 사거리, 반경, 배율, 기절, 연쇄 번개(횟수·찾는 거리·배율), 천둥(반경 배수·배율 배수)
export const BOLT = { cd: 6, range: 8, radius: 1.4, mult: 1.6, stun: 0.6, chain: 3, chainRange: 4, chainMult: 0.6, wide: 2, wideMult: 0.7, storm: 7, stormTime: 0.55 };
// 마나 방패(R): 재사용, 시간, 흡수(최대 체력 비율), 치유(최대 체력 비율), 반사 비율, 5단계 폭발(반경·배율)
export const WARD = { cd: 15, time: 6, absorb: 0.2, heal: 0.25, reflect: 0.5, nova: 2.5, novaMult: 1.2 };
// 순간이동(스페이스): 재사용, 거리, 무적 시간(초)
export const BLINK = { cd: 3, dist: 5, guard: 0.25 };

// 궁수. 화살(평타): 사거리, 속도, 비행 거리, 맞는 반경. 명사수: far m 넘게 떨어진 적에게 주는 피해 ×farMult
export const RANGER = { range: 7.5, speed: 14, flight: 9, hit: 0.4, far: 5, farMult: 1.25 };
// 관통 사격(Q): 재사용, 배율, 속도, 비행 거리, 맞는 반경, 세 갈래 각도(라디안), 밀쳐내기 거리·벽 기절, 5단계 두 번째 화살 대기(초), 자동 조준 거리
export const PIERCE = { cd: 5, mult: 1.8, speed: 16, flight: 10, hit: 0.5, spread: 0.25, push: 1.2, wallStun: 1.5, wait: 0.15, aim: 9 };
// 덫(W): 재사용, 놓는 사거리, 밟는 반경, 묶는 시간, 배율, 최대 개수, 폭발·5단계 범위, 덫 3개 특성(개수·묶는 시간 배수)
export const TRAP = { cd: 6, range: 6, trigger: 0.6, hold: 1.5, mult: 1.2, max: 2, radius: 1.8, bigMax: 3, bigHold: 1.4 };
// 화살비(E): 재사용, 사거리, 반경, 떨어지기까지(초), 배율, 지속 특성(횟수·간격·회당 배율 배수), 5단계 반경 배수
export const RAIN = { cd: 8, range: 8, radius: 1.8, delay: 0.6, mult: 1.6, waves: 4, every: 0.75, waveMult: 0.5, big: 1.3 };

export const STATS: Record<Kind, { name: string; hp: number; dmg: [number, number]; interval: number; speed: number }> = {
  hero: { name: '기사', hp: 100, dmg: [8, 12], interval: 0.8, speed: 4 }, // 데미지·간격은 실제로는 장착 무기(WEAPONS)
  minion: { name: '스켈레톤 졸개', hp: 45, dmg: [3, 5], interval: 1.5, speed: 2.5 },
  warrior: { name: '스켈레톤 전사', hp: 90, dmg: [6, 9], interval: 2, speed: 2 },
  archer: { name: '스켈레톤 궁수', hp: 38, dmg: [4, 7], interval: 1.8, speed: 2.2 },
  mage: { name: '스켈레톤 마법사', hp: 33, dmg: [5, 8], interval: 2.4, speed: 2 },
  king: { name: '해골 왕', hp: 260, dmg: [9, 14], interval: 2, speed: 2.2 },
  boss: { name: '미노타우르스', hp: 500, dmg: [15, 24], interval: 1.8, speed: 2.4 },
};
