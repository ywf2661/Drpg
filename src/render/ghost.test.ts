// 잔상 그리기 판단(투명도·남은 시간 고리)
import { expect, test } from 'vitest';
import type { Ghost } from '../sim/world';
import { arcIndices, ghostArc, ghostOpacity } from './ghost';

const ghost = (o: Partial<Ghost> = {}): Ghost => ({ id: 1, x: 0, z: 0, facing: 0, kind: 'leave', t: 4, full: 6, aura: 0, auraAcc: 0, flash: 0, wait: 0, queue: [], ...o });

test('잔상은 반투명, 따라 쓰는 순간 더 밝다', () => {
  const a = ghostOpacity(ghost(), 0);
  expect(a).toBeGreaterThan(0.3);
  expect(a).toBeLessThan(0.7);
  expect(ghostOpacity(ghost({ flash: 0.25 }), 0)).toBeGreaterThan(a + 0.2);
});
test('지나온 길 잔상은 서기 전엔 보이지 않는다', () => {
  expect(ghostOpacity(ghost({ kind: 'retrace', queue: [{ id: 'fireball', x: 0, z: 0, age: 0 }] }), 0)).toBe(0);
});
test('마지막 1초는 깜빡인다', () => {
  const ts = Array.from({ length: 40 }, (_, i) => i * 0.013);
  const late = ts.map((t) => ghostOpacity(ghost({ t: 0.5 }), t));
  expect(Math.max(...late) - Math.min(...late)).toBeGreaterThan(0.2);
});
test('남은 시간 고리: 남은 몫만큼, 조각 단위로', () => {
  expect(ghostArc(ghost({ t: 3, full: 6 }))).toBe(0.5);
  expect(ghostArc(ghost({ t: -1 }))).toBe(0);
  expect(arcIndices(1)).toBe(6 * 32);
  expect(arcIndices(0.5)).toBe(6 * 16);
  expect(arcIndices(0)).toBe(0);
});
