// 정예 특성: 무작위 등장, 특성별 효과
import { expect, test } from 'vitest';
import { generateFloor } from './dungeon';
import { attackInterval, createWorld, ELITE, ELITE_FX, ELITE_KIND_LIST, moveSpeed, STATS, step, type EliteKind, type World } from './world';
import { hurt, roll } from './core';

const elite = (kind: EliteKind, map = ['HW']): World => {
  const w = createWorld(1, map);
  w.entities.find((e) => e.elite)!.eliteKind = kind;
  return w;
};

test('층마다 몬스터의 약 ELITE.chance가 정예로 나오고, 어떤 몬스터든 정예가 될 수 있다', () => {
  let [elites, all] = [0, 0];
  const seen = new Set<string>();
  for (let seed = 1; seed <= 200; seed++) {
    for (const c of generateFloor(seed, 3).join('')) {
      if ('mwag'.includes(c)) all++;
      if ('NWAG'.includes(c)) [elites, all] = [elites + 1, all + 1], seen.add(c);
    }
  }
  expect(seen.size).toBe(4);
  expect(elites / all).toBeGreaterThan(ELITE.chance); // 2~4층은 확정 정예 전사 하나가 더 있다
  expect(elites / all).toBeLessThan(ELITE.chance + 0.12);
});

test('정예는 특성을 하나 가지며 같은 시드면 같은 특성, 여러 판에서 모든 특성이 나온다', () => {
  const kinds = new Set<EliteKind>();
  for (let seed = 1; seed <= 40; seed++) {
    const e = createWorld(seed, ['HWm']).entities;
    expect(ELITE_KIND_LIST).toContain(e[1].eliteKind);
    expect(e[2].eliteKind).toBeUndefined();
    expect(createWorld(seed, ['HWm']).entities[1].eliteKind).toBe(e[1].eliteKind);
    kinds.add(e[1].eliteKind!);
  }
  expect(kinds.size).toBe(ELITE_KIND_LIST.length);
});

test('신속한: 이동·공격이 빠르다', () => {
  const w = elite('swift');
  expect(moveSpeed(w, w.entities[1])).toBeCloseTo(STATS.warrior.speed * ELITE_FX.swiftMove);
  expect(attackInterval(w, w.entities[1])).toBeCloseTo(STATS.warrior.interval / ELITE_FX.swiftAttack);
});

test('흡혈의: 주인공에게 준 피해의 배수만큼 회복한다(최대 체력까지)', () => {
  const w = elite('vampiric');
  const [hero, e] = w.entities;
  hero.hp = hero.maxHp = 1000;
  e.hp = 100;
  const dealt = hurt(w, hero, 10, e);
  expect(e.hp).toBe(100 + dealt * ELITE_FX.leech);
  hurt(w, hero, 500, e);
  expect(e.hp).toBe(e.maxHp);
});

test('폭발하는: 죽은 자리가 예고 뒤에 터져, 그 안에 있으면 다친다', () => {
  const w = elite('volatile');
  const [hero, e] = w.entities;
  hero.hp = hero.maxHp = 1000;
  hurt(w, e, 1e6, hero);
  expect(w.zones).toHaveLength(1);
  for (let t = 0; t < ELITE_FX.blastDelay * 60 + 2; t++) step(w, []);
  expect(w.zones).toHaveLength(0);
  expect(hero.hp).toBeLessThan(1000);
});

test('통솔하는: 가까운 다른 몬스터의 데미지가 오르고, 자신과 멀리 있는 몬스터는 그대로다', () => {
  const avg = (w: World, id: number) => Array.from({ length: 400 }, () => roll(w, w.entities[id])).reduce((a, b) => a + b) / 400;
  const near = elite('warlord', ['HWm']);
  const plain = createWorld(1, ['Hwm']);
  expect(avg(near, 2) / avg(plain, 2)).toBeCloseTo(ELITE_FX.auraDmg, 1);
  expect(avg(near, 1) / avg(plain, 1)).toBeCloseTo(ELITE.dmg, 1);
  const far = elite('warlord', ['HW' + '.'.repeat(8) + 'm']);
  expect(avg(far, 2) / avg(plain, 2)).toBeCloseTo(1, 1);
  near.entities[1].state = 'dead';
  expect(avg(near, 2) / avg(plain, 2)).toBeCloseTo(1, 1);
});

test('분열하는: 죽으면 주인공을 노리는 졸개들이 나온다', () => {
  const w = elite('splitting');
  hurt(w, w.entities[1], 1e6, w.entities[0]);
  const born = w.entities.slice(2);
  expect(born.map((m) => [m.kind, m.elite, m.target])).toEqual(Array(ELITE_FX.split).fill(['minion', false, 0]));
  expect(born.map((m) => m.id)).toEqual([2, 3]);
});
