// 2막 엔딩 — 틈을 꿰맨다(한붓 수놓기)
import { expect, test } from 'vitest';
import { createWorld, DT, step, type World } from './world';
import { generateWarpArena } from './warpmap';
import { holesOf, PATTERNS, riftLimit, STITCH, startHoles, startStitch, stitchState, tickStitch } from './stitch';

// 한붓 길(구멍 번호 순서) — tools 밖 검사기로 찾은 것
const SOL = [
  [1, 0, 3, 4, 5, 2, 1, 4],
  [0, 1, 2, 3, 7, 6, 5, 4, 0, 5, 1, 6, 2],
  [0, 6, 1, 8, 2, 7, 3, 5, 0, 9, 6, 4, 7, 8, 4, 5, 6],
  [0, 6, 1, 7, 2, 8, 3, 9, 4, 10, 5, 11, 0, 5, 4, 3, 2, 1, 0],
];
const arena = () => {
  const w = createWorld(1, generateWarpArena(), 1, 1, { boss: 'time_warden' });
  for (const e of w.entities.slice(1)) Object.assign(e, { state: 'dead', hp: 0, x: -50, z: -50 });
  return w;
};
const tick = (w: World, sec: number, each?: () => void) => {
  for (let i = 0; i < Math.round(sec / DT); i++) {
    each?.();
    tickStitch(w);
  }
};
const at = (w: World, h: number) => {
  const [x, z] = stitchState(w)!.holes[h];
  Object.assign(w.entities[0], { x, z, path: [] });
};
// 그 자리에 버티고 선다(무늬가 바뀌어도 같은 좌표)
const hold = (w: World, sec: number) => {
  const { x, z } = w.entities[0];
  tick(w, sec, () => Object.assign(w.entities[0], { x, z }));
};
const sew = (w: World, seq: number[]) => {
  for (const h of seq) {
    at(w, h);
    tick(w, 0.1, () => at(w, h));
  }
};

test('무늬 넷 모두 한붓 길이 있고, 시작 구멍은 홀수 줄 구멍(해는 없다 — 시작한 곳에서 끝)', () => {
  PATTERNS.forEach((p, k) => {
    const seq = SOL[k];
    const used = new Set<number>();
    for (let i = 1; i < seq.length; i++) {
      const e = p.edges.findIndex(([a, b]) => (a === seq[i - 1] && b === seq[i]) || (b === seq[i - 1] && a === seq[i]));
      expect(e).toBeGreaterThanOrEqual(0);
      expect(used.has(e)).toBe(false);
      if (p.oneway.includes(e)) expect(p.edges[e][0]).toBe(seq[i - 1]);
      used.add(e);
    }
    expect(used.size).toBe(p.edges.length);
    const odd = startHoles(k);
    expect(odd.length === 0 ? seq[0] === seq.at(-1) : odd.includes(seq[0]) && odd.includes(seq.at(-1)!)).toBe(true);
  });
  expect(PATTERNS.map((p) => [p.holes.length, p.edges.length])).toEqual([[6, 7], [8, 12], [10, 16], [12, 18]]);
});

test('틈은 지금 무늬의 가장 안쪽 구멍 앞까지만 자란다(무늬를 먹지 않는다) — 무늬마다 시작보다 1칸 넘게 자랄 여유는 있다', () => {
  PATTERNS.forEach((_, k) => expect(riftLimit(holesOf(k))).toBeGreaterThan(STITCH.r0 + 1));
  const w = arena();
  const s = startStitch(w);
  for (let k = 0; k < 4; k++) {
    s.k = k;
    s.holes = holesOf(k);
    tick(w, 120, () => Object.assign(w.entities[0], { x: STITCH.center, z: STITCH.center + 19 }));
    const near = Math.min(...s.holes.map((h) => Math.hypot(h[0] - STITCH.center, h[1] - STITCH.center)));
    expect(s.r).toBeLessThanOrEqual(near - STITCH.margin + 1e-6);
  }
});

test('무늬마다 줄끼리 가로지르지 않고, 줄이 다른 구멍 위를 지나지 않는다(점선이 겹쳐 보이지 않게)', () => {
  const cross = (a: number[], b: number[], c: number[], d: number[]) => {
    const o = (p: number[], q: number[], r: number[]) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
    return o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0;
  };
  const near = (p: number[], a: number[], b: number[]) => {
    const [vx, vy] = [b[0] - a[0], b[1] - a[1]];
    const k = Math.max(0, Math.min(1, ((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / (vx * vx + vy * vy)));
    return Math.hypot(p[0] - a[0] - vx * k, p[1] - a[1] - vy * k);
  };
  for (const p of PATTERNS) {
    const H = p.holes;
    p.edges.forEach(([a, b], i) => {
      p.edges.forEach(([c, d], j) => {
        if (j > i && ![a, b].includes(c) && ![a, b].includes(d)) expect(cross(H[a], H[b], H[c], H[d]), `${p.name} ${a}-${b} × ${c}-${d}`).toBe(false);
      });
      H.forEach((h, k) => k !== a && k !== b && expect(near(h, H[a], H[b]), `${p.name} ${a}-${b} 위 구멍 ${k}`).toBeGreaterThan(0.5));
    });
  }
});

test('넷을 다 꿰매면 틈이 닫힌다. 무늬마다 다 그은 뒤 메아리(4초)가 지나야 굳는다', () => {
  const w = arena();
  const s = startStitch(w);
  for (let k = 0; k < 4; k++) {
    expect(s.k).toBe(k);
    sew(w, SOL[k]);
    expect(s.k).toBe(k); // 아직 안 굳었다
    hold(w, STITCH.echo + 0.2);
  }
  expect(s.phase).toBe('closing');
  tick(w, STITCH.walkIn / 2);
  const mid = w.warp!.echo!;
  expect(Math.hypot(mid[0] - STITCH.center, mid[1] - STITCH.center)).toBeLessThan(12); // 메아리가 틈 쪽으로 걸어 들어간다
  tick(w, STITCH.walkIn / 2 + 0.1);
  expect(w.warp!.echo).toBeNull(); // 스며들었다
  tick(w, STITCH.close - STITCH.walkIn);
  expect(stitchState(w)!.phase).toBe('closed');
  expect(s.events.filter((e) => e === 'done').length).toBe(4);
});

test('그은 줄을 다시 지나면 끊어져 처음부터, 두 번 끊어지면 힌트', () => {
  const w = arena();
  const s = startStitch(w);
  sew(w, [1, 0, 1]);
  expect(s.drawn.length).toBe(0);
  expect(s.events).toContain('snap');
  sew(w, [0, 1, 0]); // 끊어진 구멍(1)은 건너뛰고 0에서 새로 시작 → 다시 겹친다
  expect(s.events).toContain('hint');
});

test('끊어진 뒤 그 구멍은 시작점이 되지 않는다 — 다른 구멍에서 새로 시작하고, 벗어났다 돌아오면 거기서도 시작한다', () => {
  const w = arena();
  const s = startStitch(w);
  sew(w, [1, 0, 1]); // 1에서 끊어졌다(1 위에 서 있다)
  expect(s.cur).toBe(-1);
  sew(w, [4]); // 다른 구멍(4)에서 새로 시작
  expect(s.start).toBe(4);
  const w2 = arena();
  const s2 = startStitch(w2);
  sew(w2, [1, 0, 1]);
  Object.assign(w2.entities[0], { x: s2.holes[1][0] + 2, z: s2.holes[1][1] });
  tick(w2, 0.1, () => Object.assign(w2.entities[0], { x: s2.holes[1][0] + 2, z: s2.holes[1][1] }));
  sew(w2, [1]); // 한 발 나갔다 돌아왔다
  expect(s2.start).toBe(1);
});

test('한쪽 통행 줄을 거꾸로 그으면 끊어진다', () => {
  const w = arena();
  const s = startStitch(w);
  for (let k = 0; k < 3; k++) {
    sew(w, SOL[k]);
    hold(w, STITCH.echo + 0.2);
  }
  expect(s.k).toBe(3);
  const [a, b] = PATTERNS[3].edges[PATTERNS[3].oneway[0]];
  sew(w, [b, a]);
  expect(s.events.at(-1)).toBe('snap');
});

test('틈에 닿으면 바깥으로 내던져지고 굳지 않은 줄만 풀린다', () => {
  const w = arena();
  const s = startStitch(w);
  sew(w, [1, 0]);
  hold(w, STITCH.echo + 0.2); // 첫 줄은 굳었다
  sew(w, [3]);
  expect(s.drawn.length).toBe(2);
  Object.assign(w.entities[0], { x: STITCH.center + 0.5, z: STITCH.center + 1 });
  tick(w, DT);
  expect(s.drawn.length).toBe(1);
  expect(s.cur).toBe(0);
  expect(Math.hypot(w.entities[0].x - STITCH.center, w.entities[0].z - STITCH.center)).toBeGreaterThan(15);
  expect(s.events).toContain('pulled');
  expect(w.entities[0].hp).toBe(w.entities[0].maxHp - Math.round(w.entities[0].maxHp * STITCH.pullHurt)); // 체력 1/4을 잃는다
});

test('빨려 들어 체력이 다하면 존재가 지워졌다 돌아와 첫 무늬부터(죽지 않는다, 체력 다 참), 꿰매는 동안은 물약을 못 마신다', () => {
  const w = arena();
  const s = startStitch(w);
  for (let k = 0; k < 2; k++) {
    sew(w, SOL[k]);
    hold(w, STITCH.echo + 0.2);
  }
  expect(s.k).toBe(2);
  const h = w.entities[0];
  h.hp = 3;
  Object.assign(h, { x: STITCH.center + 0.5, z: STITCH.center + 1 });
  tick(w, DT);
  expect(h.state).not.toBe('dead');
  expect(h.hp).toBe(h.maxHp);
  expect(s.k).toBe(0);
  expect(s.r).toBe(STITCH.r0);
  expect(s.events).toContain('erased');
  w.potions = 2;
  h.hp = h.maxHp - 10; // 다쳐 있어야 마시려 한다
  step(w, [{ type: 'drink' }]);
  expect(w.potions).toBe(2);
  expect(s.events).toContain('nopotion');
});

test('바람: 첫 무늬(연습)는 잔잔하고 틈도 그대로, 둘째 무늬부터 가만히 서 있어도 틈 쪽으로 끌려간다', () => {
  const w = arena();
  const s = startStitch(w);
  const h = w.entities[0];
  Object.assign(h, { x: STITCH.center + 10, z: STITCH.center });
  tick(w, 1);
  expect(h.x).toBe(STITCH.center + 10);
  expect(s.r).toBe(STITCH.r0);
  s.k = 1;
  tick(w, 1);
  expect(h.x).toBeLessThan(STITCH.center + 9.2);
  expect(s.r).toBeGreaterThan(STITCH.r0);
});

test('광산 무늬: 틈 쪽 구멍 줄이 25초 안에 다 굳지 않으면 빨려 들어 처음부터', () => {
  const w = arena();
  const s = startStitch(w);
  for (let k = 0; k < 2; k++) {
    sew(w, SOL[k]);
    hold(w, STITCH.echo + 0.2);
  }
  expect(s.k).toBe(2);
  sew(w, SOL[2].slice(0, 3));
  hold(w, STITCH.crumble);
  expect(s.events).toContain('crumble');
  expect(s.drawn.length).toBe(0);
});
