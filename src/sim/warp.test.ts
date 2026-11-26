// 2막 ⑤ 뒤틀린 차원(설계: docs/superpowers/specs/2026-11-26-act2-rift-design.md 2·3절): 메아리·발판·문·불기둥, 1~3층 맵
import { expect, test } from 'vitest';
import { createWorld, step, DT, WARP, type World } from './world';
import { hurt } from './core';
import { walkable } from './path';
import { generateWarp } from './warpmap';
import { generateTent } from './wilds';
import { DOORS, PLATES } from './warp';

const ROOMS = [
  '###############',
  '#.....#.......#',
  '#.α...Α.......#',
  '#H....Α.......#',
  '#...α.Α.......#',
  '#.....#...ψ...#',
  '###############',
];
const run = (w: World, sec: number, each?: (t: number) => void) => {
  for (let i = 0; i < Math.round(sec / DT); i++) (each?.(i * DT), step(w, []));
};
const put = (w: World, x: number, z: number) => Object.assign(w.entities[0], { x: x + 0.5, z: z + 0.5 });
const calm = (w: World) => {
  w.entities[0].maxHp = w.entities[0].hp = 1e9;
  for (const e of w.entities.slice(1)) Object.assign(e, { state: 'dead', hp: 0, x: -50, z: -50 });
};

test('메아리는 4초 동안 없고, 그 뒤엔 4초 전 주인공 자리에 있다', () => {
  const w = createWorld(1, ROOMS);
  run(w, 3.9, (t) => Object.assign(w.entities[0], { x: 1.5 + t, z: 3.5 }));
  expect(w.warp!.echo).toBe(null);
  run(w, 0.2, (t) => Object.assign(w.entities[0], { x: 5.4 + t, z: 3.5 }));
  const [ex, ez] = w.warp!.echo!;
  expect(Math.abs(ex - 1.6)).toBeLessThan(0.3);
  expect(ez).toBe(3.5);
});

test('주인공 혼자서는 문이 안 열리고, 메아리와 발판 둘을 함께 누르면 열린 채로 남는다', () => {
  const w = createWorld(1, ROOMS);
  const door = w.warp!.doors[0];
  expect(walkable(w.grid, 6, 3)).toBe(false);
  put(w, 2, 2);
  run(w, 0.5);
  put(w, 4, 4);
  run(w, 3.4);
  expect(door.open).toBe(false); // 주인공은 발판 둘을 오갔지만 메아리는 아직
  run(w, 0.4);
  expect(door.open).toBe(true);
  put(w, 9, 3);
  run(w, 5);
  expect(door.open).toBe(true);
  expect(door.cells.every((i) => walkable(w.grid, i % w.grid.w, Math.floor(i / w.grid.w)))).toBe(true);
});

test('한 발판에 주인공과 메아리가 함께 서 있어도 문은 안 열린다', () => {
  const w = createWorld(1, ROOMS);
  put(w, 2, 2);
  run(w, 6);
  expect(w.warp!.plates.filter((p) => p.on).length).toBe(1);
  expect(w.warp!.doors[0].open).toBe(false);
});

test('불기둥: 솟은 동안 위에 선 주인공은 한 번 솟을 때 한 번 다친다', () => {
  const w = createWorld(1, ROOMS);
  calm(w);
  put(w, 10, 5);
  let hits = 0;
  let last = w.entities[0].hp;
  run(w, WARP.fireEvery * 2, () => {
    if (w.entities[0].hp < last) hits++;
    last = w.entities[0].hp;
  });
  expect(hits).toBe(2);
});

test('차원의 망령은 쓰러지면 끝이다(신전 밖에서는 다시 일어나지 않는다)', () => {
  const w = createWorld(1, ROOMS.map((r, z) => (z === 1 ? r.replace('#.......#', '#...m...#') : r)), 1, 1, { minion: 'mummy' });
  const m = w.entities.find((e) => e.skin === 'mummy')!;
  hurt(w, m, m.hp + 10);
  expect(m.state).toBe('dead');
});

// 주인공 칸에서 걸어서 닿는 칸
const reach = (w: World) => {
  const g = w.grid;
  const h = w.entities[0];
  const seen = new Uint8Array(g.w * g.h);
  const q = [Math.floor(h.z) * g.w + Math.floor(h.x)];
  seen[q[0]] = 1;
  for (let i = 0; i < q.length; i++) {
    const [x, z] = [q[i] % g.w, Math.floor(q[i] / g.w)];
    for (const [nx, nz] of [[x + 1, z], [x - 1, z], [x, z + 1], [x, z - 1]]) if (walkable(g, nx, nz) && !seen[nz * g.w + nx]) (seen[nz * g.w + nx] = 1), q.push(nz * g.w + nx);
  }
  return seen;
};

test('차원 1~3층: 방 3·4·5, 문을 닫으면 출구에 못 닿고, 발판 짝마다 메아리로 문을 열면 출구까지 걷는다', () => {
  for (const floor of [1, 2, 3])
    for (const seed of [3, 41, 977])
      for (const from of ['w', 'n'] as const) {
        const map = generateWarp(seed, floor, from);
        const w = createWorld(seed, map);
        calm(w);
        const wp = w.warp!;
        expect(wp.rooms.length).toBe([3, 4, 5][floor - 1]);
        const exits = w.exits.filter((e) => e.to === 'warp');
        expect(exits.length).toBe(3);
        const atExit = (seen: Uint8Array) => exits.some((e) => seen[e.z * w.grid.w + e.x]);
        expect(atExit(reach(w))).toBe(false);
        for (const d of wp.doors) {
          const [a, b] = wp.plates.filter((p) => p.pair === d.pair);
          put(w, a.cell % w.grid.w, Math.floor(a.cell / w.grid.w));
          run(w, 0.3);
          put(w, b.cell % w.grid.w, Math.floor(b.cell / w.grid.w));
          run(w, WARP.delay + 0.1);
          expect(d.open).toBe(true);
        }
        put(w, ...(map.reduce<[number, number]>((p, row, z) => (row.includes('H') ? [row.indexOf('H'), z] : p), [0, 0])));
        expect(atExit(reach(w))).toBe(true);
      }
});

test('차원 맵: 같은 시드면 같은 맵, 짝마다 두 발판 사이 걸음은 10칸(3층 13칸) 이하', () => {
  expect(generateWarp(5, 2, 'w')).toEqual(generateWarp(5, 2, 'w'));
  for (const floor of [1, 2, 3])
    for (let seed = 1; seed <= 20; seed++) {
      const map = generateWarp(seed, floor, 's');
      for (let k = 0; k < 4; k++) {
        const cells: number[][] = [];
        map.forEach((row, z) => [...row].forEach((c, x) => c === PLATES[k] && cells.push([x, z])));
        if (!map.some((r) => r.includes(DOORS[k]))) continue;
        expect(cells.length).toBe(2);
        const [[ax, az], [bx, bz]] = cells;
        expect(Math.abs(ax - bx) + Math.abs(az - bz)).toBeLessThanOrEqual(floor === 3 ? 13 : 10);
      }
    }
});

test('천막: 문지기 사제를 쓰러뜨리면 북서쪽 길 끝에 차원 출구가 생기고 나머지 모양은 그대로', () => {
  const [a, b] = [generateTent(true, true, true), generateTent(true, true, true, true)];
  expect(a.join('').includes('Ω')).toBe(false);
  expect(b[0].split('Ω').length - 1).toBe(3);
  const diff = a.reduce((n, row, z) => n + [...row].filter((c, x) => c !== b[z][x]).length, 0);
  expect(diff).toBeLessThan(80); // 길과 출구만
  const w = createWorld(1, b);
  expect(w.exits.filter((e) => e.to === 'warp').length).toBe(3);
  const seen = reach(w);
  expect(w.exits.filter((e) => e.to === 'warp').every((e) => seen[(e.z + 1) * w.grid.w + e.x])).toBe(true);
});
