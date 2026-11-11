import { expect, test } from 'vitest';
import { createWorld, DT, ROLL, STATS, step, TELL, winding, type World } from './world';

const run = (w: World, sec: number) => {
  for (let i = Math.round(sec / DT); i > 0; i--) step(w, []);
};
const ROOM = ['#########', '#H......#', '#########'];
// 졸개가 주인공 옆에서 막 휘두르기 시작한 상태
const duel = () => {
  const w = createWorld(1, ['#########', '#Hm.....#', '#########']);
  step(w, []);
  expect(w.entities[1].state).toBe('attack');
  return w;
};

test('구르기: 조준한 쪽으로 3m, 끝나면 재사용 대기', () => {
  const w = createWorld(1, ROOM);
  const hero = w.entities[0];
  step(w, [{ type: 'roll', x: 7, z: 1.5 }]);
  expect(hero.phase).toBe('roll');
  run(w, 0.5);
  expect(hero.phase).toBe('none');
  expect(hero.x).toBeCloseTo(1.5 + ROLL.dist, 0);
  step(w, [{ type: 'roll', x: 7, z: 1.5 }]); // 아직 대기 중
  expect(hero.phase).toBe('none');
  run(w, ROLL.cd);
  step(w, [{ type: 'roll', x: 7, z: 1.5 }]);
  expect(hero.phase).toBe('roll');
});

test('구르기: 조준이 없으면 가까운 적의 반대쪽으로', () => {
  const w = createWorld(1, ['#########', '#...Hm..#', '#########']);
  step(w, [{ type: 'roll' }]);
  run(w, 0.5);
  expect(w.entities[0].x).toBeLessThan(3);
});

test('근접 공격은 준비 시간 뒤에 맞고, 그 전에는 준비 중으로 보인다', () => {
  const w = duel();
  const [hero, m] = w.entities;
  run(w, TELL.minion! - 0.1);
  expect(winding(m)).toBe(true);
  expect(hero.hp).toBe(hero.maxHp);
  run(w, 0.2);
  expect(winding(m)).toBe(false);
  expect(hero.hp).toBeLessThan(hero.maxHp);
  expect(m.state).toBe('attack'); // 남은 휘두르기 = 빈틈
  expect(STATS.minion.interval - TELL.minion!).toBeGreaterThanOrEqual(0.8);
});

test('구르는 동안은 맞지 않고 회피 기록이 남는다(벽에 막혀 제자리여도)', () => {
  const w = duel();
  const hero = w.entities[0];
  run(w, TELL.minion! - 0.15);
  step(w, [{ type: 'roll', x: 0, z: 1.5 }]); // 벽 쪽: 사거리를 못 벗어난다
  let dodged = false;
  for (let i = 0; i < 20; i++) {
    step(w, []);
    dodged ||= w.combos.some((c) => c.kind === 'dodge');
  }
  expect(hero.x).toBeLessThan(1.6);
  expect(hero.hp).toBe(hero.maxHp);
  expect(dodged).toBe(true);
});

test('타격 순간 사거리 밖이면 빗나간다', () => {
  const w = createWorld(1, ['#########', '#...Hm..#', '#########']);
  step(w, []);
  expect(w.entities[1].state).toBe('attack');
  step(w, [{ type: 'move', x: 1.5, z: 1.5 }]); // 걸어서 벗어난다
  run(w, STATS.minion.interval);
  expect(w.entities[0].hp).toBe(w.entities[0].maxHp);
});

test('받아치기: 평타를 준비 중인 적을 스킬로 치면 2배 기록이 남고 공격이 끊긴다', () => {
  const w = duel();
  const m = w.entities[1];
  m.hp = m.maxHp = 1e5;
  step(w, [{ type: 'throw', x: 5, z: 1.5 }]);
  let seen = false;
  for (let i = 0; i < 10; i++) {
    step(w, []);
    seen ||= w.combos.some((c) => c.kind === 'counter');
  }
  expect(seen).toBe(true);
  expect(w.entities[0].hp).toBe(w.entities[0].maxHp);
});
