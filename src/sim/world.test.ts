import { expect, test } from 'vitest';
import { findPath, walkable } from './path';
import { createWorld, MAP, RADIUS, step, type Command, type World } from './world';

// 첫 틱에만 명령을 넣고 n틱 진행
const run = (w: World, ticks: number, cmds: Command[] = []) => {
  step(w, cmds);
  for (let i = 1; i < ticks; i++) step(w, []);
};
const dist = (w: World, a: number, b: number) =>
  Math.hypot(w.entities[a].x - w.entities[b].x, w.entities[a].z - w.entities[b].z);

test('기본 맵: 32x32, 주인공 id 0, 졸개 6 전사 2, 모든 몬스터에 도달 가능', () => {
  const w = createWorld(1);
  expect(MAP).toHaveLength(32);
  expect(MAP.every((r) => r.length === 32)).toBe(true);
  expect([w.grid.w, w.grid.h]).toEqual([32, 32]);
  const [hero, ...monsters] = w.entities;
  expect(hero).toMatchObject({ id: 0, kind: 'hero', x: 7.5, z: 26.5, hp: 100, state: 'idle' });
  expect(monsters.filter((e) => e.kind === 'minion')).toHaveLength(6);
  expect(monsters.filter((e) => e.kind === 'warrior')).toHaveLength(2);
  w.entities.forEach((e, i) => expect(e.id).toBe(i));
  for (const m of monsters) {
    expect(findPath(w.grid, [7, 26], [Math.floor(m.x), Math.floor(m.z)])).not.toBeNull();
  }
});

test('H가 없는 맵은 오류', () => {
  expect(() => createWorld(1, ['...', '.m.'])).toThrow();
});

test('클릭한 지점까지 초속 4m로 이동하고 도착하면 idle', () => {
  const w = createWorld(1, ['..........', '.H........', '..........']);
  const hero = w.entities[0];
  run(w, 60, [{ type: 'move', x: 8.5, z: 1.5 }]);
  expect(hero.state).toBe('move');
  expect(hero.x).toBeCloseTo(5.5, 3);
  expect(hero.facing).toBeCloseTo(Math.PI / 2, 5); // +x 방향
  run(w, 60);
  expect([hero.x, hero.z]).toEqual([8.5, 1.5]);
  expect(hero.state).toBe('idle');
});

test('벽을 돌아서 이동하고 한 번도 벽 칸에 들어가지 않는다', () => {
  const w = createWorld(1, ['#######', '#H.#..#', '#..#..#', '#.....#', '#######']);
  const hero = w.entities[0];
  step(w, [{ type: 'move', x: 4.5, z: 1.5 }]);
  for (let i = 0; i < 300; i++) {
    step(w, []);
    expect(walkable(w.grid, Math.floor(hero.x), Math.floor(hero.z))).toBe(true);
  }
  expect([hero.x, hero.z]).toEqual([4.5, 1.5]);
});

test('잘못된 move 명령은 무시한다 (벽, 맵 밖, NaN)', () => {
  const w = createWorld(1, ['.#..', '.H..', '....']);
  const hero = w.entities[0];
  run(w, 10, [
    { type: 'move', x: 1.5, z: 0.5 },
    { type: 'move', x: -3, z: 1.5 },
    { type: 'move', x: 99, z: 99 },
    { type: 'move', x: Number.NaN, z: 1.5 },
  ]);
  expect(hero).toMatchObject({ x: 1.5, z: 1.5, state: 'idle', path: [] });
});

test('겹친 엔티티는 서로 밀어낸다', () => {
  const w = createWorld(1, ['H...............', '............m.m.']);
  const [, a, b] = w.entities;
  b.x = a.x + 0.3;
  b.z = a.z;
  step(w, []);
  expect(dist(w, 1, 2)).toBeCloseTo(RADIUS * 2, 5);
});

test('완전히 겹친 두 엔티티도 분리한다', () => {
  const w = createWorld(1, ['H...............', '............m.m.']);
  const [, a, b] = w.entities;
  b.x = a.x;
  b.z = a.z;
  step(w, []);
  expect(dist(w, 1, 2)).toBeGreaterThan(RADIUS * 2 - 1e-6);
});

test('밀려도 벽 칸으로는 들어가지 않는다', () => {
  const w = createWorld(1, ['################', 'm.............H.', '...............m']);
  const [, a] = w.entities;
  const b = w.entities[2];
  a.x = 0.5;
  a.z = 1.3;
  b.x = 0.5;
  b.z = 1.05;
  step(w, []);
  for (const e of [a, b]) expect(walkable(w.grid, Math.floor(e.x), Math.floor(e.z))).toBe(true);
  expect(b.z).toBe(1.05); // 위쪽(벽)으로 밀리지 못함
});
