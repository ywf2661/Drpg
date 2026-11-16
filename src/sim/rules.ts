// 게임 규칙의 타입과 수치표. 로직 없음.
import type { Cell, Grid } from './path';

export type Kind = 'hero' | 'minion' | 'warrior' | 'archer' | 'mage' | 'king' | 'boss';
// 주인공 직업. 직업마다 스킬 트리(탭 3개 × 4단계, TREES)가 있고, 배운 액티브 스킬을 스킬 칸 Q W E R(SkillName)에 끼워 쓴다.
// 스페이스는 구르기(마법사는 순간이동)
export type HeroClass = 'knight' | 'wizard' | 'ranger' | 'necromancer';

// 스킬 트리의 스킬. 탭마다 [1단계, 2단계, 패시브, 궁극기] 순서(TREES)
export type SkillId =
  | 'cleave' | 'whirl' | 'burst' | 'execute' | 'dash' | 'shout' | 'trail' | 'leap' | 'throw' | 'bounce' | 'axes' | 'axeStorm'
  | 'fireball' | 'firefield' | 'embers' | 'comet' | 'frost' | 'ward' | 'frostArmor' | 'blizzard' | 'lightning' | 'chain' | 'static' | 'tempest'
  | 'pierce' | 'spread' | 'crit' | 'focus' | 'trap' | 'push' | 'snare' | 'hunt' | 'rain' | 'fireRain' | 'downpour' | 'arrowStorm'
  | 'bones' | 'giant' | 'boneMastery' | 'lord' | 'curse' | 'plague' | 'curseMastery' | 'corpseBlast' | 'spear' | 'boneArmor' | 'drain' | 'prison';
type Tab = { name: string; skills: [SkillId, SkillId, SkillId, SkillId] };
export const TREES: Record<HeroClass, [Tab, Tab, Tab]> = {
  knight: [
    { name: '검술', skills: ['cleave', 'whirl', 'burst', 'execute'] },
    { name: '돌격', skills: ['dash', 'shout', 'trail', 'leap'] },
    { name: '투척', skills: ['throw', 'bounce', 'axes', 'axeStorm'] },
  ],
  wizard: [
    { name: '화염', skills: ['fireball', 'firefield', 'embers', 'comet'] },
    { name: '냉기', skills: ['frost', 'ward', 'frostArmor', 'blizzard'] },
    { name: '번개', skills: ['lightning', 'chain', 'static', 'tempest'] },
  ],
  ranger: [
    { name: '사격', skills: ['pierce', 'spread', 'crit', 'focus'] },
    { name: '사냥', skills: ['trap', 'push', 'snare', 'hunt'] },
    { name: '하늘', skills: ['rain', 'fireRain', 'downpour', 'arrowStorm'] },
  ],
  necromancer: [
    { name: '소환', skills: ['bones', 'giant', 'boneMastery', 'lord'] },
    { name: '저주', skills: ['curse', 'plague', 'curseMastery', 'corpseBlast'] },
    { name: '뼈', skills: ['spear', 'boneArmor', 'drain', 'prison'] },
  ],
};
// 스킬 → 직업·탭·단계(0~3). 단계 2는 패시브(칸에 끼우지 않고 배우기만 하면 늘 켜져 있다)
export const SKILLS = Object.fromEntries(
  (Object.keys(TREES) as HeroClass[]).flatMap((cls) => TREES[cls].flatMap((t, tab) => t.skills.map((id, tier) => [id, { cls, tab, tier }]))),
) as Record<SkillId, { cls: HeroClass; tab: number; tier: number }>;
export const isPassive = (id: SkillId) => SKILLS[id].tier === 2;
// 단계별로 배울 수 있는 레벨. 아래 단계(같은 탭)를 1 이상 배워야 다음 단계가 열린다
export const TIER_LEVEL = [1, 4, 8, 12];
export const SYNERGY = 0.08; // 같은 탭의 다른 스킬에 찍은 포인트 1마다 이 스킬 피해 +8%
export const RESPEC = 100; // 스킬 포인트 전부 되돌리기(금화)
// 새 판에서 Q에 끼워 주는 1단계 스킬(첫 탭의 첫 스킬)
export const startSkill = (cls: HeroClass) => TREES[cls][0].skills[0];

export type State = 'idle' | 'move' | 'attack' | 'dead';

export type Command =
  | { type: 'move'; x: number; z: number }
  | { type: 'amove'; x: number; z: number } // 공격 이동: 가면서 가까운 적을 공격하고, 다 잡으면 다시 간다
  | { type: 'attack'; targetId: number }
  | { type: 'drink' }
  | { type: 'skill'; x?: number; z?: number } // 가르기. (x, z)가 있으면 그쪽으로
  | { type: 'open'; chestId: number } // 상자 열기(걸어가서)
  | { type: 'dash'; x?: number; z?: number } // 돌진 베기. (x, z)가 있으면 그쪽으로
  | { type: 'shout'; x?: number; z?: number } // 전투의 함성(기사) · 낙뢰(마법사, (x, z)가 있으면 그 지점)
  | { type: 'roll'; x?: number; z?: number } // 구르기(무적). (x, z)가 있으면 그쪽으로, 없으면 가까운 적의 반대쪽
  | { type: 'throw'; x?: number; z?: number } // 도끼 던지기. (x, z)가 있으면 그쪽으로
  | { type: 'learn'; skill: SkillId } // 스킬 포인트로 단계 올리기(처음 배운 액티브는 빈 칸에 끼운다)
  | { type: 'bind'; key: SkillName; skill: SkillId } // 스킬을 칸에 끼운다(다른 칸에 있었으면 맞바꾼다)
  | { type: 'respec' }; // 금화 RESPEC으로 스킬 포인트를 모두 되돌린다
// 스킬 칸 Q W E R(코드 이름은 명령 skill·dash·shout·throw에 맞춘 옛 이름). 칸마다 재사용 대기 필드가 따로다(KEY_CD)
export type SkillName = 'cleave' | 'dash' | 'shout' | 'throw';
export const KEYS: SkillName[] = ['cleave', 'dash', 'shout', 'throw'];
export const KEY_CD = { cleave: 'skillCd', dash: 'dashCd', shout: 'shoutCd', throw: 'throwCd' } as const;
export const KEY_LABEL: Record<SkillName, string> = { cleave: 'Q', dash: 'W', shout: 'E', throw: 'R' };

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
  eliteKind?: EliteKind; // 정예의 특성(createWorld가 정한다)
  skin?: Skin; // 초원·설원의 몬스터: 원형(kind)은 그대로, 그림·이름·수치가 다르다
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

// 강령술사의 소환수(해골 검사·궁수·법사, 시체 거인, 해골 왕): life초 뒤 사라진다
export type Ally = Entity & { life: number; lifeMax: number; mult: number; reach: number; interval: number; splash?: number; from?: SkillId }; // mult: 한 대 배율(× 강령술사 굴림), splash: 맞은 적 둘레도 함께, from: 부른 스킬(다시 쓰면 그 스킬의 소환수는 물러난다)

// 소품(칸 좌표). 막힘은 grid에 있고, 이것은 렌더용 기록이다
export type Prop = { kind: 'brazier' | 'prop' | 'debris'; x: number; z: number };

// 장비 부위
export type Slot = 'weapon' | 'armor' | 'helm' | 'boots';
export const SLOTS: Slot[] = ['weapon', 'armor', 'helm', 'boots'];
// 바닥에 떨어진 아이템(월드 좌표). tier: 장비 단계 1~4(물약은 0)
// amount: 금화 양(금화만)
export type Item = { id: number; x: number; z: number; kind: 'potion' | 'gold' | Slot; tier: number; amount?: number; affixes?: Affix[] };
// 마법 옵션. value는 정수(효과 단위는 AFFIXES 설명)
// skill·tab·allSkills = 스킬 단계 보너스(skill: 대상 스킬, tab: 대상 탭 0~2), unique = 고유 장비(전설·세트) 표식(u)
export type AffixKind = 'dmg' | 'speed' | 'leech' | 'crit' | 'life' | 'guard' | 'regen' | 'thorns' | 'move' | 'skill' | 'tab' | 'allSkills' | 'unique';
export type Affix = { kind: AffixKind; value: number; skill?: SkillId; tab?: number; u?: UniqueId };

// 고유 장비(전설·세트). 설계: docs/superpowers/specs/2026-11-16-legendary-design.md
export type UniqueId = 'boomerang' | 'splitOrb' | 'hawkHood' | 'boneShroud' | 'duelist' | 'emberStep' | 'berserker' | 'crownless' | 'hunterWeapon' | 'hunterArmor' | 'hunterHelm' | 'hunterBoots';
// name의 %는 그 단계의 기본 이름. cls: 그 직업일 때만 떨어진다. fixed: 고정 옵션(tab = 탭 하나 +1, tier1 = 1단계 스킬 하나 +1을 드롭 때 굴림).
// look: 입으면 그 부위 레이어를 이 원색으로. desc: 고유 효과(세트 조각은 비움 — 세트 효과는 SET_HUNTER)
export const UNIQUES: Record<UniqueId, { name: string; slot: Slot; cls?: HeroClass; set?: true; fixed: (Affix | 'tab' | 'tier1')[]; look?: string; desc: string }> = {
  boomerang: { name: '돌아오는 도끼날', slot: 'weapon', cls: 'knight', fixed: [{ kind: 'skill', value: 2, skill: 'throw' }], desc: '도끼 던지기의 도끼가 끝에서 돌아오며 한 번 더 맞힌다' },
  splitOrb: { name: '쪼개지는 구슬', slot: 'weapon', cls: 'wizard', fixed: [{ kind: 'skill', value: 2, skill: 'fireball' }], look: '#e8261c', desc: '화염구가 터지면 작은 화염구 3개가 사방으로 퍼진다' },
  hawkHood: { name: '매의 눈 두건', slot: 'helm', cls: 'ranger', fixed: [{ kind: 'skill', value: 2, skill: 'pierce' }], look: '#1fb83c', desc: '관통 사격이 벽에 닿으면 한 번 튕긴다' },
  boneShroud: { name: '뼈 왕의 수의', slot: 'armor', cls: 'necromancer', fixed: [{ kind: 'skill', value: 2, skill: 'bones' }], desc: '해골 병사가 2마리 더 서고, 쓰러지면 그 자리가 터진다' },
  duelist: { name: '결투자의 투구', slot: 'helm', fixed: ['tab'], look: '#1f5fe8', desc: '받아치기에 성공하면 모든 스킬 재사용 대기 −1초, 기력·마나 +15' },
  emberStep: { name: '불꽃 걸음', slot: 'boots', fixed: ['tab'], desc: '구른 길에 2초 동안 불길이 남는다' },
  berserker: { name: '광전사의 손잡이', slot: 'weapon', fixed: ['tier1'], desc: '잃은 체력만큼 공격 속도·스킬 피해 증가(최대 +40%)' },
  crownless: { name: '왕관 없는 왕의 망토', slot: 'armor', fixed: [{ kind: 'allSkills', value: 1 }], look: '#f5c400', desc: '모든 스킬 +1, 대신 최대 체력 −15%' },
  hunterWeapon: { name: '정예 사냥꾼의 %', slot: 'weapon', set: true, fixed: [{ kind: 'dmg', value: 20 }], desc: '' },
  hunterArmor: { name: '정예 사냥꾼의 흉갑', slot: 'armor', set: true, fixed: [{ kind: 'life', value: 25 }], desc: '' },
  hunterHelm: { name: '정예 사냥꾼의 가면', slot: 'helm', set: true, fixed: ['tab'], desc: '' },
  hunterBoots: { name: '정예 사냥꾼의 장화', slot: 'boots', set: true, fixed: [{ kind: 'move', value: 8 }], desc: '' },
};
export const UNIQUE_LIST = Object.keys(UNIQUES) as UniqueId[];
// 등급 색(index.html의 --legend·--set과 같다): 빛기둥·지도 점
export const UNIQUE_COLOR = { legend: '#ff8c1a', set: '#3fdc5a' };
// 고유 장비 드롭: 정예(+ 운 보정, 실패마다 pity만큼 쌓임), 해골 왕·보스, 상자. 성공하면 세트 조각 set 확률, 세트는 없는 부위 missing 확률
export const LEGEND_DROP = { elite: 0.06, pity: 0.01, boss: 0.25, chest: 0.01, set: 0.4, missing: 0.7, price: 100 };
// 정예 사냥꾼 세트: 2부위 = 정예·보스 피해 배율·정예 처치 시 자원, 4부위 = 정예를 잡으면 그 특성을 time초(흡혈 leech, 폭발 반경·배율, 통솔 배율, 분열 해골 수명·최대)
export const SET_HUNTER = { dmg: 1.25, res: 30, time: 20, leech: 0.1, blastR: 1.2, blastMult: 1.5, aura: 1.3, allyLife: 10, allyMax: 3 };
// 전설 효과 수치
export const LEGEND_FX = { orbs: 3, orbMult: 0.4, bones: 2, boneBlastR: 1.2, boneBlast: 1.5, duelCd: 1, duelRes: 15, emberTime: 2, rage: 0.4, cloakHp: 0.85 };

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
export type Gate = { id: number; x: number; z: number; axis: 'x' | 'z'; open: boolean; guards: number[] }; // guards: 문 앞을 지키는 몬스터 id(모두 쓰러지면 사슬이 풀린다)
// 봉인 문: 주인공 쪽에서 닿는 몬스터 중 문에서 radius m 안의 것들이 문지기(적으면 가까운 순으로 min마리까지 채운다)
export const SEAL = { radius: 10, min: 3 };

// 보물 상자(칸 좌표). 한 번 열면 끝
export type Chest = { id: number; x: number; z: number; open: boolean };

// 날아가는 화살. (dx, dz) 단위 방향, dmg는 쏠 때 굴린 값, left는 남은 비행 거리(m)
// hit: 관통 도끼(5단계)·관통 화염구가 이미 맞힌 적 id
// 주인공 것(몬스터만 맞음): axe = 도끼, bolt = 마법사 마력탄(평타), fireball = 마법사 화염구
export type Shot = { id: number; x: number; z: number; dx: number; dz: number; dmg: number; left: number; kind: 'arrow' | 'fire' | 'axe' | 'bolt' | 'fireball' | 'shaft' | 'pierce'; hit?: number[]; bounce?: number; through?: boolean; push?: boolean; wait?: number; back?: boolean; small?: boolean; ricochet?: boolean }; // back: 돌아오는 도끼날로 되돌아오는 중, small: 쪼개진 작은 화염구, ricochet: 매의 눈 두건으로 이미 튕김 // bounce: 남은 튕김(튕기는 도끼), through: 맞혀도 계속 난다(도끼 5단계·도끼 폭풍), push: 밀쳐내기 사격, wait: 이 시간(초) 동안 주인공 자리에서 기다렸다 난다. shaft = 궁수 화살, pierce = 관통 사격·뼈 창

// 스킬 연계 기록(렌더용 글자). counter = 받아치기, stunned = 약점, reset = 돌진 → 가르기 준비. age초 뒤 지운다
export type Combo = { id: number; x: number; z: number; kind: 'counter' | 'stunned' | 'back' | 'reset' | 'dodge'; age: number }; // back = 공포로 도망치는 적

// 돌진 '불길'이 남긴 불타는 길(선분). t초 동안, acc가 TRAIL.tick을 넘을 때마다 길 위의 적에게 피해
// r: 폭(반경), mult: 한 번 피해 배율(× 주인공 굴림). 불바다·잔불·운석은 점(x0 = x1)에 넓은 r
export type Fire = { id: number; x0: number; z0: number; x1: number; z1: number; t: number; acc: number; r: number; mult: number };

// 화염구 폭발 기록(렌더·소리용). age초 뒤 지운다
// slam = 전사 내려찍기가 떨어진 자리, 나머지는 마법사: thunder 낙뢰, spark 연쇄 번개, frost 서리 고리(시전자), ice 얼어붙은 적, blink 순간이동, heal 치유, nova 방패 폭발
export type Blast = { id: number; x: number; z: number; r?: number; age: number; kind: 'fire' | 'slam' | 'thunder' | 'spark' | 'frost' | 'ice' | 'blink' | 'heal' | 'nova' | 'trap' | 'rain' | 'curse' };

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
  amove: Point | null; // 공격 이동의 목적지(null = 아님)
  queued: Command | null; // 구르기·돌진·스킬 시전 중에 받은 이동·공격 명령(끝나면 따른다)
  castT: number; // 스킬 시전으로 발이 묶인 남은 시간(초)
  props: Prop[];
  chests: Chest[];
  gates: Gate[];
  skins?: Partial<Record<Kind, Skin>>; // 이 맵의 몬스터 스킨(없으면 해골)
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
  storm: { x: number; z: number; t: number; r: number; mult: number }[]; // 천둥 폭풍: t초 뒤 떨어질 벼락(반경 r 안 적에게 굴림 × mult, 잠깐 기절)
  traps: { id: number; x: number; z: number; mult: number; keep?: boolean }[]; // 궁수가 놓은 덫(오래된 것부터). keep = 사냥터 덫(개수 제한에 세지 않는다)
  focusT: number; // 궁수 집중 남은 시간(초)
  allies: Ally[]; // 강령술사의 해골 병사(entities 밖, id는 음수. 몬스터가 노리고 때린다)
  curses: { id: number; x: number; z: number; r: number; t: number; acc: number; amp: number; plague: number }[]; // 표식·역병 구역(t초 남음). amp = 받는 피해 증가(0 = 역병, 소환수가 노리지 않는다), plague = 0.5초마다 피해 배율, acc = 그 누적
  raised: number[]; // 저주(5단계)로 이미 일으킨 시체 id
  volleys: { x: number; z: number; r: number; t: number; left: number; mult: number; later: number; blast: 'rain' | 'fire'; burn?: number }[]; // 떨어질 화살비·운석(t초 뒤, left번 남음, 처음엔 굴림 × mult, 그 뒤로는 × later). burn: 떨어진 자리가 이 반경으로 불탄다
  shouts: number; // 함성 횟수(렌더·소리용)
  casts: number; // 마법사 스킬 시전 횟수(렌더용: 시전 동작)
  throwCd: number; // 도끼 던지기 재사용까지(초)
  rollCd: number; // 구르기 재사용까지(초)
  pity: number; // 고유 장비 운 보정: 정예를 잡고 못 얻을 때마다 쌓이는 확률(얻으면 0). 층·저장으로 넘긴다
  trophies: Partial<Record<EliteKind, number>>; // 정예 사냥꾼 4부위: 잡은 정예에게서 얻은 특성의 남은 초
  res: number; // 기력·마나(직업에 따라 RESOURCE). 스킬 비용을 내고 저절로 찬다. 층 시작·레벨업 때 가득
  ranks: Partial<Record<SkillId, number>>; // 배운 스킬의 단계 1~RANK_MAX(없으면 안 배움). 새 판은 첫 탭 1단계 스킬만 1(startSkill)
  points: number; // 남은 스킬 포인트(레벨업마다 1)
  keys: Record<SkillName, SkillId | null>; // 칸 Q W E R에 끼운 액티브 스킬
  cdFull: Record<SkillName, number>; // 칸마다 마지막으로 건 재사용 대기(HUD의 남은 비율)
  trail: number; // 지금 돌진이 늘이는 불길(fires의 id, -1 = 없음)
  auraT: number; // 눈보라 남은 시간(초)
  auraAcc: number; // 눈보라 다음 타격까지 쌓인 시간
  spinT: number; // 회오리 남은 시간(초)
  spinAcc: number; // 회오리 다음 타격까지 쌓인 시간
  impacts: number; // 스킬이 적을 맞힌 누적 횟수(렌더용: 멈춤·흔들림)
};

export const DT = 1 / 60;

export const RANGE = 1.5;

// 몬스터 데미지 = 기본 × (1 + (층 배율 − 1) × DMG_SCALE) × MONSTER_DMG. 1~2층은 거의 그대로, 깊을수록 가파르게
// (마법 옵션·스킬 도입 후 봇 테스트로 정함: 5층 ×2.2. 스킬을 쓰면 확실히 덜 죽게)
export const DMG_SCALE = 2;
export const MONSTER_DMG = 3.25; // 공통 배율(밸런스 손잡이). 사용자가 해 보고 "너무 쉽다" → 2.5에서 3.25. 그 전: 투구·신발이 생기면서 2 → 2.5(봇 사망 수를 그 전과 맞춤)
export const ELITE = { hp: 3, dmg: 1.3, xp: 4, chance: 0.1 }; // chance: 몬스터 하나가 정예로 나올 확률
// 정예 특성: 이름(접두어)·설명·색(스프라이트·발밑 고리·대상 이름).
// 신속 = 이동·공격 속도 배수, 흡혈 = 주인공에게 준 피해의 배수만큼 회복, 폭발 = 죽은 자리에 예고 후 폭발(굴림 × mult),
// 통솔 = 반경 안의 다른 몬스터 데미지 배수, 분열 = 죽으면 졸개 count마리
export type EliteKind = 'swift' | 'vampiric' | 'volatile' | 'warlord' | 'splitting';
export const ELITE_KINDS: Record<EliteKind, { name: string; desc: string; color: string }> = {
  swift: { name: '신속한', desc: '빠르게 움직이고 빠르게 친다', color: '#5fd0ff' },
  vampiric: { name: '흡혈의', desc: '때릴 때마다 체력을 회복한다', color: '#ff4d6a' },
  volatile: { name: '폭발하는', desc: '죽은 자리가 잠시 뒤 폭발한다', color: '#ff9a2e' },
  warlord: { name: '통솔하는', desc: '주변 몬스터의 공격이 강해진다', color: '#ffd84a' },
  splitting: { name: '분열하는', desc: '죽으면 졸개 둘로 갈라진다', color: '#8de05a' },
};
export const ELITE_KIND_LIST = Object.keys(ELITE_KINDS) as EliteKind[];
// 지역(맵의 종류)과 그곳의 몬스터. 스킨 = 전투 원형(졸개·전사·마법사)에 그림·이름을 바꾸고 체력·이동 속도에 배율을 곱한 것
export type Land = 'dungeon' | 'field' | 'snow';
export type Skin = 'goblin' | 'goblin_elite' | 'fire_ant' | 'ice_ant' | 'zombie' | 'antlion' | 'wyvern';
export const SKINS: Record<Skin, { name: string; hp: number; speed: number }> = {
  goblin: { name: '고블린', hp: 0.8, speed: 1.25 }, // 약하지만 빠르고 떼로 온다
  goblin_elite: { name: '고블린 전사', hp: 0.9, speed: 1.15 },
  fire_ant: { name: '불개미', hp: 1.2, speed: 1 }, // 불을 뱉는다(마법사 원형)
  ice_ant: { name: '얼음 개미', hp: 1.2, speed: 0.9 },
  zombie: { name: '얼어붙은 시체', hp: 1.5, speed: 0.75 }, // 느리지만 질기다
  antlion: { name: '개미귀신', hp: 1.1, speed: 1 }, // 초원의 보스
  wyvern: { name: '서리 와이번', hp: 0.9, speed: 1.15 }, // 설원의 보스: 날래다
};
export const LANDS: Record<Land, { name: string; unit: string; skins: Partial<Record<Kind, Skin>> }> = {
  dungeon: { name: '지하', unit: '층', skins: {} },
  field: { name: '초원', unit: '구역', skins: { minion: 'goblin', warrior: 'goblin_elite', mage: 'fire_ant', boss: 'antlion' } },
  snow: { name: '설원', unit: '구역', skins: { minion: 'ice_ant', warrior: 'zombie', boss: 'wyvern' } },
};
export const LAND_LIST = Object.keys(LANDS) as Land[];
export const bossName = (skins: World['skins']) => (skins?.boss ? SKINS[skins.boss].name : STATS.boss.name);
export const monsterName = (e: Entity) => (e.skin ? SKINS[e.skin].name : STATS[e.kind].name);
export const ELITE_FX = { swiftMove: 1.35, swiftAttack: 1.25, leech: 2, blastDelay: 1.2, blastMult: 1.5, auraRange: 5, auraDmg: 1.3, split: 2 };
// 마법 옵션: 붙는 부위들, 이름(접두어), 값 범위. dmg·speed·leech·crit·guard·thorns·move는 %, life는 체력, regen은 초당 1/10.
// 여러 부위에 붙은 같은 옵션은 더한다
// skill은 이름(접두어) 없이 줄로만 보인다. special = 무작위 옵션 후보가 아니다(탭은 희귀가 따로 굴리고, 모든 스킬·고유는 전설만)
export const AFFIXES: Record<AffixKind, { slots: Slot[]; name: string; lo: number; hi: number; special?: true }> = {
  dmg: { slots: ['weapon'], name: '날카로운', lo: 15, hi: 30 },
  speed: { slots: ['weapon'], name: '신속한', lo: 8, hi: 15 },
  leech: { slots: ['weapon'], name: '흡혈의', lo: 4, hi: 8 },
  crit: { slots: ['weapon'], name: '치명적인', lo: 8, hi: 15 },
  life: { slots: ['armor', 'helm', 'boots'], name: '튼튼한', lo: 15, hi: 30 },
  guard: { slots: ['armor', 'helm'], name: '단단한', lo: 5, hi: 10 },
  regen: { slots: ['armor', 'boots'], name: '재생의', lo: 5, hi: 15 },
  thorns: { slots: ['armor', 'helm'], name: '가시', lo: 20, hi: 40 },
  move: { slots: ['boots'], name: '날랜', lo: 5, hi: 10 },
  skill: { slots: ['weapon', 'armor', 'helm', 'boots'], name: '', lo: 1, hi: 2 },
  tab: { slots: ['weapon', 'armor', 'helm', 'boots'], name: '', lo: 1, hi: 1, special: true },
  allSkills: { slots: ['weapon', 'armor', 'helm', 'boots'], name: '', lo: 1, hi: 1, special: true },
  unique: { slots: ['weapon', 'armor', 'helm', 'boots'], name: '', lo: 0, hi: 0, special: true },
};
// 스킬 옵션 굴림: 희귀(옵션 2개)는 tab 확률로 옵션 하나를 탭 +1로, 스킬 +2는 희귀에서 two 확률
export const SKILL_AFFIX = { tab: 0.15, two: 0.25 };
// 초월: 장비 보너스로 RANK_MAX 위로 오를 수 있는 단계 수
export const RANK_OVER = 2;
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
export const WHIRL = { cd: 6, time: 2, extra: 1, tick: 0.25, mult: 0.4 }; // 회오리(검술 2): 재사용, 시간, 5단계 추가 시간, 타격 간격, 타격당 배율
export const BURST = { radius: 1.6, hp: 0.3 }; // 시체 폭발(검술 패시브): 반경, 피해(시체 최대 체력 비율, 단계마다 +0.05). 가르기·회오리·처형으로 죽은 적
export const EXECUTE = { cd: 8, reach: 2.5, below: 0.3, mult: 2.5, fear: 3, fearR: 4 }; // 처형(검술 궁극): 재사용, 닿는 거리, 즉사 체력 비율(단계마다 +0.03), 아니면 배율, 처치 시 주변 공포(시간·반경)
export const TRAIL = { time: 3, tick: 0.5, width: 0.8, mult: 0.35 }; // 불길(돌격 패시브): 유지 시간, 피해 간격, 길 폭(반경), 한 번 피해 배율(단계마다 +25%). 불바다·잔불·운석도 같은 간격
export const LEAP = { cd: 10, range: 6, radius: 2.5, mult: 2, stun: 1 }; // 대지 강타(돌격 궁극): 재사용, 뛰는 거리, 착지 반경, 배율, 기절

export const BOUNCE = { cd: 4, count: 3, range: 5, mult: 1 }; // 튕기는 도끼(투척 2): 재사용, 튕김 횟수(5단계 두 배), 다음 적을 찾는 거리, 배율
export const AXES = { cd: 0.06, dmg: 0.1 }; // 도끼 숙련(투척 패시브): 단계마다 도끼 스킬 재사용 대기 −6%, 피해 +10%
export const AXE_STORM = { cd: 12, count: 8, mult: 1 }; // 도끼 폭풍(투척 궁극): 재사용, 도끼 수(단계마다 +1), 배율
export const KNOCK = { cleave: 0.9, dash: 0.7, axe: 0.6, shout: 0.4 }; // 스킬에 맞은 적이 밀려나는 거리(m)
export const SHOUT = { cd: 15, radius: 4, stun: 2, time: 6, reduce: 0.3, heal: 0.15 }; // 전투의 함성: 재사용, 범위, 기절, 피해 감소 시간·비율, 5단계의 회복(최대 체력 비율)
export const AXE = { cd: 2.5, speed: 12, flight: 8, hit: 0.5, mult: 1.2, aim: 8, gate: 3 }; // 도끼 던지기: 재사용, 속도, 비행 거리, 맞는 반경, 배율, 자동 조준(적), 자동 조준(닫힌 문)
export const DASH = { cd: 6, dist: 5, speed: 14, hit: 1, aim: 6 }; // 돌진 베기: 재사용, 거리, 속도, 길 폭(반경), 자동 조준 거리

// 구르기: 재사용, 거리, 속도(거리 ÷ 속도 = 무적 시간), 조준이 없을 때 피할 적을 찾는 거리
// on: false = 구르기(마법사 순간이동)를 막아 둔 실험(입력·봇이 명령을 내지 않는다. sim은 그대로)
export const ROLL = { on: true, cd: 2.5, dist: 3, speed: 9, away: 4 };

// 기력·마나(롤식 자원): 스킬을 쓰면 비용만큼 줄고 저절로 찬다. 재사용 대기는 그대로, 비용이 더해진다. 평타·구르기는 무료
export type ResourceKind = 'energy' | 'mana';
export const RESOURCE: Record<HeroClass, ResourceKind> = { knight: 'energy', ranger: 'energy', wizard: 'mana', necromancer: 'mana' };
export const ENERGY = { max: 100, regen: 10 }; // 기력: 고정, 빨리 찬다(10초면 가득)
export const MANA = { max: 100, perLevel: 8, regen: 4, regenPerLevel: 0.2 }; // 마나: 레벨마다 늘고 천천히 찬다
// 비용 기본값: 트리 등급(SKILLS[id].tier)으로. 패시브는 0. 특별한 스킬만 COST_OVERRIDE로
export const TIER_COST: Record<ResourceKind, { tier1: number; tier2: number; ultimate: number }> = {
  energy: { tier1: 16, tier2: 24, ultimate: 36 }, // 봇 30판: 시작값(20·30·45 / 25·40·70)이면 마법사 클리어 21 → 2, ×0.8로 11
  mana: { tier1: 20, tier2: 32, ultimate: 56 },
};
export const COST_OVERRIDE: Partial<Record<SkillId, number>> = {};
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

// 공격 이동 중 적을 알아채는 거리(m). 벽 너머는 보지 못한다
export const AMOVE = 7;
export const CAST = 0.3; // 바로 나가는 스킬(던지기·함성·마법 등)을 쓰면 이만큼(초) 서서 시전한다. 가르기는 휘두르는 동안, 구르기는 시전을 끊는다

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
  // 강령술사: 마법사와 같은 지팡이·로브 수치(해골이 따로 친다), 체력은 조금 더
  necromancer: {
    name: '강령술사',
    hp: 75,
    perLevel: 7,
    weapons: named([{ dmg: [4, 7], interval: 0.7 }, { dmg: [5, 9], interval: 0.8 }, { dmg: [7, 11], interval: 0.9 }, { dmg: [9, 14], interval: 1.0 }] as typeof WEAPONS, ['뼈 완드', '해골 막대', '강령 지팡이', '죽음의 대지팡이']),
    armors: named([{ reduce: 0 }, { reduce: 0.05 }, { reduce: 0.12 }, { reduce: 0.2 }] as typeof ARMORS, ['수의', '강령 로브', '묘지기 로브', '죽음의 로브']),
    helms: named(HELMS, ['천 머리띠', '강령 두건', '묘지기 두건', '죽음의 두건']),
    boots: named(BOOTS, ['샌들', '강령 장화', '묘지기 장화', '죽음의 장화']),
  },
};
// 부위별 단계 표(이름·수치)
export const gearTable = (cls: HeroClass): Record<Slot, { name: string }[]> => ({ weapon: CLASSES[cls].weapons, armor: CLASSES[cls].armors, helm: CLASSES[cls].helms, boots: CLASSES[cls].boots });

// 마법사. 마력탄(평타): 사거리, 속도, 비행 거리, 맞는 반경
export const WIZ = { range: 6.5, speed: 12, flight: 8, hit: 0.45 };
// 화염구(Q): 재사용, 속도, 비행 거리, 맞는 반경, 폭발 반경, 배율, 5단계 세 갈래 각도(라디안), 자동 조준 거리
export const FIREBALL = { cd: 5, speed: 11, flight: 9, hit: 0.5, radius: 1.6, mult: 1.5, spread: 0.3, aim: 8 };
// 서리 고리(냉기 1): 재사용, 반경, 얼리는 시간, 배율
export const FROST = { cd: 9, radius: 3.5, freeze: 1.2, mult: 0.8 };
// 서리 갑옷(냉기 패시브): 서리 고리·마나 방패·눈보라를 쓰면 time초 동안 받는 피해 −(reduce + per × (단계 − 1))
export const FROST_ARMOR = { time: 5, reduce: 0.15, per: 0.04 };
// 눈보라(냉기 궁극): 재사용, 시간, 반경, 타격 간격, 배율, 맞은 적을 얼리는 시간
export const BLIZZARD = { cd: 15, time: 6, radius: 3, tick: 0.5, mult: 0.4, freeze: 0.3 };
// 낙뢰(번개 1): 재사용, 사거리, 반경, 배율, 기절
export const BOLT = { cd: 6, range: 8, radius: 1.4, mult: 1.6, stun: 0.6 };
// 연쇄 번개(번개 2): 재사용, 튀는 횟수(2단계마다 +1), 찾는 거리, 배율, 튈 때 배율
export const CHAIN = { cd: 7, count: 3, range: 4, mult: 1.4, hop: 0.6 };
// 정전기(번개 패시브): 마력탄이 맞은 적에서 range 안의 적에게 튄다(3단계부터 둘). 배율 mult + 단계마다 0.08
export const STATIC = { range: 3.5, mult: 0.3 };
// 천둥 폭풍(번개 궁극): 재사용, 사거리, 반경, 벼락 수, 걸리는 시간, 벼락 하나의 반경·배율·기절
export const TEMPEST = { cd: 16, range: 8, radius: 3.5, strikes: 10, time: 2.5, hit: 1.2, mult: 1, stun: 0.3 };
// 마나 방패(냉기 2): 재사용, 시간, 흡수(최대 체력 비율), 막은 피해 반사 비율, 5단계 폭발(반경·배율)
export const WARD = { cd: 15, time: 6, absorb: 0.2, reflect: 0.3, nova: 2.5, novaMult: 1.2 };
// 불바다(화염 2): 재사용, 사거리, 반경, 시간, 한 번 피해 배율. 잔불(화염 패시브): 화염구 폭발 자리가 반경 r로 time + 0.5 × (단계 − 1)초 탄다
export const FIREFIELD = { cd: 8, range: 8, radius: 1.8, time: 4, mult: 0.35 };
export const EMBERS = { radius: 1, time: 2, mult: 0.3 };
// 운석(화염 궁극): 재사용, 사거리, 떨어지기까지, 반경, 배율, 떨어진 자리가 타는 시간
export const COMET = { cd: 12, range: 9, delay: 1, radius: 2.2, mult: 3, burn: 3 };
// 순간이동(스페이스): 재사용, 거리, 무적 시간(초)
export const BLINK = { cd: 3, dist: 5, guard: 0.25 };

// 궁수. 화살(평타): 사거리, 속도, 비행 거리, 맞는 반경. 명사수: far m 넘게 떨어진 적에게 주는 피해 ×farMult
export const RANGER = { range: 7.5, speed: 14, flight: 9, hit: 0.4, far: 5, farMult: 1.25 };
// 관통 사격(사격 1): 재사용, 배율, 속도, 비행 거리, 맞는 반경, 5단계 두 번째 화살 대기(초), 자동 조준 거리. 뼈 창도 같은 화살로 난다
export const PIERCE = { cd: 5, mult: 1.8, speed: 16, flight: 10, hit: 0.5, wait: 0.15, aim: 9 };
// 세 갈래(사격 2): 재사용, 배율, 벌어지는 각도(라디안), 5단계 화살 수. 밀쳐내기 사격(사냥 2): 재사용, 배율, 미는 거리, 벽에 부딪힌 기절
export const SPREAD = { cd: 6, mult: 1.2, angle: 0.25, max: 5 };
export const PUSH = { cd: 6, mult: 1, dist: 1.2, stun: 1.5 };
export const CRIT = { chance: 0.06 }; // 치명(사격 패시브): 단계마다 화살이 2배 피해일 확률
// 덫(사냥 1): 재사용, 놓는 사거리, 밟는 반경, 묶는 시간, 배율, 최대 개수, 5단계(주변도 묶음)·덫 숙련 폭발 범위
export const TRAP = { cd: 6, range: 6, trigger: 0.6, hold: 1.5, mult: 1.2, max: 2, radius: 1.8 };
// 덫 숙련(사냥 패시브): 덫 하나 더, 묶는 시간 단계마다 +10%, 닫힐 때 TRAP.radius 안 적에게 덫 피해 × (blast + 0.1 × (단계 − 1))
export const SNARE = { hold: 0.1, blast: 0.5 };
// 사냥터(사냥 궁극): 재사용, 사거리, 덫 수, 둥글게 까는 반경, 덫 배율
export const HUNT = { cd: 14, range: 6, count: 6, ring: 2, mult: 1.2 };
// 화살비(하늘 1): 재사용, 사거리, 반경, 떨어지기까지(초), 배율, 5단계 반경 배수
export const RAIN = { cd: 8, range: 8, radius: 1.8, delay: 0.6, mult: 1.6, big: 1.3 };
// 불화살(하늘 2): 재사용, 배율. 폭우(하늘 패시브): 화살비가 ceil(단계 / 2)번 더 every초마다, 한 번에 mult배
export const FIRE_RAIN = { cd: 9, mult: 1.2 };
export const DOWNPOUR = { every: 0.6, mult: 0.5 };
// 화살 폭풍(하늘 궁극): 재사용, 화살비 수, 퍼지는 반경(주인공 둘레), 걸리는 시간, 하나의 반경·배율
export const ARROW_STORM = { cd: 16, count: 10, spread: 6, time: 2, radius: 1.5, mult: 1 };
// 집중(사격 궁극): 재사용, 시간, 공격 속도 증가, 화살 두 발의 각도(라디안), 5단계 처치당 재사용 감소(초)
export const FOCUS = { cd: 14, time: 6, speed: 0.4, spread: 0.15, kill: 1 };

// 강령술사. 평타(뼈 화살)는 마법사 마력탄(WIZ)과 같다.
// 해골 소환(소환 1): 재사용, 소환 수(3단계 +1, 5단계 +1. 최대 수는 +2), 유지(초), 배율(× 강령술사 굴림), 공격 간격, 닿는 거리, 속도, 적을 찾는 거리
export const BONES = { cd: 6, count: 2, hp: 0.3, mult: 0.35, interval: 1.1, reach: 1.2, speed: 4.2, aggro: 8, archerAt: 2, mageAt: 4 }; // archerAt·mageAt: 궁수·법사가 섞이기 시작하는 단계
// 해골 숙련(소환 패시브): 단계마다 해골 피해 +12%·체력 +10%, at단계부터 한 기 더
export const BONE_MASTERY = { mult: 0.12, hp: 0.1, at: 3 };
// 해골 종류(검사 기준 체력·피해 배수, 공격 간격, 사거리). 궁수는 뼈 화살을 쏘고, 법사는 맞은 적 둘레(splash)도 함께 태운다
export const BONE_KINDS = { minion: { hp: 1, mult: 1, interval: 1.1, reach: 1.2 }, archer: { hp: 0.6, mult: 0.8, interval: 1.4, reach: 6 }, mage: { hp: 0.5, mult: 1.1, interval: 2.2, reach: 5, splash: 1.3 } };
// 시체 거인(소환 2): 재사용, 체력(주인공 최대 체력 비율), 배율, 공격 간격, 닿는 거리, 눈길을 끄는 반경, 5단계 폭발(반경·배율)
export const GIANT = { cd: 16, hp: 1, mult: 0.6, interval: 1.6, reach: 1.4, taunt: 6, burst: 2.5, burstMult: 2 };
// 죽음의 표식(저주 1, 코드에서는 curse — 소환수가 안의 적부터 노린다): 재사용, 사거리, 반경, 시간, 받는 피해 증가
export const CURSE = { cd: 9, range: 8, radius: 2.2, time: 6, amp: 0.35 };
// 역병(저주 2): 재사용, 사거리, 반경, 시간, 피해 간격, 한 번 배율. 표식 숙련(저주 패시브): 단계마다 표식 범위 +8%, 받는 피해 +5%p
export const PLAGUE = { cd: 8, range: 8, radius: 2.2, time: 6, tick: 0.5, mult: 0.3 };
export const CURSE_MASTERY = { radius: 0.08, amp: 0.05 };
// 시체 폭발(저주 궁극): 재사용, 사거리, 고르는 반경, 시체 하나가 터지는 반경, 피해(시체 최대 체력 비율)
export const CORPSE = { cd: 10, range: 8, radius: 3, blast: 2, hp: 0.4 };
// 해골 왕 강림(소환 궁극): 재사용, 유지, 체력(주인공 최대 체력 비율), 배율, 공격 간격, 닿는 거리, 휘두르는 둘레, 왕이 있는 동안 다른 소환수 피해 배수, 5단계 함께 오는 해골 수
export const LORD = { cd: 30, life: 12, hp: 1.5, mult: 1, interval: 1.4, reach: 1.5, splash: 1.5, aura: 1.3, guard: 2 };
// 뼈 창(뼈 1): 재사용, 배율. 뼈 갑옷(뼈 2): 재사용, 시간, 흡수(최대 체력 비율). 생명 흡수(뼈 패시브): 단계마다 준 피해의 2% 회복
export const SPEAR = { cd: 2.5, mult: 1.6 };
export const BONE_ARMOR = { cd: 15, time: 10, absorb: 0.25 };
export const DRAIN = { per: 0.02 };
// 뼈 감옥(뼈 궁극): 재사용, 사거리, 반경, 묶는 시간(보스·해골 왕은 big), 배율
export const PRISON = { cd: 14, range: 7, radius: 2.5, time: 2.5, big: 1, mult: 1 };

export const STATS: Record<Kind, { name: string; hp: number; dmg: [number, number]; interval: number; speed: number }> = {
  hero: { name: '기사', hp: 100, dmg: [8, 12], interval: 0.8, speed: 4 }, // 데미지·간격은 실제로는 장착 무기(WEAPONS)
  minion: { name: '스켈레톤 졸개', hp: 45, dmg: [3, 5], interval: 1.5, speed: 2.5 },
  warrior: { name: '스켈레톤 전사', hp: 90, dmg: [6, 9], interval: 2, speed: 2 },
  archer: { name: '스켈레톤 궁수', hp: 38, dmg: [4, 7], interval: 1.8, speed: 2.2 },
  mage: { name: '스켈레톤 마법사', hp: 33, dmg: [5, 8], interval: 2.4, speed: 2 },
  king: { name: '해골 왕', hp: 260, dmg: [9, 14], interval: 2, speed: 2.2 },
  boss: { name: '미노타우르스', hp: 500, dmg: [15, 24], interval: 1.8, speed: 2.4 },
};
