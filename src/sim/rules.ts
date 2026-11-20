// 게임 규칙의 타입과 수치표. 로직 없음.
import type { Cell, Grid } from './path';

export type Kind = 'hero' | 'minion' | 'warrior' | 'archer' | 'mage' | 'king' | 'boss';
// 주인공 직업. 직업마다 스킬 트리(탭 3~5개 × 4단계, TREES)가 있고, 배운 액티브 스킬을 스킬 칸 Q W E R(SkillName)에 끼워 쓴다.
// 스페이스는 구르기(마법사는 순간이동)
export type HeroClass = 'knight' | 'wizard' | 'ranger' | 'necromancer';

// 스킬 트리의 스킬. 탭마다 [1단계, 2단계, 패시브, 궁극기] 순서(TREES)
export type SkillId =
  | 'cleave' | 'whirl' | 'burst' | 'execute' | 'dash' | 'shout' | 'trail' | 'leap' | 'throw' | 'bounce' | 'axes' | 'axeStorm'
  | 'fireball' | 'firefield' | 'embers' | 'comet' | 'frost' | 'ward' | 'frostArmor' | 'blizzard' | 'lightning' | 'chain' | 'static' | 'tempest'
  | 'pierce' | 'spread' | 'crit' | 'focus' | 'trap' | 'push' | 'snare' | 'hunt' | 'rain' | 'fireRain' | 'downpour' | 'arrowStorm'
  | 'bones' | 'giant' | 'boneMastery' | 'lord' | 'curse' | 'plague' | 'curseMastery' | 'corpseBlast' | 'spear' | 'boneArmor' | 'drain' | 'prison'
  | 'mark' | 'graze' | 'echo' | 'flash'
  | 'flameEdge' | 'frostEdge' | 'reforge' | 'unleash'
  | 'afterimage' | 'swap' | 'lingering' | 'retrace'
  | 'swoop' | 'ride' | 'assist' | 'flock';
export type Tab = { name: string; skills: [SkillId, SkillId, SkillId, SkillId] };
export const TREES: Record<HeroClass, Tab[]> = {
  knight: [
    { name: '검술', skills: ['cleave', 'whirl', 'burst', 'execute'] },
    { name: '돌격', skills: ['dash', 'shout', 'trail', 'leap'] },
    { name: '투척', skills: ['throw', 'bounce', 'axes', 'axeStorm'] },
    { name: '발도', skills: ['mark', 'graze', 'echo', 'flash'] },
    { name: '벼림', skills: ['flameEdge', 'frostEdge', 'reforge', 'unleash'] },
  ],
  wizard: [
    { name: '화염', skills: ['fireball', 'firefield', 'embers', 'comet'] },
    { name: '냉기', skills: ['frost', 'ward', 'frostArmor', 'blizzard'] },
    { name: '번개', skills: ['lightning', 'chain', 'static', 'tempest'] },
    { name: '잔상', skills: ['afterimage', 'swap', 'lingering', 'retrace'] },
  ],
  ranger: [
    { name: '사격', skills: ['pierce', 'spread', 'crit', 'focus'] },
    { name: '사냥', skills: ['trap', 'push', 'snare', 'hunt'] },
    { name: '하늘', skills: ['rain', 'fireRain', 'downpour', 'arrowStorm'] },
    { name: '매', skills: ['swoop', 'ride', 'assist', 'flock'] },
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
  | { type: 'take'; itemId: number } // 바닥 장비 줍기(걸어가서). 장비는 밟기만 해서는 줍지 않는다
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
// 칼선(발도): 바닥의 선분들. t초 뒤 베인다. 그을 때 벤 적(hit)은 어디 있든, 그 순간 선 가까이 있는 적도 맞는다. src = 남긴 스킬
export type Cut = { id: number; segs: [x0: number, z0: number, x1: number, z1: number][]; t: number; mult: number; hit: number[]; src: SkillId };

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
  phase: 'none' | 'windup' | 'charge' | 'roll' | 'leap' | 'graze' | 'flash' | 'raise' | 'pray' | 'ride'; // roll = 주인공 구르기(phaseT 남은 거리), leap = 대지 강타 체공(phaseT 남은 시간), ride = 매 타기(phaseT 남은 시간)
  phaseT: number;
  cd: number;
  dx: number;
  dz: number;
  frost?: number; // 서리 칼에 맞은 횟수(벼림, 없으면 0)
  summoner: number; // 소환한 해골 왕의 id(-1 = 처음부터 있던 몬스터)
  stunT: number; // 기절 남은 시간(초). 기절 중엔 아무것도 하지 않는다
  fearT: number; // 공포 남은 시간(초). 주인공 반대쪽으로 도망친다
  asleep?: boolean; // 잠들어 있다(SLEEP): 생각도 행동도 하지 않는다
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
export type Item = { id: number; x: number; z: number; kind: 'potion' | 'gold' | 'rune' | 'relic' | Slot; tier: number; amount?: number; affixes?: Affix[]; rune?: Rune; relic?: number }; // rune: 룬(룬만), relic: 성물 번호(STORY 순서, 성물만)
// 마법 옵션. value는 정수(효과 단위는 AFFIXES 설명)
// skill·tab·allSkills = 스킬 단계 보너스(skill: 대상 스킬, tab: 대상 탭 0~4), unique = 고유 장비(전설·세트) 표식(u)
// socket = 소켓 수(장비마다 하나, 맨 뒤 쪽), keyCd = 칸(key)의 재사용 대기 −value%(칸 룬). r = 꽂힌 룬(그 룬이 주는 옵션 한 줄)
export type AffixKind = 'dmg' | 'speed' | 'leech' | 'crit' | 'life' | 'guard' | 'regen' | 'thorns' | 'move' | 'skill' | 'tab' | 'allSkills' | 'unique' | 'socket' | 'keyCd';
export type Affix = { kind: AffixKind; value: number; skill?: SkillId; tab?: number; u?: UniqueId; key?: SkillName; r?: Rune };

// 고유 장비(전설·세트). 설계: docs/superpowers/specs/2026-11-16-legendary-design.md
export type UniqueId = 'crackedHalo' | 'boomerang' | 'splitOrb' | 'hawkHood' | 'boneShroud' | 'duelist' | 'emberStep' | 'berserker' | 'crownless' | 'hunterWeapon' | 'hunterArmor' | 'hunterHelm' | 'hunterBoots';
// name의 %는 그 단계의 기본 이름. cls: 그 직업일 때만 떨어진다. fixed: 고정 옵션(tab = 탭 하나 +1, tier1 = 1단계 스킬 하나 +1을 드롭 때 굴림).
// look: 입으면 그 부위 레이어를 이 원색으로. desc: 고유 효과(세트 조각은 비움 — 세트 효과는 SET_HUNTER). only: 무작위 전설에 안 나온다(정해진 보스만)
export const UNIQUES: Record<UniqueId, { name: string; slot: Slot; cls?: HeroClass; set?: true; only?: true; fixed: (Affix | 'tab' | 'tier1')[]; look?: string; desc: string }> = {
  crackedHalo: { name: '금 간 빛 고리', slot: 'helm', only: true, fixed: [{ kind: 'life', value: 20 }], desc: '쓰러질 만큼 맞으면 3초 전의 자리와 체력으로 되감긴다(120초에 한 번)' }, // 기도하는 자만
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
export const UNIQUE_COLOR = { legend: '#ff5e14', set: '#b86bff' };
export const GRADE_COLOR = { magic: '#7d9bff', rare: '#ffe94a' }; // 바닥 고리·짧은 기둥(index.html --magic·--rare와 같게)
// 고유 장비 드롭: 정예(+ 운 보정, 실패마다 pity만큼 쌓임), 해골 왕·보스, 상자. 성공하면 세트 조각 set 확률, 세트는 없는 부위 missing 확률
export const LEGEND_DROP = { elite: 0.06, pity: 0.01, boss: 0.25, chest: 0.01, set: 0.4, missing: 0.7, price: 100 };
// 정예 사냥꾼 세트: 2부위 = 정예·보스 피해 배율·정예 처치 시 자원, 4부위 = 정예를 잡으면 그 특성을 time초(흡혈 leech, 폭발 반경·배율, 통솔 배율, 분열 해골 수명·최대)
export const SET_HUNTER = { frenzy: 1.3, rush: 1.3, steady: 0.7, dmg: 1.25, res: 30, time: 20, leech: 0.1, blastR: 1.2, blastMult: 1.5, aura: 1.3, allyLife: 10, allyMax: 3 };
// 전설 효과 수치
// 「금 간 빛 고리」 되감기: back초 전으로(틱마다 기록), 한 번 쓰면 cd초
export const REWIND = { back: 3, cd: 120 };
export const LEGEND_FX = { orbs: 3, orbMult: 0.4, bones: 2, boneBlastR: 1.2, boneBlast: 1.5, duelCd: 1, duelRes: 15, emberTime: 2, rage: 0.4, cloakHp: 0.85 };

// 장비 하나(부위·단계·옵션)
export type GearItem = { kind: Slot; tier: number; affixes: Affix[] };
// 보관함 격자에 놓인 장비. (x, y) = 왼쪽 위 칸
export type BagItem = GearItem & { x: number; y: number };
export const BAG = { w: 10, h: 4 };
export const STASH = { w: 10, h: 8 }; // 야영지 창고(캐릭터마다)
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
export type Chest = { id: number; x: number; z: number; open: boolean; guards?: number[]; kind?: 'shrine' | 'trial' | 'ice' | 'elder' | 'merchant' | 'villager' | 'asker' | 'clue' | 'beacon' | 'keeper' | 'seal' | 'altar' | 'stash'; wave?: number }; // stash = 야영지 창고(열리지 않고 누르면 창고 창) // altar = 무너진 성소 5층의 성소(열림 = 꺼짐) // beacon·keeper·seal(+ clue) = 지역 의뢰 대상 // elder·merchant·villager(주민)·asker(의뢰인 주민) = 야영지 NPC(열리지 않고 말을 건다), clue = 이야기 단서. guards: 야영지 상자를 지키는 몬스터 id(모두 쓰러져야 열린다)
// kind: shrine = 성소(누르면 버프, 'Y'), trial = 시련의 제단(누르면 몬스터가 waves번 몰려오고 다 막으면 열린다, 'Q' — guards가 지금 물결), ice = 얼어붙은 보물('I', 늘 장비)

// 성소: 누르면 time초 동안 버프 하나(무작위). fury 공격 배율 +, guard 받는 피해 −, haste 이동·공격 속도 +, wisdom 경험치 +
export type Buff = 'fury' | 'guard' | 'haste' | 'wisdom';
export const SHRINE = { time: 30, fury: 0.5, guard: 0.4, haste: 0.3, wisdom: 0.5 };
export const BUFFS: Record<Buff, { name: string; desc: string }> = {
  fury: { name: '분노의 성소', desc: '30초 동안 공격 +50%' },
  guard: { name: '수호의 성소', desc: '30초 동안 받는 피해 −40%' },
  haste: { name: '신속의 성소', desc: '30초 동안 이동·공격 속도 +30%' },
  wisdom: { name: '지혜의 성소', desc: '30초 동안 경험치 +50%' },
};
export const BUFF_LIST = Object.keys(BUFFS) as Buff[];
// 시련의 제단(미궁): 물결마다 나오는 몬스터(글자는 맵 글자: m 졸개, w 전사, a 궁수, g 마법사), 제단에서 떨어진 거리(m), 보상 금화 배수
export const TRIAL = { waves: ['mmm', 'mmwa', 'wwmmg'], radius: 4, gold: 3 };
// 잠든 몬스터(얼음 속 개미 'Z', 모래 속 개미귀신 'U', Entity.asleep): 주인공이 wake m 안에 오거나 맞으면 깬다. 하나가 깨면 chain m 안의 잠든 몬스터도 같이
export const SLEEP = { wake: 2.5, chain: 4 };
// 설원 고드름: every초마다 주인공이 얼음 벽 near칸 안이면 chance로 머리 위에 예고 원 → delay초 뒤 떨어진다. 피해 = dmg × 몬스터 피해 배율
export const ICICLE = { every: 4, near: 2, chance: 0.6, delay: 1, dmg: 6 };
// 초원 개미지옥: 가운데에서 r m 안이면 주인공 이동 × slow, 초당 pull m씩 가운데로 끌려간다
export const PIT = { r: 1.6, slow: 0.6, pull: 0.7 };
// 보물 고블린(초원): 주인공을 보면 run초 동안 speed m/s로 도망치고 못 잡으면 사라진다. 잡으면 금화 더미 gold개, 장비 gear개
export const TREASURE = { run: 12, speed: 3.6, gold: 5, gear: 2 };
// 폐허의 저주받은 무덤: 주인공이 near m 안이면 every초마다 졸개 하나(최대 max마리 살아 있게). 보스는 체력 절반에 무덤 boss개를 일으킨다
export const GRAVE = { near: 9, every: 6, first: 2, max: 3, boss: 2 };
// 폐허의 가시 바닥: period초마다 warn초 반짝인 뒤 솟아 up초 동안. 솟는 순간 위에 있으면 피해 dmg × 몬스터 피해 배율(구르는 중이면 무적)
export const SPIKE = { period: 3, warn: 1, up: 0.8, dmg: 5 };
// 폐허의 푸른 마법진: 밟으면 짝 마법진으로(내려서 다시 밟아야 또)

// 날아가는 화살. (dx, dz) 단위 방향, dmg는 쏠 때 굴린 값, left는 남은 비행 거리(m)
// hit: 관통 도끼(5단계)·관통 화염구가 이미 맞힌 적 id
// 주인공 것(몬스터만 맞음): axe = 도끼, bolt = 마법사 마력탄(평타), fireball = 마법사 화염구
export type Shot = { id: number; x: number; z: number; dx: number; dz: number; dmg: number; left: number; kind: 'arrow' | 'fire' | 'axe' | 'bolt' | 'fireball' | 'shaft' | 'pierce'; hit?: number[]; bounce?: number; through?: boolean; push?: boolean; wait?: number; back?: boolean; small?: boolean; ricochet?: boolean; scale?: number }; // back: 돌아오는 도끼날로 되돌아오는 중, small: 쪼개진 작은 화염구, scale: 잔상이 쏜 것(터지며 생기는 잔불에 곱한다), ricochet: 매의 눈 두건으로 이미 튕김 // bounce: 남은 튕김(튕기는 도끼), through: 맞혀도 계속 난다(도끼 5단계·도끼 폭풍), push: 밀쳐내기 사격, wait: 이 시간(초) 동안 주인공 자리에서 기다렸다 난다. shaft = 궁수 화살, pierce = 관통 사격·뼈 창

// 스킬 연계 기록(렌더용 글자). counter = 받아치기, stunned = 약점, reset = 돌진 → 가르기 준비. age초 뒤 지운다
export type Combo = { id: number; x: number; z: number; kind: 'counter' | 'stunned' | 'back' | 'reset' | 'dodge' | 'ward'; age: number }; // ward = 빛 고리에 막힘(성기사) // back = 공포로 도망치는 적

// 돌진 '불길'이 남긴 불타는 길(선분). t초 동안, acc가 TRAIL.tick을 넘을 때마다 길 위의 적에게 피해
// r: 폭(반경), mult: 한 번 피해 배율(× 주인공 굴림). 불바다·잔불·운석은 점(x0 = x1)에 넓은 r
export type Fire = { id: number; x0: number; z0: number; x1: number; z1: number; t: number; acc: number; r: number; mult: number };

// 화염구 폭발 기록(렌더·소리용). age초 뒤 지운다
// slam = 전사 내려찍기가 떨어진 자리, 나머지는 마법사: thunder 낙뢰, spark 연쇄 번개, frost 서리 고리(시전자), ice 얼어붙은 적, blink 순간이동, heal 치유, nova 방패 폭발
// 벼림 강화 효과를 받은 적 하나(연출용, 저장하지 않는다). dmg = 불로 실제 줄어든 체력, freeze = 이번에 얼었는지
export type EdgeHit = { id: number; ent: number; x: number; z: number; kind: 'flame' | 'frost' | 'both'; dmg: number; freeze: boolean; age: number };
export type Blast = { id: number; x: number; z: number; r?: number; age: number; n?: number; kind: 'slash' | 'fire' | 'slam' | 'thunder' | 'spark' | 'frost' | 'ice' | 'blink' | 'heal' | 'nova' | 'trap' | 'rain' | 'curse' | 'feather' }; // feather = 매가 덮친 자리(깃털 조각)

// 바닥의 위험 구역(예고 공격). t초 뒤 반경 r 안의 주인공에게 dmg. total = 처음의 t(렌더 진행도).
// owner: 예고 자세를 유지해야 하는 몬스터 id(끊기면 구역도 사라진다), -1 = 이미 떨어지는 중(못 끊음)
export type Zone = { id: number; x: number; z: number; r: number; t: number; total: number; dmg: number; owner: number; kind?: 'ice' | 'sword' }; // ice = 고드름(떨어지면 얼음 그림), sword = 성검의 비(꽂히면 잠시 벽)

// 장착 장비 단계(1~4). WEAPONS·ARMORS·HELMS·BOOTS[단계 − 1]
export type Gear = Record<Slot, number>;

// 바깥 지역 출구 한 칸: 맨 바깥 줄에 있고, to 지역의 다음 구역으로 이어진다
export type Exit = { x: number; z: number; to: 'field' | 'snow' | 'ruins' | 'sanctum' };
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
  exits: Exit[]; // 바깥 지역 가장자리의 출구 칸(들어서면 다음 구역)
  locked: Exit[]; // 아직 안 열린 지역으로 가는 출구 칸(막혀 있다, 이름표만)
  talk: 'elder' | 'merchant' | 'villager' | 'asker' | 'clue' | 'stash' | null; // 방금 말을 건 NPC·읽은 단서. main이 창을 열고 지운다
  roads: Cell[]; // 바깥 지역의 길 칸(그림만 다르다)
  amove: Point | null; // 공격 이동의 목적지(null = 아님)
  queued: Command | null; // 구르기·돌진·스킬 시전 중에 받은 이동·공격 명령(끝나면 따른다)
  castT: number; // 스킬 시전으로 발이 묶인 남은 시간(초)
  flashQ: number[]; // 일섬이 차례로 꿰뚫을 적 id
  flashHit: number; // 이번 도약에서 이미 벤 대상 id(-1 = 아직)
  flashPath: Point[]; // 일섬이 지나간 꺾은 자리들(끝나면 칼선)
  flashHits: number[]; // 일섬이 벤 적 id
  cuts: Cut[]; // 바닥에 그어 둔 칼선(발도)
  snapped: Cut[]; // 베인 칼선(최근 것만, 렌더용)
  echo: number; // 칼의 여운 칸(0~ECHO.need)
  echoOn: SkillId | null; // 여운을 실은 다른 탭 베기(그 스킬이 벨 때 칼선을 남긴다)
  echoHit: number[]; // 여운을 실은 회오리가 벤 적 id
  echoFrom: Point; // 여운을 실은 돌진의 출발점
  grazeFrom: Point; // 스쳐 베기 출발점
  grazeHit: number[]; // 스쳐 베기가 지나친 적 id
  props: Prop[];
  chests: Chest[];
  gates: Gate[];
  skins?: Partial<Record<Kind, Skin>>; // 이 맵의 몬스터 스킨(없으면 해골)
  opening: number | null; // 주인공이 열러 가는 상자 id
  taking: number | null; // 주인공이 주우러 가는 바닥 장비 id
  picked: (GearItem & { up: number; worn: boolean }) | null; // 방금 주운 더 좋은 장비(up = gearGain, worn = 자동 장착으로 입었다). main이 카드로 알리고 지운다
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
  xpCap: number; // 경험치 배율 상한(몬스터 배율이 이보다 커도 경험치는 여기까지): 이야기 깊이로 세진 만큼 레벨이 빨리 올라 상쇄되지 않게
  gear: Gear;
  mods: Record<Slot, Affix[]>; // 장착 장비의 마법 옵션
  bag: BagItem[]; // 보관함(BAG 격자, 서로 겹치지 않는다)
  runes: Partial<Record<Rune, number>>; // 룬 주머니(종류별 개수, 칸을 차지하지 않는다)
  runeRng: number; // 소켓·룬 굴림 전용 난수(다른 굴림 순서를 흔들지 않게)
  autoEquip: boolean; // 밟은 장비가 더 좋으면 바로 입는다
  regenAcc: number; // 재생 옵션의 소수점 회복 누적
  rest: boolean; // 모닥불에서 쉴 수 있는 지역(초원). main이 정한다
  land: Land; // 이 맵의 지역(고드름·무덤 소환처럼 지역마다 다른 규칙). main·봇이 정한다
  buff: { kind: Buff; t: number } | null; // 성소 버프와 남은 초
  sand: Cell[]; // 개미지옥 모래 칸(그림), pits: 그 가운데
  pits: Point[];
  spikes: Cell[]; // 가시 바닥 칸
  spikeT: number; // 가시 주기 안의 시간(초)
  portals: Point[]; // 푸른 마법진(둘이 짝), portalLock: 순간이동한 뒤 아직 마법진 위
  portalLock: boolean;
  icicleT: number; // 다음 고드름 굴림까지(초)
  bossRaised: boolean; // 폐허 보스가 무덤을 일으켰다
  marked: boolean; // 방금 의뢰 대상 하나를 끝냈다. main이 읽고 지운다
  sureLegend: boolean; // 이 구역 보스는 전설을 반드시 남긴다(지역 의뢰를 다 끝냄)
  // 무너진 성소: relics = 모은 성물(비트, 입구 화로), relicDrop = 보스가 쓰러지면 떨굴 성물(-1 없음), relicGot = 방금 주운 성물(main이 읽고 -1로)
  // offer = 성소에 성물을 바치는 중(상자 id, 흐른 초), bareT = 고리가 깨져 성기사가 맞는 남은 시간, knightsUp = 체력 절반에 기사가 일어났다
  relics: number;
  relicDrop: number;
  relicGot: number;
  offer: { id: number; t: number } | null;
  bareT: number;
  knightsUp: boolean;
  // 기도하는 자: haloDrop = 쓰러지면 「금 간 빛 고리」가 나올 확률(0 = 아님, 못 나오면 평소 전설), horseDrop = 작은 목마를 떨군다(처음 쓰러뜨릴 때)
  haloDrop: number;
  horseDrop: boolean;
  // 「금 간 빛 고리」: past = 주인공 자리·체력 기록(틱마다, 가장 오래된 것이 REWIND.back초 전), haloCd = 다시 되감을 수 있을 때까지(초)
  past: [number, number, number][];
  haloCd: number;
  // 성기사 전용 기술(paladin.ts): rain = 다음 성검의 비까지, judge = 다음 심판까지(-1 = 아직 잠김), quiet = 빛줄이 꺼져 있을 남은 시간, burn = 대상 id → 다시 데일 수 있을 때까지(초)
  pal: { rain: number; judge: number; quiet: number; burn: Record<number, number> };
  swords: { id: number; x: number; z: number; t: number }[]; // 꽂힌 성검(칸 정수, t = 벽 남은 시간)
  calmT: number; // 주인공이 마지막으로 다친 뒤 흐른 시간(초)
  lastHp: number; // 직전 틱의 주인공 체력(다쳤는지 비교)
  rested: number; // 모닥불에서 회복한 양의 누적(소수점 포함, 렌더가 +숫자로 띄운다)
  maxTier: number;
  level: number;
  xp: number;
  skillCd: number; // 가르기 재사용까지 남은 시간(초)
  dashCd: number; // 돌진 베기 재사용까지 남은 시간(초)
  dashHit: number[]; // 이번 돌진에서 이미 맞은 적 id
  dashes: number; // 돌진 횟수(렌더·소리용)
  cleaves: number; // 가르기 타격 횟수(렌더·소리용)
  markSlashes: number; // 그어두기 타격 횟수(렌더용)
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
  volleys: { x: number; z: number; r: number; t: number; left: number; mult: number; later: number; blast: 'rain' | 'fire'; burn?: number; scale?: number }[]; // 떨어질 화살비·운석(t초 뒤, left번 남음, 처음엔 굴림 × mult, 그 뒤로는 × later). burn: 떨어진 자리가 이 반경으로 불탄다, scale: 잔상이 쓴 것(그 불에 곱한다)
  shouts: number; // 함성 횟수(렌더·소리용)
  casts: number; // 마법사 스킬 시전 횟수(렌더용: 시전 동작)
  ghosts: Ghost[]; // 잔상(마법사 잔상 탭). 오래된 것부터
  hawk: Hawk | null; // 궁수의 매(덮쳐라를 배우면). 매 떼의 다른 매는 flock
  flock: Hawk[];
  rideHit: number[]; // 이번 매 타기에서 화살을 맞은 적 id
  memos: Memo[]; // 지나온 길이 기억하는 주인공 주문(오래된 것부터)
  ghostScale: number; // 잔상 몫으로 쓰는 동안 주인공 굴림에 곱하는 배율(평소 1)
  swaps: { id: number; x0: number; z0: number; x1: number; z1: number; age: number }[]; // 자리 바꾸기 빛줄기(렌더용)
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
  slash: 'cleave' | 'mark'; // 지금 휘두르는 베기 종류(가르기·그어두기)
  edgeSwings: number; // 충전을 쓴 휘두름 수(렌더용: 불티)
  edgeSlashes: number; // 해방 참격 수(렌더·소리용)
  edgeHits: EdgeHit[]; // 강화 효과를 받은 적(렌더·소리용, TEMPER.hitAge초)
  edge: { kind: 'flame' | 'frost' | 'both' | null; left: number; t: number }; // 칼 강화(벼림): 종류, 남은 충전, 해방 남은 시간(초)
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
// 통솔 = 반경 안의 다른 몬스터 데미지 배수, 분열 = 죽으면 졸개 count마리.
// 깊은 곳(설원부터, FIERCE)의 셋: 광폭 = 공격 속도 ×frenzy, 질주 = 이동 속도 ×rush, 불굴 = 기절·공포·밀쳐내기를 받지 않는다(맞아도 멈추지 않고 걸어온다).
// 원거리 직업이 거리만 벌리면 끝나지 않게(설계서 6-1). 설원·미궁·폐허 보스도 셋 중 하나를 단다
export type EliteKind = 'swift' | 'vampiric' | 'volatile' | 'warlord' | 'splitting' | 'frenzied' | 'rushing' | 'unyielding';
export const ELITE_KINDS: Record<EliteKind, { name: string; desc: string; color: string }> = {
  swift: { name: '신속한', desc: '빠르게 움직이고 빠르게 친다', color: '#5fd0ff' },
  vampiric: { name: '흡혈의', desc: '때릴 때마다 체력을 회복한다', color: '#ff4d6a' },
  volatile: { name: '폭발하는', desc: '죽은 자리가 잠시 뒤 폭발한다', color: '#ff9a2e' },
  warlord: { name: '통솔하는', desc: '주변 몬스터의 공격이 강해진다', color: '#ffd84a' },
  splitting: { name: '분열하는', desc: '죽으면 졸개 둘로 갈라진다', color: '#8de05a' },
  frenzied: { name: '광폭한', desc: '몹시 빠르게 몰아친다', color: '#e040fb' },
  rushing: { name: '질주하는', desc: '눈 깜짝할 새 달려든다', color: '#3dffb0' },
  unyielding: { name: '불굴의', desc: '맞아도 멈추지 않고 걸어온다', color: '#c9d1e0' },
};
export const FIERCE: EliteKind[] = ['frenzied', 'rushing', 'unyielding'];
export const ELITE_KIND_LIST = (Object.keys(ELITE_KINDS) as EliteKind[]).filter((k) => !FIERCE.includes(k)); // 초원에서 나오는 특성
export const steady = (e: Entity) => e.eliteKind === 'unyielding'; // 기절·공포·밀쳐내기를 받지 않는다
// 지역(맵의 종류)과 그곳의 몬스터. 스킨 = 전투 원형(졸개·전사·마법사)에 그림·이름을 바꾸고 체력·이동 속도에 배율을 곱한 것
export type Land = 'dungeon' | 'field' | 'snow' | 'ruins' | 'camp' | 'sanctum'; // camp = 야영지(거점, 몬스터 없음)
export type Skin = 'goblin' | 'goblin_elite' | 'fire_ant' | 'ice_ant' | 'zombie' | 'antlion' | 'wyvern' | 'treasure' | 'antlion_small' | 'grave' | 'zombie_dark' | 'hobgoblin' | 'hobgoblin_archer' | 'bone_knight' | 'demon' | 'fallen_paladin';
export const SKINS: Record<Skin, { name: string; hp: number; speed: number }> = {
  goblin: { name: '고블린', hp: 0.8, speed: 1.25 }, // 약하지만 빠르고 떼로 온다
  goblin_elite: { name: '고블린 전사', hp: 0.9, speed: 1.15 },
  fire_ant: { name: '불개미', hp: 1.2, speed: 1 }, // 불을 뱉는다(마법사 원형)
  ice_ant: { name: '얼음 개미', hp: 1.2, speed: 0.9 },
  zombie: { name: '얼어붙은 시체', hp: 1.5, speed: 0.75 }, // 느리지만 질기다
  antlion: { name: '개미귀신', hp: 1.1, speed: 1 }, // 초원의 보스
  wyvern: { name: '서리 와이번', hp: 0.9, speed: 1.15 }, // 설원의 보스: 날래다
  treasure: { name: '보물 고블린', hp: 2.5, speed: 1 }, // 졸개 원형, 싸우지 않고 도망친다(TREASURE)
  antlion_small: { name: '새끼 개미귀신', hp: 0.9, speed: 1.1 }, // 전사 원형, 개미지옥 가운데 모래 속에 숨어 있다
  grave: { name: '저주받은 무덤', hp: 3, speed: 0 }, // 졸개 원형, 움직이지도 때리지도 않고 졸개를 일으킨다(GRAVE)
  zombie_dark: { name: '어둠 좀비', hp: 1.3, speed: 0.85 }, // 폐허 졸개
  hobgoblin: { name: '홉고블린', hp: 1.1, speed: 1.05 }, // 폐허 전사
  hobgoblin_archer: { name: '홉고블린 궁수', hp: 1, speed: 1 }, // 폐허 궁수
  bone_knight: { name: '해골 기사 왕', hp: 1.2, speed: 1 }, // 지금은 안 쓴다(폐허 보스가 악마로 바뀜)
  demon: { name: '심연의 악마', hp: 1.2, speed: 1 }, // 폐허의 보스: 체력 절반에 무덤을 일으킨다
  fallen_paladin: { name: '기도하는 자', hp: 1.2, speed: 1 }, // 무너진 성소 5층의 보스(보스 원형). 이야기: docs/superpowers/specs/2026-11-19-prayer-story-design.md
};
export const LANDS: Record<Land, { name: string; unit: string; skins: Partial<Record<Kind, Skin>> }> = {
  dungeon: { name: '지하', unit: '층', skins: {} },
  field: { name: '초원', unit: '구역', skins: { minion: 'goblin', warrior: 'goblin_elite', mage: 'fire_ant', boss: 'antlion' } },
  snow: { name: '설원', unit: '구역', skins: { minion: 'ice_ant', warrior: 'zombie', boss: 'wyvern' } },
  ruins: { name: '폐허', unit: '구역', skins: { minion: 'zombie_dark', warrior: 'hobgoblin', archer: 'hobgoblin_archer', boss: 'demon' } },
  camp: { name: '야영지', unit: '', skins: {} },
  sanctum: { name: '무너진 성소', unit: '층', skins: { minion: 'zombie_dark', warrior: 'hobgoblin', archer: 'hobgoblin_archer', king: 'bone_knight', boss: 'fallen_paladin' } },
};
// 이야기: 한 단계 = 한 줄(초원 → 설원 → 미궁 → 폐허). stage(0~3)의 지역 보스를 깨면 다음 단계가 열린다.
// goal = HUD 임무 줄, again = 순찰대장에게 다시 말을 걸면, quest = 그 지역 의뢰(2·3·4구역에 대상 하나씩, 선택), done = 보스를 깨고 야영지에 왔을 때(다음 단계의 시작 대사)
// 의뢰 대상: note 흔적(읽기), beacon 봉화(물결 버티기), keeper 잠긴 궤(지킴이 사냥), seal 봉인 제단(깨면 무덤). marks = 찾은 순서대로 나오는 이야기 조각(셋째가 다음 지역을 가리킨다)
export type QuestKind = 'note' | 'beacon' | 'keeper' | 'seal';
// ask = 야영지 의뢰인(주민)의 부탁. 있으면 부탁을 들어야 시작(없으면 처음부터 켜져 있다). reward = 조각마다 금화(gold) 또는 이 지역 보스 약화(weaken, 셋이면 전설 확정)
export type Quest = { kind: QuestKind; name: string; sign: string; ask?: string; reward: 'gold' | 'weaken'; marks: { name: string; text: string }[] };
export type Story = { land: Land; goal: string; again: string; quest: Quest; done: string };
export const OPENING = "왔군. 왕도에서 우리를 보낸 까닭이 있네. 요즘 초원이 수상하네. 고블린 떼가 부쩍 늘더니, 동쪽으로 정찰 나간 아이들이 돌아오질 않아. 마지막으로 들어온 전갈에는 '초원 가장 깊은 곳, 모래가 꺼진 자리'라는 말뿐이었지. 거기 무엇이 있는지 알아봐 주게.";
export const STORY: Story[] = [
  {
    land: 'field',
    goal: '초원 가장 깊은 곳을 살펴본다',
    again: '초원 가장 깊은 곳, 모래가 꺼진 자리라 했네. 거기부터 가 보게.',
    quest: {
      kind: 'note',
      ask: '오라버니가 정찰을 나간 뒤로 돌아오지 않았어요. 초원 2·3·4구역 어딘가에 흔적이라도 남아 있을 거예요. 찾아 주시면 모아 둔 돈을 드릴게요.',
      reward: 'gold',
      name: '실종된 정찰병',
      sign: '정찰병의 흔적',
      marks: [
        { name: '찢어진 정찰 일지', text: '둘째 날. 고블린들이 무언가를 동쪽으로 끌고 간다. 먹이를 나르는 것 같지는 않다. 어딘가에 바치러 가는 것처럼 보인다. 몇 놈은 등에 검은 딱지가 번져 있다. 병든 짐승 같다.' },
        { name: '부러진 창', text: "정찰병의 창이 반으로 부러져 모래에 꽂혀 있다. 자루에 손톱으로 긁은 글씨가 남아 있다. '땅이 꺼진다. 가까이 가지 마라.'" },
        { name: '얼어붙은 정찰병의 쪽지', text: '모래 구덩이 밑에서 찬 바람이 올라온다. 이 초원에서 날 수 없는 냉기다. 굴이 북쪽 눈밭까지 이어진 게 아닐까. 대장님께 꼭 전해야… (쪽지 끝이 서리에 덮여 있다)' },
      ],
    },
    done: '그 구덩이 밑에 개미귀신이 버티고 있었다니… 쪽지에 적힌 냉기가 마음에 걸리는군. 초원 어귀에서 북쪽 설원으로 가는 길을 열어 두었네. 찬 바람이 어디서 불어오는지 찾아 주게.',
  },
  {
    land: 'snow',
    goal: '설원에서 찬 바람의 근원을 찾는다',
    again: '북쪽 설원이네. 그 찬 바람이 어디서 불어오는지 찾아 주게.',
    quest: {
      kind: 'beacon',
      ask: '설원 길목마다 봉화가 있었는데 하나둘 꺼졌대요. 설원 2·3·4구역의 봉화에 다시 불을 붙여 주세요. 불 하나마다 사례할게요.',
      reward: 'gold',
      name: '꺼진 봉화',
      sign: '꺼진 봉화',
      marks: [
        { name: '되살린 봉화', text: '봉화에 다시 불이 붙었다. 불빛이 닿자 눈 속에 묻혀 있던 자국이 드러난다. 사람의 발자국이 아니다. 커다란 무언가가 날개를 끌며 지나갔다.' },
        { name: '둘째 봉화', text: '불이 오르자 눈보라가 잠시 걷힌다. 멀리 얼음 절벽 밑으로 검은 굴 입구들이 줄지어 있다. 찬 바람은 저 굴에서 불어 나온다.' },
        { name: '얼음 속 지도 조각', text: '봉화의 불길에 얼음이 녹자, 그 속에 갇혀 있던 낡은 지도 조각이 드러난다. 눈밭 아래로 굴이 그물처럼 뻗어 있고, 그 끝은 모두 한곳 — 땅 밑 깊은 미궁으로 모인다. 적힌 지명은 하나도 알아볼 수 없다. 백 년은 묵은 글씨다.' },
      ],
    },
    done: '서리 와이번이 그 굴의 입구를 지키고 있었군. 모든 굴이 미궁으로 모인다라… 초원 어귀의 동굴 입구를 막고 있던 돌을 치웠네. 조심하게. 저 밑은 우리가 아는 땅이 아니야.',
  },
  {
    land: 'dungeon',
    goal: '미궁 깊은 곳으로 내려간다',
    again: '초원 어귀의 동굴 입구는 열어 두었네. 미궁 맨 밑까지 내려가 보게.',
    quest: {
      kind: 'keeper',
      reward: 'weaken',
      name: '열쇠지기',
      sign: '잠긴 궤',
      marks: [
        { name: '열쇠 조각', text: '궤 안에 녹슨 열쇠 조각이 들어 있다. 손잡이 쪽이다. 궤를 지키던 해골들은 이 쇳조각을 목숨처럼 붙들고 있었다.' },
        { name: '또 하나의 열쇠 조각', text: '두 조각을 맞대 보니 아귀가 꼭 맞는다. 몸통에 금 간 고리 아래 무릎 꿇은 사람의 문장이 새겨져 있다.' },
        { name: '해골이 쥔 열쇠', text: '마지막 조각을 끼우자 열쇠가 온전해진다. 손잡이의 문장은 낯설지 않다. 무너진 성채의 깃발에서 본 바로 그 문장이다.' },
      ],
    },
    done: '미노타우르스가 지키던 문이 이 열쇠로 열리는 문이었군. 그 문장… 남쪽 폐허, 옛 성채의 것이네. 모든 일이 거기서 시작됐을 걸세. 초원 어귀에서 성채로 가는 길을 열겠네.',
  },
  {
    land: 'ruins',
    goal: '옛 성채에서 모든 일의 근원을 끊는다',
    again: '옛 성채로 가게. 모든 일의 시작이 거기 있을 걸세.',
    quest: {
      kind: 'seal',
      reward: 'weaken',
      name: '봉인 제단',
      sign: '봉인 제단',
      marks: [
        { name: '금 간 봉인', text: '봉인을 깨자 둘레의 무덤들이 들썩인다. 제단 밑에서 낮은 웅얼거림이 들린다. 기도인지 주문인지 알 수 없다.' },
        { name: '피 묻은 봉인', text: '깨진 돌 틈으로 붉은 빛이 새어 나왔다가 꺼진다. 성채 깊은 곳의 무언가가 그만큼 약해졌다.' },
        { name: '무너진 제단의 글', text: "마지막 봉인 밑에 검붉은 글씨가 남아 있다. '문이 열렸다. 그분이 깨어나신다.'" },
      ],
    },
    done: '해냈군. 성채의 악마가 쓰러지자 초원 바람도 잠잠해졌네. …하지만 땅은 쉽게 잠들지 않아. 벌써 더 짙은 기운이 올라오고 있어. 초원 어귀의 길은 모두 열어 두었네. 이번엔 어디부터 갈지 자네가 정하게. 네 곳의 우두머리를 모두 쓰러뜨리면 그때 다시 이야기하세.',
  },
];
// 의뢰 대상이 놓이는 구역: 2·3·4구역(미궁은 층). 진행(marks)은 비트: 2구역 1, 3구역 2, 4구역 4
export const QUEST = { weaken: 0.1, beacon: ['mmm', 'mwa'], graves: 2 }; // 끝낸 대상 하나마다 보스 체력 −10%, 봉화 물결, 봉인을 깨면 솟는 무덤 수
export const MARK_LETTER: Record<QuestKind, string> = { note: 'L', beacon: 'J', keeper: 'k', seal: 'O' };
export const markBit = (floor: number) => (floor >= 2 && floor <= 4 ? 1 << (floor - 2) : 0);
export const markCount = (marks: number) => [1, 2, 4].filter((b) => marks & b).length;
export const bossHpScale = (count: number) => 1 - QUEST.weaken * count;
// 지금 단계의 의뢰가 켜져 있나: 부탁이 없는 의뢰는 늘, 있으면 받은 뒤(took)
export const questOn = (stage: number, took: boolean) => !STORY[stage].quest.ask || took;
// 순찰대장이 아직 안 한 이야기: 새 게임이면 OPENING, 아니면 지난 단계를 끝냈을 때의 말(마지막 단계 다음은 회차가 넘어간 것)
export const captainNews = (stage: number, cycle: number) => (stage === 0 && cycle === 0 ? OPENING : STORY[(stage + STORY.length - 1) % STORY.length].done);
// 열린 지역: 1회차는 지금 단계까지, 2회차부터는 모두(순서 자유)
export const openLands = (stage: number, cycle = 0): Land[] => STORY.slice(0, cycle ? STORY.length : stage + 1).map((s) => s.land);
// 2회차부터: 임무 줄·순찰대장에게 다시 말을 걸면
export const FREE_GOAL = '네 지역의 우두머리를 쓰러뜨린다';
export const FREE_AGAIN = '어디가 먼저든 상관없네. 아직 남은 곳부터 둘러보게.';
export const beatCount = (beat: number) => STORY.filter((_, i) => beat & (1 << i)).length;
// 보스를 깬 뒤: 지금 단계의 지역이면 다음 단계(마지막이면 회차 + 1, 이야기는 처음부터). 지난 지역이면 그대로
// 2회차부터(cycle ≥ 1): 순서 없이 이번 회차에 안 깬 지역 보스면 beat에 켜고(advanced), 넷 다 켜지면 다음 회차(이야기 단계는 0)
export function afterClear(stage: number, cycle: number, land: Land, beat = 0): { stage: number; cycle: number; beat: number; advanced: boolean; newCycle: boolean } {
  const same = { stage, cycle, beat, advanced: false, newCycle: false };
  if (cycle) {
    const bit = 1 << STORY.findIndex((s) => s.land === land);
    if (bit < 1 || beat & bit) return same;
    if (beatCount(beat | bit) === STORY.length) return { stage: 0, cycle: cycle + 1, beat: 0, advanced: true, newCycle: true };
    return { ...same, beat: beat | bit, advanced: true };
  }
  if (STORY[stage]?.land !== land) return same;
  if (stage === STORY.length - 1) return { stage: 0, cycle: cycle + 1, beat: 0, advanced: true, newCycle: true };
  return { ...same, stage: stage + 1, advanced: true };
}
// 이야기 깊이: 이야기 순서 k(초원 0 … 폐허 3)의 n구역 = 5k + n. 몬스터 세기·장비 상한이 지역을 넘어 이어진다(야영지는 0)
export const markGold = (land: Land, n: number) => 10 * depthOf(land, n); // 금화 의뢰의 조각 하나 보상
export const depthOf = (land: Land, n: number) => (land === 'camp' ? 0 : land === 'sanctum' ? 5 * STORY.length + n : 5 * Math.max(0, STORY.findIndex((s) => s.land === land)) + n); // 성소는 폐허 다음(21~25)

// 그림을 그리지 않는(모래 속에 숨은) 몬스터
export const hidden = (e: Entity) => e.skin === 'antlion_small' && !!e.asleep;
export const LAND_LIST = Object.keys(LANDS) as Land[];
export const bossName = (skins: World['skins']) => (skins?.boss ? SKINS[skins.boss].name : STATS.boss.name);
export const monsterName = (e: Entity) => (e.skin ? SKINS[e.skin].name : STATS[e.kind].name);
export const ELITE_FX = { frenzy: 2, rush: 2, swiftMove: 1.35, swiftAttack: 1.25, leech: 2, blastDelay: 1.2, blastMult: 1.5, auraRange: 5, auraDmg: 1.3, split: 2 };
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
  socket: { slots: ['weapon', 'armor', 'helm', 'boots'], name: '', lo: 1, hi: 3, special: true },
  keyCd: { slots: ['weapon', 'armor', 'helm', 'boots'], name: '', lo: 0, hi: 100, special: true },
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

// 초원 야영지: 상자 둘레 radius(m) 안의 몬스터가 지킨다. 상자는 늘 장비, 금화는 gold배
export const CAMP = { radius: 6, gold: 2 };
// 모닥불 휴식(초원): 화로 range(m) 안, 다친 지 calm초가 지나고 AGGRO 안에 적이 없으면 초당 최대 체력의 rate
export const REST = { range: 2.5, calm: 3, rate: 0.03 };
export const CHEST = { reach: 1.5, potion: 0.6, drop: 0.7 }; // 여는 거리, 물약 확률(나머지 장비), 떨어지는 거리(주인공 쪽)

export const SKILL = { cd: 4, radius: 2, mult: 1.5, aim: 2.5 }; // 가르기: 재사용 대기, 범위, 데미지 배율, 자동 조준 거리

export const RANK_MAX = 5;
export const COMBO = { counter: 2, stunned: 1.5, back: 2, age: 0.6 }; // 연계 배율(예고 중·기절 중·도망치는 적에게 스킬), 기록 유지 시간
export const WHIRL = { cd: 6, time: 2, extra: 1, tick: 0.25, mult: 0.4 }; // 회오리(검술 2): 재사용, 시간, 5단계 추가 시간, 타격 간격, 타격당 배율
export const BURST = { radius: 1.6, hp: 0.3 }; // 시체 폭발(검술 패시브): 반경, 피해(시체 최대 체력 비율, 단계마다 +0.05). 가르기·회오리·처형으로 죽은 적
export const EXECUTE = { cd: 8, reach: 2.5, below: 0.3, mult: 2.5, fear: 3, fearR: 4 }; // 처형(검술 궁극): 재사용, 닿는 거리, 즉사 체력 비율(단계마다 +0.03), 아니면 배율, 처치 시 주변 공포(시간·반경)
export const TRAIL = { time: 3, tick: 0.5, width: 0.8, mult: 0.35 }; // 불길(돌격 패시브): 유지 시간, 피해 간격, 길 폭(반경), 한 번 피해 배율(단계마다 +25%). 불바다·잔불·운석도 같은 간격
// 발도(기사 넷째 탭): 그어두기가 적에게 검흔을 새기고, 납도가 한꺼번에 터뜨린다
export const CUT = { delay: 1, near: 0.6 }; // 칼선: 그은 뒤 베이기까지(초), 선에서 이 거리 안이면 맞는다(m)
export const MARK = { hit: 0.4, cut: 1.2, cd: 1.5 }; // 그어두기: 바로 들어가는 피해, 칼선 배율, 재사용
export const GRAZE = { cd: 6, dist: 6, speed: 60, near: 0.8, cut: 2.0 }; // 스쳐 베기: 재사용, 거리, 속도(m/s), 지나치는 거리, 칼선 배율
export const ECHO = { need: 2, cut: 0.8, x: 2 }; // 칼의 여운: 채울 칸, 칼선 배율, 처형 X자 길이(m)
export const FLASH = { cd: 14, range: 6, max: 5, hit: 0.5, cut: 1.5, speed: 30, past: 1, near: 0.8 }; // 일섬(궁극): 재사용, 거리, 최대 대상, 지날 때 피해, 칼선 배율, 속도, 지나가는 거리, 가까이 서는 거리
// 벼림(기사 다섯째 탭): 칼에 불·서리를 입혀 휘두를 때마다 충전을 쓴다
// charges 충전, flame 불 배율, flameCd 불 대기, burstR·burst 5단계 화염 폭발, hits·freeze 서리 빙결 타수·시간, frostCd 서리 대기,
// reforgeR·reforge·reforgeFreeze 덧벼림 반경·배율·빙결, time·cd 해방 시간·대기, len·width·slash 해방 참격 길이·폭·배율
export const TEMPER = { charges: 6, flame: 0.4, flameCd: 4, burstR: 1.5, burst: 0.6, hits: 3, freeze: 1, frostCd: 6, reforgeR: 2.5, reforge: 0.3, reforgeFreeze: 0.8, time: 6, cd: 15, len: 3, width: 0.8, slash: 0.5, hitAge: 0.5 };
export const LEAP = { cd: 10, range: 6, radius: 2.5, mult: 2, stun: 1, air: 0.45, height: 1.6 }; // 대지 강타(돌격 궁극): 재사용, 뛰는 거리, 착지 반경, 배율, 기절, 체공(초), 높이(m, 그림)

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
export const COST_OVERRIDE: Partial<Record<SkillId, number>> = { mark: 12 };
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
// 기사의 후반 성장: from 레벨부터 레벨마다 피해 +dmg(모든 직업 공통 5%에 더해). 근접이라 싸움이 길어지면 계속 맞는데,
// 원거리 직업은 레벨 40에 화력이 기사의 1.6~2.4배였다(설계서 6-1, 화력 벤치)
export const KNIGHT_LATE = { from: 15, dmg: 0.08 };
export const XP_CAP = 1.6; // 경험치 배율 상한 × 회차 배율 = 초원 5구역(floorPower(5))의 배율. 설계서 6-1


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
// 잔상(마법사 넷째 탭): 잔상은 주인공이 쓰는 주문을 제 자리에서 똑같이 따라 쓴다.
// cd·time·mult·max 잔상 남기기(대기, 남는 시간, 따라 쓰는 피해 배율, 한도), swapCd·width·swap·stun 자리 바꾸기(대기, 빛줄기 폭, 배율, 기절),
// linger 떠난 자리 시간, retraceCd·memory·retrace 지나온 길(대기, 기억하는 시간, 배율), group 묶는 거리, spread 펼치는 시간, stay 다 쓴 뒤 남는 시간, flash 따라 쓴 반짝임(렌더), swapAge 빛줄기 그림 시간
export const AFTERIMAGE = { cd: 10, time: 6, mult: 0.5, max: 1, swapCd: 6, width: 0.6, swap: 1.5, stun: 0.5, linger: 2, retraceCd: 16, memory: 4, retrace: 0.8, group: 1, spread: 1, stay: 1.5, flash: 0.25, swapAge: 0.5 };
// 잔상: leave = 잔상 남기기, linger = 떠난 자리, retrace = 지나온 길. t 남은 시간, full 처음 시간, aura·auraAcc 잔상 몫 눈보라,
// flash 따라 쓴 반짝임 남은 시간, wait·queue 지나온 길 잔상이 설 때까지와 그때 다시 쓸 기록(서기 전엔 queue가 차 있다)
export type Ghost = { id: number; x: number; z: number; facing: number; kind: 'leave' | 'linger' | 'retrace'; t: number; full: number; aura: number; auraAcc: number; flash: number; wait: number; queue: Memo[] };
export type Memo = { id: SkillId; x: number; z: number; ax?: number; az?: number; age: number }; // 주인공이 쓴 주문: 쓴 자리, 조준점(없으면 없음), 흐른 시간

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
// 매(궁수 넷째 탭): 매는 늘 곁에서 알아서 싸우고, 스킬은 매에게 내리는 명령이다. 매는 하늘을 난다(벽 무시, 적이 노리지 않는다)
// r·h 맴도는 반지름·높이, spin 각속도, peck·speed 쪼기(속도), dive 덮칠 때 속도, low 덮칠 때 높이, reach 닿은 것으로 보는 거리,
// every·near·aim 쪼기 간격·가까운 적 거리·주인공이 공격 중인 적 거리, pecks 쪼기 배율,
// cd·mult·stun·range·pick·around 덮쳐라(대기, 배율, 기절, 찾는 거리, 조준점 둘레, 5단계 둘레 기절),
// rideCd·dist·time·width·arrow 매 타기(대기, 거리, 시간, 화살 폭, 배율), landNear 5단계 착지 덮치기 거리,
// assist·assistCd 협공(덮쳐라 피해 비율, 간격), flockCd·count·dives·radius·flockMult·flockStun·sky 매 떼(대기, 수, 덮치기 수, 범위, 배율, 기절, 내려오는 높이)
export const HAWK = { r: 1.3, h: 1.9, spin: 1.1, peck: 10, dive: 14, low: 0.4, reach: 0.35, every: 1.5, near: 6, aim: 8, pecks: 0.3, cd: 5, mult: 2, stun: 1, range: 9, pick: 1.5, around: 1.5, rideCd: 8, dist: 6, time: 0.6, width: 1, arrow: 1, landNear: 4, assist: 0.5, assistCd: 1, flockCd: 16, count: 5, dives: 2, radius: 8, flockMult: 1.2, flockStun: 0.5, sky: 6 };
// 매 하나: 자리(x, z, 높이 y), 하는 일, 대상 id, 피해 배율·기절(덮치기), 다음 쪼기까지·협공 대기(내 매), 남은 덮치기(매 떼)
export type Hawk = { x: number; z: number; y: number; mode: 'orbit' | 'peck' | 'dive' | 'carry' | 'leave'; target: number; mult: number; stun: number; around: boolean; peckT: number; assistT: number; dives: number; angle: number; cand: number }; // cand: 이번 틱 스킬 화살에 맞은 적 중 협공할 적(-1 없음)
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

// 룬. 설계: docs/superpowers/specs/2026-11-19-runes-design.md
// 지역(이야기 순서 i: 초원 0 · 설원 1 · 미궁 2 · 폐허 3)마다 스탯 룬 둘, 스킬 트리 i번째 줄(1단계·2단계·패시브·궁극기) 스킬 룬, i번째 칸(Q W E R) 칸 룬.
// 룬 하나 = 옵션 한 줄. 어느 부위에 꽂아도 같다. 이름: 스탯 룬 = STAT_RUNES 키, 스킬 룬 = '가르기+1'의 스킬 id 꼴(`cleave+2`), 칸 룬 = `key:cleave`
export type Rune = string;
export const STAT_RUNES: Record<string, { name: string; land: Land; kind: AffixKind; value: number }> = {
  gale: { name: '질풍', land: 'field', kind: 'move', value: 4 },
  flurry: { name: '연타', land: 'field', kind: 'speed', value: 5 },
  icewall: { name: '빙벽', land: 'snow', kind: 'guard', value: 3 },
  icespike: { name: '얼음 가시', land: 'snow', kind: 'thorns', value: 10 },
  blood: { name: '피', land: 'dungeon', kind: 'leech', value: 2 },
  bone: { name: '뼈', land: 'dungeon', kind: 'life', value: 10 },
  spark: { name: '불씨', land: 'ruins', kind: 'crit', value: 4 },
  cinder: { name: '잿불', land: 'ruins', kind: 'dmg', value: 8 },
};
// cut: 칸 룬 하나의 재사용 대기 감소(%), cutMax: 한 칸의 합계 상한, sockets: 소켓 1·2·3개 확률
export const RUNE = { cut: 15, cutMax: 50, sockets: [0.6, 0.3, 0.1] };
// 등급 확률 [흔함(스탯), 보통(스킬 +1), 드묾(스킬 +2)]. mob = 잡몹이 하나 떨어뜨릴 확률, boss = 보스가 떨어뜨리는 수, key = 보스의 칸 룬 확률(의뢰를 다 끝냈으면 확정)
export const RUNE_DROP = { mob: 0.05, odds: { mob: [0.8, 0.2, 0], elite: [0.4, 0.45, 0.15], boss: [0, 0.6, 0.4] }, boss: 2, key: 0.1 };
export const RUNE_COLOR = ['#e8e0d0', '#5aa0ff', '#ffd84a', '#ff4fd8']; // 흔함·보통·드묾·아주 드묾
export const ROW_NAME = ['1단계', '2단계', '패시브', '궁극기'];
// 룬 그림(src/assets/sprites/runes.png 칸 번호, tools/runes.py): 스탯 룬마다, 칸 룬마다, 스킬 룬은 줄마다 하나
const RUNE_ICON = { stat: { gale: 5, flurry: 9, icewall: 3, icespike: 18, blood: 7, bone: 6, spark: 2, cinder: 4 } as Record<string, number>, key: { cleave: 10, dash: 11, shout: 12, throw: 13 } as Record<string, number>, row: [17, 1, 0, 19] };
export function runeIcon(r: Rune): number {
  const a = runeAffix(r);
  return !a ? 0 : a.kind === 'keyCd' ? RUNE_ICON.key[a.key!] : a.kind === 'skill' ? RUNE_ICON.row[SKILLS[a.skill!].tier] : RUNE_ICON.stat[r];
}
// 지역의 이야기 순서(= 스킬 줄 = 칸). 야영지는 −1(룬 없음)
export const runeRow = (land: Land) => STORY.findIndex((s) => s.land === land);
// 룬 → 옵션 한 줄(모르는 룬이면 null)
export function runeAffix(r: Rune): Affix | null {
  const st = Object.hasOwn(STAT_RUNES, r) ? STAT_RUNES[r] : undefined;
  if (st) return { kind: st.kind, value: st.value, r };
  if (r.startsWith('key:')) return KEYS.includes(r.slice(4) as SkillName) ? { kind: 'keyCd', value: RUNE.cut, key: r.slice(4) as SkillName, r } : null;
  const m = /^(\w+)\+([12])$/.exec(r);
  return m && Object.hasOwn(SKILLS, m[1]) ? { kind: 'skill', value: Number(m[2]), skill: m[1] as SkillId, r } : null;
}
// 등급: 0 흔함(스탯), 1 보통(+1), 2 드묾(+2), 3 아주 드묾(칸)
export const runeGrade = (r: Rune) => (Object.hasOwn(STAT_RUNES, r) ? 0 : r.startsWith('key:') ? 3 : Number(r.slice(-1)));
// 장비 옵션 나누기: 원래 옵션, 소켓 수, 꽂힌 룬 옵션
export const plainAffixes = (list: Affix[]) => list.filter((a) => !a.r && a.kind !== 'socket');
export const socketsOf = (list: Affix[]) => list.find((a) => a.kind === 'socket')?.value ?? 0;
export const runesIn = (list: Affix[]) => list.filter((a) => a.r);
