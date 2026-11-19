// 미궁(방 + 복도)이 아닌 바깥 지역의 맵(72×72). 결과는 generateFloor와 같은 글자 맵 + '=' 길, 'F'·'S' 출구(맨 바깥 줄, → 초원·설원).
// 디아블로2의 평지처럼: 가장자리는 숲(초원)·얼음 절벽(설원) 띠, 들어온 가장자리에서 다른 가장자리의 출구까지 구불구불한 길.
// 초원: 탁 트인 들판에 바위 무더기, 몬스터는 야영지마다 떼로(모닥불 'B' + 무리가 다 쓰러져야 열리는 상자 'C'). 설원: 눈밭에 얼음 바위 덩어리, 몬스터는 둘셋씩.
// 초원 1구역은 갈림길: 초원·설원·폐허 출구와 맵 안쪽 먼 곳의 동굴 입구('>', 계단 → 미궁 1층). 그 밖은 같은 지역 출구 하나, 마지막 구역은 출구 대신 보스.
// 안 열린 지역의 출구는 막힌다(설원 's'·폐허 'r', 동굴 입구는 큰 돌 'o'). 야영지(generateCamp)는 늘 같은 48칸 맵.
// three.js·Math.random 금지. 시드가 같으면 같은 맵.
import { finish, FLOORS, generateFloor, mulberry, OPEN, SIZE, themeFor, walkDistances, type Theme } from './dungeon';
import type { Cell } from './path';
import type { Land } from './rules';
import { generateArena } from './sanctum';

export const GATE_FIRES = [[-3, -3], [4, -3], [-3, 4], [4, 4]]; // 성소 입구(2×2의 위쪽 모서리 칸)에서 화로 넷
export const WILD = 72; // 바깥 맵 크기(미궁은 SIZE 48)
export type Side = 'n' | 'e' | 's' | 'w'; // 가장자리: n = z 0, s = z 끝, w = x 0, e = x 끝
export const opposite: Record<Side, Side> = { n: 's', s: 'n', e: 'w', w: 'e' };
const SIDES: Side[] = ['n', 'e', 's', 'w'];
type Wild = 'field' | 'snow' | 'ruins';

// open = 열린 지역(초원 1구역 갈림길에서 갈 수 있는 곳, 없으면 다 열림), mark = 놓을 의뢰 대상 글자(L 흔적·J 봉화·k 궤·O 봉인)
export function makeMap(seed: number, floor: number, land: Land = 'dungeon', from: Side = 'w', open?: Land[], mark?: string): string[] {
  if (land === 'camp') return generateCamp();
  const map = land === 'sanctum' ? (floor >= FLOORS ? generateArena() : generateFloor(seed, floor)) : land === 'dungeon' ? generateFloor(seed, floor) : generateWild(seed, floor, land, from, open);
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
export const themeOf = (floor: number, land: Land): Theme => (land === 'dungeon' ? themeFor(floor) : land === 'camp' ? 'field' : land);
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
  const out = map.map((row) => row.replace(/[SR>*]/g, (c) => shut[c] ?? c));
  // 성소가 안 열렸으면 입구 자리는 그냥 빈터(화로·뼈 없이, 밟고 지나간다). 갈라지는 금은 render가 성물 수로 그린다
  const gz = out.findIndex((row) => row.includes('%'));
  if (gz < 0) return out;
  const gx = out[gz].indexOf('%');
  return out.map((row, z) => (Math.abs(z - gz - 0.5) > 5 ? row : row.replace(/[B,]/g, (c, x: number) => (Math.abs(x - gx - 0.5) > 5 ? c : '.'))));
}

// 야영지(48×48): 늘 같은 모양. 가운데 모닥불(B)과 다져진 흙마당, 모닥불 남쪽에 주인공(H)·서쪽에 순찰대장(E)·북쪽에 상인(V), 마당 가에 짐더미(o)·창고(h, 주인공 바로 남쪽 — 들어오자마자 화면에 보이게).
// 동쪽으로 곧은 길 끝, 맨 바깥 줄에 초원 1구역 출구(F 3칸). 가장자리는 숲 띠, 마당 밖에 바위·잔해. 몬스터·상자·기믹은 없다
const CAMP_SEED = 7;
export function generateCamp(): string[] {
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
  for (let k = 0; k < 20; k++) {
    const [x, z] = [int(4, M - 5), int(4, M - 5)];
    if (cells[z][x] === '.' && Math.hypot(x - c, z - c) > 6) cells[z][x] = ',';
  }
  const d = walkDistances(cells, c, c + 2); // 주인공에서 닿지 않는 땅은 메운다
  for (let z = 0; z < M; z++) for (let x = 0; x < M; x++) if (d[z * M + x] < 0 && OPEN(cells[z][x])) cells[z][x] = '#';
  return cells.map((row) => row.join(''));
}

function wild(seed: number, floor: number, land: Wild, from: Side): string[] {
  const rand = mulberry(seed);
  const int = (lo: number, hi: number) => lo + Math.floor(rand() * (hi - lo + 1)); // lo..hi 포함
  const inside = (x: number, z: number) => x > 0 && z > 0 && x < N - 1 && z < N - 1;
  let cells: string[][] = Array.from({ length: N }, (_, z) => Array.from({ length: N }, (_, x) => (inside(x, z) ? '.' : '#')));
  const set = ([x, z]: Cell, c: string) => inside(x, z) && (cells[z][x] = c);

  // 1. 바탕
  if (land === 'field') {
    // 들판: 둥근 바위 무더기
    for (let k = int(70, 90); k > 0; k--) {
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
  const exits = outer.map((to, i) => ({ side: others[i], t: int(N / 2 - 15, N / 2 + 15), to }));
  const t0 = int(N / 2 - 10, N / 2 + 10);
  const hero = at(from, t0, 4);
  for (let k = 1; k <= 6; k++) for (let s = -1; s <= 1; s++) set(at(from, t0 + s, k), '.');

  // 4. 길: 주인공에서 각 출구(마지막 구역은 맞은편 가장자리 가까이의 보스 자리)까지 2칸 폭, 4~8걸음마다 옆으로 1~3칸 휜다
  const road = (to: Cell) => {
    let [x, z] = hero;
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
  for (const e of exits) {
    road(at(e.side, e.t, 1));
    for (let s = -1; s <= 1; s++) {
      for (let k = 1; k <= 2; k++) set(at(e.side, e.t + s, k), '=');
      const [x, z] = at(e.side, e.t + s, 0);
      cells[z][x] = e.to === 'field' ? 'F' : e.to === 'snow' ? 'S' : 'R';
    }
  }
  const bossAt = at(opposite[from], int(N / 2 - 10, N / 2 + 10), 10);
  if (floor === FLOORS) road(bossAt);
  const gate: Cell = [N / 2, N / 2]; // 무너진 성소 입구(초원 1구역 한가운데, 길이 이어진다)
  if (kinds.includes('dungeon')) road(gate);
  cells[hero[1]][hero[0]] = 'H';

  // 5. 주인공에서 걸어서 닿는 땅만 남긴다
  let d = walkDistances(cells, hero[0], hero[1]);
  let open = 0;
  for (let z = 0; z < N; z++)
    for (let x = 0; x < N; x++) {
      if (d[z * N + x] >= 0) open++;
      else if (OPEN(cells[z][x])) cells[z][x] = '#';
    }
  if (open < MIN_OPEN) return wild(seed + 1, floor, land, from);
  const dist = ([x, z]: Cell) => d[z * N + x];
  const clear = ([cx, cz]: Cell, r: number) => {
    for (let z = cz - r; z <= cz + r; z++) for (let x = cx - r; x <= cx + r; x++) if (cells[z][x] === '#') cells[z][x] = '.';
  };
  const near = ([x, z]: Cell, [cx, cz]: Cell, r: number) => Math.max(Math.abs(x - cx), Math.abs(z - cz)) < r;
  const all: Cell[] = [];
  for (let z = 3; z < N - 3; z++) for (let x = 3; x < N - 3; x++) if (cells[z][x] === '.') all.push([x, z]);
  const keep: Cell[] = [hero, ...exits.map((e) => at(e.side, e.t, 1))]; // 소품·몬스터를 두지 않을 자리

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
  for (let k = land === 'field' ? 3 : land === 'ruins' ? 4 : 8; k > 0; k--) block('B'); // 초원은 야영지 모닥불이 더 생긴다
  for (let k = land === 'field' ? int(1, 2) : int(3, 4); k > 0; k--) block('c');
  for (let k = 0; k < 30; k++) {
    const p = pick();
    if (p) cells[p[1]][p[0]] = ',';
  }

  // 몬스터: 초원은 고블린 떼(전사가 이끌고 2구역부터 불개미), 설원은 얼음 개미·시체(2구역부터 해골 궁수).
  // 주인공에게서 먼 곳에 무리 지어 — 초원은 3~5마리 야영지, 설원은 3~4마리(궁수가 섞인다). 무리의 절반은 길가(길에서 6칸 안)
  const count = wildCount(floor, land);
  const warriors = Math.round(count * (land === 'field' ? 0.2 : land === 'ruins' ? 0.25 : 0.3));
  // 설원은 궁수가 많다(트인 눈밭에서 숨을 곳이 얼음 바위뿐). 폐허는 1구역부터 골목의 홉고블린 궁수(초원 1구역을 지나 온 곳이라)
  const ranged = land === 'ruins' ? Math.round(count * 0.2) : floor === 1 ? 0 : Math.round(count * (land === 'field' ? 0.15 : 0.25));
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
  }
  if (campsLeft > 0) return wild(seed + 1, floor, land, from); // 야영지가 모자라면 다음 시드로
  gimmicks(cells, mulberry(seed ^ 0x9e37), floor, land, all, keep, (p) => dist(p) >= 0 && OPEN(cells[p[1]][p[0]]), connected, (p) => dist(p));
  return finish(cells, rand);
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
