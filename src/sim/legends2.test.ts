import { expect, test } from 'vitest';
import { createWorld, hurt, rollUnique, uniqueOf, type World } from './world';
import { act2Land, UNIQUES, type HeroClass } from './rules';

const legendsOf = (w: World) => [...w.items, ...w.bag].map((it) => uniqueOf(it)).filter(Boolean);

test('2막 땅 판정', () => {
  expect(['field', 'snow', 'dungeon', 'ruins', 'sanctum', 'camp', 'tent'].map((l) => act2Land(l as never))).toEqual(Array(7).fill(false));
  expect([act2Land('lake'), act2Land('raid')]).toEqual([true, true]);
});

test('1막 땅은 1막 전설만, 2막 땅은 2막 전설만(2막 세트가 없어도)', () => {
  for (let s = 1; s <= 200; s++) {
    const a = createWorld(s, ['H']);
    a.land = 'ruins';
    expect(UNIQUES[uniqueOf(rollUnique(a, 0, 0, 4))!].act2).toBeUndefined();
    const b = createWorld(s, ['H']);
    b.land = 'lake';
    b.cls = 'ranger';
    const u = uniqueOf(rollUnique(b, 0, 0, 4))!;
    expect(UNIQUES[u].act2).toBe(true);
    expect(u).not.toBe('powderHammer');
    expect([undefined, 'ranger']).toContain(UNIQUES[u].cls);
  }
});

const chiefKill = (seed: number, cls: HeroClass) => {
  const w = createWorld(seed, ['H.M']);
  w.land = 'raid';
  w.cls = cls;
  const b = w.entities.find((e) => e.kind === 'boss')!;
  Object.assign(b, { skin: 'raider_chief', stunT: 1, hp: 1 });
  hurt(w, b, 999, w.entities[0]);
  return legendsOf(w);
};

test('약탈자 우두머리는 기사에게만 화약 망치를 따로 굴린다', () => {
  const knight = Array.from({ length: 40 }, (_, s) => chiefKill(s + 1, 'knight'));
  expect(knight.some((l) => l.includes('powderHammer'))).toBe(true);
  const ranger = Array.from({ length: 40 }, (_, s) => chiefKill(s + 1, 'ranger'));
  expect(ranger.some((l) => l.includes('powderHammer'))).toBe(false);
});
