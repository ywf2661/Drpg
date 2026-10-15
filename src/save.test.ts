import { expect, test } from 'vitest';
import { decodeSave, encodeSave } from './save';

const run = { floor: 3, potions: 4, gear: { weapon: 3, armor: 2 }, level: 6, xp: 12 };

test('저장한 진행을 그대로 되읽는다', () => {
  expect(decodeSave(encodeSave(run))).toEqual(run);
});

test('손상되거나 범위를 벗어난 저장은 무시한다(null)', () => {
  expect(decodeSave(null)).toBeNull();
  expect(decodeSave('')).toBeNull();
  expect(decodeSave('{not json')).toBeNull();
  expect(decodeSave('[]')).toBeNull();
  const bad = (patch: object) => decodeSave(JSON.stringify({ v: 1, ...run, ...patch }));
  expect(bad({})).toEqual(run);
  expect(bad({ v: 99 })).toBeNull(); // 다른 형식 버전
  expect(bad({ floor: 0 })).toBeNull();
  expect(bad({ floor: 6 })).toBeNull();
  expect(bad({ floor: 2.5 })).toBeNull();
  expect(bad({ potions: -1 })).toBeNull();
  expect(bad({ potions: 9 })).toBeNull();
  expect(bad({ gear: { weapon: 5, armor: 1 } })).toBeNull();
  expect(bad({ gear: null })).toBeNull();
  expect(bad({ level: 0 })).toBeNull();
  expect(bad({ xp: -3 })).toBeNull();
  expect(bad({ level: '7' })).toBeNull();
});
