// 강령술사: 해골 소환·시체 거인·죽음의 표식·해골 왕 강림
import { expect, test } from 'vitest';
import { BONES, bonesStat, createWorld, CURSE, GIANT, giantStat, lordStat, heroMax, outcome, setLevel, step, type Command, type World } from './world';
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
  expect(w.allies.length).toBe(bonesStat(w).max);
});

test('해골 소환: 단계가 오르면 궁수·법사가 섞이고, 궁수는 멀리서 뼈 화살로 맞힌다', () => {
  const w = necro(['H......m']);
  const kinds = (rank: number) => bonesStat(Object.assign(w, { ranks: { ...w.ranks, cleave: rank } })).kinds;
  expect(kinds(1)).toEqual(['minion', 'minion']);
  expect(kinds(2)).toEqual(['minion', 'archer']);
  expect(kinds(4)).toEqual(['minion', 'archer', 'mage']);
  expect(kinds(5)).toEqual(['minion', 'archer', 'mage', 'minion']);
  w.ranks.cleave = 2;
  const m = w.entities[1];
  m.hp = m.maxHp = 100000;
  m.stunT = 99;
  run(w, 1, [{ type: 'skill' }]);
  w.allies = w.allies.filter((a) => a.kind === 'archer');
  run(w, 60 * 3);
  expect(m.hp).toBeLessThan(m.maxHp);
  expect(Math.hypot(w.allies[0].x - m.x, w.allies[0].z - m.z)).toBeGreaterThan(2); // 붙지 않고 쏜다
});

test('시체 거인: 하나만, 나타나며 주변 적의 눈길을 끈다', () => {
  const w = necro(['H..m']);
  const m = w.entities[1];
  for (let k = 0; k < 2; k++) {
    w.dashCd = 0;
    run(w, 1, [{ type: 'dash' }]);
  }
  expect(w.allies.map((a) => [a.kind, a.skin, a.maxHp])).toEqual([['warrior', 'zombie', giantStat(w).hp]]);
  expect(m.target).toBe(w.allies[0].id);
  expect(GIANT.taunt).toBeGreaterThan(3);
});

test('죽음의 표식: 소환수가 가까운 적을 두고 표식 안의 적에게 간다', () => {
  const w = necro(['m.H......m']);
  const far = w.entities[2];
  for (const m of w.entities.slice(1)) Object.assign(m, { hp: 100000, maxHp: 100000, stunT: 99 });
  run(w, 60 * 4, [{ type: 'skill' }, { type: 'shout', x: far.x, z: far.z }]);
  expect(w.allies.every((a) => a.target === far.id)).toBe(true);
  expect(far.hp).toBeLessThan(far.maxHp);
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

test('해골 왕 강림: 왕 하나가 와서 적을 때리고 시간이 다 되면 사라진다(5단계는 해골 둘과 함께)', () => {
  const w = necro(['H.m']);
  const m = w.entities[1];
  Object.assign(m, { hp: 100000, maxHp: 100000, stunT: 99 });
  w.ranks.throw = 5;
  run(w, 60 * 3, [{ type: 'throw' }]);
  expect(w.allies.map((a) => a.kind).sort()).toEqual(['king', 'minion', 'minion']);
  expect(m.hp).toBeLessThan(m.maxHp);
  run(w, 60 * lordStat(w).life);
  expect(w.allies.some((a) => a.kind === 'king')).toBe(false);
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
