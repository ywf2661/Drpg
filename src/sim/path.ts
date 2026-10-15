// 격자 맵과 8방향 A* 길찾기. three.js 의존 없음.
export type Grid = { w: number; h: number; blocked: Uint8Array };
export type Cell = [x: number, z: number];

export const walkable = (g: Grid, x: number, z: number) =>
  x >= 0 && z >= 0 && x < g.w && z < g.h && g.blocked[z * g.w + x] === 0;

const DIRS: Cell[] = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

// from → to 칸 목록(양 끝 포함). 목표가 벽이거나 도달 불가면 null.
export function findPath(g: Grid, from: Cell, to: Cell): Cell[] | null {
  const [tx, tz] = to;
  if (!walkable(g, tx, tz)) return null;
  const n = g.w * g.h;
  const start = from[1] * g.w + from[0];
  const goal = tz * g.w + tx;
  const cost = new Float64Array(n).fill(Infinity);
  const prev = new Int32Array(n).fill(-1);
  const closed = new Uint8Array(n);
  const f = (i: number) => {
    const dx = Math.abs((i % g.w) - tx);
    const dz = Math.abs(Math.floor(i / g.w) - tz);
    return cost[i] + Math.max(dx, dz) + (Math.SQRT2 - 1) * Math.min(dx, dz); // octile 거리
  };
  const open = [start];
  cost[start] = 0;
  while (open.length) {
    // ponytail: open 목록 선형 탐색. 32x32 맵엔 충분, 맵이 커지면 이진 힙으로 교체
    let bi = 0;
    for (let i = 1; i < open.length; i++) if (f(open[i]) < f(open[bi])) bi = i;
    const cur = open[bi];
    open[bi] = open[open.length - 1];
    open.pop();
    if (cur === goal) {
      const path: Cell[] = [];
      for (let i = cur; i !== -1; i = prev[i]) path.push([i % g.w, Math.floor(i / g.w)]);
      return path.reverse();
    }
    if (closed[cur]) continue;
    closed[cur] = 1;
    const cx = cur % g.w;
    const cz = Math.floor(cur / g.w);
    for (const [dx, dz] of DIRS) {
      const nx = cx + dx;
      const nz = cz + dz;
      if (!walkable(g, nx, nz)) continue;
      if (dx && dz && !(walkable(g, cx + dx, cz) && walkable(g, cx, cz + dz))) continue; // 벽 모서리 대각선 통과 금지
      const ni = nz * g.w + nx;
      const c = cost[cur] + (dx && dz ? Math.SQRT2 : 1);
      if (c < cost[ni]) {
        cost[ni] = c;
        prev[ni] = cur;
        open.push(ni);
      }
    }
  }
  return null;
}
