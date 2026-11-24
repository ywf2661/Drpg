// 호숫가 퍼즐: 수문과 검은 물길(설계: docs/superpowers/specs/2026-11-24-act2-lake-design.md '퍼즐' 절). three.js·Math.random 금지.
// 검은 샘(조각 0)에서 나온 물이 바퀴가 가리키는 쪽 조각으로 흐른다. 흐르는 조각 = 물(못 건넌다), 아닌 조각 = 빠진 여울(건넌다, 느림).
// 바퀴를 돌리면 물이 위에서 아래로 한 칸씩 차고 빠진다(SLUICE.speed). 우물 곁 조각에 물이 차 있으면 우물이 더럽혀져 마을 사람이 기어 나온다.
// 늪 구덩이 조각(sink)에 물이 다 차고 더러운 우물이 없으면 정화: 우물마다 물약·장비, 앓는 주민이 낫는다(한 번).
import type { Cell, Grid } from './path';
import { walkable } from './path';
import { DT, SLUICE, type Chest, type Point, type Sluice, type Wheel, type World } from './rules';
import { rollGear, randSlot } from './core';
import { spawnNear } from './gimmicks';

const SEGS = '012347';
const BLACK = '01234';
const KIDS: Record<Wheel['key'], [number, number]> = { '5': [1, 2], '6': [3, 4], '8': [7, 7] };

// 이 조각에 물이 흘러야 하나
export function flows(sl: Sluice, seg: number): boolean {
  if (seg === 0) return true;
  const g = sl.gates.find((g) => KIDS[g.key].includes(seg));
  if (!g) return false;
  if (g.key === '8') return g.to === 0;
  const parent = g.key === '5' ? 0 : 2;
  return flows(sl, parent) && KIDS[g.key][g.to] === seg;
}

// 물높이 바퀴가 '낮음'이면 배가 바닥에 걸린다
export const lakeLow = (w: World) => !!w.sluice?.gates.some((g) => g.key === '8' && g.to === 1);

export function makeSluice(map: string[], grid: Grid): Sluice | null {
  const segs: Cell[][] = Array.from({ length: 8 }, () => []);
  const gates: Wheel[] = [];
  const wells: Sluice['wells'] = [];
  map.forEach((row, z) =>
    [...row].forEach((c, x) => {
      if (SEGS.includes(c)) segs[+c].push([x, z]);
      if (c === '5' || c === '6' || c === '8') gates.push({ x, z, key: c, to: 0, aim: [[x, z], [x, z]] });
      if (c === '9') wells.push({ x: x + 0.5, z: z + 0.5, dirty: false, spawnT: 0 });
    }),
  );
  if (!gates.length) return null;
  // 차례: 샘에서의 걸음 수(물길 칸만 지나서). 모래톱은 물높이 바퀴에서 먼 차례로
  const { w } = grid;
  const step = new Int32Array(grid.w * grid.h).fill(1e9);
  const q: number[] = [];
  for (const [x, z] of segs[0]) (step[z * w + x] = 0), q.push(z * w + x);
  const lvl = gates.find((g) => g.key === '8');
  for (const [x, z] of segs[7]) step[z * w + x] = lvl ? Math.abs(x - lvl.x) + Math.abs(z - lvl.z) : 0;
  const chan = (x: number, z: number) => BLACK.includes(map[z]?.[x] ?? '');
  for (let k = 0; k < q.length; k++) {
    const [x, z] = [q[k] % w, Math.floor(q[k] / w)];
    for (const [nx, nz] of [[x + 1, z], [x - 1, z], [x, z + 1], [x, z - 1]])
      if (chan(nx, nz) && step[nz * w + nx] > step[q[k]] + 1) (step[nz * w + nx] = step[q[k]] + 1), q.push(nz * w + nx);
  }
  for (const s of segs) s.sort((a, b) => step[a[1] * w + a[0]] - step[b[1] * w + b[0]]);
  // 화살표가 가리킬 곳: 갈래마다 첫 칸 넷의 가운데
  const head = (seg: number): Point | null => {
    const c = segs[seg].slice(0, 4);
    return c.length ? [c.reduce((s, p) => s + p[0], 0) / c.length + 0.5, c.reduce((s, p) => s + p[1], 0) / c.length + 0.5] : null;
  };
  for (const g of gates) g.aim = [head(KIDS[g.key][0]) ?? [g.x + 0.5, g.z + 0.5], head(KIDS[g.key][1]) ?? [g.x + 0.5, g.z + 0.5]];
  const sl: Sluice = { segs, wet: new Uint8Array(grid.w * grid.h), gates, wells, sink: segs[3].length ? 4 : 2, purified: false, acc: 0, ver: 0 };
  segs.forEach((cells, seg) => {
    const on = flows(sl, seg);
    for (const [x, z] of cells) {
      sl.wet[z * w + x] = on ? 1 : 0;
      grid.blocked[z * w + x] = on ? 2 : 0;
      grid.slow![z * w + x] = 1;
    }
  });
  for (const well of wells) well.dirty = dirtyAt(sl, map[0].length, well);
  return sl;
}

const dirtyAt = (sl: Sluice, w: number, p: { x: number; z: number }) => {
  const [cx, cz] = [Math.floor(p.x), Math.floor(p.z)];
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) if (sl.wet[(cz + dz) * w + cx + dx] && sl.segs.slice(0, 5).some((s) => s.some(([x, z]) => x === cx + dx && z === cz + dz))) return true;
  return false;
};

// 바퀴를 눌렀다
export function turnWheel(w: World, ch: Chest) {
  const g = w.sluice?.gates.find((g) => g.x === ch.x && g.z === ch.z);
  if (g) g.to = g.to ? 0 : 1;
}

export function tickSluice(w: World) {
  const sl = w.sluice;
  if (!sl) return;
  const hero = w.entities[0];
  const W = w.grid.w;
  sl.acc += SLUICE.speed * DT;
  const n = Math.floor(sl.acc);
  sl.acc -= n;
  for (let seg = 0; seg < sl.segs.length; seg++) {
    const want = flows(sl, seg) ? 1 : 0;
    for (let k = 0; k < n; k++) {
      const c = sl.segs[seg].find(([x, z]) => sl.wet[z * W + x] !== want);
      if (!c) break;
      const i = c[1] * W + c[0];
      sl.wet[i] = want;
      w.grid.blocked[i] = want ? 2 : 0;
      sl.ver++;
      if (want) for (const e of [...w.entities, ...w.allies]) if (e.state !== 'dead' && Math.floor(e.x) === c[0] && Math.floor(e.z) === c[1]) ashore(w.grid, e);
    }
  }
  // 우물
  sl.wells.forEach((well, k) => {
    well.dirty = dirtyAt(sl, W, well);
    if (!well.dirty || hero.state === 'dead' || Math.hypot(hero.x - well.x, hero.z - well.z) > SLUICE.near || (well.spawnT -= DT) > 0) return;
    well.spawnT = SLUICE.spawn;
    if (w.entities.filter((e) => e.summoner === -10 - k && e.state !== 'dead').length < SLUICE.alive) spawnNear(w, 'minion', well.x, well.z, 1.3, -10 - k);
  });
  // 정화: 늪 구덩이가 다 차고 더러운 우물이 없다
  if (!sl.purified && sl.wells.length && !sl.wells.some((x) => x.dirty) && sl.segs[sl.sink].length && sl.segs[sl.sink].every(([x, z]) => sl.wet[z * W + x])) {
    sl.purified = w.cleansed = true;
    for (const well of sl.wells) {
      w.items.push({ id: w.nextItem++, x: well.x - 0.8, z: well.z + 0.6, kind: 'potion', tier: 0 });
      w.items.push(rollGear(w, well.x + 0.7, well.z + 0.7, randSlot(w), Math.min(4, w.maxTier + 1)));
      w.blasts.push({ id: w.nextItem++, x: well.x, z: well.z, age: 0, kind: 'heal' });
    }
    for (const ch of w.chests) if (ch.kind === 'sick') ch.open = true;
  }
}

// 물이 차오른 칸에 서 있던 것은 가장 가까운 걸을 수 있는 칸으로 밀려난다
function ashore(g: Grid, e: { x: number; z: number; path: Point[] }) {
  for (let r = 1; r <= 4; r++)
    for (let dz = -r; dz <= r; dz++)
      for (let dx = -r; dx <= r; dx++) {
        const [x, z] = [Math.floor(e.x) + dx, Math.floor(e.z) + dz];
        if (walkable(g, x, z)) return Object.assign(e, { x: x + 0.5, z: z + 0.5, path: [] });
      }
}
