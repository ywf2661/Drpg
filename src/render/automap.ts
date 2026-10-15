// 자동 지도: 횃불 반경 안에 들어온 칸을 층마다 기록해 오른쪽 위에 화면과 같은 방향(마름모)으로 그린다.
import type { World } from '../sim/world';

const SEE = 7; // 기록 반경(m). ponytail: 시야선 없이 원으로 판정해 벽 너머도 기록된다. 거슬리면 Bresenham 시야선
const CELL = 3; // 칸 하나의 지도 가로 반폭(CSS px). 마름모 가로 6px·세로 3px
const W = 160;
const H = 100;
const COLORS = { floor: '#3a342c', wall: '#9a7a58', stairs: '#f0c060', brazier: '#ff8a3d', hero: '#ffffff' };
let canvas: HTMLCanvasElement;
let ctx: CanvasRenderingContext2D;
let seen = new Uint8Array(0);

// (x, z) 중심 반경 r 안에 중심이 있는 칸을 기록한다
export function reveal(seen: Uint8Array, w: number, h: number, x: number, z: number, r: number) {
  for (let cz = Math.max(0, Math.floor(z - r)); cz <= Math.min(h - 1, Math.floor(z + r)); cz++) {
    for (let cx = Math.max(0, Math.floor(x - r)); cx <= Math.min(w - 1, Math.floor(x + r)); cx++) {
      if (Math.hypot(cx + 0.5 - x, cz + 0.5 - z) <= r) seen[cz * w + cx] = 1;
    }
  }
}

// 월드 좌표 → 지도 좌표(주인공 (hx, hz) = 원점). 화면처럼 +x는 오른쪽 아래, +z는 왼쪽 아래, 세로는 절반
export function toMap(x: number, z: number, hx: number, hz: number, cell: number): [number, number] {
  const dx = x - hx;
  const dz = z - hz;
  return [cell * (dx - dz), (cell / 2) * (dx + dz)];
}

export function initAutomap(el: HTMLCanvasElement) {
  canvas = el;
  const dpr = devicePixelRatio;
  Object.assign(canvas, { width: Math.round(W * dpr), height: Math.round(H * dpr) });
  Object.assign(canvas.style, { width: `${W}px`, height: `${H}px` });
  ctx = canvas.getContext('2d')!;
}

export function resetAutomap(world: World) {
  seen = new Uint8Array(world.grid.w * world.grid.h);
}

export function toggleAutomap() {
  canvas.hidden = !canvas.hidden;
}

export function drawAutomap(world: World) {
  const { w, h, blocked } = world.grid;
  const hero = world.entities[0];
  reveal(seen, w, h, hero.x, hero.z, SEE);
  if (canvas.hidden) return;
  const dpr = devicePixelRatio;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  // 칸 (x, z)~(x+1, z+1)이 toMap을 거친 마름모가 되도록 변환을 건다: fillRect(x, z, 1, 1) = 칸 하나
  const [ox, oy] = toMap(0, 0, hero.x, hero.z, CELL);
  ctx.setTransform(CELL * dpr, (CELL / 2) * dpr, -CELL * dpr, (CELL / 2) * dpr, (W / 2 + ox) * dpr, (H / 2 + oy) * dpr);
  const prop = new Set(world.props.map((p) => p.z * w + p.x));
  const open = (x: number, z: number) => x >= 0 && z >= 0 && x < w && z < h && (!blocked[z * w + x] || prop.has(z * w + x));
  for (let z = 0; z < h; z++) {
    for (let x = 0; x < w; x++) {
      if (!seen[z * w + x]) continue;
      if (open(x, z)) ctx.fillStyle = COLORS.floor;
      else if ([-1, 0, 1].some((dz) => [-1, 0, 1].some((dx) => open(x + dx, z + dz)))) ctx.fillStyle = COLORS.wall;
      else continue;
      ctx.fillRect(x, z, 1, 1);
    }
  }
  const mark = (x: number, z: number, color: string, size: number) => {
    ctx.fillStyle = color;
    ctx.fillRect(x + 0.5 - size / 2, z + 0.5 - size / 2, size, size);
  };
  const s = world.stairs;
  if (s && seen[s[1] * w + s[0]]) mark(s[0], s[1], COLORS.stairs, 1.6);
  for (const p of world.props) if (p.kind === 'brazier' && seen[p.z * w + p.x]) mark(p.x, p.z, COLORS.brazier, 0.8);
  mark(hero.x - 0.5, hero.z - 0.5, COLORS.hero, 0.9);
}
