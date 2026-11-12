import { expect, test } from 'vitest';
import { BAG, bagBlocked, bagFits, bagSpot, createWorld, discardFromBag, equipFromBag, gearDiff, isBetter, moveInBag, setLevel, step, type Affix, type BagItem, type GearItem, type World } from './world';

const make = () => createWorld(1, ['H....']); // 기본 장비: 롱소드(3)·천옷(1)
const drop = (w: World, kind: 'weapon' | 'armor', tier: number, affixes: Affix[] = []) =>
  w.items.push({ id: w.nextItem++, x: w.entities[0].x, z: w.entities[0].z, kind, tier, affixes });
const dagger = (x: number, y: number): BagItem => ({ kind: 'weapon', tier: 1, affixes: [], x, y }); // 1×2
// 단검 20자루로 격자(10×4)를 빈틈없이 채운다. 0·1번이 첫 열(위·아래)
const full = (): BagItem[] => Array.from({ length: BAG.w * 2 }, (_, i) => dagger(i >> 1, (i & 1) * 2));

test('지금보다 나쁜 장비는 보관함의 첫 자리로 들어가고 장착은 그대로', () => {
  const w = make();
  drop(w, 'weapon', 1);
  step(w, []);
  expect(w.items).toEqual([]);
  expect(w.bag).toEqual([dagger(0, 0)]);
  expect(w.gear.weapon).toBe(3);
});

test('줍는 자리: 왼쪽 열부터 위에서 아래로, 장비 크기만큼 비어 있는 첫 칸', () => {
  const w = make();
  w.autoEquip = false;
  drop(w, 'weapon', 2); // 1×3 → (0,0)
  drop(w, 'weapon', 1); // 1×2: 첫 열에 한 칸만 남아 다음 열 (1,0)
  drop(w, 'armor', 3); // 2×3: (1,0)이 막혀 (2,0)
  drop(w, 'weapon', 1); // 1×2 → (1,2)
  step(w, []);
  expect(w.bag.map((it) => [it.x, it.y])).toEqual([[0, 0], [1, 0], [2, 0], [1, 2]]);
});

test('bagFits: 격자 밖·겹침은 안 되고, skip번 자신과는 겹쳐도 된다', () => {
  const bag = [dagger(0, 0)];
  const sword = { kind: 'weapon' as const, tier: 4 }; // 2×3
  expect(bagFits(bag, sword, 1, 0)).toBe(true);
  expect(bagFits(bag, sword, 0, 1)).toBe(false); // 겹침
  expect(bagFits(bag, sword, 0, 2)).toBe(false); // 아래로 넘침
  expect(bagFits(bag, sword, 9, 0)).toBe(false); // 오른쪽으로 넘침
  expect(bagFits(bag, sword, -1, 0)).toBe(false);
  expect(bagFits(bag, sword, 0.5, 0)).toBe(false);
  expect(bagFits(bag, bag[0], 0, 1, 0)).toBe(true);
  expect(bagSpot(full(), bag[0])).toBeNull();
});

test('자동 장착: 더 좋은 장비는 입고, 벗은 장비(옵션 포함)는 보관함으로', () => {
  const w = make();
  w.mods.weapon = [{ kind: 'crit', value: 10 }];
  drop(w, 'weapon', 4, [{ kind: 'dmg', value: 20 }]);
  step(w, []);
  expect(w.gear.weapon).toBe(4);
  expect(w.mods.weapon).toEqual([{ kind: 'dmg', value: 20 }]);
  expect(w.bag).toEqual([{ kind: 'weapon', tier: 3, affixes: [{ kind: 'crit', value: 10 }], x: 0, y: 0 }]);
});

test('자동 장착을 끄면 더 좋은 장비도 보관함으로만', () => {
  const w = make();
  w.autoEquip = false;
  drop(w, 'weapon', 4);
  step(w, []);
  expect(w.gear.weapon).toBe(3);
  expect(w.bag).toEqual([{ kind: 'weapon', tier: 4, affixes: [], x: 0, y: 0 }]);
});

test('자리가 없으면 나쁜 장비는 바닥에 남고, 자리를 비우면 다시 줍는다', () => {
  const w = make();
  w.bag = full();
  drop(w, 'weapon', 1);
  expect(bagBlocked(w)).toBe(true);
  step(w, []);
  expect(w.items).toHaveLength(1);
  expect(w.bag).toHaveLength(20);
  expect(bagBlocked(w)).toBe(true);
  discardFromBag(w, 0);
  expect(bagBlocked(w)).toBe(false);
  step(w, []);
  expect(w.items).toEqual([]);
  expect(w.bag.at(-1)).toEqual(dagger(0, 0));
});

test('빈칸이 있어도 장비 크기만큼 이어져 있지 않으면 못 줍는다', () => {
  const w = make();
  w.bag = full().slice(1); // (0,0)에 1×2만 비었다
  drop(w, 'weapon', 2); // 1×3
  expect(bagBlocked(w)).toBe(true);
  step(w, []);
  expect(w.items).toHaveLength(1);
});

test('자동 장착을 끄고 자리가 없으면 더 좋은 장비도 바닥에 남는다', () => {
  const w = make();
  w.autoEquip = false;
  w.bag = full();
  drop(w, 'weapon', 4);
  step(w, []);
  expect(w.items).toHaveLength(1);
  expect(w.gear.weapon).toBe(3);
});

test('자리가 없을 때 자동 장착: 벗은 장비는 발밑에 떨어지고, 맞바꿈이 반복되지 않는다', () => {
  const w = make();
  w.bag = full();
  drop(w, 'weapon', 4);
  for (let i = 0; i < 10; i++) step(w, []);
  expect(w.gear.weapon).toBe(4);
  expect(w.bag).toHaveLength(20);
  expect(w.items).toHaveLength(1);
  expect(w.items[0]).toMatchObject({ kind: 'weapon', tier: 3, x: w.entities[0].x, z: w.entities[0].z });
});

test('발밑에 떨어진 장비는 옵션을 유지하고, 자리가 나면 옵션째 다시 주워진다', () => {
  const w = make();
  w.mods.weapon = [{ kind: 'crit', value: 10 }];
  w.bag = full();
  drop(w, 'weapon', 4, [{ kind: 'dmg', value: 30 }]);
  step(w, []);
  expect(w.items[0].affixes).toEqual([{ kind: 'crit', value: 10 }]);
  discardFromBag(w, 0);
  discardFromBag(w, 0); // 첫 열을 다 비워야 1×3이 들어간다
  step(w, []);
  expect(w.items).toEqual([]);
  expect(w.bag.at(-1)).toEqual({ kind: 'weapon', tier: 3, affixes: [{ kind: 'crit', value: 10 }], x: 0, y: 0 });
});

test('한 틱에 두 장비를 밟아도 들어가는 것만 줍고 나머지는 남는다', () => {
  const w = make();
  w.bag = full().slice(0, -1);
  drop(w, 'weapon', 1);
  drop(w, 'armor', 1);
  step(w, []);
  expect(w.bag).toHaveLength(20);
  expect(w.items.map((i) => i.kind)).toEqual(['armor']);
});

test('직접 장착: 벗은 장비가 그 자리에 놓인다(점수가 낮아도, 크기가 달라도)', () => {
  const w = make();
  w.bag = [dagger(0, 0), { kind: 'armor', tier: 2, affixes: [{ kind: 'thorns', value: 30 }], x: 1, y: 0 }]; // 2×2
  w.gear.armor = 4; // 2×3
  expect(equipFromBag(w, 1)).toBe(true);
  expect(w.gear.armor).toBe(2);
  expect(w.mods.armor).toEqual([{ kind: 'thorns', value: 30 }]);
  expect(w.bag).toEqual([dagger(0, 0), { kind: 'armor', tier: 4, affixes: [], x: 1, y: 0 }]);
});

test('직접 장착: 벗은 장비가 그 자리에 안 들어가면 빈 자리로, 빈 자리도 없으면 입지 않는다', () => {
  const w = make();
  // 가죽 갑옷(2×2)이 (0,0), 바로 아래가 막혀 있어 판금(2×3)은 그 자리에 못 놓는다
  w.bag = [{ kind: 'armor', tier: 2, affixes: [], x: 0, y: 0 }, dagger(0, 2)];
  w.gear.armor = 4;
  expect(equipFromBag(w, 0)).toBe(true);
  expect(w.bag[0]).toEqual({ kind: 'armor', tier: 4, affixes: [], x: 1, y: 0 });

  const f = make();
  f.bag = [{ kind: 'armor', tier: 2, affixes: [], x: 0, y: 0 }, ...full().filter((d) => d.x > 1 || d.y > 0)];
  f.gear.armor = 4;
  const before = [...f.bag];
  expect(equipFromBag(f, 0)).toBe(false);
  expect(f.gear.armor).toBe(4);
  expect(f.bag).toEqual(before);
});

test('옮기기: 빈 자리로만, 자기 자리와 겹치는 것은 된다. 원래 객체는 바꾸지 않는다', () => {
  const w = make();
  const a = dagger(0, 0);
  w.bag = [a, dagger(1, 0)];
  moveInBag(w, 0, 0, 1); // 한 칸 아래(자기와 겹침)
  expect(w.bag[0]).toEqual(dagger(0, 1));
  expect(a).toEqual(dagger(0, 0)); // 층 입구 기록이 같은 객체를 들고 있다
  moveInBag(w, 0, 1, 1); // 다른 장비와 겹침
  moveInBag(w, 0, 0, 3); // 아래로 넘침
  moveInBag(w, 0, 10, 0);
  moveInBag(w, 5, 3, 0); // 없는 칸
  expect(w.bag).toEqual([dagger(0, 1), dagger(1, 0)]);
  moveInBag(w, 0, 9, 2);
  expect(w.bag[0]).toEqual(dagger(9, 2));
});

test('직접 입은 낮은 장비는 보관함의 더 좋은 장비로 저절로 바뀌지 않는다', () => {
  const w = make();
  w.bag = [dagger(0, 0)];
  equipFromBag(w, 0);
  for (let i = 0; i < 10; i++) step(w, []);
  expect(w.gear.weapon).toBe(1);
  expect(w.bag).toEqual([{ kind: 'weapon', tier: 3, affixes: [], x: 0, y: 0 }]);
});

const LIFE = (value: number, x = 0): BagItem => ({ kind: 'armor', tier: 1, affixes: [{ kind: 'life', value }], x, y: 0 });

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
  w.bag = [LIFE(17, 0), LIFE(29, 2), LIFE(23, 4)];
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
  w.bag = [{ kind: 'armor', tier: 1, affixes: [], x: 0, y: 0 }];
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

test('버리기는 그 장비만 없앤다(나머지 자리는 그대로)', () => {
  const w = make();
  w.bag = [dagger(0, 0), { kind: 'armor', tier: 2, affixes: [], x: 1, y: 0 }];
  discardFromBag(w, 0);
  expect(w.bag).toEqual([{ kind: 'armor', tier: 2, affixes: [], x: 1, y: 0 }]);
  expect(w.items).toEqual([]);
});

test('잘못된 칸이나 죽은 주인공은 아무 일도 없다', () => {
  const w = make();
  w.bag = [dagger(0, 0)];
  for (const i of [-1, 1, 99, 0.5, Number.NaN]) {
    equipFromBag(w, i);
    discardFromBag(w, i);
    moveInBag(w, i, 5, 0);
  }
  expect(w.bag).toEqual([dagger(0, 0)]);
  expect(w.gear.weapon).toBe(3);
  w.entities[0].state = 'dead';
  equipFromBag(w, 0);
  discardFromBag(w, 0);
  moveInBag(w, 0, 5, 0);
  expect(w.bag).toEqual([dagger(0, 0)]);
  expect(w.gear.weapon).toBe(3);
});

test('gearDiff: 입은 것과의 점수 차. isBetter와 같은 판단', () => {
  const w = make();
  const better: GearItem = { kind: 'weapon', tier: 4, affixes: [] };
  const worse: GearItem = { kind: 'weapon', tier: 1, affixes: [] };
  const same: GearItem = { kind: 'weapon', tier: 3, affixes: [] };
  expect(gearDiff(w, better)).toBeGreaterThan(0);
  expect(gearDiff(w, worse)).toBeLessThan(0);
  expect(gearDiff(w, same)).toBe(0);
  expect([better, worse, same].map((it) => isBetter(w, it))).toEqual([true, false, false]);
});

test('줍는 범위 밖의 장비는 그대로 있고 막힘으로 치지 않는다', () => {
  const w = make();
  w.bag = full();
  w.items.push({ id: w.nextItem++, x: 4.5, z: 0.5, kind: 'weapon', tier: 1, affixes: [] });
  expect(bagBlocked(w)).toBe(false);
  w.bag = [];
  step(w, []);
  expect(w.items).toHaveLength(1);
});
