# 2-A단계 던전 생성과 층 이동 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 고정 맵을 시드 기반 무작위 5개 층(방 + 복도)으로 바꾸고, 계단으로 내려가며 층마다 몬스터가 강해지게 한다.

**Architecture:** `src/sim/dungeon.ts`의 순수 함수가 기존 글자 맵 형식(+ `>` 계단)을 만들고, `createWorld`가 층 배율(`power`)과 계단 위치를 받아 월드를 만든다. `outcome`이 `'descend'`를 돌려주면 `main.ts`가 다음 층을 만든다. 렌더러는 층이 바뀔 때마다 바닥·벽을 다시 만든다.

**Tech Stack:** TypeScript, three.js 0.186.1, Vite 8, Vitest 4

**Spec:** `docs/superpowers/specs/2026-10-15-dungeon-floors-design.md`

## Global Constraints

- 맵 48×48, 방 6~9개(한 변 5~10칸, 서로 2칸 이상 간격), 복도 폭 2칸, L자 + 순환로 2개.
- 몬스터 수 `8 + 3 × (층 − 1)`, 전사 비율 `0.2 + 0.075 × (층 − 1)` 반올림, 층 배율 `power = 1 + 0.2 × (층 − 1)`. 총 5층(`FLOORS = 5`), 5층은 계단 없음.
- 계단 판정: 주인공이 계단 칸 중심 0.5m 이내. `outcome` 순서: `'dead'` → `'descend'` → `'clear'`(계단 없는 층에서 전멸) → `null`.
- sim은 three.js·`Math.random` 금지(생성기는 자체 mulberry32). 층 시드는 sim 밖(main.ts)에서 `Math.random`.
- 새 npm 의존성 금지. 화면 문구는 한국어. git push는 사용자 확인 후.

## Review Focus

1. 생성 결과 중 일부 시드에서 방이 1개뿐이거나 몬스터 배치가 끝나지 않는(무한 반복) 경우 → Task 3 생성기 테스트(시드 1~50 × 5층)와 방 2개 미만 예외.
2. 계단을 밟은 프레임에 층 전환이 두 번 일어나거나(연속 descend), 전환 직후 이전 층의 입력 명령이 새 층에 적용되는 경우 → Task 4 `enterFloor`에서 명령 큐 비우기 + 헤드리스 확인.
3. 층 전환을 반복할 때 이전 층의 바닥·벽 메시가 남거나(겹쳐 보임) GPU 메모리가 계속 늘어나는 경우 → Task 4 `buildMap`의 해제 처리 + 스크린샷.
4. 체력바·대상 체력바가 배율이 적용된 몬스터에서 100%를 넘거나 0으로 나누는 경우 → Task 4 HUD가 `maxHp` 사용.
5. 48×48에서 몬스터 20마리가 동시에 경로를 다시 계산할 때 프레임이 끊기는 경우 → Task 1 이진 힙 + 큰 맵 경로 테스트.

---

### Task 1: 길찾기 이진 힙

**Files:**
- Modify: `src/sim/path.ts` (`findPath` 교체, `Heap` 추가)
- Test: `src/sim/path.test.ts` (테스트 추가)

**Interfaces:**
- Produces: `findPath(g, from, to)` 시그니처·결과 의미 동일(양 끝 포함 최단 경로 또는 null).

- [ ] **Step 1: 큰 맵 테스트 추가**

`src/sim/path.test.ts` 끝에 추가:
```ts
test('48x48 빈 맵: 대각선 끝까지 48칸 최단 경로', () => {
  const g = grid(Array(48).fill('.'.repeat(48)));
  const p = findPath(g, [0, 0], [47, 47])!;
  expect(p).toHaveLength(48);
  expectValid(g, p);
});

test('48x48 막힌 목표는 null', () => {
  const rows = Array(48).fill('.'.repeat(48));
  rows[46] = '.'.repeat(45) + '###';
  rows[47] = '.'.repeat(45) + '#.#';
  expect(findPath(grid(rows), [0, 0], [46, 47])).toBeNull();
});
```

- [ ] **Step 2: 현재 구현으로 통과 확인 (리팩터링 전 기준선)**

Run: `npm test`
Expected: PASS (45 + 2 = 47). 리팩터링이므로 새 테스트도 지금 통과하는 것이 맞다.

- [ ] **Step 3: `findPath`를 이진 힙으로 교체**

`src/sim/path.ts`에서 `// from → to 칸 목록` 주석부터 파일 끝까지를 다음으로 교체:
```ts
// 최소 힙: (우선순위 f, 칸 번호)
class Heap {
  private f: number[] = [];
  private v: number[] = [];
  get size() {
    return this.v.length;
  }
  push(f: number, v: number) {
    let i = this.v.length;
    this.f.push(f);
    this.v.push(v);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.f[p] <= f) break;
      this.f[i] = this.f[p];
      this.v[i] = this.v[p];
      i = p;
    }
    this.f[i] = f;
    this.v[i] = v;
  }
  pop(): number {
    const top = this.v[0];
    const f = this.f.pop()!;
    const v = this.v.pop()!;
    const n = this.v.length;
    if (n > 0) {
      let i = 0;
      for (;;) {
        let c = 2 * i + 1;
        if (c >= n) break;
        if (c + 1 < n && this.f[c + 1] < this.f[c]) c++;
        if (this.f[c] >= f) break;
        this.f[i] = this.f[c];
        this.v[i] = this.v[c];
        i = c;
      }
      this.f[i] = f;
      this.v[i] = v;
    }
    return top;
  }
}

// from → to 칸 목록(양 끝 포함). 목표가 벽이거나 도달 불가면 null.
export function findPath(g: Grid, from: Cell, to: Cell): Cell[] | null {
  const [tx, tz] = to;
  if (!walkable(g, tx, tz)) return null;
  const n = g.w * g.h;
  const start = from[1] * g.w + from[0];
  const goal = tz * g.w + tx;
  const cost = new Float64Array(n).fill(Infinity);
  const prev = new Int32Array(n).fill(-1);
  const closed = new Uint8Array(n);
  const h = (i: number) => {
    const dx = Math.abs((i % g.w) - tx);
    const dz = Math.abs(Math.floor(i / g.w) - tz);
    return Math.max(dx, dz) + (Math.SQRT2 - 1) * Math.min(dx, dz); // octile 거리
  };
  const open = new Heap();
  cost[start] = 0;
  open.push(h(start), start);
  while (open.size) {
    const cur = open.pop();
    if (cur === goal) {
      const path: Cell[] = [];
      for (let i = cur; i !== -1; i = prev[i]) path.push([i % g.w, Math.floor(i / g.w)]);
      return path.reverse();
    }
    if (closed[cur]) continue;
    closed[cur] = 1;
    const cx = cur % g.w;
    const cz = Math.floor(cur / g.w);
    for (const [dx, dz] of DIRS) {
      const nx = cx + dx;
      const nz = cz + dz;
      if (!walkable(g, nx, nz)) continue;
      if (dx && dz && !(walkable(g, cx + dx, cz) && walkable(g, cx, cz + dz))) continue; // 벽 모서리 대각선 통과 금지
      const ni = nz * g.w + nx;
      const c = cost[cur] + (dx && dz ? Math.SQRT2 : 1);
      if (c < cost[ni]) {
        cost[ni] = c;
        prev[ni] = cur;
        open.push(c + h(ni), ni);
      }
    }
  }
  return null;
}
```

- [ ] **Step 4: 테스트·타입 검사**

Run: `npm test && npx tsc`
Expected: PASS 47, tsc 오류 없음. (sim 재현성 테스트도 그대로 통과 — 힙의 동작이 결정적이므로.)

- [ ] **Step 5: 커밋**

```bash
git add src/sim/path.ts src/sim/path.test.ts
git commit -m "perf: 길찾기 open 목록을 이진 힙으로"
```

---

### Task 2: 층 배율·계단·최대 체력

**Files:**
- Modify: `src/sim/world.ts`
- Test: `src/sim/world.test.ts`

**Interfaces:**
- Consumes: `Cell` (`./path`)
- Produces:
  - `createWorld(seed: number, map: string[], power = 1): World` — map 필수(기본 MAP 제거)
  - `World.stairs: Cell | null`, `Entity.maxHp: number`, `Entity.power: number`
  - `outcome(w): 'dead' | 'descend' | 'clear' | null`

- [ ] **Step 1: 고정 맵을 테스트로 옮기고 실패하는 테스트 추가**

`src/sim/world.test.ts`의 import 줄을 다음으로 교체:
```ts
import { expect, test } from 'vitest';
import { findPath, walkable } from './path';
import { createWorld, outcome, RADIUS, STATS, step, type Command, type World } from './world';
```

같은 파일의 `const run = ...` 정의 바로 위에 `src/sim/world.ts`의 `export const MAP = [ ... ];` 배열 전체를 복사해 붙이고, `export`만 뺀 `const MAP = [ ... ];`로 둔다(내용은 그대로).

이어서 파일 안의 `createWorld(1)`을 `createWorld(1, MAP)`로, `createWorld(7)`을 `createWorld(7, MAP)`로 바꾼다(각 1곳).

파일 끝에 추가:
```ts
test('층 배율: 몬스터 체력·데미지가 배율만큼 커지고 주인공은 그대로', () => {
  const w = createWorld(1, DUEL, 2);
  const [hero, m] = w.entities;
  expect(hero).toMatchObject({ hp: 100, maxHp: 100, power: 1 });
  expect(m).toMatchObject({ hp: 60, maxHp: 60, power: 2 });
  run(w, 35); // 졸개는 30틱째에 한 번 때린다(3~5 × 2)
  expect(hero.hp).toBeGreaterThanOrEqual(100 - 10);
  expect(hero.hp).toBeLessThanOrEqual(100 - 6);
});

test('계단 칸을 기록하고 바닥으로 취급한다', () => {
  const w = createWorld(1, ['H.>']);
  expect(w.stairs).toEqual([2, 0]);
  expect(walkable(w.grid, 2, 0)).toBe(true);
  expect(w.entities).toHaveLength(1);
});

test('계단 칸 중심 0.5m 안에 들어서면 descend', () => {
  const w = createWorld(1, ['H..>', '....']);
  run(w, 10, [{ type: 'move', x: 3.5, z: 0.5 }]);
  expect(outcome(w)).toBeNull();
  run(w, 60);
  expect(outcome(w)).toBe('descend');
});

test('계단이 있는 층은 몬스터를 다 잡아도 clear가 아니고, 사망이 계단보다 우선', () => {
  const w = createWorld(1, ['H.m.>']);
  const [hero, m] = w.entities;
  m.state = 'dead';
  expect(outcome(w)).toBeNull();
  hero.x = 4.5;
  expect(outcome(w)).toBe('descend');
  hero.state = 'dead';
  expect(outcome(w)).toBe('dead');
});
```

- [ ] **Step 2: 실패 확인**

Run: `npm test`
Expected: FAIL — 새 테스트 4개(`maxHp`/`power`/`stairs` 없음, `'descend'` 없음). 기존 테스트는 통과.

- [ ] **Step 3: 구현**

`src/sim/world.ts`에서:

(1) `Entity` 타입의 `hp: number;` 줄 다음에 추가:
```ts
  maxHp: number;
  power: number; // 층 배율. 체력·데미지에 곱한다(주인공은 1)
```

(2) `World` 타입을 교체:
```ts
export type World = { grid: Grid; entities: Entity[]; rng: number; stairs: Cell | null };
```

(3) `// '#' 벽, '.' 바닥, 'H' 주인공, 'm' 졸개, 'w' 전사` 주석과 `export const MAP = [ ... ];` 전체를 삭제하고, 그 자리에 다음 주석만 둔다:
```ts
// 맵 글자: '#' 벽, '.' 바닥, '>' 계단, 'H' 주인공, 'm' 졸개, 'w' 전사
```

(4) `createWorld` 함수 전체를 교체:
```ts
export function createWorld(seed: number, map: string[], power = 1): World {
  const w = map[0].length;
  const grid: Grid = { w, h: map.length, blocked: new Uint8Array(w * map.length) };
  const spawns: { kind: Kind; x: number; z: number }[] = [];
  let stairs: Cell | null = null;
  map.forEach((row, z) =>
    [...row].forEach((c, x) => {
      const kind = SPAWN[c];
      if (c === '#') grid.blocked[z * w + x] = 1;
      else if (c === '>') stairs = [x, z];
      else if (kind) spawns.push({ kind, x: x + 0.5, z: z + 0.5 });
    }),
  );
  spawns.sort((a, b) => Number(b.kind === 'hero') - Number(a.kind === 'hero')); // 주인공 = id 0 (안정 정렬)
  if (spawns[0]?.kind !== 'hero') throw new Error('맵에 주인공(H)이 없습니다');
  const entities = spawns.map((s, id): Entity => {
    const p = s.kind === 'hero' ? 1 : power;
    const hp = Math.round(STATS[s.kind].hp * p);
    return { id, ...s, facing: 0, hp, maxHp: hp, power: p, state: 'idle', path: [], target: null, attackT: 0, repathT: 0 };
  });
  return { grid, entities, rng: seed, stairs };
}
```

(5) `outcome` 함수 전체를 교체:
```ts
export function outcome(w: World): 'dead' | 'descend' | 'clear' | null {
  const hero = w.entities[0];
  if (hero.state === 'dead') return 'dead';
  if (w.stairs) return Math.hypot(hero.x - w.stairs[0] - 0.5, hero.z - w.stairs[1] - 0.5) <= 0.5 ? 'descend' : null;
  return w.entities.every((e) => e.kind === 'hero' || e.state === 'dead') ? 'clear' : null;
}
```

(6) `damage` 함수의 체력 감소 줄을 교체:
```ts
  t.hp = Math.max(0, t.hp - Math.round((lo + Math.floor(rand(w) * (hi - lo + 1))) * a.power));
```

- [ ] **Step 4: 테스트·타입 검사**

Run: `npm test && npx tsc`
Expected: sim 테스트 PASS. `tsc`는 `src/main.ts`의 `createWorld(SEED)`(인자 부족)에서 오류가 날 수 있다 — Task 4에서 main.ts를 교체하며 해결된다. 이 단계에서는 `npx tsc` 출력이 main.ts 한 곳뿐인지 확인한다.

- [ ] **Step 5: 커밋**

```bash
git add src/sim/world.ts src/sim/world.test.ts
git commit -m "feat: 층 배율(power)·최대 체력·계단 판정"
```

---

### Task 3: 던전 생성기

**Files:**
- Create: `src/sim/dungeon.ts`
- Test: `src/sim/dungeon.test.ts`

**Interfaces:**
- Consumes: `Cell` (`./path`)
- Produces: `FLOORS = 5`, `generateFloor(seed: number, floor: number): string[]` (48행 × 48열)

- [ ] **Step 1: 실패하는 테스트 작성**

`src/sim/dungeon.test.ts`:
```ts
import { expect, test } from 'vitest';
import { FLOORS, generateFloor } from './dungeon';
import { createWorld } from './world';

const count = (map: string[], c: string) => map.join('').split(c).length - 1;
const find = (map: string[], c: string): [number, number] => {
  const i = map.join('').indexOf(c);
  return [i % map[0].length, Math.floor(i / map[0].length)];
};

// 벽이 아닌 칸까지의 4방향 걸음 수
function distances(map: string[], [sx, sz]: [number, number]) {
  const w = map[0].length;
  const d = new Map<number, number>([[sz * w + sx, 0]]);
  const q: [number, number][] = [[sx, sz]];
  for (let i = 0; i < q.length; i++) {
    const [x, z] = q[i];
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const nz = z + dz;
      if (map[nz]?.[nx] && map[nz][nx] !== '#' && !d.has(nz * w + nx)) {
        d.set(nz * w + nx, d.get(z * w + x)! + 1);
        q.push([nx, nz]);
      }
    }
  }
  return d;
}

test('시드 1~50 × 1~5층: 크기, 테두리, 주인공·계단·몬스터 수, 모든 칸 연결, 계단은 멀리', () => {
  for (let seed = 1; seed <= 50; seed++) {
    for (let floor = 1; floor <= FLOORS; floor++) {
      const map = generateFloor(seed, floor);
      expect(map).toHaveLength(48);
      expect(map.every((r) => r.length === 48)).toBe(true);
      expect(map[0] + map[47] + map.map((r) => r[0] + r[47]).join('')).toMatch(/^#+$/);
      expect(count(map, 'H')).toBe(1);
      expect(count(map, '>')).toBe(floor < FLOORS ? 1 : 0);
      const monsters = 8 + 3 * (floor - 1);
      expect(count(map, 'm') + count(map, 'w')).toBe(monsters);
      expect(count(map, 'w')).toBe(Math.round(monsters * (0.2 + 0.075 * (floor - 1))));
      const d = distances(map, find(map, 'H'));
      expect(d.size).toBe(48 * 48 - count(map, '#'));
      if (floor < FLOORS) {
        const [x, z] = find(map, '>');
        expect(d.get(z * 48 + x)).toBeGreaterThanOrEqual(15);
      }
    }
  }
});

test('같은 시드면 같은 맵, 다른 시드면 다른 맵', () => {
  expect(generateFloor(7, 3)).toEqual(generateFloor(7, 3));
  expect(generateFloor(7, 3)).not.toEqual(generateFloor(8, 3));
});

test('생성한 맵을 createWorld가 읽고 배율을 적용한다', () => {
  const w = createWorld(1, generateFloor(1, 2), 1.2);
  expect(w.stairs).not.toBeNull();
  expect(w.entities).toHaveLength(1 + 11);
  for (const e of w.entities.slice(1)) expect(e.maxHp).toBe(e.kind === 'minion' ? 36 : 72);
});
```

- [ ] **Step 2: 실패 확인**

Run: `npm test`
Expected: FAIL — `./dungeon` 모듈 없음.

- [ ] **Step 3: 구현**

`src/sim/dungeon.ts`:
```ts
// 무작위 던전 층: 방 + 2칸 폭 L자 복도. 결과는 createWorld가 읽는 글자 맵(+ '>' 계단).
// three.js·Math.random 금지. 시드가 같으면 같은 맵.
import type { Cell } from './path';

export const FLOORS = 5;
const SIZE = 48;
type Room = { x: number; z: number; w: number; h: number };

export function generateFloor(seed: number, floor: number): string[] {
  let s = seed | 0;
  const rand = () => {
    let t = (s = (s + 0x6d2b79f5) | 0); // mulberry32
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (lo: number, hi: number) => lo + Math.floor(rand() * (hi - lo + 1)); // lo..hi 포함
  const cells = Array.from({ length: SIZE }, () => Array<string>(SIZE).fill('#'));

  // 방: 테두리 1칸은 벽으로 남기고, 서로 2칸 이상 떨어지게
  const rooms: Room[] = [];
  const want = int(6, 9);
  for (let tries = 0; tries < 300 && rooms.length < want; tries++) {
    const w = int(5, 10);
    const h = int(5, 10);
    const r = { x: int(1, SIZE - w - 1), z: int(1, SIZE - h - 1), w, h };
    if (rooms.some((o) => r.x < o.x + o.w + 2 && o.x < r.x + r.w + 2 && r.z < o.z + o.h + 2 && o.z < r.z + r.h + 2)) continue;
    rooms.push(r);
    for (let z = r.z; z < r.z + h; z++) for (let x = r.x; x < r.x + w; x++) cells[z][x] = '.';
  }
  if (rooms.length < 2) throw new Error(`방 생성 실패 (seed ${seed})`);

  // 복도: 이전 방과 L자로 잇고, 순환로 2개 추가. 2칸 폭이라 (x+1, z+1)까지 판다.
  const center = (r: Room): Cell => [r.x + (r.w >> 1), r.z + (r.h >> 1)];
  const line = (x0: number, z0: number, x1: number, z1: number) => {
    for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) {
      for (let z = Math.min(z0, z1); z <= Math.max(z0, z1); z++) {
        cells[z][x] = cells[z][x + 1] = cells[z + 1][x] = cells[z + 1][x + 1] = '.';
      }
    }
  };
  const corridor = (a: Room, b: Room) => {
    const [ax, az] = center(a);
    const [bx, bz] = center(b);
    const [cx, cz] = rand() < 0.5 ? [bx, az] : [ax, bz]; // 꺾이는 점
    line(ax, az, cx, cz);
    line(cx, cz, bx, bz);
  };
  for (let i = 1; i < rooms.length; i++) corridor(rooms[i - 1], rooms[i]);
  for (let k = 0; k < 2; k++) corridor(rooms[int(0, rooms.length - 1)], rooms[int(0, rooms.length - 1)]);

  // 주인공: 첫 방 중심. 계단: 주인공에서 걸어서 가장 먼 방의 중심(마지막 층은 없음)
  const [hx, hz] = center(rooms[0]);
  cells[hz][hx] = 'H';
  if (floor < FLOORS) {
    const dist = walkDistances(cells, hx, hz);
    const far = rooms.slice(1).reduce((a, b) => (dist(center(b)) > dist(center(a)) ? b : a));
    const [sx, sz] = center(far);
    cells[sz][sx] = '>';
  }

  // 몬스터: 첫 방을 뺀 방들에 돌아가며 2~4마리씩
  const count = 8 + 3 * (floor - 1);
  const warriors = Math.round(count * (0.2 + 0.075 * (floor - 1)));
  const kinds = Array.from({ length: count }, (_, i) => (i < warriors ? 'w' : 'm'));
  for (let i = kinds.length - 1; i > 0; i--) {
    const j = int(0, i);
    [kinds[i], kinds[j]] = [kinds[j], kinds[i]];
  }
  const others = rooms.slice(1);
  for (let k = 0, r = 0; k < count; r = (r + 1) % others.length) {
    const room = others[r];
    for (let g = int(2, 4); g > 0 && k < count; g--) {
      for (let tries = 0; tries < 50; tries++) {
        const x = int(room.x, room.x + room.w - 1);
        const z = int(room.z, room.z + room.h - 1);
        if (cells[z][x] !== '.') continue;
        cells[z][x] = kinds[k++];
        break;
      }
    }
  }
  return cells.map((row) => row.join(''));
}

// (sx, sz)에서 벽이 아닌 칸까지의 4방향 걸음 수. 도달 불가는 -1.
function walkDistances(cells: string[][], sx: number, sz: number) {
  const d = new Int32Array(SIZE * SIZE).fill(-1);
  d[sz * SIZE + sx] = 0;
  const q = [sz * SIZE + sx];
  for (let i = 0; i < q.length; i++) {
    const x = q[i] % SIZE;
    const z = Math.floor(q[i] / SIZE);
    for (const [nx, nz] of [[x + 1, z], [x - 1, z], [x, z + 1], [x, z - 1]]) {
      const ni = nz * SIZE + nx;
      if (cells[nz][nx] !== '#' && d[ni] < 0) {
        d[ni] = d[q[i]] + 1;
        q.push(ni);
      }
    }
  }
  return ([x, z]: Cell) => d[z * SIZE + x];
}
```

- [ ] **Step 4: 테스트·타입 검사**

Run: `npm test`
Expected: PASS (47 + world 4 + dungeon 3 = 54). 시드 하나라도 실패하면 출력된 seed/floor로 `generateFloor`를 직접 호출해 원인을 찾는다(계단 거리 15 미만이면 방 배치 간격 문제인지 확인).

- [ ] **Step 5: 커밋**

```bash
git add src/sim/dungeon.ts src/sim/dungeon.test.ts
git commit -m "feat: 시드 기반 던전 생성기 (방 + 2칸 복도, 계단, 몬스터 무리)"
```

---

### Task 4: 층 진행 흐름과 렌더

**Files:**
- Modify: `src/render/render.ts` (`buildMap`을 층마다 다시 만들기 + 계단 구멍)
- Modify: `src/main.ts` (전체 교체)
- Modify: `index.html` (층 표시)

**Interfaces:**
- Consumes: `generateFloor`, `FLOORS` (`./sim/dungeon`), `createWorld(seed, map, power)`, `outcome`, `World.stairs`, `Entity.maxHp`
- Produces: 개발 모드 전용 디버그 핸들 `window.__game = { world, commands }` (헤드리스 확인용, 프로덕션 빌드에서 제거됨)

- [ ] **Step 1: `render.ts` — 층마다 맵 다시 만들기**

(1) `let sprites: Sprite[] = [];` 다음 줄에 추가:
```ts
let mapGroup = new THREE.Group(); // 현재 층의 바닥·벽·계단
```

(2) `initRender`에서 `buildMap(world);` 줄을 삭제.

(3) `setWorld` 함수 첫 줄에 추가:
```ts
  buildMap(world);
```

(4) `buildMap` 함수 전체를 교체:
```ts
function buildMap(world: World) {
  // 이전 층의 메시·지오메트리·재질·질감 해제
  mapGroup.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    o.geometry.dispose();
    const mat = o.material as THREE.MeshStandardMaterial;
    mat.map?.dispose();
    mat.dispose();
  });
  mapGroup.removeFromParent();
  mapGroup = new THREE.Group();
  const { w, h, blocked } = world.grid;
  const floorMap = stoneTexture(0x5a5f66, false);
  floorMap.repeat.set(w, h); // 1칸 = 텍스처 1장
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: floorMap, roughness: 1 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(w / 2, 0, h / 2);
  floor.receiveShadow = true;
  const walls = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 1.2, 1),
    new THREE.MeshStandardMaterial({ map: stoneTexture(0x5c6068, true), roughness: 1 }),
    blocked.reduce((n, b) => n + b, 0),
  );
  const m = new THREE.Matrix4();
  let i = 0;
  for (let z = 0; z < h; z++) for (let x = 0; x < w; x++) if (blocked[z * w + x]) walls.setMatrixAt(i++, m.makeTranslation(x + 0.5, 0.6, z + 0.5));
  walls.castShadow = walls.receiveShadow = true;
  mapGroup.add(floor, walls);
  if (world.stairs) {
    // ponytail: 임시 계단 = 검은 구멍. 2-B에서 FLARE 계단 그림으로 교체
    const hole = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0x000000 }));
    hole.rotation.x = -Math.PI / 2;
    hole.position.set(world.stairs[0] + 0.5, 0.005, world.stairs[1] + 0.5); // 스프라이트 바닥면(0.01)보다 아래
    mapGroup.add(hole);
  }
  scene.add(mapGroup);
}
```

- [ ] **Step 2: `index.html` — 층 표시**

`<style>` 안의 `#credits::backdrop { ... }` 줄 다음에 추가:
```css
      #floor { position: fixed; left: 16px; top: 12px; z-index: 2; font-size: 14px; color: #b8ab98; text-shadow: 0 1px 2px #000; pointer-events: none; }
      #floor-title { position: fixed; left: 0; right: 0; top: 30%; z-index: 2; text-align: center; font-size: 34px; letter-spacing: 4px; color: #e8dcc8; text-shadow: 0 2px 6px #000; pointer-events: none; opacity: 0; }
      #floor-title.show { animation: floor-title 2.4s ease-out; }
      @keyframes floor-title { 0% { opacity: 0; } 15%, 60% { opacity: 1; } 100% { opacity: 0; } }
```

`<div id="hp" class="bar"><i></i></div>` 줄 다음에 추가:
```html
    <div id="floor"></div>
    <div id="floor-title"></div>
```

- [ ] **Step 3: `src/main.ts` 전체 교체**

```ts
import { commands, hovered, initInput, pollInput } from './input';
import { draw, initRender, renderer, setWorld } from './render/render';
import { generateFloor } from './sim/dungeon';
import { createWorld, DT, outcome, STATS, step, type World } from './sim/world';

const $ = (sel: string) => document.querySelector<HTMLElement>(sel)!;
const heroFill = $('#hp i');
const target = $('#target');
const targetName = $('#target span');
const targetFill = $('#target i');
const banner = $('#banner');
const bannerText = $('#banner p');
const restartBtn = $('#restart');
const floorLabel = $('#floor');
const floorTitle = $('#floor-title');
const credits = document.querySelector<HTMLDialogElement>('#credits')!;
let floor = 1;
let world = makeFloor(floor);

// 층마다 새 시드(sim 밖이라 Math.random 사용). 층 배율 1, 1.2, 1.4 …
function makeFloor(n: number): World {
  const seed = Math.floor(Math.random() * 2 ** 31);
  return createWorld(seed, generateFloor(seed, n), 1 + 0.2 * (n - 1));
}

function showFloor() {
  floorLabel.textContent = floorTitle.textContent = `지하 ${floor}층`;
  floorTitle.classList.remove('show');
  void floorTitle.offsetWidth; // 애니메이션을 처음부터 다시 재생
  floorTitle.classList.add('show');
}

function enterFloor(n: number) {
  floor = n;
  world = makeFloor(n);
  setWorld(world);
  commands.length = 0; // 이전 층에서 쌓인 명령을 새 층에 적용하지 않는다
  showFloor();
}

try {
  await initRender(world);
} catch (err) {
  bannerText.textContent = `그림을 불러오지 못했습니다: ${err instanceof Error ? err.message : err}`;
  throw err;
}
banner.hidden = true;
initInput();
showFloor();
if (import.meta.env.DEV) Object.assign(window, { __game: { get world() { return world; }, commands } }); // 헤드리스 확인용

function restart() {
  const o = outcome(world);
  if (o === 'dead') enterFloor(floor); // 같은 층을 새 모양으로
  else if (o === 'clear') enterFloor(1);
}
addEventListener('keydown', (e) => e.code === 'KeyR' && restart()); // e.code: 한글 입력 상태에서도 물리 R 키
restartBtn.addEventListener('click', restart); // 모바일용

let acc = 0;
let last = performance.now();
requestAnimationFrame(function frame(now) {
  const dt = Math.min((now - last) / 1000, 0.25); // 탭 전환 후 복귀 시 수천 틱 몰아서 돌지 않게
  last = now;
  pollInput(world, dt);
  if (credits.open) acc = 0; // 크레딧을 읽는 동안은 게임을 멈춘다
  else for (acc += dt; acc >= DT; acc -= DT) step(world, commands.splice(0));
  if (outcome(world) === 'descend') enterFloor(floor + 1);
  draw(world, dt);
  hud();
  requestAnimationFrame(frame);
});

function hud() {
  const hero = world.entities[0];
  heroFill.style.width = `${(hero.hp / hero.maxHp) * 100}%`;
  const id = hovered ?? hero.target; // 마우스 오버가 없으면(모바일) 공격 중인 대상
  const m = id === null ? null : world.entities[id];
  target.hidden = !m;
  if (m) {
    targetName.textContent = STATS[m.kind].name;
    targetFill.style.width = `${(m.hp / m.maxHp) * 100}%`;
  }
  renderer.domElement.classList.toggle('attack', hovered !== null); // 몬스터 위에서는 공격 커서
  const o = outcome(world);
  banner.hidden = restartBtn.hidden = o !== 'dead' && o !== 'clear';
  if (o === 'dead') bannerText.textContent = '사망했습니다';
  if (o === 'clear') bannerText.textContent = '클리어!';
}
```

- [ ] **Step 4: 타입 검사·테스트·빌드**

Run: `npx tsc && npm test && npm run build`
Expected: 오류 없음, 54 PASS, 빌드 성공. 빌드 결과에 `__game`이 없는지 확인: `grep -c __game dist/assets/*.js` → 0.

- [ ] **Step 5: 헤드리스 확인 (개발 서버)**

`npx vite --port 5174 --strictPort`를 백그라운드로 띄우고 헤드리스 Chrome(puppeteer-core, 스크래치 폴더)으로 `http://localhost:5174/`:
1. 시작: 왼쪽 위 "지하 1층", 가운데 "지하 1층" 문구가 나타났다 사라진다. 스크린샷에서 방과 복도가 보이고 계단 칸이 검은 구멍이다.
2. `__game.world.entities[0].hp = 1e6`(죽지 않게) 후 `__game.commands.push({ type: 'move', x: 계단x + 0.5, z: 계단z + 0.5 })`를 1초마다 반복 → "지하 2층"으로 바뀌고 계단 위치가 달라진다(새 맵). 새 층의 주인공 체력바 100%(Review Focus 2·4).
3. 같은 방법으로 5층까지 내려간다. 5층은 `__game.world.stairs === null`. 몬스터를 모두 `state = 'dead'`로 만들면 "클리어!" → [다시 시작] 클릭 → "지하 1층".
4. 아무 층에서 주인공 `hp = 0; state = 'dead'` → "사망했습니다" → [다시 시작] → 같은 층 번호, 다른 맵, 체력 100%.
5. 층을 여러 번 바꾼 뒤 스크린샷에 이전 층의 벽이 겹쳐 보이지 않는다(Review Focus 3). 콘솔 오류 없음.

- [ ] **Step 6: 커밋**

```bash
git add src/render/render.ts src/main.ts index.html
git commit -m "feat: 5층 던전 진행 (계단, 층 표시, 사망 시 층 재생성, 5층 클리어)"
```
