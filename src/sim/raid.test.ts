// 2막 ② 약탈자 진지(설계: docs/superpowers/specs/2026-11-24-act2-raid-design.md): 화약통·도화선, 요새 맵, 결전장, 우두머리
import { expect, test } from 'vitest';
import { createWorld, step, type World } from './world';
import { walkDistances } from './dungeon';
import { generateRaidArena, generateTent, generateWild, makeMap, WILD } from './wilds';
import { igniteKeg } from './powder';
import { hurt } from './core';
import { walkable } from './path';

const reach = (w: World, x: number, z: number) => {
  const g = w.grid;
  const seen = new Uint8Array(g.w * g.h);
  const h = w.entities[0];
  const q = [Math.floor(h.z) * g.w + Math.floor(h.x)];
  seen[q[0]] = 1;
  for (let i = 0; i < q.length; i++) {
    const [cx, cz] = [q[i] % g.w, Math.floor(q[i] / g.w)];
    for (const [nx, nz] of [[cx + 1, cz], [cx - 1, cz], [cx, cz + 1], [cx, cz - 1]]) if (walkable(g, nx, nz) && !seen[nz * g.w + nx]) (seen[nz * g.w + nx] = 1), q.push(nz * g.w + nx);
  }
  return !!seen[z * g.w + x];
};

test('화약통: 누르면 잠시 뒤 터져 둘레 방책이 부서지고, 도화선을 따라 불꽃이 끝의 통까지 가서 터뜨린다', () => {
  //            불씨 통 → 도화선 → 방책 속 통
  const w = createWorld(1, ['##########', '#H.......#', '#.b::::..#', '#[[[[{[[[#', '#.......m#', '##########']);
  w.entities[0].maxHp = w.entities[0].hp = 1e6;
  const [starter, wall] = [w.kegs.find((k) => !k.wall)!, w.kegs.find((k) => k.wall)!];
  expect(w.grid.blocked[3 * 10 + 4]).toBe(1);
  step(w, [{ type: 'open', chestId: starter.chest }]);
  for (let i = 0; i < 300 && !wall.done; i++) step(w, []);
  expect(starter.done).toBe(true);
  expect(wall.done).toBe(true);
  expect(w.grid.blocked[3 * 10 + 4]).toBe(0); // 방책이 뚫렸다
  expect(w.powder.size).toBe(0); // 도화선은 다 탔다
});

test('약탈자 진지 1~4구역: 같은 시드면 같은 맵. 처음엔 요새가 출구를 막고, 불씨 통을 다 터뜨리면 출구에 닿는다', { timeout: 120_000 }, () => {
  for (let seed = 1; seed <= 6; seed++)
    for (let floor = 1; floor <= 4; floor++) {
      const map = generateWild(seed, floor, 'raid', 'w', ['raid']);
      expect(map).toEqual(generateWild(seed, floor, 'raid', 'w', ['raid']));
      expect(map.length).toBe(WILD);
      const w = createWorld(seed, map);
      w.entities[0].maxHp = w.entities[0].hp = 1e9;
      for (const e of w.entities.slice(1)) Object.assign(e, { state: 'dead', hp: 0, x: -50, z: -50 });
      const exit = w.exits[0];
      const inside = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dz]) => [exit.x + dx, exit.z + dz]).find(([x, z]) => walkable(w.grid, x, z))!;
      expect(reach(w, inside[0], inside[1])).toBe(false);
      expect(w.kegs.some((k) => k.wall)).toBe(true);
      if (floor > 1) expect(w.props.filter((p) => p.kind === 'tent').length).toBeGreaterThanOrEqual(2); // 요새 안 둘 + 바깥 무리의 군막
      for (const k of w.kegs) if (!k.wall) igniteKeg(w, k);
      for (let i = 0; i < 600; i++) step(w, []);
      expect(reach(w, inside[0], inside[1])).toBe(true);
    }
});

test('원정대 천막: 뱃사공을 쓰러뜨린 뒤(raid 열림)엔 동쪽에 진지 출구', () => {
  expect(generateTent().join('').includes('&')).toBe(false);
  const map = generateTent(true);
  const cells = map.map((r) => r.split(''));
  const hz = map.findIndex((r) => r.includes('H'));
  const d = walkDistances(cells, map[hz].indexOf('H'), hz);
  const exits = map.flatMap((r, z) => [...r].flatMap((c, x) => (c === '&' ? [[x, z]] : [])));
  expect(exits).toHaveLength(3);
  for (const [x, z] of exits) expect(d[z * map.length + x - 1]).toBeGreaterThanOrEqual(0);
});

test('결전장: 늘 같은 손 맵, 처음엔 통이 없고 군막에서 하나씩 굴러 나와 멈춘다. 우두머리는 기절한 동안만 맞고, 돌진하다 통을 들이받으면 기절한다', () => {
  expect(makeMap(1, 5, 'raid')).toEqual(generateRaidArena());
  const w = createWorld(1, generateRaidArena(), 1, 1, { boss: 'raider_chief' });
  const [hero, boss] = [w.entities[0], w.entities.find((e) => e.kind === 'boss')!];
  hero.maxHp = hero.hp = 1e9;
  expect(w.kegs).toHaveLength(0);
  for (let i = 0; i < 60 * 3; i++) step(w, []);
  const keg = w.kegs.find((k) => !k.lit)!;
  expect(keg).toBeDefined();
  for (let i = 0; i < 60 * 4; i++) step(w, []);
  expect(keg.roll).toBeUndefined(); // 굴러와서 멈췄다
  const hp = boss.hp;
  hurt(w, boss, 100, hero);
  expect(boss.hp).toBe(hp); // 평소엔 안 맞는다
  // 굴러 나온 미끼 통은 곁에서 다른 통이 터져도 남는다
  w.kegs.push({ x: Math.floor(keg.fx!) + 1, z: Math.floor(keg.fz!), fuse: 0.01, lit: true, wall: false, done: false, chest: -1 });
  for (let i = 0; i < 5; i++) step(w, []);
  expect(keg.done).toBe(false);
  Object.assign(hero, { x: keg.fx!, z: keg.fz! + 1.5, path: [] }); // 통 바로 뒤에서 꾀어낸다
  Object.assign(boss, { x: keg.fx!, z: keg.fz! - 0.6, phase: 'charge', phaseT: 5, dx: 0, dz: 1, stunT: 0 });
  const heroHp = hero.hp;
  step(w, []);
  expect(boss.stunT).toBeGreaterThan(0);
  for (let i = 0; i < 10; i++) step(w, []);
  expect(keg.done).toBe(true);
  expect(boss.hp).toBeLessThan(hp); // 기절한 동안 통에 다쳤다
  expect(hero.hp).toBe(heroHp); // 들이받은 통에 주인공은 안 다친다
  const hp2 = boss.hp;
  hurt(w, boss, 100, hero);
  expect(boss.hp).toBe(hp2 - 100);
});
