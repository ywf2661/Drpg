// 2막 ③ 보랏빛 광산의 맵(설계: docs/superpowers/specs/2026-11-25-act2-mine-design.md 2·3절). three.js·Math.random 금지. 시드가 같으면 같은 맵.
// 맵 대부분이 허공('-'), 걷는 곳은 떠 있는 바위섬('.')과 섬을 잇는 다리. 다리는 잔도('_', 늘 있음) 또는 빛 다리('+', 결정이 켜졌을 때만).
// 빛 다리 양 끝 섬마다 그 다리의 결정('d')이 하나씩 있어서 어느 섬에도 갇히지 않는다(mine.ts가 결정 곁 2칸 안의 다리를 그 결정의 것으로 친다).
// 섬은 격자 자리(슬롯)에 두고, 들어온 섬 → 출구 섬까지 이웃 슬롯을 잇는 길 + 곁가지 섬(상자). 1구역은 산 절벽길: 한쪽 가장자리가 바위 산.
import { finish, FLOORS, mulberry, SIZE } from './dungeon';
import type { Cell } from './path';
import type { Side } from './wilds';

const N = 72; // 바깥 맵 크기(WILD)
const SIDES: Side[] = ['n', 'e', 's', 'w'];
const at = (side: Side, t: number, k: number, n = N): Cell => (side === 'n' ? [t, k] : side === 's' ? [t, n - 1 - k] : side === 'w' ? [k, t] : [n - 1 - k, t]);
export const MINE_WALK = '.,_+=Hmwa'; // 맵 생성 중 걸을 수 있다고 치는 글자(빛 다리 포함)
const DIRS: Cell[] = [[1, 0], [-1, 0], [0, 1], [0, -1]];

type Isle = { c: Cell; r: number };
type Edge = { a: number; b: number; light: boolean };

// 섬 그리기: 반지름 r에 각도마다 흔들림(둥근 덩어리가 아니라 깨진 바위 조각처럼)
function isle(cells: string[][], rand: () => number, { c: [cx, cz], r }: Isle) {
  const [p, q] = [rand() * 7, rand() * 7];
  const R = Math.ceil(r * 1.4) + 1;
  for (let z = cz - R; z <= cz + R; z++)
    for (let x = cx - R; x <= cx + R; x++) {
      if (x < 1 || z < 1 || x >= cells[0].length - 1 || z >= cells.length - 1) continue;
      const th = Math.atan2(z - cz, x - cx);
      if (Math.hypot(x - cx, z - cz) <= r * (1 + 0.16 * Math.sin(3 * th + p) + 0.1 * Math.sin(5 * th + q))) cells[z][x] = '.';
    }
}

// 섬 a 가운데에서 섬 b 가운데까지 2칸 폭 다리(허공 칸만 다리 글자로). 끝 땅 칸 곁에 결정. 실패하면 false
function bridge(cells: string[][], isles: Isle[], e: Edge): boolean {
  const [[x0, z0], [x1, z1]] = [isles[e.a].c, isles[e.b].c];
  const ax = Math.abs(x0 - x1) > Math.abs(z0 - z1) ? 0 : 1; // 나아가는 축
  const lat = ax === 0 ? z0 : x0; // 두 섬은 이 줄에 맞춰 놓였다
  const [from, to] = ax === 0 ? [x0, x1] : [z0, z1];
  const dir = Math.sign(to - from);
  const cell = (t: number, l: number): Cell => (ax === 0 ? [t, lat + l] : [lat + l, t]);
  const get = ([x, z]: Cell) => cells[z]?.[x];
  const ch = e.light ? '+' : '_';
  const run: number[] = []; // 허공이 있는 t(다리 칸)
  for (let t = from; t !== to + dir; t += dir) if ([0, 1].some((l) => get(cell(t, l)) === '-')) run.push(t);
  if (!run.length) return !e.light; // 섬이 맞닿았다: 잔도는 필요 없고, 빛 다리는 놓을 수 없다
  if (e.light && Math.abs(run[run.length - 1] - run[0]) !== run.length - 1) return false; // 빛 다리는 한 토막이어야 결정 둘이 같은 다리를 켠다
  for (const t of run) for (const l of [0, 1]) if (get(cell(t, l)) === '-') cells[cell(t, l)[1]][cell(t, l)[0]] = ch;
  if (!e.light) return true;
  // 결정: 다리 양 끝 앞의 땅 칸에서 옆으로 한 줄 띄워서(다리 들머리를 막지 않게)
  for (const [t, d] of [[run[0] - dir, -dir], [run[run.length - 1] + dir, dir]]) {
    const spots = [cell(t, -2), cell(t, 3), cell(t + d, -2), cell(t + d, 3)];
    const ok = spots.find((p) => get(p) === '.');
    if (!ok) return false;
    cells[ok[1]][ok[0]] = 'd';
  }
  return true;
}

// 걸어서 닿는 칸(빛 다리도 걷는다고 친다)
function reach(cells: string[][], [sx, sz]: Cell): Uint8Array {
  const [W, H] = [cells[0].length, cells.length];
  const seen = new Uint8Array(W * H);
  const q = [sz * W + sx];
  seen[q[0]] = 1;
  for (let i = 0; i < q.length; i++) {
    const [x, z] = [q[i] % W, Math.floor(q[i] / W)];
    for (const [dx, dz] of DIRS) {
      const [nx, nz] = [x + dx, z + dz];
      if (nx < 0 || nz < 0 || nx >= W || nz >= H || seen[nz * W + nx] || !MINE_WALK.includes(cells[nz][nx])) continue;
      seen[nz * W + nx] = 1;
      q.push(nz * W + nx);
    }
  }
  return seen;
}

// 결정마다 곁(체비쇼프 2칸 안) 빛 다리 조각이 꼭 하나, 빛 다리 조각마다 결정이 둘(양 끝) — 아니면 다른 시드로
export function crystalsOk(cells: string[][]): boolean {
  const [W, H] = [cells[0].length, cells.length];
  const seg = new Int32Array(W * H).fill(-1);
  let n = 0;
  for (let z = 0; z < H; z++)
    for (let x = 0; x < W; x++) {
      if (cells[z][x] !== '+' || seg[z * W + x] >= 0) continue;
      const q = [z * W + x];
      seg[q[0]] = n;
      for (let i = 0; i < q.length; i++) {
        const [cx, cz] = [q[i] % W, Math.floor(q[i] / W)];
        for (const [dx, dz] of DIRS) if (cells[cz + dz]?.[cx + dx] === '+' && seg[(cz + dz) * W + cx + dx] < 0) (seg[(cz + dz) * W + cx + dx] = n), q.push((cz + dz) * W + cx + dx);
      }
      n++;
    }
  const ends = new Array(n).fill(0);
  for (let z = 0; z < H; z++)
    for (let x = 0; x < W; x++) {
      if (cells[z][x] !== 'd') continue;
      const own = new Set<number>();
      for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) if (seg[(z + dz) * W + x + dx] >= 0 && cells[z + dz]?.[x + dx] === '+') own.add(seg[(z + dz) * W + x + dx]);
      if (own.size !== 1) return false;
      ends[[...own][0]]++;
    }
  return ends.every((k) => k === 2);
}

// 광산 1~4구역(72×72). 출구 글자: 마지막 구역 전까지 'z'(다음 구역)
export function generateMine(seed: number, floor: number, from: Side = 'w'): string[] {
  for (let s = seed; s < seed + 300; s++) {
    const map = tryMine(s, floor, from);
    if (map) return map;
  }
  throw new Error(`광산 맵을 만들지 못했다(시드 ${seed}, ${floor}구역)`); // 실제로는 몇 번 안에 나온다
}

function tryMine(seed: number, floor: number, from: Side): string[] | null {
  const rand = mulberry(seed);
  const int = (lo: number, hi: number) => lo + Math.floor(rand() * (hi - lo + 1));
  const cells: string[][] = Array.from({ length: N }, () => Array<string>(N).fill('-'));
  const deep = floor === FLOORS - 1;
  const slots = deep ? [9, 22, 36, 50, 63] : [11, 28, 44, 61];
  const S = slots.length;
  // 슬롯 좌표(i, j)를 가장자리 기준으로: 들어온 쪽 가장자리 슬롯 줄 = 0
  const others = SIDES.filter((s) => s !== from);
  const out = others[int(0, others.length - 1)];
  const slotAt = (side: Side, t: number): Cell => (side === 'n' ? [t, 0] : side === 's' ? [t, S - 1] : side === 'w' ? [0, t] : [S - 1, t]);
  const mid = Math.floor(S / 2);
  const start = slotAt(from, mid + int(-1, 0));
  let end = slotAt(out, int(0, S - 1));
  if (end[0] === start[0] && end[1] === start[1]) end = slotAt(out, (end[0] + end[1] + 2) % S);
  // 길: 이웃 슬롯을 무작위로 밟아 출구 슬롯까지(같은 슬롯 두 번 없이). 너무 짧거나 길면 다시
  const want = floor === 1 ? [3, 5] : deep ? [6, 9] : [5, 7];
  const key = ([i, j]: Cell) => j * S + i;
  let path: Cell[] = [];
  for (let tries = 0; tries < 200 && !path.length; tries++) {
    const p: Cell[] = [start];
    const used = new Set([key(start)]);
    while (p.length < 12) {
      const [i, j] = p[p.length - 1];
      if (i === end[0] && j === end[1]) break;
      const next = DIRS.map(([di, dj]): Cell => [i + di, j + dj]).filter(([a, b]) => a >= 0 && b >= 0 && a < S && b < S && !used.has(key([a, b])));
      if (!next.length) break;
      // 출구 쪽으로 기울게
      next.sort((u, v) => Math.abs(u[0] - end[0]) + Math.abs(u[1] - end[1]) - (Math.abs(v[0] - end[0]) + Math.abs(v[1] - end[1])));
      const n = rand() < 0.55 ? next[0] : next[int(0, next.length - 1)];
      p.push(n);
      used.add(key(n));
    }
    const last = p[p.length - 1];
    if (last[0] === end[0] && last[1] === end[1] && p.length >= want[0] && p.length <= want[1]) path = p;
  }
  if (!path.length) return null;
  // 곁가지 섬(상자): 길 섬에 붙은 빈 슬롯
  const used = new Set(path.map(key));
  const branches: [number, Cell][] = [];
  for (let k = floor === 1 ? 1 : int(2, 3); k > 0; k--) {
    const cand: [number, Cell][] = [];
    path.forEach(([i, j], n) => {
      if (n === 0) return;
      for (const [di, dj] of DIRS) {
        const c: Cell = [i + di, j + dj];
        if (c[0] >= 0 && c[1] >= 0 && c[0] < S && c[1] < S && !used.has(key(c))) cand.push([n, c]);
      }
    });
    if (!cand.length) break;
    const b = cand[int(0, cand.length - 1)];
    used.add(key(b[1]));
    branches.push(b);
  }
  // 섬과 다리
  const jitter = deep ? 1 : 2;
  const rad = () => (floor === 1 ? 6.5 + rand() * 1.5 : deep ? 3.6 + rand() * 1.2 : 5 + rand() * 1.6);
  const isles: Isle[] = [...path, ...branches.map((b) => b[1])].map(([i, j]) => ({ c: [slots[i] + int(-jitter, jitter), slots[j] + int(-jitter, jitter)], r: rad() }));
  const edges: Edge[] = [];
  for (let n = 1; n < path.length; n++) edges.push({ a: n - 1, b: n, light: false });
  branches.forEach(([n], k) => edges.push({ a: n, b: path.length + k, light: true }));
  // 빛 다리: 1구역은 길에 하나(출구 섬으로 가는 다리), 2~3구역은 길에 둘~셋, 4구역은 길의 절반 넘게
  const lightOnPath = floor === 1 ? 1 : deep ? Math.ceil((path.length - 1) * 0.6) : Math.min(path.length - 1, int(2, 3));
  const order = edges.slice(0, path.length - 1).map((_, n) => n);
  for (let i = order.length - 1; i > 0; i--) {
    const j = int(0, i);
    [order[i], order[j]] = [order[j], order[i]];
  }
  if (floor === 1) order.unshift(path.length - 2);
  for (const n of order.slice(0, lightOnPath)) edges[n].light = true;
  if (floor === 1) for (const e of edges.slice(path.length - 1)) e.light = false; // 연습 구역: 곁가지는 잔도
  // 다리가 곧게 가도록 이웃 섬끼리 가로 또는 세로 줄을 맞춘다(뒤 섬을 앞 섬 줄에 — 길은 사슬이라 겹치지 않는다)
  for (const e of edges) {
    const [p, q] = [isles[e.a].c, isles[e.b].c];
    const ax = Math.abs(p[0] - q[0]) > Math.abs(p[1] - q[1]) ? 0 : 1;
    q[1 - ax] = p[1 - ax];
  }
  for (const isl of isles) isle(cells, rand, isl);
  // 1구역: 산 절벽길 — 들어온 쪽·출구 쪽이 아닌 가장자리 하나에 바위 산(두께 5~8), 그 앞 3칸은 절벽 턱(걷는다)
  if (floor === 1) {
    const side = SIDES.find((s) => s !== from && s !== out && s !== { n: 's', s: 'n', e: 'w', w: 'e' }[from]) ?? SIDES.find((s) => s !== from && s !== out)!;
    for (let t = 0, th = int(5, 8); t < N; t++, th = Math.min(8, Math.max(5, th + int(-1, 1)))) {
      for (let k = 0; k < th; k++) {
        const [x, z] = at(side, t, k);
        cells[z][x] = '#';
      }
      for (let k = th; k < th + 3; k++) {
        const [x, z] = at(side, t, k);
        if (cells[z][x] === '-') cells[z][x] = '.';
      }
    }
  }
  for (const e of edges) if (!bridge(cells, isles, e)) return null;
  // 들어온 곳·출구: 섬에서 가장자리까지 3칸 폭 바위 둑
  const causeway = (c: Cell, side: Side, ch: string | null): Cell => {
    const t = side === 'n' || side === 's' ? c[0] : c[1];
    for (let k = 0; k < N; k++) {
      const [x, z] = at(side, t, k);
      if (Math.hypot(x - c[0], z - c[1]) < 1) break;
      for (const s of [-1, 0, 1]) {
        const [px, pz] = at(side, t + s, k);
        if (k === 0 && ch) cells[pz][px] = ch;
        else if (cells[pz][px] === '-' || cells[pz][px] === '#') cells[pz][px] = '.';
      }
    }
    return at(side, t, 4);
  };
  const hero = causeway(isles[0].c, from, null);
  if (floor < FLOORS) causeway(isles[path.length - 1].c, out, 'z');
  cells[hero[1]][hero[0]] = 'H';
  // 바위 무더기·잔해(섬 안, 다리 끝과 결정 곁은 비운다)
  const near = ([x, z]: Cell, r: number, chs: string) => {
    for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) if (chs.includes(cells[z + dz]?.[x + dx] ?? '')) return true;
    return false;
  };
  for (const isl of isles) {
    for (let k = isl.r > 5 ? int(1, 2) : int(0, 1); k > 0; k--) {
      const [x, z] = [isl.c[0] + int(-3, 3), isl.c[1] + int(-3, 3)];
      if (cells[z]?.[x] === '.' && !near([x, z], 2, '_+dHz') && Math.hypot(x - hero[0], z - hero[1]) > 4) cells[z][x] = '#';
    }
    for (let k = int(2, 4); k > 0; k--) {
      const [x, z] = [isl.c[0] + int(-4, 4), isl.c[1] + int(-4, 4)];
      if (cells[z]?.[x] === '.') cells[z][x] = ',';
    }
  }
  // 바위가 길을 끊었으면 다시
  const seen = reach(cells, hero);
  const W = N;
  const exitIn = cells.flatMap((row, z) => row.map((c, x): Cell | null => (c === 'z' ? [x, z] : null))).filter((p): p is Cell => !!p);
  if (floor < FLOORS && !exitIn.some(([x, z]) => DIRS.some(([dx, dz]) => seen[(z + dz) * W + x + dx]))) return null;
  for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) if (cells[z][x] === 'd' && !DIRS.some(([dx, dz]) => seen[(z + dz) * W + x + dx])) return null;
  if (!crystalsOk(cells)) return null;
  // 상자: 곁가지 섬 가운데 / 몬스터: 들어온 섬 밖의 섬마다 무리
  branches.forEach((_, k) => {
    const [x, z] = isles[path.length + k].c;
    for (const [dx, dz] of [[0, 0], [1, 0], [0, 1], [-1, 0], [0, -1]]) if (cells[z + dz][x + dx] === '.') return void (cells[z + dz][x + dx] = 'c');
  });
  const count = (floor === 1 ? 14 : deep ? 20 : 16 + 2 * floor) as number;
  const kinds: string[] = Array.from({ length: count }, (_, i) => (i < Math.round(count * 0.25) ? 'w' : i < Math.round(count * 0.55) ? 'a' : 'm'));
  for (let i = kinds.length - 1; i > 0; i--) {
    const j = int(0, i);
    [kinds[i], kinds[j]] = [kinds[j], kinds[i]];
  }
  const homes = isles.slice(1);
  for (let k = 0, guard = 0; k < kinds.length && guard < 4000; guard++) {
    const isl = homes[guard % homes.length];
    const [x, z] = [isl.c[0] + int(-Math.floor(isl.r) + 1, Math.floor(isl.r) - 1), isl.c[1] + int(-Math.floor(isl.r) + 1, Math.floor(isl.r) - 1)];
    if (cells[z]?.[x] !== '.' || !seen[z * W + x] || near([x, z], 1, 'dz')) continue;
    cells[z][x] = kinds[k++];
  }
  return finish(cells, rand);
}

// 광산 결전장(48×48, 늘 같은 모양 — 설계 5절): 가운데 큰 채굴장 섬 + 둘레 섬 넷(동서남북), 모두 빛 다리로만 잇는다.
// 빛 다리마다 양 끝에 결정. 주인공은 남쪽 섬, 감독관은 가운데
export function generateMineArena(): string[] {
  const M = SIZE;
  const c = M / 2;
  const rand = mulberry(23);
  const cells: string[][] = Array.from({ length: M }, () => Array<string>(M).fill('-'));
  const isles: Isle[] = [{ c: [c, c], r: 8 }, { c: [c, c + 17], r: 4.6 }, { c: [c, c - 17], r: 4.6 }, { c: [c - 17, c], r: 4.6 }, { c: [c + 17, c], r: 4.6 }];
  for (const isl of isles) isle(cells, rand, isl);
  for (let b = 1; b <= 4; b++) bridge(cells, isles, { a: 0, b, light: true });
  cells[c + 18][c] = 'H';
  cells[c][c] = 'M';
  return cells.map((r) => r.join(''));
}
