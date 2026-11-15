// 미궁(방 + 복도)이 아닌 지역의 맵. 결과는 generateFloor와 같은 글자 맵.
// 초원: 탁 트인 들판에 바위 무더기가 흩어져 있고, 몬스터가 야영지마다 떼로 모여 있다.
// 설원: 얼음 동굴 — 구불구불한 굴과 크고 작은 공동(세포 자동자). 몬스터는 둘셋씩 흩어져 있다.
// three.js·Math.random 금지. 시드가 같으면 같은 맵.
import { finish, FLOORS, generateFloor, mulberry, OPEN, SIZE, themeFor, walkDistances, type Theme } from './dungeon';
import type { Cell } from './path';
import type { Land } from './rules';

export const makeMap = (seed: number, floor: number, land: Land = 'dungeon') => (land === 'dungeon' ? generateFloor(seed, floor) : generateWild(seed, floor, land));
export const themeOf = (floor: number, land: Land): Theme => (land === 'dungeon' ? themeFor(floor) : land);
export const wildCount = (floor: number, land: 'field' | 'snow') => (land === 'field' ? 10 : 8) + 3 * (floor - 1); // 몬스터 수
const MIN_OPEN = 500; // 걸어 다닐 칸이 이보다 적으면 다시 만든다

export function generateWild(seed: number, floor: number, land: 'field' | 'snow'): string[] {
  const rand = mulberry(seed);
  const int = (lo: number, hi: number) => lo + Math.floor(rand() * (hi - lo + 1)); // lo..hi 포함
  const inside = (x: number, z: number) => x > 0 && z > 0 && x < SIZE - 1 && z < SIZE - 1;
  let cells: string[][];
  if (land === 'field') {
    // 들판: 전부 바닥, 둥근 바위 무더기 30~40개
    cells = Array.from({ length: SIZE }, (_, z) => Array.from({ length: SIZE }, (_, x) => (inside(x, z) ? '.' : '#')));
    for (let k = int(30, 40); k > 0; k--) {
      const [cx, cz, r] = [int(2, SIZE - 3), int(2, SIZE - 3), 0.8 + rand() * 2];
      for (let z = 1; z < SIZE - 1; z++) for (let x = 1; x < SIZE - 1; x++) if (Math.hypot(x - cx, z - cz) <= r) cells[z][x] = '#';
    }
  } else {
    // 동굴: 48%를 벽으로 뿌리고, 둘레 9칸 중 벽이 5칸 이상이면 벽 — 네 번
    cells = Array.from({ length: SIZE }, (_, z) => Array.from({ length: SIZE }, (_, x) => (inside(x, z) && rand() >= 0.48 ? '.' : '#')));
    for (let pass = 0; pass < 4; pass++)
      cells = cells.map((row, z) =>
        row.map((_, x) => {
          let walls = 0;
          for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) if (!inside(x + dx, z + dz) || cells[z + dz][x + dx] === '#') walls++;
          return walls >= 5 ? '#' : '.';
        }),
      );
  }
  // 가장 넓게 이어진 땅만 남긴다
  let best: Int32Array = new Int32Array(0);
  let bestN = 0;
  const seen = new Uint8Array(SIZE * SIZE);
  for (let z = 1; z < SIZE - 1; z++)
    for (let x = 1; x < SIZE - 1; x++) {
      if (cells[z][x] !== '.' || seen[z * SIZE + x]) continue;
      const d = walkDistances(cells, x, z);
      let n = 0;
      d.forEach((v, i) => v >= 0 && (n++, (seen[i] = 1)));
      if (n > bestN) [best, bestN] = [d, n];
    }
  if (bestN < MIN_OPEN) return generateWild(seed + 1, floor, land);
  const open: Cell[] = [];
  for (let z = 0; z < SIZE; z++)
    for (let x = 0; x < SIZE; x++) {
      if (best[z * SIZE + x] >= 0) open.push([x, z]);
      else cells[z][x] = '#';
    }

  // 주인공: 한쪽 구석에 가장 가까운 칸. 거기서 걸어서 가장 먼 칸에 계단(마지막은 보스), 둘레 5×5칸은 비운다(계단 그림 자리)
  const [hx, hz] = open.reduce((a, b) => (b[0] + b[1] < a[0] + a[1] ? b : a));
  cells[hz][hx] = 'H';
  const d = walkDistances(cells, hx, hz);
  const dist = ([x, z]: Cell) => d[z * SIZE + x];
  const far = open.reduce((a, b) => (dist(b) > dist(a) ? b : a));
  const goal: Cell = [Math.min(SIZE - 4, Math.max(3, far[0])), Math.min(SIZE - 4, Math.max(3, far[1]))];
  for (let z = goal[1] - 2; z <= goal[1] + 2; z++) for (let x = goal[0] - 2; x <= goal[0] + 2; x++) if (cells[z][x] === '#') cells[z][x] = '.';
  cells[goal[1]][goal[0]] = floor < FLOORS ? '>' : 'M';

  // 꾸미기: 화로(모닥불)·상자는 길을 끊지 않는 자리에만, 잔해는 어디든
  const near = ([x, z]: Cell, [cx, cz]: Cell, r: number) => Math.max(Math.abs(x - cx), Math.abs(z - cz)) < r;
  const pick = (ok: (p: Cell) => boolean = () => true): Cell | null => {
    for (let tries = 0; tries < 60; tries++) {
      const p = open[int(0, open.length - 1)];
      if (cells[p[1]][p[0]] === '.' && !near(p, [hx, hz], 3) && !near(p, goal, 4) && ok(p)) return p;
    }
    return null;
  };
  const connected = () => {
    const d = walkDistances(cells, hx, hz);
    return cells.every((row, z) => row.every((c, x) => !OPEN(c) || d[z * SIZE + x] >= 0));
  };
  const block = (c: string) => {
    const p = pick();
    if (!p) return;
    cells[p[1]][p[0]] = c;
    if (!connected()) cells[p[1]][p[0]] = '.';
  };
  for (let k = 0; k < 6; k++) block('B');
  for (let k = int(2, 3); k > 0; k--) block('c');
  for (let k = 0; k < 14; k++) {
    const p = pick();
    if (p) cells[p[1]][p[0]] = ',';
  }

  // 몬스터: 초원은 고블린 떼(전사가 이끌고 2구역부터 불개미), 설원은 얼음 개미·시체(2구역부터 해골 궁수).
  // 주인공에게서 먼 곳에 무리 지어 — 초원은 3~5마리 야영지, 설원은 2~3마리
  const count = wildCount(floor, land);
  const warriors = Math.round(count * (land === 'field' ? 0.2 : 0.3));
  const ranged = floor === 1 ? 0 : Math.round(count * 0.15);
  const kinds: string[] = Array.from({ length: count }, (_, i) => (i < warriors ? 'w' : i < warriors + ranged ? (land === 'field' ? 'g' : 'a') : 'm'));
  for (let i = kinds.length - 1; i > 0; i--) {
    const j = int(0, i);
    [kinds[i], kinds[j]] = [kinds[j], kinds[i]];
  }
  // ponytail: 400번 안에 자리를 못 찾으면 그 시드는 버리고 다음 시드로(실제로는 늘 채운다)
  for (let k = 0, guard = 0; k < count; guard++) {
    if (guard > 400) return generateWild(seed + 1, floor, land);
    const camp = pick((p) => dist(p) >= 12);
    if (!camp) continue;
    for (let g = land === 'field' ? int(3, 5) : int(2, 3); g > 0 && k < count; g--) {
      const p = pick((p) => near(p, camp, 3));
      if (p) cells[p[1]][p[0]] = kinds[k++];
    }
  }
  return finish(cells, rand);
}
