// 벼림 탭(기사 다섯째). 설계: docs/superpowers/specs/2026-11-17-temper-tab-design.md
import { expect, test } from 'vitest';
import { decodeSave, encodeSave } from '../save';
import { flameEdgeStat, frostEdgeStat, syn, unleashStat } from './core';
import { clearEdge, temper } from './temper';
import { DT, type Command, type SkillId, type World } from './rules';
import { createWorld, isPassive, respec, SKILLS, skillCost, step, TREES, useClass } from './world';

const arena = (map: string[], ranks: Partial<Record<SkillId, number>>, keys: Partial<World['keys']> = {}) => {
  const w = createWorld(1, map); useClass(w, 'knight'); Object.assign(w.ranks, ranks);
  Object.assign(w.keys, { cleave: 'cleave', dash: 'flameEdge', shout: 'frostEdge', throw: null }, keys);
  for (const e of w.entities.slice(1)) Object.assign(e, { hp: 1e5, maxHp: 1e5, stunT: 1e9 });
  return w;
};
const runFor = (w: World, sec: number, cmds: Command[] = []) => { w.res = 100; step(w, cmds); for (let i = Math.round(sec / DT) - 1; i > 0; i--) step(w, []); };
const flame = (left = 6) => ({ kind: 'flame' as const, left, t: 0 });

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

test('불 벼림: 충전 6, 휘두름마다 1, 여러 적을 맞혀도 1, 못 맞히면 그대로', () => {
  const w = arena(['Hm...', 'm....'], { flameEdge: 1 }); w.res = 100; step(w, [{ type: 'dash' }]);
  expect(w.edge).toEqual({ kind: 'flame', left: 6, t: 0 });
  expect(w.dashCd).toBe(4);
  runFor(w, 1, [{ type: 'skill', x: 1.5, z: 1 }]);
  expect(w.entities[1].hp).toBeLessThan(1e5); expect(w.entities[2].hp).toBeLessThan(1e5);
  expect(w.edge.left).toBe(5);
  const far = arena(['H....m'], { flameEdge: 1 }); far.edge = flame();
  runFor(far, 1, [{ type: 'skill', x: 3, z: 0.5 }]); expect(far.edge.left).toBe(6);
});
test('불 벼림 추가 피해: 같은 시드에서 빈 칼보다 더, 가르기 한 번보다 덜', () => {
  const hit = (lit: boolean) => { const w = arena(['Hm...'], {}); if (lit) w.edge = flame(); runFor(w, 1, [{ type: 'skill', x: 1.5, z: 0.5 }]); return 1e5 - w.entities[1].hp; };
  const [base, lit] = [hit(false), hit(true)];
  expect(lit - base).toBeGreaterThan(0); expect(lit - base).toBeLessThan(base);
});
test('충전이 0이면 꺼지고, 5단계는 마지막 휘두름 자리에서 화염 폭발', () => {
  const w = arena(['Hm...'], { flameEdge: 1 }); w.edge = flame(1);
  temper(w, w.entities[0], [w.entities[1]]); expect(w.edge.kind).toBeNull();
  expect(w.blasts.some((b) => b.kind === 'fire')).toBe(false);
  const m = arena(['Hm...'], { flameEdge: 5 }); m.edge = flame(1);
  temper(m, m.entities[0], [m.entities[1]]); expect(m.blasts.some((b) => b.kind === 'fire' && b.r === 1.5)).toBe(true);
  expect(m.edge.kind).toBeNull();
});
test('서리 벼림: 같은 적 3타에 빙결(5단계 2타), 강화가 바뀌면 센 수가 지워진다', () => {
  const w = arena(['Hm...'], { frostEdge: 1 }); const e = w.entities[1]; e.stunT = 0;
  w.edge = { kind: 'frost', left: 6, t: 0 };
  temper(w, w.entities[0], [e]); temper(w, w.entities[0], [e]); expect(e.stunT).toBe(0);
  temper(w, w.entities[0], [e]); expect(e.stunT).toBeCloseTo(1); expect(e.frost).toBe(0);
  expect(w.blasts.some((b) => b.kind === 'ice')).toBe(true); expect(e.hp).toBe(1e5); // 서리는 피해 없이 얼리기만
  e.frost = 2; clearEdge(w); expect(e.frost).toBe(0);
  const m = arena(['Hm...'], { frostEdge: 5 }); m.entities[1].stunT = 0; m.edge = { kind: 'frost', left: 6, t: 0 };
  temper(m, m.entities[0], [m.entities[1]]); temper(m, m.entities[0], [m.entities[1]]); expect(m.entities[1].stunT).toBeGreaterThan(0);
});
test('서리 벼림을 쓰면 칼이 서리로 바뀌고 대기 6초', () => {
  const w = arena(['Hm...'], { flameEdge: 1, frostEdge: 1 }); w.edge = flame(3); w.entities[1].frost = 2;
  w.res = 100; step(w, [{ type: 'shout' }]);
  expect(w.edge).toEqual({ kind: 'frost', left: 6, t: 0 }); expect(w.shoutCd).toBe(6); expect(w.entities[1].frost).toBe(0);
});
test('죽은 적엔 효과 없음', () => {
  const w = arena(['Hm...'], { flameEdge: 1 }); const e = w.entities[1]; Object.assign(e, { hp: 0, state: 'dead' });
  w.edge = flame(); const xp = w.xp;
  temper(w, w.entities[0], [e]); expect(e.hp).toBe(0); expect(w.xp).toBe(xp); expect(w.edge.left).toBe(5);
});
test('충전을 쓰는 타격과 쓰지 않는 타격', () => {
  const left = (id: SkillId, map: string[], cmd: Command, sec = 1.5, prep?: (w: World) => void) => {
    const w = arena(map, { [id]: 1, mark: 1, cleave: 1 }, { cleave: id, dash: null, shout: null }); w.edge = flame(); prep?.(w);
    runFor(w, sec, [cmd]); return w.edge.left;
  };
  const at = (x: number) => ({ x, z: 0.5 });
  expect(left('cleave', ['Hm...'], { type: 'attack', targetId: 1 }), '평타').toBeLessThan(6);
  expect(left('cleave', ['Hm...'], { type: 'skill', ...at(1.5) }, 0.6), '가르기').toBe(5);
  expect(left('mark', ['Hm...'], { type: 'skill', ...at(1.5) }, 0.6), '그어두기').toBe(5);
  expect(left('execute', ['Hm...'], { type: 'skill', ...at(1.5) }, 0.3), '처형').toBe(5);
  expect(left('dash', ['Hmm...'], { type: 'skill', ...at(5.5) }, 1), '돌진 베기(돌진 하나 = 1)').toBe(5);
  expect(left('leap', ['H...m.'], { type: 'skill', ...at(4.5) }, 1), '대지 강타').toBe(5);
  expect(left('flash', ['Hm.m..'], { type: 'skill' }, 1.5), '일섬(꿰뚫을 때마다)').toBe(4);
  const spin = arena(['Hm...'], { whirl: 1 }, { cleave: 'whirl' }); spin.edge = flame();
  runFor(spin, 2.2, [{ type: 'skill' }]); expect(spin.edge.kind, '회오리 2초 = 8틱').toBeNull();
  expect(left('throw', ['H..m.'], { type: 'skill', ...at(3.5) }), '도끼').toBe(6);
  expect(left('bounce', ['H..m.'], { type: 'skill', ...at(3.5) }), '튕기는 도끼').toBe(6);
  expect(left('axeStorm', ['H..m.'], { type: 'skill' }), '도끼 폭풍').toBe(6);
  expect(left('sheathe', ['Hm...'], { type: 'skill' }, 1, (w) => Object.assign(w.entities[1], { marks: 2, markT: 4 })), '납도').toBe(6);
});
test('respec하면 칼이 빈다', () => {
  const w = arena(['Hm...'], { flameEdge: 1 }); w.gold = 1e4; w.edge = flame(3);
  respec(w); expect(w.edge.kind).toBeNull();
});
