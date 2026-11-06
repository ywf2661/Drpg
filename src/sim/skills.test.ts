import { expect, test } from 'vitest';
import { walkable } from './path';
import { createWorld, DT, step, type World } from './world';

const run = (w: World, ticks: number) => {
  for (let i = 0; i < ticks; i++) step(w, []);
};

test('전투의 함성: 4m 안의 적을 2초 기절(먼 적은 그대로), 6초간 받는 피해 −30%, 재사용 15초', () => {
  const w = createWorld(1, ['H.m......m']);
  const [hero, near, far] = w.entities;
  step(w, [{ type: 'shout' }]);
  expect(near.stunT).toBeCloseTo(2 - DT, 5);
  expect(far.stunT).toBe(0);
  expect(w.shoutT).toBeGreaterThan(5.9);
  const x0 = near.x;
  run(w, Math.round(1.5 / DT));
  expect(near.x).toBe(x0); // 기절 중엔 움직이지 않는다
  expect(hero.hp).toBe(100); // 공격도 못 한다
  step(w, [{ type: 'shout' }]);
  expect(w.shoutCd).toBeGreaterThan(13); // 대기 중이라 다시 안 됨
  // 피해 감소: 같은 시드의 같은 전투에서 함성이 있으면 덜 맞는다
  const taken = (shout: boolean) => {
    const t = createWorld(9, ['Hw']);
    t.entities[0].hp = t.entities[0].maxHp = 1e6;
    t.shoutT = shout ? 1e9 : 0;
    run(t, 1200);
    return 1e6 - t.entities[0].hp;
  };
  expect(taken(true)).toBeLessThan(taken(false) * 0.8);
});

test('함성은 진행 중인 보스 돌진·예고도 끊는다', () => {
  const w = createWorld(1, ['H...M']);
  step(w, []);
  expect(w.entities[1].phase).toBe('windup');
  step(w, [{ type: 'shout' }]);
  expect(w.entities[1].phase).toBe('none');
});

test('도끼 던지기: 조준 방향으로 날아가 처음 닿는 적에게 120%, 벽에 막히고, 주인공에겐 안 맞는다, 재사용 2.5초', () => {
  const w = createWorld(1, ['H....m.m']);
  const [hero, first, second] = w.entities;
  for (const e of [first, second]) Object.assign(e, { hp: 1000, maxHp: 1000, target: 0, repathT: 1e9 });
  w.gear.weapon = 1; // 단검 4–7 × 1.2 → 5–8
  step(w, [{ type: 'throw', x: 9, z: 0.5 }]);
  expect(w.shots.some((s) => s.kind === 'axe')).toBe(true);
  run(w, 60);
  expect(1000 - first.hp).toBeGreaterThanOrEqual(5);
  expect(1000 - first.hp).toBeLessThanOrEqual(8);
  expect(second.hp).toBe(1000); // 처음 닿은 적에서 멈춘다
  expect(hero.hp).toBe(100);
  step(w, [{ type: 'throw', x: 9, z: 0.5 }]);
  expect(w.shots.some((s) => s.kind === 'axe')).toBe(false); // 아직 대기
  run(w, Math.round(2.5 / DT));
  step(w, [{ type: 'throw', x: 9, z: 0.5 }]);
  expect(w.shots.some((s) => s.kind === 'axe')).toBe(true);
  const wall = createWorld(1, ['H.#m']);
  wall.entities[1].hp = 1000;
  step(wall, [{ type: 'throw', x: 4, z: 0.5 }]);
  run(wall, 60);
  expect(wall.entities[1].hp).toBe(1000);
  expect(walkable(wall.grid, 2, 0)).toBe(false);
});

test('공격 중 가르기를 써도 끝나면 그 대상을 계속 공격한다', () => {
  const w = createWorld(1, ['.....', '.Hm..', '.....']);
  const [hero, m] = w.entities;
  m.hp = m.maxHp = 1000; // 오래 버티게
  for (let i = 0; i < 10; i++) step(w, i ? [] : [{ type: 'attack', targetId: 1 }]);
  step(w, [{ type: 'skill' }]);
  expect(hero.skill).toBe(true);
  expect(hero.target).toBe(1);
  while (hero.skill) step(w, []);
  step(w, []);
  expect(hero).toMatchObject({ state: 'attack', target: 1, skill: false });
  const hp = m.hp;
  for (let i = 0; i < 120; i++) step(w, []);
  expect(m.hp).toBeLessThan(hp); // 기본 공격이 이어진다
});

test('다른 쪽을 조준한 가르기는 그쪽으로 나가고, 끝나면 대상에게 돌아온다', () => {
  const w = createWorld(1, ['.....', 'm.H.m', '.....']);
  const [hero, left, right] = w.entities;
  left.x = hero.x - 1;
  right.x = hero.x + 1;
  left.hp = left.maxHp = right.hp = right.maxHp = 1000;
  step(w, [{ type: 'attack', targetId: right.id }]);
  step(w, [{ type: 'skill', x: 0, z: hero.z }]); // 왼쪽 조준
  const [l0, r0] = [left.hp, right.hp];
  while (hero.skill) step(w, []);
  expect(left.hp).toBeLessThan(l0); // 조준한 쪽이 맞고
  expect(right.hp).toBe(r0); // 대상 쪽은 가르기를 맞지 않는다
  step(w, []);
  expect(hero).toMatchObject({ target: right.id, state: 'attack' });
});

test('가르기 중 공격하던 대상을 다시 눌러도 가르기가 취소되지 않는다', () => {
  const w = createWorld(1, ['.....', '.Hm..', '.....']);
  const [hero, m] = w.entities;
  m.hp = m.maxHp = 1000;
  step(w, [{ type: 'attack', targetId: 1 }]);
  step(w, [{ type: 'skill' }]);
  step(w, [{ type: 'attack', targetId: 1 }]);
  expect(hero.skill).toBe(true);
  while (hero.skill) step(w, []);
  expect(w.cleaves).toBe(1);
});

test('가르기 뒤 대상이 멀어졌으면 멈칫하지 않고 바로 쫓아간다', () => {
  const w = createWorld(1, ['..........', '.Hm.......', '..........']);
  const [hero, m] = w.entities;
  m.hp = m.maxHp = 1000;
  m.stunT = 100; // 몬스터는 가만히
  for (let i = 0; i < 5; i++) step(w, i ? [] : [{ type: 'attack', targetId: 1 }]);
  step(w, [{ type: 'skill' }]);
  m.x = 7.5; // 사거리 밖으로
  while (hero.skill) step(w, []);
  step(w, []);
  expect(hero.state).toBe('move');
  expect(hero.target).toBe(1);
});

test('가르기로 대상이 죽으면 멈춘다', () => {
  const w = createWorld(1, ['.....', '.Hm..', '.....']);
  const [hero, m] = w.entities;
  m.hp = 1;
  step(w, [{ type: 'attack', targetId: 1 }]);
  step(w, [{ type: 'skill' }]);
  while (hero.skill) step(w, []);
  step(w, []);
  expect(m.state).toBe('dead');
  expect(hero).toMatchObject({ state: 'idle', target: null });
});

test('대상 없이 쓴 가르기는 끝나면 그대로 멈춘다', () => {
  const w = createWorld(1, ['.....', '.H...', '.....']);
  const hero = w.entities[0];
  step(w, [{ type: 'skill' }]);
  while (hero.skill) step(w, []);
  step(w, []);
  expect(hero).toMatchObject({ state: 'idle', target: null });
});
