// 무너진 성소(설계: docs/superpowers/specs/2026-11-19-sanctum-design.md).
// 성물 넷(지역 보스가 하나씩) → 초원 1구역 한가운데 입구 → 성소 1~5층. 5층은 손으로 짠 결전장: 성소 넷이 켜져 있는 동안 기도하는 자(성기사 그림)는 무적.
// three.js·Math.random 금지.
import { mulberry } from './dungeon';
import type { Chest, World } from './rules';

// offer: 성물 바치기(초), window: 고리가 깨진 뒤 피해가 들어가는 시간, relight: 창이 끝나면 다시 켜는 성소 수,
// guard: 기사가 지키는 거리(m), stagger: 고리가 깨질 때 성기사 기절(초), bossHp: 성기사 체력 배율(창에만 맞으므로 낮춘다),
// depth: 이야기 깊이(폐허 다음, 21~25), chance·pity: 성물이 떨어질 확률, 놓친 횟수가 이만큼이면 다음은 확정
// haloAgain: 다시 쓰러뜨릴 때 「금 간 빛 고리」가 나올 확률(처음엔 확정), fallTalk: 쓰러진 뒤 대화창까지(초, 쓰러지는 모습)
export const SANCTUM = { offer: 2, window: 10, relight: 2, guard: 3, stagger: 1.5, bossHp: 0.8, depth: 20, chance: 0.5, chance2: 0.9, pity: 2, knights: 2, haloAgain: 0.1, fallTalk: 2 };
// 성기사 전용 기술(설계: docs/superpowers/specs/2026-11-19-paladin-skills-design.md). 피해 = 성기사 평타 굴림 × *Mult
// 빛의 사슬: beamR(m) 안이면 데이고 같은 대상은 beamEvery초에 한 번. 새로 이을 때(기절·성검의 비가 끝나거나 성소가 다시 켜질 때) beamWarn초는 바닥에 붉은 예고만.
// 성검의 비: rainFirst초 뒤 처음, rainCd마다. raise초 치켜든 뒤 표식 rainCount개(주인공 발밑·곁 하나 + 성기사 rainRange m 안, 서로 rainGap, 성소에서 altarGap 떨어짐)
//   → rainDelay초 뒤 반경 swordR에 꽂히고 swordWall초 동안 그 칸이 벽.
// 심판: 체력 절반 아래가 된 뒤 judgeFirst초, 그다음 judgeCd마다. judgeWindup초 기도 → 성기사에게서 judgeSafe m 밖 전부
export const PALADIN = { beamR: 0.4, beamEvery: 1, beamMult: 0.5, beamWarn: 1.2, rainFirst: 6, rainCd: 12, raise: 0.8, rainDelay: 1, rainCount: 8, rainRange: 12, rainGap: 1.5, altarGap: 2, swordR: 0.7, swordMult: 1.5, swordWall: 6, judgeFirst: 3, judgeCd: 18, judgeWindup: 2.5, judgeSafe: 3, judgeMult: 3 };
// 귀중품: 0~3 = 성물(STORY 순서 초원·설원·미궁·폐허), 4 = 작은 목마(기도하는 자를 처음 쓰러뜨리면. 가졌으면 그 뒤는 짧은 대화)
export const RELICS = ['금 간 성배', '서리 낀 기도서', '부러진 성검 자루', '그을린 성유물함', '작은 목마'];
export const ALL_RELICS = 0b1111;
export const HORSE = 4;
export const hasAllRelics = (relics: number) => (relics & ALL_RELICS) === ALL_RELICS;
export const hasHorse = (relics: number) => !!((relics >> HORSE) & 1);
export const relicCount = (relics: number) => [1, 2, 4, 8].filter((b) => relics & b).length;
export const nameSalt = (s: string) => [...s].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619), 2166136261 | 0);
// 회차·지역마다 정해진 굴림(죽고 다시 들어가도 같다 — 재도전으로 확률을 다시 굴리지 못하게)
export const relicRoll = (cycle: number, k: number, salt: number) => mulberry(salt ^ Math.imul(cycle * 4 + k + 1, 0x9e3779b1))();
// 지역 k(STORY 순서) 보스가 이번에 성물을 떨구나. 이미 가졌으면 아니고, pity번 놓쳤으면 확정
export const relicDue = (relics: number, miss: number[], k: number, cycle: number, salt: number) => k >= 0 && !((relics >> k) & 1) && (miss[k] >= SANCTUM.pity || relicRoll(cycle, k, salt) < (cycle >= 1 ? SANCTUM.chance2 : SANCTUM.chance));
// 회차 첫 처치였는데 성물이 안 나왔으면 놓친 횟수 +1
export const missAfter = (miss: number[], k: number, got: boolean) => (got || k < 0 ? miss : miss.map((n, i) => (i === k ? Math.min(SANCTUM.pity, n + 1) : n)));

// 5층 결전장(48×48): 반지름 14 원형 방 + 남쪽 복도, 기둥 넷, 대각선 성소 넷('$'), 화로, 가운데 성기사('M'), 복도 끝 주인공('H')
export const ARENA = { size: 48, center: [24, 21], r: 14, altars: [[16, 13], [32, 13], [32, 29], [16, 29]], pillars: [[19, 16], [29, 16], [19, 26], [29, 26]], braziers: [[10, 14], [38, 14], [10, 28], [38, 28], [24, 8]], hero: [24, 42] };
export function generateArena(): string[] {
  const { size, center: [cx, cz], r } = ARENA;
  const g = Array.from({ length: size }, (_, z) => Array.from({ length: size }, (_, x): string => (Math.hypot(x + 0.5 - cx, z + 0.5 - cz) <= r || (x >= 22 && x <= 26 && z >= 33 && z <= size - 3) ? '.' : '#')));
  for (const [x, z] of ARENA.pillars) for (const [a, b] of [[0, 0], [1, 0], [0, 1], [1, 1]]) g[z + b][x + a] = '#';
  for (const [x, z] of ARENA.altars) g[z][x] = '$';
  for (const [x, z] of ARENA.braziers) g[z][x] = 'B';
  g[cz][cx] = 'M';
  g[ARENA.hero[1]][ARENA.hero[0]] = 'H';
  return g.map((row) => row.join(''));
}

// 성기사가 빛 고리에 싸여 있나: 성소 5층에서 고리가 깨진 창(bareT)이 아니고 켜진 성소(열리지 않은 altar)가 하나라도 있으면
export const warded = (w: World) => w.land === 'sanctum' && w.bareT <= 0 && w.chests.some((c) => c.kind === 'altar' && !c.open);
// 성소 곁에 살아 있는 해골 기사 왕(지키는 중이라 바칠 수 없다)
export const guardOf = (w: World, ch: Chest) => w.entities.find((e) => e.kind === 'king' && e.state !== 'dead' && Math.hypot(e.x - ch.x - 0.5, e.z - ch.z - 0.5) <= SANCTUM.guard);

// 이야기(설계: docs/superpowers/specs/2026-11-19-prayer-story-design.md). 글은 설계서 그대로 — 번역투 금지, 전작 이름(아이온·아코스)은 쓰지 않는다
// 순찰대장: 기도하는 자를 쓰러뜨리고 돌아왔을 때
export const SANCTUM_DONE = '땅 밑에서 들리던 소리가 그쳤네. 고블린도 눈에 띄게 줄었고. …그게 누구였는지는 묻지 않겠네. 자네 얼굴을 보니 말하고 싶은 이야기가 아닌 것 같으니. 왕도에는 근원을 끊었다고만 적어 보내겠네. 다만 그 입구는 아직 닫히지 않았어.';
// 귀중품을 어디서 거뒀나(RELICS 순서). 가진 것의 출처를 보면 남은 지역을 알 수 있다
export const RELIC_FROM = ['초원의 개미귀신', '설원의 서리 와이번', '미궁의 미노타우르스', '폐허의 심연의 악마', '무너진 성소의 기도하는 자'];
// 귀중품 설명(RELICS 순서). 어디에 쓰는지·몇 개인지는 말하지 않는다 — 물건 생김새만
export const RELIC_TEXT = [
  '작은 손으로 감싸 쥐기 좋은 크기다. 바닥에 검게 눌어붙은 약 찌꺼기가 남아 있다.',
  "앞장의 기도는 '멈춘 시간 속에 고이 잠드소서'로 끝난다. 뒷장부터는 다른 손글씨로, '돌아오소서'만 빼곡하다.",
  '자루에 새긴 이름이 날카로운 것으로 긁혀 지워져 있다.',
  '비단에 겹겹이 싸인 작은 톱니 조각 하나. 이것 하나를 모시려고 만든 함이다.',
  '손잡이만 반들반들하게 닳았다. 누군가 오래 쥐고 있었다.',
];
// 성소 1~4층에 하나씩 놓이는 흔적(층 순서)
export const TRACES = [
  { name: '무릎 자국', text: '돌바닥에 무릎 자국 두 개가 깊게 패여 있다. 누군가 아주 오래 같은 자리에 꿇어앉아 있었다.' },
  { name: '이름이 새겨진 벽', text: "벽에 이름이 줄지어 새겨져 있다. 이름마다 옆에 같은 말이 붙어 있다. '지켰다.' 맨 끝 이름 옆만 비어 있다." },
  { name: '핀이 뽑힌 지도', text: '벽에 초원 일대를 그린 지도가 걸려 있다. 네 곳에 핀이 꽂혀 있었는데, 모두 뽑혀 바닥에 떨어져 있다.' },
  { name: '작은 침상', text: '작은 침상 하나. 머리맡에 식은 약사발. 이불은 반듯하게 개어져 있고, 오래 아무도 눕지 않았다.' },
];
// 5층 대화: [말하는 이(빈칸 = 지문), 글, 꾸밈]. first = 처음 쓰러뜨리는 판(목마가 아직 없다)
export type Line = [string, string, string?]; // 셋째 = 대화창 꾸밈(class)
const WHO = '기도하는 자';
export const PRAYER_RISE = '"선대여, 일어나소서. 한 번만 더 지켜 주소서."'; // 체력 절반, 해골 기사 왕이 일어날 때(화면 한 줄)
export const prayerMeet = (first: boolean): Line[] =>
  (first
    ? ['…그대였소. 넷을 모두 거둬 간 이가.', '들판과 눈밭, 땅 밑 미궁과 무너진 성채. 모두 내가 하나씩 놓아 둔 것이오. 그분께서 돌아오실 길이었소.', '백 년을 이어 온 기도였소. 그대는 그것을 길가의 돌 줍듯 거둬 갔지.', '칼을 뽑으시오. 그것들은 그대의 것이 아니오.']
    : ['…또 왔소.']
  ).map((t) => [WHO, t]);
export const prayerFall = (first: boolean): Line[] =>
  first
    ? [
        [WHO, '…왕국을 다시 일으키겠다고 말해 왔소. 선대들에게도, 나 자신에게도.'],
        [WHO, '옛날 한 왕이 그분께 빌었다 하오. 죽어 가는 아이를 살려 달라고. 그분은 왕국의 시간을 통째로 멈춰 주셨소.'],
        [WHO, '나도 그렇게 빌고 싶었을 뿐이오. 그 아이가 숨을 거두기 사흘 전으로만, 돌려 달라고.'],
        [WHO, '…그 왕의 아이는, 살았소?'],
        ['', '대답할 말이 없다.'],
        [WHO, '그분은… 끝내 오시지 않는구려.'],
      ]
    : [[WHO, '그분은… 끝내 오시지 않는구려.']];
// 엔딩(설계: docs/superpowers/specs/2026-11-23-prayer-ending-design.md). 처음 쓰러뜨릴 때만
// 시간의 마녀: 이름 없이 두 줄(셋째 칸 = 대화창 꾸밈. 지문과 구별되게)
export const WITCH_LINES: Line[] = [
  ['', '"…또 한 사람이, 이렇게 아파하고 있었구나."', 'witch'],
  ['', '"멈춘 시간 속에, 고이 잠드소서."', 'witch'],
];
// 후일담: 검은 화면에 한 줄씩
export const EPILOGUE = ['그날 밤부터, 땅 밑의 기도 소리는 더 들리지 않았다.', '초원의 고블린은 계절이 바뀔 무렵 눈에 띄게 줄었다.', '성소의 빛은 다시 켜지지 않았다.', '작은 목마 하나가 짐 속에 남았다.'];
