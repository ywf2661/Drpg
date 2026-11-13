import { expect, test } from 'vitest';
import { buy, offers, sell, sellPrice } from './shop';

const base = { potions: 3, gear: { weapon: 2, armor: 3, helm: 1, boots: 2 }, level: 4, xp: 10, gold: 300, bag: [] };

test('상점 가격: 물약 25, 무기 120 × 단계, 갑옷 100 × 단계, 투구·신발 80 × 단계', () => {
  expect(offers(base)).toEqual([
    { item: 'potion', price: 25, ok: true },
    { item: 'weapon', price: 240, ok: true },
    { item: 'armor', price: 300, ok: true },
    { item: 'helm', price: 80, ok: true },
    { item: 'boots', price: 160, ok: true },
  ]);
});

test('살 수 없는 경우: 금화 부족, 허리띠 가득, 최고 단계', () => {
  const poor = { ...base, gold: 20 };
  expect(offers(poor).map((o) => o.ok)).toEqual([false, false, false, false, false]);
  const maxed = { ...base, potions: 8, gear: { weapon: 4, armor: 4, helm: 4, boots: 4 } };
  expect(offers(maxed).map((o) => o.ok)).toEqual([false, false, false, false, false]);
});

test('구매: 금화를 빼고 물약·장비를 올린다, 못 사면 그대로(원본은 바꾸지 않음)', () => {
  expect(buy(base, 'potion')).toEqual({ ...base, potions: 4, gold: 275 });
  expect(buy(base, 'weapon')).toEqual({ ...base, gear: { ...base.gear, weapon: 3 }, gold: 60 });
  expect(buy(base, 'armor')).toEqual({ ...base, gear: { ...base.gear, armor: 4 }, gold: 0 });
  expect(buy(base, 'helm')).toEqual({ ...base, gear: { ...base.gear, helm: 2 }, gold: 220 });
  const poor = { ...base, gold: 10 };
  expect(buy(poor, 'potion')).toBe(poor);
  expect(base.gold).toBe(300);
});

test('판매 가격: 10 × 단계 + 15 × 옵션 수', () => {
  expect(sellPrice({ kind: 'weapon', tier: 1, affixes: [] })).toBe(10);
  expect(sellPrice({ kind: 'armor', tier: 4, affixes: [{ kind: 'life', value: 20 }, { kind: 'guard', value: 5 }] })).toBe(70);
});

test('팔기: 그 칸을 빼고 금화를 더한다, 잘못된 칸이면 그대로(원본은 바꾸지 않음)', () => {
  const a = { kind: 'weapon' as const, tier: 2, affixes: [], x: 0, y: 0 };
  const b = { kind: 'armor' as const, tier: 1, affixes: [], x: 1, y: 0 };
  const c = { ...base, gold: 10, bag: [a, b] };
  expect(sell(c, 0)).toEqual({ ...c, gold: 30, bag: [b] });
  expect(sell(c, 1)).toEqual({ ...c, gold: 20, bag: [a] });
  for (const i of [-1, 2, 0.5, Number.NaN]) expect(sell(c, i)).toBe(c);
  expect(c.bag).toHaveLength(2);
});
