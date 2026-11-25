// 2막 ③ 보랏빛 광산(설계: docs/superpowers/specs/2026-11-25-act2-mine-design.md): 허공·결정 빛 다리, 맵 생성, 결전장, 천막 남쪽 출구
import { expect, test } from 'vitest';
import { createWorld, step, type World } from './world';
import { generateTent } from './wilds';
import { crystalsOk, generateMine, generateMineArena } from './minemap';
import { setLit } from './mine';
import { knock } from './core';
import { walkable } from './path';
import type { Cell } from './path';

// 칸 (sx, sz)에서 걸어서 닿는 칸
const reachFrom = (w: World, [sx, sz]: Cell) => {
  const g = w.grid;
  const seen = new Uint8Array(g.w * g.h);
  const q = [sz * g.w + sx];
  seen[q[0]] = 1;
  for (let i = 0; i < q.length; i++) {
    const [cx, cz] = [q[i] % g.w, Math.floor(q[i] / g.w)];
    for (const [nx, nz] of [[cx + 1, cz], [cx - 1, cz], [cx, cz + 1], [cx, cz - 1]]) if (walkable(g, nx, nz) && !seen[nz * g.w + nx]) (seen[nz * g.w + nx] = 1), q.push(nz * g.w + nx);
  }
  return seen;
};
const settle = (w: World, k: number) => {
  setLit(w, k);
  for (let i = 0; i < 40; i++) step(w, []);
};
const calm = (w: World) => {
  w.entities[0].maxHp = w.entities[0].hp = 1e9;
  for (const e of w.entities.slice(1)) Object.assign(e, { state: 'dead', hp: 0, x: -50, z: -50 });
};

test('결정을 누르면 잠시 뒤 빛 다리가 밟히고, 다른 결정을 켜면 앞의 다리는 사라진다', () => {
  //  섬 A | 다리 1 | 섬 B | 다리 2 | 섬 C
  const w = createWorld(1, ['####################', '#Hd....d..d....d...#', '#...++......++.....#', '#...++......++.....#', '####################']);
  calm(w);
  const m = w.mine!;
  expect(m.bridges.length).toBe(2);
  expect(m.crystals.map((c) => c.bridge)).toEqual([0, 0, 1, 1]);
  const b0 = 2 * 20 + 4;
  expect(w.grid.blocked[b0]).toBe(2); // 꺼진 다리 = 허공처럼
  step(w, [{ type: 'open', chestId: m.crystals[0].chest }]);
  for (let i = 0; i < 40 && w.grid.blocked[b0]; i++) step(w, []);
  expect(w.grid.blocked[b0]).toBe(0);
  setLit(w, 2); // 다리 2의 결정
  for (let i = 0; i < 40; i++) step(w, []);
  expect(w.grid.blocked[b0]).toBe(2);
  expect(w.grid.blocked[2 * 20 + 12]).toBe(0);
});

test('다리가 사라지면 위의 일반 몬스터는 떨어져 죽고 정예는 매달린다. 주인공이 선 다리는 내려설 때까지 남는다', () => {
  const w = createWorld(2, ['########', '#H.d...#', '#..++m.#', '#..++W.#', '#......#', '########']);
  const m = w.mine!;
  settle(w, 0);
  const [mob, elite] = [w.entities.find((e) => !e.elite && e.kind !== 'hero')!, w.entities.find((e) => e.elite)!];
  Object.assign(mob, { x: 3.5, z: 2.5, stunT: 99 });
  Object.assign(elite, { x: 4.5, z: 3.5, stunT: 0.1 });
  const hero = w.entities[0];
  setLit(w, -1);
  step(w, []);
  expect(mob.state).toBe('dead');
  expect(mob.fell).toBe(true);
  expect(elite.state).not.toBe('dead');
  expect(elite.hangT).toBeGreaterThan(0);
  // 주인공이 다리 위에 있으면 꺼도 남는다
  settle(w, 0);
  Object.assign(hero, { x: 3.5, z: 2.5 });
  setLit(w, -1);
  for (let i = 0; i < 20; i++) step(w, []);
  expect(w.grid.blocked[2 * 8 + 3]).toBe(0);
  Object.assign(hero, { x: 1.5, z: 1.5 });
  step(w, []);
  expect(w.grid.blocked[2 * 8 + 3]).toBe(2);
  expect(m.bridges[0].held).toBe(false);
});

test('밀려서 허공 가장자리에 걸린 일반 몬스터는 떨어진다', () => {
  const w = createWorld(3, ['#######', '#H.m---', '#......', '#######']);
  const mob = w.entities[1];
  knock(w, mob, 1, 0, 3);
  expect(mob.fell).toBe(true);
  expect(mob.state).toBe('dead');
});

test('광산 1~4구역: 같은 시드면 같은 맵. 빛 다리 없이는 출구에 못 가고, 결정을 차례로 켜면 닿는다', { timeout: 120_000 }, () => {
  for (let seed = 1; seed <= 8; seed++)
    for (let floor = 1; floor <= 4; floor++) {
      const map = generateMine(seed, floor, (['w', 'n', 'e', 's'] as const)[seed % 4]);
      expect(map).toEqual(generateMine(seed, floor, (['w', 'n', 'e', 's'] as const)[seed % 4]));
      expect(map.length).toBe(72);
      expect(crystalsOk(map.map((r) => r.split('')))).toBe(true);
      const w = createWorld(seed, map);
      calm(w);
      const hero: Cell = [Math.floor(w.entities[0].x), Math.floor(w.entities[0].z)];
      const exitIn = w.exits.flatMap((e) => [[e.x + 1, e.z], [e.x - 1, e.z], [e.x, e.z + 1], [e.x, e.z - 1]] as Cell[]).filter(([x, z]) => walkable(w.grid, x, z));
      const hits = (seen: Uint8Array) => exitIn.some(([x, z]) => seen[z * w.grid.w + x]);
      expect(hits(reachFrom(w, hero))).toBe(false);
      // 결정을 차례로: 가 본 곳(주인공이 서 있을 수 있는 곳) 곁의 결정을 켜 보며 넓혀 간다
      const m = w.mine!;
      const tried = new Set<number>();
      const been = reachFrom(w, hero);
      let done = hits(been);
      for (let guard = 0; guard < 40 && !done; guard++) {
        const next = m.crystals.findIndex((c, k) => !tried.has(k) && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => been[(c.z + dz) * w.grid.w + c.x + dx]));
        if (next < 0) break;
        tried.add(next);
        settle(w, next);
        const c = m.crystals[next];
        const stand = ([[1, 0], [-1, 0], [0, 1], [0, -1]] as Cell[]).map(([dx, dz]): Cell => [c.x + dx, c.z + dz]).find(([x, z]) => been[z * w.grid.w + x])!;
        reachFrom(w, stand).forEach((v, i) => v && (been[i] = 1));
        done = hits(been);
      }
      expect(done).toBe(true);
      expect(w.entities.filter((e) => e.kind !== 'hero').length).toBeGreaterThanOrEqual(12);
    }
});

test('광산 결전장: 가운데 섬과 둘레 섬 넷을 빛 다리 넷이 잇고, 다리마다 양 끝에 결정', () => {
  const map = generateMineArena();
  expect(crystalsOk(map.map((r) => r.split('')))).toBe(true);
  const w = createWorld(1, map);
  expect(w.mine!.bridges.length).toBe(4);
  expect(w.mine!.crystals.length).toBe(8);
  expect(w.entities.some((e) => e.kind === 'boss')).toBe(true);
});

test('원정대 천막: 우두머리를 쓰러뜨렸으면 남쪽 길 끝에 광산 출구', () => {
  const tent = generateTent(true, true);
  const w = createWorld(1, tent);
  const exits = w.exits.filter((e) => e.to === 'mine');
  expect(exits.length).toBe(3);
  const seen = reachFrom(w, [Math.floor(w.entities[0].x), Math.floor(w.entities[0].z)]);
  expect(exits.some((e) => seen[(e.z - 1) * w.grid.w + e.x])).toBe(true);
  expect(generateTent(true, false).join('')).not.toContain('z');
  expect(generateTent(true, true).slice(0, 29)).toEqual(generateTent(true, false).slice(0, 29)); // 남쪽 길 위쪽 모양은 그대로
});
