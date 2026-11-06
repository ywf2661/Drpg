import { expect, test } from 'vitest';
import { BAG_MAX, bagBlocked, createWorld, discardFromBag, equipFromBag, gearDiff, isBetter, setLevel, step, type Affix, type BagItem, type World } from './world';

const make = () => createWorld(1, ['H....']); // 기본 장비: 롱소드(3)·천옷(1)
const drop = (w: World, kind: 'weapon' | 'armor', tier: number, affixes: Affix[] = []) =>
  w.items.push({ id: w.nextItem++, x: w.entities[0].x, z: w.entities[0].z, kind, tier, affixes });
const junk = (n: number): BagItem[] => Array.from({ length: n }, () => ({ kind: 'weapon', tier: 1, affixes: [] }));

test('지금보다 나쁜 장비는 보관함으로 들어가고 장착은 그대로', () => {
  const w = make();
  drop(w, 'weapon', 1);
  step(w, []);
  expect(w.items).toEqual([]);
  expect(w.bag).toEqual([{ kind: 'weapon', tier: 1, affixes: [] }]);
  expect(w.gear.weapon).toBe(3);
});

test('자동 장착: 더 좋은 장비는 입고, 벗은 장비(옵션 포함)는 보관함으로', () => {
  const w = make();
  w.mods.weapon = [{ kind: 'crit', value: 10 }];
  drop(w, 'weapon', 4, [{ kind: 'dmg', value: 20 }]);
  step(w, []);
  expect(w.gear.weapon).toBe(4);
  expect(w.mods.weapon).toEqual([{ kind: 'dmg', value: 20 }]);
  expect(w.bag).toEqual([{ kind: 'weapon', tier: 3, affixes: [{ kind: 'crit', value: 10 }] }]);
});

test('자동 장착을 끄면 더 좋은 장비도 보관함으로만', () => {
  const w = make();
  w.autoEquip = false;
  drop(w, 'weapon', 4);
  step(w, []);
  expect(w.gear.weapon).toBe(3);
  expect(w.bag).toEqual([{ kind: 'weapon', tier: 4, affixes: [] }]);
});

test('가득 차면 나쁜 장비는 바닥에 남고, 칸을 비우면 다시 줍는다', () => {
  const w = make();
  w.bag = junk(BAG_MAX);
  drop(w, 'weapon', 2);
  expect(bagBlocked(w)).toBe(true);
  step(w, []);
  expect(w.items).toHaveLength(1);
  expect(w.bag).toHaveLength(BAG_MAX);
  expect(bagBlocked(w)).toBe(true);
  discardFromBag(w, 0);
  expect(bagBlocked(w)).toBe(false);
  step(w, []);
  expect(w.items).toEqual([]);
  expect(w.bag.at(-1)).toEqual({ kind: 'weapon', tier: 2, affixes: [] });
});

test('자동 장착을 끄고 가득 차면 더 좋은 장비도 바닥에 남는다', () => {
  const w = make();
  w.autoEquip = false;
  w.bag = junk(BAG_MAX);
  drop(w, 'weapon', 4);
  step(w, []);
  expect(w.items).toHaveLength(1);
  expect(w.gear.weapon).toBe(3);
});

test('가득 찼을 때 자동 장착: 벗은 장비는 발밑에 떨어지고, 맞바꿈이 반복되지 않는다', () => {
  const w = make();
  w.bag = junk(BAG_MAX);
  drop(w, 'weapon', 4);
  for (let i = 0; i < 10; i++) step(w, []);
  expect(w.gear.weapon).toBe(4);
  expect(w.bag).toHaveLength(BAG_MAX);
  expect(w.items).toHaveLength(1);
  expect(w.items[0]).toMatchObject({ kind: 'weapon', tier: 3, x: w.entities[0].x, z: w.entities[0].z });
});

test('발밑에 떨어진 장비는 옵션을 유지하고, 칸이 비면 옵션째 다시 주워진다', () => {
  const w = make();
  w.mods.weapon = [{ kind: 'crit', value: 10 }];
  w.bag = junk(BAG_MAX);
  drop(w, 'weapon', 4, [{ kind: 'dmg', value: 30 }]);
  step(w, []);
  expect(w.items[0].affixes).toEqual([{ kind: 'crit', value: 10 }]);
  discardFromBag(w, 0);
  step(w, []);
  expect(w.items).toEqual([]);
  expect(w.bag.at(-1)).toEqual({ kind: 'weapon', tier: 3, affixes: [{ kind: 'crit', value: 10 }] });
});

test('한 틱에 두 장비를 밟아도 빈칸만큼만 줍고 나머지는 남는다', () => {
  const w = make();
  w.bag = junk(BAG_MAX - 1);
  drop(w, 'weapon', 1);
  drop(w, 'armor', 1);
  step(w, []);
  expect(w.bag).toHaveLength(BAG_MAX);
  expect(w.items.map((i) => i.kind)).toEqual(['armor']);
});

test('직접 장착: 그 칸과 맞바꾼다(가득 차도, 점수가 낮아도)', () => {
  const w = make();
  w.bag = junk(BAG_MAX);
  w.bag[2] = { kind: 'armor', tier: 2, affixes: [{ kind: 'thorns', value: 30 }] };
  w.gear.armor = 4;
  equipFromBag(w, 2);
  expect(w.gear.armor).toBe(2);
  expect(w.mods.armor).toEqual([{ kind: 'thorns', value: 30 }]);
  expect(w.bag[2]).toEqual({ kind: 'armor', tier: 4, affixes: [] });
  expect(w.bag).toHaveLength(BAG_MAX);
});

test('직접 입은 낮은 장비는 보관함의 더 좋은 장비로 저절로 바뀌지 않는다', () => {
  const w = make();
  w.bag = [{ kind: 'weapon', tier: 1, affixes: [] }];
  equipFromBag(w, 0);
  for (let i = 0; i < 10; i++) step(w, []);
  expect(w.gear.weapon).toBe(1);
  expect(w.bag).toEqual([{ kind: 'weapon', tier: 3, affixes: [] }]);
});

const LIFE = (value: number): BagItem => ({ kind: 'armor', tier: 1, affixes: [{ kind: 'life', value }] });

test('갑옷을 바꾸면 체력 비율을 유지한다', () => {
  const w = make();
  const hero = w.entities[0];
  hero.hp = 50;
  w.bag = [LIFE(30)];
  equipFromBag(w, 0);
  expect(hero.maxHp).toBe(130);
  expect(hero.hp).toBeCloseTo(65, 9);
  equipFromBag(w, 0);
  expect(hero.maxHp).toBe(100);
  expect(hero.hp).toBeCloseTo(50, 9);
});

test('체력이 가득 차 있으면 입고 벗어도 가득 찬 채로(비교만 해도 깎이지 않는다)', () => {
  const w = make();
  const hero = w.entities[0];
  w.bag = [LIFE(30)];
  equipFromBag(w, 0);
  expect(hero.hp / hero.maxHp).toBeCloseTo(1, 9);
  equipFromBag(w, 0);
  expect(hero.hp / hero.maxHp).toBeCloseTo(1, 9);
});

test('서로 다른 갑옷을 계속 번갈아 입어도 체력이 오르지 않는다', () => {
  const w = make();
  const hero = w.entities[0];
  hero.hp = 37;
  w.bag = [LIFE(17), LIFE(29), LIFE(23)];
  for (let i = 0; i < 3000; i++) equipFromBag(w, i % 3);
  expect(hero.hp / hero.maxHp).toBeCloseTo(0.37, 9);
});

test('물약 직전에 갑옷을 바꿔도 이득이 없다', () => {
  const plain = make();
  plain.entities[0].hp = 20;
  plain.potions = 1;
  step(plain, [{ type: 'drink' }]);

  const swap = make();
  swap.entities[0].hp = 20;
  swap.potions = 1;
  swap.bag = [LIFE(30)];
  equipFromBag(swap, 0);
  step(swap, [{ type: 'drink' }]);
  equipFromBag(swap, 0);
  expect(swap.entities[0].hp).toBeLessThanOrEqual(plain.entities[0].hp + 1e-9);
});

test('체력이 아주 낮아도 갑옷을 바꿔서 0이 되지 않는다', () => {
  const w = make();
  const hero = w.entities[0];
  w.mods.armor = [{ kind: 'life', value: 30 }];
  setLevel(w, 1, 0);
  hero.hp = 1;
  w.bag = [{ kind: 'armor', tier: 1, affixes: [] }];
  equipFromBag(w, 0);
  expect(hero.hp).toBeGreaterThan(0);
  expect(hero.state).not.toBe('dead');
});

test('밟아서 자동 장착해도 비율을 유지한다', () => {
  const w = make();
  const hero = w.entities[0];
  drop(w, 'armor', 1, [{ kind: 'life', value: 30 }]);
  step(w, []);
  expect(hero.maxHp).toBe(130);
  expect(hero.hp).toBeCloseTo(130, 9);
});

test('버리기는 그 칸만 없앤다', () => {
  const w = make();
  w.bag = [
    { kind: 'weapon', tier: 1, affixes: [] },
    { kind: 'armor', tier: 2, affixes: [] },
  ];
  discardFromBag(w, 0);
  expect(w.bag).toEqual([{ kind: 'armor', tier: 2, affixes: [] }]);
  expect(w.items).toEqual([]);
});

test('잘못된 칸이나 죽은 주인공은 아무 일도 없다', () => {
  const w = make();
  w.bag = junk(1);
  for (const i of [-1, 1, 99, 0.5, Number.NaN]) {
    equipFromBag(w, i);
    discardFromBag(w, i);
  }
  expect(w.bag).toEqual(junk(1));
  expect(w.gear.weapon).toBe(3);
  w.entities[0].state = 'dead';
  equipFromBag(w, 0);
  discardFromBag(w, 0);
  expect(w.bag).toEqual(junk(1));
  expect(w.gear.weapon).toBe(3);
});

test('gearDiff: 입은 것과의 점수 차. isBetter와 같은 판단', () => {
  const w = make();
  const better: BagItem = { kind: 'weapon', tier: 4, affixes: [] };
  const worse: BagItem = { kind: 'weapon', tier: 1, affixes: [] };
  const same: BagItem = { kind: 'weapon', tier: 3, affixes: [] };
  expect(gearDiff(w, better)).toBeGreaterThan(0);
  expect(gearDiff(w, worse)).toBeLessThan(0);
  expect(gearDiff(w, same)).toBe(0);
  expect([better, worse, same].map((it) => isBetter(w, it))).toEqual([true, false, false]);
});

test('줍는 범위 밖의 장비는 그대로 있고 막힘으로 치지 않는다', () => {
  const w = make();
  w.bag = junk(BAG_MAX);
  w.items.push({ id: w.nextItem++, x: 4.5, z: 0.5, kind: 'weapon', tier: 1, affixes: [] });
  expect(bagBlocked(w)).toBe(false);
  w.bag = [];
  step(w, []);
  expect(w.items).toHaveLength(1);
});
