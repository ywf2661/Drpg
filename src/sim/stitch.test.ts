// 2막 엔딩 — 틈을 꿰맨다(한붓 수놓기)
import { expect, test } from 'vitest';
import { createWorld, DT, type World } from './world';
import { generateWarpArena } from './warpmap';
import { PATTERNS, STITCH, startHoles, startStitch, stitchState, tickStitch } from './stitch';

// 한붓 길(구멍 번호 순서) — tools 밖 검사기로 찾은 것
const SOL = [
  [1, 0, 3, 4, 5, 2, 1, 4],
  [0, 1, 2, 3, 7, 6, 5, 4, 0, 5, 1, 6, 2],
  [0, 6, 1, 8, 2, 7, 3, 5, 0, 9, 6, 4, 7, 8, 4, 5, 6],
  [0, 6, 1, 7, 2, 8, 3, 9, 4, 10, 5, 11, 10, 9, 8, 7, 6, 11, 0, 2, 4, 0],
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
  expect(PATTERNS.map((p) => [p.holes.length, p.edges.length])).toEqual([[6, 7], [8, 12], [10, 16], [12, 21]]);
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
  tick(w, STITCH.close + 0.1);
  expect(stitchState(w)!.phase).toBe('closed');
  expect(s.events.filter((e) => e === 'done').length).toBe(4);
});

test('그은 줄을 다시 지나면 끊어져 처음부터, 두 번 끊어지면 힌트', () => {
  const w = arena();
  const s = startStitch(w);
  sew(w, [1, 0, 1]);
  expect(s.drawn.length).toBe(0);
  expect(s.events).toContain('snap');
  sew(w, [1, 0, 1]);
  expect(s.events).toContain('hint');
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
});

test('바람: 가만히 서 있어도 틈 쪽으로 끌려간다', () => {
  const w = arena();
  startStitch(w);
  const h = w.entities[0];
  Object.assign(h, { x: STITCH.center + 10, z: STITCH.center });
  tick(w, 1);
  expect(h.x).toBeLessThan(STITCH.center + 9.2);
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
