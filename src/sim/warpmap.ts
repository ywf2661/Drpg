// 2막 ⑤ 뒤틀린 차원 1~3층 맵(설계: docs/superpowers/specs/2026-11-26-act2-rift-design.md 2·3절). three.js·Math.random 금지. 시드가 같으면 같은 맵.
// 허공('-') 위에 조각 방이 이어 붙어 떠 있다. 이웃한 방은 벽('#') 한 줄을 함께 쓰고 그 벽에 문 3칸('Α'…).
// 문 하나마다 그 문 앞쪽 방(들어오는 쪽)에 같은 짝 발판 둘('α'…). 첫 방에 주인공, 마지막 방에 출구('Ω' 3칸)와 상자.
// 3층은 가운데 방 하나에 곁방(상자)으로 가는 문이 하나 더 있다. 2층부터 불기둥('ψ').
import { finish, mulberry, walkDistances } from './dungeon';
import { DOORS, PLATES } from './warp';
import type { Side } from './wilds';

const N = 64;
type Rect = { x0: number; z0: number; x1: number; z1: number }; // 벽까지 포함
type Link = { from: number; to: number; cells: [number, number][] }; // 문: from 방(발판이 있는 쪽) → to 방
const DIR: Record<Side, [number, number]> = { e: [1, 0], w: [-1, 0], s: [0, 1], n: [0, -1] };
const BACK: Record<Side, Side> = { e: 'w', w: 'e', s: 'n', n: 's' };

export function generateWarp(seed: number, floor: number, from: Side = 'w'): string[] {
  for (let s = seed; s < seed + 400; s++) {
    const map = tryWarp(s, Math.min(3, Math.max(1, floor)), from);
    if (map) return map;
  }
  throw new Error(`뒤틀린 차원 맵을 만들지 못했다(시드 ${seed}, ${floor}층)`);
}

const inner = (r: Rect, x: number, z: number) => x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1;
const overlaps = (a: Rect, b: Rect) => a.x0 < b.x1 && b.x0 < a.x1 && a.z0 < b.z1 && b.z0 < a.z1; // 벽 한 줄을 함께 쓰는 건 겹침이 아니다

function tryWarp(seed: number, floor: number, from: Side): string[] | null {
  const rand = mulberry(seed);
  const int = (lo: number, hi: number) => lo + Math.floor(rand() * (hi - lo + 1));
  const go = BACK[from]; // 들어온 쪽의 반대로 나아간다
  const rooms: Rect[] = [];
  const links: Link[] = [];
  const size = () => [int(10, 14), int(9, 12)]; // 벽 포함 가로·세로
  // 첫 방: 들어온 가장자리 곁
  {
    const [rw, rh] = size();
    const x0 = from === 'w' ? 2 : from === 'e' ? N - 3 - rw : int(8, N - 9 - rw);
    const z0 = from === 'n' ? 2 : from === 's' ? N - 3 - rh : int(8, N - 9 - rh);
    rooms.push({ x0, z0, x1: x0 + rw - 1, z1: z0 + rh - 1 });
  }
  // prev 방의 d쪽에 새 방을 붙인다. 문 3칸이 들어가게 안쪽이 5칸 이상 겹친다
  const attach = (prev: number, d: Side): boolean => {
    const p = rooms[prev];
    const [rw, rh] = size();
    const [dx, dz] = DIR[d];
    let r: Rect;
    if (dx) {
      const z0 = int(p.z0 - rh + 7, p.z1 - 6);
      const x0 = dx > 0 ? p.x1 : p.x0 - rw + 1;
      r = { x0, z0, x1: x0 + rw - 1, z1: z0 + rh - 1 };
    } else {
      const x0 = int(p.x0 - rw + 7, p.x1 - 6);
      const z0 = dz > 0 ? p.z1 : p.z0 - rh + 1;
      r = { x0, z0, x1: x0 + rw - 1, z1: z0 + rh - 1 };
    }
    if (r.x0 < 1 || r.z0 < 1 || r.x1 > N - 2 || r.z1 > N - 2 || rooms.some((o) => overlaps(o, r))) return false;
    // 문: 함께 쓰는 벽 줄에서 두 방 안쪽이 겹치는 곳 가운데쯤
    const cells: [number, number][] = [];
    if (dx) {
      const [lo, hi] = [Math.max(p.z0, r.z0) + 2, Math.min(p.z1, r.z1) - 4];
      const z = int(lo, hi);
      const x = dx > 0 ? p.x1 : p.x0;
      for (let k = 0; k < 3; k++) cells.push([x, z + k]);
    } else {
      const [lo, hi] = [Math.max(p.x0, r.x0) + 2, Math.min(p.x1, r.x1) - 4];
      const x = int(lo, hi);
      const z = dz > 0 ? p.z1 : p.z0;
      for (let k = 0; k < 3; k++) cells.push([x + k, z]);
    }
    rooms.push(r);
    links.push({ from: prev, to: rooms.length - 1, cells });
    return true;
  };
  const turns: Side[] = go === 'e' || go === 'w' ? ['n', 's'] : ['e', 'w'];
  const main = [3, 4, 4][floor - 1];
  for (let k = 1; k < main; k++) {
    const d = rand() < 0.65 ? go : turns[int(0, 1)];
    if (!attach(rooms.length - 1, d) && !attach(rooms.length - 1, go)) return null;
  }
  const last = rooms.length - 1;
  let side = -1;
  if (floor === 3) {
    const host = int(1, main - 2);
    if (!turns.some((d) => attach(host, d))) return null;
    side = rooms.length - 1;
  }
  // 그리기
  const cells: string[][] = Array.from({ length: N }, () => Array<string>(N).fill('-'));
  for (const r of rooms)
    for (let z = r.z0; z <= r.z1; z++) for (let x = r.x0; x <= r.x1; x++) cells[z][x] = inner(r, x, z) ? '.' : '#';
  links.forEach((l, k) => l.cells.forEach(([x, z]) => (cells[z][x] = DOORS[k])));
  // 주인공: 첫 방 안, 들어온 쪽 벽 곁 가운데
  const r0 = rooms[0];
  const [hx, hz] = from === 'w' ? [r0.x0 + 2, (r0.z0 + r0.z1) >> 1] : from === 'e' ? [r0.x1 - 2, (r0.z0 + r0.z1) >> 1] : from === 'n' ? [(r0.x0 + r0.x1) >> 1, r0.z0 + 2] : [(r0.x0 + r0.x1) >> 1, r0.z1 - 2];
  cells[hz][hx] = 'H';
  // 출구: 마지막 방 가운데 3칸
  const rl = rooms[last];
  const [ex, ez] = [((rl.x0 + rl.x1) >> 1) - 1, (rl.z0 + rl.z1) >> 1];
  for (let k = 0; k < 3; k++) cells[ez][ex + k] = 'Ω';
  // 둘레 1칸이 다 바닥인 빈칸(발판·불기둥·몬스터 자리) — 문 앞 칸은 비운다
  const nearDoor = (x: number, z: number) => links.some((l) => l.cells.some(([dx, dz]) => Math.abs(dx - x) + Math.abs(dz - z) <= 2));
  const freeIn = (ri: number) => {
    const r = rooms[ri];
    const out: [number, number][] = [];
    for (let z = r.z0 + 2; z <= r.z1 - 2; z++)
      for (let x = r.x0 + 2; x <= r.x1 - 2; x++) if (cells[z][x] === '.' && !nearDoor(x, z) && Math.abs(x - hx) + Math.abs(z - hz) > 2) out.push([x, z]);
    return out;
  };
  const pick = (list: [number, number][]) => list.splice(int(0, list.length - 1), 1)[0];
  // 발판: 문마다 앞쪽 방에 둘. 두 발판 사이 걸음은 4칸 이상, 1·2층 10칸·3층 13칸 이하(메아리 4초 = 16칸 걸음보다 넉넉히)
  const far = floor === 3 ? 13 : 10;
  const plates: [number, number][][] = [];
  for (let k = 0; k < links.length; k++) {
    const list = freeIn(links[k].from).filter(([x, z]) => !plates.flat().some(([px, pz]) => Math.abs(px - x) + Math.abs(pz - z) < 2));
    if (list.length < 2) return null;
    const a = pick(list);
    const ok = list.filter(([x, z]) => {
      const d = Math.abs(x - a[0]) + Math.abs(z - a[1]);
      return d >= Math.max(4, far - 5) && d <= far;
    });
    if (!ok.length) return null;
    const b = ok[int(0, ok.length - 1)];
    plates.push([a, b]);
    cells[a[1]][a[0]] = cells[b[1]][b[0]] = PLATES[k];
  }
  // 상자: 마지막 방(3층은 곁방에도)
  for (const ri of side >= 0 ? [last, side] : [last]) {
    const list = freeIn(ri);
    if (!list.length) return null;
    const [x, z] = pick(list);
    cells[z][x] = 'c';
  }
  // 불기둥: 2층부터 첫 방 빼고 방마다 1~2개(발판·출구 둘레 1칸 밖)
  if (floor >= 2)
    for (let ri = 1; ri < rooms.length; ri++)
      for (let n = int(1, 2), tries = 0; n > 0 && tries < 30; tries++) {
        const list = freeIn(ri);
        if (!list.length) break;
        const [x, z] = list[int(0, list.length - 1)];
        if ([-1, 0, 1].some((j) => [-1, 0, 1].some((i) => cells[z + j][x + i] !== '.'))) continue;
        cells[z][x] = 'ψ';
        n--;
      }
  // 몬스터: 첫 방 빼고 방마다 무리. 2층부터 문 곁 발판(나중에 밟을 쪽) 둘레에 지키는 무리
  const kinds = (n: number) => Array.from({ length: n }, (_, i) => (i % 3 === 2 ? 'a' : i % 3 === 1 ? 'w' : 'm'));
  const put = (spots: [number, number][], ks: string[]) => {
    for (const k of ks) {
      const ok = spots.filter(([x, z]) => cells[z][x] === '.');
      if (!ok.length) return;
      const [x, z] = ok[int(0, ok.length - 1)];
      cells[z][x] = k;
    }
  };
  for (let ri = 1; ri < rooms.length; ri++) put(freeIn(ri), kinds(floor === 1 ? 2 : int(3, 4) + floor - 2));
  if (floor >= 2)
    links.forEach((l, k) => {
      if (l.from === 0 && floor === 2) return; // 첫 문은 연습
      const [a, b] = plates[k];
      const [mx, mz] = l.cells[1];
      const guard = Math.abs(a[0] - mx) + Math.abs(a[1] - mz) < Math.abs(b[0] - mx) + Math.abs(b[1] - mz) ? a : b;
      const ring = freeIn(l.from).filter(([x, z]) => Math.abs(x - guard[0]) <= 2 && Math.abs(z - guard[1]) <= 2);
      put(ring, kinds(int(3, 4)));
    });
  // 확인: 문을 닫은 채 첫 문의 두 발판에 닿고, 짝마다 두 발판 사이 걸음이 far 이하, 문을 다 열면 출구에 닿는다
  const d0 = walkDistances(cells, hx, hz);
  if (plates[0].some(([x, z]) => d0[z * N + x] < 0)) return null;
  for (const [a, b] of plates) {
    const d = walkDistances(cells, a[0], a[1])[b[1] * N + b[0]];
    if (d < 0 || d > far) return null;
  }
  const open = cells.map((row) => row.map((c) => (DOORS.includes(c) ? '.' : c)));
  const da = walkDistances(open, hx, hz);
  if (da[ez * N + ex + 1] < 0) return null;
  return finish(cells, rand);
}
