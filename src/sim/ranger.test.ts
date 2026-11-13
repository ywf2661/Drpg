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

test('관통 사격: 일렬의 적 셋을 모두 맞히고 재사용 대기가 생긴다', () => {
  const w = ranger(['H..mmm..', '........']);
  const foes = w.entities.slice(1);
  for (const m of foes) m.stunT = 10;
  run(w, 50, [{ type: 'skill', x: 7.5, z: 0.5 }]);
  for (const m of foes) expect(m.hp).toBeLessThan(m.maxHp);
  expect(w.skillCd).toBeGreaterThan(0);
});

test('관통 사격 특성 1(밀쳐내기): 벽에 밀어붙인 적은 기절한다', () => {
  const w = ranger(['H..m#', '.....']);
  const m = w.entities[1];
  Object.assign(w, { ranks: { ...w.ranks, cleave: 3 }, traits: { ...w.traits, cleave: 1 } });
  m.hp = m.maxHp = 1000;
  run(w, 20, [{ type: 'skill', x: 4.5, z: 0.5 }]);
  expect(m.stunT).toBeGreaterThan(1);
});

test('관통 사격 특성 2: 세 갈래', () => {
  const w = ranger(['H.......']);
  Object.assign(w, { ranks: { ...w.ranks, cleave: 3 }, traits: { ...w.traits, cleave: 2 } });
  step(w, [{ type: 'skill', x: 7.5, z: 0.5 }]);
  expect(w.shots.filter((s) => s.kind === 'pierce').length).toBe(3);
});

test('관통 사격 5단계: 한 발이 더 뒤따른다', () => {
  const w = ranger(['H.......']);
  w.ranks.cleave = 5;
  step(w, [{ type: 'skill', x: 7.5, z: 0.5 }]);
  const shots = w.shots.filter((s) => s.kind === 'pierce');
  expect(shots.length).toBe(2);
  expect(shots.filter((s) => s.wait).length).toBe(1);
});

test('관통 사격이 사슬 문을 연다', () => {
  const w = ranger(['H..D..', '######']);
  run(w, 30, [{ type: 'skill', x: 5.5, z: 0.5 }]);
  expect(w.gates[0].open).toBe(true);
});

test('덫: 밟은 적이 피해를 입고 묶이고, 덫은 사라진다', () => {
  const w = ranger(['H......m', '........']);
  const m = w.entities[1];
  run(w, 1, [{ type: 'dash', x: 3.5, z: 0.5 }]);
  expect(w.traps.length).toBe(1);
  expect(w.dashCd).toBeGreaterThan(0);
  let caught = false;
  for (let i = 0; i < 200 && !caught; i++) {
    step(w, []);
    caught = m.stunT > 0;
  }
  expect(caught).toBe(true);
  expect(m.hp).toBeLessThan(m.maxHp);
  expect(w.traps.length).toBe(0);
});

test('덫은 최대 2개, 넘으면 오래된 것부터 사라진다', () => {
  const w = ranger(['H.......']);
  for (const x of [2.5, 3.5, 4.5]) {
    w.dashCd = 0;
    step(w, [{ type: 'dash', x, z: 0.5 }]);
  }
  expect(w.traps.map((t) => t.x)).toEqual([3.5, 4.5]);
});

test('덫 5단계: 밟은 적 주변의 적도 묶인다(1단계는 밟은 적만)', () => {
  for (const rank of [1, 5]) {
    const w = ranger(['H...mm..', '........']);
    const [, a, b] = w.entities;
    w.ranks.dash = rank;
    run(w, 2, [{ type: 'dash', x: a.x, z: a.z }]);
    expect(a.stunT).toBeGreaterThan(0);
    expect(b.stunT > 0).toBe(rank === 5);
  }
});

test('덫 특성 1(폭발 덫): 주변 적도 피해를 입는다', () => {
  const w = ranger(['H...mm..', '........']);
  const [, a, b] = w.entities;
  Object.assign(w, { ranks: { ...w.ranks, dash: 3 }, traits: { ...w.traits, dash: 1 } });
  run(w, 2, [{ type: 'dash', x: a.x, z: a.z }]);
  expect(b.hp).toBeLessThan(b.maxHp);
});

test('덫은 주인공을 묶지 않는다, 새 층에는 덫이 없다', () => {
  const w = ranger(['H.......']);
  const hero = w.entities[0];
  run(w, 5, [{ type: 'dash', x: hero.x, z: hero.z }]);
  expect(hero.stunT).toBe(0);
  expect(w.traps.length).toBe(1);
  expect(ranger(['H']).traps).toEqual([]);
});
