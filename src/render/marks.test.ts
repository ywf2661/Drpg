import { expect, test } from 'vitest';
import type { Entity } from '../sim/rules';
import { growUntil, pips } from './marks';

test('검흔 아이콘: 개수, 한계 직전 깜빡임, 1초 미만 흐림, 죽거나 0이면 없음', () => {
  const e = { marks: 2, markT: 3, state: 'idle' } as Entity;
  expect(pips(e, 3)).toEqual({ n: 2, blink: true, dim: false });
  expect(pips({ ...e, marks: 1 }, 3)).toEqual({ n: 1, blink: false, dim: false });
  expect(pips({ ...e, markT: 0.5 }, 4)?.dim).toBe(true);
  expect(pips({ ...e, state: 'dead' }, 3)).toBeNull();
  expect(pips({ ...e, marks: 0 }, 3)).toBeNull();
});

test('튀는 효과: 늘면 0.12초 뒤까지, 그대로면 유지, 줄어도 끝나기 전엔 유지', () => {
  expect(growUntil(1, 2, 10, 0)).toBeCloseTo(10.12);
  expect(growUntil(2, 2, 10.05, 10.12)).toBe(10.12);
  expect(growUntil(2, 1, 10.05, 10.12)).toBe(10.12);
});
