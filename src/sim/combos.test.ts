import { expect, test } from 'vitest';
import { createWorld, DT, step, type Command, type World } from './world';

const run = (w: World, sec: number) => {
  for (let i = Math.round(sec / DT); i > 0; i--) step(w, []);
};
// 적 하나(체력 큼)에게 스킬 한 번을 쓰고 준 피해. prep: 쓰기 전에 world를 손본다
const dealt = (cmd: Command, prep: (w: World) => void = () => {}, map = 'Hm....') => {
  const w = createWorld(1, [map]);
  const m = w.entities[1];
  Object.assign(m, { hp: 1e5, maxHp: 1e5, stunT: 1e9 });
  w.gear.weapon = 1;
  prep(w);
  step(w, [cmd]);
  run(w, 1);
  return { dmg: 1e5 - m.hp, w };
};
const kinds = (w: World) => w.combos.map((c) => c.kind);
const AXE: Command = { type: 'throw', x: 5, z: 0.5 };
const CLEAVE: Command = { type: 'skill', x: 5, z: 0.5 };

test('받아치기: 예고 중인 적을 스킬로 맞히면 피해 2배', () => {
  // 같은 시드 → 같은 굴림. 준비 동작이 없는 궁수(배율 없음)와 예고 중인 적을 비교
  const base = dealt(AXE, (w) => (w.entities[1].stunT = 0), 'Ha....').dmg;
  let seen: string[] = [];
  const w = createWorld(1, ['Hm....']);
  const m = w.entities[1];
  Object.assign(m, { hp: 1e5, maxHp: 1e5, phase: 'windup', phaseT: 1e9 });
  w.gear.weapon = 1;
  step(w, [AXE]);
  for (let i = 0; i < 30; i++) {
    step(w, []);
    seen = [...seen, ...kinds(w)];
  }
  expect(1e5 - m.hp).toBe(base * 2);
  expect(seen).toContain('counter');
});

test('약점: 기절한 적에게 스킬 피해 1.5배, 평타는 그대로', () => {
  const plain = dealt(CLEAVE, (w) => (w.entities[1].stunT = 0), 'Ha....').dmg; // 궁수: 준비 동작이 없어 받아치기가 아니다
  const stunned = dealt(CLEAVE);
  expect(stunned.dmg).toBe(Math.round(plain * 1.5));
  expect(kinds(stunned.w)).toEqual([]); // 기록은 잠시 뒤 지워진다
  const basic = dealt({ type: 'attack', targetId: 1 });
  expect(basic.dmg).toBeGreaterThan(0);
  expect(basic.dmg).toBeLessThanOrEqual(7 * 2); // 단검 4–7, 1초에 많아야 두 번: 배율 없음
});

test('연속: 돌진 베기가 적을 맞히면 가르기 대기가 바로 끝난다', () => {
  const w = createWorld(1, ['H.m....']);
  w.entities[1].hp = w.entities[1].maxHp = 1e5;
  w.skillCd = 3;
  step(w, [{ type: 'dash', x: 6, z: 0.5 }]);
  let seen: string[] = [];
  for (let i = 0; i < 30; i++) {
    step(w, []);
    seen = [...seen, ...kinds(w)];
  }
  expect(w.skillCd).toBe(0);
  expect(seen).toContain('reset');
  // 아무도 못 맞히면 그대로
  const miss = createWorld(1, ['H......']);
  miss.skillCd = 3;
  step(miss, [{ type: 'dash', x: 6, z: 0.5 }]);
  run(miss, 0.5);
  expect(miss.skillCd).toBeGreaterThan(2);
});

test('가르기 5단계: 뒤쪽 적도 벤다(4단계는 앞쪽만)', () => {
  const back = (rank: number) => {
    const w = createWorld(1, ['mH....']);
    const m = w.entities[1];
    Object.assign(m, { hp: 1e5, maxHp: 1e5, stunT: 1e9 });
    w.ranks.cleave = rank;
    step(w, [CLEAVE]); // +x 쪽을 보고
    run(w, 1);
    return 1e5 - m.hp;
  };
  expect(back(4)).toBe(0);
  expect(back(5)).toBeGreaterThan(0);
});

test('돌진 베기 5단계: 돌진으로 처치하면 돌진 대기가 바로 끝난다', () => {
  const cd = (rank: number) => {
    const w = createWorld(1, ['H.m....']);
    w.entities[1].hp = 1;
    w.ranks.dash = rank;
    step(w, [{ type: 'dash', x: 6, z: 0.5 }]);
    run(w, 0.6);
    return w.dashCd;
  };
  expect(cd(4)).toBeGreaterThan(2);
  expect(cd(5)).toBe(0);
});

test('전투의 함성 5단계: 최대 체력의 15% 즉시 회복', () => {
  const heal = (rank: number) => {
    const w = createWorld(1, ['H..']);
    w.entities[0].hp = 50;
    w.ranks.shout = rank;
    step(w, [{ type: 'shout' }]);
    return w.entities[0].hp;
  };
  expect(heal(4)).toBe(50);
  expect(heal(5)).toBe(65);
});

test('도끼 던지기 5단계: 길 위의 적을 한 번씩 모두 맞힌다(4단계는 첫 적만)', () => {
  const hits = (rank: number) => {
    const w = createWorld(1, ['H.m.m...']);
    for (const m of w.entities.slice(1)) Object.assign(m, { hp: 1e5, maxHp: 1e5, stunT: 0, target: null });
    w.ranks.throw = rank;
    step(w, [{ type: 'throw', x: 7, z: 0.5 }]);
    run(w, 1);
    return w.entities.slice(1).map((m) => (m.hp < 1e5 ? 1 : 0));
  };
  expect(hits(4)).toEqual([1, 0]);
  expect(hits(5)).toEqual([1, 1]);
});
