import { expect, test } from 'vitest';
import { createWorld, step, type Command, type Entity, type World } from './world';

// 맞는 순간까지 돌린다(최대 2초). 적은 기절시켜 두어 스스로 움직이지 않는다
const until = (w: World, cmd: Command) => {
  step(w, [cmd]);
  for (let i = 0; i < 120 && w.impacts === 0; i++) step(w, []);
};
const hold = (...es: Entity[]) => es.forEach((e) => Object.assign(e, { hp: 1000, maxHp: 1000, stunT: 1e9 }));

test('가르기: 맞은 적이 주인공 반대쪽으로 0.9m 밀리고 하던 휘두르기가 끊긴다', () => {
  const w = createWorld(1, ['Hm....']);
  const m = w.entities[1];
  hold(m);
  Object.assign(m, { state: 'attack', attackT: 0.3 });
  until(w, { type: 'skill', x: 5, z: 0.5 });
  expect(m.x).toBeCloseTo(2.4, 5);
  expect(m.z).toBeCloseTo(0.5, 5);
  expect(m.state).toBe('idle');
  expect(m.attackT).toBe(0);
  expect(w.impacts).toBe(1);
});

test('밀려나도 벽은 넘지 않는다', () => {
  const w = createWorld(1, ['Hm#']);
  const m = w.entities[1];
  hold(m);
  until(w, { type: 'skill', x: 5, z: 0.5 });
  expect(m.x).toBeGreaterThan(1.5);
  expect(m.x).toBeLessThan(2);
});

test('보스·해골 왕은 밀리지도 끊기지도 않지만 맞은 횟수에는 든다', () => {
  for (const map of ['HM....', 'HK....']) {
    const w = createWorld(1, [map]);
    const b = w.entities[1];
    hold(b);
    Object.assign(b, { state: 'attack', attackT: 0.3 });
    until(w, { type: 'skill', x: 5, z: 0.5 });
    expect(b.x).toBe(1.5);
    expect(b.state).toBe('attack');
    expect(w.impacts).toBe(1);
  }
});

test('돌진 베기: 지나간 길의 적이 옆으로 0.7m 튕긴다', () => {
  const w = createWorld(1, ['H......', '..m....', '.......']);
  const m = w.entities[1];
  hold(m);
  m.z = 1.2;
  until(w, { type: 'dash', x: 6, z: 0.5 });
  expect(m.x).toBeCloseTo(2.5, 5);
  expect(m.z).toBeCloseTo(1.9, 5);
});

test('도끼 던지기: 맞은 적이 날아온 방향으로 0.6m 밀린다', () => {
  const w = createWorld(1, ['H..m...']);
  const m = w.entities[1];
  hold(m);
  until(w, { type: 'throw', x: 6, z: 0.5 });
  expect(m.x).toBeCloseTo(4.1, 5);
});

test('전투의 함성: 기절한 적이 0.4m 움찔 물러난다', () => {
  const w = createWorld(1, ['H.m...']);
  const m = w.entities[1];
  m.hp = m.maxHp = 1000;
  step(w, [{ type: 'shout' }]);
  expect(m.x).toBeCloseTo(2.9, 5);
  expect(m.stunT).toBeGreaterThan(1.9);
  expect(w.impacts).toBe(1);
});

test('평타는 밀지 않는다', () => {
  const w = createWorld(1, ['Hm....']);
  const m = w.entities[1];
  hold(m);
  step(w, [{ type: 'attack', targetId: 1 }]);
  for (let i = 0; i < 120; i++) step(w, []);
  expect(m.hp).toBeLessThan(1000);
  expect(m.x).toBe(1.5);
  expect(w.impacts).toBe(0);
});
