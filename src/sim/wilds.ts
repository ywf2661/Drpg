// 미궁(방 + 복도)이 아닌 바깥 지역의 맵(72×72). 결과는 generateFloor와 같은 글자 맵 + '=' 길, 'F'·'S' 출구(맨 바깥 줄, → 초원·설원).
// 디아블로2의 평지처럼: 가장자리는 숲(초원)·얼음 절벽(설원) 띠, 들어온 가장자리에서 다른 가장자리의 출구까지 구불구불한 길.
// 초원: 탁 트인 들판에 바위 무더기, 몬스터는 야영지마다 떼로(모닥불 'B' + 무리가 다 쓰러져야 열리는 상자 'C'). 설원: 눈밭에 얼음 바위 덩어리, 몬스터는 둘셋씩.
// 초원 1구역은 갈림길: 초원·설원 출구와 맵 안쪽 먼 곳의 동굴 입구('>', 계단 → 미궁 1층). 그 밖은 같은 지역 출구 하나, 마지막 구역은 출구 대신 보스.
// three.js·Math.random 금지. 시드가 같으면 같은 맵.
import { finish, FLOORS, generateFloor, mulberry, OPEN, themeFor, walkDistances, type Theme } from './dungeon';
import type { Cell } from './path';
import type { Land } from './rules';

export const WILD = 72; // 바깥 맵 크기(미궁은 SIZE 48)
export type Side = 'n' | 'e' | 's' | 'w'; // 가장자리: n = z 0, s = z 끝, w = x 0, e = x 끝
export const opposite: Record<Side, Side> = { n: 's', s: 'n', e: 'w', w: 'e' };
const SIDES: Side[] = ['n', 'e', 's', 'w'];
type Wild = 'field' | 'snow';

export const makeMap = (seed: number, floor: number, land: Land = 'dungeon', from: Side = 'w') => (land === 'dungeon' ? generateFloor(seed, floor) : generateWild(seed, floor, land, from));
export const themeOf = (floor: number, land: Land): Theme => (land === 'dungeon' ? themeFor(floor) : land);
export const wildCount = (floor: number, land: Wild) => (land === 'field' ? 18 : 16) + 4 * (floor - 1); // 몬스터 수
// 이 구역의 출구가 이끄는 곳. 초원 1구역만 갈림길(초원 2·설원 1·미궁 1, 미궁은 동굴 입구), 지역을 고른 뒤로는 그 지역의 다음 구역뿐. 마지막 구역은 없음
export const exitsFor = (floor: number, land: Wild): Land[] => (floor >= FLOORS ? [] : land === 'field' && floor === 1 ? ['field', 'snow', 'dungeon'] : [land]);
const MIN_OPEN = 1500; // 걸어 다닐 칸이 이보다 적으면 다시 만든다
const N = WILD;
// 가장자리 side에서 가장자리를 따라 t번째, 안쪽으로 k칸
const at = (side: Side, t: number, k: number): Cell => (side === 'n' ? [t, k] : side === 's' ? [t, N - 1 - k] : side === 'w' ? [k, t] : [N - 1 - k, t]);

export function generateWild(seed: number, floor: number, land: Wild, from: Side = 'w'): string[] {
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
      cells[z][x] = e.to === 'field' ? 'F' : 'S';
    }
  }
  const bossAt = at(opposite[from], int(N / 2 - 10, N / 2 + 10), 10);
  if (floor === FLOORS) road(bossAt);
  cells[hero[1]][hero[0]] = 'H';

  // 5. 주인공에서 걸어서 닿는 땅만 남긴다
  let d = walkDistances(cells, hero[0], hero[1]);
  let open = 0;
  for (let z = 0; z < N; z++)
    for (let x = 0; x < N; x++) {
      if (d[z * N + x] >= 0) open++;
      else if (OPEN(cells[z][x])) cells[z][x] = '#';
    }
  if (open < MIN_OPEN) return generateWild(seed + 1, floor, land, from);
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
    const spots = all.filter((p) => dist(p) >= 0.7 * far && !exits.some((e) => near(p, at(e.side, e.t, 0), 10)));
    const cave = spots.length ? spots[int(0, spots.length - 1)] : all.reduce((a, b) => (dist(b) > dist(a) ? b : a));
    clear(cave, 2);
    cells[cave[1]][cave[0]] = '>';
    keep.push(cave);
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
  for (let k = land === 'field' ? 3 : 8; k > 0; k--) block('B'); // 초원은 야영지 모닥불이 더 생긴다
  for (let k = land === 'field' ? int(1, 2) : int(3, 4); k > 0; k--) block('c');
  for (let k = 0; k < 30; k++) {
    const p = pick();
    if (p) cells[p[1]][p[0]] = ',';
  }

  // 몬스터: 초원은 고블린 떼(전사가 이끌고 2구역부터 불개미), 설원은 얼음 개미·시체(2구역부터 해골 궁수).
  // 주인공에게서 먼 곳에 무리 지어 — 초원은 3~5마리 야영지, 설원은 3~4마리(궁수가 섞인다). 무리의 절반은 길가(길에서 6칸 안)
  const count = wildCount(floor, land);
  const warriors = Math.round(count * (land === 'field' ? 0.2 : 0.3));
  const ranged = floor === 1 ? 0 : Math.round(count * (land === 'field' ? 0.15 : 0.25)); // 설원은 궁수가 많다(트인 눈밭에서 숨을 곳이 얼음 바위뿐)
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
    if (guard > 600) return generateWild(seed + 1, floor, land, from);
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
  if (campsLeft > 0) return generateWild(seed + 1, floor, land, from); // 야영지가 모자라면 다음 시드로
  return finish(cells, rand);
}
