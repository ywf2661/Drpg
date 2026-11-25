// 내리베기(검술 2번 칸): 누르면 모으고, 다시 누르면(키를 떼면) 앞으로 일직선으로 내리벤다
import { expect, test } from 'vitest';
import { bind, createWorld, DOWNCUT, downcutStat, DT, ECHO, REEL, reel, step, useClass, type Command, type SkillId, type World } from './world';

const run = (w: World, sec: number, cmds: Command[] = []) => {
  step(w, cmds);
  for (let i = Math.round(sec / DT) - 1; i > 0; i--) step(w, []);
};
// 기사, 내리베기 r단계를 Q에. 적은 체력이 크고 기절해 제자리에 서 있다
const make = (map: string[], r = 1, more: Partial<Record<SkillId, number>> = {}) => {
  const w = createWorld(1, map);
  useClass(w, 'knight');
  Object.assign(w.ranks, { downcut: r }, more);
  w.keys.cleave = 'downcut';
  w.gear.weapon = 1;
  for (const e of w.entities.slice(1)) Object.assign(e, { hp: 1e5, maxHp: 1e5, stunT: 1e9 });
  return w;
};
const lost = (w: World, i = 1) => 1e5 - w.entities[i].hp;
const east = (w: World): Command => ({ type: 'skill', x: w.entities[0].x + 5, z: w.entities[0].z });

test('누르면 모으기만 하고 재사용 대기는 돌지 않는다, 다시 누르면 벤다', () => {
  const w = make(['Hm.....']);
  step(w, [east(w)]);
  expect(w.cut).toBeGreaterThanOrEqual(0);
  expect(w.skillCd).toBe(0);
  expect(lost(w)).toBe(0);
  run(w, 0.5);
  step(w, [east(w)]);
  expect(w.cut).toBe(-1);
  expect(w.skillCd).toBeCloseTo(DOWNCUT.cd);
  expect(lost(w)).toBeGreaterThan(0);
});

test('오래 모을수록 길고 세다: 짧게 모으면 4m 앞 적에 닿지 않는다', () => {
  const tap = make(['H...m']);
  step(tap, [east(tap)]);
  step(tap, [east(tap)]);
  const full = make(['H...m']);
  step(full, [east(full)]);
  run(full, DOWNCUT.full);
  step(full, [east(full)]);
  expect(lost(tap)).toBe(0);
  expect(lost(full)).toBeGreaterThan(0);
  const near = (sec: number) => {
    const w = make(['Hm...']);
    step(w, [east(w)]);
    if (sec) run(w, sec);
    step(w, [east(w)]);
    return lost(w);
  };
  expect(near(DOWNCUT.full)).toBeGreaterThan(near(0) * 2);
});

test('다 모이고 hold초가 지나면 저절로 벤다, 5단계는 1초면 다 모인다', () => {
  const w = make(['Hm...']);
  step(w, [east(w)]);
  run(w, DOWNCUT.full + DOWNCUT.hold + 0.1);
  expect(w.cut).toBe(-1);
  expect(w.skillCd).toBeGreaterThan(0);
  expect(lost(w)).toBeGreaterThan(0);
  const m = make(['Hm...'], 5);
  m.cut = DOWNCUT.fullMaster;
  expect(downcutStat(m).p).toBe(1);
  const f = make(['Hm...'], 4);
  f.cut = DOWNCUT.fullMaster;
  expect(downcutStat(f).p).toBeLessThan(1);
});

test('모으는 동안 맞아도 끊기지 않고, 평타를 하지 않는다', () => {
  const w = make(['Hm...']);
  w.entities[1].stunT = 0; // 적이 때린다
  step(w, [east(w), { type: 'attack', targetId: 1 }]);
  run(w, 1);
  expect(w.cut).toBeGreaterThan(0.9);
  expect(w.entities[0].hp).toBeLessThan(w.entities[0].maxHp);
  expect(lost(w)).toBe(0);
});

test('모으는 동안은 천천히 걷는다(×0.4)', () => {
  const walked = (charge: boolean) => {
    const w = make(['H.........']);
    if (charge) step(w, [east(w)]);
    const x0 = w.entities[0].x;
    run(w, 0.5, [{ type: 'move', x: 9.5, z: 0.5 }]);
    return w.entities[0].x - x0;
  };
  expect(walked(true) / walked(false)).toBeCloseTo(DOWNCUT.slow, 1);
});

test('모으는 사이 기력이 모자라도 벤다', () => {
  const w = make(['Hm...']);
  step(w, [east(w)]);
  w.res = 0;
  step(w, [east(w)]);
  expect(w.cut).toBe(-1);
  expect(lost(w)).toBeGreaterThan(0);
});

test('죽거나 구르거나 칸에서 빠지면 모으기가 풀리고 재사용 대기는 돌지 않는다', () => {
  const dead = make(['H.m..']);
  step(dead, [east(dead)]);
  Object.assign(dead.entities[0], { hp: 0, state: 'dead' });
  step(dead, []);
  const rolled = make(['H.m..']);
  step(rolled, [east(rolled)]);
  step(rolled, [{ type: 'roll', x: 0.5, z: 0.5 }]);
  const unbound = make(['H.m..'], 1, { cleave: 1 });
  step(unbound, [east(unbound)]);
  bind(unbound, 'cleave', 'cleave');
  step(unbound, []);
  for (const w of [dead, rolled, unbound]) {
    expect(w.cut).toBe(-1);
    expect(w.skillCd).toBe(0);
  }
});

test('다 모은 베기: 무거운 적은 밀리지 않고 휘청이며, 2초 안에는 다시 휘청이지 않는다', () => {
  const w = make(['H..M....']);
  const boss = w.entities[1];
  const x0 = boss.x;
  step(w, [east(w)]);
  run(w, DOWNCUT.full); // 보스는 기절해 있다(모으는 동안 주인공이 죽지 않게)
  boss.stunT = 0;
  step(w, [east(w)]);
  expect(lost(w)).toBeGreaterThan(0);
  expect(boss.stunT).toBeCloseTo(REEL.stun, 1);
  expect(boss.x).toBeCloseTo(x0, 1);
  boss.stunT = 0;
  reel(w, boss);
  expect(boss.stunT).toBe(0);
});

test('시체 폭발·벼림·칼의 여운이 붙는다', () => {
  const b = make(['Hm.mm'], 1, { burst: 1 });
  b.entities[1].hp = 1;
  for (const e of b.entities.slice(2)) Object.assign(e, { hp: 13, maxHp: 45 });
  step(b, [east(b)]);
  step(b, [east(b)]);
  expect(b.entities.slice(1).every((e) => e.state === 'dead')).toBe(true);
  const t = make(['Hm...']);
  t.edge = { kind: 'flame', left: 6, t: 6 };
  step(t, [east(t)]);
  step(t, [east(t)]);
  expect(t.edge.left).toBe(5);
  const e = make(['Hm...'], 1, { echo: 1 });
  e.echo = ECHO.need;
  step(e, [east(e)]);
  step(e, [east(e)]);
  expect(e.cuts).toHaveLength(1);
  expect(e.cuts[0].segs).toHaveLength(1);
});
