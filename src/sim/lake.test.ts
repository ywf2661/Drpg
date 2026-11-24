// 2막 ① 호숫가(설계: docs/superpowers/specs/2026-11-24-act2-lake-design.md): 물·여울·판자 칸과 맵
import { expect, test } from 'vitest';
import { clearLine } from './core';
import { createWorld, step, type World } from './world';
import { OPEN, walkDistances } from './dungeon';
import { generateLakeArena, generateWild, makeMap, WILD } from './wilds';

const count = (map: string[], ch: string) => map.join('').split('').filter((c) => ch.includes(c)).length;

const ISLE = 4;
test('호숫가 1~3구역: 같은 시드면 같은 맵, 물이 있고 물 건너 출구까지 걸어서 닿는다(길이 물을 지나면 판자 다리). 1구역은 개울·통나무집, 2구역부터 여울', { timeout: 120_000 }, () => {
  for (let seed = 1; seed <= 12; seed++)
    for (let floor = 1; floor < ISLE; floor++) {
      const map = generateWild(seed, floor, 'lake', 'w', ['lake']);
      expect(map).toEqual(generateWild(seed, floor, 'lake', 'w', ['lake']));
      expect(map.length).toBe(WILD);
      expect(count(map, 'u')).toBeGreaterThan(floor === 1 ? 150 : 400);
      if (floor > 1) expect(count(map, 'v')).toBeGreaterThan(0);
      const cells = map.map((r) => r.split(''));
      const hz = map.findIndex((r) => r.includes('H'));
      const d = walkDistances(cells, map[hz].indexOf('H'), hz);
      const exits = map.flatMap((r, z) => [...r].flatMap((c, x) => ('l!'.includes(c) ? [[x, z]] : [])));
      expect(exits.length).toBe(3);
      // 출구 칸은 맨 바깥 줄 — 바로 안쪽 칸이 닿으면 닿는 것
      for (const [x, z] of exits) expect([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => d[(z + dz) * WILD + x + dx] >= 0)).toBe(true);
      expect(count(map, '!')).toBe(0); // 아직 안 만든 구역으로 가는 출구는 막혀 있다
      for (let z = 0; z < WILD; z++) for (let x = 0; x < WILD; x++) if (OPEN(cells[z][x]) && cells[z][x] !== 'l') expect(d[z * WILD + x]).toBeGreaterThanOrEqual(0); // 갇힌 땅이 없다
    }
  expect(count(generateWild(3, 1, 'lake', 'w', ['lake']), '_')).toBeGreaterThan(0); // 개울을 건너는 다리
});

test('물: 못 걷지만 시야는 지나간다(물 건너를 쏠 수 있다). 여울은 걸을 수 있지만 느리다', () => {
  const map = ['#########', '#H.uuu.m#', '#.......#', '#########'];
  const w = createWorld(1, map);
  expect(w.grid.blocked[1 * 9 + 3]).toBe(2);
  const [hero, mob] = [w.entities[0], w.entities.find((e) => e.kind === 'minion')!];
  expect(clearLine(w, hero, mob)).toBe(true);
  // 같은 거리를 걷게 하고 나아간 거리를 잰다: 여울 줄(z=3)이 마른 줄보다 덜 간다
  const walk = (w2: World) => {
    const h = w2.entities[0];
    step(w2, [{ type: 'move', x: 7.5, z: h.z }]);
    for (let i = 0; i < 45; i++) step(w2, []);
    return h.x;
  };
  const ford = createWorld(1, ['#########', '#.......#', '#.......#', '#H.vvv..#', '#########']);
  const dry = createWorld(1, ['#########', '#.......#', '#.......#', '#H......#', '#########']);
  expect(walk(ford)).toBeLessThan(walk(dry));
});

// 나룻배 줄을 판자로 이은 맵(걸어서 + 배로 닿는 곳)
const bridged = (map: string[]) => {
  const cells = map.map((r) => r.split(''));
  for (const f of createWorld(1, map).ferries) {
    const [[ax, az], [bx, bz]] = [f.a, f.b].map(([x, z]) => [Math.floor(x), Math.floor(z)]);
    for (let x = Math.min(ax, bx); x <= Math.max(ax, bx); x++) for (let z = Math.min(az, bz); z <= Math.max(az, bz); z++) cells[z][x] = '_';
  }
  return cells;
};

test('호숫가 4구역(섬 나루): 섬끼리는 다리 없이 나룻배 줄로만 잇고(6~12m), 배로 이으면 모든 땅과 출구에 닿는다', { timeout: 120_000 }, () => {
  for (let seed = 1; seed <= 12; seed++)
    for (const from of ['w', 'n', 'e', 's'] as const) {
      const map = generateWild(seed, ISLE, 'lake', from, ['lake']);
      expect(map).toEqual(generateWild(seed, ISLE, 'lake', from, ['lake']));
      const w = createWorld(1, map);
      expect(w.ferries.length).toBeGreaterThanOrEqual(2); // 줄 둘(시작 섬 → 가운데 섬 → 출구 섬) + 곁가지 섬(마지막 곁가지는 모래톱)
      expect(count(map, '7')).toBeGreaterThan(0);
      expect(count(map, '8')).toBe(1);
      for (const f of w.ferries) {
        expect(Math.hypot(f.a[0] - f.b[0], f.a[1] - f.b[1])).toBeGreaterThanOrEqual(6);
        expect(Math.hypot(f.a[0] - f.b[0], f.a[1] - f.b[1])).toBeLessThanOrEqual(12);
        for (const [x, z] of f.docks) expect(map[z][x]).toBe('_');
      }
      const hz = map.findIndex((r) => r.includes('H'));
      const hx = map[hz].indexOf('H');
      expect(walkDistances(map.map((r) => r.split('')), hx, hz).filter((d) => d >= 0).length).toBeLessThan(400); // 걸어서는 시작 섬뿐
      const cells = bridged(map);
      const d = walkDistances(cells, hx, hz);
      const exits = map.flatMap((r, z) => [...r].flatMap((c, x) => (c === 'l' ? [[x, z]] : [])));
      expect(exits.length).toBe(3); // 결전장으로
      for (const [x, z] of exits) expect([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => d[(z + dz) * WILD + x + dx] >= 0)).toBe(true);
      for (let z = 0; z < WILD; z++) for (let x = 0; x < WILD; x++) if (OPEN(cells[z][x]) && cells[z][x] !== 'l') expect(d[z * WILD + x]).toBeGreaterThanOrEqual(0);
    }
});

test('나룻배: 나루 끝에 서면 타고, 이동 명령은 안 먹고, 건너편 나루에 내린다. 절반쯤에 마을 사람이 기어오른다. 내린 나루에서는 바로 다시 타지 않는다', () => {
  //                나루·배 … 배·나루
  const map = ['##############', '#H.._fuuuuuf_#', '##############'];
  const w = createWorld(1, map);
  expect(w.ferries).toHaveLength(1);
  const hero = w.entities[0];
  step(w, [{ type: 'move', x: 4.5, z: 1.5 }]);
  for (let i = 0; i < 60 && !w.ride; i++) step(w, []);
  expect(w.ride).not.toBeNull();
  const before = w.entities.length;
  step(w, [{ type: 'move', x: 1.5, z: 1.5 }]); // 배 위에서는 못 걷는다
  expect(w.ride).not.toBeNull();
  for (let i = 0; i < 200 && w.ride; i++) step(w, []);
  expect(w.ride).toBeNull();
  expect([Math.floor(hero.x), Math.floor(hero.z)]).toEqual([12, 1]);
  expect(w.entities.length).toBeGreaterThan(before); // 기어오른 마을 사람
  for (let i = 0; i < 30; i++) step(w, []);
  expect(w.ride).toBeNull(); // 내린 자리에 그대로 서 있으면 다시 타지 않는다
  step(w, [{ type: 'move', x: 11.5, z: 1.5 }]); // 곁의 배를 누르면 되돌아 탄다
  for (let i = 0; i < 10 && !w.ride; i++) step(w, []);
  expect(w.ride?.from).toBe(1);
});

test('수문 퍼즐: 바퀴를 누르면 검은 물이 다른 물길로 가고(빠진 물길은 걸을 수 있다), 더러운 우물에서는 마을 사람이 나오고, 늪 구덩이가 차면 정화(물약·장비, 앓는 주민이 낫는다)', () => {
  const w = createWorld(1, ['############', '#H.........#', '#0111119...#', '#2.5.....p.#', '#2.........#', '############']);
  const at = (x: number, z: number) => w.grid.blocked[z * 12 + x];
  expect(at(4, 2)).toBe(2); // 처음엔 물길 1(우물 쪽)에 물
  expect(at(1, 4)).toBe(0); // 물길 2(늪)는 빠져 있다
  step(w, []);
  expect(w.sluice!.wells[0].dirty).toBe(true);
  expect(w.entities.some((e) => e.summoner === -10)).toBe(true); // 우물에서 기어 나왔다
  const wheel = w.chests.find((c) => c.kind === 'wheel')!;
  step(w, [{ type: 'open', chestId: wheel.id }]);
  for (let i = 0; i < 900 && w.sluice!.gates[0].to === 0; i++) step(w, []);
  expect(w.sluice!.gates[0].to).toBe(1);
  for (let i = 0; i < 30; i++) step(w, []);
  expect(at(4, 2)).toBe(0);
  expect(at(1, 4)).toBe(2);
  expect(w.sluice!.purified).toBe(true);
  expect(w.chests.find((c) => c.kind === 'sick')!.open).toBe(true);
  expect(w.items.some((i) => i.kind === 'potion')).toBe(true);
});

test('결전장: 호숫가 5구역은 늘 같은 손 맵(가운데 호수, 나루 넷, 주인공은 남쪽 땅, 뱃사공 하나). 땅 고리는 한 덩어리', () => {
  const map = makeMap(1, 5, 'lake');
  expect(map).toEqual(generateLakeArena());
  expect(map).toEqual(makeMap(99, 5, 'lake'));
  const w = createWorld(1, map, 1, 1, { boss: 'plague_ferryman' });
  expect(w.entities.filter((e) => e.kind === 'boss')).toHaveLength(1);
  const cells = map.map((r) => r.split(''));
  const hz = map.findIndex((r) => r.includes('H'));
  const d = walkDistances(cells, map[hz].indexOf('H'), hz);
  for (let z = 0; z < map.length; z++) for (let x = 0; x < map.length; x++) if (OPEN(cells[z][x])) expect(d[z * map.length + x]).toBeGreaterThanOrEqual(0);
});

test('뱃사공: 물 위를 돌며 등불을 던지고(근접은 못 닿는다), 때가 되면 주인공 가까운 나루에 내려 싸우고, 다시 배에 오른다', () => {
  const w = createWorld(1, generateLakeArena(), 1, 1, { boss: 'plague_ferryman' });
  const [hero, boss] = [w.entities[0], w.entities.find((e) => e.kind === 'boss')!];
  hero.maxHp = hero.hp = 1e9;
  let threw = false, docked = false, reboard = false;
  for (let i = 0; i < 60 * 40; i++) {
    step(w, []);
    if (w.fm?.mode === 'water' && w.zones.length) threw = true;
    if (w.fm?.mode === 'water') expect(w.grid.blocked[Math.floor(boss.z) * 48 + Math.floor(boss.x)]).toBe(2); // 물 위
    if (w.fm?.mode === 'dock') docked = true;
    if (docked && w.fm?.mode === 'water') reboard = true;
  }
  expect(threw).toBe(true);
  expect(docked).toBe(true);
  expect(reboard).toBe(true);
});
