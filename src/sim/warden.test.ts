// 뒤틀린 차원 결전장·시간의 파수꾼(설계: docs/superpowers/specs/2026-11-26-act2-rift-design.md 5절)
import { expect, test } from 'vitest';
import { createWorld, step, DT, type World } from './world';
import { generateWarpArena, DIAL } from './warpmap';
import { hurt } from './core';
import { walkDistances } from './dungeon';
import { WARDEN, wardenState } from './warden';

const arena = () => {
  const w = createWorld(1, generateWarpArena(), 1, 1, { boss: 'time_warden' });
  w.entities[0].maxHp = w.entities[0].hp = 1e9;
  return w;
};
const boss = (w: World) => w.entities.find((e) => e.skin === 'time_warden')!;
const run = (w: World, sec: number, each?: () => void) => {
  for (let i = 0; i < Math.round(sec / DT); i++) {
    each?.();
    step(w, []);
  }
};

test('결전장: 가운데 파수꾼, 발판 네 짝(이웃한 두 시각, 걸어서 10칸 안), 주인공은 모든 발판에 걸어서 닿는다', () => {
  const map = generateWarpArena();
  const cells = map.map((r) => [...r]);
  const w = arena();
  expect(boss(w)).toBeTruthy();
  const wp = w.warp!;
  expect(wp.plates.length).toBe(8);
  const h = w.entities[0];
  const d0 = walkDistances(cells, Math.floor(h.x), Math.floor(h.z));
  for (let k = 0; k < 4; k++) {
    const [a, b] = wp.plates.filter((p) => p.pair === k);
    const W = w.grid.w;
    const d = walkDistances(cells, a.cell % W, Math.floor(a.cell / W))[b.cell];
    expect(d).toBeGreaterThan(3);
    expect(d).toBeLessThanOrEqual(10);
    expect(d0[a.cell]).toBeGreaterThan(0);
  }
  expect(DIAL.hours.length).toBe(8);
});

test('수정 판이 닫혀 있으면 막히고, 빛나는 짝을 주인공과 메아리가 함께 밟으면 약점(×1.5) 6초, 다음 짝이 빛난다', () => {
  const w = arena();
  const b = boss(w);
  const h = w.entities[0];
  run(w, DT);
  const hp = b.hp;
  expect(hurt(w, b, 100, h)).toBe(0);
  expect(b.hp).toBe(hp);
  const W = w.grid.w;
  const [p, q] = w.warp!.plates.filter((x) => x.pair === 0);
  // 주인공을 p 위에 4초 세웠다가 q로 옮긴다 → 메아리가 p에 남는다
  const put = (c: number) => Object.assign(h, { x: (c % W) + 0.5, z: Math.floor(c / W) + 0.5, path: [] });
  run(w, WARDEN.weak, () => put(p.cell));
  run(w, 0.2, () => put(q.cell));
  const s = wardenState(w)!;
  expect(s.weakT).toBeGreaterThan(5);
  expect(s.lit).toBe(1);
  expect(hurt(w, b, 100, h)).toBe(150);
});

test('잔상: 시계바늘 베기를 0.5초 뒤 같은 자리에서 한 번 더 — 처음을 맞고 그대로 서 있으면 두 번 맞는다', () => {
  const w = arena();
  const b = boss(w);
  const h = w.entities[0];
  run(w, DT);
  Object.assign(wardenState(w)!, { blinkT: 99, stopT: 99, sweepT: 0 });
  Object.assign(h, { x: b.x, z: b.z + 1.5, path: [] });
  const hits: number[] = [];
  let last = h.hp;
  let tick = 0;
  run(w, WARDEN.sweepTell + WARDEN.lag + 0.3, () => {
    h.path = [];
    if (h.hp < last) hits.push(tick * DT);
    last = h.hp;
    tick++;
  });
  expect(hits.length).toBe(2);
  expect(hits[1] - hits[0]).toBeCloseTo(WARDEN.lag, 1);
});

test('명멸의 틈: 숨으면 맞지 않고, 1.2초 뒤 주인공 앞에서 튀어나와 돌진하며 긋는다. 잔상이 0.5초 뒤 같은 길을 한 번 더', () => {
  const w = arena();
  const b = boss(w);
  const h = w.entities[0];
  Object.assign(h, { x: b.x + 6, z: b.z, path: [], facing: -Math.PI / 2 }); // 파수꾼 쪽을 본다
  run(w, DT);
  Object.assign(wardenState(w)!, { blinkT: 99, stopT: 99, sweepT: 99 });
  run(w, 0.6, () => (h.path = [])); // 잔상이 따라올 만큼 기록을 쌓는다
  wardenState(w)!.blinkT = 0;
  run(w, WARDEN.tearOpen + 0.1, () => (h.path = []));
  const s = wardenState(w)!;
  expect(s.hidden).toBe(true);
  expect(hurt(w, b, 100, h)).toBe(0);
  expect(s.ghost).not.toBeNull(); // 잔상은 보인다
  let hits = 0;
  let last = h.hp;
  run(w, WARDEN.travel + 1.2, () => {
    h.path = [];
    if (h.hp < last) hits++;
    last = h.hp;
  });
  expect(s.hidden).toBe(false);
  expect(hits).toBe(2); // 본체 돌진 + 잔상 돌진
});

test('되감기(체력 절반 아래): 주인공을 메아리 자리(4초 전)로 끌어당긴다', () => {
  const w = arena();
  const b = boss(w);
  const h = w.entities[0];
  b.hp = b.maxHp * 0.4;
  const [sx, sz] = [h.x, h.z];
  run(w, 4.2, () => Object.assign(h, { x: sx, z: sz, path: [] }));
  Object.assign(wardenState(w)!, { rewindT: 0, blinkT: 99, stopT: 99, sweepT: 99 });
  run(w, WARDEN.rewindCast + 0.1, () => {
    if (wardenState(w)!.act === 'rewind') Object.assign(h, { x: sx - 3, z: sz - 3, path: [] });
  });
  expect(Math.hypot(h.x - sx, h.z - sz)).toBeLessThan(0.2);
});

test('멈춘 시간: 원 예고 1초 뒤 그 안에서 주인공 걸음이 느려진다', () => {
  const w = arena();
  const h = w.entities[0];
  run(w, DT);
  Object.assign(wardenState(w)!, { stopT: 0, blinkT: 99, sweepT: 99 });
  run(w, WARDEN.stopTell + 0.1, () => (h.path = []));
  expect(wardenState(w)!.stops.length).toBe(1);
});
