// 무너진 성소(설계: docs/superpowers/specs/2026-11-19-sanctum-design.md).
// 성물 넷(지역 보스가 하나씩) → 초원 1구역 한가운데 입구 → 성소 1~5층. 5층은 손으로 짠 결전장: 성소 넷이 켜져 있는 동안 타락한 성기사는 무적.
// three.js·Math.random 금지.
import { mulberry } from './dungeon';
import type { Chest, World } from './rules';

// offer: 성물 바치기(초), window: 고리가 깨진 뒤 피해가 들어가는 시간, relight: 창이 끝나면 다시 켜는 성소 수,
// guard: 기사가 지키는 거리(m), stagger: 고리가 깨질 때 성기사 기절(초), bossHp: 성기사 체력 배율(창에만 맞으므로 낮춘다),
// depth: 이야기 깊이(폐허 다음, 21~25), chance·pity: 성물이 떨어질 확률, 놓친 횟수가 이만큼이면 다음은 확정
export const SANCTUM = { offer: 2, window: 10, relight: 2, guard: 3, stagger: 1.5, bossHp: 0.5, depth: 20, chance: 0.5, pity: 2, knights: 2 };
export const RELICS = ['금 간 성배', '서리 낀 기도서', '부러진 성검 자루', '그을린 성유물함']; // STORY 순서(초원·설원·미궁·폐허)
export const ALL_RELICS = 0b1111;
export const relicCount = (relics: number) => [1, 2, 4, 8].filter((b) => relics & b).length;
export const nameSalt = (s: string) => [...s].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619), 2166136261 | 0);
// 회차·지역마다 정해진 굴림(죽고 다시 들어가도 같다 — 재도전으로 확률을 다시 굴리지 못하게)
export const relicRoll = (cycle: number, k: number, salt: number) => mulberry(salt ^ Math.imul(cycle * 4 + k + 1, 0x9e3779b1))();
// 지역 k(STORY 순서) 보스가 이번에 성물을 떨구나. 이미 가졌으면 아니고, pity번 놓쳤으면 확정
export const relicDue = (relics: number, miss: number[], k: number, cycle: number, salt: number) => k >= 0 && !((relics >> k) & 1) && (miss[k] >= SANCTUM.pity || relicRoll(cycle, k, salt) < SANCTUM.chance);
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

// 순찰대장: 성기사를 쓰러뜨리고 돌아왔을 때(성물이 무엇이었는지 그제야 말해 준다)
export const SANCTUM_DONE = '타락한 성기사… 한때는 이 땅을 지키던 이였다네. 자네가 모은 성물도 그가 쓰던 물건이었지. 이제 초원 밑의 붉은 빛도 잦아들었네. 자네 덕일세. 다만 그 입구는 닫히지 않았어. 언젠가 다시 깨어날지 모르니, 생각나면 들여다봐 주게.';
