import { expect, test } from 'vitest';
import { decodeSave, encodeSave, formatTime } from './save';

const run = { floor: 3, potions: 4, gear: { weapon: 3, armor: 2 }, level: 6, xp: 12, gold: 133, cycle: 1, stats: { time: 754.2, kills: 41, deaths: 2 } };

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
  expect(bad({ gold: -5 })).toBeNull();
  expect(bad({ gold: 1.5 })).toBeNull();
  expect(bad({ cycle: -1 })).toBeNull();
});

test('기록(stats)이 없는 이전 저장은 0으로 채운다, 이상한 기록은 무시', () => {
  const old = JSON.stringify({ v: 1, floor: 2, potions: 1, gear: { weapon: 2, armor: 2 }, level: 3, xp: 5 });
  expect(decodeSave(old)?.stats).toEqual({ time: 0, kills: 0, deaths: 0 });
  expect(decodeSave(old)?.gold).toBe(0); // 금화가 생기기 전 저장
  expect(decodeSave(old)?.cycle).toBe(0); // 회차가 생기기 전 저장
  const weird = JSON.stringify({ v: 1, floor: 2, potions: 1, gear: { weapon: 2, armor: 2 }, level: 3, xp: 5, stats: { time: -1, kills: 'x' } });
  expect(decodeSave(weird)).toBeNull();
});

test('플레이 시간 표시', () => {
  expect(formatTime(0)).toBe('0:00');
  expect(formatTime(65.9)).toBe('1:05');
  expect(formatTime(3725)).toBe('1:02:05');
});
