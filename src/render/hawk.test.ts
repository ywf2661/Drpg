// 매 그리기 판단(날개 각·매 타기 높이·발밑 그림자)
import { expect, test } from 'vitest';
import { HAWK } from '../sim/world';
import { blobLook, rideLift, wingAngle } from './hawk';

test('날개: 덮칠 땐 접어 두고(움직이지 않음), 닿은 직후엔 활짝 위로, 평소엔 퍼덕인다', () => {
  expect(wingAngle('dive', 0, 0)).toBe(wingAngle('dive', 1.3, 0));
  expect(wingAngle('dive', 0, 0.2)).toBeLessThan(wingAngle('dive', 0, 0));
  const flaps = Array.from({ length: 20 }, (_, i) => wingAngle('peck', i * 0.017, 0));
  expect(Math.max(...flaps) - Math.min(...flaps)).toBeGreaterThan(0.5);
});
test('매 타기: 가운데가 가장 높고 처음·끝은 낮다', () => {
  expect(rideLift(HAWK.time / 2)).toBeGreaterThan(rideLift(HAWK.time * 0.95));
  expect(rideLift(HAWK.time)).toBeCloseTo(rideLift(0));
});
test('발밑 그림자: 높을수록 작고 옅다', () => {
  const [low, high] = [blobLook(0.2), blobLook(HAWK.h)];
  expect(high.scale).toBeLessThan(low.scale);
  expect(high.opacity).toBeLessThan(low.opacity);
});
