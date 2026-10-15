import { expect, test } from 'vitest';
import { findPath, walkable } from './path';
import { ARMORS, attackInterval, createWorld, DT, outcome, RADIUS, setLevel, STATS, step, WEAPONS, xpToNext, type Command, type World } from './world';

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

test('같은 시드와 같은 명령이면 결과가 같고, 아무도 벽에 들어가거나 체력이 음수가 되지 않는다', { timeout: 30_000 }, () => {
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
      const potion = w.items.find((i) => i.kind === 'potion');
      if (potion) {
        drops++;
        expect(potion).toMatchObject({ x: w.entities[1].x, z: w.entities[1].z });
      }
    }
    expect(drops / 400).toBeGreaterThan(lo);
    expect(drops / 400).toBeLessThan(hi);
  }
});

test('물약 드롭은 시드로 재현되고 id는 고유', () => {
  const seeds = Array.from({ length: 50 }, (_, i) => i + 1);
  expect(seeds.map((s) => kill(s, 'w').items)).toEqual(seeds.map((s) => kill(s, 'w').items));
  for (let seed = 0; seed < 200; seed++) {
    // 두 마리 모두 떨어뜨리는 시드를 찾아 id가 겹치지 않는지 본다
    const t = createWorld(seed, ['mHm']);
    for (const m of t.entities.slice(1)) m.hp = 1;
    run(t, 120, [{ type: 'attack', targetId: 1 }]);
    run(t, 120, [{ type: 'attack', targetId: 2 }]);
    if (t.items.filter((i) => i.kind === 'potion').length === 2) {
      expect(new Set(t.items.map((i) => i.id)).size).toBe(2);
      return;
    }
  }
  throw new Error('물약 2개 드롭 사례를 찾지 못함');
});

test('지나가면 물약을 줍고, 허리띠가 가득 차면 바닥에 남긴다', () => {
  const w = createWorld(1, ['H....']);
  w.items.push({ id: w.nextItem++, x: 2.5, z: 0.5, kind: 'potion', tier: 0 });
  run(w, 70, [{ type: 'move', x: 4.5, z: 0.5 }]);
  expect(w.potions).toBe(1);
  expect(w.items).toEqual([]);
  const full = createWorld(1, ['H....']);
  full.potions = 8;
  full.items.push({ id: full.nextItem++, x: 2.5, z: 0.5, kind: 'potion', tier: 0 });
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

test('주인공 공격은 무기 수치(데미지·간격)를 따른다', () => {
  for (const tier of [1, 4]) {
    const w = createWorld(3, ['Hw.']);
    w.gear.weapon = tier;
    const m = w.entities[1];
    m.hp = m.maxHp = 1000;
    w.entities[0].hp = w.entities[0].maxHp = 1e6; // 맞아 죽지 않게
    run(w, Math.round((attackInterval(w, w.entities[0]) * 10) / DT), [{ type: 'attack', targetId: 1 }]);
    const [lo, hi] = WEAPONS[tier - 1].dmg;
    expect(1000 - m.hp).toBeGreaterThanOrEqual(lo * 9);
    expect(1000 - m.hp).toBeLessThanOrEqual(hi * 11);
  }
  const w = createWorld(1, ['H']);
  expect(attackInterval(w, w.entities[0])).toBe(0.8);
  w.gear.weapon = 1;
  expect(attackInterval(w, w.entities[0])).toBe(0.6);
});

test('갑옷은 받는 피해를 줄이되 최소 1', () => {
  const hits = (armor: number) => {
    const w = createWorld(5, ['Hm']);
    w.gear.armor = armor;
    w.entities[0].hp = w.entities[0].maxHp = 1e6;
    run(w, 600);
    return 1e6 - w.entities[0].hp;
  };
  expect(ARMORS.map((a) => a.reduce)).toEqual([0, 0.1, 0.2, 0.3]);
  expect(hits(4)).toBeLessThan(hits(1) * 0.8);
  expect(hits(4)).toBeGreaterThan(0);
  const w = createWorld(1, ['Hm']);
  w.gear.armor = 4;
  w.entities[1].power = 0.1; // 3~5 × 0.1 → 0 → 갑옷을 거쳐도 최소 1
  run(w, 200);
  expect(w.entities[0].hp).toBeLessThan(100);
});

test('장비 드롭: 확률, 종류 반반, 단계는 1..maxTier', () => {
  let drops = 0;
  const tiers = new Set<number>();
  const kinds = new Set<string>();
  for (let seed = 1; seed <= 600; seed++) {
    const w = createWorld(seed, ['Hw.']);
    w.maxTier = 3;
    w.entities[1].hp = 1;
    run(w, 60, [{ type: 'attack', targetId: 1 }]);
    for (const it of w.items.filter((i) => i.kind !== 'potion')) {
      drops++;
      tiers.add(it.tier);
      kinds.add(it.kind);
    }
  }
  expect(drops / 600).toBeGreaterThan(0.07);
  expect(drops / 600).toBeLessThan(0.18);
  expect([...tiers].sort()).toEqual([1, 2, 3]);
  expect([...kinds].sort()).toEqual(['armor', 'weapon']);
});

test('더 좋은 장비만 밟으면 장착하고, 같거나 낮은 것은 남긴다', () => {
  const w = createWorld(1, ['H.....']);
  w.gear = { weapon: 2, armor: 2 };
  w.items.push({ id: w.nextItem++, x: 1.5, z: 0.5, kind: 'weapon', tier: 2 });
  w.items.push({ id: w.nextItem++, x: 2.5, z: 0.5, kind: 'weapon', tier: 4 });
  w.items.push({ id: w.nextItem++, x: 3.5, z: 0.5, kind: 'armor', tier: 1 });
  w.items.push({ id: w.nextItem++, x: 4.5, z: 0.5, kind: 'armor', tier: 3 });
  run(w, 90, [{ type: 'move', x: 5.5, z: 0.5 }]);
  expect(w.gear).toEqual({ weapon: 4, armor: 3 });
  expect(w.items.map((i) => [i.kind, i.tier])).toEqual([['weapon', 2], ['armor', 1]]);
});

test('M은 보스: 5층 기준 수치라 층 배율을 쓰지 않는다', () => {
  const w = createWorld(1, ['H...M'], 1.8);
  const b = w.entities[1];
  expect(b.kind).toBe('boss');
  expect([b.maxHp, b.power]).toEqual([500, 1]);
});

// 주인공이 보스만 공격하고 체력이 40 미만이면 물약을 마신다. 이기면 true
function bossFight(seed: number, gear: { weapon: number; armor: number }, potions: number, level = 1) {
  const w = createWorld(seed, ['H.M']);
  w.gear = gear;
  w.potions = potions;
  setLevel(w, level, 0);
  for (let t = 0; t < 120 / DT && !outcome(w); t++) {
    const cmds: Command[] = t === 0 ? [{ type: 'attack', targetId: 1 }] : [];
    if (w.entities[0].hp < 40) cmds.push({ type: 'drink' });
    step(w, cmds);
  }
  return outcome(w) === 'clear';
}

test('보스 밸런스: 5층에 올 만한 레벨(8)이라도 물약을 써야 이기고, 레벨이 낮으면 진다', () => {
  const seeds = Array.from({ length: 40 }, (_, i) => i + 1);
  const wins = (gear: { weapon: number; armor: number }, potions: number, level: number) =>
    seeds.filter((s) => bossFight(s, gear, potions, level)).length;
  expect(wins({ weapon: 3, armor: 3 }, 3, 8)).toBeGreaterThan(30);
  expect(wins({ weapon: 3, armor: 3 }, 0, 8)).toBeLessThan(10);
  expect(wins({ weapon: 2, armor: 2 }, 4, 1)).toBeLessThan(10);
});

test('보스가 있는 층은 보스가 죽으면 클리어(다른 몬스터 생존 무관)', () => {
  const w = createWorld(1, ['H.m..M']);
  expect(outcome(w)).toBeNull();
  w.entities.find((e) => e.kind === 'minion')!.state = 'dead';
  expect(outcome(w)).toBeNull();
  w.entities.find((e) => e.kind === 'boss')!.state = 'dead';
  w.entities.find((e) => e.kind === 'minion')!.state = 'idle';
  expect(outcome(w)).toBe('clear');
});

test('보스는 아무것도 떨어뜨리지 않는다', () => {
  for (let seed = 1; seed <= 100; seed++) {
    const w = createWorld(seed, ['HM']);
    w.entities[1].hp = 1;
    run(w, 60, [{ type: 'attack', targetId: 1 }]);
    expect(w.entities[1].state).toBe('dead');
    expect(w.items).toEqual([]);
  }
});

// 주인공 옆 몬스터 한 마리를 체력 1로 만들어 잡는다
const slay = (w: World, id = 1) => {
  w.entities[id].hp = 1;
  run(w, 90, [{ type: 'attack', targetId: id }]);
  expect(w.entities[id].state).toBe('dead');
};

test('처치 경험치: 졸개 10·전사 25 × 몬스터 층 배율, 보스 0', () => {
  const a = createWorld(1, ['Hm'], 1.4);
  slay(a);
  expect([a.level, a.xp]).toEqual([1, 14]);
  const b = createWorld(1, ['Hw']);
  slay(b);
  expect(b.xp).toBe(25);
  const c = createWorld(1, ['HM']);
  slay(c);
  expect(c.xp).toBe(0);
});

test('레벨업: 경계에서 오르고 남는 경험치는 이월, 한 번에 여러 레벨, 체력 완전 회복', () => {
  expect([1, 2, 3].map(xpToNext)).toEqual([40, 70, 100]);
  const w = createWorld(1, ['Hm']);
  setLevel(w, 1, 35);
  w.entities[0].hp = 20;
  slay(w);
  expect([w.level, w.xp]).toEqual([2, 5]);
  expect([w.entities[0].hp, w.entities[0].maxHp]).toEqual([110, 110]);
  const big = createWorld(1, ['Hw'], 5); // 125 경험치: 40 + 70 + 15
  setLevel(big, 1, 0);
  slay(big);
  expect([big.level, big.xp]).toEqual([3, 15]);
});

test('setLevel은 주인공 최대 체력·체력을 맞추고, 레벨은 주인공 데미지를 5%씩 올린다', () => {
  const w = createWorld(3, ['Hw.'], 1);
  setLevel(w, 11, 7);
  expect([w.level, w.xp, w.entities[0].maxHp, w.entities[0].hp]).toEqual([11, 7, 200, 200]);
  w.gear.weapon = 1; // 단검 4–7 × 1.5
  const m = w.entities[1];
  m.hp = m.maxHp = 1000;
  w.entities[0].hp = w.entities[0].maxHp = 1e6;
  run(w, Math.round((0.6 * 10) / DT), [{ type: 'attack', targetId: 1 }]);
  expect(1000 - m.hp).toBeGreaterThanOrEqual(6 * 9);
  expect(1000 - m.hp).toBeLessThanOrEqual(11 * 11);
});

test('궁수는 사거리 안·시야가 트이면 멀리서 화살을 쏘고, 화살이 날아가 맞힌다', () => {
  const w = createWorld(2, ['H....a']); // 4.5m 거리
  const hero = w.entities[0];
  let flew = false;
  for (let i = 0; i < 180; i++) {
    step(w, []);
    if (w.shots.length) flew = true;
  }
  expect(flew).toBe(true);
  expect(w.entities[1].x).toBeCloseTo(5.5, 5); // 다가오지 않고 그 자리에서 쏜다
  expect(hero.hp).toBeLessThan(100);
});

test('화살은 벽에 막히고, 날아가는 동안 옆으로 비키면 빗나간다', () => {
  const wall = createWorld(1, ['H.#..']);
  wall.shots.push({ id: 0, x: 4.5, z: 0.5, dx: -1, dz: 0, dmg: 10, left: 8 });
  run(wall, 60);
  expect(wall.shots).toEqual([]);
  expect(wall.entities[0].hp).toBe(100);
  const dodge = createWorld(1, ['H....', '.....', '.....']);
  dodge.shots.push({ id: 0, x: 4.5, z: 0.5, dx: -1, dz: 0, dmg: 10, left: 8 });
  run(dodge, 60, [{ type: 'move', x: 0.5, z: 2.5 }]);
  expect(dodge.entities[0].hp).toBe(100);
  expect(dodge.shots).toEqual([]); // 8m를 다 날아가 사라짐
});

test('시야가 막히면 쏘지 않고 다가간다', () => {
  const blocked = createWorld(1, ['H#...a', '.#....', '......']);
  const a = blocked.entities[1];
  const x0 = a.x;
  run(blocked, 60);
  expect(blocked.shots.length).toBe(0);
  expect(a.x).toBeLessThan(x0); // 벽을 돌아 다가오는 중
});

test('가르기: 바라보는 방향 반원 2m 안의 적 모두에게 150%, 뒤·범위 밖은 제외', () => {
  // 주인공 (2.5, 2.5)이 +x를 조준. 앞 (3,1)(3,2)(3,3)은 맞고 뒤 (1,2)와 먼 (5,2)는 아님
  const w = createWorld(1, ['.......', '...m...', '.mHm.m.', '...m...', '.......']);
  const [hero, ...mobs] = w.entities;
  const start = mobs.map((e) => [e.x, e.z]);
  for (const e of mobs) e.hp = e.maxHp = 1000;
  w.gear.weapon = 1; // 단검 4–7 × 1.5 → 6–11
  step(w, [{ type: 'skill', x: 10, z: hero.z }]);
  run(w, 20); // 타격 시점(0.6초 × 40%) 지남
  const front = (x: number, z: number) => x > hero.x && Math.hypot(x - hero.x, z - hero.z) <= 2;
  mobs.forEach((e, i) => {
    const d = 1000 - e.hp;
    if (front(start[i][0], start[i][1])) {
      expect(d).toBeGreaterThanOrEqual(6);
      expect(d).toBeLessThanOrEqual(11);
    } else expect(d).toBe(0);
  });
  expect(mobs.filter((e) => e.hp < 1000)).toHaveLength(3);
  expect(w.cleaves).toBe(1);
  run(w, 30);
  expect(hero.state).toBe('idle'); // 끝나면 이어서 휘두르지 않는다
});

test('가르기는 벽 너머 적은 맞히지 않는다', () => {
  const w = createWorld(1, ['H#m']);
  w.entities[1].hp = w.entities[1].maxHp = 1000;
  step(w, [{ type: 'skill', x: 5, z: 0.5 }]);
  run(w, 30);
  expect(w.entities[1].hp).toBe(1000);
});

test('가르기 재사용 대기 4초, 죽으면 못 쓴다, 대상 없이도 쓴다', () => {
  const w = createWorld(1, ['H....']);
  step(w, [{ type: 'skill' }]);
  expect(w.entities[0].state).toBe('attack');
  run(w, 60);
  step(w, [{ type: 'skill' }]);
  expect(w.cleaves).toBe(1);
  expect(w.entities[0].state).toBe('idle'); // 대기 중이라 무시
  run(w, Math.round(3 / DT));
  step(w, [{ type: 'skill' }]);
  expect(w.entities[0].state).toBe('attack');
  const dead = createWorld(1, ['H..']);
  dead.entities[0].state = 'dead';
  step(dead, [{ type: 'skill' }]);
  expect(dead.skillCd).toBe(0);
});

test('정예 전사(W): 체력 ×3, 데미지 ×1.3, 경험치 ×4, 그 층 최고 단계 장비를 반드시 떨어뜨린다', () => {
  const w = createWorld(1, ['HW'], 1.3);
  const e = w.entities[1];
  expect([e.kind, e.elite, e.maxHp]).toEqual(['warrior', true, Math.round(60 * 3 * 1.3)]);
  w.maxTier = 3;
  slay(w);
  expect([w.level, w.xp]).toEqual([3, 130 - 40 - 70]); // 25 × 1.3 × 4 = 130 → 레벨 2번
  expect(w.items.filter((i) => i.kind !== 'potion').map((i) => i.tier)).toEqual([3]);
  // 데미지: 전사 6–9 × (1 + 0.3/2) × 1.3 → 9–13 (천옷 감소 0)
  const hitter = createWorld(2, ['HW'], 1.3);
  const hero = hitter.entities[0];
  hero.hp = hero.maxHp = 1e6;
  const hits: number[] = [];
  for (let t = 0; t < 900; t++) {
    const before = hero.hp;
    step(hitter, []);
    if (hero.hp < before) hits.push(before - hero.hp);
  }
  expect(hits.length).toBeGreaterThan(5);
  expect(Math.min(...hits)).toBeGreaterThanOrEqual(9);
  expect(Math.max(...hits)).toBeLessThanOrEqual(13);
});
