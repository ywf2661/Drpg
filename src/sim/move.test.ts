import { expect, test } from 'vitest';
import { createWorld, ROLL, step, type Command, type World } from './world';

// 빈 방(안쪽 14×10)과 가운데 기둥
const ROOM = [
  '################',
  '#..............#',
  '#.H............#',
  '#..............#',
  '#......##......#',
  '#......##......#',
  '#..............#',
  '#..............#',
  '#..............#',
  '#..............#',
  '#..............#',
  '################',
];
const withMap = (edit: (rows: string[][]) => void) => {
  const rows = ROOM.map((r) => [...r]);
  edit(rows);
  return createWorld(1, rows.map((r) => r.join('')));
};
const run = (w: World, ticks: number, cmds: Command[] = []) => {
  step(w, cmds);
  for (let i = 1; i < ticks; i++) step(w, []);
};

test('주인공은 막힘 없는 곳을 직선으로 걷는다(칸 중심을 따라 꺾지 않는다)', () => {
  const w = createWorld(1, ROOM);
  const hero = w.entities[0];
  const [x0, z0, x1, z1] = [hero.x, hero.z, 5.2, 9.7];
  step(w, [{ type: 'move', x: x1, z: z1 }]);
  expect(hero.path).toEqual([[x1, z1]]);
  const len = Math.hypot(x1 - x0, z1 - z0);
  for (let i = 0; i < 600 && hero.path.length; i++) {
    step(w, []);
    expect(Math.abs((hero.x - x0) * (z1 - z0) - (hero.z - z0) * (x1 - x0)) / len).toBeLessThan(1e-6); // 직선에서 벗어난 거리
  }
  step(w, []); // 닿은 다음 틱에 선다
  expect(hero).toMatchObject({ x: x1, z: z1, state: 'idle' });
});

test('기둥 뒤로 갈 때는 돌아가고, 벽 칸을 밟지 않는다', () => {
  const w = createWorld(1, ROOM);
  const hero = w.entities[0];
  step(w, [{ type: 'move', x: 12.5, z: 7.5 }]);
  expect(hero.path.length).toBeGreaterThan(1);
  for (let i = 0; i < 600 && hero.path.length; i++) {
    step(w, []);
    expect(w.grid.blocked[Math.floor(hero.z) * w.grid.w + Math.floor(hero.x)]).toBe(0);
  }
  expect(hero).toMatchObject({ x: 12.5, z: 7.5 });
});

test('벽을 누르면 그쪽으로 갈 수 있는 데까지 간다', () => {
  const w = createWorld(1, ROOM);
  const hero = w.entities[0];
  run(w, 600, [{ type: 'move', x: 2.5, z: 11.6 }]); // 아래쪽 벽 속
  expect(hero.z).toBeGreaterThan(10);
  expect(hero.z).toBeLessThan(11);
  expect(hero.state).toBe('idle');
});

test('가르기를 써도 가던 곳으로 계속 간다', () => {
  const w = createWorld(1, ROOM);
  const hero = w.entities[0];
  run(w, 10, [{ type: 'move', x: 12.5, z: 2.5 }]);
  step(w, [{ type: 'skill' }]);
  expect(hero).toMatchObject({ state: 'attack', skill: true });
  run(w, 600);
  expect(w.cleaves).toBe(1);
  expect(hero).toMatchObject({ x: 12.5, z: 2.5, state: 'idle' });
});

test('구르기를 써도 가던 곳으로 계속 간다', () => {
  const w = createWorld(1, ROOM);
  const hero = w.entities[0];
  run(w, 10, [{ type: 'move', x: 12.5, z: 2.5 }]);
  step(w, [{ type: 'roll', x: hero.x, z: hero.z + 5 }]); // 옆으로 구른다
  expect(hero.phase).toBe('roll');
  run(w, 600);
  expect(hero).toMatchObject({ x: 12.5, z: 2.5, phase: 'none' });
});

test('구르는 중에 누른 이동은 구르기가 끝나면 따른다', () => {
  const w = createWorld(1, ROOM);
  const hero = w.entities[0];
  step(w, [{ type: 'roll', x: hero.x + 5, z: hero.z }]);
  step(w, [{ type: 'move', x: 3.5, z: 9.5 }]);
  expect(hero.phase).toBe('roll');
  run(w, 600);
  expect(hero).toMatchObject({ x: 3.5, z: 9.5 });
  expect(ROLL.dist).toBeGreaterThan(0);
});

test('공격 이동: 가는 길의 가까운 적을 잡고 나서 목적지까지 간다', () => {
  const w = withMap((r) => {
    r[4][5] = 'm'; // 길 옆의 졸개 둘
    r[7][3] = 'm';
  });
  const hero = w.entities[0];
  step(w, [{ type: 'amove', x: 2.5, z: 10.5 }]);
  expect(hero.target).not.toBeNull();
  run(w, 60 * 60);
  expect(w.entities.slice(1).every((e) => e.state === 'dead')).toBe(true);
  expect(hero.state).not.toBe('dead');
  expect(Math.hypot(hero.x - 2.5, hero.z - 10.5)).toBeLessThan(0.3);
  expect(w.amove).toBeNull();
});

test('공격 이동은 그냥 이동 명령으로 풀린다(적을 쫓지 않는다)', () => {
  const w = withMap((r) => (r[9][12] = 'm'));
  const hero = w.entities[0];
  step(w, [{ type: 'amove', x: 2.5, z: 10.5 }]);
  step(w, [{ type: 'move', x: 3.5, z: 2.5 }]);
  expect(w.amove).toBeNull();
  expect(hero.target).toBeNull();
  run(w, 120);
  expect(hero).toMatchObject({ x: 3.5, z: 2.5, target: null });
});

test('스킬 시전 중에는 못 움직인다: 던지는 동안 서 있다가 가던 곳으로 간다', () => {
  const w = createWorld(1, ROOM);
  const hero = w.entities[0];
  run(w, 10, [{ type: 'move', x: 12.5, z: 2.5 }]);
  step(w, [{ type: 'throw', x: 12.5, z: 2.5 }]);
  const x = hero.x;
  run(w, 10, [{ type: 'move', x: 3.5, z: 9.5 }]); // 시전 중에 누른 이동은 기억만 한다
  expect(hero).toMatchObject({ x, state: 'idle' });
  run(w, 600);
  expect(hero).toMatchObject({ x: 3.5, z: 9.5 });
});

test('가르기 중에 누른 이동은 휘두르기를 끊지 않고, 끝난 뒤에 따른다', () => {
  const w = createWorld(1, ROOM);
  const hero = w.entities[0];
  step(w, [{ type: 'skill' }]);
  step(w, [{ type: 'move', x: 3.5, z: 9.5 }]);
  expect(hero).toMatchObject({ x: 2.5, z: 2.5, state: 'attack', skill: true });
  run(w, 600);
  expect(w.cleaves).toBe(1);
  expect(hero).toMatchObject({ x: 3.5, z: 9.5 });
});

test('구르기는 시전을 끊는다', () => {
  const w = createWorld(1, ROOM);
  const hero = w.entities[0];
  step(w, [{ type: 'throw', x: 12.5, z: 2.5 }]);
  expect(w.castT).toBeGreaterThan(0);
  step(w, [{ type: 'roll', x: 12.5, z: 2.5 }]);
  expect(hero.phase).toBe('roll');
  expect(w.castT).toBe(0);
});
