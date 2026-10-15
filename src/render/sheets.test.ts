import { expect, test } from 'vitest';
import hero from '../assets/sprites/hero.json';
import minion from '../assets/sprites/minion.json';
import warrior from '../assets/sprites/warrior.json';

const ANIMS = ['stance', 'move', 'attack', 'hit', 'die'] as const;

test.each([
  ['hero', hero],
  ['minion', minion],
  ['warrior', warrior],
])('%s 시트: 모든 동작 × 8방향이 시트 범위 안에 있다', (_, info) => {
  expect(info.ppm).toBe(30);
  expect(info.rows).toBe(ANIMS.length * 8);
  expect(info.cell.every((v) => v > 0)).toBe(true);
  ANIMS.forEach((name, k) => {
    const a = info.anims[name];
    expect(a.row).toBe(k * 8);
    expect(a.frames).toBeGreaterThan(0);
    expect(a.frames).toBeLessThanOrEqual(info.cols);
    expect(a.ms).toBeGreaterThan(0);
    expect(['back_forth', 'looped', 'play_once']).toContain(a.loop);
  });
  expect(info.cols * info.cell[0]).toBeLessThanOrEqual(4096);
  expect(info.rows * info.cell[1]).toBeLessThanOrEqual(4096);
});
