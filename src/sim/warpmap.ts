// 2막 ⑤ 뒤틀린 차원 1~3층 맵: 꿰맨 조각보(설계: docs/superpowers/specs/2026-11-26-act2-rift-design.md 2·3절). three.js·Math.random 금지. 시드가 같으면 같은 맵.
// 허공('-') 위에 지나온 땅의 조각이 그 땅 생김새대로 떠 있고, 맞닿은 자리는 이음매('#' 한 줄 — 빛 실로 꿰맨 자국)로 갈린다.
//   호숫가 = 둥근 땅에 물웅덩이('u'), 진지 = 네모 마당을 말뚝 방책('#')이 두른다, 광산 = 들쭉날쭉 깨진 바위섬, 신전 = 가운데가 빈 둥근 고리 복도.
//   바닥 글자가 그 땅: 'λ' 호숫가 'ρ' 진지 'μ' 광산 'τ' 신전(warp.ts가 방의 땅을 읽는다).
// 이음매 가운데 3칸이 문('Α'…), 그 문 앞쪽 조각(들어오는 쪽)에 같은 짝 발판 둘('α'…). 2층은 길이 둘로 갈렸다 다시 만나고(한쪽에 상자),
// 3층은 갈래 끝에 상자 조각이 하나 더 있다. 2층부터 불기둥('ψ').
import { finish, mulberry, OPEN, walkDistances } from './dungeon';
import type { Land } from './rules';
import { DOORS, FLOOR_OF, PLATES } from './warp';
import type { Side } from './wilds';

const N = 64;
const LANDS4: Land[] = ['lake', 'raid', 'mine', 'temple'];
const FLOORS_CH = 'λρμτ';
type Piece = { cx: number; cz: number; r: number; land: Land; p: number; q: number };
// 층마다 조각 자리([앞, 옆] 슬롯)와 문으로 잇는 조각 쌍, 출구 조각, 상자 조각
const LAYOUT = [
  { at: [[0, 0], [1, 0], [2, 0]], links: [[0, 1], [1, 2]], exit: 2, chest: [2] },
  { at: [[0, 0], [1, -1], [1, 1], [2, 0]], links: [[0, 1], [0, 2], [1, 3], [2, 3]], exit: 3, chest: [3, 2] },
  { at: [[0, 0], [1, 0], [2, -1], [2, 1], [3, -0.5]], links: [[0, 1], [1, 2], [1, 3], [2, 4]], exit: 4, chest: [4, 3] },
];
const GO: Record<Side, [number, number]> = { w: [1, 0], e: [-1, 0], n: [0, 1], s: [0, -1] }; // 들어온 쪽의 반대로 나아간다
const FWD = 10, SIDE = 5.8; // 슬롯 간격(칸)

export function generateWarp(seed: number, floor: number, from: Side = 'w'): string[] {
  for (let s = seed; s < seed + 600; s++) {
    const map = tryWarp(s, Math.min(3, Math.max(1, floor)), from);
    if (map) return map;
  }
  throw new Error(`뒤틀린 차원 맵을 만들지 못했다(시드 ${seed}, ${floor}층)`);
}

// 조각 안이면 1보다 작은 값(가운데 0), 밖이면 Infinity
function shape(pc: Piece, x: number, z: number): number {
  const [dx, dz] = [x - pc.cx, z - pc.cz];
  const d = Math.hypot(dx, dz);
  const th = Math.atan2(dz, dx);
  const v = pc.land === 'raid' ? Math.max(Math.abs(dx), Math.abs(dz)) / (pc.r * 0.85) : pc.land === 'mine' ? d / (pc.r * (1 + 0.16 * Math.sin(3 * th + pc.p) + 0.1 * Math.sin(5 * th + pc.q))) : pc.land === 'temple' && d < pc.r * 0.42 ? Infinity : d / pc.r;
  return v < 1 ? v : Infinity;
}

function tryWarp(seed: number, floor: number, from: Side): string[] | null {
  const rand = mulberry(seed);
  const int = (lo: number, hi: number) => lo + Math.floor(rand() * (hi - lo + 1));
  const L = LAYOUT[floor - 1];
  const [gx, gz] = GO[from];
  const [sx, sz] = [-gz, gx];
  const [ox, oz] = [gx ? (gx > 0 ? 10 : N - 11) : N / 2 + int(-3, 3), gz ? (gz > 0 ? 10 : N - 11) : N / 2 + int(-3, 3)];
  const off = int(0, 3);
  const pieces: Piece[] = L.at.map(([a, b], i) => ({ cx: ox + gx * FWD * a + sx * SIDE * b + int(-1, 1), cz: oz + gz * FWD * a + sz * SIDE * b + int(-1, 1), r: 6.6 + rand() * 1.2, land: LANDS4[(off + i) % 4], p: rand() * 7, q: rand() * 7 }));
  // 칸마다 주인 조각(겹치면 가운데에 가까운 쪽)
  const owner = new Int8Array(N * N).fill(-1);
  for (let z = 0; z < N; z++)
    for (let x = 0; x < N; x++) {
      let best = Infinity;
      pieces.forEach((pc, k) => {
        const v = shape(pc, x, z);
        if (v < best) [best, owner[z * N + x]] = [v, k];
      });
      if (best < Infinity && (x < 2 || z < 2 || x > N - 3 || z > N - 3)) return null;
    }
  const cells: string[][] = Array.from({ length: N }, (_, z) => Array.from({ length: N }, (_, x) => (owner[z * N + x] >= 0 ? FLOORS_CH[LANDS4.indexOf(pieces[owner[z * N + x]].land)] : '-')));
  const own = (x: number, z: number) => (x < 0 || z < 0 || x >= N || z >= N ? -1 : owner[z * N + x]);
  const floorAt = (x: number, z: number) => FLOORS_CH.includes(cells[z]?.[x] ?? '-');
  // 이음매: 번호가 작은 조각 쪽 칸 한 줄(8방향으로 맞닿으면 — 대각선으로 새지 않게)
  for (let z = 0; z < N; z++)
    for (let x = 0; x < N; x++) {
      const p = own(x, z);
      if (p < 0) continue;
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) if (own(x + dx, z + dz) > p) cells[z][x] = '#';
    }
  // 진지: 허공에 맞닿은 가장자리를 말뚝 방책이 두른다
  for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) if (own(x, z) >= 0 && pieces[own(x, z)].land === 'raid' && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => own(x + dx, z + dz) < 0)) cells[z][x] = '#';
  // 문: 잇는 조각 쌍마다 이음매 위 곧은 3칸(양옆이 두 조각의 바닥), 두 조각 가운데의 한가운데에 가장 가까운 곳
  const doorCells: [number, number][][] = [];
  for (let k = 0; k < L.links.length; k++) {
    const [p, q] = L.links[k];
    const [mx, mz] = [(pieces[p].cx + pieces[q].cx) / 2, (pieces[p].cz + pieces[q].cz) / 2];
    let best: [number, number][] | null = null;
    let bd = Infinity;
    for (let z = 1; z < N - 1; z++)
      for (let x = 1; x < N - 3; x++)
        for (const [ux, uz] of [[1, 0], [0, 1]]) {
          const run: [number, number][] = [0, 1, 2].map((i) => [x + ux * i, z + uz * i]);
          const ok = run.every(([cx, cz]) => {
            if (cells[cz]?.[cx] !== '#') return false;
            const [a, b] = [[cx - uz, cz - ux], [cx + uz, cz + ux]]; // 문 칸 양옆(문 줄에 수직)
            const [oa, ob] = [own(a[0], a[1]), own(b[0], b[1])];
            return floorAt(a[0], a[1]) && floorAt(b[0], b[1]) && ((oa === p && ob === q) || (oa === q && ob === p));
          });
          const d = Math.hypot(x + ux - mx, z + uz - mz);
          if (ok && d < bd) [best, bd] = [run, d];
        }
    if (!best) {
      // 비스듬히 맞닿아 곧은 3칸이 없다: 한가운데에 가장 가까운 이음매 칸(곁 8칸에 두 조각 바닥이 다 있다)과 그 둘레 이음매를 튼다
      const nb = (x: number, z: number, k: number) => [-1, 0, 1].some((j) => [-1, 0, 1].some((i) => floorAt(x + i, z + j) && own(x + i, z + j) === k));
      let c: [number, number] | null = null;
      for (let z = 1; z < N - 1; z++)
        for (let x = 1; x < N - 1; x++) {
          const d = Math.hypot(x - mx, z - mz);
          if (cells[z][x] === '#' && (own(x, z) === p || own(x, z) === q) && nb(x, z, p) && nb(x, z, q) && d < bd) [c, bd] = [[x, z], d];
        }
      if (!c) return null;
      const [x0, z0] = c;
      best = [];
      for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) if (cells[z0 + j][x0 + i] === '#' && (own(x0 + i, z0 + j) === p || own(x0 + i, z0 + j) === q) && (nb(x0 + i, z0 + j, p) || nb(x0 + i, z0 + j, q))) best.push([x0 + i, z0 + j]);
    }
    best.forEach(([x, z]) => (cells[z][x] = DOORS[k]));
    doorCells.push(best);
  }
  const nearDoor = (x: number, z: number, r = 2) => doorCells.flat().some(([dx, dz]) => Math.abs(dx - x) + Math.abs(dz - z) <= r);
  const solid8 = (x: number, z: number, k: number) => [-1, 0, 1].every((j) => [-1, 0, 1].every((i) => floorAt(x + i, z + j) && own(x + i, z + j) === k));
  // 호숫가: 물웅덩이(이음매·문에서 떨어진 곳). 조각마다 장애물 2~3(나무·통·결정·석상 — 그림은 warp.ts)
  pieces.forEach((pc, k) => {
    if (pc.land === 'lake') {
      const a = rand() * Math.PI * 2;
      const [wx, wz] = [pc.cx + Math.cos(a) * pc.r * 0.45, pc.cz + Math.sin(a) * pc.r * 0.45];
      for (let z = Math.floor(wz - 3); z <= wz + 3; z++)
        for (let x = Math.floor(wx - 3); x <= wx + 3; x++) if (Math.hypot(x - wx, z - wz) <= 2.2 && own(x, z) === k && floorAt(x, z) && !nearDoor(x, z, 4) && [-2, -1, 0, 1, 2].every((j) => [-2, -1, 0, 1, 2].every((i) => cells[z + j]?.[x + i] !== '#'))) cells[z][x] = 'u';
    }
    for (let n = int(2, 3), tries = 0; n > 0 && tries < 40; tries++) {
      const [x, z] = [Math.round(pc.cx + (rand() * 2 - 1) * pc.r * 0.7), Math.round(pc.cz + (rand() * 2 - 1) * pc.r * 0.7)];
      if (!solid8(x, z, k) || nearDoor(x, z, 3)) continue;
      cells[z][x] = '#';
      n--;
    }
  });
  // 주인공: 첫 조각에서 들어온 쪽 가장자리 가까이
  let [hx, hz, hd] = [0, 0, Infinity];
  for (let z = 1; z < N - 1; z++)
    for (let x = 1; x < N - 1; x++) {
      const d = Math.hypot(x - (pieces[0].cx - gx * pieces[0].r * 0.55), z - (pieces[0].cz - gz * pieces[0].r * 0.55));
      if (d < hd && solid8(x, z, 0)) [hx, hz, hd] = [x, z, d];
    }
  if (hd === Infinity) return null;
  cells[hz][hx] = 'H';
  // 출구: 출구 조각 가운데 가까이 가로 3칸
  const ex0 = pieces[L.exit];
  let [ex, ez, ed] = [0, 0, Infinity];
  for (let z = 1; z < N - 1; z++)
    for (let x = 1; x < N - 3; x++) {
      const d = Math.hypot(x + 1 - ex0.cx, z - ex0.cz);
      if (d < ed && [0, 1, 2].every((i) => solid8(x + i, z, L.exit))) [ex, ez, ed] = [x, z, d];
    }
  if (ed === Infinity) return null;
  for (let k = 0; k < 3; k++) cells[ez][ex + k] = 'Ω';
  // 둘레 1칸이 다 그 조각 바닥인 빈칸(발판·불기둥·몬스터 자리) — 문 앞·주인공 곁은 비운다
  const freeIn = (pi: number) => {
    const out: [number, number][] = [];
    for (let z = 1; z < N - 1; z++) for (let x = 1; x < N - 1; x++) if (solid8(x, z, pi) && !nearDoor(x, z) && Math.abs(x - hx) + Math.abs(z - hz) > 2) out.push([x, z]);
    return out;
  };
  const pick = (list: [number, number][]) => list.splice(int(0, list.length - 1), 1)[0];
  // 발판: 문마다 앞쪽 조각에 둘. 두 발판 사이 걸음은 4칸 이상, 1·2층 10칸·3층 13칸 이하(메아리 4초 = 16칸 걸음보다 넉넉히)
  const far = floor === 3 ? 13 : 10;
  const plates: [number, number][][] = [];
  for (let k = 0; k < L.links.length; k++) {
    const list = freeIn(L.links[k][0]).filter(([x, z]) => !plates.flat().some(([px, pz]) => Math.abs(px - x) + Math.abs(pz - z) < 2));
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
  // 상자
  for (const pi of L.chest) {
    const list = freeIn(pi);
    if (!list.length) return null;
    const [x, z] = pick(list);
    cells[z][x] = 'c';
  }
  // 불기둥: 2층부터 첫 조각 빼고 조각마다 1~2개(둘레 1칸이 다 바닥)
  if (floor >= 2)
    for (let pi = 1; pi < pieces.length; pi++)
      for (let n = int(1, 2), tries = 0; n > 0 && tries < 30; tries++) {
        const list = freeIn(pi).filter(([x, z]) => [-1, 0, 1].every((j) => [-1, 0, 1].every((i) => floorAt(x + i, z + j))));
        if (!list.length) break;
        const [x, z] = list[int(0, list.length - 1)];
        cells[z][x] = 'ψ';
        n--;
      }
  // 몬스터: 첫 조각 빼고 조각마다 무리. 2층부터 문 곁 발판(나중에 밟을 쪽) 둘레에 지키는 무리
  const kinds = (n: number) => Array.from({ length: n }, (_, i) => (i % 3 === 2 ? 'a' : i % 3 === 1 ? 'w' : 'm'));
  const put = (spots: [number, number][], ks: string[]) => {
    for (const k of ks) {
      const ok = spots.filter(([x, z]) => floorAt(x, z));
      if (!ok.length) return;
      const [x, z] = ok[int(0, ok.length - 1)];
      cells[z][x] = k;
    }
  };
  for (let pi = 1; pi < pieces.length; pi++) put(freeIn(pi), kinds(floor === 1 ? 2 : int(3, 4) + floor - 2));
  if (floor >= 2)
    L.links.forEach(([p], k) => {
      if (p === 0 && floor === 2 && k === 0) return; // 첫 문 하나는 연습
      const [a, b] = plates[k];
      const [mx, mz] = doorCells[k][1];
      const guard = Math.abs(a[0] - mx) + Math.abs(a[1] - mz) < Math.abs(b[0] - mx) + Math.abs(b[1] - mz) ? a : b;
      put(freeIn(p).filter(([x, z]) => Math.abs(x - guard[0]) <= 2 && Math.abs(z - guard[1]) <= 2), kinds(int(3, 4)));
    });
  // 확인: 문을 닫은 채 첫 문들의 발판에 닿고, 짝마다 두 발판 사이 걸음이 far 이하, 문을 다 열면 출구·상자에 닿는다
  const d0 = walkDistances(cells, hx, hz);
  for (let k = 0; k < L.links.length; k++) if (L.links[k][0] === 0 && plates[k].some(([x, z]) => d0[z * N + x] < 0)) return null;
  for (const [a, b] of plates) {
    const d = walkDistances(cells, a[0], a[1])[b[1] * N + b[0]];
    if (d < 0 || d > far) return null;
  }
  const open = cells.map((row) => row.map((c) => (DOORS.includes(c) ? FLOOR_OF.lake : c)));
  const da = walkDistances(open, hx, hz);
  if (da[ez * N + ex + 1] < 0) return null;
  for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) if (cells[z][x] === 'c' && [[1, 0], [-1, 0], [0, 1], [0, -1]].every(([dx, dz]) => da[(z + dz) * N + x + dx] < 0)) return null; // 상자 곁에 닿는다
  // 이음매·말뚝에 잘려 닿지 못하는 자투리 땅은 허공으로. 그래도 문을 닫았을 때 칸 덩어리 수가 조각 수와 다르면(조각이 둘로 갈렸다) 다시
  for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) if (da[z * N + x] < 0 && OPEN(cells[z][x]) && cells[z][x] !== '-') cells[z][x] = '-';
  const seen = new Uint8Array(N * N);
  let regions = 0;
  for (let i = 0; i < N * N; i++) {
    const [x, z] = [i % N, Math.floor(i / N)];
    if (seen[i] || !OPEN(cells[z][x]) || cells[z][x] === '-') continue;
    regions++;
    walkDistances(cells, x, z).forEach((d, j) => d >= 0 && (seen[j] = 1));
  }
  if (regions !== pieces.length) return null;
  return finish(cells, rand);
}

// 결전장(4층): 허공에 뜬 돌 시계 문자판(설계서 5절, 시안 https://claude.ai/artifact/5XxqtzbXxvgoaUUa7CPu7K).
// 지름 DIAL.r*2칸 'ω' 바닥, 가운데 파수꾼('M'). 발판 네 짝은 이웃한 두 시각(1·2, 4·5, 7·8, 10·11시 — 짝 사이 8칸, 메아리 4초에 넉넉히).
// 12·3·6·9시 바깥에 지나온 땅 조각(호숫가·진지·신전·광산)이 이음매('#')로 꿰매져 붙어 있다(닫혀 있다 — 그림). 주인공은 6시 가장자리 안쪽.
// 시각 h의 방향: 화면 위가 12시. 카메라는 +x+z에서 내려다보므로 화면 위 = (-1, -1)/√2, 화면 오른쪽 = (1, -1)/√2
export const DIAL = { r: 20, pad: 15.5, hours: [1, 2, 4, 5, 7, 8, 10, 11] };
export function hourDir(h: number): [number, number] {
  const a = (h / 12) * Math.PI * 2;
  const [up, right] = [Math.cos(a), Math.sin(a)];
  return [(right - up) * Math.SQRT1_2, (-up - right) * Math.SQRT1_2];
}
export function generateWarpArena(): string[] {
  const c = N / 2;
  const cells: string[][] = Array.from({ length: N }, (_, z) => Array.from({ length: N }, (_, x) => (Math.hypot(x + 0.5 - c, z + 0.5 - c) <= DIAL.r ? 'ω' : '-')));
  // 땅 조각: 판 바깥 둥근 땅, 판과 맞닿은 줄은 이음매
  const frags: [number, string][] = [[0, 'λ'], [3, 'ρ'], [6, 'τ'], [9, 'μ']];
  for (const [h, ch] of frags) {
    const [dx, dz] = hourDir(h);
    const [fx, fz] = [c + dx * (DIAL.r + 3.5), c + dz * (DIAL.r + 3.5)];
    for (let z = 0; z < N; z++)
      for (let x = 0; x < N; x++) {
        if (cells[z][x] !== '-' || Math.hypot(x + 0.5 - fx, z + 0.5 - fz) > 4.6) continue;
        const touches = [-1, 0, 1].some((j) => [-1, 0, 1].some((i) => cells[z + j]?.[x + i] === 'ω'));
        cells[z][x] = touches ? '#' : ch;
      }
  }
  const at = (h: number, r: number): [number, number] => {
    const [dx, dz] = hourDir(h);
    return [Math.floor(c + dx * r), Math.floor(c + dz * r)];
  };
  DIAL.hours.forEach((h, k) => {
    const [x, z] = at(h, DIAL.pad);
    cells[z][x] = PLATES[k >> 1];
  });
  cells[c][c] = 'M';
  const [hx, hz] = at(6, DIAL.r - 3);
  cells[hz][hx] = 'H';
  return cells.map((r) => r.join(''));
}
