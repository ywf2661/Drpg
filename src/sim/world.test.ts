import { expect, test } from 'vitest';
import { findPath, walkable } from './path';
import { createWorld, outcome, RADIUS, STATS, step, type Command, type World } from './world';

// 예전 기본 맵(32×32). 재현성·연결성 테스트용 고정 데이터
const MAP = [
  '################################',
  '#..............#...............#',
  '#..............#...............#',
  '#...m....m.....#.......w.......#',
  '#..............#...............#',
  '#......##......#....m....m.....#',
  '#......##......................#',
  '#..............................#',
  '#..............#...............#',
  '#######.########...............#',
  '#..............#######.#########',
  '#..............................#',
  '#...##....##...................#',
  '#...##....##.......#....#......#',
  '#..................#....#......#',
  '#.........m........#..w.#......#',
  '#..................######......#',
  '#...##....##...................#',
  '#...##....##...................#',
  '#..............................#',
  '##########.###########.#########',
  '#..............#...............#',
  '#..............#...............#',
  '#....###.......#.......m.......#',
  '#..............#...............#',
  '#..............................#',
  '#......H.......................#',
  '#..............#...............#',
  '#..............#.......###.....#',
  '#..............#...............#',
  '#..............#...............#',
  '################################',
];

// 첫 틱에만 명령을 넣고 n틱 진행
const run = (w: World, ticks: number, cmds: Command[] = []) => {
  step(w, cmds);
  for (let i = 1; i < ticks; i++) step(w, []);
};
const dist = (w: World, a: number, b: number) =>
  Math.hypot(w.entities[a].x - w.entities[b].x, w.entities[a].z - w.entities[b].z);

test('기본 맵: 32x32, 주인공 id 0, 졸개 6 전사 2, 모든 몬스터에 도달 가능', () => {
  const w = createWorld(1, MAP);
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
    const w = createWorld(7, MAP);
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

test('벽 너머의 대상은 사거리 안이어도 공격하지 않고 돌아서 간다', () => {
  const w = createWorld(1, ['....', 'H#m.', '....']);
  const [hero, m] = w.entities;
  hero.x = 0.95;
  m.x = 2.05; // 거리 1.1m, 사이에 벽 칸
  step(w, [{ type: 'attack', targetId: 1 }]);
  expect(hero.state).toBe('move');
  expect(m.state).toBe('move');
});

test('휘두르는 중 사이에 벽이 생기면 빗나간다', () => {
  const w = createWorld(1, ['....', 'H.m.', '....']);
  const [hero, m] = w.entities;
  hero.x = 0.95;
  m.x = 2.05;
  run(w, 5, [{ type: 'attack', targetId: 1 }]);
  expect(hero.state).toBe('attack');
  w.grid.blocked[1 * w.grid.w + 1] = 1; // 둘 사이 칸을 벽으로
  run(w, 40);
  expect(m.hp).toBe(30);
  expect(hero.hp).toBe(100);
});

test('밀려나서 직선 경로가 벽을 가로지르면 경로를 다시 계산해 도착한다', () => {
  const w = createWorld(1, ['H#.', '...']);
  const hero = w.entities[0];
  hero.path = [[2.5, 0.5]]; // 벽 칸 (1,0)을 가로지르는 직선
  run(w, 120);
  expect([hero.x, hero.z]).toEqual([2.5, 0.5]);
});

test('시체에 attack 명령을 내려도 진행 중인 이동은 계속된다', () => {
  const w = createWorld(1, ['H.........m']);
  const [hero, m] = w.entities;
  m.state = 'dead';
  m.hp = 0;
  run(w, 5, [{ type: 'move', x: 5.5, z: 0.5 }]);
  step(w, [{ type: 'attack', targetId: 1 }]);
  expect(hero.state).toBe('move');
  expect(hero.path.length).toBeGreaterThan(0);
});

test('층 배율: 몬스터 체력·데미지가 배율만큼 커지고 주인공은 그대로', () => {
  const w = createWorld(1, DUEL, 2);
  const [hero, m] = w.entities;
  expect(hero).toMatchObject({ hp: 100, maxHp: 100, power: 1 });
  expect(m).toMatchObject({ hp: 60, maxHp: 60, power: 2 });
  run(w, 35); // 졸개는 30틱째에 한 번 때린다(3~5 × 2)
  expect(hero.hp).toBeGreaterThanOrEqual(100 - 10);
  expect(hero.hp).toBeLessThanOrEqual(100 - 6);
});

test('계단 칸을 기록하고 바닥으로 취급한다', () => {
  const w = createWorld(1, ['H.>']);
  expect(w.stairs).toEqual([2, 0]);
  expect(walkable(w.grid, 2, 0)).toBe(true);
  expect(w.entities).toHaveLength(1);
});

test('계단 칸 중심 0.5m 안에 들어서면 descend', () => {
  const w = createWorld(1, ['H..>', '....']);
  run(w, 10, [{ type: 'move', x: 3.5, z: 0.5 }]);
  expect(outcome(w)).toBeNull();
  run(w, 60);
  expect(outcome(w)).toBe('descend');
});

test('계단이 있는 층은 몬스터를 다 잡아도 clear가 아니고, 사망이 계단보다 우선', () => {
  const w = createWorld(1, ['H.m.>']);
  const [hero, m] = w.entities;
  m.state = 'dead';
  expect(outcome(w)).toBeNull();
  run(w, 70, [{ type: 'move', x: 4.5, z: 0.5 }]);
  expect(outcome(w)).toBe('descend');
  hero.state = 'dead';
  expect(outcome(w)).toBe('dead');
});

test('계단을 지나가기만 하면 내려가지 않는다', () => {
  const w = createWorld(1, ['H.>..']);
  step(w, [{ type: 'move', x: 4.5, z: 0.5 }]);
  for (let i = 0; i < 90; i++) {
    step(w, []);
    expect(outcome(w)).toBeNull();
  }
  expect(w.entities[0].x).toBe(4.5);
});

test('계단 칸 가장자리를 눌러도 계단 중심으로 가서 내려간다', () => {
  const w = createWorld(1, ['H..>', '....']);
  run(w, 70, [{ type: 'move', x: 3.95, z: 0.95 }]);
  expect(outcome(w)).toBe('descend');
});

test('계단으로 가다가 다른 명령을 내리면 내려가지 않는다', () => {
  const w = createWorld(1, ['H.>..']);
  step(w, [{ type: 'move', x: 2.5, z: 0.5 }]);
  step(w, [{ type: 'move', x: 4.5, z: 0.5 }]);
  for (let i = 0; i < 90; i++) {
    step(w, []);
    expect(outcome(w)).toBeNull();
  }
});

test('소품 글자: B·o는 막고 ,는 지나가며 props에 기록', () => {
  const w = createWorld(1, ['#####', '#HBo#', '#,..#', '#####']);
  expect(walkable(w.grid, 2, 1)).toBe(false);
  expect(walkable(w.grid, 3, 1)).toBe(false);
  expect(walkable(w.grid, 1, 2)).toBe(true);
  expect(w.props).toEqual([
    { kind: 'brazier', x: 2, z: 1 },
    { kind: 'prop', x: 3, z: 1 },
    { kind: 'debris', x: 1, z: 2 },
  ]);
});

test('계단 그림의 구멍(계단 칸 주변 3×3)을 눌러도 계단 중심으로 가서 내려간다', () => {
  const w = createWorld(1, ['H.....', '......', '...>..', '......']);
  run(w, 90, [{ type: 'move', x: 4.5, z: 3.5 }]);
  expect(outcome(w)).toBe('descend');
});

const kill = (seed: number, kind: 'm' | 'w') => {
  const w = createWorld(seed, ['H' + kind + '.']);
  w.entities[1].hp = 1;
  run(w, 60, [{ type: 'attack', targetId: 1 }]);
  return w;
};

test('몬스터가 죽으면 확률로 물약을 그 자리에 떨어뜨린다(졸개 약 20%, 전사 약 35%)', () => {
  for (const [kind, lo, hi] of [['m', 0.12, 0.28], ['w', 0.25, 0.45]] as const) {
    let drops = 0;
    for (let seed = 1; seed <= 400; seed++) {
      const w = kill(seed, kind);
      expect(w.entities[1].state).toBe('dead');
      if (w.items.length) {
        drops++;
        expect(w.items[0]).toMatchObject({ x: w.entities[1].x, z: w.entities[1].z });
      }
    }
    expect(drops / 400).toBeGreaterThan(lo);
    expect(drops / 400).toBeLessThan(hi);
  }
});

test('물약 드롭은 시드로 재현되고 id는 고유', () => {
  const seeds = Array.from({ length: 50 }, (_, i) => i + 1);
  expect(seeds.map((s) => kill(s, 'm').items.length)).toEqual(seeds.map((s) => kill(s, 'm').items.length));
  for (let seed = 0; seed < 200; seed++) {
    // 두 마리 모두 떨어뜨리는 시드를 찾아 id가 겹치지 않는지 본다
    const t = createWorld(seed, ['mHm']);
    for (const m of t.entities.slice(1)) m.hp = 1;
    run(t, 120, [{ type: 'attack', targetId: 1 }]);
    run(t, 120, [{ type: 'attack', targetId: 2 }]);
    if (t.items.length === 2) {
      expect(new Set(t.items.map((i) => i.id)).size).toBe(2);
      return;
    }
  }
  throw new Error('물약 2개 드롭 사례를 찾지 못함');
});

test('지나가면 물약을 줍고, 허리띠가 가득 차면 바닥에 남긴다', () => {
  const w = createWorld(1, ['H....']);
  w.items.push({ id: w.nextItem++, x: 2.5, z: 0.5 });
  run(w, 70, [{ type: 'move', x: 4.5, z: 0.5 }]);
  expect(w.potions).toBe(1);
  expect(w.items).toEqual([]);
  const full = createWorld(1, ['H....']);
  full.potions = 8;
  full.items.push({ id: full.nextItem++, x: 2.5, z: 0.5 });
  run(full, 70, [{ type: 'move', x: 4.5, z: 0.5 }]);
  expect(full.potions).toBe(8);
  expect(full.items).toHaveLength(1);
});

test('물약을 마시면 최대 체력의 50% 회복(최대치까지), 가득하거나 없거나 죽었으면 마시지 않는다', () => {
  const w = createWorld(1, ['H..']);
  const hero = w.entities[0];
  w.potions = 2;
  hero.hp = 30;
  step(w, [{ type: 'drink' }]);
  expect([hero.hp, w.potions]).toEqual([80, 1]);
  step(w, [{ type: 'drink' }]);
  expect([hero.hp, w.potions]).toEqual([100, 0]);
  w.potions = 1;
  step(w, [{ type: 'drink' }]);
  expect(w.potions).toBe(1);
  hero.hp = 10;
  w.potions = 0;
  step(w, [{ type: 'drink' }]);
  expect(hero.hp).toBe(10);
  w.potions = 1;
  hero.hp = 0;
  hero.state = 'dead';
  step(w, [{ type: 'drink' }]);
  expect(w.potions).toBe(1);
});

test('마시기는 이동과 계단 의도를 끊지 않는다', () => {
  const w = createWorld(1, ['H..>', '....']);
  w.potions = 1;
  w.entities[0].hp = 50;
  step(w, [{ type: 'move', x: 3.5, z: 0.5 }]);
  run(w, 60, [{ type: 'drink' }]);
  expect(w.potions).toBe(0);
  expect(outcome(w)).toBe('descend');
});
