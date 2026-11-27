// 미궁(방 + 복도)이 아닌 바깥 지역의 맵(72×72). 결과는 generateFloor와 같은 글자 맵 + '=' 길, 'F'·'S' 출구(맨 바깥 줄, → 초원·설원).
// 디아블로2의 평지처럼: 가장자리는 숲(초원)·얼음 절벽(설원) 띠, 들어온 가장자리에서 다른 가장자리의 출구까지 구불구불한 길.
// 초원: 탁 트인 들판에 바위 무더기, 몬스터는 야영지마다 떼로(모닥불 'B' + 무리가 다 쓰러져야 열리는 상자 'C'). 설원: 눈밭에 얼음 바위 덩어리, 몬스터는 둘셋씩.
// 초원 1구역은 갈림길: 초원·설원·폐허 출구와 맵 안쪽 먼 곳의 동굴 입구('>', 계단 → 미궁 1층). 그 밖은 같은 지역 출구 하나, 마지막 구역은 출구 대신 보스.
// 안 열린 지역의 출구는 막힌다(설원 's'·폐허 'r', 동굴 입구는 큰 돌 'o'). 야영지(generateCamp)는 늘 같은 48칸 맵.
// three.js·Math.random 금지. 시드가 같으면 같은 맵.
import { finish, FLOORS, generateFloor, mulberry, OPEN, SIZE, themeFor, walkDistances, type Theme } from './dungeon';
import type { Cell } from './path';
import { isHub, type Land } from './rules';
import { generateArena } from './sanctum';
import { flows } from './sluice';
import { generateMine, generateMineArena } from './minemap';
import { generateTemple, generateTempleArena } from './templemap';
import { generateWarp, generateWarpArena } from './warpmap';
import type { Sluice } from './rules';

export const GATE_FIRES = [[-3, -3], [4, -3], [-3, 4], [4, 4]]; // 성소 입구(2×2의 위쪽 모서리 칸)에서 화로 넷
export const WILD = 72; // 바깥 맵 크기(미궁은 SIZE 48)
export type Side = 'n' | 'e' | 's' | 'w'; // 가장자리: n = z 0, s = z 끝, w = x 0, e = x 끝
export const opposite: Record<Side, Side> = { n: 's', s: 'n', e: 'w', w: 'e' };
const SIDES: Side[] = ['n', 'e', 's', 'w'];
type Wild = 'field' | 'snow' | 'ruins' | 'lake' | 'raid';
const ISLE = FLOORS - 1; // 호숫가 섬 나루 구역

// open = 열린 지역(초원 1구역 갈림길에서 갈 수 있는 곳, 없으면 다 열림), mark = 놓을 의뢰 대상 글자(L 흔적·J 봉화·k 궤·O 봉인)
export function makeMap(seed: number, floor: number, land: Land = 'dungeon', from: Side = 'w', open?: Land[], mark?: string): string[] {
  if (land === 'camp') return generateCamp(!!open?.includes('tent'));
  if (land === 'tent') return generateTent(!!open?.includes('raid'), !!open?.includes('mine'), !!open?.includes('temple'), !!open?.includes('warp'));
  // ponytail: 결전장(FLOORS)은 파수꾼을 만들 때(④) 손 맵으로. 그때까지 3층 맵
  const map = land === 'warp' ? (floor >= FLOORS ? generateWarpArena() : generateWarp(seed, floor, from)) : land === 'sanctum' ? (floor >= FLOORS ? generateArena() : generateFloor(seed, floor)) : land === 'lake' && floor >= FLOORS ? generateLakeArena() : land === 'raid' && floor >= FLOORS ? generateRaidArena() : land === 'mine' ? (floor >= FLOORS ? generateMineArena() : generateMine(seed, floor, from)) : land === 'temple' ? (floor >= FLOORS ? generateTempleArena() : generateTemple(seed, floor, from)) : land === 'dungeon' ? generateFloor(seed, floor) : generateWild(seed, floor, land, from, open);
  return mark ? withMark(map, seed, mark) : map;
}

// 의뢰 대상 하나(글자 letter): 주인공에서 걸어서 가장 먼 곳의 40~70% 거리. 바깥 지역은 길에서 3칸 안(지나가며 보이게), 미궁은 방 안(5×5가 다 트인 곳).
// 둘레 8칸이 다 트인 칸에만 놓아 길을 끊지 않는다. 앞의 난수열(땅·몬스터)을 바꾸지 않게 따로 굴린다
export function withMark(map: string[], seed: number, letter: string): string[] {
  const cells = map.map((r) => r.split(''));
  const [W, H] = [map[0].length, map.length];
  const hz = map.findIndex((r) => r.includes('H'));
  const d = walkDistances(cells, map[hz].indexOf('H'), hz);
  const far = Math.max(...d);
  const road = map.some((r) => r.includes('='));
  const around = (x: number, z: number, r: number, ok: (c: string) => boolean) => {
    for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) if (ok(cells[z + dz]?.[x + dx] ?? '#')) return true;
    return false;
  };
  const find = (r: number, lo = 0.4, hi = 0.7) => {
    const spots: Cell[] = [];
    for (let z = 1; z < H - 1; z++)
      for (let x = 1; x < W - 1; x++) {
        const k = d[z * W + x];
        if (cells[z][x] !== '.' || k < lo * far || k > hi * far || around(x, z, r, (c) => !OPEN(c))) continue;
        if (!road || around(x, z, 3, (c) => c === '=')) spots.push([x, z]);
      }
    return spots;
  };
  let spots = road ? find(1) : find(2).length ? find(2) : find(1); // 미궁에 넓은 방이 거기 없으면 둘레 8칸만
  if (!spots.length) spots = find(1, 0.15, 1); // 그 거리에 없으면 더 넓게(성소 흔적은 이야기라 빠지면 안 된다)
  if (!spots.length) return map; // 놓을 데가 없으면 없이(의뢰는 선택이라 진행이 막히지 않는다)
  const [x, z] = spots[Math.floor(mulberry(seed ^ 0x51ed)() * spots.length)];
  cells[z][x] = letter;
  // 잠긴 궤: 둘레 2칸의 빈 자리에 정예 전사 하나와 졸개 둘이 지킨다
  if (letter === 'k') {
    const guards = ['W', 'm', 'm'];
    for (const [dx, dz] of [[2, 0], [-2, 0], [0, 2], [0, -2], [2, 2], [-2, -2]]) if (guards.length && cells[z + dz]?.[x + dx] === '.') cells[z + dz][x + dx] = guards.shift()!;
  }
  return cells.map((r) => r.join(''));
}
export const themeOf = (floor: number, land: Land): Theme => (land === 'dungeon' ? themeFor(floor) : isHub(land) ? 'field' : land);
export const wildCount = (floor: number, land: Wild) => (land === 'field' ? 18 : 16) + 4 * (floor - 1); // 몬스터 수(잠든 몬스터·무덤·보물 고블린은 따로)
// 이 구역의 출구가 이끄는 곳. 초원 1구역만 갈림길(초원 2·설원 1·폐허 1·미궁 1, 미궁은 동굴 입구), 지역을 고른 뒤로는 그 지역의 다음 구역뿐. 마지막 구역은 없음
export const exitsFor = (floor: number, land: Wild): Land[] => (floor >= FLOORS ? [] : land === 'field' && floor === 1 ? ['field', 'snow', 'ruins', 'dungeon'] : [land]);
const MIN_OPEN = 1500; // 걸어 다닐 칸이 이보다 적으면 다시 만든다
const N = WILD;
// 가장자리 side에서 가장자리를 따라 t번째, 안쪽으로 k칸
const at = (side: Side, t: number, k: number, n = N): Cell => (side === 'n' ? [t, k] : side === 's' ? [t, n - 1 - k] : side === 'w' ? [k, t] : [n - 1 - k, t]);

// 바깥 맵. 안 열린 지역의 출구는 막는 글자(설원 's'·폐허 'r'), 동굴 입구는 큰 돌('o')로 바꾼다.
// 다 만든 뒤 글자만 바꿔서 같은 시드면 잠금과 상관없이 같은 맵이다
export function generateWild(seed: number, floor: number, land: Wild, from: Side = 'w', open?: Land[]): string[] {
  const map = wild(seed, floor, land, from);
  if (!open) return map;
  const shut: Record<string, string> = {};
  if (!open.includes('snow')) shut.S = 's';
  if (!open.includes('ruins')) shut.R = 'r';
  if (!open.includes('dungeon')) shut['>'] = 'o';
  if (!open.includes('sanctum')) shut['*'] = '%';
  const out = map.map((row) => row.replace(/[SR>*l]/g, (c) => shut[c] ?? c));
  // 성소가 안 열렸으면 입구 자리는 그냥 빈터(화로·뼈 없이, 밟고 지나간다). 갈라지는 금은 render가 성물 수로 그린다
  const gz = out.findIndex((row) => row.includes('%'));
  if (gz < 0) return out;
  const gx = out[gz].indexOf('%');
  return out.map((row, z) => (Math.abs(z - gz - 0.5) > 5 ? row : row.replace(/[B,]/g, (c, x: number) => (Math.abs(x - gx - 0.5) > 5 ? c : '.'))));
}

// 고정된 맵(초원 1구역)에 다른 땅에서 들어왔을 때: 주인공('H')을 그 땅으로 가는 출구(글자 letters)에서 3칸쯤 떨어진 길·빈 땅으로 옮긴다. 출구가 없으면 그대로
export function arriveAt(map: string[], letters: string): string[] {
  const cells: Cell[] = [];
  map.forEach((row, z) => [...row].forEach((c, x) => letters.includes(c) && cells.push([x, z])));
  if (!cells.length) return map;
  const [mx, mz] = [cells.reduce((a, c) => a + c[0], 0) / cells.length, cells.reduce((a, c) => a + c[1], 0) / cells.length];
  let best: Cell | null = null;
  let gap = Infinity;
  for (let z = Math.round(mz) - 6; z <= mz + 6; z++)
    for (let x = Math.round(mx) - 6; x <= mx + 6; x++) {
      const d = Math.abs(Math.hypot(x - mx, z - mz) - 3);
      if ('.='.includes(map[z]?.[x] ?? '#') && d < gap) [best, gap] = [[x, z], d];
    }
  if (!best) return map;
  const [hx, hz] = best;
  return map.map((row, z) => [...row].map((c, x) => (x === hx && z === hz ? 'H' : c === 'H' ? '.' : c)).join(''));
}

// 야영지(48×48): 늘 같은 모양. 가운데 모닥불(B)과 다져진 흙마당, 모닥불 남쪽에 주인공(H)·서쪽에 순찰대장(E)·북쪽에 상인(V), 마당 가에 짐더미(o)·창고(h, 주인공 바로 남쪽 — 들어오자마자 화면에 보이게).
// 동쪽으로 곧은 길 끝, 맨 바깥 줄에 초원 1구역 출구(F 3칸). 가장자리는 숲 띠, 마당 밖에 바위·잔해. 몬스터·상자·기믹은 없다.
// expedition = 2막이 열렸다: 마당 북동쪽에서 꺾여 북쪽 숲 띠를 뚫는 원정길과 맨 바깥 줄 출구(x 3칸, → 원정대 천막). 난수열은 그대로라 나머지 모양은 같다
const CAMP_SEED = 7;
export function generateCamp(expedition = false): string[] {
  const M = SIZE;
  const c = M / 2;
  const rand = mulberry(CAMP_SEED);
  const int = (lo: number, hi: number) => lo + Math.floor(rand() * (hi - lo + 1));
  const inside = (x: number, z: number) => x > 0 && z > 0 && x < M - 1 && z < M - 1;
  const cells: string[][] = Array.from({ length: M }, (_, z) => Array.from({ length: M }, (_, x) => (inside(x, z) ? '.' : '#')));
  const set = ([x, z]: Cell, ch: string) => inside(x, z) && (cells[z][x] = ch);
  for (const side of SIDES)
    for (let t = 0, th = int(2, 4); t < M; t++, th = Math.min(4, Math.max(2, th + int(-1, 1)))) for (let k = 0; k < th; k++) set(at(side, t, k, M), '#');
  // 바위 무더기: 마당(반지름 9)과 길(동쪽 띠) 밖에만
  for (let k = int(10, 14); k > 0; k--) {
    const [cx, cz, r] = [int(5, M - 6), int(5, M - 6), 0.8 + rand()];
    if (Math.hypot(cx - c, cz - c) < 10 || (cx > c && Math.abs(cz - c) < 5)) continue;
    for (let z = Math.floor(cz - r); z <= cz + r; z++) for (let x = Math.floor(cx - r); x <= cx + r; x++) if (Math.hypot(x - cx, z - cz) <= r) set([x, z], '#');
  }
  for (let z = 0; z < M; z++) for (let x = 0; x < M; x++) if (Math.hypot(x - c, z - c) <= 5) set([x, z], '='); // 흙마당
  for (let x = c + 4; x < M - 1; x++) for (let z = c - 1; z <= c + 1; z++) cells[z][x] = '='; // 동쪽 길(숲 띠를 뚫는다)
  for (let z = c - 1; z <= c + 1; z++) cells[z][M - 1] = 'F';
  cells[c][c] = 'B';
  cells[c + 2][c] = 'H';
  // NPC는 모닥불 둘레 마당 가장자리에 서로 띄워서: 순찰대장(서), 상인(북), 의뢰인 주민(남동, 주인공 곁), 주민(남서)
  cells[c][c - 5] = 'E';
  cells[c - 5][c] = 'V';
  cells[c + 2][c + 4] = 'q';
  cells[c + 4][c - 3] = 'P';
  for (const [x, z] of [[c - 4, c - 4], [c + 4, c - 4], [c + 1, c + 5], [c + 5, c + 5]]) cells[z][x] = 'o';
  cells[c + 4][c + 2] = 'h';
  if (expedition) {
    for (let z = c - 4; z <= c - 2; z++) for (let x = c + 3; x <= c + 8; x++) cells[z][x] = '=';
    for (let z = 1; z < c - 2; z++) for (let x = c + 6; x <= c + 8; x++) cells[z][x] = '=';
    for (let x = c + 6; x <= c + 8; x++) cells[0][x] = 'x';
  }
  for (let k = 0; k < 20; k++) {
    const [x, z] = [int(4, M - 5), int(4, M - 5)];
    if (cells[z][x] === '.' && Math.hypot(x - c, z - c) > 6) cells[z][x] = ',';
  }
  const d = walkDistances(cells, c, c + 2); // 주인공에서 닿지 않는 땅은 메운다
  for (let z = 0; z < M; z++) for (let x = 0; x < M; x++) if (d[z * M + x] < 0 && OPEN(cells[z][x])) cells[z][x] = '#';
  return cells.map((row) => row.join(''));
}

// 원정대 천막(48×48, 2막 거점): 늘 같은 모양. 가운데 화덕(B)과 흙마당, 둘레에 천막(작은 것 넷·큰 것 하나), 순찰대장(E, 동)·상인(V, 북)·창고(h, 주인공 곁).
// 서쪽으로 곧은 길 끝, 맨 바깥 줄에 야영지로 돌아가는 출구(y 3칸). 북쪽 길 끝에 호숫가 1구역 출구(l 3칸)
const TENT_SEED = 11;
export const TENTS: [x: number, z: number, big: boolean][] = [[-8, -8, false], [5, -9, false], [7, 5, false], [-9, 5, false], [-2, -13, true]]; // 왼쪽 위 칸(마당 가운데 기준)
// raid = 뱃사공을 쓰러뜨렸다: 동쪽 길 끝에 약탈자 진지 1구역 출구(& 3칸). 난수열은 그대로라 나머지 모양은 같다
// mine = 우두머리를 쓰러뜨렸다: 남쪽 길 끝에 보랏빛 광산 1구역 출구(z 3칸)
// temple = 감독관을 쓰러뜨렸다: 남서쪽 길 끝에 사암 신전 1구역 출구('"' 3칸 — 네 방향이 다 찼다)
// warp = 문지기 사제를 쓰러뜨렸다: 북서쪽 길(큰 천막 서쪽) 끝에 뒤틀린 차원 1층 출구('Ω' 3칸)
export function generateTent(raid = false, mine = false, temple = false, warp = false): string[] {
  const M = SIZE;
  const c = M / 2;
  const rand = mulberry(TENT_SEED);
  const int = (lo: number, hi: number) => lo + Math.floor(rand() * (hi - lo + 1));
  const inside = (x: number, z: number) => x > 0 && z > 0 && x < M - 1 && z < M - 1;
  const cells: string[][] = Array.from({ length: M }, (_, z) => Array.from({ length: M }, (_, x) => (inside(x, z) ? '.' : '#')));
  const set = ([x, z]: Cell, ch: string) => inside(x, z) && (cells[z][x] = ch);
  for (const side of SIDES)
    for (let t = 0, th = int(2, 4); t < M; t++, th = Math.min(4, Math.max(2, th + int(-1, 1)))) for (let k = 0; k < th; k++) set(at(side, t, k, M), '#');
  for (let k = int(8, 12); k > 0; k--) {
    const [cx, cz, r] = [int(5, M - 6), int(5, M - 6), 0.8 + rand()];
    if (Math.hypot(cx - c, cz - c) < 16 || (cx < c && Math.abs(cz - c) < 5)) continue; // 마당·천막 둘레·서쪽 길 밖에만
    for (let z = Math.floor(cz - r); z <= cz + r; z++) for (let x = Math.floor(cx - r); x <= cx + r; x++) if (Math.hypot(x - cx, z - cz) <= r) set([x, z], '#');
  }
  for (let z = 0; z < M; z++) for (let x = 0; x < M; x++) if (Math.hypot(x - c, z - c) <= 6) set([x, z], '='); // 흙마당
  for (let x = 1; x <= c - 5; x++) for (let z = c - 1; z <= c + 1; z++) cells[z][x] = '='; // 서쪽 길
  for (let z = c - 1; z <= c + 1; z++) cells[z][0] = 'y';
  for (let z = 1; z <= c - 6; z++) for (let x = c + 2; x <= c + 4; x++) cells[z][x] = '='; // 북쪽 길(큰 천막과 작은 천막 사이) 끝에 호숫가 1구역 출구
  for (let x = c + 2; x <= c + 4; x++) cells[0][x] = 'l';
  if (raid) {
    for (let x = c + 5; x < M - 1; x++) for (let z = c + 1; z <= c + 3; z++) cells[z][x] = '='; // 동쪽 길(순찰대장 남쪽)
    for (let z = c + 1; z <= c + 3; z++) cells[z][M - 1] = '&';
  }
  if (mine) {
    for (let z = c + 5; z < M - 1; z++) for (let x = c + 2; x <= c + 4; x++) cells[z][x] = '='; // 남쪽 길(동쪽 작은 천막 서쪽)
    for (let x = c + 2; x <= c + 4; x++) cells[M - 1][x] = 'z';
  }
  if (temple) {
    for (let z = c + 3; z < M - 1; z++) for (let x = c - 7; x <= c - 5; x++) cells[z][x] = '='; // 남서쪽 길(창고 서쪽, 서남 작은 천막 동쪽)
    for (let x = c - 7; x <= c - 5; x++) cells[M - 1][x] = '"';
  }
  if (warp) {
    for (let z = 1; z < c - 5; z++) for (let x = c - 5; x <= c - 3; x++) cells[z][x] = '=';
    for (let x = c - 5; x <= c - 3; x++) cells[0][x] = 'Ω';
  }
  for (const [dx, dz, big] of TENTS) {
    const n = big ? 4 : 2;
    for (let z = 0; z < n; z++) for (let x = 0; x < n; x++) cells[c + dz + z][c + dx + x] = 'n';
    cells[c + dz][c + dx] = big ? 'i' : 'e';
  }
  cells[c][c] = 'B';
  cells[c + 2][c] = 'H';
  cells[c][c + 5] = 'E';
  cells[c - 5][c] = 'V';
  cells[c + 4][c - 2] = 'h';
  cells[c - 3][c - 4] = '}'; // 대장장이(담금질): 마당 북서쪽 — 창고(남서쪽)와 떨어뜨린다
  for (let k = 0; k < 20; k++) {
    const [x, z] = [int(4, M - 5), int(4, M - 5)];
    if (cells[z][x] === '.' && Math.hypot(x - c, z - c) > 7) cells[z][x] = ',';
  }
  const d = walkDistances(cells, c, c + 2);
  for (let z = 0; z < M; z++) for (let x = 0; x < M; x++) if (d[z * M + x] < 0 && OPEN(cells[z][x])) cells[z][x] = '#';
  return cells.map((row) => row.join(''));
}

function wild(seed: number, floor: number, land: Wild, from: Side): string[] {
  const rand = mulberry(seed);
  const int = (lo: number, hi: number) => lo + Math.floor(rand() * (hi - lo + 1)); // lo..hi 포함
  const inside = (x: number, z: number) => x > 0 && z > 0 && x < N - 1 && z < N - 1;
  let cells: string[][] = Array.from({ length: N }, (_, z) => Array.from({ length: N }, (_, x) => (inside(x, z) ? '.' : '#')));
  const set = ([x, z]: Cell, c: string) => inside(x, z) && (cells[z][x] = c);
  const isle = land === 'lake' && floor === ISLE;

  // 1. 바탕
  if (isle) for (let z = 1; z < N - 1; z++) for (let x = 1; x < N - 1; x++) cells[z][x] = 'u'; // 섬 나루: 온통 물(섬은 3. 뒤에)
  else if (land === 'field' || land === 'raid') {
    // 들판: 둥근 바위 무더기(약탈자 진지는 듬성듬성 — 붉은 바위 언덕)
    for (let k = land === 'raid' ? int(40, 55) : int(70, 90); k > 0; k--) {
      const [cx, cz, r] = [int(2, N - 3), int(2, N - 3), 0.8 + rand() * 2];
      for (let z = Math.floor(cz - r); z <= cz + r; z++) for (let x = Math.floor(cx - r); x <= cx + r; x++) if (Math.hypot(x - cx, z - cz) <= r) set([x, z], '#');
    }
  } else if (land === 'ruins') {
    // 무너진 돌집: 13칸 격자마다 6~10칸 네모 벽(한 겹), 벽을 따라 2~3칸짜리 틈 3~5군데. 가운데는 광장, 몇 곳은 다 무너진 터
    for (let bz = 4; bz < N - 12; bz += 13)
      for (let bx = 4; bx < N - 12; bx += 13) {
        if (Math.abs(bx + 6 - N / 2) < 8 && Math.abs(bz + 6 - N / 2) < 8) continue;
        if (rand() < 0.15) continue;
        const [w, h] = [int(6, 10), int(6, 10)];
        const [x0, z0] = [bx + int(0, 12 - w), bz + int(0, 12 - h)];
        const ring: Cell[] = []; // 테두리를 한 바퀴 순서대로
        for (let x = x0; x < x0 + w; x++) ring.push([x, z0]);
        for (let z = z0 + 1; z < z0 + h; z++) ring.push([x0 + w - 1, z]);
        for (let x = x0 + w - 2; x >= x0; x--) ring.push([x, z0 + h - 1]);
        for (let z = z0 + h - 2; z > z0; z--) ring.push([x0, z]);
        for (const c of ring) set(c, '#');
        for (let k = int(3, 5); k > 0; k--) for (let i = int(0, ring.length - 1), j = int(2, 3); j > 0; j--, i++) set(ring[i % ring.length], '.');
      }
    for (let k = int(25, 35); k > 0; k--) set([int(2, N - 3), int(2, N - 3)], '#'); // 쓰러진 기둥
  } else if (land === 'lake') {
    // 호숫가: 바위는 드문드문. 1구역(물가 마을) = 맵을 가로지르는 개울(폭 3~5, 굽이침) + 연못 둘 + 통나무집(5×5 벽 '|', 문 2칸). 바위·테두리('#')는 숲으로 그린다.
    // 2구역부터(갈대 늪) = 웅덩이가 촘촘(작은 웅덩이 셋 중 하나는 여울). 물을 지나는 길은 판자 다리가 된다(4. 길 뒤)
    for (let k = int(25, 35); k > 0; k--) {
      const [cx, cz, r] = [int(2, N - 3), int(2, N - 3), 0.7 + rand() * 1.3];
      for (let z = Math.floor(cz - r); z <= cz + r; z++) for (let x = Math.floor(cx - r); x <= cx + r; x++) if (Math.hypot(x - cx, z - cz) <= r) set([x, z], '#');
    }
    const pond = (cx: number, cz: number, r: number, c: string) => {
      for (let z = Math.floor(cz - r - 1); z <= cz + r + 1; z++) for (let x = Math.floor(cx - r - 1); x <= cx + r + 1; x++) if (Math.hypot(x - cx, (z - cz) * 1.2) <= r + (rand() - 0.5) * 0.8) set([x, z], c);
    };
    if (floor === 1) {
      const across = from === 'w' || from === 'e'; // 들어온 쪽과 나갈 쪽 사이를 가로막게
      let [mid, wid] = [N / 2 + int(-8, 8), int(3, 5)];
      for (let t = 0; t < N; t++) {
        if (t % 6 === 0) [mid, wid] = [Math.min(N - 14, Math.max(14, mid + int(-2, 2))), Math.min(5, Math.max(3, wid + int(-1, 1)))];
        for (let k = 0; k < wid; k++) set(across ? [mid + k, t] : [t, mid + k], 'u');
      }
      for (let k = 0; k < 2; k++) pond(int(10, N - 11), int(10, N - 11), 3 + rand() * 2, 'u');
      for (let k = int(5, 6), guard = 0; k > 0 && guard < 60; guard++) {
        const [x0, z0] = [int(6, N - 12), int(6, N - 12)];
        if (cells.slice(z0 - 1, z0 + 6).some((row) => row.slice(x0 - 1, x0 + 6).some((c) => c !== '.'))) continue; // 물·바위·다른 집과 겹치지 않게
        for (let z = z0; z < z0 + 5; z++) for (let x = x0; x < x0 + 5; x++) if (z === z0 || z === z0 + 4 || x === x0 || x === x0 + 4) set([x, z], '|');
        const door = int(0, 3); // 문: 네 벽 중 하나 가운데 2칸
        for (const k2 of [1, 2]) set(door === 0 ? [x0 + 1 + k2, z0] : door === 1 ? [x0 + 4, z0 + 1 + k2] : door === 2 ? [x0 + 1 + k2, z0 + 4] : [x0, z0 + 1 + k2], '.');
        k--;
      }
    } else {
      for (let k = int(26, 34); k > 0; k--) {
        const r = 1.5 + rand() * 3.5;
        pond(int(4, N - 5), int(4, N - 5), r, r < 2.6 && rand() < 0.35 ? 'v' : 'u');
      }
    }
  } else {
    // 눈밭: 얼음 바위 지대 몇 곳(맵의 1/3쯤)에만 45%를 벽으로 뿌리고, 둘레 9칸 중 벽이 5칸 이상이면 벽 — 네 번
    const zone = new Uint8Array(N * N);
    for (let k = int(10, 14); k > 0; k--) {
      const [cx, cz, r] = [int(4, N - 5), int(4, N - 5), 5 + rand() * 5];
      for (let z = 1; z < N - 1; z++) for (let x = 1; x < N - 1; x++) if (Math.hypot(x - cx, z - cz) <= r) zone[z * N + x] = 1;
    }
    for (let z = 1; z < N - 1; z++) for (let x = 1; x < N - 1; x++) if (zone[z * N + x] && rand() < 0.45) cells[z][x] = '#';
    for (let pass = 0; pass < 4; pass++)
      cells = cells.map((row, z) =>
        row.map((c, x) => {
          if (!zone[z * N + x]) return c;
          let walls = 0;
          for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) if (!inside(x + dx, z + dz) || cells[z + dz][x + dx] === '#') walls++;
          return walls >= 5 ? '#' : '.';
        }),
      );
  }

  const wet = new Uint8Array(N * N); // 길을 내기 전의 물·여울(다리 자리)
  for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) if ('uv'.includes(cells[z][x])) wet[z * N + x] = 1;

  // 2. 가장자리 띠: 두께 2~5칸이 들쭉날쭉
  for (const side of SIDES)
    for (let t = 0, th = int(2, 5); t < N; t++, th = Math.min(5, Math.max(2, th + int(-1, 1)))) for (let k = 0; k < th; k++) set(at(side, t, k), '#');

  // 3. 들어온 곳과 출구: 들어온 가장자리를 뺀 가장자리 중에 바깥 출구마다 하나(맨 바깥 줄 3칸)
  const kinds = exitsFor(floor, land);
  const others = SIDES.filter((s) => s !== from);
  for (let i = others.length - 1; i > 0; i--) {
    const j = int(0, i);
    [others[i], others[j]] = [others[j], others[i]];
  }
  const outer = kinds.filter((k): k is Wild => k !== 'dungeon');
  const exits = outer.map((to, i) => ({ side: others[i], t: isle ? N / 2 : int(N / 2 - 15, N / 2 + 15), to })); // 섬 나루는 가장자리 가운데(섬 자리)
  const t0 = isle ? N / 2 : int(N / 2 - 10, N / 2 + 10);
  const hero = at(from, t0, 4);
  for (let k = 1; k <= 6; k++) for (let s = -1; s <= 1; s++) set(at(from, t0 + s, k), '.');
  if (land === 'field' && floor === 1) for (let s = -1; s <= 1; s++) { // 초원 1구역: 들어온 가장자리(야영지 쪽) 맨 바깥 줄에 야영지로 돌아가는 출구
    for (let k = 1; k <= 3; k++) set(at(from, t0 + s, k), '=');
    const [x, z] = at(from, t0 + s, 0);
    cells[z][x] = 'y';
  }

  // 4. 길: 주인공에서 각 출구(마지막 구역은 맞은편 가장자리 가까이의 보스 자리)까지 2칸 폭, 4~8걸음마다 옆으로 1~3칸 휜다
  const road = (to: Cell, start: Cell = hero) => {
    let [x, z] = start;
    let bend = int(4, 8);
    for (let guard = 0; guard < 2000 && (x !== to[0] || z !== to[1]); guard++) {
      const [dx, dz] = [to[0] - x, to[1] - z];
      if (--bend <= 0 && Math.abs(dx) + Math.abs(dz) > 8) {
        const sway = (rand() < 0.5 ? -1 : 1) * int(1, 3);
        for (let k = 0; k < Math.abs(sway); k++) {
          if (Math.abs(dx) >= Math.abs(dz)) z = Math.min(N - 5, Math.max(4, z + Math.sign(sway)));
          else x = Math.min(N - 5, Math.max(4, x + Math.sign(sway)));
          for (const [ox, oz] of [[0, 0], [1, 0], [0, 1], [1, 1]]) set([x + ox, z + oz], '=');
        }
        bend = int(4, 8);
      }
      if (Math.abs(dx) >= Math.abs(dz)) x += Math.sign(dx);
      else z += Math.sign(dz);
      for (const [ox, oz] of [[0, 0], [1, 0], [0, 1], [1, 1]]) set([x + ox, z + oz], '=');
    }
  };
  const ferries = isle ? islands(cells, rand, hero, from, exits[0].side) : [];
  // 호숫가 1구역: 들어온 곳과 출구 사이 길목에 마을 광장(7×7) — 길이 광장을 지나 사제·앓는 주민을 꼭 만난다
  let square: Cell | null = null;
  if (land === 'lake' && floor === 1) {
    const [ex, ez] = at(exits[0].side, exits[0].t, 1);
    const spots: Cell[] = [];
    for (const f of [0.5, 0.4, 0.6]) for (const oz of [0, -4, 4]) for (const ox of [0, -4, 4]) spots.push([Math.round(hero[0] + (ex - hero[0]) * f) + ox, Math.round(hero[1] + (ez - hero[1]) * f) + oz]);
    const dry = ([cx, cz]: Cell) => cells.slice(cz - 4, cz + 5).every((r) => r.slice(cx - 4, cx + 5).every((c) => '.#'.includes(c)));
    square = spots.find((p) => inside(p[0] - 4, p[1] - 4) && inside(p[0] + 4, p[1] + 4) && dry(p)) ?? spots[0];
    for (let z = -3; z <= 3; z++) for (let x = -3; x <= 3; x++) set([square[0] + x, square[1] + z], '.');
  }
  for (const e of exits) {
    if (square) road(square);
    if (!isle) road(at(e.side, e.t, 1), square ?? hero);
    for (let s = -1; s <= 1; s++) {
      for (let k = 1; k <= 2; k++) set(at(e.side, e.t + s, k), '=');
      const [x, z] = at(e.side, e.t + s, 0);
      cells[z][x] = e.to === 'field' ? 'F' : e.to === 'snow' ? 'S' : e.to === 'lake' ? 'l' : e.to === 'raid' ? '&' : 'R';
    }
  }
  const bossAt = at(opposite[from], int(N / 2 - 10, N / 2 + 10), 10);
  if (floor === FLOORS) road(bossAt);
  const gate: Cell = [N / 2, N / 2]; // 무너진 성소 입구(초원 1구역 한가운데, 길이 이어진다)
  if (kinds.includes('dungeon')) road(gate);
  cells[hero[1]][hero[0]] = 'H';
  // 호숫가: 길이 물·여울을 지난 칸은 판자 다리(걸을 수 있다)
  if (land === 'raid' && floor < FLOORS && !raidFort(cells, rand, floor, exits[0])) return wild(seed + 1, floor, land, from); // 약탈자 진지 요새
  if (land === 'lake' && !isle) sluiceMap(cells, rand, floor, from, exits[0], square); // 호숫가 퍼즐: 검은 샘·물길·바퀴·우물
  if (land === 'lake' && !isle) for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) if (cells[z][x] === '=' && wet[z * N + x]) cells[z][x] = '_';

  // 5. 주인공에서 걸어서 닿는 땅만 남긴다
  let d = walkDistances(cells, hero[0], hero[1]);
  let open = 0;
  for (let z = 0; z < N; z++)
    for (let x = 0; x < N; x++) {
      if (d[z * N + x] >= 0) open++;
      else if (OPEN(cells[z][x])) cells[z][x] = '#';
    }
  if (open < (isle ? MIN_ISLE : MIN_OPEN)) return wild(seed + 1, floor, land, from);
  const dist = ([x, z]: Cell) => d[z * N + x];
  const clear = ([cx, cz]: Cell, r: number) => {
    for (let z = cz - r; z <= cz + r; z++) for (let x = cx - r; x <= cx + r; x++) if (cells[z][x] === '#') cells[z][x] = '.';
  };
  const near = ([x, z]: Cell, [cx, cz]: Cell, r: number) => Math.max(Math.abs(x - cx), Math.abs(z - cz)) < r;
  const all: Cell[] = [];
  for (let z = 3; z < N - 3; z++) for (let x = 3; x < N - 3; x++) if (cells[z][x] === '.') all.push([x, z]);
  const keep: Cell[] = [hero, ...exits.map((e) => at(e.side, e.t, 1)), ...(square ? [square] : [])]; // 소품·몬스터를 두지 않을 자리(광장 포함)

  // 6. 동굴 입구(먼 곳, 둘레 5×5칸은 계단 그림 자리) 또는 보스(7×7 빈터)
  if (kinds.includes('dungeon')) {
    const far = Math.max(...d);
    const spots = all.filter((p) => dist(p) >= 0.7 * far && !near(p, gate, 10) && !exits.some((e) => near(p, at(e.side, e.t, 0), 10)));
    const cave = spots.length ? spots[int(0, spots.length - 1)] : all.reduce((a, b) => (dist(b) > dist(a) ? b : a));
    clear(cave, 2);
    cells[cave[1]][cave[0]] = '>';
    keep.push(cave);
    // 무너진 성소 입구: 13×13 빈터 가운데 2×2 입구('*', 안 열렸으면 generateWild가 '%' 빈터로 바꾸고 화로·뼈를 치운다), 네 귀퉁이 화로, 둘레 뼈 무더기
    clear(gate, 6);
    for (let z = -4; z <= 4; z++) for (let x = -4; x <= 4; x++) if (Math.hypot(x, z) >= 2.5 && rand() < 0.3) cells[gate[1] + z][gate[0] + x] = ',';
    for (const [x, z] of [[0, 0], [1, 0], [0, 1], [1, 1]]) cells[gate[1] + z][gate[0] + x] = '*';
    for (const [x, z] of GATE_FIRES) cells[gate[1] + z][gate[0] + x] = 'B';
    keep.push(gate);
  }
  if (floor === FLOORS) {
    clear(bossAt, 3);
    cells[bossAt[1]][bossAt[0]] = 'M';
    keep.push(bossAt);
  }
  d = walkDistances(cells, hero[0], hero[1]); // 빈터를 판 뒤 다시

  // 7. 꾸미기: 화로(모닥불)·상자는 길을 끊지 않는 자리에만, 잔해는 어디든
  const pick = (ok: (p: Cell) => boolean = () => true): Cell | null => {
    for (let tries = 0; tries < 80; tries++) {
      const p = all[int(0, all.length - 1)];
      if (cells[p[1]][p[0]] === '.' && dist(p) >= 0 && !keep.some((k) => near(p, k, 4)) && ok(p)) return p;
    }
    return null;
  };
  const connected = () => {
    const dd = walkDistances(cells, hero[0], hero[1]);
    return cells.every((row, z) => row.every((c, x) => !OPEN(c) || dd[z * N + x] >= 0));
  };
  const block = (c: string) => {
    const p = pick();
    if (!p) return;
    cells[p[1]][p[0]] = c;
    if (!connected()) cells[p[1]][p[0]] = '.';
  };
  for (let k = land === 'field' || land === 'lake' || land === 'raid' ? 3 : land === 'ruins' ? 4 : 8; k > 0; k--) block('B'); // 초원은 야영지 모닥불이 더 생긴다
  for (let k = land === 'field' ? int(1, 2) : int(3, 4); k > 0; k--) block('c');
  for (let k = 0; k < 30; k++) {
    const p = pick();
    if (p) cells[p[1]][p[0]] = ',';
  }

  // 몬스터: 초원은 고블린 떼(전사가 이끌고 2구역부터 불개미), 설원은 얼음 개미·시체(2구역부터 해골 궁수).
  // 주인공에게서 먼 곳에 무리 지어 — 초원은 3~5마리 야영지, 설원은 3~4마리(궁수가 섞인다). 무리의 절반은 길가(길에서 6칸 안)
  const count = isle ? ISLE_COUNT : wildCount(floor, land);
  const warriors = Math.round(count * (land === 'field' ? 0.2 : land === 'ruins' ? 0.25 : 0.3));
  // 설원은 궁수가 많다(트인 눈밭에서 숨을 곳이 얼음 바위뿐). 폐허는 1구역부터 골목의 홉고블린 궁수(초원 1구역을 지나 온 곳이라)
  const ranged = land === 'lake' || land === 'raid' ? Math.round(count * 0.3) : land === 'ruins' ? Math.round(count * 0.2) : floor === 1 ? 0 : Math.round(count * (land === 'field' ? 0.15 : 0.25));
  const monsters: string[] = Array.from({ length: count }, (_, i) => (i < warriors ? 'w' : i < warriors + ranged ? (land === 'field' ? 'g' : 'a') : 'm'));
  for (let i = monsters.length - 1; i > 0; i--) {
    const j = int(0, i);
    [monsters[i], monsters[j]] = [monsters[j], monsters[i]];
  }
  const byRoad = ([x, z]: Cell) => {
    for (let dz = -6; dz <= 6; dz++) for (let dx = -6; dx <= 6; dx++) if (cells[z + dz]?.[x + dx] === '=') return true;
    return false;
  };
  // 초원 야영지: 셋 이상 모인 무리 가운데에 모닥불(B)과 잠긴 상자(C) — 길을 끊으면 그 무리는 야영지가 아니다
  const makeCamp = ([cx, cz]: Cell) => {
    const free: Cell[] = [];
    for (let r = 0; r <= 2; r++) for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) if (Math.max(Math.abs(dx), Math.abs(dz)) === r && cells[cz + dz][cx + dx] === '.') free.push([cx + dx, cz + dz]);
    if (free.length < 2) return false;
    const [b, c] = [free[0], free[int(1, free.length - 1)]];
    cells[b[1]][b[0]] = 'B';
    cells[c[1]][c[0]] = 'C';
    if (connected()) return true;
    cells[b[1]][b[0]] = cells[c[1]][c[0]] = '.';
    return false;
  };
  let campsLeft = land === 'field' ? int(3, 5) : 0;
  // 약탈자 진지: 무리마다 군막(2×2)과 화덕 — 맵 곳곳이 전쟁 야영지처럼(길을 끊으면 그 무리는 군막 없이)
  let tentsLeft = land === 'raid' ? int(5, 7) : 0;
  const raidTent = ([cx, cz]: Cell) => {
    for (let r = 2; r <= 4; r++)
      for (let dz = -r; dz <= r; dz++)
        for (let dx = -r; dx <= r; dx++) {
          const [x, z] = [cx + dx, cz + dz];
          const block: Cell[] = [[x, z], [x + 1, z], [x, z + 1], [x + 1, z + 1]];
          const fire: Cell = [x + (dx < 0 ? 2 : -1), z + 1];
          if (![...block, fire].every(([bx, bz]) => cells[bz]?.[bx] === '.')) continue;
          for (const [bx, bz] of block) cells[bz][bx] = 'n';
          cells[z][x] = 'e';
          cells[fire[1]][fire[0]] = 'B';
          if (connected()) return true;
          for (const [bx, bz] of [...block, fire]) cells[bz][bx] = '.';
        }
    return false;
  };
  // ponytail: 600번 안에 자리를 못 찾으면 그 시드는 버리고 다음 시드로(실제로는 늘 채운다)
  for (let k = 0, guard = 0, camps = 0; k < count; guard++) {
    if (guard > 600) return wild(seed + 1, floor, land, from);
    const camp = pick((p) => dist(p) >= 12 && (camps % 2 === 1 || byRoad(p)));
    if (!camp) continue;
    camps++;
    let placed = 0;
    for (let g = land === 'field' ? int(3, 5) : int(3, 4); g > 0 && k < count; g--) {
      const p = pick((p) => near(p, camp, 3));
      if (p) (cells[p[1]][p[0]] = monsters[k++]), placed++;
    }
    if (campsLeft > 0 && placed >= 3 && makeCamp(camp)) campsLeft--;
    if (tentsLeft > 0 && placed >= 3 && raidTent(camp)) tentsLeft--;
  }
  if (campsLeft > 0) return wild(seed + 1, floor, land, from); // 야영지가 모자라면 다음 시드로
  gimmicks(cells, mulberry(seed ^ 0x9e37), floor, land, all, keep, (p) => dist(p) >= 0 && OPEN(cells[p[1]][p[0]]), connected, (p) => dist(p));
  if (land === 'lake') {
    // 물가에 잠긴 마을 사람: 물에 닿은 땅 칸(주인공에서 먼 곳)에 4~6
    const shore = all.filter(([x, z]) => cells[z][x] === '.' && dist([x, z]) >= 12 && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => cells[z + dz][x + dx] === 'u'));
    for (let k = int(4, 6); k > 0 && shore.length; k--) {
      const [x, z] = shore.splice(int(0, shore.length - 1), 1)[0];
      if (cells[z][x] === '.') cells[z][x] = 'j';
    }
    // 1구역: 광장에 사제와 앓는 주민 셋(길가, 길을 끊지 않게). 사제가 없으면 다음 시드로
    if (square)
      for (const c of ['t', 'p', 'p', 'p'])
        for (let tries = 0; tries < 60; tries++) {
          const [x, z] = [square[0] + int(-3, 3), square[1] + int(-3, 3)];
          if (cells[z]?.[x] !== '.') continue;
          cells[z][x] = c;
          if (connected()) break;
          cells[z][x] = '.';
          if (c === 't' && tries === 59) return wild(seed + 1, floor, land, from);
        }
  }
  // 나룻배 줄: 만드는 동안은 판자 다리로 쳐서(닿는 땅·몬스터 자리를 그대로 따지게) 이제 물과 배로 되돌린다
  for (const line of ferries) line.forEach(([x, z], i) => (cells[z][x] = i === 0 || i === line.length - 1 ? 'f' : 'u'));
  if (land === 'raid' && floor < FLOORS && !raidClose(cells, hero, at(exits[0].side, exits[0].t, 1))) return wild(seed + 1, floor, land, from);
  if (land === 'lake' && !puzzleOk(cells, hero, at(exits[0].side, exits[0].t, 1), floor > 1 && !isle)) return wild(seed + 1, floor, land, from);
  return finish(cells, rand);
}

// 섬 나루(호숫가 4구역): 3×3 섬 자리 중 들어온 쪽 섬 → 가운데 섬 → 출구 쪽 섬을 잇고, 곁가지 섬 1~2(상자). 섬끼리는 나룻배 줄로만 잇는다.
// 줄은 가로·세로 곧은 물길: 양쪽 섬 끝 땅 칸이 나루(판자 '_'), 그 앞 물 칸이 배 'f'. 돌려주는 것 = 줄마다 배~배 칸들(만드는 동안은 판자)
const MIN_ISLE = 500; // 섬 나루는 땅이 적다
const ISLE_COUNT = 20;
const SLOT = [12, N / 2, N - 13];
function islands(cells: string[][], rand: () => number, hero: Cell, from: Side, to: Side): Cell[][] {
  const int = (lo: number, hi: number) => lo + Math.floor(rand() * (hi - lo + 1));
  const set = ([x, z]: Cell, c: string) => x > 0 && z > 0 && x < N - 1 && z < N - 1 && (cells[z][x] = c);
  const slotOf = (s: Side): Cell => (s === 'w' ? [0, 1] : s === 'e' ? [2, 1] : s === 'n' ? [1, 0] : [1, 2]);
  const touch = (a: Cell, b: Cell) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) === 1;
  const [a, b] = [slotOf(from), slotOf(to)];
  const all: Cell[] = [0, 1, 2].flatMap((j) => [0, 1, 2].map((i): Cell => [i, j]));
  const mids = all.filter((m) => touch(m, a) && touch(m, b));
  const chain = [a, mids[int(0, mids.length - 1)], b];
  const links: [Cell, Cell][] = [[chain[0], chain[1]], [chain[1], chain[2]]];
  const used = [...chain];
  for (let k = int(1, 2); k > 0; k--) {
    const free = all.filter((s) => !used.some((u) => u[0] === s[0] && u[1] === s[1]) && used.some((u) => touch(u, s)));
    if (!free.length) break;
    const s = free[int(0, free.length - 1)];
    links.push([used.find((u) => touch(u, s))!, s]);
    used.push(s);
  }
  const key = (s: Cell) => s[1] * 3 + s[0];
  const center = new Map(used.map((s) => [key(s), [SLOT[s[0]], SLOT[s[1]]] as Cell]));
  for (const s of used) {
    const [cx, cz] = center.get(key(s))!;
    const r = 6 + rand();
    for (let z = Math.floor(cz - r - 1); z <= cz + r + 1; z++) for (let x = Math.floor(cx - r - 1); x <= cx + r + 1; x++) if (cells[z]?.[x] === 'u' && Math.hypot(x - cx, z - cz) <= r + (rand() - 0.5) * 0.9) cells[z][x] = '.';
    for (let k = int(1, 3); k > 0; k--) {
      const [tx, tz, tr] = [cx + int(-4, 4), cz + int(-4, 4), 0.7 + rand() * 0.8]; // 섬 위 덤불·나무
      for (let z = Math.floor(tz - tr); z <= tz + tr; z++) for (let x = Math.floor(tx - tr); x <= tx + tr; x++) if (cells[z]?.[x] === '.' && Math.hypot(x - tx, z - tz) <= tr) cells[z][x] = '#';
    }
  }
  // 2칸 폭 흙길: (x0, z0)에서 옆으로 꺾어 (x1, z1)까지
  const lay = ([x0, z0]: Cell, [x1, z1]: Cell) => {
    for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) for (const dz of [0, 1]) set([x, z0 + dz], '=');
    for (let z = Math.min(z0, z1); z <= Math.max(z0, z1); z++) for (const dx of [0, 1]) set([x1 + dx, z], '=');
  };
  lay(hero, center.get(key(a))!);
  lay(center.get(key(b))!, at(to, N / 2, 1));
  const lines: Cell[][] = [];
  for (const [n, [p, q]] of links.entries()) {
    const bar = n >= 2 && n === links.length - 1; // 마지막 곁가지 섬은 배 대신 모래톱(물을 낮추면 드러난다)
    const [c0, c1] = [center.get(key(p))!, center.get(key(q))!];
    const ax = p[0] !== q[0] ? 0 : 1; // 줄이 나아가는 축(0 = x)
    const dir = Math.sign(c1[ax] - c0[ax]);
    const lat = Math.round((c0[1 - ax] + c1[1 - ax]) / 2);
    const cell = (t: number): Cell => (ax === 0 ? [t, lat] : [lat, t]);
    const ch = (t: number) => cells[cell(t)[1]][cell(t)[0]];
    const ch2 = (t: number, dl: number) => (ax === 0 ? cells[lat + dl][t] : cells[t][lat + dl]);
    let t0 = c0[ax];
    while (ch(t0) !== 'u') t0 += dir; // 첫 물 칸 = 배 자리
    let t1 = c1[ax];
    while (ch(t1) !== 'u') t1 -= dir;
    for (let k = 0; Math.abs(t1 - t0) > 11; k++) k % 2 ? (set(cell(t1), '_'), (t1 -= dir)) : (set(cell(t0), '_'), (t0 += dir)); // 멀면 나루 판자를 물 쪽으로 늘린다(한 번 건너기 ≤ 11m)
    lay(c0, cell(t0 - 2 * dir));
    lay(c1, cell(t1 + 2 * dir));
    if (bar) {
      for (let t = t0 - dir; t !== t1 + 2 * dir; t += dir) for (const dl of [0, 1]) if ('u='.includes(ch2(t, dl))) set(ax === 0 ? [t, lat + dl] : [lat + dl, t], '7');
      set(ax === 0 ? [t0 - 3 * dir, lat - 2] : [lat - 2, t0 - 3 * dir], '8'); // 물높이 바퀴: 모래톱이 시작되는 섬(물을 낮춘 채 갇히지 않게)
      continue;
    }
    for (const t of [t0 - dir, t1 + dir]) set(cell(t), '_'); // 나루 끝 판자(늘린 판자 뒤의 흙길은 위 lay가 잇는다)
    const line: Cell[] = [];
    for (let t = t0; t !== t1 + dir; t += dir) line.push(cell(t));
    for (const c of line) set(c, '_');
    lines.push(line);
  }
  for (const [, q] of links.slice(2)) {
    const [x, z] = center.get(key(q))!;
    cells[z][x] = 'c'; // 곁가지 섬의 상자
  }
  return lines;
}

// 지역 기믹을 놓는다. 앞의 난수열(땅·몬스터·야영지)을 바꾸지 않게 따로 굴린다.
// 모두: 성소(Y) 하나. 초원: 개미지옥(가운데 U, 둘레 모래 ~) 2~3, 30%로 보물 고블린(T). 설원: 얼어붙은 보물(I) 1~2와 둘레에 잠든 개미(Z) 2~3.
// 폐허: 저주받은 무덤(X) 3~5, 가시 바닥(^ 2×2) 4~6, 푸른 마법진(@) 한 쌍
function gimmicks(cells: string[][], r2: () => number, floor: number, land: Wild, all: Cell[], keep: Cell[], reach: (p: Cell) => boolean, connected: () => boolean, dist: (p: Cell) => number) {
  const int = (lo: number, hi: number) => lo + Math.floor(r2() * (hi - lo + 1));
  const near = ([x, z]: Cell, [cx, cz]: Cell, r: number) => Math.max(Math.abs(x - cx), Math.abs(z - cz)) < r;
  const used: Cell[] = [];
  const spot = (ok: (p: Cell) => boolean = () => true): Cell | null => {
    for (let tries = 0; tries < 150; tries++) {
      const p = all[int(0, all.length - 1)];
      if (cells[p[1]][p[0]] === '.' && reach(p) && ![...keep, ...used].some((k) => near(p, k, 5)) && ok(p)) return p;
    }
    return null;
  };
  const put = (c: string, ok?: (p: Cell) => boolean): Cell | null => {
    const p = spot(ok);
    if (!p) return null;
    cells[p[1]][p[0]] = c;
    if ('YI'.includes(c) && !connected()) return void (cells[p[1]][p[0]] = '.'), null; // 막는 것은 길을 끊지 않게
    used.push(p);
    return p;
  };
  const far = (k: number) => (p: Cell) => dist(p) >= k;
  put('Y', far(10));
  if (land === 'field') {
    for (let k = int(2, 3); k > 0; k--) {
      const camp = (p: Cell) => cells.slice(p[1] - 6, p[1] + 7).some((row) => row.slice(p[0] - 6, p[0] + 7).includes('C')); // 야영지 가까이는 피한다
      const c = put('U', (p) => far(12)(p) && !camp(p));
      if (c) for (let z = c[1] - 2; z <= c[1] + 2; z++) for (let x = c[0] - 2; x <= c[0] + 2; x++) if (Math.hypot(x - c[0], z - c[1]) <= 1.6 && '.='.includes(cells[z][x])) cells[z][x] = '~';
    }
    if (floor < FLOORS && r2() < 0.3) put('T', far(15));
  }
  if (land === 'snow')
    for (let k = int(1, 2); k > 0; k--) {
      const c = put('I', far(12));
      for (let n = c ? int(2, 3) : 0, tries = 0; n > 0 && tries < 40; tries++) {
        const [x, z] = [c![0] + int(-3, 3), c![1] + int(-3, 3)];
        if (Math.max(Math.abs(x - c![0]), Math.abs(z - c![1])) >= 2 && cells[z][x] === '.') (cells[z][x] = 'Z'), n--;
      }
    }
  if (land === 'ruins') {
    for (let k = int(3, 5); k > 0; k--) put('X', far(12));
    for (let k = int(4, 6); k > 0; k--) {
      const p = spot(far(8));
      if (p) for (const [dx, dz] of [[0, 0], [1, 0], [0, 1], [1, 1]]) if ('.='.includes(cells[p[1] + dz][p[0] + dx])) cells[p[1] + dz][p[0] + dx] = '^';
      if (p) used.push(p);
    }
    const top = Math.max(...all.map(dist));
    const a = put('@', (p) => dist(p) >= 0.15 * top && dist(p) <= 0.45 * top);
    if (a && !put('@', (p) => dist(p) >= 0.65 * top && Math.hypot(p[0] - a[0], p[1] - a[1]) >= 25)) cells[a[1]][a[0]] = '.'; // 짝이 없으면 하나도 두지 않는다
  }
}

// 호숫가 퍼즐(설계: 2026-11-24-act2-lake-design.md '퍼즐' 절). 기준 가장자리(t = 가장자리를 따라, k = 안쪽으로)에서 그린다.
// 2~3구역(출구 가장자리 기준): 검은 샘 0 → 갈림 1(바퀴 5) → [1: 출구를 U자로 둘러막는 물길 | 2: 안쪽으로] → 갈림 2(바퀴 6) → [3: 우물 9로 | 4: 늪 구덩이].
//   5를 돌리면 U가 빠져 출구가 열리지만 물이 우물로 가 마을 사람이 기어 나온다 → 6을 돌리면 늪으로 빠져 정화. 바퀴 둘은 늘 바깥(어느 차례로 돌려도 갇히지 않는다).
// 1구역(사제 광장 곁): 샘 0 → 갈림 1 → [1: 광장 우물로 | 2: 늪 구덩이]. 광장에서 가장 먼 빈 가장자리 쪽으로 그려 우물이 광장 바로 바깥에 온다.
//   물길은 2칸 폭, 둘레의 물웅덩이·다리는 땅으로.
// 돌려주는 것 = 우물 칸
function sluiceMap(cells: string[][], rand: () => number, floor: number, from: Side, exit: { side: Side; t: number }, square: Cell | null): Cell {
  const int = (lo: number, hi: number) => lo + Math.floor(rand() * (hi - lo + 1));
  const ok = (x: number, z: number) => x > 0 && z > 0 && x < N - 1 && z < N - 1;
  let side = exit.side;
  let te = exit.t;
  let k0 = 0; // 1구역: 그림 전체를 안쪽으로 미는 양(우물이 광장 바로 바깥에 오게)
  const m1 = int(4, 6);
  if (floor === 1 && square) {
    const depth = (sd: Side) => (sd === 'n' ? square[1] : sd === 's' ? N - 1 - square[1] : sd === 'w' ? square[0] : N - 1 - square[0]);
    side = SIDES.filter((x) => x !== from && x !== exit.side).reduce((a, b) => (depth(b) > depth(a) ? b : a));
    te = side === 'n' || side === 's' ? square[0] : square[1];
    k0 = Math.max(0, depth(side) - 4 - (10 + m1));
  }
  const s = te < N / 2 ? 1 : -1;
  const L = (t: number, k: number): Cell => at(side, t, k);
  const marks: [Cell, string][] = [];
  const brush = (t: number, k: number, c: string) => {
    for (const [dt, dk] of [[0, 0], [1, 0], [0, 1], [1, 1]]) marks.push([L(t + dt, k + dk), c]);
  };
  const sgn = (v: number) => (v < 0 ? -1 : 1);
  // (t0, k0)에서 t를 따라 t1까지, 거기서 k를 따라 k1까지
  const run = (t0: number, k0: number, t1: number, k1: number, c: string) => {
    for (let t = t0; t !== t1 + sgn(t1 - t0); t += sgn(t1 - t0)) brush(t, k0, c);
    for (let k = k0; k !== k1 + sgn(k1 - k0); k += sgn(k1 - k0)) brush(t1, k, c);
  };
  const pool = (t: number, k: number, r: number, c: string) => {
    for (let dk = -3; dk <= 3; dk++) for (let dt = -3; dt <= 3; dt++) if (Math.hypot(dt, dk) <= r) marks.push([L(t + dt, k + dk), c]);
  };
  let wheels: [string, number, number][];
  let wellAt: [number, number];
  if (floor === 1) {
    const [m, p, K] = [m1, int(7, 9), k0];
    pool(te, K + 3, 2.2, '0');
    run(te, K + 3, te, K + 6, '0');
    run(te, K + 8, te, K + 8 + m, '1');
    wellAt = [te, K + 8 + m + 2];
    run(te + s * 2, K + 6, te + s * (2 + p), K + 6, '2');
    pool(te + s * (3 + p), K + 7, 2.4, '2');
    wheels = [['5', te - s * 2, K + 8]];
  } else {
    const R = int(8, 10);
    const F = te + s * (R + 4);
    const [l, m, p] = [int(9, 12), int(8, 10), int(5, 7)];
    pool(F + s * 3, 3, 2.2, '0');
    run(F + s * 3, 3, F, 6, '0');
    run(F - s * 2, 6, te + s * R, 6, '1'); // 출구를 둘러막는 U: 갈림에서 가까운 다리로 → 다리 → 바닥 → 먼 다리
    run(te + s * R, 1, te + s * R, R, '1');
    run(te + s * R, R, te - s * R, R, '1');
    run(te - s * R, R, te - s * R, 1, '1');
    const k2 = 8 + l;
    run(F, 8, F, k2, '2');
    const T4 = F + s * (2 + m);
    run(F + s * 2, k2, T4, k2, '4'); // 늪으로: 갈림에서 옆으로(가장자리까지 가지 않는다 — 둘러막인 땅이 생기지 않게)
    pool(T4, k2, 2.4, '4');
    run(F, k2 + 2, F, k2 + 2 + p, '3');
    wellAt = [F, k2 + 4 + p];
    wheels = [['5', F - s * 2, 9], ['6', F - s * 2, k2 + 1]];
  }
  for (const [[x, z]] of marks)
    for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) if (ok(x + dx, z + dz) && 'uv_'.includes(cells[z + dz][x + dx])) cells[z + dz][x + dx] = '.';
  for (const [[x, z], c] of marks) if (ok(x, z) && cells[z][x] !== 'H') cells[z][x] = c;
  const put = ([x, z]: Cell, c: string) => ok(x, z) && cells[z][x] !== 'H' && (cells[z][x] = c);
  for (const [c, t, k] of wheels) put(L(t, k), c);
  const w = L(...wellAt);
  put(w, '9');
  return w;
}

// 바퀴 상태 조합마다(물이 차는 조각은 물 'u', 빠진 조각은 땅): 주인공이 바퀴·우물 곁에 닿고(= 어느 바퀴를 어느 차례로 돌려도 갇히지 않는다),
// 출구는 barrier(2~3구역)면 갈림 1이 U(조각 1)를 빠지게 했을 때만, 아니면 늘 닿아야 한다
function puzzleOk(cells: string[][], hero: Cell, exit: Cell, barrier: boolean): boolean {
  const has = (c: string) => cells.some((r) => r.includes(c));
  for (const g5 of [0, 1] as const)
    for (const g6 of [0, 1] as const)
      for (const g8 of [0, 1] as const) {
        if ((!has('6') && g6) || (!has('8') && g8)) continue;
        const sl = { gates: [{ key: '5', to: g5 }, { key: '6', to: g6 }, { key: '8', to: g8 }].filter((g) => has(g.key)) } as unknown as Sluice;
        const c = cells.map((r) => r.map((ch) => ('012347'.includes(ch) ? (flows(sl, +ch) ? 'u' : '.') : ch)));
        const d = walkDistances(c, hero[0], hero[1]);
        const near = (x: number, z: number) => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => d[(z + dz) * N + x + dx] >= 0);
        for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) if ('5689'.includes(cells[z][x]) && !near(x, z)) return false;
        if (has('5') && d[exit[1] * N + exit[0]] >= 0 !== (!barrier || g5 === 1)) return false;
      }
  return true;
}

// 호숫가 결전장(48×48, 늘 같은 모양 — 설계: 2026-11-24-act2-lake-design.md 7절): 가운데 반지름 12 호수, 둘레 땅 고리(바위·덤불 조금), 가장자리 숲.
// 동서남북 나루(판자 2칸 폭이 물 안으로 3칸(배가 도는 반지름 8에 닿지 않게), 끝이 뱃사공이 오르내리는 자리 — ferryman.ts FERRYMAN.tip). 주인공은 남쪽 땅, 뱃사공은 북쪽 나루 끝에서 시작
const LAKE_ARENA_SEED = 13;
export function generateLakeArena(): string[] {
  const M = SIZE;
  const c = M / 2;
  const rand = mulberry(LAKE_ARENA_SEED);
  const cells: string[][] = Array.from({ length: M }, (_, z) =>
    Array.from({ length: M }, (_, x) => {
      const r = Math.hypot(x + 0.5 - c, z + 0.5 - c);
      return r <= 12 ? 'u' : r <= 19.5 + Math.sin(Math.atan2(z - c, x - c) * 5) * 1.2 ? '.' : '#';
    }),
  );
  for (const [dx, dz] of [[0, -1], [1, 0], [0, 1], [-1, 0]])
    for (let k = 9; k <= 13; k++)
      for (const s of [-1, 0]) {
        const [x, z] = [Math.floor(c + dx * (k + 0.5) + (dz ? s : 0)), Math.floor(c + dz * (k + 0.5) + (dx ? s : 0))];
        if (cells[z][x] === 'u') cells[z][x] = '_';
      }
  for (let k = 0; k < 14; k++) {
    const a = rand() * Math.PI * 2, r = 14.5 + rand() * 3.5;
    const [x, z] = [Math.floor(c + Math.cos(a) * r), Math.floor(c + Math.sin(a) * r)];
    if (Math.abs(Math.cos(a)) > 0.25 && Math.abs(Math.sin(a)) > 0.25 && cells[z][x] === '.') cells[z][x] = rand() < 0.4 ? '#' : ','; // 나루 길목은 비운다
  }
  for (const [x, z] of [[c - 9, c - 9], [c + 8, c + 8], [c + 8, c - 9], [c - 9, c + 8]]) cells[z][x] = cells[z][x] === '.' ? 'B' : cells[z][x]; // 네 귀퉁이 화로
  cells[c + 16][c] = 'H';
  cells[c - 10][c] = 'M';
  return cells.map((r) => r.join(''));
}

// 약탈자 진지 요새(설계: 2026-11-24-act2-raid-design.md 3절). 출구 쪽 가장자리를 기준(t = 가장자리를 따라, k = 안쪽으로)으로
// 출구 둘레를 말뚝 방책으로 네모나게 둘러막고(두 다리 k 1..D + 바닥 줄 k = D), 바닥 줄에 방책 통 하나. 2구역부터는 안에 군막 둘(곁에 정예와 안쪽 통).
// 요새 밖 앞쪽에 불씨 통: 방책 통으로(늘), 안쪽 통으로(방책 밑을 지나), 바깥 미끼 통으로 — 도화선은 서로 닿지 않게 그린다.
// 만드는 동안은 방책을 ';'(도화선이 밑을 지나면 '<'), 방책 통을 '?'로 둔다(지나갈 수 있는 글자 — 생성기의 "닿는가" 따지기가 요새 안을 메우지 않게). 끝에 raidClose가 진짜 글자로
function raidFort(cells: string[][], rand: () => number, floor: number, exit: { side: Side; t: number }): boolean {
  const int = (lo: number, hi: number) => lo + Math.floor(rand() * (hi - lo + 1));
  const te = exit.t;
  const L = (t: number, k: number): Cell => at(exit.side, t, k);
  const ok = ([x, z]: Cell) => x > 0 && z > 0 && x < N - 1 && z < N - 1;
  const get = ([x, z]: Cell) => cells[z]?.[x] ?? '#';
  const put = (c: Cell, ch: string) => ok(c) && get(c) !== 'H' && (cells[c[1]][c[0]] = ch);
  const R = floor === 1 ? int(4, 5) : int(6, 8);
  const D = floor === 1 ? int(7, 8) : int(9, 11);
  // 요새 둘레·안쪽의 바위를 치운다(가장자리 숲 띠는 요새 밖에선 둔다)
  for (let k = 1; k <= D + 10; k++) for (let t = te - R - 3; t <= te + R + 3; t++) if (get(L(t, k)) === '#' && (k >= 5 || Math.abs(t - te) < R)) put(L(t, k), '.');
  for (let k = 1; k <= D; k++) put(L(te - R, k), ';'), put(L(te + R, k), ';');
  for (let t = te - R; t <= te + R; t++) put(L(t, D), ';');
  const tb = te + int(-R + 2, R - 2);
  put(L(tb, D), '?');
  type Target = { t: number; k: number; inner: boolean };
  const targets: Target[] = [{ t: tb, k: D, inner: false }];
  if (floor > 1) {
    // 군막 둘: 왼쪽 반·오른쪽 반에 하나씩(출구 길 k 1..2는 비운다). 곁에 정예, 요새 앞쪽 곁에 안쪽 통
    for (const side of [-1, 1]) {
      const tt = te + side * int(2, R - 3) - (side < 0 ? 1 : 0);
      const tk = int(3, D - 4);
      const block = [L(tt, tk), L(tt + 1, tk), L(tt, tk + 1), L(tt + 1, tk + 1)];
      const [x0, z0] = [Math.min(...block.map((c) => c[0])), Math.min(...block.map((c) => c[1]))];
      for (const c of block) put(c, 'n');
      put([x0, z0], 'e');
      put(L(tt + (side < 0 ? 2 : -1), tk), 'W');
      put(L(tt, tk + 2), 'b');
      targets.push({ t: tt, k: tk + 2, inner: true });
    }
    const sd = rand() < 0.5 ? -1 : 1; // 미끼 통: 요새 옆 바깥
    const td = te + sd * (R + int(3, 5));
    put(L(td, D + 2), 'b');
    targets.push({ t: td, k: D + 2, inner: false });
  }
  // 불씨 통 자리: 요새 앞쪽에 고르게, 목표와 t 순서를 맞춰(도화선이 엇갈리지 않게)
  targets.sort((a, b) => a.t - b.t);
  const n = targets.length;
  const used = new Set<string>();
  const key = (c: Cell) => `${c[0]},${c[1]}`;
  let breach = false;
  targets.forEach((g, i) => {
    const ts = te - R + Math.round(((i + 0.5) * (2 * R + 1)) / n) + int(-1, 1);
    const ks = D + int(6, 8);
    const path: Cell[] = [];
    const run = (t0: number, k0: number, t1: number, k1: number) => {
      for (let t = t0; t !== t1; t += Math.sign(t1 - t0)) path.push(L(t, k0));
      for (let k = k0; k !== k1 + Math.sign(k1 - k0 || 1); k += Math.sign(k1 - k0 || 1)) path.push(L(t1, k));
    };
    if (g.inner) {
      run(ts, ks - 1, ts, D + 1);
      path.push(L(ts, D)); // 방책 밑
      run(ts, D - 1, ts, g.k + 1); // 안으로, 통 바로 앞 줄까지
      for (let t = ts; t !== g.t; ) (t += Math.sign(g.t - ts)), path.push(L(t, g.k + 1)); // 통 바로 앞 칸까지
    } else if (g.k === D) run(ts, ks - 1, ts, D + 1), ts !== g.t && run(ts, D + 1, g.t, D + 1);
    else run(ts, ks - 1, ts, g.k), path.pop(), run(ts, g.k, g.t + (g.t > ts ? -1 : 1), g.k);
    const mine = new Set(path.map(key));
    if (path.some((c) => !ok(c) || used.has(key(c)) || ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => used.has(key([c[0] + dx, c[1] + dz])) && !mine.has(key([c[0] + dx, c[1] + dz])))) || !';.=,#'.includes(get(c)))) {
      return; // 엇갈리면 이 목표는 도화선 없이(안쪽 통은 안에 들어가 직접 누른다. 방책 통이면 이 맵은 다시 만든다) // 엇갈리면 이 목표는 도화선 없이(안쪽 통은 안에 들어가 직접 누른다)
    }
    for (const c of path) (used.add(key(c)), put(c, get(c) === ';' ? '<' : ':'));
    put(L(ts, ks), 'b');
    if (g.k === D && !g.inner) breach = true;
  });
  return breach;
}

// 만드는 동안 쓰던 글자를 진짜 글자로. 그리고 확인: 방책이 멀쩡하면 출구에 못 닿고, 방책 통 둘레가 부서지면 닿는다. 불씨 통은 곁에 닿는다
function raidClose(cells: string[][], hero: Cell, exit: Cell): boolean {
  const real: Record<string, string> = { ';': '[', '<': ']', '?': '{' };
  for (const row of cells) row.forEach((c, x) => real[c] && (row[x] = real[c]));
  const d0 = walkDistances(cells, hero[0], hero[1]);
  if (d0[exit[1] * N + exit[0]] >= 0) return false;
  const after = cells.map((r) => [...r]);
  const walls: Cell[] = [];
  cells.forEach((r, z) => r.forEach((c, x) => c === '{' && walls.push([x, z])));
  for (const [wx, wz] of walls) for (let z = wz - 3; z <= wz + 3; z++) for (let x = wx - 3; x <= wx + 3; x++) if ('[]{'.includes(after[z]?.[x] ?? '') && Math.hypot(x - wx, z - wz) <= 2.5) after[z][x] = '.';
  if (walkDistances(after, hero[0], hero[1])[exit[1] * N + exit[0]] < 0) return false;
  return true;
}

// 약탈자 진지 결전장(48×48, 늘 같은 모양 — 설계: 2026-11-24-act2-raid-design.md 4절): 둥근 요새 마당(반지름 15)을 말뚝 방책이 두르고,
// 둘레에 군막 넷(화약통이 하나씩 굴러 나온다 — chief.ts), 화로 넷. 주인공은 남쪽 방책 틈, 우두머리는 가운데 북쪽
const RAID_ARENA_SEED = 17;
export function generateRaidArena(): string[] {
  const M = SIZE;
  const c = M / 2;
  const rand = mulberry(RAID_ARENA_SEED);
  const cells: string[][] = Array.from({ length: M }, (_, z) =>
    Array.from({ length: M }, (_, x) => {
      const r = Math.hypot(x + 0.5 - c, z + 0.5 - c);
      return r <= 15 ? '.' : r <= 16.2 ? '[' : '#';
    }),
  );
  for (let z = c + 14; z < c + 19; z++) for (let x = c - 1; x <= c + 1; x++) if (z < M - 1) cells[z][x] = '='; // 남쪽 틈과 들어오는 길
  for (const [a, r] of [[-2.4, 11.5], [-0.75, 11.5], [0.75, 11.5], [2.4, 11.5]]) {
    const [x, z] = [Math.floor(c + Math.sin(a) * r) - 1, Math.floor(c - Math.cos(a) * r) - 1]; // 북쪽 반원에 군막(2×2)
    for (const [dx, dz] of [[0, 0], [1, 0], [0, 1], [1, 1]]) cells[z + dz][x + dx] = 'n';
    cells[z][x] = 'e';
  }
  for (const [x, z] of [[c - 10, c - 4], [c + 9, c - 4], [c - 10, c + 6], [c + 9, c + 6]]) cells[z][x] = 'B';
  for (let k = 0; k < 18; k++) {
    const [x, z] = [Math.floor(c + (rand() - 0.5) * 26), Math.floor(c + (rand() - 0.5) * 26)];
    if (cells[z][x] === '.' && Math.hypot(x - c, z - c) > 4) cells[z][x] = ',';
  }
  cells[c + 12][c] = 'H';
  cells[c - 5][c] = 'M';
  return cells.map((r) => r.join(''));
}
