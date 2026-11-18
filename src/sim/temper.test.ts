// 벼림 탭(기사 다섯째). 설계: docs/superpowers/specs/2026-11-17-temper-tab-design.md
import { expect, test } from 'vitest';
import { decodeSave, encodeSave } from '../save';
import { flameEdgeStat, frostEdgeStat, reforgeStat, syn, unleashStat } from './core';
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
  const run = (tab: number) => ({ name: '용사', marks: 0, cls: 'knight' as const, floor: 2, potions: 2, gear: { weapon: 2, armor: 2, helm: 2, boots: 2 }, mods: { weapon: [], armor: [{ kind: 'tab' as const, value: 1, tab }], helm: [], boots: [] }, ranks: { cleave: 1 }, points: 0, keys: { cleave: 'cleave' as const, dash: null, shout: null, throw: null }, bag: [], autoEquip: true, level: 1, xp: 0, gold: 0, cycle: 0, stats: { time: 0, kills: 0, deaths: 0 }, pity: 0, land: 'dungeon' as const, from: 'w' as const, stage: 0 });
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
  expect(left('graze', ['Hm...'], { type: 'skill' }, 0.3), '스쳐 베기(지나칠 때)').toBe(5);
});
test('respec하면 칼이 빈다', () => {
  const w = arena(['Hm...'], { flameEdge: 1 }); w.gold = 1e4; w.edge = flame(3);
  respec(w); expect(w.edge.kind).toBeNull();
});

// 2.5m 안 둘(위·왼쪽 아래), 바깥 하나(x=4.5)
const ring = (ranks: Partial<Record<SkillId, number>>) => arena(['.m...', 'mH..m'], ranks);
test('덧벼림: 남은 충전이 있으면 다른 벼림을 쓸 때 터진다(남은 충전 × 굴림 × 배율)', () => {
  const w = ring({ flameEdge: 1, frostEdge: 1, reforge: 1 }); w.edge = flame(4);
  w.res = 100; step(w, [{ type: 'shout' }]);
  expect(w.edge).toEqual({ kind: 'frost', left: 6, t: 0 });
  expect(w.blasts.some((b) => b.kind === 'fire' && b.r === 2.5)).toBe(true);
  const [a, b, out] = w.entities.slice(1).sort((p, q) => p.x - q.x || p.z - q.z).map((e) => 1e5 - e.hp);
  expect(a).toBeGreaterThan(0); expect(b).toBeGreaterThan(0); expect(out).toBe(0);
  // 굴림(무기 3단계, 레벨 1) × 4 × 0.3 × 기절 약점 1.5 범위
  const one = arena(['.m...', 'mH..m'], { flameEdge: 1, frostEdge: 1, reforge: 1 }); one.edge = flame(1); one.res = 100; step(one, [{ type: 'shout' }]);
  expect(a).toBeGreaterThan(1e5 - one.entities[1].hp); // 충전 4가 1보다 세다
});
test('덧벼림 서리: 피해와 0.8초 빙결', () => {
  const w = ring({ flameEdge: 1, frostEdge: 1, reforge: 1 }); w.edge = { kind: 'frost', left: 3, t: 0 };
  for (const e of w.entities.slice(1)) e.stunT = 0;
  w.res = 100; step(w, [{ type: 'dash' }]);
  expect(w.edge.kind).toBe('flame');
  expect(w.blasts.some((b) => b.kind === 'ice' && b.r === 2.5)).toBe(true);
  const near = w.entities.slice(1).filter((e) => e.x < 3);
  for (const e of near) { expect(e.hp).toBeLessThan(1e5); expect(e.stunT).toBeCloseTo(0.8 - DT); } // 같은 틱에 한 번 줄어든다
});
test('덧벼림을 배우기 전에는 그냥 덮어쓴다', () => {
  const w = ring({ flameEdge: 1, frostEdge: 1 }); w.edge = flame(4);
  w.res = 100; step(w, [{ type: 'shout' }]);
  expect(w.edge.kind).toBe('frost'); expect(w.blasts.some((b) => b.r === 2.5)).toBe(false);
  for (const e of w.entities.slice(1)) expect(e.hp).toBe(1e5);
});
test('덧벼림 단계마다 충전 +1, 폭발 배율 +0.05', () => {
  const w = arena(['H....'], { flameEdge: 1, reforge: 3 });
  expect(flameEdgeStat(w).charges).toBe(8); expect(reforgeStat(w).mult).toBeCloseTo((0.3 + 0.1) * syn(w, 'reforge'));
});
test('폭발은 충전을 쓰지 않는다', () => {
  const w = ring({ flameEdge: 1, frostEdge: 1, reforge: 1 }); w.edge = flame(4);
  for (const e of w.entities.slice(1)) Object.assign(e, { hp: 1, maxHp: 1 });
  w.res = 100; step(w, [{ type: 'shout' }]);
  expect(w.entities.filter((e) => e.state === 'dead').length).toBe(2);
  expect(w.edge).toEqual({ kind: 'frost', left: 6, t: 0 }); expect(w.edgeSwings).toBe(0);
});

const both = (t = 6) => ({ kind: 'both' as const, left: 0, t });
test('해방: 6초 동안 불과 서리가 함께, 충전이 줄지 않고, 끝나면 칼이 빈다', () => {
  const w = arena(['Hm...'], { flameEdge: 1, frostEdge: 1, reforge: 1, unleash: 1 }, { throw: 'unleash' });
  w.res = 100; step(w, [{ type: 'throw' }]);
  expect(w.edge).toEqual(both(6)); expect(w.throwCd).toBe(15);
  const e = w.entities[1]; e.stunT = 0;
  for (let i = 0; i < 3; i++) temper(w, w.entities[0], [e]);
  expect(e.stunT).toBeGreaterThan(0); expect(e.hp).toBeLessThan(1e5); expect(w.edge.kind).toBe('both');
  runFor(w, 5.9); expect(w.edge.kind).toBe('both'); runFor(w, 0.2); expect(w.edge.kind).toBeNull();
});
test('해방도 덧벼림을 터뜨린다', () => {
  const w = ring({ flameEdge: 1, reforge: 1, unleash: 1 }); w.keys.throw = 'unleash'; w.edge = flame(3);
  w.res = 100; step(w, [{ type: 'throw' }]);
  expect(w.edge.kind).toBe('both'); expect(w.blasts.some((b) => b.kind === 'fire' && b.r === 2.5)).toBe(true);
});
test('해방 참격: 앞쪽 3m·폭 0.8m 안의 적만, 벽 너머는 안 맞는다', () => {
  const slash = (map: string[]) => { const w = arena(map, { unleash: 1 }); w.edge = both(); w.entities[0].facing = Math.PI / 2; temper(w, w.entities[0], []); return w; };
  const a = slash(['H..m.m']);
  expect(a.edgeSlashes).toBe(1); expect(a.entities[1].hp).toBeLessThan(1e5); expect(a.entities[2].hp).toBe(1e5);
  expect(slash(['H.#m']).entities[1].hp).toBe(1e5);
  expect(slash(['H...', '..m.']).entities[1].hp).toBe(1e5); // 옆으로 1m
  const back = arena(['m.H..'], { unleash: 1 }); back.edge = both(); back.entities[0].facing = Math.PI / 2; temper(back, back.entities[0], []);
  expect(back.entities[1].hp).toBe(1e5); // 뒤쪽
});
test('해방 참격은 칼로 벤 휘두름마다 한 번, 충전을 쓰지 않는 효과에선 나가지 않는다', () => {
  const w = arena(['Hm...'], { unleash: 1 }); w.edge = both();
  temper(w, w.entities[0], [w.entities[1]], false); expect(w.edgeSlashes).toBe(0);
  temper(w, w.entities[0], [w.entities[1]]); expect(w.edgeSlashes).toBe(1);
});
test('해방 중엔 불·서리 벼림이 나가지 않는다(비용·대기 없음)', () => {
  const w = arena(['H....'], { flameEdge: 1, unleash: 1 }); w.edge = both(); w.res = 50;
  step(w, [{ type: 'dash' }]); expect(w.dashCd).toBe(0); expect(w.res).toBeGreaterThanOrEqual(50); expect(w.edge.kind).toBe('both');
});
test('끝나는 틱의 휘두름엔 참격이 없다', () => {
  const w = arena(['H..m.'], { unleash: 1 }); w.edge = both(DT / 2);
  step(w, []); expect(w.edge.kind).toBeNull(); temper(w, w.entities[0], []); expect(w.edgeSlashes).toBe(0);
});
test('같은 벼림을 다시 쓰면 터지지 않고 충전만 새로 찬다', () => {
  const w = ring({ flameEdge: 1, reforge: 1 }); w.edge = flame(2);
  w.res = 100; step(w, [{ type: 'dash' }]);
  expect(w.edge).toEqual(flame(6)); expect(w.blasts.some((b) => b.r === 2.5)).toBe(false);
  for (const e of w.entities.slice(1)) expect(e.hp).toBe(1e5);
});
test('강화 기록: 효과를 준 적마다 하나, 못 맞히면 없음', () => {
  const w = arena(['Hm...'], { flameEdge: 1 }); w.edge = flame();
  const foe = w.entities[1];
  const before = foe.hp;
  temper(w, w.entities[0], [foe]);
  expect(w.edgeHits).toHaveLength(1);
  expect(w.edgeHits[0]).toMatchObject({ ent: foe.id, kind: 'flame', freeze: false, dmg: before - foe.hp });
  expect(w.edgeHits[0].dmg).toBeGreaterThan(0);
  temper(w, w.entities[0], []);
  expect(w.edgeHits).toHaveLength(1);
});
test('강화 기록: 서리는 피해 0, 언 타수에 freeze', () => {
  const w = arena(['Hm...'], { frostEdge: 1 }); w.edge = { kind: 'frost', left: 6, t: 0 };
  const foe = w.entities[1];
  for (let i = 0; i < 3; i++) temper(w, w.entities[0], [foe]);
  expect(w.edgeHits.map((h) => [h.dmg, h.freeze])).toEqual([[0, false], [0, false], [0, true]]);
});
test('강화 기록은 hitAge 뒤 사라진다', () => {
  const w = arena(['Hm...'], { flameEdge: 1 }); w.edge = flame();
  temper(w, w.entities[0], [w.entities[1]]);
  runFor(w, 0.6);
  expect(w.edgeHits).toHaveLength(0);
});
