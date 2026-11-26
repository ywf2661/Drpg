// 2막 ④ 사암 신전의 맵(설계: docs/superpowers/specs/2026-11-26-act2-temple-design.md 2·3절). three.js·Math.random 금지. 시드가 같으면 같은 맵.
// 가장자리는 모래 언덕, 가운데에 둥근 담(돌지 않는다)과 그 안의 도는 고리(구역 1·2·3·3겹), 가장 안쪽 봉인('/').
// 담에는 들어온 쪽 문(3칸)과 다른 쪽 해 틈('`'). 고리는 틈 하나 + 틈 반대편 칸막이, 틈에서 ±90°에 자칼 손잡이(')').
import { finish, FLOORS, mulberry, SIZE, walkDistances } from './dungeon';
import { isStone } from './temple';
import type { Side } from './wilds';

const N = 64;
const RADII = [4, 9, 14]; // 고리 반지름(안 → 밖). 복도는 가로·세로에서 4칸
const STEP = 5; // 바깥 고리에서 담 안쪽 가장자리까지
const SIDE_Q: Record<Side, number> = { e: 0, s: 1, w: 2, n: 3 }; // 가장자리 → 방향 번호(temple.ts의 q)
const DIR: [number, number][] = [[1, 0], [0, 1], [-1, 0], [0, -1]];

// 신전 한 채를 cells에 그린다(가운데 c, 고리 q 목록 안 → 밖, 문·해 틈 방향)
function temple(cells: string[][], c: number, qs: number[], door: number, sun: number) {
  const rs = RADII.slice(0, qs.length);
  const wall = rs[rs.length - 1] + STEP;
  const M = cells.length;
  for (let z = 0; z < M; z++)
    for (let x = 0; x < M; x++) {
      const [dx, dz] = [x - c, z - c];
      const d = Math.hypot(dx, dz);
      if (d > wall + 1.5) continue;
      const lane = (q: number) => DIR[q][0] * dx + DIR[q][1] * dz > 0 && Math.abs(-DIR[q][1] * dx + DIR[q][0] * dz) <= 1;
      if (d >= wall - 0.5) cells[z][x] = lane(door) ? '.' : lane(sun) ? '`' : '#';
      else if (d <= 1.5) cells[z][x] = '/';
      else {
        cells[z][x] = '.';
        rs.forEach((r, i) => {
          const out = i + 1 < rs.length ? rs[i + 1] - 0.8 : wall - 0.5;
          if (isStone(r, out, (qs[i] * Math.PI) / 2, dx, dz)) cells[z][x] = '(';
        });
      }
    }
  // 자칼 손잡이: 틈에서 ±90°, 띠 위(가로·세로라 한 칸 두께 — 안팎 복도 어디서든 친다)
  rs.forEach((r, i) => {
    for (const q of [(qs[i] + 1) % 4, (qs[i] + 3) % 4]) cells[c + DIR[q][1] * r][c + DIR[q][0] * r] = ')';
  });
  return wall;
}

// 사암 신전 1~4구역(64×64). 출구는 가운데 봉인
export function generateTemple(seed: number, floor: number, from: Side = 'w'): string[] {
  for (let s = seed; s < seed + 300; s++) {
    const map = tryTemple(s, floor, from);
    if (map) return map;
  }
  throw new Error(`신전 맵을 만들지 못했다(시드 ${seed}, ${floor}구역)`);
}

function tryTemple(seed: number, floor: number, from: Side): string[] | null {
  const rand = mulberry(seed);
  const int = (lo: number, hi: number) => lo + Math.floor(rand() * (hi - lo + 1));
  const c = N / 2;
  const cells: string[][] = Array.from({ length: N }, () => Array<string>(N).fill('.'));
  // 모래 언덕: 가장자리 띠(두께 3~6, 출렁인다)
  for (let t = 0, th = [int(3, 6), int(3, 6), int(3, 6), int(3, 6)]; t < N; t++)
    for (let side = 0; side < 4; side++) {
      th[side] = Math.min(6, Math.max(3, th[side] + int(-1, 1)));
      for (let k = 0; k < th[side]; k++) {
        const [x, z] = side === 0 ? [t, k] : side === 1 ? [t, N - 1 - k] : side === 2 ? [k, t] : [N - 1 - k, t];
        cells[z][x] = '#';
      }
    }
  const n = [1, 2, 3, 3][Math.min(floor, FLOORS - 1) - 1];
  const door = SIDE_Q[from];
  const sun = [0, 1, 2, 3].filter((q) => q !== door)[int(0, 2)];
  // 고리 방향: 처음부터 빛이 봉인에 닿으면 안 된다(어긋난 고리가 1구역은 하나, 그 밖엔 둘 이상)
  const qs = Array.from({ length: n }, () => int(0, 3));
  if (qs.filter((q) => q !== sun).length < Math.min(2, n)) return null;
  const wall = temple(cells, c, qs, door, sun);
  // 주인공: 들어온 가장자리에서 6칸 안쪽, 신전 문과 같은 줄
  const [ux, uz] = DIR[door];
  const [hx, hz] = [c + ux * (c - 7), c + uz * (c - 7)];
  // 모래밭 소품: 무너진 기둥('o', 막힘)·바위 무더기('#')·잔해(','). 담 둘레 3칸·문 앞길(폭 7)·주인공 둘레는 비운다
  const free = (x: number, z: number) => {
    const [dx, dz] = [x - c, z - c];
    if (Math.hypot(dx, dz) < wall + 4) return false;
    if (ux * dx + uz * dz > 0 && Math.abs(-uz * dx + ux * dz) <= 3) return false;
    return Math.hypot(x - hx, z - hz) > 4 && cells[z][x] === '.';
  };
  for (let k = int(7, 10); k > 0; k--) {
    const [x, z] = [int(6, N - 7), int(6, N - 7)];
    if (free(x, z)) cells[z][x] = 'o';
  }
  for (let k = int(4, 6); k > 0; k--) {
    const [cx, cz, r] = [int(6, N - 7), int(6, N - 7), 0.8 + rand() * 1.2];
    for (let z = Math.floor(cz - r); z <= cz + r; z++) for (let x = Math.floor(cx - r); x <= cx + r; x++) if (Math.hypot(x - cx, z - cz) <= r && free(x, z)) cells[z][x] = '#';
  }
  for (let k = 0; k < 30; k++) {
    const [x, z] = [int(4, N - 5), int(4, N - 5)];
    if (cells[z][x] === '.' && Math.hypot(x - c, z - c) > wall + 2) cells[z][x] = ',';
  }
  cells[hz][hx] = 'H';
  // 주인공에서 닿지 않는 모래밭은 메운다. 신전 문에 못 닿으면 다시
  const d = walkDistances(cells, hx, hz);
  const doorCell = (c + uz * (wall - 1)) * N + c + ux * (wall - 1); // 문 안쪽 복도 칸
  if (d[doorCell] < 0) return null;
  for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) if (d[z * N + x] < 0 && cells[z][x] === '.' && Math.hypot(x - c, z - c) > wall + 1.5) cells[z][x] = '#';
  // 상자: 모래밭에 하나, 셋째 구역부터 안쪽 복도에 하나 더
  const spots = (inside: boolean) => {
    const out: [number, number][] = [];
    for (let z = 1; z < N - 1; z++)
      for (let x = 1; x < N - 1; x++) {
        const r = Math.hypot(x - c, z - c);
        if (cells[z][x] !== '.' || (inside ? r > wall - 1 || r < 4 : !free(x, z) || d[z * N + x] < 0)) continue;
        if (inside && [-1, 0, 1].some((k) => [-1, 0, 1].some((j) => cells[z + k][x + j] !== '.'))) continue; // 복도 한가운데(둘레 8칸이 다 트임 — 고리가 돌아도 안 닿는 곳은 아니지만 길을 막지 않게)
        out.push([x, z]);
      }
    return out;
  };
  const pick = (list: [number, number][]) => list[int(0, list.length - 1)];
  const outside = spots(false);
  if (!outside.length) return null;
  const [chx, chz] = pick(outside);
  cells[chz][chx] = 'c';
  // 몬스터: 모래밭 무리 + 신전 복도(망령이 많다)
  const outN = 8 + 2 * floor;
  const inN = [5, 8, 12, 16][Math.min(floor, FLOORS - 1) - 1];
  const kinds = (k: number, mummy: number) => Array.from({ length: k }, (_, i) => (i < Math.round(k * mummy) ? 'm' : i % 2 ? 'w' : 'a'));
  const place = (list: [number, number][], ks: string[]) => {
    for (const k of ks) {
      for (let tries = 0; tries < 40; tries++) {
        const [x, z] = pick(list);
        if (cells[z][x] !== '.') continue;
        cells[z][x] = k;
        break;
      }
    }
  };
  place(outside, kinds(outN, 0.5));
  const corridor: [number, number][] = [];
  for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) if (cells[z][x] === '.' && Math.hypot(x - c, z - c) < wall - 0.5 && Math.hypot(x - c, z - c) > 4.8) corridor.push([x, z]);
  place(corridor, kinds(inN, 0.7));
  return finish(cells, rand);
}

// 신전 결전장(48×48, 늘 같은 모양 — 설계 5절): 고리 둘, 문은 남쪽, 해 틈은 동쪽. 문지기 사제는 북쪽 복도, 주인공은 문 밖
export function generateTempleArena(): string[] {
  const M = SIZE;
  const c = M / 2;
  const cells: string[][] = Array.from({ length: M }, (_, z) => Array.from({ length: M }, (_, x) => (Math.hypot(x - c, z - c) <= 21 ? '.' : '#')));
  const wall = temple(cells, c, [2, 3], 1, 0);
  cells[c - wall + 2][c] = 'M';
  cells[c + wall + 4][c] = 'H';
  return cells.map((r) => r.join(''));
}
