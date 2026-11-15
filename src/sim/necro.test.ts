// 강령술사: 해골 병사·생명 흡수·저주·뼈 갑옷
import { expect, test } from 'vitest';
import { BONES, createWorld, CURSE, heroMax, outcome, setLevel, step, type Command, type World } from './world';
import { hurt, makeEntity } from './core';

function necro(map: string[]): World {
  const w = createWorld(1, map);
  w.cls = 'necromancer';
  setLevel(w, 1, 0);
  return w;
}
const run = (w: World, ticks: number, first: Command[] = []) => {
  for (let i = 0; i < ticks; i++) step(w, i ? [] : first);
};

test('강령술사는 체력 75', () => {
  expect(heroMax(necro(['H']))).toBe(75);
});

test('해골 병사: 둘을 불러 가까운 적을 때려 잡고(경험치는 주인공), 시간이 다 되면 사라진다', () => {
  const w = necro(['H.....', '......', '.....m']);
  const m = w.entities[1];
  m.hp = 12;
  run(w, 1, [{ type: 'skill' }]);
  expect(w.allies.length).toBe(BONES.count);
  run(w, 60 * 10);
  expect(m.state).toBe('dead');
  expect(w.xp).toBeGreaterThan(0);
  expect(outcome(w)).toBe('clear'); // 해골은 적으로 세지 않는다
  run(w, 60 * BONES.life);
  expect(w.allies.length).toBe(0);
});

test('해골은 최대 수를 넘지 않는다(오래된 것부터 무너진다)', () => {
  const w = necro(['H....', '.....']);
  for (let k = 0; k < 3; k++) {
    w.skillCd = 0;
    run(w, 1, [{ type: 'skill' }]);
  }
  expect(w.allies.length).toBe(BONES.max);
});

test('생명 흡수: 주변 적에게 피해를 주고 그만큼 일부 회복', () => {
  const w = necro(['.m.', '.H.', '...']);
  const [hero, m] = w.entities;
  hero.hp = 10;
  run(w, 1, [{ type: 'dash' }]);
  expect(m.hp).toBeLessThan(m.maxHp);
  expect(hero.hp).toBeGreaterThan(10);
});

test('저주: 구역 안의 적은 피해를 더 받고, 닫힌 사슬 문이 녹는다', () => {
  const w = necro(['H.......', '.....D..']);
  const [hero] = w.entities;
  const m = makeEntity(1, 'minion', 5.5, 0.5, 1);
  m.hp = m.maxHp = 1000;
  m.stunT = 99;
  w.entities.push(m);
  run(w, 1, [{ type: 'shout', x: 5.5, z: 0.5 }]);
  expect(w.gates[0].open).toBe(true);
  hurt(w, m, 100, hero);
  expect(1000 - m.hp).toBe(Math.round(100 * (1 + CURSE.amp)));
});

test('뼈 갑옷: 피해를 흡수한다', () => {
  const w = necro(['H.']);
  const hero = w.entities[0];
  run(w, 1, [{ type: 'throw' }]);
  expect(w.wardHp).toBeGreaterThan(0);
  const m = makeEntity(1, 'minion', 1.5, 0.5, 1);
  w.entities.push(m);
  hurt(w, hero, 5, m);
  expect(hero.hp).toBe(hero.maxHp);
});

test('저주 5단계: 구역 안의 시체가 해골로 일어난다(한 번만)', () => {
  const w = necro(['H.......']);
  w.ranks.shout = 5;
  const m = makeEntity(1, 'minion', 4.5, 0.5, 1);
  m.state = 'dead';
  w.entities.push(m);
  run(w, 30, [{ type: 'shout', x: 4.5, z: 0.5 }]);
  expect(w.allies.length).toBe(1);
});

test('몬스터는 가까운 해골을 노려 때리고, 해골은 체력이 다하면 무너진다(경험치·드롭 없음)', () => {
  const w = necro(['H.......m']);
  const [hero, m] = w.entities;
  m.hp = m.maxHp = 100000; // 해골이 못 잡는 졸개
  run(w, 1, [{ type: 'skill' }]);
  const ids = w.allies.map((a) => a.id);
  w.allies.forEach((a) => (a.hp = a.maxHp = 1000));
  run(w, 60 * 5);
  expect(ids).toContain(m.target); // 주인공보다 가까운 해골을 노린다
  expect(w.allies.some((a) => a.hp < a.maxHp)).toBe(true);
  w.allies.forEach((a) => (a.hp = 1));
  run(w, 60 * 6);
  expect(w.allies.length).toBe(0);
  expect(w.xp).toBe(0);
  expect(w.items.length).toBe(0);
  expect(m.target).toBe(hero.id); // 해골이 무너지면 주인공에게로
});
