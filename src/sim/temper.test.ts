// 벼림 탭(기사 다섯째). 설계: docs/superpowers/specs/2026-11-17-temper-tab-design.md
import { expect, test } from 'vitest';
import { decodeSave, encodeSave } from '../save';
import { flameEdgeStat, frostEdgeStat, syn, unleashStat } from './core';
import { createWorld, isPassive, SKILLS, skillCost, TREES, useClass } from './world';

test('기사는 탭 다섯(다섯째 = 벼림)', () => {
  expect(TREES.knight.map((t) => t.name)).toEqual(['검술', '돌격', '투척', '발도', '벼림']);
  expect(TREES.knight[4].skills).toEqual(['flameEdge', 'frostEdge', 'reforge', 'unleash']);
  expect(SKILLS.reforge).toEqual({ cls: 'knight', tab: 4, tier: 2 });
  expect(isPassive('reforge')).toBe(true);
  expect([skillCost('knight', 'flameEdge'), skillCost('knight', 'frostEdge'), skillCost('knight', 'unleash')]).toEqual([16, 24, 36]);
});
test('벼림 수치: 1단계 시작값, 단계마다', () => {
  const w = createWorld(1, ['H....']); useClass(w, 'knight');
  Object.assign(w.ranks, { flameEdge: 1, frostEdge: 1, unleash: 1 });
  expect(flameEdgeStat(w)).toMatchObject({ cd: 4, charges: 6 });
  expect(flameEdgeStat(w).mult).toBeCloseTo(0.4 * syn(w, 'flameEdge'));
  expect(frostEdgeStat(w)).toMatchObject({ cd: 6, hits: 3, freeze: 1 });
  expect(unleashStat(w)).toMatchObject({ cd: 15, time: 6 });
  Object.assign(w.ranks, { frostEdge: 5, reforge: 3 });
  expect(frostEdgeStat(w)).toMatchObject({ hits: 2, charges: 8 });
  expect(frostEdgeStat(w).freeze).toBeCloseTo(1.6);
});
test('저장: 탭 옵션 4는 통과, 5는 거부', () => {
  const run = (tab: number) => ({ cls: 'knight' as const, floor: 2, potions: 2, gear: { weapon: 2, armor: 2, helm: 2, boots: 2 }, mods: { weapon: [], armor: [{ kind: 'tab' as const, value: 1, tab }], helm: [], boots: [] }, ranks: { cleave: 1 }, points: 0, keys: { cleave: 'cleave' as const, dash: null, shout: null, throw: null }, bag: [], autoEquip: true, level: 1, xp: 0, gold: 0, cycle: 0, stats: { time: 0, kills: 0, deaths: 0 }, pity: 0, land: 'dungeon' as const, from: 'w' as const });
  expect(decodeSave(encodeSave(run(4)))).not.toBeNull();
  expect(decodeSave(encodeSave(run(5)))).toBeNull();
});
test('새 판의 칼은 비어 있다(층 이동·불러오기는 새 world)', () => {
  expect(createWorld(1, ['H....']).edge).toEqual({ kind: null, left: 0, t: 0 });
});
