// 약탈자 진지 퍼즐: 화약통과 도화선(설계: docs/superpowers/specs/2026-11-24-act2-raid-design.md 3절). three.js·Math.random 금지.
// 화약통을 누르면 불이 붙고 POWDER.fuse초 뒤 그 자리에서 터진다(바닥에 예고 원). 터지면 반지름 r 안의 주인공·몬스터가 다치고,
// 말뚝 방책 칸이 부서지고, 천막이 쓰러지고, 곁의 화약통은 곧 터진다. 터진 통에 닿은 도화선마다 불꽃이 초속 spark칸으로 기어가
// 끝에 닿은 통을 터뜨린다(사슬). 통은 한 번씩만 터진다.
import { hurt } from './core';
import { DT, POWDER, type Keg, type World } from './rules';

export function igniteKeg(w: World, k: Keg | undefined) {
  if (!k || k.done || k.lit) return;
  Object.assign(k, { lit: true, fuse: k.fuse >= 0 ? Math.min(k.fuse, POWDER.fuse) : POWDER.fuse });
  w.zones.push({ id: w.nextItem++, x: k.x + 0.5, z: k.z + 0.5, r: POWDER.r, t: k.fuse, total: k.fuse, dmg: 0, owner: -1, kind: 'warn' });
}

// 통 가운데(구르는 통은 칸 사이)
export const kegAt = (k: Keg): [number, number] => [k.fx ?? k.x + 0.5, k.fz ?? k.z + 0.5];

export function tickPowder(w: World) {
  for (const k of w.kegs) {
    if (!k.roll || k.done) continue; // 군막에서 굴러 나오는 통
    const [x, z] = kegAt(k);
    const d = Math.hypot(k.roll[0] - x, k.roll[1] - z);
    const s = Math.min(d, POWDER.roll * DT);
    Object.assign(k, { fx: x + ((k.roll[0] - x) / (d || 1)) * s, fz: z + ((k.roll[1] - z) / (d || 1)) * s });
    [k.x, k.z] = [Math.floor(k.fx!), Math.floor(k.fz!)];
    if (d <= s) k.roll = undefined;
  }
  for (const k of w.kegs) if (!k.done && k.fuse >= 0 && (k.fuse -= DT) <= 0) blow(w, k);
  w.sparks = w.sparks.filter((s) => {
    s.t += DT;
    for (let i = 0; i < s.cells.length && s.d[i] <= s.t * POWDER.spark; i++) w.powder.delete(s.cells[i]); // 지나간 도화선은 타 버린다
    return s.d[s.d.length - 1] > s.t * POWDER.spark;
  });
}

function blow(w: World, k: Keg) {
  Object.assign(k, { done: true, fuse: -1, lit: false });
  const W = w.grid.w;
  const [cx, cz] = kegAt(k);
  if (k.chest >= 0 || k.wall) w.grid.blocked[k.z * W + k.x] = 0; // 맵에 놓인 통만 칸을 막았다
  if (k.chest >= 0) w.chests[k.chest].open = true;
  w.blasts.push({ id: w.nextItem++, x: cx, z: cz, age: 0, kind: 'fire' }, { id: w.nextItem++, x: cx, z: cz, age: 0, kind: 'slam' });
  for (const e of [...w.entities, ...w.allies]) {
    if (e.state === 'dead' || Math.hypot(e.x - cx, e.z - cz) > POWDER.r) continue;
    hurt(w, e, Math.max(1, Math.round(e.maxHp * (e.kind === 'hero' ? POWDER.hero : e.kind === 'boss' ? POWDER.boss : POWDER.mob))));
  }
  // 말뚝 방책·천막
  for (const [x, z] of w.stakes) if (Math.hypot(x + 0.5 - cx, z + 0.5 - cz) <= POWDER.r && !w.broken.has(z * W + x)) (w.broken.add(z * W + x), (w.grid.blocked[z * W + x] = 0));
  for (const p of w.props) {
    if ((p.kind !== 'tent' && p.kind !== 'tentBig') || p.gone) continue;
    const n = p.kind === 'tent' ? 2 : 4;
    if (Math.hypot(p.x + n / 2 - cx, p.z + n / 2 - cz) > POWDER.r + n / 2) continue;
    p.gone = true;
    for (let z = p.z; z < p.z + n; z++) for (let x = p.x; x < p.x + n; x++) w.grid.blocked[z * W + x] = 0;
  }
  // 곁의 통은 곧 터진다
  for (const o of w.kegs) if (!o.done && Math.hypot(kegAt(o)[0] - cx, kegAt(o)[1] - cz) <= POWDER.r) Object.assign(o, { lit: true, fuse: o.fuse >= 0 ? Math.min(o.fuse, POWDER.chain) : POWDER.chain });
  // 도화선: 이 통에 닿은 도화선 칸에서 걸음 수를 재며 퍼진다. 끝에 닿은 통은 불꽃이 닿는 때에 터진다
  const dist = new Map<number, number>();
  const q: number[] = [];
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const i = (k.z + dz) * W + k.x + dx;
    if (w.powder.has(i) && !dist.has(i)) dist.set(i, 1), q.push(i);
  }
  for (let n = 0; n < q.length; n++) {
    const i = q[n];
    for (const j of [i + 1, i - 1, i + W, i - W]) if (w.powder.has(j) && !dist.has(j)) dist.set(j, dist.get(i)! + 1), q.push(j);
  }
  if (!q.length) return;
  w.sparks.push({ cells: q, d: q.map((i) => dist.get(i)!), t: 0 });
  for (const o of w.kegs) {
    if (o.done) continue;
    const near = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dz]) => dist.get((o.z + dz) * W + o.x + dx) ?? Infinity);
    const d = Math.min(...near);
    if (d < Infinity) o.fuse = o.fuse >= 0 ? Math.min(o.fuse, (d + 1) / POWDER.spark) : (d + 1) / POWDER.spark;
  }
}
