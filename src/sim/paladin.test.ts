import { expect, test } from 'vitest';
import { createWorld, LANDS } from './world';
import { landSword } from './paladin';
import { generateArena, PALADIN } from './sanctum';

test('성검: 대지 강타로 뛰어 내릴 칸에는 벽을 세우지 않는다(내려앉아 갇히지 않게)', () => {
  const w = createWorld(7, generateArena(), 1, 1, LANDS.sanctum.skins);
  w.land = 'sanctum';
  const hero = w.entities[0];
  Object.assign(hero, { x: 24.5, z: 30.5, phase: 'leap', phaseT: 0.4, dx: 0, dz: -10 }); // 0.4초 뒤 (24.5, 26.5)에 내린다
  landSword(w, { id: w.nextItem++, x: 24.5, z: 26.5, r: PALADIN.swordR, t: 0, total: PALADIN.rainDelay, dmg: 50, owner: -1, kind: 'sword' });
  expect(w.grid.blocked[26 * w.grid.w + 24]).toBe(0);
  expect(w.swords.length).toBe(0);
});
