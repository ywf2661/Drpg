import { expect, test } from 'vitest';
import { generateFloor, walkDistances } from './dungeon';
import { createWorld, DT, LANDS, step } from './world';
import { hurt } from './core';
import { touchChest } from './gimmicks';
import { ALL_RELICS, ARENA, generateArena, missAfter, relicCount, relicDue, relicRoll, SANCTUM } from './sanctum';

// 회차 c마다 네 보스를 처음 깬다고 치고 성물을 모은다. 돌려주는 값 = 넷이 다 모인 회차(0부터)
function collect(salt: number) {
  let [relics, miss] = [0, [0, 0, 0, 0]];
  for (let c = 0; c < 10; c++) {
    for (let k = 0; k < 4; k++) {
      const got = relicDue(relics, miss, k, c, salt);
      if (got) relics |= 1 << k;
      miss = missAfter(miss, k, got);
    }
    if (relics === ALL_RELICS) return c;
  }
  return 99;
}

test('성물은 늦어도 3회차에 다 모이고, 1·2회차 안에 다 모이는 판도 있다', () => {
  const at = Array.from({ length: 400 }, (_, i) => collect(i * 7919 + 13));
  expect(Math.max(...at)).toBe(2);
  const by2 = at.filter((c) => c <= 1).length / at.length;
  expect(by2).toBeGreaterThan(0.2); // 이론값 32%
  expect(by2).toBeLessThan(0.45);
});

test('이미 가진 성물은 다시 안 떨어지고, 두 번 놓치면 확정', () => {
  expect(relicDue(0b0001, [0, 0, 0, 0], 0, 0, 1)).toBe(false);
  expect(relicDue(0, [SANCTUM.pity, 0, 0, 0], 0, 5, 1)).toBe(true);
  expect(relicDue(0, [0, 0, 0, 0], -1, 0, 1)).toBe(false); // 이야기 지역이 아니면(성소 자체) 없음
});

test('같은 회차·지역·이름이면 굴림이 같다(죽고 다시 들어가도 다시 굴리지 못한다)', () => {
  expect(relicRoll(1, 2, 42)).toBe(relicRoll(1, 2, 42));
  expect(relicRoll(1, 2, 42)).not.toBe(relicRoll(2, 2, 42));
});

test('놓친 횟수는 그 지역만, pity에서 멈춘다. 얻었으면 그대로', () => {
  expect(missAfter([0, 1, 0, 0], 1, false)).toEqual([0, 2, 0, 0]);
  expect(missAfter([0, 2, 0, 0], 1, false)).toEqual([0, 2, 0, 0]);
  expect(missAfter([0, 1, 0, 0], 1, true)).toEqual([0, 1, 0, 0]);
  expect(relicCount(0b1011)).toBe(3);
});

test('결전장: 성소 넷·성기사·주인공이 있고 주인공에서 다 걸어서 닿는다', () => {
  const map = generateArena();
  expect(map.length).toBe(ARENA.size);
  const count = (c: string) => map.join('').split(c).length - 1;
  expect([count('$'), count('M'), count('H')]).toEqual([4, 1, 1]);
  const cells = map.map((r) => r.split(''));
  const d = walkDistances(cells, ARENA.hero[0], ARENA.hero[1]);
  const near = ([x, z]: number[]) => Math.max(...[[1, 0], [-1, 0], [0, 1], [0, -1]].map(([a, b]) => d[(z + b) * ARENA.size + x + a]));
  for (const p of [...ARENA.altars, ARENA.center]) expect(near(p)).toBeGreaterThan(0); // 성소는 막는 칸이라 이웃 칸
});

// 결전장 world: 성기사는 기절시켜 세워 두고(주인공을 때리지 않게), 주인공은 성소 곁에 둔다
function arena() {
  const w = createWorld(7, generateArena(), 1, 1, LANDS.sanctum.skins);
  w.land = 'sanctum';
  const boss = w.entities.find((e) => e.kind === 'boss')!;
  boss.stunT = 1e9;
  const altars = w.chests.filter((c) => c.kind === 'altar');
  const hero = w.entities[0];
  const stand = (c: (typeof altars)[0]) => Object.assign(hero, { x: c.x + 0.5, z: c.z + 1.6, path: [], state: 'idle' as const });
  const run = (sec: number) => { for (let i = 0; i < Math.round(sec / DT); i++) step(w, []); };
  return { w, boss, altars, hero, stand, run };
}

test('성소가 켜져 있으면 성기사는 무적, 넷 다 끄면 창 동안 맞는다', () => {
  const { w, boss, altars, stand, run } = arena();
  expect(boss.skin).toBe('fallen_paladin');
  expect(altars.length).toBe(4);
  expect(hurt(w, boss, 100, w.entities[0])).toBe(0);
  for (const c of altars) {
    stand(c);
    w.offer = { id: c.id, t: 0 };
    run(SANCTUM.offer + 0.1);
    expect(c.open).toBe(true);
  }
  expect(w.bareT).toBeGreaterThan(0);
  expect(hurt(w, boss, 100, w.entities[0])).toBeGreaterThan(0);
  run(SANCTUM.window + 0.1);
  expect(altars.filter((c) => !c.open).length).toBe(SANCTUM.relight); // 창이 끝나면 둘이 다시 켜진다
  expect(hurt(w, boss, 100, w.entities[0])).toBe(0);
});

test('바치는 도중 움직이거나 맞으면 끊긴다', () => {
  const { w, altars, hero, stand, run } = arena();
  stand(altars[0]);
  w.offer = { id: altars[0].id, t: 0 };
  run(0.5);
  hero.hp -= 5;
  run(0.2);
  expect(w.offer).toBe(null);
  expect(altars[0].open).toBe(false);
  w.offer = { id: altars[0].id, t: 0 };
  hero.path = [[24, 30]];
  hero.state = 'move';
  run(0.1);
  expect(w.offer).toBe(null);
});

test('체력 절반 아래에서 해골 기사 왕 둘이 일어나 곁의 성소를 지킨다', () => {
  const { w, boss, altars, run } = arena();
  boss.hp = Math.floor(boss.maxHp / 2);
  run(0.1);
  const knights = w.entities.filter((e) => e.kind === 'king' && e.state !== 'dead');
  expect(knights.length).toBe(SANCTUM.knights);
  expect(knights.every((k) => k.skin === 'bone_knight')).toBe(true);
  const guarded = altars.find((c) => knights.some((k) => Math.hypot(k.x - c.x - 0.5, k.z - c.z - 0.5) <= SANCTUM.guard))!;
  expect(touchChest(w, guarded)).toBe(true);
  expect(w.offer).toBe(null); // 지키는 기사가 있으면 바치기를 시작하지 않는다
});

test('지역 보스가 성물을 떨구고, 주우면 relics·relicGot', () => {
  const w = createWorld(3, generateFloor(3, 5), 1, 1, LANDS.ruins.skins);
  w.relicDrop = 3;
  const boss = w.entities.find((e) => e.kind === 'boss')!;
  hurt(w, boss, 1e9, w.entities[0]);
  const relic = w.items.find((it) => it.kind === 'relic')!;
  expect(relic.relic).toBe(3);
  Object.assign(w.entities[0], { x: relic.x, z: relic.z });
  step(w, []);
  expect(w.relics).toBe(0b1000);
  expect(w.relicGot).toBe(3);
});
