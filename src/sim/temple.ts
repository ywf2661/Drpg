// 사암 신전 퍼즐: 햇빛이 드는 자물쇠(설계: docs/superpowers/specs/2026-11-26-act2-temple-design.md 3·4절). three.js·Math.random 금지.
// 맵: '(' 도는 고리 돌(고리 벽·칸막이), ')' 자칼 손잡이(고리 벽에 박힘, 누른다), '/' 봉인(가운데, 빛이 닿으면 열린다), '`' 해 틈(담에 난 빛 구멍).
// 고리 k: 가운데에서 반지름 r의 돌 띠에 틈(3칸 폭) 하나, 틈 반대편에 바깥 복도를 가로지르는 칸막이 하나. q = 틈 방향(0 동·1 남·2 서·3 북).
// 손잡이를 치면 그 고리가 시계 방향(동 → 남)으로 TEMPLE.turn초에 걸쳐 90° 돈다. 도는 동안 칸마다 돌인지 다시 따진다(가로·세로일 때는 칸에 딱 맞는다).
// 햇빛: 해 틈에서 가운데로 곧게 들어오다 처음 만나는 돌에서 멈춘다. 봉인까지 닿으면 봉인이 열린다(구역에서는 출구가 된다, 다시 닫히지 않는다).
import { hurt } from './core';
import { walkable, type Grid } from './path';
import { DT, TEMPLE, type Chest, type Entity, type Exit, type World } from './rules';

export type Ring = { r: number; out: number; q: number; turn: number; cells: number[]; stone: Uint8Array; crushed: number[] }; // crushed = 이번에 돌면서 짓이긴 몬스터 id(한 바퀴에 한 번), out = 칸막이 바깥 끝 반지름, turn = 돌고 있는 정도(0~1, 0 = 멈춤), stone = cells와 같은 순서로 지금 돌인가
export type Temple = { cx: number; cz: number; rings: Ring[]; sun: number; wall: number; seal: number[]; open: boolean; reach: number; beam: number[]; handles: { chest: number; ring: number }[]; ver: number }; // sun = 해 틈 방향(q와 같은 번호), wall = 담 반지름, reach = 빛이 멈춘 곳(가운데에서 칸 수), beam = 빛이 비추는 칸

const DIR: [number, number][] = [[1, 0], [0, 1], [-1, 0], [0, -1]]; // q → (dx, dz)
const BAND = 0.8; // 고리 벽 두께(반지름 ± — 가로·세로에서는 딱 한 칸, 비스듬한 곳은 두 칸이라 대각선으로 새지 않는다)
let crushing = false; // 칸막이가 짓이기는 중(망령도 끝난다)

// 칸 (dx, dz)가 각도 a(라디안)의 고리에서 돌인가: 띠 안에서 틈이 아니거나, 칸막이 줄 위
export function isStone(r: number, out: number, a: number, dx: number, dz: number): boolean {
  const d = Math.hypot(dx, dz);
  const [c, s] = [Math.cos(a), Math.sin(a)];
  const along = c * dx + s * dz; // 틈 쪽으로 나아간 거리
  const perp = Math.abs(-s * dx + c * dz);
  if (Math.abs(d - r) <= BAND) return !(along > 0 && perp <= 1.5);
  return d > r + BAND && d < out && along < 0 && perp <= 0.75; // 칸막이: 틈 반대편으로 뻗는다
}

const angleOf = (g: Ring) => ((g.q + g.turn) * Math.PI) / 2;

// 맵을 읽는다. 고리는 '('·')' 칸의 반지름으로 묶고, 틈 방향은 네 방향 중 띠가 비어 있는 쪽. 신전이 아니면 null
export function makeTemple(map: string[], grid: Grid, chests: Chest[], exits: Exit[]): Temple | null {
  const { w, h } = grid;
  const seal: number[] = [];
  let sx = 0;
  let sz = 0;
  for (let z = 0; z < h; z++) for (let x = 0; x < w; x++) if (map[z][x] === '/') (seal.push(z * w + x), (sx += x), (sz += z));
  if (!seal.length) return null;
  const [cx, cz] = [Math.round(sx / seal.length), Math.round(sz / seal.length)];
  const at = (dx: number, dz: number) => map[cz + dz]?.[cx + dx] ?? '#';
  // 고리 반지름: 동서남북 네 줄 위의 '('·')' 칸(띠가 한 칸 두께) — 틈이 있는 줄에는 없으니 넷 중 어디든 나온 것
  const radii = new Set<number>();
  for (const [ux, uz] of DIR) for (let k = 2; k < Math.max(w, h); k++) if ('()'.includes(at(ux * k, uz * k)) && !'()'.includes(at(ux * (k - 1), uz * (k - 1)))) radii.add(k);
  const rs = [...radii].sort((a, b) => a - b);
  // 담: 해 틈 '`'의 방향과 반지름
  let sun = 0;
  let wall = 0;
  for (let q = 0; q < 4; q++)
    for (let k = 2; k < Math.max(w, h); k++)
      if (at(DIR[q][0] * k, DIR[q][1] * k) === '`') {
        [sun, wall] = [q, k];
        break;
      }
  if (!wall) return null;
  // 칸막이 바깥 끝 = 바깥 고리(또는 담)의 안쪽 가장자리. 고리 칸 후보 = 띠 ~ 칸막이 끝 사이 고리 모양 땅
  const rings: Ring[] = rs.map((r, i) => {
    const out = i + 1 < rs.length ? rs[i + 1] - BAND : wall - 0.5; // 칸막이가 바깥 고리 띠(또는 담)에 닿는다 — 복도를 한 곳에서 끊는다
    const q = DIR.findIndex(([ux, uz]) => !'()'.includes(at(ux * r, uz * r)));
    const cells: number[] = [];
    const R = Math.ceil(out) + 1;
    for (let dz = -R; dz <= R; dz++)
      for (let dx = -R; dx <= R; dx++) {
        const d = Math.hypot(dx, dz);
        if (d >= r - BAND && d < out && cx + dx >= 0 && cz + dz >= 0 && cx + dx < w && cz + dz < h) cells.push((cz + dz) * w + cx + dx);
      }
    return { r, out, q, turn: 0, cells, stone: new Uint8Array(cells.length), crushed: [] };
  });
  const handles = chests
    .filter((c) => c.kind === 'handle')
    .map((c) => ({ chest: c.id, ring: rs.indexOf(Math.round(Math.hypot(c.x - cx, c.z - cz))) }))
    .filter((hd) => hd.ring >= 0);
  const t: Temple = { cx, cz, rings, sun, wall, seal, open: false, reach: wall, beam: [], handles, ver: 0 };
  for (const g of rings) lay(grid, t, g);
  if (!map.some((row) => row.includes('M'))) for (const i of seal) exits.push({ x: i % w, z: Math.floor(i / w), to: 'temple' }); // 구역: 봉인이 출구(열리기 전엔 막혀 밟지 못한다). 결전장은 보스만
  shine(grid, t);
  return t;
}

// 고리의 칸마다 지금 각도로 돌인지 다시 따져 grid를 고친다. 돌이 된 칸 목록을 돌려준다
function lay(grid: Grid, t: Temple, g: Ring): number[] {
  const a = angleOf(g);
  const now: number[] = [];
  g.cells.forEach((i, k) => {
    const s = isStone(g.r, g.out, a, (i % grid.w) - t.cx, Math.floor(i / grid.w) - t.cz) ? 1 : 0;
    if (s && !g.stone[k]) now.push(i);
    g.stone[k] = s;
    grid.blocked[i] = s;
  });
  return now;
}

// 햇빛: 해 틈 바로 안쪽에서 가운데로 한 칸씩, 가운데 줄이 막히면 멈춘다(봉인 칸은 빛을 받는다). beam = 폭 3칸
function shine(grid: Grid, t: Temple) {
  const [ux, uz] = DIR[t.sun];
  const sealSet = new Set(t.seal);
  t.beam = [];
  let k = t.wall - 1;
  for (; k >= 0; k--) {
    const i = (t.cz + uz * k) * grid.w + t.cx + ux * k;
    if (grid.blocked[i] && !sealSet.has(i)) break;
    for (const p of [-1, 0, 1]) t.beam.push((t.cz + uz * k + ux * p) * grid.w + t.cx + ux * k - uz * p);
  }
  t.reach = k + 1;
  if (!t.open && t.reach <= 1) {
    t.open = true;
    for (const i of t.seal) grid.blocked[i] = 0;
    t.ver++;
  }
}

// 손잡이를 쳤다(또는 문지기 사제가 돌린다): 멈춰 있으면 돌기 시작
export function turnRing(w: World, k: number) {
  const g = w.temple?.rings[k];
  if (!g || g.turn > 0) return;
  g.turn = 1e-6;
  g.crushed = [];
}
export function pressHandle(w: World, ch: Chest) {
  const hd = w.temple?.handles.find((h) => h.chest === ch.id);
  if (hd) turnRing(w, hd.ring);
}

const cellOf = (w: World, e: { x: number; z: number }) => Math.floor(e.z) * w.grid.w + Math.floor(e.x);
export const inLight = (w: World, e: { x: number; z: number }) => !!w.temple && w.temple.beam.includes(cellOf(w, e));

export function tickTemple(w: World) {
  const t = w.temple;
  if (!t) return;
  for (const g of t.rings) {
    if (!g.turn) continue;
    g.turn = Math.min(1, g.turn + DT / TEMPLE.turn);
    const done = g.turn >= 1;
    if (done) [g.q, g.turn] = [(g.q + 1) % 4, 0];
    const now = new Set(lay(w.grid, t, g));
    if (done) {
      // 손잡이도 고리와 함께 90° 옮긴다
      for (const hd of t.handles) {
        if (t.rings[hd.ring] !== g) continue;
        const ch = w.chests[hd.chest];
        [ch.x, ch.z] = [t.cx - (ch.z - t.cz), t.cz + (ch.x - t.cx)];
      }
    }
    t.ver++;
    if (!now.size) continue;
    // 돌이 된 칸에 있던 것: 칸막이 쪽(띠 밖)이면 짓이겨지고, 모두 가까운 빈칸으로 밀려난다
    for (const e of [...w.entities, ...w.allies]) {
      if (e.state === 'dead' || !now.has(cellOf(w, e)) || ('skin' in e && e.skin === 'temple_keeper')) continue; // 문지기 사제는 떠 있다
      const band = Math.abs(Math.hypot(e.x - t.cx - 0.5, e.z - t.cz - 0.5) - g.r) <= BAND + 0.5;
      if (!band && e.kind !== 'hero' && e.id >= 0 && !g.crushed.includes(e.id)) g.crushed.push(e.id), crush(w, e); // 밀려나며 칸막이 앞에 다시 걸려도 한 번만
      shove(w, e);
    }
  }
  shine(w.grid, t);
  // 망령: 빛 안에 서 있으면 탄다. 쓰러져 있으면 시간이 지나 일어난다(빛이 닿으면 끝)
  for (const e of w.entities) {
    if (e.skin !== 'mummy' || e.state === 'dead') continue;
    if (inLight(w, e)) {
      if (e.downT) e.downT = 0;
      hurt(w, e, Math.max(1, Math.round(e.maxHp * TEMPLE.burn * DT)));
    } else if (e.downT && (e.downT = Math.max(0, e.downT - DT)) === 0) e.hp = Math.round(e.maxHp * TEMPLE.rise);
  }
}

// 칸막이에 짓이겨진다: 일반 몬스터는 끝, 정예·보스는 최대 체력의 crush만큼
function crush(w: World, e: Entity) {
  crushing = true;
  if (e.elite || e.kind === 'boss' || e.kind === 'king') hurt(w, e, Math.round(e.maxHp * TEMPLE.crush));
  else hurt(w, e, e.hp + 1);
  crushing = false;
  w.blasts.push({ id: w.nextItem++, x: e.x, z: e.z, age: 0, kind: 'slam' });
}

// 가장 가까운 걸을 수 있는 칸 가운데로(6칸 안)
function shove(w: World, e: { x: number; z: number }) {
  let best: [number, number] | null = null;
  let bd = Infinity;
  const [x0, z0] = [Math.floor(e.x), Math.floor(e.z)];
  for (let dz = -6; dz <= 6; dz++)
    for (let dx = -6; dx <= 6; dx++) {
      const d = Math.hypot(x0 + dx + 0.5 - e.x, z0 + dz + 0.5 - e.z);
      if (d < bd && walkable(w.grid, x0 + dx, z0 + dz)) [best, bd] = [[x0 + dx + 0.5, z0 + dz + 0.5], d];
    }
  if (best) [e.x, e.z] = best;
}

// 망령의 체력이 다했다(core.hurt가 부른다): 그늘이면 쓰러졌다가 일어난다(true), 빛 안·칸막이면 끝(false)
export function mummyFalls(w: World, e: Entity): boolean {
  if (crushing || inLight(w, e)) return false;
  if (e.downT) return (e.hp = 1), true; // 이미 쓰러져 있다: 그늘에서 때려도 소용없다
  Object.assign(e, { hp: 1, downT: TEMPLE.down, stunT: TEMPLE.down, state: 'idle', attackT: 0, path: [], phase: 'none' });
  return true;
}
