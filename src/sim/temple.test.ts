// 2막 ④ 사암 신전(설계: docs/superpowers/specs/2026-11-26-act2-temple-design.md): 도는 고리·햇빛·봉인, 맵 생성, 망령, 천막 남서쪽 출구
import { expect, test } from 'vitest';
import { createWorld, step, TEMPLE, DT, type World } from './world';
import { generateTent } from './wilds';
import { generateTemple, generateTempleArena } from './templemap';
import { inLight, turnRing } from './temple';
import { hurt } from './core';
import { walkable } from './path';

const calm = (w: World) => {
  w.entities[0].maxHp = w.entities[0].hp = 1e9;
  for (const e of w.entities.slice(1)) Object.assign(e, { state: 'dead', hp: 0, x: -50, z: -50 });
};
const run = (w: World, sec: number) => {
  for (let i = 0; i < sec / DT; i++) step(w, []);
};
// 고리 k를 한 번 돌리고 다 돌 때까지
const spin = (w: World, k: number) => {
  turnRing(w, k);
  run(w, TEMPLE.turn + 0.1);
};
// 주인공 칸에서 걸어서 닿는 칸
const reach = (w: World) => {
  const g = w.grid;
  const h = w.entities[0];
  const seen = new Uint8Array(g.w * g.h);
  const q = [Math.floor(h.z) * g.w + Math.floor(h.x)];
  seen[q[0]] = 1;
  for (let i = 0; i < q.length; i++) {
    const [cx, cz] = [q[i] % g.w, Math.floor(q[i] / g.w)];
    for (const [nx, nz] of [[cx + 1, cz], [cx - 1, cz], [cx, cz + 1], [cx, cz - 1]]) if (walkable(g, nx, nz) && !seen[nz * g.w + nx]) (seen[nz * g.w + nx] = 1), q.push(nz * g.w + nx);
  }
  return seen;
};

test('신전 1~4구역: 고리 1·2·3·3겹, 처음엔 빛이 봉인에 못 닿고, 고리를 다 해 쪽으로 돌리면 봉인이 열려 걸어서 닿는다', () => {
  for (const floor of [1, 2, 3, 4])
    for (const seed of [3, 41, 977]) {
      const w = createWorld(seed, generateTemple(seed, floor, 'w'));
      calm(w);
      const t = w.temple!;
      expect(t.rings.length).toBe([1, 2, 3, 3][floor - 1]);
      expect(t.open).toBe(false);
      expect(w.exits.length).toBe(9); // 봉인 3×3이 출구
      expect(t.seal.every((i) => w.grid.blocked[i])).toBe(true);
      // 고리마다 손잡이 둘: 안팎 복도 어디서든 하나는 친다(안쪽 고리의 칸막이가 손잡이 하나의 한쪽을 가릴 수는 있다)
      t.rings.forEach((_, k) => {
        const open = (sign: number) => t.handles.filter((hd) => hd.ring === k).some((hd) => {
          const ch = w.chests[hd.chest];
          const [ux, uz] = [Math.sign(ch.x - t.cx), Math.sign(ch.z - t.cz)];
          return walkable(w.grid, ch.x + ux * sign, ch.z + uz * sign);
        });
        expect(open(1) && open(-1)).toBe(true);
      });
      // 바깥 고리 손잡이에는 걸어서 닿는다
      const seen = reach(w);
      const outer = t.handles.filter((hd) => hd.ring === t.rings.length - 1).map((hd) => w.chests[hd.chest]);
      expect(outer.some((ch) => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => seen[(ch.z + dz) * w.grid.w + ch.x + dx]))).toBe(true);
      t.rings.forEach((g, k) => {
        while (g.q !== t.sun) spin(w, k);
      });
      expect(t.open).toBe(true);
      expect(t.reach).toBeLessThanOrEqual(1);
      const after = reach(w);
      expect(t.seal.some((i) => after[i])).toBe(true);
    }
});

test('손잡이를 치면 고리가 1.5초에 걸쳐 시계 방향으로 90° 돌고, 손잡이도 함께 옮긴다. 도는 중엔 다시 안 돈다', () => {
  const w = createWorld(5, generateTemple(5, 2, 's'));
  calm(w);
  const t = w.temple!;
  const g = t.rings[0];
  const hd = t.handles.find((h) => h.ring === 0)!;
  const ch = w.chests[hd.chest];
  const [q0, x0, z0] = [g.q, ch.x - t.cx, ch.z - t.cz];
  const stones = () => g.stone.reduce((a, b) => a + b, 0);
  const before = stones();
  step(w, [{ type: 'open', chestId: hd.chest }]);
  const hero = w.entities[0];
  Object.assign(hero, { x: ch.x + 0.5 + (x0 ? Math.sign(x0) : 0), z: ch.z + 0.5 + (z0 ? Math.sign(z0) : 0) }); // 손잡이 바로 바깥
  for (let i = 0; i < 5 && !g.turn; i++) step(w, [{ type: 'open', chestId: hd.chest }]);
  expect(g.turn).toBeGreaterThan(0);
  run(w, TEMPLE.turn / 2);
  turnRing(w, 0); // 도는 중: 무시
  run(w, TEMPLE.turn / 2 + 0.1);
  expect(g.q).toBe((q0 + 1) % 4);
  expect(g.turn).toBe(0);
  expect([ch.x - t.cx, ch.z - t.cz]).toEqual([-z0, x0]);
  expect(stones()).toBe(before); // 가로·세로로 서면 칸 수가 같다
});

test('칸막이가 쓸고 지나간 칸의 일반 몬스터는 짓이겨지고 정예는 30% 피해, 주인공은 밀려나기만 한다', () => {
  const w = createWorld(7, generateTemple(7, 1, 'w'));
  calm(w);
  const t = w.temple!;
  const g = t.rings[0];
  // 칸막이가 다음에 지나갈 칸: 지금 칸막이 방향(q+2)에서 시계 방향으로 45°, 복도 가운데
  const a = ((g.q + 2.5) * Math.PI) / 2;
  const rr = (g.r + g.out) / 2;
  const at = (k: number) => [t.cx + 0.5 + Math.cos(a + k) * rr, t.cz + 0.5 + Math.sin(a + k) * rr];
  const [mob, elite] = [w.entities[1], w.entities[2]];
  const hero = w.entities[0];
  Object.assign(mob, { state: 'idle', hp: 50, maxHp: 50, elite: false, x: at(0)[0], z: at(0)[1], stunT: 99 });
  Object.assign(elite, { state: 'idle', hp: 100, maxHp: 100, elite: true, x: at(0.12)[0], z: at(0.12)[1], stunT: 99 });
  [hero.x, hero.z] = at(-0.12);
  const hp = hero.hp;
  spin(w, 0);
  expect(mob.state).toBe('dead');
  expect(elite.state).not.toBe('dead');
  expect(elite.hp).toBe(100 - Math.round(100 * TEMPLE.crush));
  expect(hero.hp).toBe(hp);
  expect(walkable(w.grid, Math.floor(hero.x), Math.floor(hero.z))).toBe(true);
});

test('붕대 망령: 그늘에서 쓰러지면 4초 뒤 절반으로 일어나고, 빛 안에서는 타서 끝난다', () => {
  const w = createWorld(9, generateTemple(9, 1, 'w'), 1, 1, { minion: 'mummy' });
  calm(w);
  const t = w.temple!;
  const m = w.entities.find((e) => e.kind === 'minion')!;
  // 그늘: 해 틈 반대쪽 모래밭
  const [sx, sz] = [[1, 0], [0, 1], [-1, 0], [0, -1]][t.sun];
  Object.assign(m, { state: 'idle', hp: m.maxHp, x: t.cx + 0.5 - sx * (t.wall + 4), z: t.cz + 0.5 - sz * (t.wall + 4), target: null });
  expect(inLight(w, m)).toBe(false);
  hurt(w, m, m.maxHp + 5);
  expect(m.state).not.toBe('dead');
  expect(m.downT).toBe(TEMPLE.down);
  hurt(w, m, 999); // 쓰러진 망령을 그늘에서 때려도 소용없다
  expect(m.state).not.toBe('dead');
  run(w, TEMPLE.down + 0.1);
  expect(m.downT).toBe(0);
  expect(m.hp).toBe(Math.round(m.maxHp * TEMPLE.rise));
  // 빛 안: 바깥 고리의 칸막이가 빛을 막고 있으면 돌려서 비키고, 빛줄기 첫 칸에
  while (!t.beam.length) spin(w, t.rings.length - 1);
  Object.assign(m, { x: (t.beam[0] % w.grid.w) + 0.5, z: Math.floor(t.beam[0] / w.grid.w) + 0.5, stunT: 99 });
  expect(inLight(w, m)).toBe(true);
  run(w, 3);
  expect(m.state).toBe('dead');
});

test('천막: 감독관을 쓰러뜨리면 남서쪽 길 끝에 신전 출구가 생기고 나머지 모양은 그대로', () => {
  const [a, b] = [generateTent(true, true), generateTent(true, true, true)];
  expect(a.join('').includes('"')).toBe(false);
  expect(b[b.length - 1].split('"').length - 1).toBe(3);
  const diff = a.reduce((n, row, z) => n + [...row].filter((c, x) => c !== b[z][x]).length, 0);
  expect(diff).toBeLessThan(80); // 길과 출구만
  const w = createWorld(1, b);
  expect(w.exits.filter((e) => e.to === 'temple').length).toBe(3);
});

test('결전장: 보스가 있고 봉인은 출구가 아니다. 해 틈은 동쪽, 고리 둘은 어긋나 있다', () => {
  const w = createWorld(1, generateTempleArena());
  const t = w.temple!;
  expect(w.exits.length).toBe(0);
  expect(w.entities.some((e) => e.kind === 'boss')).toBe(true);
  expect(t.sun).toBe(0);
  expect(t.rings.length).toBe(2);
  expect(t.open).toBe(false);
});

test('문지기 사제: 빛 밖에서는 막히고 빛 안에서는 1.5배, 벽을 넘어 떠오고, 빛이 고리를 지나면 고리를 돌린다', () => {
  const w = createWorld(1, generateTempleArena(), 1, 1, { boss: 'temple_keeper' });
  const t = w.temple!;
  const hero = w.entities[0];
  hero.maxHp = hero.hp = 1e9;
  const boss = w.entities.find((e) => e.kind === 'boss')!;
  const hp = boss.hp;
  hurt(w, boss, 100, hero);
  expect(boss.hp).toBe(hp); // 그늘
  expect(w.combos.some((c) => c.kind === 'ward')).toBe(true);
  // 고리를 다 맞춰 빛을 봉인까지
  t.rings.forEach((g, k) => {
    while (g.q !== t.sun) spin(w, k);
  });
  const lit = t.beam[Math.floor(t.beam.length / 2)];
  Object.assign(boss, { x: (lit % w.grid.w) + 0.5, z: Math.floor(lit / w.grid.w) + 0.5 });
  hurt(w, boss, 100, hero);
  expect(boss.hp).toBe(hp - 150);
  // 떠다니기: 벽 너머 주인공에게 다가온다(고리 벽 위도 지나간다)
  Object.assign(hero, { x: t.cx + 0.5, z: t.cz + 0.5 + t.wall + 3 });
  Object.assign(boss, { x: t.cx + 0.5, z: t.cz + 0.5 - t.wall + 2 });
  const d0 = Math.hypot(hero.x - boss.x, hero.z - boss.z);
  run(w, 3);
  expect(Math.hypot(hero.x - boss.x, hero.z - boss.z)).toBeLessThan(d0 - 4);
  // 고리 돌리기: 빛이 봉인까지 지나면 10초 안에 가장 안쪽 고리를 돌려 빛을 줄인다
  expect(t.reach).toBeLessThanOrEqual(1);
  run(w, 11);
  expect(t.reach).toBeGreaterThan(t.rings[0].r - 1);
});
