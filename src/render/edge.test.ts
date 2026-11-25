// 벼림 화면의 순수 판단(색·깜빡임·칸 충전 수)
import { expect, test } from 'vitest';
import { edgeBlink, edgeColor, edgeLeft, mixColor, ready, splitLost } from './edge';
import { looksOf } from './sprites';
import type { World } from '../sim/world';

const keys = (dash: World['keys']['dash']): World['keys'] => ({ cleave: 'cleave', dash, shout: null, throw: null });
test('강화 색: 불 주황·서리 하늘·해방 흰색, 빈 칼은 null', () => {
  expect(edgeColor({ edge: { kind: 'flame', left: 3, t: 0 } })).toBe('#ffb070');
  expect(edgeColor({ edge: { kind: 'frost', left: 3, t: 0 } })).toBe('#a8e0ff');
  expect(edgeColor({ edge: { kind: 'both', left: 0, t: 2 } })).toBe('#ffffff');
  expect(edgeColor({ edge: { kind: null, left: 0, t: 0 } })).toBeNull();
});
test('깜빡임: 충전 1일 때만, 해방은 깜빡이지 않는다', () => {
  const one = { edge: { kind: 'flame' as const, left: 1, t: 0 } };
  expect([0, 1 / 12, 2 / 12].map((t) => edgeBlink(one, t + 0.01))).toEqual([false, true, false]);
  expect(edgeBlink({ edge: { kind: 'flame', left: 2, t: 0 } }, 1 / 12 + 0.01)).toBe(false);
  expect(edgeBlink({ edge: { kind: 'both', left: 0, t: 1 } }, 1 / 12 + 0.01)).toBe(false);
});
test('칸 충전 수: 끼운 벼림과 칼이 같을 때만', () => {
  const edge = { kind: 'flame' as const, left: 4, t: 0 };
  expect(edgeLeft({ edge, keys: keys('flameEdge') }, 'dash')).toBe(4);
  expect(edgeLeft({ edge, keys: keys('frostEdge') }, 'dash')).toBeNull();
  expect(edgeLeft({ edge, keys: keys(null) }, 'dash')).toBeNull();
});
test('looksOf: 강화 중이면 무기 색이 강화 색, 빈 칼은 그대로', () => {
  const mods = { weapon: [], armor: [], helm: [], boots: [] };
  expect(looksOf({ mods, edge: { kind: 'flame', left: 2, t: 0 } }).weapon).toBe('#ffb070');
  expect(looksOf({ mods, edge: { kind: null, left: 0, t: 0 } }).weapon).toBeUndefined();
  expect(looksOf({ mods }).weapon).toBeUndefined();
});
test('횃불 색 섞기 30%', () => {
  expect(mixColor(0x000000, 0xffffff, 0.3)).toBe(0x4d4d4d);
  expect(mixColor(0xff9a4d, 0xff9a4d, 0.3)).toBe(0xff9a4d);
});
test('숫자 나누기: 추가 피해는 따로, 합은 잃은 체력', () => {
  expect(splitLost(30, 8)).toEqual([22, 8]);
  expect(splitLost(5, 8)).toEqual([0, 5]); // 죽는 타격: 넘치지 않는다
  expect(splitLost(30, 0)).toEqual([30, 0]);
});
test('간격 제한: 처음엔 되고, gap 안엔 안 되고, gap이 지나면 된다', () => {
  expect(ready(undefined, 5, 0.3)).toBe(true);
  expect(ready(5, 5.2, 0.3)).toBe(false); // 0.25초마다 다시 터지지 않는다
  expect(ready(5, 5.3, 0.3)).toBe(true);
});
