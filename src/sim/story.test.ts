import { expect, test } from 'vitest';
import { afterClear, depthOf, openLands, STORY } from './rules';

test('이야기 순서: 초원 → 설원 → 미궁 → 폐허, 열린 지역은 지금 단계까지', () => {
  expect(STORY.map((s) => s.land)).toEqual(['field', 'snow', 'dungeon', 'ruins']);
  expect(openLands(0)).toEqual(['field']);
  expect(openLands(2)).toEqual(['field', 'snow', 'dungeon']);
});

test('afterClear: 지금 단계 보스면 다음 단계, 지난 지역이면 그대로, 마지막이면 회차 + 1·처음 단계', () => {
  expect(afterClear(0, 0, 'field')).toEqual({ stage: 1, cycle: 0, advanced: true, newCycle: false });
  expect(afterClear(2, 0, 'field')).toEqual({ stage: 2, cycle: 0, advanced: false, newCycle: false });
  expect(afterClear(2, 1, 'dungeon')).toEqual({ stage: 3, cycle: 1, advanced: true, newCycle: false });
  expect(afterClear(3, 1, 'ruins')).toEqual({ stage: 0, cycle: 2, advanced: true, newCycle: true });
});

test('이야기 깊이 = 5k + n: 설원 1구역은 초원 5구역 다음, 야영지는 0', () => {
  expect(depthOf('field', 1)).toBe(1);
  expect(depthOf('snow', 1)).toBe(6);
  expect(depthOf('dungeon', 3)).toBe(13);
  expect(depthOf('ruins', 5)).toBe(20);
  expect(depthOf('camp', 0)).toBe(0);
});
