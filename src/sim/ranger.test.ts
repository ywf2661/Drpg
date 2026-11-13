// 궁수: 화살(원거리 평타), 명사수, 관통 사격·덫·화살비·집중, 구르기
import { expect, test } from 'vitest';
import { gearName } from '../render/labels';
import { createWorld, heroMax, RANGER, setLevel, step, type Command, type World } from './world';
import { hurt, makeEntity } from './core';

function ranger(map: string[]): World {
  const w = createWorld(1, map);
  w.cls = 'ranger';
  setLevel(w, 1, 0);
  return w;
}
const run = (w: World, ticks: number, first: Command[] = []) => {
  for (let i = 0; i < ticks; i++) step(w, i ? [] : first);
};

test('궁수는 체력 85, 장비 이름이 다르다', () => {
  const w = ranger(['H']);
  expect(heroMax(w)).toBe(85);
  expect(gearName('weapon', 1, [], 'ranger')).toBe('새총');
  expect(gearName('weapon', 4, [], 'ranger')).toBe('대궁');
});

test('화살: 사거리 안에서 서서 쏘고, 날아가 맞는다', () => {
  const w = ranger(['H......m']); // 7m
  const [hero, m] = w.entities;
  m.stunT = 10; // 다가오지 않게 세워 둔다
  run(w, 120, [{ type: 'attack', targetId: 1 }]);
  expect(m.x - hero.x).toBeGreaterThan(RANGER.range - 1); // 주인공도 다가가지 않았다
  expect(m.hp).toBeLessThan(m.maxHp);
});

test('명사수: 5m 넘게 떨어진 적에게는 1.25배', () => {
  const w = ranger(['H.......', '........']);
  const [hero] = w.entities;
  const near = makeEntity(1, 'minion', hero.x + 2, hero.z, 1);
  const far = makeEntity(2, 'minion', hero.x + 6, hero.z, 1);
  near.hp = far.hp = 1000;
  w.entities.push(near, far);
  hurt(w, near, 40, hero);
  hurt(w, far, 40, hero);
  expect(1000 - near.hp).toBe(40);
  expect(1000 - far.hp).toBe(50);
});
