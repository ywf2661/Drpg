// 마법사: 마력탄(원거리 평타), 화염구·서리 고리·낙뢰·마나 방패·순간이동
import { expect, test } from 'vitest';
import { gearName } from '../render/labels';
import { BLINK, BOLT, boltStat, createWorld, frostStat, heroMax, setLevel, step, WARD, WIZ, type Command, type World } from './world';
import { hurt } from './core';

function wizard(map: string[]): World {
  const w = createWorld(1, map);
  w.cls = 'wizard';
  setLevel(w, 1, 0);
  return w;
}
const run = (w: World, ticks: number, first: Command[] = []) => {
  for (let i = 0; i < ticks; i++) step(w, i ? [] : first);
};

test('마법사는 체력이 낮고(85) 장비 이름이 다르다', () => {
  const w = wizard(['H']);
  expect(heroMax(w)).toBe(70); // 1레벨, 천 머리띠(+0)
  expect(gearName('weapon', 1, [], 'wizard')).toBe('완드');
  expect(gearName('armor', 4, [{ kind: 'life', value: 20 }], 'wizard')).toBe('튼튼한 대마법사 로브');
});

test('마력탄: 멀리서(사거리 안) 서서 쏘고, 화살처럼 날아가 맞는다', () => {
  const w = wizard(['H.....m']);
  const [hero, m] = w.entities;
  m.stunT = 10; // 다가오지 않게 세워 둔다(6m < 사거리)
  run(w, 120, [{ type: 'attack', targetId: 1 }]);
  expect(m.x - hero.x).toBeGreaterThan(WIZ.range - 1); // 주인공도 다가가지 않았다
  expect(m.hp).toBeLessThan(m.maxHp);
});

test('화염구: 조준한 쪽으로 날아가 처음 닿는 적에서 터져 옆의 적도 맞는다', () => {
  const w = wizard(['H....mm', '.......']);
  const [, a, b] = w.entities;
  run(w, 50, [{ type: 'skill', x: 6, z: 0.5 }]);
  expect(a.hp).toBeLessThan(a.maxHp);
  expect(b.hp).toBeLessThan(b.maxHp);
  expect(w.skillCd).toBeGreaterThan(0);
});

test('서리 고리: 반경 안 적만 얼린다(기절), 바깥 적은 그대로', () => {
  const w = wizard(['.m.H.....m']);
  const [, near, far] = w.entities;
  run(w, 1, [{ type: 'dash' }]);
  expect(near.stunT).toBeGreaterThan(1);
  expect(near.hp).toBeLessThan(near.maxHp);
  expect(far.stunT).toBe(0);
  expect(w.dashCd).toBeCloseTo(frostStat(w).cd, 1);
});

test('낙뢰: 조준점이 사거리 밖이면 사거리까지 당겨 떨어지고, 반경 안 적은 피해 + 기절', () => {
  const w = wizard(['H........m.......']);
  const m = w.entities[1];
  run(w, 1, [{ type: 'shout', x: 16, z: 0.5 }]); // 15.5m 밖 → 8m 지점(적은 9m)
  const strike = w.blasts.find((b) => b.kind === 'thunder')!;
  expect(strike.x).toBeCloseTo(0.5 + BOLT.range, 5);
  expect(Math.abs(m.x - strike.x)).toBeLessThanOrEqual(boltStat(w).radius);
  expect(m.hp).toBeLessThan(m.maxHp);
  expect(m.stunT).toBeGreaterThan(0);
});

test('낙뢰: 조준점도 가까운 적도 없으면 쓰지 않는다(재사용 대기 없음)', () => {
  const w = wizard(['H....']);
  run(w, 1, [{ type: 'shout' }]);
  expect(w.shoutCd).toBe(0);
});

test('마나 방패: 흡수량까지는 체력이 줄지 않고, 넘친 피해만 받는다', () => {
  const w = wizard(['H']);
  const hero = w.entities[0];
  run(w, 1, [{ type: 'throw' }]);
  const shield = w.wardHp;
  expect(shield).toBe(Math.round(heroMax(w) * WARD.absorb));
  hurt(w, hero, shield - 5);
  expect(hero.hp).toBe(hero.maxHp);
  hurt(w, hero, 20);
  expect(w.wardHp).toBe(0);
  expect(hero.hp).toBe(hero.maxHp - 15);
});

test('순간이동: 조준한 쪽으로 최대 5m, 벽 앞에서 멈추고 잠깐 무적', () => {
  const w = wizard(['H........', '...#.....']);
  const hero = w.entities[0];
  run(w, 1, [{ type: 'roll', x: 20, z: 0.5 }]);
  expect(hero.x).toBeCloseTo(0.5 + BLINK.dist, 1);
  expect(hero.phase).toBe('roll'); // 무적
  const v = wizard(['H..#....']);
  run(v, 1, [{ type: 'roll', x: 7, z: 0.5 }]);
  expect(v.entities[0].x).toBeLessThan(3); // 벽 칸(x = 3) 앞
});

test('낙뢰 천둥(특성 2): 범위 안 여러 곳에 벼락이 잇따라 떨어지고, 피해는 한 번만', () => {
  const w = wizard(['H...m....', '.........', '.........', '.........']);
  w.traits.shout = 2;
  const m = w.entities[1];
  run(w, 1, [{ type: 'shout', x: 4.5, z: 1.5 }]);
  const hp = m.hp;
  expect(hp).toBeLessThan(m.maxHp);
  expect(w.blasts.filter((b) => b.kind === 'thunder')).toHaveLength(1);
  const strikes = new Set<number>();
  for (let i = 0; i < 60; i++) {
    step(w, []);
    for (const b of w.blasts) if (b.kind === 'thunder') strikes.add(b.id);
  }
  expect(strikes.size).toBeGreaterThanOrEqual(5); // 첫 벼락 + 잇따른 벼락들
  expect(w.storm).toHaveLength(0);
  expect(m.hp).toBe(hp);
});

test('스킬을 쓰면 시전 횟수가 늘고(렌더가 시전 동작을 보여 준다), 못 쓰면 그대로', () => {
  const w = wizard(['H...m']);
  run(w, 1, [{ type: 'skill', x: 4, z: 0.5 }]);
  expect(w.casts).toBe(1);
  run(w, 1, [{ type: 'skill', x: 4, z: 0.5 }]); // 재사용 대기 중
  expect(w.casts).toBe(1);
  run(w, 1, [{ type: 'dash' }, { type: 'throw' }]);
  expect(w.casts).toBe(3);
});
