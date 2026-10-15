import { expect, test } from 'vitest';
import hero from '../assets/sprites/hero.json';
import minion from '../assets/sprites/minion.json';
import warrior from '../assets/sprites/warrior.json';
import boss from '../assets/sprites/boss.json';
import archer from '../assets/sprites/archer.json';
import arrow from '../assets/sprites/arrow.json';
import cleave from '../assets/sprites/cleave.json';
import mage from '../assets/sprites/mage.json';
import fireball from '../assets/sprites/fireball.json';
import blast from '../assets/sprites/blast.json';
import axe from '../assets/sprites/axe.json';
import quake from '../assets/sprites/quake.json';
import props from '../assets/sprites/props.json';
import stairs from '../assets/sprites/stairs.json';
import loot from '../assets/sprites/loot.json';

const ANIMS = ['stance', 'move', 'attack', 'hit', 'die'] as const;

test.each([
  ['hero', hero],
  ['minion', minion],
  ['warrior', warrior],
  ['archer', archer],
  ['mage', mage],
  ['boss', boss],
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

test('props 시트: 화로 8프레임 반복, 큰 소품 8종, 열린 상자 2종, 잔해 8종', () => {
  expect(props.anims.brazier).toMatchObject({ frames: 8, loop: 'looped' });
  expect(Object.keys(props.anims).filter((n) => n.startsWith('bones'))).toHaveLength(8);
  expect(Object.keys(props.anims)).toHaveLength(19);
  expect(props.anims).toHaveProperty('chest_open');
  expect(props.anims).toHaveProperty('chest2_open');
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
  expect(Object.keys(loot.anims)).toEqual(['potion', 'dagger', 'shortsword', 'longsword', 'greatsword', 'clothes', 'leather_armor', 'steel_armor', 'coins5', 'coins25', 'coins100']);
});

test('사망 동작은 모두 1회 재생(마지막 프레임 = 시체)', () => {
  for (const info of [hero, minion, warrior, archer, mage, boss]) expect(info.anims.die.loop).toBe('play_once');
});

test('가르기 효과 시트: 8방향 × 6프레임 1회', () => {
  expect(cleave.rows).toBe(8);
  expect(cleave.anims.cleave).toMatchObject({ row: 0, frames: 6, loop: 'play_once' });
});

test('화염구 8방향 4프레임 반복, 폭발 1방향 6프레임 1회', () => {
  expect(fireball.rows).toBe(8);
  expect(fireball.anims.fireball).toMatchObject({ frames: 4, loop: 'looped' });
  expect(blast.rows).toBe(1);
  expect(blast.anims.blast).toMatchObject({ frames: 6, loop: 'play_once' });
});

test('도끼 8방향 8프레임 회전, 함성 울림 1방향 1회', () => {
  expect(axe.rows).toBe(8);
  expect(axe.anims.axe).toMatchObject({ frames: 8, loop: 'looped' });
  expect(quake.rows).toBe(1);
  expect(quake.anims.quake).toMatchObject({ frames: 4, loop: 'play_once' });
});

test('화살 시트: 8방향 × 3프레임 반복', () => {
  expect(arrow.rows).toBe(8);
  expect(arrow.anims.fly).toMatchObject({ row: 0, frames: 3, loop: 'looped' });
});

test('모든 시트의 기준점(발)은 칸 안에 있다(판자 바닥선)', () => {
  for (const info of [hero, minion, warrior, archer, mage, boss, props, stairs, loot, arrow, cleave, fireball, blast, axe, quake]) {
    expect(info.anchor[1]).toBeLessThanOrEqual(info.cell[1]);
    expect(info.anchor[1]).toBeGreaterThanOrEqual(0);
  }
});
