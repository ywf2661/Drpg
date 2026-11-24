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
import ember from '../assets/sprites/ember.json';
import fallenPaladin from '../assets/sprites/fallen_paladin.json';
import fallenPaladinHeads from '../assets/sprites/fallen_paladin_heads.json';
import timeWarden from '../assets/sprites/time_warden.json';
import ferryman from '../assets/sprites/plague_ferryman.json';
import chief from '../assets/sprites/raider_chief.json';

const ANIMS = ['stance', 'move', 'attack', 'hit', 'die'] as const;

test.each([
  ['hero', hero],
  ['minion', minion],
  ['warrior', warrior],
  ['archer', archer],
  ['mage', mage],
  ['boss', boss],
  ['fallen_paladin', fallenPaladin],
  ['time_warden', timeWarden],
  ['plague_ferryman', ferryman],
  ['raider_chief', chief],
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

test('주인공 시트: 레이어 6종 × 4단계가 모두 있다(칸 정보는 hero.json 공유)', () => {
  const files = Object.keys(import.meta.glob('../assets/sprites/hero_*.png')).map((p) => p.split('/').pop());
  const want = ['main', 'head', 'feet', 'lower', 'chest', 'off'].flatMap((l) => [1, 2, 3, 4].map((t) => `hero_${l}_${t}.png`));
  expect(files.sort()).toEqual([...want, 'hero_main_caliburx.png'].sort());
});

test('전설 무기 레이어 시트(tools/sprites.py LEGEND_LAYERS): 칼리버X·엘리멘탈 다섯 색·해골 구슬·천둥새', () => {
  const files = Object.keys(import.meta.glob('../assets/sprites/*.png')).map((p) => p.split('/').pop());
  const want = ['hero_main_caliburx', ...['base', 'fire', 'frost', 'bolt', 'void'].map((e) => `wizard_main_elem${e}`), 'necromancer_off_skull', 'ranger_main_storm'];
  for (const n of want) expect(files).toContain(`${n}.png`);
});

test('loot 시트: 물약과 장비(기사·마법사·궁수) 바닥 그림', () => {
  expect(Object.keys(loot.anims)).toEqual(['potion', 'dagger', 'shortsword', 'longsword', 'greatsword', 'clothes', 'leather_armor', 'steel_armor', 'coins5', 'coins25', 'coins100', 'wand', 'rod', 'staff', 'greatstaff', 'slingshot', 'shortbow', 'longbow', 'greatbow']); // 마법사 지팡이 넷, 궁수 활 넷
});

test('사망 동작은 모두 1회 재생(마지막 프레임 = 시체)', () => {
  for (const info of [hero, minion, warrior, archer, mage, boss, fallenPaladin, timeWarden]) expect(info.anims.die.loop).toBe('play_once');
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

test('마력탄은 화살처럼 가슴 높이로 난다(칸 꼭대기 = 그림의 가장 높은 곳, 머리 위로 뜨지 않는다)', () => {
  expect(ember.anchor[1] / ember.ppm).toBeLessThan(1.5);
});

test('모든 시트의 기준점(발)은 칸 안에 있다(판자 바닥선)', () => {
  for (const info of [hero, minion, warrior, archer, mage, boss, fallenPaladin, timeWarden, props, stairs, loot, arrow, cleave, fireball, blast, axe, quake]) {
    expect(info.anchor[1]).toBeLessThanOrEqual(info.cell[1]);
    expect(info.anchor[1]).toBeGreaterThanOrEqual(0);
  }
});

test('타락한 성기사 시트: 원본 동작 수(대기는 솎음), 지어낸 피격·쓰러짐', () => {
  expect(fallenPaladin.anims.move).toMatchObject({ frames: 9, loop: 'looped' });
  expect(fallenPaladin.anims.attack).toMatchObject({ frames: 12, loop: 'play_once' });
  expect(fallenPaladin.anims.stance.frames).toBeGreaterThanOrEqual(8);
  expect(fallenPaladin.anims.hit.frames).toBe(2);
  expect(fallenPaladin.anims.die.frames).toBeGreaterThanOrEqual(5);
});

test('타락한 성기사 머리 위치표: 모든 동작 × 8방향 × 프레임마다 발 기준 (x, y)m, 머리는 발보다 1m 이상 위', () => {
  for (const [name, clip] of Object.entries(fallenPaladin.anims)) {
    const dirs = (fallenPaladinHeads as Record<string, number[][][]>)[name];
    expect(dirs).toHaveLength(8);
    for (const frames of dirs) {
      expect(frames).toHaveLength(clip.frames);
      for (const [x, y] of frames) {
        expect(Math.abs(x)).toBeLessThan(2); // 누우면 머리가 발에서 키(약 1.7m)만큼 옆으로
        if (name !== 'die') expect(y).toBeGreaterThan(1);
      }
    }
  }
});

test('타락한 성기사 머리 위치표: 쓰러지면 머리가 바닥 가까이로, 맞으면 대기와 다른 자리(젖힌 만큼)', () => {
  const h = fallenPaladinHeads as Record<string, number[][][]>;
  for (let d = 0; d < 8; d++) {
    const ys = h.die[d].map(([, y]) => y);
    expect(ys.at(-1)!).toBeLessThan(0.5);
    for (let i = 1; i < ys.length; i++) expect(ys[i]).toBeLessThanOrEqual(ys[i - 1] + 1e-9);
    expect(h.hit[d][0][0]).not.toBeCloseTo(h.stance[d][0][0], 2);
  }
});
