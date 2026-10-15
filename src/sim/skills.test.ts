import { expect, test } from 'vitest';
import { walkable } from './path';
import { createWorld, DT, step, type World } from './world';

const run = (w: World, ticks: number) => {
  for (let i = 0; i < ticks; i++) step(w, []);
};

test('전투의 함성: 4m 안의 적을 2초 기절(먼 적은 그대로), 6초간 받는 피해 −30%, 재사용 15초', () => {
  const w = createWorld(1, ['H.m......m']);
  const [hero, near, far] = w.entities;
  step(w, [{ type: 'shout' }]);
  expect(near.stunT).toBeCloseTo(2 - DT, 5);
  expect(far.stunT).toBe(0);
  expect(w.shoutT).toBeGreaterThan(5.9);
  const x0 = near.x;
  run(w, Math.round(1.5 / DT));
  expect(near.x).toBe(x0); // 기절 중엔 움직이지 않는다
  expect(hero.hp).toBe(100); // 공격도 못 한다
  step(w, [{ type: 'shout' }]);
  expect(w.shoutCd).toBeGreaterThan(13); // 대기 중이라 다시 안 됨
  // 피해 감소: 같은 시드의 같은 전투에서 함성이 있으면 덜 맞는다
  const taken = (shout: boolean) => {
    const t = createWorld(9, ['Hw']);
    t.entities[0].hp = t.entities[0].maxHp = 1e6;
    t.shoutT = shout ? 1e9 : 0;
    run(t, 1200);
    return 1e6 - t.entities[0].hp;
  };
  expect(taken(true)).toBeLessThan(taken(false) * 0.8);
});

test('함성은 진행 중인 보스 돌진·예고도 끊는다', () => {
  const w = createWorld(1, ['H...M']);
  step(w, []);
  expect(w.entities[1].phase).toBe('windup');
  step(w, [{ type: 'shout' }]);
  expect(w.entities[1].phase).toBe('none');
});

test('도끼 던지기: 조준 방향으로 날아가 처음 닿는 적에게 120%, 벽에 막히고, 주인공에겐 안 맞는다, 재사용 2.5초', () => {
  const w = createWorld(1, ['H....m.m']);
  const [hero, first, second] = w.entities;
  for (const e of [first, second]) Object.assign(e, { hp: 1000, maxHp: 1000, target: 0, repathT: 1e9 });
  w.gear.weapon = 1; // 단검 4–7 × 1.2 → 5–8
  step(w, [{ type: 'throw', x: 9, z: 0.5 }]);
  expect(w.shots.some((s) => s.kind === 'axe')).toBe(true);
  run(w, 60);
  expect(1000 - first.hp).toBeGreaterThanOrEqual(5);
  expect(1000 - first.hp).toBeLessThanOrEqual(8);
  expect(second.hp).toBe(1000); // 처음 닿은 적에서 멈춘다
  expect(hero.hp).toBe(100);
  step(w, [{ type: 'throw', x: 9, z: 0.5 }]);
  expect(w.shots.some((s) => s.kind === 'axe')).toBe(false); // 아직 대기
  run(w, Math.round(2.5 / DT));
  step(w, [{ type: 'throw', x: 9, z: 0.5 }]);
  expect(w.shots.some((s) => s.kind === 'axe')).toBe(true);
  const wall = createWorld(1, ['H.#m']);
  wall.entities[1].hp = 1000;
  step(wall, [{ type: 'throw', x: 4, z: 0.5 }]);
  run(wall, 60);
  expect(wall.entities[1].hp).toBe(1000);
  expect(walkable(wall.grid, 2, 0)).toBe(false);
});
