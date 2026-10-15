import { expect, test } from 'vitest';
import { buy, offers } from './shop';

const base = { potions: 3, gear: { weapon: 2, armor: 3 }, level: 4, xp: 10, gold: 300 };

test('상점 가격: 물약 25, 무기 120 × 단계, 갑옷 100 × 단계', () => {
  expect(offers(base)).toEqual([
    { item: 'potion', price: 25, ok: true },
    { item: 'weapon', price: 240, ok: true },
    { item: 'armor', price: 300, ok: true },
  ]);
});

test('살 수 없는 경우: 금화 부족, 허리띠 가득, 최고 단계', () => {
  const poor = { ...base, gold: 20 };
  expect(offers(poor).map((o) => o.ok)).toEqual([false, false, false]);
  const maxed = { ...base, potions: 8, gear: { weapon: 4, armor: 4 } };
  expect(offers(maxed).map((o) => o.ok)).toEqual([false, false, false]);
});

test('구매: 금화를 빼고 물약·장비를 올린다, 못 사면 그대로(원본은 바꾸지 않음)', () => {
  expect(buy(base, 'potion')).toEqual({ ...base, potions: 4, gold: 275 });
  expect(buy(base, 'weapon')).toEqual({ ...base, gear: { weapon: 3, armor: 3 }, gold: 60 });
  expect(buy(base, 'armor')).toEqual({ ...base, gear: { weapon: 2, armor: 4 }, gold: 0 });
  const poor = { ...base, gold: 10 };
  expect(buy(poor, 'potion')).toBe(poor);
  expect(base.gold).toBe(300);
});
