import { expect, test } from 'vitest';
import { deathGold } from '../shop';
import { createWorld, DT, step, type World } from './world';

const run = (w: World, sec: number) => {
  for (let i = Math.round(sec / DT); i > 0; i--) step(w, []);
};

test('물약: 4초에 걸쳐 최대 체력의 50%, 차는 동안은 다시 못 마신다', () => {
  const w = createWorld(1, ['H..']);
  const hero = w.entities[0];
  hero.hp = 20;
  w.potions = 3;
  step(w, [{ type: 'drink' }]);
  expect(w.potions).toBe(2);
  expect(hero.hp).toBeLessThan(22); // 바로 차지 않는다
  step(w, [{ type: 'drink' }]);
  expect(w.potions).toBe(2); // 차는 중
  run(w, 2);
  expect(hero.hp).toBeGreaterThanOrEqual(44);
  expect(hero.hp).toBeLessThanOrEqual(46);
  run(w, 2.1);
  expect(hero.hp).toBe(70); // 합계는 정확히 50
  expect(w.healing).toBeNull();
  step(w, [{ type: 'drink' }]);
  expect(w.potions).toBe(1); // 다 찼으면 다시 마실 수 있다
});

test('죽으면 금화 절반(내림)', () => {
  expect([0, 1, 101].map(deathGold)).toEqual([0, 0, 50]);
});

// 전사가 대기 없이 바로 내려찍게 한 전투. 주인공은 천옷(피해 감소 없음)
const slamWorld = (map = 'Hw....') => {
  const w = createWorld(3, [map]);
  w.entities[1].cd = 0;
  step(w, []); // 주인공을 대상으로 잡고
  step(w, []); // 예고 시작
  return w;
};

test('전사 내려찍기: 0.8초 예고 뒤 앞쪽 원 안의 주인공에게 평타의 2배', () => {
  const w = slamWorld();
  const [hero, war] = w.entities;
  expect(war.phase).toBe('windup');
  expect(w.zones).toHaveLength(1);
  const z = w.zones[0];
  expect(Math.hypot(z.x - hero.x, z.z - hero.z)).toBeLessThan(z.r); // 주인공이 원 안
  expect(z.owner).toBe(1);
  run(w, 0.7);
  expect(hero.hp).toBe(100); // 예고 중엔 안 맞는다
  run(w, 0.15);
  expect(100 - hero.hp).toBeGreaterThanOrEqual(12); // 전사 6–9 × 2
  expect(100 - hero.hp).toBeLessThanOrEqual(18);
  expect(w.zones).toHaveLength(0);
  expect(war.phase).toBe('none');
  expect(w.blasts.some((b) => b.kind === 'slam')).toBe(true);
  expect(war.cd).toBeGreaterThan(5); // 재사용 6초
});

test('내려찍기는 원 밖으로 나가면 안 맞는다', () => {
  const w = slamWorld();
  const hero = w.entities[0];
  hero.x = 4.5;
  hero.hp = hero.maxHp = 1000;
  run(w, 0.85);
  expect(w.zones).toHaveLength(0);
  expect(hero.hp).toBe(1000);
});

test('내려찍기 예고는 스킬 밀어내기·함성으로 끊긴다', () => {
  for (const cmd of [{ type: 'throw', x: 5, z: 0.5 }, { type: 'shout' }] as const) {
    const w = slamWorld('H.w...');
    const war = w.entities[1];
    war.hp = war.maxHp = 1000;
    // 사거리 밖이라 아직 예고가 아니다 → 붙여서 예고를 시작시킨다
    war.x = 1.5;
    step(w, []);
    expect(war.phase).toBe('windup');
    step(w, [cmd]);
    run(w, 0.3); // 도끼가 날아가 맞을 시간
    expect(war.phase).toBe('none');
    expect(w.zones).toHaveLength(0);
    run(w, 0.6); // 원래 떨어졌을 시각을 지나도 내려찍기는 없다
    expect(w.blasts.some((b) => b.kind === 'slam')).toBe(false);
  }
});

test('마법사 불기둥: 주인공 발밑에 1.2초 뒤 폭발(평타의 1.5배), 걸어 나가면 안 맞는다', () => {
  const cast = () => {
    const w = createWorld(3, ['H.....g']);
    w.entities[1].cd = 0;
    step(w, []);
    step(w, []);
    return w;
  };
  const w = cast();
  const hero = w.entities[0];
  expect(w.zones).toHaveLength(1);
  expect([w.zones[0].x, w.zones[0].z, w.zones[0].owner]).toEqual([0.5, 0.5, -1]);
  run(w, 1.1);
  expect(hero.hp).toBe(100);
  run(w, 0.15);
  expect(100 - hero.hp).toBeGreaterThanOrEqual(8); // 마법사 5–8 × 1.5 → 8–12
  expect(100 - hero.hp).toBeLessThanOrEqual(12);
  expect(w.blasts.some((b) => b.kind === 'fire')).toBe(true);
  const away = cast();
  away.entities[0].z = 0.5;
  away.entities[0].x = 2.5;
  run(away, 1.25);
  expect(away.entities[0].hp).toBe(100);
});
