import { expect, test } from 'vitest';
import { itemLabel } from './labels';

test('바닥 장비 이름표: 이름과 지금보다 좋은지(물약은 이름표 없음)', () => {
  const gear = { weapon: 2, armor: 3 };
  expect(itemLabel({ id: 1, x: 0, z: 0, kind: 'weapon', tier: 4 }, gear)).toEqual({ text: '그레이트소드', better: true });
  expect(itemLabel({ id: 2, x: 0, z: 0, kind: 'weapon', tier: 2 }, gear)).toEqual({ text: '숏소드', better: false });
  expect(itemLabel({ id: 3, x: 0, z: 0, kind: 'armor', tier: 1 }, gear)).toEqual({ text: '천옷', better: false });
  expect(itemLabel({ id: 4, x: 0, z: 0, kind: 'potion', tier: 0 }, gear)).toBeNull();
  expect(itemLabel({ id: 5, x: 0, z: 0, kind: 'gold', tier: 0, amount: 23 }, gear)).toEqual({ text: '금화 23', better: false });
});
