// 무작위 던전 층: 방 + 2칸 폭 L자 복도. 결과는 createWorld가 읽는 글자 맵
// (+ '>' 계단, 'M' 보스(마지막 층), 'B' 화로·'o' 큰 소품(막음), ',' 잔해(지나감)).
// three.js·Math.random 금지. 시드가 같으면 같은 맵.
import type { Cell } from './path';

export const FLOORS = 5;
// 층 배율: 몬스터 체력(전부)·데미지(절반)에 곱한다
export const floorPower = (n: number) => 1 + 0.15 * (n - 1);
const SIZE = 48;
type Room = { x: number; z: number; w: number; h: number };
const OPEN = (c: string) => c !== '#' && c !== 'B' && c !== 'o'; // 지나갈 수 있는 글자

export function generateFloor(seed: number, floor: number): string[] {
  let s = seed | 0;
  const rand = () => {
    let t = (s = (s + 0x6d2b79f5) | 0); // mulberry32
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (lo: number, hi: number) => lo + Math.floor(rand() * (hi - lo + 1)); // lo..hi 포함
  const cells = Array.from({ length: SIZE }, () => Array<string>(SIZE).fill('#'));

  // 방: 테두리 1칸은 벽으로 남기고, 서로 2칸 이상 떨어지게
  const rooms: Room[] = [];
  const want = int(6, 9);
  for (let tries = 0; tries < 300 && rooms.length < want; tries++) {
    const w = int(5, 10);
    const h = int(5, 10);
    const r = { x: int(1, SIZE - w - 1), z: int(1, SIZE - h - 1), w, h };
    if (rooms.some((o) => r.x < o.x + o.w + 2 && o.x < r.x + r.w + 2 && r.z < o.z + o.h + 2 && o.z < r.z + r.h + 2)) continue;
    rooms.push(r);
    for (let z = r.z; z < r.z + h; z++) for (let x = r.x; x < r.x + w; x++) cells[z][x] = '.';
  }
  if (rooms.length < 2) throw new Error(`방 생성 실패 (seed ${seed})`);

  // 복도: 이전 방과 L자로 잇고, 순환로 2개 추가. 2칸 폭이라 (x+1, z+1)까지 판다.
  const center = (r: Room): Cell => [r.x + (r.w >> 1), r.z + (r.h >> 1)];
  const line = (x0: number, z0: number, x1: number, z1: number) => {
    for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) {
      for (let z = Math.min(z0, z1); z <= Math.max(z0, z1); z++) {
        cells[z][x] = cells[z][x + 1] = cells[z + 1][x] = cells[z + 1][x + 1] = '.';
      }
    }
  };
  const corridor = (a: Room, b: Room) => {
    const [ax, az] = center(a);
    const [bx, bz] = center(b);
    const [cx, cz] = rand() < 0.5 ? [bx, az] : [ax, bz]; // 꺾이는 점
    line(ax, az, cx, cz);
    line(cx, cz, bx, bz);
  };
  for (let i = 1; i < rooms.length; i++) corridor(rooms[i - 1], rooms[i]);
  for (let k = 0; k < 2; k++) corridor(rooms[int(0, rooms.length - 1)], rooms[int(0, rooms.length - 1)]);

  // 주인공: 첫 방 중심. 주인공에서 걸어서 가장 먼 방의 중심에 계단(마지막 층은 보스)
  const [hx, hz] = center(rooms[0]);
  cells[hz][hx] = 'H';
  const d = walkDistances(cells, hx, hz);
  const dist = ([x, z]: Cell) => d[z * SIZE + x];
  const goal = center(rooms.slice(1).reduce((a, b) => (dist(center(b)) > dist(center(a)) ? b : a)));
  cells[goal[1]][goal[0]] = floor < FLOORS ? '>' : 'M';

  // 꾸미기: 막는 소품(화로·큰 소품)은 복도 입구가 아닌 방의 뒤쪽 가장자리(-x·-z 벽, 앞쪽 벽에 붙으면 1.2m 벽에 가려진다)에,
  // 잔해는 방 안 어디든. 계단(보스)·주인공 근처는 비운다
  const near = ([x, z]: Cell, [cx, cz]: Cell, r: number) => Math.max(Math.abs(x - cx), Math.abs(z - cz)) < r;
  const free = (p: Cell) => cells[p[1]][p[0]] === '.' && !near(p, [hx, hz], 2) && !near(p, goal, 3);
  const inRoom = (r: Room, x: number, z: number) => x >= r.x && x < r.x + r.w && z >= r.z && z < r.z + r.h;
  const edge = (r: Room, [x, z]: Cell) => {
    if (!inRoom(r, x + 1, z) || !inRoom(r, x, z + 1)) return false; // 앞쪽 가장자리
    const out = [[x - 1, z], [x, z - 1]].filter(([nx, nz]) => !inRoom(r, nx, nz));
    return out.length > 0 && out.every(([nx, nz]) => cells[nz][nx] === '#');
  };
  const connected = () => {
    const d = walkDistances(cells, hx, hz);
    return cells.every((row, z) => row.every((c, x) => !OPEN(c) || d[z * SIZE + x] >= 0));
  };
  const place = (r: Room, c: string, blocks: boolean) => {
    for (let tries = 0; tries < 30; tries++) {
      const p: Cell = [int(r.x, r.x + r.w - 1), int(r.z, r.z + r.h - 1)];
      if (!free(p) || (blocks && !edge(r, p))) continue;
      cells[p[1]][p[0]] = c;
      if (!blocks || connected()) return;
      cells[p[1]][p[0]] = '.'; // 길을 끊으면 되돌린다
    }
  };
  const order = rooms.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = int(0, i);
    [order[i], order[j]] = [order[j], order[i]];
  }
  for (const i of order.slice(0, Math.ceil(rooms.length / 2))) place(rooms[i], 'B', true);
  for (const r of rooms) {
    for (let k = int(0, 3); k > 0; k--) place(r, 'o', true);
    for (let k = int(0, 3); k > 0; k--) place(r, ',', false);
  }

  // 몬스터(졸개·전사·궁수): 첫 방을 뺀 방들에 돌아가며 2~4마리씩
  const count = 8 + 3 * (floor - 1);
  const warriors = Math.round(count * (0.2 + 0.075 * (floor - 1)));
  const archers = floor === 1 ? 0 : Math.round(count * 0.15); // 궁수는 2층부터
  const kinds: string[] = Array.from({ length: count }, (_, i) => (i < warriors ? 'w' : i < warriors + archers ? 'a' : 'm'));
  if (floor >= 2 && floor < FLOORS && warriors > 0) kinds[0] = 'W'; // 2~4층: 전사 하나가 정예
  for (let i = kinds.length - 1; i > 0; i--) {
    const j = int(0, i);
    [kinds[i], kinds[j]] = [kinds[j], kinds[i]];
  }
  const others = rooms.slice(1);
  for (let k = 0, r = 0; k < count; r = (r + 1) % others.length) {
    const room = others[r];
    for (let g = int(2, 4); g > 0 && k < count; g--) {
      for (let tries = 0; tries < 50; tries++) {
        const x = int(room.x, room.x + room.w - 1);
        const z = int(room.z, room.z + room.h - 1);
        if (cells[z][x] !== '.') continue;
        cells[z][x] = kinds[k++];
        break;
      }
    }
  }
  return cells.map((row) => row.join(''));
}

// (sx, sz)에서 지나갈 수 있는 칸까지의 4방향 걸음 수([z * SIZE + x]). 도달 불가는 -1.
function walkDistances(cells: string[][], sx: number, sz: number): Int32Array {
  const d = new Int32Array(SIZE * SIZE).fill(-1);
  d[sz * SIZE + sx] = 0;
  const q = [sz * SIZE + sx];
  for (let i = 0; i < q.length; i++) {
    const x = q[i] % SIZE;
    const z = Math.floor(q[i] / SIZE);
    for (const [nx, nz] of [[x + 1, z], [x - 1, z], [x, z + 1], [x, z - 1]]) {
      const ni = nz * SIZE + nx;
      if (OPEN(cells[nz][nx]) && d[ni] < 0) {
        d[ni] = d[q[i]] + 1;
        q.push(ni);
      }
    }
  }
  return d;
}
