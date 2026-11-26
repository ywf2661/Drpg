// 무작위 던전 층: 방 + 2칸 폭 L자 복도. 결과는 createWorld가 읽는 글자 맵
// (+ '>' 계단, 'M' 보스(마지막 층), 'K' 해골 왕(3층), 'B' 화로·'o' 큰 소품·'c' 상자(막음), ',' 잔해(지나감), 'D' 사슬 문(도끼로 연다)).
// 문 뒤(보물 방, 2층부터는 계단 방)는 문을 열기 전에는 걸어서 갈 수 없다.
// three.js·Math.random 금지. 시드가 같으면 같은 맵.
import type { Cell } from './path';
import { ELITE, STORY } from './rules';

export const FLOORS = 5;
// 층 배율: 몬스터 체력(전부)·데미지(절반)에 곱한다. 회차(0 = 첫 판)마다 100%씩 더 강하다(2회차 ×2, 3회차 ×3).
// n은 이야기 깊이(5k + n). 초원(1~5)을 지나면 구역마다 extra만큼 더 가파르다 — 이어 가는 캐릭터가 깊이보다 빨리 커서(설계서 6-1)
export const DEPTH_EXTRA = 0.15;
export const floorPower = (n: number, cycle = 0, extra = DEPTH_EXTRA) => (1 + 0.15 * (n - 1) + extra * Math.max(0, n - FLOORS)) * cyclePower(cycle);
// 몬스터 한 방의 깊이·회차 배율(HIT 비율에 곱한다). 0 = 예전 공식(1막 첫 판).
// 2막(깊이 26~50)은 ACT2_HIT배에서 시작해 깊이 따라 ×1.2까지(1.25 → 1.5), 회차는 3회차(cycle 2)부터 회차마다 +5%(최대 +20%)
// ACT2_HIT: 2막 몬스터 체력은 그대로 두고 한 방을 올렸다(2026-11-26, 사용자). 봇 측정: bot.ts probe
const ACT2_LANDS = 5; // ① 호숫가 ~ ⑤ 뒤틀린 차원(act2.ts의 ACT2_MAX는 진행 번호라 땅 수와 다르다 — 신전을 지나면 6)
const ACT2_FROM = 5 * STORY.length + 6, ACT2_TO = ACT2_FROM + 5 * ACT2_LANDS - 1;
export const ACT2_HIT = 1.25;
export const hitScale = (depth: number, cycle: number) =>
  depth < ACT2_FROM && cycle < 1 ? 0 : (depth >= ACT2_FROM ? ACT2_HIT : 1) * (1 + 0.2 * Math.min(1, Math.max(0, depth - ACT2_FROM) / (ACT2_TO - ACT2_FROM))) * (1 + 0.05 * Math.min(4, Math.max(0, cycle - 1)));
export const cyclePower = (cycle: number) => 1 + cycle;
// 보스 깊이 배율: 보스 수치(STATS.boss)는 초원 5구역(이야기 깊이 5) 기준이라, 깊은 지역 보스는 그 구역 몬스터 배율만큼 더 세진다(회차 배율은 따로)
export const bossScale = (depth: number) => Math.max(1, floorPower(depth) / floorPower(FLOORS));
// 층의 모습(렌더용): 깊은 층은 동굴
export type Theme = 'dungeon' | 'cave' | 'field' | 'snow' | 'ruins' | 'sanctum' | 'lake' | 'raid' | 'mine' | 'temple';
export const themeFor = (n: number): Theme => (n >= 4 ? 'cave' : 'dungeon');
export const SIZE = 48;
type Room = { x: number; z: number; w: number; h: number };
export const BLOCKS = '#BocCDYQIEVPLsrJkO$heinu!|f5689pt[]{b-+d}()/`'; // 막는 글자: 벽, 화로, 큰 소품, 상자, 야영지 상자, 사슬 문, 성소, 시련의 제단, 얼어붙은 보물, 순찰대장, 상인(대장장이 '}'는 맨 끝), 주민, 단서, 잠긴 출구(설원·폐허), 의뢰 대상(봉화·궤·봉인), 야영지 창고, 천막(작은·큰·덮인 칸), 물(호숫가 — 막힘 값은 2: 시야·투사체는 지나감), 잠긴 호숫가 출구, 통나무집 벽, 나룻배(물과 같이 막힘 값 2), 호숫가 퍼즐 바퀴·우물, 앓는 주민·사제, 약탈자 진지 말뚝 방책·도화선이 밑을 지나는 방책·방책 속 화약통·화약통, 광산 허공·빛 다리(막힘 값 2, 다리는 켜지면 0)·결정, 사암 신전 고리 돌·자칼 손잡이·봉인(빛이 닿으면 열린다)·해 틈
export const OPEN = (c: string) => !BLOCKS.includes(c); // 지나갈 수 있는 글자
const GATE_MAX = 6; // 계단 방 입구가 이보다 넓으면(복도가 벽을 따라 붙은 경우) 문으로 막지 않는다

export function generateFloor(seed: number, floor: number): string[] {
  const rand = mulberry(seed);
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
  if (floor === 3) {
    // 해골 왕: 계단 방 안, 계단에서 2~3칸
    const room = rooms.find((r) => goal[0] >= r.x && goal[0] < r.x + r.w && goal[1] >= r.z && goal[1] < r.z + r.h)!;
    const spots: Cell[] = [];
    for (let z = room.z; z < room.z + room.h; z++)
      for (let x = room.x; x < room.x + room.w; x++) {
        const d = Math.max(Math.abs(x - goal[0]), Math.abs(z - goal[1]));
        if (d >= 2 && d <= 3 && cells[z][x] === '.') spots.push([x, z]);
      }
    const [kx, kz] = spots[int(0, spots.length - 1)];
    cells[kz][kx] = 'K';
  }

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
    if (rand() < 0.35) place(r, 'c', true); // 보물 상자
    for (let k = int(0, 3); k > 0; k--) place(r, 'o', true);
    for (let k = int(0, 3); k > 0; k--) place(r, ',', false);
  }

  // 몬스터(졸개·전사·궁수·마법사): 첫 방을 뺀 방들에 돌아가며 2~4마리씩
  const count = 8 + 3 * (floor - 1);
  const warriors = Math.round(count * (0.2 + 0.075 * (floor - 1)));
  const archers = floor === 1 ? 0 : Math.round(count * 0.15); // 궁수는 2층부터
  const mages = floor < 3 || floor === FLOORS ? 0 : Math.round(count * 0.1); // 마법사는 3~4층(보스층 제외)
  const kinds: string[] = Array.from({ length: count }, (_, i) =>
    i < warriors ? 'w' : i < warriors + archers ? 'a' : i < warriors + archers + mages ? 'g' : 'm',
  );
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
  // 성소 1~2개(Y)와 시련의 제단(Q, 보스 층 빼고 60%): 앞의 난수열을 바꾸지 않게 따로 굴린다(방·몬스터 배치가 그대로). 문·보물 방보다 먼저(문 뒤는 닫혀 있어 길 검사가 실패한다)
  const r2 = mulberry(seed ^ 0x51ed);
  const goalRoom0 = rooms.find((r) => inRoom(r, goal[0], goal[1]));
  const spots = rooms.slice(1).filter((r) => r !== goalRoom0);
  const altar = (c: string) => {
    for (let tries = 0; tries < 60 && spots.length; tries++) {
      const r = spots[Math.floor(r2() * spots.length)];
      const p: Cell = [r.x + Math.floor(r2() * r.w), r.z + Math.floor(r2() * r.h)];
      if (!free(p) || !edge(r, p)) continue;
      cells[p[1]][p[0]] = c;
      if (connected()) return;
      cells[p[1]][p[0]] = '.';
    }
  };
  for (let k = r2() < 0.5 ? 2 : 1; k > 0; k--) altar('Y');
  if (floor < FLOORS && r2() < 0.6) altar('Q');
  // 사슬 문은 맨 끝에 놓는다(앞의 난수열을 바꾸지 않아 방·몬스터 배치가 문이 없던 때와 같다)
  // 계단 방(2층~보스 전 층): 방을 둘러싼 한 겹에서 뚫린 칸(복도 입구)을 모두 문으로
  const goalRoom = rooms.find((r) => inRoom(r, goal[0], goal[1]))!;
  if (floor >= 2 && floor < FLOORS) {
    const mouths: Cell[] = [];
    for (let z = goalRoom.z - 1; z <= goalRoom.z + goalRoom.h; z++)
      for (let x = goalRoom.x - 1; x <= goalRoom.x + goalRoom.w; x++) if (!inRoom(goalRoom, x, z) && cells[z][x] === '.') mouths.push([x, z]);
    if (mouths.length <= GATE_MAX) for (const [x, z] of mouths) cells[z][x] = 'D';
  }
  // 보물 방: 방의 뒤쪽 벽(-x 또는 -z, 앞쪽 벽의 문은 벽에 가려진다) 너머 맨벽에 3×3칸을 파고 문 하나로 잇는다. 안에 상자 둘
  const vault = (r: Room, alongX: boolean): boolean => {
    const m = alongX ? r.z + (r.h >> 1) : r.x + (r.w >> 1); // 문이 놓이는 줄(방 벽의 가운데)
    const at = (k: number, s: number): Cell => (alongX ? [r.x - k, m + s] : [m + s, r.z - k]); // 방에서 바깥으로 k칸, 옆으로 s칸
    const [ix, iz] = at(0, 0);
    if (cells[iz][ix] !== '.') return false; // 문 앞(방 안쪽)이 비어 있어야
    for (let k = 1; k <= 5; k++)
      for (let s = -2; s <= 2; s++) {
        const [x, z] = at(k, s);
        if (x < 1 || z < 1 || cells[z][x] !== '#') return false; // 벽 한 겹까지 맨벽이어야 다른 방·복도와 닿지 않는다
      }
    for (let k = 2; k <= 4; k++) for (let s = -1; s <= 1; s++) cells[at(k, s)[1]][at(k, s)[0]] = '.';
    for (const s of [-1, 0]) cells[at(4, s)[1]][at(4, s)[0]] = 'c'; // 안쪽 벽에(앞쪽 벽에 붙이면 가려진다)
    cells[at(1, 0)[1]][at(1, 0)[0]] = 'D';
    return true;
  };
  for (const i of order) if (rooms[i] !== goalRoom && (vault(rooms[i], true) || vault(rooms[i], false))) break;
  return finish(cells, rand);
}

export function mulberry(seed: number) {
  let s = seed | 0;
  return () => {
    let t = (s = (s + 0x6d2b79f5) | 0); // mulberry32
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 정예: 몬스터마다 ELITE.chance로. 사슬 문처럼 맨 끝에 굴려 앞의 난수열(방·몬스터 배치)을 바꾸지 않는다
const ELITE_OF: Record<string, string> = { m: 'N', w: 'W', a: 'A', g: 'G' };
export function finish(cells: string[][], rand: () => number): string[] {
  for (const row of cells) row.forEach((c, x) => ELITE_OF[c] && rand() < ELITE.chance && (row[x] = ELITE_OF[c]));
  return cells.map((row) => row.join(''));
}

// (sx, sz)에서 지나갈 수 있는 칸까지의 4방향 걸음 수([z * 너비 + x], 크기는 맵에서). 도달 불가는 -1.
export function walkDistances(cells: string[][], sx: number, sz: number): Int32Array {
  const [W, H] = [cells[0].length, cells.length];
  const d = new Int32Array(W * H).fill(-1);
  d[sz * W + sx] = 0;
  const q = [sz * W + sx];
  for (let i = 0; i < q.length; i++) {
    const x = q[i] % W;
    const z = Math.floor(q[i] / W);
    for (const [nx, nz] of [[x + 1, z], [x - 1, z], [x, z + 1], [x, z - 1]]) {
      if (nx < 0 || nz < 0 || nx >= W || nz >= H) continue; // 바깥 지역의 출구는 맨 바깥 줄에 있다
      const ni = nz * W + nx;
      if (OPEN(cells[nz][nx]) && d[ni] < 0) {
        d[ni] = d[q[i]] + 1;
        q.push(ni);
      }
    }
  }
  return d;
}
