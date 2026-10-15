import { expect, test } from 'vitest';
import { createWorld } from '../sim/world';
import { snapshot, soundEvents } from './events';

const names = (e: { name: string }[]) => e.map((x) => x.name);

test('변화가 없으면 소리도 없다', () => {
  const w = createWorld(1, ['H.mM']);
  expect(soundEvents(snapshot(w), w)).toEqual([]);
});

test('공격 시작: 상태가 attack이 되거나 attackT가 줄어 다음 휘두르기', () => {
  const w = createWorld(1, ['H.mM']);
  const [hero, m, boss] = w.entities;
  let prev = snapshot(w);
  hero.state = 'attack';
  m.state = 'attack';
  boss.state = 'attack';
  expect(names(soundEvents(prev, w))).toEqual(['swing', 'skel_attack', 'boss_attack']);
  hero.attackT = 0.5;
  prev = snapshot(w);
  hero.attackT = 0.02; // 다음 휘두르기로 넘어감
  expect(names(soundEvents(prev, w))).toEqual(['swing']);
});

test('피격과 사망: 죽는 틱에는 피격음 대신 사망음, 위치는 그 엔티티', () => {
  const w = createWorld(1, ['H.m.M']);
  const [hero, m, boss] = w.entities;
  const prev = snapshot(w);
  hero.hp -= 5;
  m.hp = 0;
  m.state = 'dead';
  boss.hp -= 10;
  const ev = soundEvents(prev, w);
  expect(names(ev)).toEqual(['hero_hit', 'skel_die', 'boss_hit']);
  expect(ev[1]).toMatchObject({ x: m.x, z: m.z });
  const p2 = snapshot(w);
  hero.hp = 0;
  hero.state = 'dead';
  expect(names(soundEvents(p2, w))).toEqual(['hero_die']);
});

test('물약·아이템·장비', () => {
  const w = createWorld(1, ['H..']);
  w.potions = 2;
  let prev = snapshot(w);
  w.potions = 1;
  expect(names(soundEvents(prev, w))).toEqual(['potion']);
  prev = snapshot(w);
  w.potions = 2;
  w.items.push({ id: 7, x: 1, z: 0.5, kind: 'weapon', tier: 3 });
  expect(names(soundEvents(prev, w))).toEqual(['potion', 'loot']);
  prev = snapshot(w);
  w.gear = { weapon: w.gear.weapon + 1, armor: w.gear.armor + 1 };
  expect(names(soundEvents(prev, w))).toEqual(['equip_weapon', 'equip_armor']);
});

test('층이 바뀌면(다른 world) 소리 없이 넘어간다', () => {
  const a = createWorld(1, ['H.m']);
  const b = createWorld(2, ['H..mm']);
  b.potions = 5;
  expect(soundEvents(snapshot(a), b)).toEqual([]);
});

test('레벨업', () => {
  const w = createWorld(1, ['H..']);
  const prev = snapshot(w);
  w.level = 2;
  expect(names(soundEvents(prev, w))).toEqual(['level_up']);
});
