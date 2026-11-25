import { expect, test } from 'vitest';
import { createWorld, hurt, rollUnique, uniqueOf, type World } from './world';
import { act2Land, UNIQUES, type HeroClass } from './rules';

const uOf = (it: { affixes?: Parameters<typeof uniqueOf>[0]['affixes'] }) => uniqueOf({ affixes: it.affixes ?? [] });
const legendsOf = (w: World) => [...w.items, ...w.bag].map((it) => uniqueOf({ affixes: it.affixes ?? [] })).filter(Boolean);

test('2막 땅 판정', () => {
  expect(['field', 'snow', 'dungeon', 'ruins', 'sanctum', 'camp', 'tent'].map((l) => act2Land(l as never))).toEqual(Array(7).fill(false));
  expect([act2Land('lake'), act2Land('raid')]).toEqual([true, true]);
});

test('1막 땅은 1막 전설만, 2막 땅은 2막 전설만(2막 세트가 없어도)', () => {
  for (let s = 1; s <= 200; s++) {
    const a = createWorld(s, ['H']);
    a.land = 'ruins';
    expect(UNIQUES[uOf(rollUnique(a, 0, 0, 4))!].act2).toBeUndefined();
    const b = createWorld(s, ['H']);
    b.land = 'lake';
    b.cls = 'ranger';
    const u = uOf(rollUnique(b, 0, 0, 4))!;
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

import { cleave } from './abilities';
import { step, makeUnique } from './world';
import { roll } from './core';

const wearing = (w: World, u: Parameters<typeof makeUnique>[1]) => {
  const it = makeUnique(w, u, 0, 0, 4);
  w.gear[it.kind as 'weapon'] = it.tier;
  w.mods[it.kind as 'weapon'] = it.affixes!;
};
const run = (w: World, sec: number) => {
  for (let i = Math.round(sec * 60); i > 0; i--) step(w, []);
};

test('화약 망치: 가르기 → 통이 앞으로 굴러가 터지고 몬스터만 다친다', () => {
  const w = createWorld(3, ['H', '.', '.', '.', 'm', '.', '.']);
  w.cls = 'knight';
  wearing(w, 'powderHammer');
  const [hero] = w.entities;
  const m = w.entities.find((e) => e.kind === 'minion')!;
  Object.assign(m, { hp: 99999, maxHp: 99999 });
  m.asleep = true;
  hero.facing = 0;
  cleave(w, hero);
  expect(w.kegs.length).toBe(1);
  expect(w.kegs[0].lit).toBe(true);
  const hp = hero.hp;
  run(w, 2);
  expect(w.kegs[0].done).toBe(true);
  expect(m.hp).toBeLessThan(99999);
  expect(hero.hp).toBe(hp);
});

test('수집가의 왕관: 서로 다른 전설 하나마다 +4%(왕관 자신 포함), 같은 것은 한 번, 최대 60%', () => {
  const ratio = (set: (w: World) => void) => {
    const a = createWorld(5, ['H']), b = createWorld(5, ['H']);
    b.mods.helm = [{ kind: 'unique', value: 0, u: 'collectorCrown' }];
    set(b);
    return roll(b, b.entities[0]) / roll(a, a.entities[0]);
  };
  expect(ratio(() => {})).toBeCloseTo(1.04, 1);
  const duel = { kind: 'helm' as const, tier: 1, x: 0, y: 0, affixes: [{ kind: 'unique' as const, value: 0, u: 'duelist' as const }] };
  expect(ratio((w) => (w.bag = [duel, { ...duel, x: 2 }]))).toBeCloseTo(1.08, 1);
  expect(ratio((w) => (w.stashLegends = ['boomerang', 'splitOrb', 'hawkHood', 'boneShroud', 'duelist', 'emberStep', 'berserker', 'crownless', 'caliburx', 'elemStaff', 'graveSkull', 'stormBow', 'galeBow', 'twinBows', 'lootSack', 'runnerBoots', 'boneFlute', 'plagueStaff']))).toBeCloseTo(1.6, 1);
});

test('전리품 자루: 잡을수록 피해가 줄고, 맞으면 흘리고, 주우면 되찾는다', () => {
  const w = createWorld(7, ['H.m']);
  w.mods.armor = [{ kind: 'unique', value: 0, u: 'lootSack' }];
  const [hero] = w.entities;
  const m = w.entities.find((e) => e.kind === 'minion')!;
  hurt(w, m, 99999, hero);
  expect(w.sack).toBe(1);
  w.sack = 20;
  Object.assign(hero, { hp: 9999, maxHp: 9999 });
  const got = hurt(w, hero, 1000);
  expect(got).toBe(800);
  expect(w.sack).toBe(13);
  const pile = w.items.find((it) => it.sack)!;
  expect(pile.sack).toBe(7);
  const gold = w.gold;
  Object.assign(hero, { x: pile.x, z: pile.z });
  step(w, []);
  expect(w.sack).toBe(20);
  expect(w.gold).toBe(gold);
});

test('사냥꾼의 쌍궁: 걷는 동안만 저절로 쏜다', () => {
  const w = createWorld(9, ['........', 'H.......', '........', '....m...']);
  w.cls = 'ranger';
  w.mods.weapon = [{ kind: 'unique', value: 0, u: 'twinBows' }];
  const m = w.entities.find((e) => e.kind === 'minion')!;
  Object.assign(m, { hp: 99999, maxHp: 99999, asleep: true });
  step(w, [{ type: 'move', x: 7.5, z: 1.5 }]);
  run(w, 1);
  const n = w.shots.filter((s) => s.kind === 'shaft').length + (99999 - m.hp > 0 ? 1 : 0);
  expect(n).toBeGreaterThan(0);
  run(w, 2); // 다 걸었다
  const before = m.hp;
  w.shots = [];
  run(w, 1);
  expect(w.shots.length).toBe(0);
  expect(m.hp).toBe(before);
});
