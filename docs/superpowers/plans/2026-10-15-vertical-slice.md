# Drpg 1단계 버티컬 슬라이스 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 쿼터뷰 3D 화면에서 Knight를 클릭으로 이동시키고, 스켈레톤 8마리와 근접 전투를 하며, 사망/클리어 후 R로 재시작할 수 있는 브라우저 게임을 만든다.

**Architecture:** `src/sim/`은 three.js 없는 순수 게임 규칙(60Hz 고정 틱, 시드 PRNG, 커맨드 입력)이고, `src/render/`는 sim 상태를 읽어 three.js로 그리기만 한다. 입력은 `Command`로 변환되어 sim에 전달된다(멀티플레이 확장 지점).

**Tech Stack:** TypeScript 6.0, Vite 8.3.1, three.js 0.186.1, Vitest 4.1.11, KayKit Adventurers/Skeletons 1.0 (CC0 GLB)

**Spec:** `docs/superpowers/specs/2026-10-15-vertical-slice-design.md`

## Global Constraints

- Node 20.19 환경에서 동작해야 한다 (Vitest 5는 Node 22.12+ 요구 → Vitest 4.1.11 사용).
- 의존성 버전은 정확히 고정한다: `three@0.186.1`, `@types/three@0.186.0`, `typescript@6.0.3`, `vite@8.3.1`, `vitest@4.1.11`. 다른 런타임 의존성은 추가하지 않는다.
- `src/sim/**`는 `three`를 import하지 않는다.
- sim 상태 변경은 `step(world, commands)`로만 일어난다. render와 input은 sim 상태를 읽기만 한다(테스트 코드는 예외).
- sim 고정 틱 `DT = 1/60`. 난수는 `world.rng`(mulberry32) 하나만 사용한다. `Math.random` 금지.
- 1칸 = 1m, 맵 문자열의 행 = z, 열 = x. 칸 `(x, z)`의 중심은 `(x + 0.5, z + 0.5)`.
- 수치(스펙 3.4): 주인공 100HP/8–12/0.8초/4m/s, Minion 30HP/3–5/1.2초/2.5m/s ×6, Warrior 60HP/6–9/1.4초/2m/s ×2. 사거리 1.5m, 충돌 반경 0.4m, 인식 거리 8m, 타격 시점 40%, 경로 재계산 0.5초.
- 화면에 보이는 문구는 한국어.
- git push는 하지 않는다(사용자 확인 후 별도 진행).

## Review Focus

1. 잘못된 이동 좌표(NaN, 맵 밖, 벽 칸, 하늘 클릭) → 아무 일도 일어나지 않아야 한다. (Task 2 테스트 `잘못된 move 명령은 무시한다`, Task 5 수동 확인)
2. 이미 죽었거나 존재하지 않는 대상, 또는 주인공 자신에게 attack 명령 → 무시되어야 한다. (Task 3 테스트 `잘못된 attack 명령은 무시한다`)
3. 두 엔티티가 정확히 같은 좌표에 겹침 → 영원히 붙어 다니지 않고 분리되어야 한다. (Task 2 테스트 `완전히 겹친 두 엔티티도 분리한다`)
4. 한글 입력 상태에서 R 키 → `e.key`가 `'ㄱ'`이 되므로 `e.code === 'KeyR'`로 판정해야 재시작된다. (Task 5 수동 확인 단계)
5. 탭을 전환했다가 돌아옴(프레임 간격 수십 초) → 시뮬레이션이 수천 틱을 한꺼번에 돌며 멈추지 않아야 한다. dt를 0.25초로 제한. (Task 4 수동 확인 단계)

항목 4·5는 DOM/브라우저 동작이라 단위 테스트 대신 해당 Task의 수동 확인 단계로 고정한다.

## 파일 구성

| 파일 | 책임 |
|---|---|
| `package.json`, `tsconfig.json`, `.gitignore` | 프로젝트 설정 |
| `src/sim/path.ts` | `Grid` 타입, `walkable`, 8방향 A* `findPath` |
| `src/sim/path.test.ts` | 길찾기 테스트 |
| `src/sim/world.ts` | 엔티티/월드 타입, 상수, 맵, `createWorld`, `step`, `outcome` |
| `src/sim/world.test.ts` | 이동·충돌·전투·AI·재현성 테스트 |
| `public/models/*` | KayKit 모델·무기·텍스처·라이선스 |
| `src/render/render.ts` | 렌더러, 카메라, 조명, 맵 메시, 모델 로드, 애니메이션 동기화 |
| `index.html` | 캔버스 컨테이너, HUD(체력바, 대상 정보, 배너), 스타일 |
| `src/main.ts` | 부트스트랩, 게임 루프, HUD 갱신, 재시작 |
| `src/input.ts` | 포인터 → 레이캐스트 → `Command`, 마우스 오버 대상 |

---

### Task 1: 프로젝트 세팅과 길찾기

**Files:**
- Create: `package.json`, `tsconfig.json`, `.gitignore`
- Create: `src/sim/path.ts`
- Test: `src/sim/path.test.ts`

**Interfaces:**
- Consumes: 없음
- Produces:
  - `type Grid = { w: number; h: number; blocked: Uint8Array }` (`blocked[z * w + x]`가 1이면 벽)
  - `type Cell = [x: number, z: number]`
  - `walkable(g: Grid, x: number, z: number): boolean` (맵 밖이면 false)
  - `findPath(g: Grid, from: Cell, to: Cell): Cell[] | null` (양 끝 포함, 목표가 벽이거나 도달 불가면 null)

- [ ] **Step 1: 프로젝트 설정 파일 작성**

`package.json`:
```json
{
  "name": "drpg",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "test": "vitest run"
  }
}
```

`tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "es2023",
    "module": "esnext",
    "lib": ["ES2023", "DOM"],
    "types": ["vite/client"],
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "verbatimModuleSyntax": true,
    "moduleDetection": "force",
    "noEmit": true,
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "erasableSyntaxOnly": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["src"]
}
```

`.gitignore`:
```
node_modules
dist
```

- [ ] **Step 2: 의존성 설치**

Run:
```bash
npm install --save-exact three@0.186.1
npm install --save-exact -D @types/three@0.186.0 typescript@6.0.3 vite@8.3.1 vitest@4.1.11
```
Expected: 오류 없이 완료, `package.json`에 정확한 버전(`^` 없음)이 기록됨.

- [ ] **Step 3: 실패하는 테스트 작성**

`src/sim/path.test.ts`:
```ts
import { expect, test } from 'vitest';
import { findPath, walkable, type Cell, type Grid } from './path';

const grid = (rows: string[]): Grid => ({
  w: rows[0].length,
  h: rows.length,
  blocked: Uint8Array.from(rows.join(''), (c) => (c === '#' ? 1 : 0)),
});

// 연속한 칸이 8방향으로 한 칸씩이고, 벽을 밟거나 벽 모서리를 대각선으로 가로지르지 않는지 확인
function expectValid(g: Grid, p: Cell[]) {
  for (let i = 1; i < p.length; i++) {
    const [ax, az] = p[i - 1];
    const [bx, bz] = p[i];
    expect(Math.max(Math.abs(bx - ax), Math.abs(bz - az))).toBe(1);
    expect(walkable(g, bx, bz)).toBe(true);
    if (ax !== bx && az !== bz) expect(walkable(g, bx, az) && walkable(g, ax, bz)).toBe(true);
  }
}

test('벽을 돌아가는 최단 경로를 찾는다', () => {
  const g = grid(['.....', '.###.', '.....']);
  const p = findPath(g, [0, 1], [4, 1])!;
  expect(p[0]).toEqual([0, 1]);
  expect(p.at(-1)).toEqual([4, 1]);
  expect(p).toHaveLength(7);
  expectValid(g, p);
});

test('열린 공간에서는 대각선으로 간다', () => {
  const g = grid(['...', '...', '...']);
  expect(findPath(g, [0, 0], [2, 2])).toEqual([[0, 0], [1, 1], [2, 2]]);
});

test('시작과 목표가 같으면 그 칸 하나', () => {
  const g = grid(['...', '...']);
  expect(findPath(g, [1, 1], [1, 1])).toEqual([[1, 1]]);
});

test('목표가 벽이면 null', () => {
  const g = grid(['.#.', '...']);
  expect(findPath(g, [0, 0], [1, 0])).toBeNull();
});

test('막힌 방 안의 목표는 null', () => {
  const g = grid(['.....', '.###.', '.#.#.', '.###.']);
  expect(findPath(g, [0, 0], [2, 2])).toBeNull();
});

test('맵 밖 좌표는 walkable이 아니다', () => {
  const g = grid(['..', '..']);
  expect(walkable(g, -1, 0)).toBe(false);
  expect(walkable(g, 2, 0)).toBe(false);
  expect(walkable(g, 0, Number.NaN)).toBe(false);
});
```

- [ ] **Step 4: 테스트 실패 확인**

Run: `npm test`
Expected: FAIL — `./path` 모듈을 찾을 수 없음.

- [ ] **Step 5: 구현**

`src/sim/path.ts`:
```ts
// 격자 맵과 8방향 A* 길찾기. three.js 의존 없음.
export type Grid = { w: number; h: number; blocked: Uint8Array };
export type Cell = [x: number, z: number];

export const walkable = (g: Grid, x: number, z: number) =>
  x >= 0 && z >= 0 && x < g.w && z < g.h && g.blocked[z * g.w + x] === 0;

const DIRS: Cell[] = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

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
  const f = (i: number) => {
    const dx = Math.abs((i % g.w) - tx);
    const dz = Math.abs(Math.floor(i / g.w) - tz);
    return cost[i] + Math.max(dx, dz) + (Math.SQRT2 - 1) * Math.min(dx, dz); // octile 거리
  };
  const open = [start];
  cost[start] = 0;
  while (open.length) {
    // ponytail: open 목록 선형 탐색. 32x32 맵엔 충분, 맵이 커지면 이진 힙으로 교체
    let bi = 0;
    for (let i = 1; i < open.length; i++) if (f(open[i]) < f(open[bi])) bi = i;
    const cur = open[bi];
    open[bi] = open[open.length - 1];
    open.pop();
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
        open.push(ni);
      }
    }
  }
  return null;
}
```

- [ ] **Step 6: 테스트 통과 확인**

Run: `npm test`
Expected: PASS (6 tests)

- [ ] **Step 7: 커밋**

```bash
git add package.json package-lock.json tsconfig.json .gitignore src/sim/path.ts src/sim/path.test.ts
git commit -m "feat: 프로젝트 세팅과 8방향 A* 길찾기"
```

---

### Task 2: 월드 생성과 이동

**Files:**
- Create: `src/sim/world.ts`
- Test: `src/sim/world.test.ts`

**Interfaces:**
- Consumes: `Grid`, `Cell`, `walkable`, `findPath` (Task 1, `./path`)
- Produces (`./world`):
  - `type Kind = 'hero' | 'minion' | 'warrior'`
  - `type State = 'idle' | 'move' | 'attack' | 'dead'`
  - `type Command = { type: 'move'; x: number; z: number } | { type: 'attack'; targetId: number }`
  - `type Entity = { id; kind; x; z; facing; hp; state; path: [number, number][]; target: number | null; attackT; repathT }`
  - `type World = { grid: Grid; entities: Entity[]; rng: number }` — `entities[i].id === i`, 주인공은 항상 `entities[0]`
  - 상수 `DT, RANGE, RADIUS, AGGRO, HIT_AT, REPATH, STATS, MAP`
  - `createWorld(seed: number, map?: string[]): World`
  - `step(w: World, cmds: Command[]): void`

- [ ] **Step 1: 실패하는 테스트 작성**

`src/sim/world.test.ts`:
```ts
import { expect, test } from 'vitest';
import { findPath, walkable } from './path';
import { createWorld, MAP, RADIUS, step, type Command, type World } from './world';

// 첫 틱에만 명령을 넣고 n틱 진행
const run = (w: World, ticks: number, cmds: Command[] = []) => {
  step(w, cmds);
  for (let i = 1; i < ticks; i++) step(w, []);
};
const dist = (w: World, a: number, b: number) =>
  Math.hypot(w.entities[a].x - w.entities[b].x, w.entities[a].z - w.entities[b].z);

test('기본 맵: 32x32, 주인공 id 0, 졸개 6 전사 2, 모든 몬스터에 도달 가능', () => {
  const w = createWorld(1);
  expect(MAP).toHaveLength(32);
  expect(MAP.every((r) => r.length === 32)).toBe(true);
  expect([w.grid.w, w.grid.h]).toEqual([32, 32]);
  const [hero, ...monsters] = w.entities;
  expect(hero).toMatchObject({ id: 0, kind: 'hero', x: 7.5, z: 26.5, hp: 100, state: 'idle' });
  expect(monsters.filter((e) => e.kind === 'minion')).toHaveLength(6);
  expect(monsters.filter((e) => e.kind === 'warrior')).toHaveLength(2);
  w.entities.forEach((e, i) => expect(e.id).toBe(i));
  for (const m of monsters) {
    expect(findPath(w.grid, [7, 26], [Math.floor(m.x), Math.floor(m.z)])).not.toBeNull();
  }
});

test('H가 없는 맵은 오류', () => {
  expect(() => createWorld(1, ['...', '.m.'])).toThrow();
});

test('클릭한 지점까지 초속 4m로 이동하고 도착하면 idle', () => {
  const w = createWorld(1, ['..........', '.H........', '..........']);
  const hero = w.entities[0];
  run(w, 60, [{ type: 'move', x: 8.5, z: 1.5 }]);
  expect(hero.state).toBe('move');
  expect(hero.x).toBeCloseTo(5.5, 3);
  expect(hero.facing).toBeCloseTo(Math.PI / 2, 5); // +x 방향
  run(w, 60);
  expect([hero.x, hero.z]).toEqual([8.5, 1.5]);
  expect(hero.state).toBe('idle');
});

test('벽을 돌아서 이동하고 한 번도 벽 칸에 들어가지 않는다', () => {
  const w = createWorld(1, ['#######', '#H.#..#', '#..#..#', '#.....#', '#######']);
  const hero = w.entities[0];
  step(w, [{ type: 'move', x: 4.5, z: 1.5 }]);
  for (let i = 0; i < 300; i++) {
    step(w, []);
    expect(walkable(w.grid, Math.floor(hero.x), Math.floor(hero.z))).toBe(true);
  }
  expect([hero.x, hero.z]).toEqual([4.5, 1.5]);
});

test('잘못된 move 명령은 무시한다 (벽, 맵 밖, NaN)', () => {
  const w = createWorld(1, ['.#..', '.H..', '....']);
  const hero = w.entities[0];
  run(w, 10, [
    { type: 'move', x: 1.5, z: 0.5 },
    { type: 'move', x: -3, z: 1.5 },
    { type: 'move', x: 99, z: 99 },
    { type: 'move', x: Number.NaN, z: 1.5 },
  ]);
  expect(hero).toMatchObject({ x: 1.5, z: 1.5, state: 'idle', path: [] });
});

test('겹친 엔티티는 서로 밀어낸다', () => {
  const w = createWorld(1, ['H...............', '............m.m.']);
  const [, a, b] = w.entities;
  b.x = a.x + 0.3;
  b.z = a.z;
  step(w, []);
  expect(dist(w, 1, 2)).toBeCloseTo(RADIUS * 2, 5);
});

test('완전히 겹친 두 엔티티도 분리한다', () => {
  const w = createWorld(1, ['H...............', '............m.m.']);
  const [, a, b] = w.entities;
  b.x = a.x;
  b.z = a.z;
  step(w, []);
  expect(dist(w, 1, 2)).toBeGreaterThan(RADIUS * 2 - 1e-6);
});

test('밀려도 벽 칸으로는 들어가지 않는다', () => {
  const w = createWorld(1, ['################', 'm.............H.', '...............m']);
  const [, a] = w.entities;
  const b = w.entities[2];
  a.x = 0.5;
  a.z = 1.3;
  b.x = 0.5;
  b.z = 1.05;
  step(w, []);
  for (const e of [a, b]) expect(walkable(w.grid, Math.floor(e.x), Math.floor(e.z))).toBe(true);
  expect(b.z).toBe(1.05); // 위쪽(벽)으로 밀리지 못함
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm test`
Expected: FAIL — `./world` 모듈을 찾을 수 없음.

- [ ] **Step 3: 구현**

`src/sim/world.ts`:
```ts
// 게임 규칙(sim). three.js를 import하지 않는다. 상태 변경은 step()으로만 일어난다.
import { findPath, walkable, type Cell, type Grid } from './path';

export type Kind = 'hero' | 'minion' | 'warrior';
export type State = 'idle' | 'move' | 'attack' | 'dead';
export type Command = { type: 'move'; x: number; z: number } | { type: 'attack'; targetId: number };
type Point = [x: number, z: number];

export type Entity = {
  id: number;
  kind: Kind;
  x: number;
  z: number;
  facing: number; // 라디안, atan2(dx, dz). 0 = +z 방향
  hp: number;
  state: State;
  path: Point[]; // 남은 웨이포인트(월드 좌표)
  target: number | null; // 공격 대상 id
  attackT: number; // 현재 휘두르기 경과 시간(초)
  repathT: number; // 다음 경로 재계산까지 남은 시간(초)
};

export type World = { grid: Grid; entities: Entity[]; rng: number };

export const DT = 1 / 60;
export const RANGE = 1.5;
export const RADIUS = 0.4;
export const AGGRO = 8;
export const HIT_AT = 0.4;
export const REPATH = 0.5;

export const STATS: Record<Kind, { name: string; hp: number; dmg: [number, number]; interval: number; speed: number }> = {
  hero: { name: '기사', hp: 100, dmg: [8, 12], interval: 0.8, speed: 4 },
  minion: { name: '스켈레톤 졸개', hp: 30, dmg: [3, 5], interval: 1.2, speed: 2.5 },
  warrior: { name: '스켈레톤 전사', hp: 60, dmg: [6, 9], interval: 1.4, speed: 2 },
};

// '#' 벽, '.' 바닥, 'H' 주인공, 'm' 졸개, 'w' 전사
export const MAP = [
  '################################',
  '#..............#...............#',
  '#..............#...............#',
  '#...m....m.....#.......w.......#',
  '#..............#...............#',
  '#......##......#....m....m.....#',
  '#......##......................#',
  '#..............................#',
  '#..............#...............#',
  '#######.########...............#',
  '#..............#######.#########',
  '#..............................#',
  '#...##....##...................#',
  '#...##....##.......#....#......#',
  '#..................#....#......#',
  '#.........m........#..w.#......#',
  '#..................######......#',
  '#...##....##...................#',
  '#...##....##...................#',
  '#..............................#',
  '##########.###########.#########',
  '#..............#...............#',
  '#..............#...............#',
  '#....###.......#.......m.......#',
  '#..............#...............#',
  '#..............................#',
  '#......H.......................#',
  '#..............#...............#',
  '#..............#.......###.....#',
  '#..............#...............#',
  '#..............#...............#',
  '################################',
];

const SPAWN: Record<string, Kind | undefined> = { H: 'hero', m: 'minion', w: 'warrior' };

export function createWorld(seed: number, map: string[] = MAP): World {
  const w = map[0].length;
  const grid: Grid = { w, h: map.length, blocked: new Uint8Array(w * map.length) };
  const spawns: { kind: Kind; x: number; z: number }[] = [];
  map.forEach((row, z) =>
    [...row].forEach((c, x) => {
      const kind = SPAWN[c];
      if (c === '#') grid.blocked[z * w + x] = 1;
      else if (kind) spawns.push({ kind, x: x + 0.5, z: z + 0.5 });
    }),
  );
  spawns.sort((a, b) => Number(b.kind === 'hero') - Number(a.kind === 'hero')); // 주인공 = id 0 (안정 정렬)
  if (spawns[0]?.kind !== 'hero') throw new Error('맵에 주인공(H)이 없습니다');
  const entities = spawns.map(
    (s, id): Entity => ({ id, ...s, facing: 0, hp: STATS[s.kind].hp, state: 'idle', path: [], target: null, attackT: 0, repathT: 0 }),
  );
  return { grid, entities, rng: seed };
}

export function step(w: World, cmds: Command[]): void {
  const hero = w.entities[0];
  for (const c of cmds) command(w, hero, c);
  for (const e of w.entities) if (e.state !== 'dead') act(w, e);
  separate(w);
}

function command(w: World, hero: Entity, c: Command) {
  if (hero.state === 'dead' || c.type !== 'move') return;
  const p = findPath(w.grid, cellOf(hero), [Math.floor(c.x), Math.floor(c.z)]);
  if (!p) return;
  hero.path = waypoints(p, c.x, c.z);
  hero.state = 'move';
}

function act(w: World, e: Entity) {
  if (e.path.length) walk(w, e);
  else e.state = 'idle';
}

const cellOf = (e: Entity): Cell => [Math.floor(e.x), Math.floor(e.z)];

// 칸 경로 → 월드 좌표 웨이포인트. 시작 칸은 빼고, 마지막은 정확한 목표 지점.
const waypoints = (cells: Cell[], x: number, z: number): Point[] => [
  ...cells.slice(1, -1).map(([cx, cz]): Point => [cx + 0.5, cz + 0.5]),
  [x, z],
];

function walk(w: World, e: Entity) {
  e.state = 'move';
  let budget = STATS[e.kind].speed * DT;
  while (budget > 0 && e.path.length) {
    const [px, pz] = e.path[0];
    const dx = px - e.x;
    const dz = pz - e.z;
    const d = Math.hypot(dx, dz);
    if (d > 1e-6) e.facing = Math.atan2(dx, dz);
    if (d <= budget) {
      e.x = px;
      e.z = pz;
      budget -= d;
      e.path.shift();
      continue;
    }
    const nx = e.x + (dx / d) * budget;
    const nz = e.z + (dz / d) * budget;
    // 충돌로 밀려난 뒤 직선 이동이 벽을 가로지르면 경로를 버린다(추적자는 다음 재계산 때 새 경로)
    if (!walkable(w.grid, Math.floor(nx), Math.floor(nz))) {
      e.path = [];
      return;
    }
    e.x = nx;
    e.z = nz;
    budget = 0;
  }
}

// 살아 있는 엔티티끼리 반경 RADIUS 원이 겹치지 않게 반씩 밀어낸다. 벽 칸으로는 밀리지 않는다.
// ponytail: O(n²) 쌍 검사. 엔티티 수백 개부터는 공간 해시로 교체
function separate(w: World) {
  const alive = w.entities.filter((e) => e.state !== 'dead');
  for (let i = 0; i < alive.length; i++) {
    for (let j = i + 1; j < alive.length; j++) {
      const a = alive[i];
      const b = alive[j];
      const d = Math.hypot(b.x - a.x, b.z - a.z);
      if (d >= RADIUS * 2) continue;
      const [ux, uz] = d < 1e-6 ? [1, 0] : [(b.x - a.x) / d, (b.z - a.z) / d]; // 완전히 겹치면 x축으로 벌린다
      const push = (RADIUS * 2 - d) / 2;
      nudge(w, a, -ux * push, -uz * push);
      nudge(w, b, ux * push, uz * push);
    }
  }
}

function nudge(w: World, e: Entity, dx: number, dz: number) {
  if (!walkable(w.grid, Math.floor(e.x + dx), Math.floor(e.z + dz))) return;
  e.x += dx;
  e.z += dz;
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm test`
Expected: PASS (path 6 + world 8)

- [ ] **Step 5: 타입 검사**

Run: `npx tsc`
Expected: 출력 없이 종료 코드 0.

- [ ] **Step 6: 커밋**

```bash
git add src/sim/world.ts src/sim/world.test.ts
git commit -m "feat: 월드 생성, 클릭 이동, 엔티티 충돌 분리"
```

---

### Task 3: 전투, 몬스터 AI, 결과 판정

**Files:**
- Modify: `src/sim/world.ts` (`step`, `command`, `act` 교체, 함수 추가)
- Test: `src/sim/world.test.ts` (테스트 추가)

**Interfaces:**
- Consumes: Task 2의 `world.ts` 전체
- Produces:
  - `outcome(w: World): 'dead' | 'clear' | null`
  - `step`이 `{ type: 'attack', targetId }` 명령, 몬스터 AI, 타격·사망을 처리
  - 공격 중 `e.state === 'attack'`, `e.attackT`는 현재 휘두르기 경과 시간(0 ~ `STATS[kind].interval`) — render가 애니메이션 동기화에 사용

- [ ] **Step 1: 실패하는 테스트 추가**

`src/sim/world.test.ts` 맨 위 import를 다음으로 교체:
```ts
import { expect, test } from 'vitest';
import { findPath, walkable } from './path';
import { createWorld, MAP, outcome, RADIUS, STATS, step, type Command, type World } from './world';
```

파일 끝에 추가:
```ts
const DUEL = ['.....', '.Hm..', '.....']; // 주인공 (1.5,1.5), 졸개 (2.5,1.5) 거리 1m

test('공격은 휘두르기 40% 시점에 들어가고 데미지는 8~12', () => {
  const w = createWorld(1, DUEL);
  const m = w.entities[1];
  run(w, 15, [{ type: 'attack', targetId: 1 }]);
  expect(w.entities[0].state).toBe('attack');
  expect(m.hp).toBe(30);
  run(w, 10);
  expect(m.hp).toBeGreaterThanOrEqual(30 - 12);
  expect(m.hp).toBeLessThanOrEqual(30 - 8);
});

test('타격 순간 사거리 밖이면 빗나간다', () => {
  const w = createWorld(1, DUEL);
  const m = w.entities[1];
  run(w, 5, [{ type: 'attack', targetId: 1 }]);
  m.x = 4.5; // 3m 떨어뜨림 (졸개도 자기 휘두르기 중이라 그 자리에 있음)
  run(w, 20);
  expect(m.hp).toBe(30);
  expect(w.entities[0].hp).toBe(100);
});

test('대상을 죽이면 시체가 남고 주인공은 공격을 멈춘다, 전멸이면 clear', () => {
  const w = createWorld(1, DUEL);
  const [hero, m] = w.entities;
  run(w, 600, [{ type: 'attack', targetId: 1 }]);
  expect(m).toMatchObject({ hp: 0, state: 'dead', x: 2.5, z: 1.5 });
  expect(hero).toMatchObject({ state: 'idle', target: null });
  expect(hero.hp).toBeGreaterThan(0);
  expect(outcome(w)).toBe('clear');
});

test('잘못된 attack 명령은 무시한다 (없는 id, 자기 자신, 시체)', () => {
  const w = createWorld(1, ['H.........m']); // 졸개는 10m 밖이라 반응하지 않음
  const [hero, m] = w.entities;
  m.state = 'dead';
  m.hp = 0;
  run(w, 5, [
    { type: 'attack', targetId: 99 },
    { type: 'attack', targetId: -1 },
    { type: 'attack', targetId: 0 },
    { type: 'attack', targetId: 1 },
  ]);
  expect(hero).toMatchObject({ target: null, state: 'idle' });
});

test('몬스터는 8m 안의 주인공만 쫓는다', () => {
  const w = createWorld(1, ['............', 'H......m...w', '............']);
  const [, m, wr] = w.entities;
  run(w, 30);
  expect(m.state).toBe('move');
  expect(m.x).toBeLessThan(7.5);
  expect(wr).toMatchObject({ state: 'idle', x: 11.5, target: null });
});

test('주인공이 죽으면 dead, 몬스터는 멈추고 명령은 무시된다', () => {
  const w = createWorld(1, ['.....', '.Hw..', '.....']);
  const [hero, wr] = w.entities;
  hero.hp = 5;
  run(w, 200);
  expect(hero.state).toBe('dead');
  expect(outcome(w)).toBe('dead');
  expect(wr).toMatchObject({ state: 'idle', target: null });
  run(w, 5, [{ type: 'move', x: 4.5, z: 0.5 }, { type: 'attack', targetId: 1 }]);
  expect(hero).toMatchObject({ x: 1.5, z: 1.5, path: [], target: null });
});

test('같은 시드와 같은 명령이면 결과가 같고, 아무도 벽에 들어가거나 체력이 음수가 되지 않는다', () => {
  const play = () => {
    const w = createWorld(7);
    for (let i = 0; i < 1800; i++) {
      const cmds: Command[] = i % 300 === 0 ? [{ type: 'attack', targetId: 1 + ((i / 300) % 8) }] : [];
      step(w, cmds);
      for (const e of w.entities) {
        expect(walkable(w.grid, Math.floor(e.x), Math.floor(e.z))).toBe(true);
        expect(e.hp).toBeGreaterThanOrEqual(0);
      }
    }
    return w;
  };
  const a = play();
  const b = play();
  expect(JSON.stringify(a.entities)).toBe(JSON.stringify(b.entities));
  expect(a.rng).toBe(b.rng);
  expect(a.entities.some((e) => e.hp < STATS[e.kind].hp)).toBe(true); // 전투가 실제로 일어났는지
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm test`
Expected: FAIL — `outcome`이 export되지 않음(import 오류).

- [ ] **Step 3: 구현 — `step` 교체**

`src/sim/world.ts`의 기존 `step` 함수 전체를 다음으로 교체:
```ts
export function step(w: World, cmds: Command[]): void {
  const hero = w.entities[0];
  for (const c of cmds) command(w, hero, c);
  for (const e of w.entities) {
    if (e.state === 'dead') continue; // 같은 틱 앞 순서에서 죽었을 수도 있음
    if (e !== hero) think(e, hero);
    act(w, e);
  }
  separate(w);
}

export function outcome(w: World): 'dead' | 'clear' | null {
  if (w.entities[0].state === 'dead') return 'dead';
  return w.entities.every((e) => e.kind === 'hero' || e.state === 'dead') ? 'clear' : null;
}
```

- [ ] **Step 4: 구현 — `command` 교체**

기존 `command` 함수 전체를 다음으로 교체:
```ts
function command(w: World, hero: Entity, c: Command) {
  if (hero.state === 'dead') return;
  if (c.type === 'attack') {
    const t = w.entities[c.targetId];
    if (!t || t === hero || t.state === 'dead') return;
    hero.target = t.id;
    hero.repathT = 0; // 다음 act에서 즉시 경로 계산
    return;
  }
  const p = findPath(w.grid, cellOf(hero), [Math.floor(c.x), Math.floor(c.z)]);
  if (!p) return;
  hero.path = waypoints(p, c.x, c.z);
  hero.target = null;
  hero.state = 'move'; // 휘두르는 중이었다면 취소
  hero.attackT = 0;
}
```

- [ ] **Step 5: 구현 — `act` 교체와 전투·AI 함수 추가**

기존 `act` 함수 전체를 다음으로 교체:
```ts
function act(w: World, e: Entity) {
  let t = e.target === null ? null : w.entities[e.target];
  if (t && t.state === 'dead') {
    e.target = null;
    e.path = [];
    t = null;
  }
  if (e.state === 'attack') return swing(w, e, t);
  if (t) {
    if (dist(e, t) <= RANGE) return startSwing(e, t);
    if ((e.repathT -= DT) <= 0) {
      e.repathT = REPATH;
      const p = findPath(w.grid, cellOf(e), cellOf(t));
      e.path = p ? waypoints(p, t.x, t.z) : [];
    }
  }
  if (e.path.length) walk(w, e);
  else e.state = 'idle';
}

// 몬스터 AI: 주인공이 AGGRO 안에 들어오면 대상으로 삼는다. 주인공이 죽으면 대상을 버린다.
function think(e: Entity, hero: Entity) {
  if (hero.state === 'dead') {
    e.target = null;
    e.path = [];
    return;
  }
  if (e.target === null && dist(e, hero) <= AGGRO) {
    e.target = hero.id;
    e.repathT = 0;
  }
}

function startSwing(e: Entity, t: Entity) {
  e.state = 'attack';
  e.attackT = 0;
  e.path = [];
  face(e, t);
}

// 휘두르기 진행. HIT_AT 시점에 사거리 안이면 타격. 끝났을 때 대상이 여전히 사거리 안이면 바로 다음 휘두르기.
function swing(w: World, e: Entity, t: Entity | null) {
  const s = STATS[e.kind];
  const hitAt = s.interval * HIT_AT;
  const before = e.attackT;
  e.attackT += DT;
  if (t) face(e, t);
  if (t && before < hitAt && e.attackT >= hitAt && dist(e, t) <= RANGE) damage(w, e, t);
  if (e.attackT < s.interval) return;
  if (t && t.state !== 'dead' && dist(e, t) <= RANGE) {
    e.attackT -= s.interval;
  } else {
    e.state = 'idle';
    e.attackT = 0;
  }
}

function damage(w: World, a: Entity, t: Entity) {
  const [lo, hi] = STATS[a.kind].dmg;
  t.hp = Math.max(0, t.hp - (lo + Math.floor(rand(w) * (hi - lo + 1))));
  if (t.hp > 0) return;
  t.state = 'dead';
  t.path = [];
  t.target = null;
}

// mulberry32. 상태가 world.rng에 있어서 같은 시드 = 같은 난수열.
function rand(w: World) {
  let t = (w.rng = (w.rng + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

const dist = (a: Entity, b: Entity) => Math.hypot(a.x - b.x, a.z - b.z);

function face(e: Entity, t: Entity) {
  e.facing = Math.atan2(t.x - e.x, t.z - e.z);
}
```

- [ ] **Step 6: 테스트 통과 확인**

Run: `npm test`
Expected: PASS (path 6 + world 15)

- [ ] **Step 7: 타입 검사**

Run: `npx tsc`
Expected: 출력 없이 종료 코드 0.

- [ ] **Step 8: 커밋**

```bash
git add src/sim/world.ts src/sim/world.test.ts
git commit -m "feat: 근접 전투, 몬스터 추적 AI, 사망/클리어 판정"
```

---

### Task 4: 렌더링과 에셋

**Files:**
- Create: `public/models/` (KayKit 파일 9개 + 라이선스)
- Create: `index.html`
- Create: `src/render/render.ts`
- Create: `src/main.ts`

**Interfaces:**
- Consumes: `World`, `Entity`, `Kind`, `STATS`, `DT`, `createWorld`, `step`, `outcome` (`./sim/world`)
- Produces (`./render/render`):
  - `renderer: THREE.WebGLRenderer`, `camera: THREE.OrthographicCamera`
  - `initRender(world: World): Promise<void>` — 캔버스 추가, 맵 메시 생성, 모델 로드, 액터 생성. 모델 누락·애니메이션 누락 시 reject
  - `setWorld(world: World): void` — 재시작 시 액터 재생성
  - `draw(world: World, dt: number): void`

- [ ] **Step 1: 에셋 다운로드**

Run:
```bash
mkdir -p public/models
A=https://raw.githubusercontent.com/KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0/main/addons/kaykit_character_pack_adventures
S=https://raw.githubusercontent.com/KayKit-Game-Assets/KayKit-Character-Pack-Skeletons-1.0/main/addons/kaykit_character_pack_skeletons
curl -fL -o public/models/Knight.glb "$A/Characters/gltf/Knight.glb"
curl -fL -o public/models/Skeleton_Minion.glb "$S/Characters/gltf/Skeleton_Minion.glb"
curl -fL -o public/models/Skeleton_Warrior.glb "$S/Characters/gltf/Skeleton_Warrior.glb"
for f in Skeleton_Blade.gltf Skeleton_Blade.bin Skeleton_Axe.gltf Skeleton_Axe.bin skeleton_texture.png; do
  curl -fL -o "public/models/$f" "$S/Assets/gltf/$f"
done
curl -fL -o public/models/LICENSE-KayKit-Adventurers.txt "$A/LICENSE.txt"
curl -fL -o public/models/LICENSE-KayKit-Skeletons.txt "$S/LICENSE.txt"
ls -la public/models
```
Expected: 10개 파일. GLB 3개는 각각 3.5~5MB, `.gltf`는 약 3KB.

- [ ] **Step 2: `index.html` 작성**

```html
<!doctype html>
<html lang="ko">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Drpg</title>
    <style>
      html, body { margin: 0; height: 100%; overflow: hidden; background: #0b0a09; color: #e8dcc8; font: 14px system-ui, sans-serif; }
      canvas { display: block; }
      [hidden] { display: none !important; }
      .bar { width: 240px; height: 14px; background: #2a1414; border: 1px solid #000; }
      .bar i { display: block; width: 100%; height: 100%; background: #b3261e; }
      #hp { position: fixed; left: 20px; bottom: 20px; pointer-events: none; }
      #target { position: fixed; top: 16px; left: 50%; transform: translateX(-50%); text-align: center; pointer-events: none; }
      #target span { display: block; margin-bottom: 4px; text-shadow: 0 1px 2px #000; }
      #banner { position: fixed; inset: 0; display: grid; place-items: center; font-size: 28px; background: #0008; pointer-events: none; }
    </style>
  </head>
  <body>
    <div id="target" hidden><span></span><div class="bar"><i></i></div></div>
    <div id="hp" class="bar"><i></i></div>
    <div id="banner">불러오는 중…</div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

- [ ] **Step 3: `src/render/render.ts` 작성**

```ts
// three.js 렌더링. sim 상태를 읽기만 하고 수정하지 않는다.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { STATS, type Entity, type Kind, type World } from '../sim/world';

const SCALE = 0.7; // KayKit 캐릭터 키 약 2.3 → 약 1.6m
const FADE = 0.15;
const HIT_SHOW = 0.3; // 피격 모션을 보여줄 시간(초)
const ATTACK = '1H_Melee_Attack_Chop';
const ONCE = new Set(['Death_A', 'Hit_A']);

const MODELS: Record<Kind, { url: string; move: string; hide?: string[]; weapon?: string }> = {
  // Knight GLB에는 무기·방패가 전부 붙어 있어서 한손검 + 둥근 방패만 남긴다
  hero: { url: 'models/Knight.glb', move: 'Running_A', hide: ['1H_Sword_Offhand', 'Badge_Shield', 'Rectangle_Shield', 'Spike_Shield', '2H_Sword'] },
  // 스켈레톤 GLB에는 무기가 없어서 오른손 슬롯에 붙인다
  minion: { url: 'models/Skeleton_Minion.glb', move: 'Walking_D_Skeletons', weapon: 'models/Skeleton_Blade.gltf' },
  warrior: { url: 'models/Skeleton_Warrior.glb', move: 'Walking_D_Skeletons', weapon: 'models/Skeleton_Axe.gltf' },
};

type Actor = { obj: THREE.Object3D; mixer: THREE.AnimationMixer; clips: THREE.AnimationClip[]; clip: string; hp: number; hitT: number };

export const renderer = new THREE.WebGLRenderer({ antialias: true });
export const camera = new THREE.OrthographicCamera();
const scene = new THREE.Scene();
const sun = new THREE.DirectionalLight(0xfff1dd, 2.5);
const loader = new GLTFLoader();
const protos = new Map<Kind, { scene: THREE.Object3D; clips: THREE.AnimationClip[] }>();
const focus = new THREE.Vector3();
const tmp = new THREE.Vector3();
// 수평 45°, 내려다보는 각 40°(극각 50°), 거리 30
const CAM_OFFSET = new THREE.Vector3().setFromSphericalCoords(30, THREE.MathUtils.degToRad(50), THREE.MathUtils.degToRad(45));
const SUN_OFFSET = new THREE.Vector3(-8, 15, 6);
let actors: Actor[] = [];
let zoom = 9; // 화면 세로 절반에 보이는 월드 길이(m)

export async function initRender(world: World) {
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  document.body.prepend(renderer.domElement);
  scene.background = new THREE.Color(0x0b0a09);
  scene.add(new THREE.HemisphereLight(0xbfd4ff, 0x2a2018, 1.2));
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -16, right: 16, top: 16, bottom: -16, near: 1, far: 50 });
  sun.shadow.camera.updateProjectionMatrix();
  scene.add(sun, sun.target);
  buildMap(world);
  addEventListener('resize', resize);
  renderer.domElement.addEventListener(
    'wheel',
    (e) => {
      zoom = THREE.MathUtils.clamp(zoom * (e.deltaY > 0 ? 1.1 : 0.9), 5, 16);
      resize();
    },
    { passive: true },
  );
  resize();
  await Promise.all((Object.keys(MODELS) as Kind[]).map(loadKind));
  setWorld(world);
}

export function setWorld(world: World) {
  for (const a of actors) {
    a.mixer.stopAllAction();
    a.obj.removeFromParent();
  }
  actors = world.entities.map(makeActor);
  focus.set(world.entities[0].x, 0, world.entities[0].z);
}

export function draw(world: World, dt: number) {
  for (const e of world.entities) {
    const a = actors[e.id];
    a.obj.position.set(e.x, 0, e.z);
    a.obj.rotation.y = e.facing; // 모델은 +z를 바라본다
    if (e.hp < a.hp && e.state !== 'attack') a.hitT = HIT_SHOW;
    a.hp = e.hp;
    a.hitT -= dt;
    play(a, clipFor(e, a));
    if (e.state === 'attack') {
      // 공격 모션 진행을 sim의 휘두르기 진행도에 맞춘다
      const act = action(a, ATTACK);
      act.timeScale = 0;
      act.time = Math.min(e.attackT / STATS[e.kind].interval, 1) * act.getClip().duration;
    }
    a.mixer.update(dt);
  }
  const hero = world.entities[0];
  focus.lerp(tmp.set(hero.x, 0, hero.z), 1 - Math.exp(-8 * dt));
  camera.position.copy(focus).add(CAM_OFFSET);
  camera.lookAt(focus);
  sun.position.copy(focus).add(SUN_OFFSET);
  sun.target.position.copy(focus);
  renderer.render(scene, camera);
}

function resize() {
  const aspect = innerWidth / innerHeight;
  Object.assign(camera, { left: -zoom * aspect, right: zoom * aspect, top: zoom, bottom: -zoom, near: 1, far: 100 });
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
}

function buildMap(world: World) {
  const { w, h, blocked } = world.grid;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ color: 0x4a4038 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(w / 2, 0, h / 2);
  floor.receiveShadow = true;
  // ponytail: GridHelper는 정사각형만 지원. 직사각형 맵이 생기면 LineSegments로 교체
  const lines = new THREE.GridHelper(Math.max(w, h), Math.max(w, h), 0x2e2722, 0x2e2722);
  lines.position.set(w / 2, 0.01, h / 2);
  const walls = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 1.2, 1),
    new THREE.MeshStandardMaterial({ color: 0x6b6158 }),
    blocked.reduce((n, b) => n + b, 0),
  );
  const m = new THREE.Matrix4();
  let i = 0;
  for (let z = 0; z < h; z++) for (let x = 0; x < w; x++) if (blocked[z * w + x]) walls.setMatrixAt(i++, m.makeTranslation(x + 0.5, 0.6, z + 0.5));
  walls.castShadow = walls.receiveShadow = true;
  scene.add(floor, lines, walls);
}

async function loadKind(kind: Kind) {
  const m = MODELS[kind];
  const gltf = await loader.loadAsync(m.url);
  const find = (name: string) => {
    const o = gltf.scene.getObjectByName(name);
    if (!o) throw new Error(`${m.url}: '${name}' 노드가 없습니다`);
    return o;
  };
  for (const name of m.hide ?? []) find(name).removeFromParent();
  if (m.weapon) {
    // GLTFLoader는 노드 이름에서 '.'을 지운다 (handslot.r → handslotr)
    const hand = gltf.scene.getObjectByName('handslot.r') ?? find('handslotr');
    hand.add((await loader.loadAsync(m.weapon)).scene);
  }
  for (const clip of ['Idle', m.move, ATTACK, 'Hit_A', 'Death_A']) {
    if (!THREE.AnimationClip.findByName(gltf.animations, clip)) throw new Error(`${m.url}: '${clip}' 애니메이션이 없습니다`);
  }
  gltf.scene.traverse((o) => (o.castShadow = true));
  protos.set(kind, { scene: gltf.scene, clips: gltf.animations });
}

function makeActor(e: Entity): Actor {
  const proto = protos.get(e.kind)!;
  const obj = clone(proto.scene); // 스킨드 메시는 SkeletonUtils.clone으로 복제해야 뼈대가 분리된다
  obj.scale.setScalar(SCALE);
  scene.add(obj);
  return { obj, mixer: new THREE.AnimationMixer(obj), clips: proto.clips, clip: '', hp: e.hp, hitT: 0 };
}

const action = (a: Actor, name: string) => a.mixer.clipAction(THREE.AnimationClip.findByName(a.clips, name)!);

function clipFor(e: Entity, a: Actor) {
  if (e.state === 'dead') return 'Death_A';
  if (a.hitT > 0) return 'Hit_A';
  if (e.state === 'attack') return ATTACK;
  if (e.state === 'move') return MODELS[e.kind].move;
  return 'Idle';
}

function play(a: Actor, name: string) {
  if (a.clip === name) return;
  const next = action(a, name);
  next.setLoop(ONCE.has(name) ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
  next.clampWhenFinished = ONCE.has(name);
  next.reset().play();
  if (a.clip) next.crossFadeFrom(action(a, a.clip), FADE, false);
  a.clip = name;
}
```

- [ ] **Step 4: `src/main.ts` 작성 (입력 없이 화면만)**

```ts
import { draw, initRender } from './render/render';
import { createWorld, DT, step } from './sim/world';

const SEED = 1;
const banner = document.querySelector<HTMLElement>('#banner')!;
const world = createWorld(SEED);

try {
  await initRender(world);
} catch (err) {
  banner.textContent = `모델을 불러오지 못했습니다: ${err instanceof Error ? err.message : err}`;
  throw err;
}
banner.hidden = true;

let acc = 0;
let last = performance.now();
requestAnimationFrame(function frame(now) {
  const dt = Math.min((now - last) / 1000, 0.25); // 탭 전환 후 복귀 시 수천 틱 몰아서 돌지 않게
  last = now;
  for (acc += dt; acc >= DT; acc -= DT) step(world, []);
  draw(world, dt);
  requestAnimationFrame(frame);
});
```

- [ ] **Step 5: 빌드 확인**

Run: `npm run build`
Expected: `tsc` 오류 없음, `vite build` 완료, `dist/` 생성. (번들 500kB 초과 경고는 무시)

Run: `npm test`
Expected: PASS (기존 21개 그대로)

- [ ] **Step 6: 화면 수동 확인**

Run: `npm run dev` 후 출력된 주소(기본 `http://localhost:5173`)를 브라우저로 연다.
확인:
1. "불러오는 중…"이 사라지고 갈색 바닥, 격자선, 회색 벽 블록이 쿼터뷰로 보인다.
2. 화면 중앙 부근에 Knight가 한손검 + 방패 하나만 든 채 Idle 모션을 한다(방패·검이 여러 개 겹쳐 보이면 실패).
3. 휠로 확대·축소된다.
4. 몬스터는 카메라 범위 밖에 있으므로 이 단계에서는 보이지 않아도 정상. 확인하려면 `zoom` 최대(16)로 축소.
5. 개발자 도구 콘솔에 오류가 없다.
6. 다른 탭으로 1분 이상 갔다가 돌아와도 화면이 멈추거나 느려지지 않는다(Review Focus 5).
7. `public/models/Knight.glb` 이름을 잠시 바꾸고 새로고침하면 "모델을 불러오지 못했습니다: …"가 표시된다. 확인 후 원래 이름으로 되돌린다.

- [ ] **Step 7: 커밋**

```bash
git add public/models index.html src/render/render.ts src/main.ts
git commit -m "feat: 쿼터뷰 렌더링, KayKit 모델·애니메이션 연동"
```

---

### Task 5: 입력과 HUD

**Files:**
- Create: `src/input.ts`
- Modify: `src/main.ts` (전체 교체)

**Interfaces:**
- Consumes: `renderer`, `camera`, `initRender`, `setWorld`, `draw` (`./render/render`), `Command`, `World`, `STATS`, `DT`, `createWorld`, `step`, `outcome` (`./sim/world`)
- Produces (`./input`):
  - `commands: Command[]` — 아직 sim에 전달되지 않은 명령 큐
  - `hovered: number | null` — 마우스가 올라간 살아 있는 몬스터 id
  - `initInput(): void`, `pollInput(world: World, dt: number): void`

- [ ] **Step 1: `src/input.ts` 작성**

```ts
// 마우스 입력 → sim 명령. 몬스터 위 클릭은 attack, 땅 클릭·누르고 있기는 move.
import * as THREE from 'three';
import { camera, renderer } from './render/render';
import type { Command, World } from './sim/world';

const REPEAT = 0.15; // 누르고 있을 때 move 재발행 간격(초)
const PICK_RADIUS = 0.5; // 몬스터 선택 판정 반경(m)
const ray = new THREE.Raycaster();
const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const pointer = new THREE.Vector2();
const hit = new THREE.Vector3();
const a = new THREE.Vector3();
const b = new THREE.Vector3();
let held = false;
let clicked = false;
let repeatT = 0;

export const commands: Command[] = [];
export let hovered: number | null = null;

export function initInput() {
  const el = renderer.domElement;
  el.addEventListener('pointermove', setPointer);
  el.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    setPointer(e);
    held = clicked = true;
    repeatT = 0;
  });
  addEventListener('pointerup', () => (held = false));
  addEventListener('blur', () => (held = false));
}

function setPointer(e: PointerEvent) {
  const r = renderer.domElement.getBoundingClientRect();
  pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
}

export function pollInput(world: World, dt: number) {
  ray.setFromCamera(pointer, camera);
  hovered = pick(world);
  if (clicked && hovered !== null) {
    commands.push({ type: 'attack', targetId: hovered });
    held = false; // 몬스터 클릭은 이동 반복을 시작하지 않는다(공격은 sim이 대상이 죽을 때까지 반복)
  }
  clicked = false;
  if (held && (repeatT -= dt) <= 0) {
    repeatT = REPEAT;
    if (ray.ray.intersectPlane(ground, hit)) commands.push({ type: 'move', x: hit.x, z: hit.z });
  }
}

// 각 몬스터를 세로 선분(발목~머리)으로 보고, 마우스 광선과 가장 가까운 것을 고른다
function pick(world: World): number | null {
  let best: number | null = null;
  let bestD = PICK_RADIUS ** 2;
  for (const e of world.entities) {
    if (e.kind === 'hero' || e.state === 'dead') continue;
    const d = ray.ray.distanceSqToSegment(a.set(e.x, 0.2, e.z), b.set(e.x, 1.5, e.z));
    if (d < bestD) {
      bestD = d;
      best = e.id;
    }
  }
  return best;
}
```

- [ ] **Step 2: `src/main.ts` 전체 교체**

```ts
import { commands, hovered, initInput, pollInput } from './input';
import { draw, initRender, renderer, setWorld } from './render/render';
import { createWorld, DT, outcome, STATS, step } from './sim/world';

const SEED = 1;
const $ = (sel: string) => document.querySelector<HTMLElement>(sel)!;
const heroFill = $('#hp i');
const target = $('#target');
const targetName = $('#target span');
const targetFill = $('#target i');
const banner = $('#banner');
let world = createWorld(SEED);

try {
  await initRender(world);
} catch (err) {
  banner.textContent = `모델을 불러오지 못했습니다: ${err instanceof Error ? err.message : err}`;
  throw err;
}
banner.hidden = true;
initInput();

addEventListener('keydown', (e) => {
  // e.code: 한글 입력 상태에서도 물리 R 키로 인식된다
  if (e.code !== 'KeyR' || !outcome(world)) return;
  world = createWorld(SEED);
  setWorld(world);
  commands.length = 0;
});

let acc = 0;
let last = performance.now();
requestAnimationFrame(function frame(now) {
  const dt = Math.min((now - last) / 1000, 0.25); // 탭 전환 후 복귀 시 수천 틱 몰아서 돌지 않게
  last = now;
  pollInput(world, dt);
  for (acc += dt; acc >= DT; acc -= DT) step(world, commands.splice(0));
  draw(world, dt);
  hud();
  requestAnimationFrame(frame);
});

function hud() {
  const hero = world.entities[0];
  heroFill.style.width = `${(hero.hp / STATS.hero.hp) * 100}%`;
  const m = hovered === null ? null : world.entities[hovered];
  target.hidden = !m;
  if (m) {
    targetName.textContent = STATS[m.kind].name;
    targetFill.style.width = `${(m.hp / STATS[m.kind].hp) * 100}%`;
  }
  renderer.domElement.style.cursor = m ? 'crosshair' : '';
  const o = outcome(world);
  banner.hidden = !o;
  if (o) banner.textContent = o === 'dead' ? '사망했습니다 — R 키로 다시 시작' : '클리어! — R 키로 다시 시작';
}
```

- [ ] **Step 3: 빌드와 테스트**

Run: `npm run build && npm test`
Expected: 빌드 성공, 테스트 21개 PASS.

- [ ] **Step 4: 완료 기준 수동 확인**

Run: `npm run dev` 후 브라우저에서 확인 (스펙 5장 완료 기준):
1. 땅 클릭 → Knight가 벽을 피해 달려간다(Running_A). 도착하면 Idle.
2. 마우스를 누른 채 움직이면 커서를 계속 따라간다.
3. 벽 블록 위, 맵 밖 검은 영역을 클릭하면 아무 일도 없다(Review Focus 1).
4. 몬스터 위에 마우스를 올리면 커서가 십자로 바뀌고 상단에 이름·체력바가 뜬다.
5. 몬스터 클릭 → 다가가서 베고(검 휘두르는 순간 체력바 감소), 죽으면 Death_A 후 시체로 남고 Knight는 멈춘다.
6. 몬스터에게 8m 안으로 다가가면 걸어와서 공격하고, 좌하단 체력바가 줄며 Knight가 Hit_A로 움찔한다.
7. 일부러 죽으면 "사망했습니다 — R 키로 다시 시작". 한/영 키를 **한글 상태로 둔 채** R을 눌러도 재시작된다(Review Focus 4).
8. 8마리를 모두 잡으면 "클리어! — R 키로 다시 시작", R로 재시작된다.
9. 창 크기를 바꾼 뒤에도 클릭한 지점으로 정확히 이동한다.
10. 개발자 도구 콘솔에 오류가 없다.

모델이 뒤로 걷는 것처럼 보이면 `render.ts`의 `a.obj.rotation.y = e.facing`을 `e.facing + Math.PI`로 바꾼다. 공격 모션과 타격 시점이 어긋나 보이는 것은 1단계에서는 허용(다음 단계에서 `HIT_AT` 튜닝).

- [ ] **Step 5: 커밋**

```bash
git add src/input.ts src/main.ts
git commit -m "feat: 클릭 이동·공격 입력, HUD, 사망/클리어 후 재시작"
```
