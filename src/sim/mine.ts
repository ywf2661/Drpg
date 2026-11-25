// 보랏빛 광산 퍼즐: 결정 빛 다리(설계: docs/superpowers/specs/2026-11-25-act2-mine-design.md 3절). three.js·Math.random 금지.
// 맵: '-' 허공(못 걷고 시야·투사체는 지나감), '+' 빛 다리, 'd' 결정. 결정 곁(체비쇼프 2칸 안)의 빛 다리 토막이 그 결정의 다리다(양 끝에 결정 둘).
// 결정을 누르면 켜지고 다시 누르면 꺼진다. 켜진 결정은 하나뿐 — 다른 결정을 켜면 앞의 것은 꺼진다.
// 다리는 켜지고 MINE.appear초 뒤부터 밟힌다. 꺼질 때 위에 있던 일반 몬스터는 떨어지고(죽음), 정예·보스는 가장 가까운 낭떠러지 끝을 붙잡고 MINE.hang초 매달린다(받는 피해 ×hangMult, 그다음 그 땅으로 기어오른다).
// 주인공은 떨어지지 않는다: 주인공이 선 다리는 내려설 때까지 남는다. 소환수는 주인공 곁으로 옮긴다.
import { hurt } from './core';
import type { Cell, Grid } from './path';
import { walkable } from './path';
import { DT, MINE, type Chest, type Entity, type World } from './rules';

export type Bridge = { cells: number[]; glow: number; on: boolean; held: boolean }; // glow: 0(없음)~1(다 나타남), on: 켜진 결정의 다리, held: 꺼졌지만 주인공이 서 있어 남았다
export type Crystal = { x: number; z: number; chest: number; bridge: number };
export type Mine = { void: Uint8Array; bridges: Bridge[]; crystals: Crystal[]; lit: number; ver: number }; // lit = 켜진 결정 번호(-1 = 없음), ver = 다리 모양이 바뀐 횟수(렌더가 다시 그린다)

const DIRS: Cell[] = [[1, 0], [-1, 0], [0, 1], [0, -1]];

export function makeMine(map: string[], grid: Grid, chests: Chest[]): Mine | null {
  const { w, h } = grid;
  const voids = new Uint8Array(w * h);
  const seg = new Int32Array(w * h).fill(-1);
  const bridges: Bridge[] = [];
  let any = false;
  for (let z = 0; z < h; z++)
    for (let x = 0; x < w; x++) {
      const c = map[z][x];
      if (c === '-') (voids[z * w + x] = 1), (any = true);
      if (c !== '+' || seg[z * w + x] >= 0) continue;
      const cells = [z * w + x];
      seg[cells[0]] = bridges.length;
      for (let i = 0; i < cells.length; i++) {
        const [cx, cz] = [cells[i] % w, Math.floor(cells[i] / w)];
        for (const [dx, dz] of DIRS) if (map[cz + dz]?.[cx + dx] === '+' && seg[(cz + dz) * w + cx + dx] < 0) (seg[(cz + dz) * w + cx + dx] = bridges.length), cells.push((cz + dz) * w + cx + dx);
      }
      bridges.push({ cells, glow: 0, on: false, held: false });
    }
  if (!any && !bridges.length) return null;
  const crystals: Crystal[] = [];
  for (const ch of chests) {
    if (ch.kind !== 'crystal') continue;
    let bridge = -1;
    for (let dz = -2; dz <= 2 && bridge < 0; dz++) for (let dx = -2; dx <= 2 && bridge < 0; dx++) if (map[ch.z + dz]?.[ch.x + dx] === '+') bridge = seg[(ch.z + dz) * w + ch.x + dx];
    crystals.push({ x: ch.x, z: ch.z, chest: ch.id, bridge });
  }
  return { void: voids, bridges, crystals, lit: -1, ver: 0 };
}

// 결정을 눌렀다: 켜져 있으면 끄고, 아니면 이것만 켠다
export function pressCrystal(w: World, ch: Chest) {
  const m = w.mine;
  if (!m) return;
  const k = m.crystals.findIndex((c) => c.chest === ch.id);
  if (k < 0) return;
  setLit(w, m.lit === k ? -1 : k);
}

export function setLit(w: World, k: number) {
  const m = w.mine!;
  m.lit = k;
  const on = k >= 0 ? m.crystals[k].bridge : -1;
  m.bridges.forEach((b, i) => (b.on = i === on));
  m.ver++;
}

const cellOf = (w: World, e: Entity) => Math.floor(e.z) * w.grid.w + Math.floor(e.x);

export function tickMine(w: World) {
  const m = w.mine;
  if (!m) return;
  const hero = w.entities[0];
  const heroAt = cellOf(w, hero);
  for (const b of m.bridges) {
    const was = w.grid.blocked[b.cells[0]] === 0;
    b.held = !b.on && was && b.cells.includes(heroAt);
    b.glow = b.on || b.held ? Math.min(1, b.glow + DT / MINE.appear) : Math.max(0, b.glow - DT / MINE.appear);
    const open = b.held || (b.on && b.glow >= 1);
    if (open === was) continue;
    for (const c of b.cells) w.grid.blocked[c] = open ? 0 : 2;
    m.ver++;
    if (open) continue;
    // 다리가 사라졌다: 위에 있던 것들
    const on = new Set(b.cells);
    for (const e of w.entities) if (e.kind !== 'hero' && e.state !== 'dead' && on.has(cellOf(w, e))) drop(w, e);
    for (const a of w.allies) if (a.state !== 'dead' && on.has(cellOf(w, a))) [a.x, a.z] = [hero.x, hero.z];
  }
  // 매달린 정예·보스: 시간이 다 되면 가까운 땅으로 기어오른다
  for (const e of w.entities) {
    if (!e.hangT || e.state === 'dead') continue;
    if ((e.hangT = Math.max(0, e.hangT - DT)) > 0) continue;
    const land = nearestLand(w, e);
    if (land) [e.x, e.z] = [land[0] + 0.5, land[1] + 0.5];
  }
}

// 허공에 떨어진다: 일반 몬스터는 죽고(경험치·전리품은 그대로), 정예·보스는 가장자리에 매달린다
export function drop(w: World, e: Entity) {
  if (e.elite || e.kind === 'boss' || e.kind === 'king') {
    Object.assign(e, { hangT: MINE.hang, stunT: Math.max(e.stunT, MINE.hang), state: 'idle', attackT: 0, path: [], phase: 'none' });
    // 허공 한가운데 떠 있지 않게: 가장 가까운 땅의 낭떠러지 끝을 붙잡는다(땅 칸 가운데에서 CLING m 밖, 땅을 바라본다 — 근접으로도 닿는다)
    const land = nearestLand(w, e);
    if (land) {
      const [lx, lz] = [land[0] + 0.5, land[1] + 0.5];
      const d = Math.hypot(e.x - lx, e.z - lz) || 1;
      const [x, z] = [lx + ((e.x - lx) / d) * CLING, lz + ((e.z - lz) / d) * CLING];
      Object.assign(e, { x, z, facing: Math.atan2(lx - x, lz - z) });
    }
    return;
  }
  e.fell = true;
  hurt(w, e, e.hp + 1);
}

// 밀리다 막혔다(core.knock가 부른다): 막은 칸이 허공(또는 꺼진 빛 다리)이면 떨어진다. 주인공은 안 떨어진다
export function edgeFall(w: World, e: Entity, dx: number, dz: number) {
  if (!w.mine || e.kind === 'hero' || e.state === 'dead' || e.hp <= 0) return;
  const [x, z] = [Math.floor(e.x + dx * 0.1), Math.floor(e.z + dz * 0.1)];  if (w.grid.blocked[z * w.grid.w + x] === 2) drop(w, e);
}

const CLING = 0.65; // 매달린 자리: 땅 칸 가운데에서 허공 쪽으로(칸 가장자리 0.5 바로 너머)

// 6칸 안에서 가장 가까운(직선 거리) 걸을 수 있는 땅 칸
function nearestLand(w: World, e: Entity): Cell | null {
  const [x0, z0] = [Math.floor(e.x), Math.floor(e.z)];
  let best: Cell | null = null;
  let bd = Infinity;
  for (let dz = -6; dz <= 6; dz++)
    for (let dx = -6; dx <= 6; dx++) {
      const [x, z] = [x0 + dx, z0 + dz];
      const d = Math.hypot(x + 0.5 - e.x, z + 0.5 - e.z);
      if (d < bd && (dx || dz) && walkable(w.grid, x, z)) [best, bd] = [[x, z], d];
    }
  return best;
}
