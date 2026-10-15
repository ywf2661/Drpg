import { expect, test } from 'vitest';
import { createWorld, DT, step, type World } from './world';

const run = (w: World, ticks: number) => {
  for (let i = 0; i < ticks; i++) step(w, []);
};

test('레벨이 오르면 오른 만큼 스킬 포인트, 찍으면 단계 +1(최대 5), 포인트가 없으면 그대로', () => {
  const w = createWorld(1, ['Hw'], 5); // 전사 경험치 125: 40 + 70 → 2레벨 오름
  expect(w.ranks).toEqual({ cleave: 1, dash: 1, shout: 1, throw: 1 });
  expect(w.points).toBe(0);
  w.entities[1].hp = 1;
  step(w, [{ type: 'attack', targetId: 1 }]);
  run(w, 90);
  expect(w.level).toBe(3);
  expect(w.points).toBe(2);
  step(w, [{ type: 'learn', skill: 'cleave' }, { type: 'learn', skill: 'cleave' }, { type: 'learn', skill: 'cleave' }]);
  expect(w.ranks.cleave).toBe(3);
  expect(w.points).toBe(0);
  w.points = 10;
  for (let i = 0; i < 6; i++) step(w, [{ type: 'learn', skill: 'dash' }]);
  expect(w.ranks.dash).toBe(5);
  expect(w.points).toBe(6);
});

test('가르기 단계: 배율·범위가 커지고 재사용이 짧아진다', () => {
  const hits = (rank: number) => {
    const w = createWorld(1, ['......', '..Hm..', '......']);
    w.ranks.cleave = rank;
    w.gear.weapon = 1; // 단검 4–7
    Object.assign(w.entities[1], { hp: 1000, maxHp: 1000, target: 0, repathT: 1e9 });
    step(w, [{ type: 'skill', x: 9, z: 1.5 }]);
    run(w, 20);
    return { dmg: 1000 - w.entities[1].hp, cd: w.skillCd };
  };
  const r1 = hits(1);
  const r5 = hits(5);
  expect(r5.dmg).toBeGreaterThanOrEqual(Math.round(4 * 2.3));
  expect(r1.dmg).toBeLessThanOrEqual(Math.round(7 * 1.5));
  expect(r5.cd).toBeLessThan(r1.cd - 1); // 4초 → 2.8초
  // 범위: 2.6m 떨어진 적은 1단계엔 안 맞고 5단계(2.8m)엔 맞는다
  const reach = (rank: number) => {
    const w = createWorld(1, ['H.......']);
    w.ranks.cleave = rank;
    const m = w.entities[0];
    w.entities.push({ ...m, id: 1, kind: 'minion', x: 0.5 + 2.6, hp: 1000, maxHp: 1000, target: 0, repathT: 1e9 });
    step(w, [{ type: 'skill', x: 9, z: 0.5 }]);
    run(w, 20);
    return 1000 - w.entities[1].hp;
  };
  expect(reach(1)).toBe(0);
  expect(reach(5)).toBeGreaterThan(0);
});

test('돌진 단계: 거리가 늘어난다(5 → 7m)', () => {
  const dash = (rank: number) => {
    const w = createWorld(1, ['H.........']);
    w.ranks.dash = rank;
    step(w, [{ type: 'dash', x: 20, z: 0.5 }]);
    run(w, 40);
    return w.entities[0].x - 0.5;
  };
  expect(dash(1)).toBeCloseTo(5, 0);
  expect(dash(5)).toBeCloseTo(7, 0);
});

test('함성 단계: 기절이 길어지고 재사용이 짧아진다', () => {
  const w = createWorld(1, ['H.m']);
  w.ranks.shout = 5;
  step(w, [{ type: 'shout' }]);
  expect(w.entities[1].stunT).toBeCloseTo(3.2 - DT, 5);
  expect(w.shoutCd).toBeCloseTo(11, 5); // 대기는 다음 틱부터 줄어든다
});

test('도끼 단계: 배율이 커지고(2.2배) 재사용이 짧아진다', () => {
  const w = createWorld(1, ['H...m']);
  w.ranks.throw = 5;
  w.gear.weapon = 1;
  Object.assign(w.entities[1], { hp: 1000, maxHp: 1000, target: 0, repathT: 1e9 });
  step(w, [{ type: 'throw', x: 9, z: 0.5 }]);
  expect(w.throwCd).toBeCloseTo(1.7, 5);
  run(w, 40);
  expect(1000 - w.entities[1].hp).toBeGreaterThanOrEqual(Math.round(4 * 2.2));
  expect(1000 - w.entities[1].hp).toBeLessThanOrEqual(Math.round(7 * 2.2));
});
