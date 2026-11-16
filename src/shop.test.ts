import { expect, test } from 'vitest';
import { buy, offers, sell, sellPrice } from './shop';

const base = { potions: 3, gear: { weapon: 2, armor: 3, helm: 1, boots: 2 }, level: 4, xp: 10, gold: 300, bag: [] };

test('상점은 물약만 판다(장비 강화 없음): 25, 허리띠 가득·금화 부족이면 못 산다', () => {
  expect(offers(base)).toEqual([{ item: 'potion', price: 25, ok: true }]);
  expect(offers({ ...base, gold: 20 })[0].ok).toBe(false);
  expect(offers({ ...base, potions: 8 })[0].ok).toBe(false);
});

test('구매: 금화를 빼고 물약을 올린다, 못 사면 그대로(원본은 바꾸지 않음)', () => {
  expect(buy(base, 'potion')).toEqual({ ...base, potions: 4, gold: 275 });
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
