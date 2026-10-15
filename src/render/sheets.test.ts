import { expect, test } from 'vitest';
import hero from '../assets/sprites/hero.json';
import minion from '../assets/sprites/minion.json';
import warrior from '../assets/sprites/warrior.json';
import props from '../assets/sprites/props.json';
import stairs from '../assets/sprites/stairs.json';
import loot from '../assets/sprites/loot.json';

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

test.each([
  ['props', props],
  ['stairs', stairs],
  ['loot', loot],
])('%s 시트: 동작마다 1줄, 프레임이 범위 안', (_, info) => {
  const names = Object.keys(info.anims);
  expect(info.ppm).toBe(30);
  expect(info.rows).toBe(names.length);
  names.forEach((n, k) => {
    const a = (info.anims as Record<string, { row: number; frames: number }>)[n];
    expect(a.row).toBe(k);
    expect(a.frames).toBeLessThanOrEqual(info.cols);
  });
});

test('props 시트: 화로 8프레임 반복, 큰 소품 8종, 잔해 8종', () => {
  expect(props.anims.brazier).toMatchObject({ frames: 8, loop: 'looped' });
  expect(Object.keys(props.anims).filter((n) => n.startsWith('bones'))).toHaveLength(8);
  expect(Object.keys(props.anims)).toHaveLength(17);
});

test('loot 시트: 물약이 떨어지는 6프레임(1회 재생)', () => {
  expect(loot.anims.potion).toMatchObject({ frames: 6, loop: 'play_once' });
});

test('주인공 시트: 무기 4 × 갑옷 4 = 16조합이 모두 있다(칸 정보는 hero.json 공유)', () => {
  const files = Object.keys(import.meta.glob('../assets/sprites/hero_*.png')).map((p) => p.split('/').pop());
  const want = ['dagger', 'shortsword', 'longsword', 'greatsword'].flatMap((w) =>
    ['cloth', 'leather', 'chain', 'plate'].map((a) => `hero_${w}_${a}.png`),
  );
  expect(files.sort()).toEqual(want.sort());
});

test('loot 시트: 물약과 장비 바닥 그림', () => {
  expect(Object.keys(loot.anims)).toEqual(['potion', 'dagger', 'shortsword', 'longsword', 'greatsword', 'clothes', 'leather_armor', 'steel_armor']);
});
