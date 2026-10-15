import { expect, test } from 'vitest';
import { createWorld } from '../sim/world';
import { gearName, itemLabel } from './labels';

test('장비 이름: 옵션 접두어 + 기본 이름', () => {
  expect(gearName('weapon', 3, [])).toBe('롱소드');
  expect(gearName('weapon', 3, [{ kind: 'dmg', value: 20 }, { kind: 'speed', value: 10 }])).toBe('날카로운 신속한 롱소드');
  expect(gearName('armor', 1, [{ kind: 'thorns', value: 30 }])).toBe('가시 천옷');
});

test('바닥 이름표: 이름, 등급(옵션 수), 지금보다 좋은지(물약은 이름표 없음)', () => {
  const w = createWorld(1, ['H']);
  w.gear = { weapon: 2, armor: 3 };
  expect(itemLabel({ id: 1, x: 0, z: 0, kind: 'weapon', tier: 4, affixes: [] }, w)).toEqual({ text: '그레이트소드', better: true, quality: 0 });
  expect(itemLabel({ id: 2, x: 0, z: 0, kind: 'weapon', tier: 2, affixes: [] }, w)).toEqual({ text: '숏소드', better: false, quality: 0 });
  expect(itemLabel({ id: 3, x: 0, z: 0, kind: 'armor', tier: 3, affixes: [{ kind: 'life', value: 20 }] }, w)).toEqual({ text: '튼튼한 사슬 갑옷', better: true, quality: 1 });
  expect(itemLabel({ id: 4, x: 0, z: 0, kind: 'potion', tier: 0 }, w)).toBeNull();
  expect(itemLabel({ id: 5, x: 0, z: 0, kind: 'gold', tier: 0, amount: 23 }, w)).toEqual({ text: '금화 23', better: false, quality: 0 });
});
