// 뱃사공 결전(설계: docs/superpowers/specs/2026-11-26-ferryman-rework-design.md): 바퀴로 호수를 비워 딜 타이밍을 만든다
import { expect, test } from 'vitest';
import { createWorld, step, type World } from './world';
import { generateLakeArena } from './wilds';
import { FERRYMAN } from './ferryman';
import { touchChest } from './gimmicks';
import { probe } from './bot';

const arena = () => {
  const w = createWorld(1, generateLakeArena(), 1, 1, { boss: 'plague_ferryman', minion: 'plague_villager' });
  w.land = 'lake';
  const hero = w.entities[0];
  hero.maxHp = hero.hp = 1e9;
  step(w, []);
  return w;
};
const boss = (w: World) => w.entities.find((e) => e.kind === 'boss')!;
const run = (w: World, sec: number) => {
  for (let i = 0; i < sec * 60; i++) step(w, []);
};
const wheels = (w: World) => w.chests.filter((c) => c.kind === 'wheel');
const cell = (w: World, x: number, z: number) => w.grid.blocked[Math.floor(z) * w.grid.w + Math.floor(x)];

test('뱃사공은 호수 가운데 배 위에 있고, 나루마다 바퀴(넷), 물이 찼을 때 운석을 주인공에게 떨어뜨린다', () => {
  const w = arena();
  const b = boss(w);
  expect([b.x, b.z]).toEqual([FERRYMAN.center, FERRYMAN.center]);
  expect(wheels(w)).toHaveLength(4);
  for (const c of wheels(w)) expect(cell(w, c.x + 0.5, c.z + 0.5)).toBe(1); // 바퀴는 막는다
  expect(w.fm!.phase).toBe('full');
  let fell = false;
  for (let i = 0; i < 60 * 6; i++) {
    step(w, []);
    if (w.zones.some((z) => z.kind === 'plague')) fell = true;
  }
  expect(fell).toBe(true);
  expect([b.x, b.z]).toEqual([FERRYMAN.center, FERRYMAN.center]); // 움직이지 않는다
});

test('바퀴를 돌리면 물이 배 한 칸만큼 남을 때까지 빠지고(바닥을 걷는다), 마을 사람이 기어 나오고, 돌린 바퀴는 부서진다', () => {
  const w = arena();
  const C = FERRYMAN.center;
  expect(cell(w, C + 5.5, C + 0.5)).toBe(2); // 물
  const n0 = w.entities.length;
  touchChest(w, wheels(w)[0]);
  expect(w.fm!.phase).toBe('drain');
  touchChest(w, wheels(w)[1]); // 빠지는 동안 다른 바퀴는 안 돈다
  run(w, FERRYMAN.drain + 0.2);
  expect(w.fm!.phase).toBe('dry');
  expect(w.fm!.r).toBeCloseTo(FERRYMAN.low);
  expect(cell(w, C + 5.5, C + 0.5)).toBe(0); // 마른 바닥
  expect(cell(w, C - 0.5, C - 0.5)).toBe(0); // 배가 바닥에 얹혀 곁까지 걸어간다(남은 물은 그림으로만)
  expect(w.entities.slice(n0).filter((e) => e.skin === 'plague_villager').length).toBeGreaterThanOrEqual(FERRYMAN.crawl);
  expect(w.fm!.wheels.filter((k) => k > 0)).toHaveLength(1);
});

test('딜 타이밍엔 배 곁에서 근접으로 친다, 물은 가운데부터 차올라 주인공을 밀어내고(피해 없음) 잡몹은 빠져 죽는다', () => {
  const w = arena();
  const [hero, b] = [w.entities[0], boss(w)];
  const C = FERRYMAN.center;
  touchChest(w, wheels(w)[0]);
  run(w, FERRYMAN.drain + 0.2);
  Object.assign(hero, { x: C + 1.1, z: C + 0.2, path: [] });
  step(w, [{ type: 'attack', targetId: b.id }]);
  const hp = b.hp;
  run(w, 2);
  expect(b.hp).toBeLessThan(hp);
  run(w, FERRYMAN.dry);
  expect(w.fm!.phase).toBe('fill');
  const villagers = w.entities.filter((e) => e.skin === 'plague_villager' && e.state !== 'dead');
  Object.assign(hero, { x: C + 3.2, z: C + 0.5, path: [], target: null });
  run(w, FERRYMAN.fill + 0.5);
  expect(w.fm!.phase).toBe('full');
  expect(Math.hypot(hero.x - C, hero.z - C)).toBeGreaterThan(FERRYMAN.full - 0.5); // 밀려났다
  expect(cell(w, hero.x, hero.z)).not.toBe(2);
  for (const v of villagers) if (Math.hypot(v.x - C, v.z - C) < FERRYMAN.full - 1) expect(v.state).toBe('dead');
});

test('바퀴는 돌고 돈다: 넷을 다 쓰고 물이 다 차면 가장 오래된 바퀴가 고쳐진다(막히지 않는다)', () => {
  const w = arena();
  const cycle = (k: number) => {
    touchChest(w, wheels(w)[k]);
    run(w, FERRYMAN.drain + FERRYMAN.dry + FERRYMAN.fill + 1);
  };
  for (let k = 0; k < 4; k++) cycle(k);
  expect(w.fm!.wheels[0]).toBe(0); // 처음 돌린 바퀴가 고쳐졌다
  expect(w.fm!.wheels.slice(1).every((k) => k > 0)).toBe(true);
  touchChest(w, wheels(w)[2]); // 부서진 바퀴는 안 돈다
  expect(w.fm!.phase).toBe('full');
  touchChest(w, wheels(w)[0]);
  expect(w.fm!.phase).toBe('drain');
});

test('봇(궁수·레벨 50·4단계 옵션 없음)이 바퀴를 돌려 딜 타이밍에 뱃사공을 잡는다: 3판 중 하나 이상, 나머지도 크게 깎는다', { timeout: 300_000 }, () => {
  const rs = [0, 1, 2].map((i) => probe(2000 + i * 31, 'ranger', 'lake', 5, 1, 300));
  expect(rs.some((r) => r.boss <= 0)).toBe(true); // 지금 2판(79초·71초)
  expect(rs.every((r) => r.boss < 0.7)).toBe(true);
});
