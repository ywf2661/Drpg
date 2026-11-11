import { expect, test } from 'vitest';
import { impactFeel } from './feel';

test('많이 맞힐수록 멈춤·흔들림이 커지되 상한이 있다', () => {
  expect(impactFeel(0)).toEqual({ stop: 0, shake: 0 });
  expect(impactFeel(1).stop).toBeCloseTo(0.085, 5);
  expect(impactFeel(3).stop).toBeGreaterThan(impactFeel(1).stop);
  expect(impactFeel(3).shake).toBeGreaterThan(impactFeel(1).shake);
  expect(impactFeel(50)).toEqual({ stop: 0.14, shake: 0.45 });
});
