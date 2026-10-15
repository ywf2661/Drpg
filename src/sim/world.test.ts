import { expect, test } from 'vitest';
import { findPath, walkable } from './path';
import { createWorld, MAP, outcome, RADIUS, STATS, step, type Command, type World } from './world';

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

const DUEL = ['.....', '.Hm..', '.....']; // 주인공 (1.5,1.5), 졸개 (2.5,1.5) 거리 1m

test('공격은 휘두르기 40% 시점에 들어가고 데미지는 8~12', () => {
  const w = createWorld(1, DUEL);
  const m = w.entities[1];
  run(w, 15, [{ type: 'attack', targetId: 1 }]);
  expect(w.entities[0].state).toBe('attack');
  expect(m.hp).toBe(30);
  run(w, 10);
  expect(m.hp).toBeGreaterThanOrEqual(30 - 12);
  expect(m.hp).toBeLessThanOrEqual(30 - 8);
});

test('타격 순간 사거리 밖이면 빗나간다', () => {
  const w = createWorld(1, DUEL);
  const m = w.entities[1];
  run(w, 5, [{ type: 'attack', targetId: 1 }]);
  m.x = 4.5; // 3m 떨어뜨림 (졸개도 자기 휘두르기 중이라 그 자리에 있음)
  run(w, 20);
  expect(m.hp).toBe(30);
  expect(w.entities[0].hp).toBe(100);
});

test('대상을 죽이면 시체가 남고 주인공은 공격을 멈춘다, 전멸이면 clear', () => {
  const w = createWorld(1, DUEL);
  const [hero, m] = w.entities;
  run(w, 600, [{ type: 'attack', targetId: 1 }]);
  expect(m).toMatchObject({ hp: 0, state: 'dead', x: 2.5, z: 1.5 });
  expect(hero).toMatchObject({ state: 'idle', target: null });
  expect(hero.hp).toBeGreaterThan(0);
  expect(outcome(w)).toBe('clear');
});

test('잘못된 attack 명령은 무시한다 (없는 id, 자기 자신, 시체)', () => {
  const w = createWorld(1, ['H.........m']); // 졸개는 10m 밖이라 반응하지 않음
  const [hero, m] = w.entities;
  m.state = 'dead';
  m.hp = 0;
  run(w, 5, [
    { type: 'attack', targetId: 99 },
    { type: 'attack', targetId: -1 },
    { type: 'attack', targetId: 0 },
    { type: 'attack', targetId: 1 },
  ]);
  expect(hero).toMatchObject({ target: null, state: 'idle' });
});

test('몬스터는 8m 안의 주인공만 쫓는다', () => {
  const w = createWorld(1, ['............', 'H......m...w', '............']);
  const [, m, wr] = w.entities;
  run(w, 30);
  expect(m.state).toBe('move');
  expect(m.x).toBeLessThan(7.5);
  expect(wr).toMatchObject({ state: 'idle', x: 11.5, target: null });
});

test('주인공이 죽으면 dead, 몬스터는 멈추고 명령은 무시된다', () => {
  const w = createWorld(1, ['.....', '.Hw..', '.....']);
  const [hero, wr] = w.entities;
  hero.hp = 5;
  run(w, 200);
  expect(hero.state).toBe('dead');
  expect(outcome(w)).toBe('dead');
  expect(wr).toMatchObject({ state: 'idle', target: null });
  run(w, 5, [{ type: 'move', x: 4.5, z: 0.5 }, { type: 'attack', targetId: 1 }]);
  expect(hero).toMatchObject({ x: 1.5, z: 1.5, path: [], target: null });
});

test('같은 시드와 같은 명령이면 결과가 같고, 아무도 벽에 들어가거나 체력이 음수가 되지 않는다', () => {
  const play = () => {
    const w = createWorld(7);
    for (let i = 0; i < 1800; i++) {
      const cmds: Command[] = i % 300 === 0 ? [{ type: 'attack', targetId: 1 + ((i / 300) % 8) }] : [];
      step(w, cmds);
      for (const e of w.entities) {
        expect(walkable(w.grid, Math.floor(e.x), Math.floor(e.z))).toBe(true);
        expect(e.hp).toBeGreaterThanOrEqual(0);
      }
    }
    return w;
  };
  const a = play();
  const b = play();
  expect(JSON.stringify(a.entities)).toBe(JSON.stringify(b.entities));
  expect(a.rng).toBe(b.rng);
  expect(a.entities.some((e) => e.hp < STATS[e.kind].hp)).toBe(true); // 전투가 실제로 일어났는지
});

test('휘두르는 중 다른 몬스터를 공격하면 휘두르기를 멈추고 새 대상에게 간다', () => {
  const w = createWorld(1, ['.............', '.Hm.........m']); // 두 번째 졸개는 11m 밖
  const hero = w.entities[0];
  run(w, 10, [{ type: 'attack', targetId: 1 }]);
  expect(hero.state).toBe('attack');
  step(w, [{ type: 'attack', targetId: 2 }]);
  expect(hero).toMatchObject({ state: 'move', target: 2 });
});

test('같은 대상을 다시 클릭해도 휘두르기는 이어진다', () => {
  const w = createWorld(1, DUEL);
  const hero = w.entities[0];
  run(w, 10, [{ type: 'attack', targetId: 1 }]);
  const t = hero.attackT;
  step(w, [{ type: 'attack', targetId: 1 }]);
  expect(hero.state).toBe('attack');
  expect(hero.attackT).toBeGreaterThan(t);
});

test('휘두르기가 끝났을 때 대상이 멀어졌으면 바로 다시 쫓는다', () => {
  const w = createWorld(1, ['...............', '.....H..m......']); // 졸개가 3m 걸어와서 휘두름
  const m = w.entities[1];
  for (let i = 0; i < 300 && m.state !== 'attack'; i++) step(w, []);
  expect(m.state).toBe('attack');
  step(w, [{ type: 'move', x: 0.5, z: 1.5 }]); // 주인공이 왼쪽으로 도망
  while (m.state === 'attack') step(w, []);
  step(w, []);
  expect(m.state).toBe('move');
});
