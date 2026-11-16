import { expect, test } from 'vitest';
import { SIGHT, sightFade } from './sight';

test('시야: 반경 2m 앞까지는 다 보이고, 반경에서 사라진다', () => {
  expect(SIGHT).toBe(14);
  expect([0, 12, 13, 14, 20].map((d) => sightFade(d))).toEqual([1, 1, 0.5, 0, 0]);
  expect(sightFade(7, 8)).toBe(0.5); // 눈보라(시야 8m)
});
