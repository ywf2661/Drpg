# 2-B단계 던전 그림·화로·소품 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 코드 생성 돌 질감·임시 계단을 FLARE 던전 그림으로 바꾸고, 화로 불빛과 소품(막는 것/지나가는 것)을 넣는다.

**Architecture:** `tools/sprites.py`가 FLARE 타일셋을 바닥·벽 질감(정사각형으로 편 것)과 소품·계단 시트(캐릭터와 같은 JSON 형식)로 변환한다. 생성기가 `B`·`o`·`,` 글자로 소품을 놓고, `createWorld`가 막힘과 `world.props`를 만든다. 렌더는 바닥 변형별 InstancedMesh, 재질 배열 벽 상자, 새 `props.ts`(세로 판자 소품·계단·화로 점광원)로 그린다.

**Tech Stack:** TypeScript, three.js 0.186, Vitest, Python 3 + Pillow.

**Spec:** `docs/superpowers/specs/2026-10-15-dungeon-art-design.md`

## Global Constraints

- sim(`src/sim/`)은 three.js·Math.random을 쓰지 않는다. 생성기는 시드로 재현.
- FLARE 원본은 커밋 `af6eee6d339ac98011864bfe89da837fe7769c28`, 결과물 CC-BY-SA 3.0, CREDITS에 사용 파일 기재.
- 타일·소품 축소 비율 `TILE_SCALE = 42.43 / 192`, 시트 `ppm` 30.
- 기존 테스트는 모두 계속 통과.

## Review Focus

1. 막는 소품이 복도 입구·좁은 통로를 막아 맵이 끊기는 경우 → 모든 비벽 칸이 이어져야 함 (Task 2 연결성 테스트).
2. 계단 주변·주인공 시작 칸 주변에 소품 → 비어 있어야 함 (Task 2 거리 테스트).
3. 층 이동 때 이전 층의 소품·광원·질감이 남는 경우 → 새 층에서 모두 교체 (Task 4 헤드리스 확인: 층 이동 후 광원 수 = 새 층 화로 수).
4. 소품 칸에 벽 상자가 그려지거나 바닥이 빠지는 경우 → 소품 칸은 바닥 + 소품만 (Task 4 헤드리스 화면 확인).
5. 소품 칸을 클릭해 이동 → 막힌 칸이라 무시(기존 findPath 동작), 몬스터가 소품 위에 생기지 않음 (Task 2: 몬스터 글자는 `.` 자리에만).

---

### Task 1: 타일셋 변환과 시트 계약

**Files:**
- Modify: `tools/sprites.py` (`build`를 `pack`으로 일반화, `Tileset`·`tiles()` 추가, `credits()` 확장)
- Create: `src/assets/tiles/floor.png`, `src/assets/tiles/wall.png`, `src/assets/sprites/props.{png,json}`, `src/assets/sprites/stairs.{png,json}` (생성물)
- Modify: `src/render/sheets.test.ts`

**Interfaces:**
- Produces: `props.json` 동작 이름 `brazier`(8프레임, looped), `barrel barrel2 crate crate2 chest chest2 statue statue2 bones1..bones8`(1프레임, play_once), 행 = 동작 순서. `stairs.json` 동작 `stairs` 1개, 기준점 = 4×4칸 마름모의 위 꼭짓점. `floor.png` 256×32(변형 0~3 평바닥, 4~7 금 간 바닥), `wall.png` 64×38(0 = +x 면, 1 = +z 면).

- [ ] **Step 1: 시트 계약 테스트 추가** (`sheets.test.ts` 끝에)

```ts
import props from '../assets/sprites/props.json';
import stairs from '../assets/sprites/stairs.json';

test.each([
  ['props', props],
  ['stairs', stairs],
])('%s 시트: 동작마다 1줄, 프레임이 범위 안', (_, info) => {
  const names = Object.keys(info.anims);
  expect(info.ppm).toBe(30);
  expect(info.rows).toBe(names.length);
  names.forEach((n, k) => {
    const a = (info.anims as Record<string, { row: number; frames: number; ms: number; loop: string }>)[n];
    expect(a.row).toBe(k);
    expect(a.frames).toBeLessThanOrEqual(info.cols);
  });
});

test('props 시트: 화로 8프레임 반복, 큰 소품 8종, 잔해 8종', () => {
  expect(props.anims.brazier).toMatchObject({ frames: 8, loop: 'looped' });
  expect(Object.keys(props.anims).filter((n) => n.startsWith('bones'))).toHaveLength(8);
  expect(Object.keys(props.anims)).toHaveLength(17);
});
```

- [ ] **Step 2: 실패 확인** — `npm test -- sheets` → props.json 없음으로 FAIL.

- [ ] **Step 3: `sprites.py` 구현**

`build(kind)`를 공용 `pack(name, frames, meta, scale, dirs)`로 바꾼다. frames 값의 좌상단 좌표는 발 기준점이 `FOOT`인 좌표계(음수 가능). 행 = 동작 순서 × dirs + 방향. 캐릭터는 `pack(kind, *frames_of(kind), SCALE, 8)`.

```python
TILE_SCALE = 42.43 / 192  # FLARE 타일 1개(마름모 가로 192px) = 우리 칸 1개(화면 42.4px)
TILES = ROOT / 'src' / 'assets' / 'tiles'
TILESET = 'tilesets/tileset_dungeon'
FLOOR_TILES = [16, 17, 18, 19, 42, 43, 44, 45]  # 평바닥 4 + 금 간 바닥 4
WALL_TILE, WALL_PX, WALL_GAIN = 48, 141, 1.8  # 벽돌 기둥, 1.2m 높이의 FLARE 픽셀(세로 1m = 117.6px), 밝기 보정
PROPS = {'brazier': 167, 'barrel': 146, 'barrel2': 162, 'crate': 147, 'crate2': 163, 'chest': 144, 'chest2': 145,
         'statue': 128, 'statue2': 130, **{f'bones{k + 1}': 176 + k for k in range(8)}}
STAIRS = 286  # 4×4칸 내려가는 계단

class Tileset:
    """FLARE 타일셋 정의(tile=번호,x,y,w,h,기준x,기준y / animation=번호;x,y,ms;…)."""
    def __init__(self):
        self.img = Image.open(fetch(f'mods/fantasycore/images/{TILESET}.png')).convert('RGBA')
        self.tiles, self.anims = {}, {}
        for line in fetch(f'mods/fantasycore/tilesetdefs/{TILESET.split("/")[1]}.txt').read_text(encoding='utf-8').splitlines():
            if line.startswith('tile='):
                i, *rect = map(int, line[5:].split(','))
                self.tiles[i] = rect
            elif line.startswith('animation='):
                i, *fs = line[10:].strip(';').split(';')
                self.anims[int(i)] = [tuple(int(v.removesuffix('ms')) for v in f.split(',')) for f in fs]

    def frames(self, i):
        x, y, w, h, ox, oy = self.tiles[i]
        pos = [(fx, fy) for fx, fy, _ in self.anims.get(i, [(x, y, 0)])]
        ms = sum(f[2] for f in self.anims.get(i, [])) or 1000
        return [self.img.crop((fx, fy, fx + w, fy + h)) for fx, fy in pos], (ox, oy), ms

def flatten(src, size, coeffs):
    """아핀 변환: 결과 픽셀 (i, j) → 원본 (a·i + b·j + c, d·i + e·j + f)."""
    return src.transform(size, Image.AFFINE, coeffs, resample=Image.BICUBIC)

def tiles():
    ts = Tileset()
    TILES.mkdir(parents=True, exist_ok=True)
    # 바닥: 칸의 (x, z)∈[0,1]² → 마름모 (96 + 96x − 96z, 48x + 48z). 가장자리 반투명 줄을 피해 3% 안쪽만
    S, E = 128, 0.03
    s = (1 - 2 * E) / S
    floor = Image.new('RGB', (32 * len(FLOOR_TILES), 32))
    for k, i in enumerate(FLOOR_TILES):
        (im,), (ox, oy), _ = ts.frames(i)
        c = Image.new('RGBA', (192, 96))
        c.paste(im, (96 - ox, 48 - oy))
        t = flatten(c, (S, S), (96 * s, -96 * s, 96, 48 * s, 48 * s, 96 * E))
        floor.paste(t.convert('RGB').resize((32, 32), Image.LANCZOS), (32 * k, 0))
    floor.save(TILES / 'floor.png', optimize=True)
    # 벽: 기둥의 왼쪽 면 = 법선 +x 면(열 i → z = 1 − i/W), 오른쪽 면 = 법선 +z 면(열 i → x = i/W). 아래로 갈수록 투명해지므로 알파는 버린다
    (im,), _, _ = ts.frames(WALL_TILE)
    im = ImageEnhance.Brightness(im.convert('RGB')).enhance(WALL_GAIN)
    W, H = 128, 152
    wall = Image.new('RGB', (64, 38))
    wall.paste(flatten(im, (W, H), (96 / W, 0, 0, -48 / W, WALL_PX / H, 48)).resize((32, 38), Image.LANCZOS), (0, 0))
    wall.paste(flatten(im, (W, H), (96 / W, 0, 96, 48 / W, WALL_PX / H, 0)).resize((32, 38), Image.LANCZOS), (32, 0))
    wall.save(TILES / 'wall.png', optimize=True)
    # 소품: 캐릭터와 같은 시트(동작 = 소품 이름, 방향 1개)
    frames, meta = {}, {}
    for name, i in PROPS.items():
        ims, (ox, oy), ms = ts.frames(i)
        meta[name] = (len(ims), ms, 'looped' if len(ims) > 1 else 'play_once')
        for k, f in enumerate(ims):
            frames[(name, 0, k)] = (f, (FOOT[0] - ox, FOOT[1] - oy))
    pack('props', frames, meta, TILE_SCALE, 1)
    # 계단: 기준점을 마름모 위 꼭짓점(가로 중앙, 맨 위)으로 → 그림 전체가 바닥에 눕는다
    (im,), _, _ = ts.frames(STAIRS)
    pack('stairs', {('stairs', 0, 0): (im, (FOOT[0] - im.width // 2, FOOT[1]))}, {'stairs': (1, 1000, 'play_once')}, TILE_SCALE, 1)
```

`pack` 안에서 시트 칸 위치는 `(list(meta).index(anim) * dirs + d)`, JSON `row`는 `k * dirs`, `rows = len(meta) * dirs`, 열 수 = 최대 프레임 수. `credits()`의 사용 파일 목록에 `mods/fantasycore/images/tilesets/tileset_dungeon.png, mods/fantasycore/tilesetdefs/tileset_dungeon.txt`를 추가하고, 첫 줄을 "캐릭터·던전 그림·마우스 커서", 수정 내용에 "flattened isometric tiles into square textures, scaled tiles by 0.221"을 추가. `__main__`에서 `tiles()` 호출.

- [ ] **Step 4: 실행·통과** — `python tools/sprites.py` → `npm test -- sheets` PASS. 생성 PNG를 눈으로 확인(바닥 8칸, 벽 2면, 화로 8프레임).
- [ ] **Step 5: Commit** — `feat: FLARE 던전 타일셋 변환 (바닥·벽 질감, 소품·계단 시트)`

### Task 2: 생성기 소품 배치

**Files:**
- Modify: `src/sim/dungeon.ts`, `src/sim/dungeon.test.ts`

**Interfaces:**
- Produces: 맵 글자 `B` 화로(막음), `o` 큰 소품(막음), `,` 잔해(바닥).

- [ ] **Step 1: 테스트 수정·추가** — `distances`는 `#`,`B`,`o`를 벽으로 본다. 큰 테스트에 추가:

```ts
const WALLS = '#Bo';
// distances 안: if (map[nz]?.[nx] && !WALLS.includes(map[nz][nx]) && …)
expect(d.size).toBe(48 * 48 - count(map, '#') - count(map, 'B') - count(map, 'o'));
```

새 테스트:

```ts
test('소품: 화로 1개 이상, 막는 소품은 벽에 붙고 계단·주인공 근처는 비어 있다', () => {
  const cheb = ([ax, az]: [number, number], [bx, bz]: [number, number]) => Math.max(Math.abs(ax - bx), Math.abs(az - bz));
  for (let seed = 1; seed <= 50; seed++) {
    for (let floor = 1; floor <= FLOORS; floor++) {
      const map = generateFloor(seed, floor);
      expect(count(map, 'B')).toBeGreaterThanOrEqual(1);
      const hero = find(map, 'H');
      const stairs = floor < FLOORS ? find(map, '>') : null;
      map.forEach((row, z) => [...row].forEach((c, x) => {
        if (!'Bo,'.includes(c)) return;
        expect(cheb([x, z], hero)).toBeGreaterThanOrEqual(2);
        if (stairs) expect(cheb([x, z], stairs)).toBeGreaterThanOrEqual(3);
        if (c !== ',') expect([map[z][x - 1], map[z][x + 1], map[z - 1][x], map[z + 1][x]]).toContain('#');
      }));
    }
  }
});
```

- [ ] **Step 2: 실패 확인** — `npm test -- dungeon` → 화로 0개로 FAIL.
- [ ] **Step 3: 구현** — `walkDistances`가 `Int32Array`를 돌려주고 `B`·`o`도 벽으로 본다. 계단 칸을 변수 `stair: Cell | null`로 기억. 몬스터 배치 전에:

```ts
  // 꾸미기: 막는 소품(화로·큰 소품)은 복도 입구가 아닌 방 가장자리에, 잔해는 방 안 어디든. 계단·주인공 근처는 비운다
  const near = ([x, z]: Cell, [cx, cz]: Cell, r: number) => Math.max(Math.abs(x - cx), Math.abs(z - cz)) < r;
  const free = (p: Cell) => cells[p[1]][p[0]] === '.' && !near(p, [hx, hz], 2) && !(stair && near(p, stair, 3));
  const inRoom = (r: Room, x: number, z: number) => x >= r.x && x < r.x + r.w && z >= r.z && z < r.z + r.h;
  const edge = (r: Room, [x, z]: Cell) => {
    const out = [[x - 1, z], [x + 1, z], [x, z - 1], [x, z + 1]].filter(([nx, nz]) => !inRoom(r, nx, nz));
    return out.length > 0 && out.every(([nx, nz]) => cells[nz][nx] === '#');
  };
  const connected = () => {
    const d = walkDistances(cells, hx, hz);
    return cells.every((row, z) => row.every((c, x) => !OPEN(c) || d[z * SIZE + x] >= 0));
  };
  const place = (r: Room, c: string, blocks: boolean) => {
    for (let tries = 0; tries < 30; tries++) {
      const p: Cell = [int(r.x, r.x + r.w - 1), int(r.z, r.z + r.h - 1)];
      if (!free(p) || (blocks && !edge(r, p))) continue;
      cells[p[1]][p[0]] = c;
      if (!blocks || connected()) return;
      cells[p[1]][p[0]] = '.';
    }
  };
  const order = rooms.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) { const j = int(0, i); [order[i], order[j]] = [order[j], order[i]]; }
  order.slice(0, Math.ceil(rooms.length / 2)).forEach((i) => place(rooms[i], 'B', true));
  for (const r of rooms) {
    for (let k = int(0, 3); k > 0; k--) place(r, 'o', true);
    for (let k = int(0, 3); k > 0; k--) place(r, ',', false);
  }
```

`OPEN = (c: string) => c !== '#' && c !== 'B' && c !== 'o'`. 계단 거리 계산은 `dist[sz * SIZE + sx]` 형식으로 바꾼다. 맵 머리 주석에 새 글자 추가.

- [ ] **Step 4: 통과** — `npm test` 전체 PASS.
- [ ] **Step 5: Commit** — `feat: 생성기가 화로·소품·잔해를 놓는다`

### Task 3: createWorld 소품

**Files:**
- Modify: `src/sim/world.ts`, `src/sim/world.test.ts`

**Interfaces:**
- Produces: `export type Prop = { kind: 'brazier' | 'prop' | 'debris'; x: number; z: number }`(칸 좌표), `World.props: Prop[]`.

- [ ] **Step 1: 테스트**

```ts
test('소품 글자: B·o는 막고 ,는 지나가며 props에 기록', () => {
  const w = createWorld(1, ['#####', '#HBo#', '#,..#', '#####']);
  expect(walkable(w.grid, 2, 1)).toBe(false);
  expect(walkable(w.grid, 3, 1)).toBe(false);
  expect(walkable(w.grid, 1, 2)).toBe(true);
  expect(w.props).toEqual([
    { kind: 'brazier', x: 2, z: 1 },
    { kind: 'prop', x: 3, z: 1 },
    { kind: 'debris', x: 1, z: 2 },
  ]);
});
```

- [ ] **Step 2: 실패 확인**
- [ ] **Step 3: 구현** — `const PROPS: Record<string, Prop['kind'] | undefined> = { B: 'brazier', o: 'prop', ',': 'debris' }`; 막힘 조건 `c === '#' || c === 'B' || c === 'o'`; `props.push({ kind, x, z })`; 반환에 `props`.
- [ ] **Step 4: 통과** — `npm test`
- [ ] **Step 5: Commit** — `feat: createWorld가 소품 칸을 막고 world.props에 기록`

### Task 4: 렌더 — FLARE 바닥·벽, 소품·계단·화로 빛, 크레딧

**Files:**
- Modify: `src/render/sprites.ts` (`SheetInfo.anims`를 `Record<string, Clip>`로, `loadSheet(url)` 내보내기, `Clip`·`SheetInfo` 내보내기)
- Create: `src/render/props.ts`
- Modify: `src/render/render.ts`, `index.html`(크레딧 문구)

**Interfaces:**
- Consumes: Task 1 생성물, `World.props`, `cardGeometry`, `frameAt`.
- Produces (`props.ts`): `loadProps(): Promise<void>`, `buildProps(world: World): THREE.Group`, `updateProps(dt: number, light: (x: number, z: number) => number): void`, `braziers: { x: number; z: number }[]`(월드 좌표, 칸 중심), `BRAZIER_RANGE = 4.5`.

- [ ] **Step 1: sprites.ts 일반화** — `export type Clip`, `export type SheetInfo = {...; anims: Record<string, Clip> }`, `export async function loadSheet(url: string): Promise<THREE.Texture>`(Nearest·SRGB·mipmap 없음)를 만들고 `loadSprites`가 사용. `npm test` PASS 확인.
- [ ] **Step 2: props.ts 작성**

```ts
// 소품·계단·화로 불빛. 소품은 캐릭터와 같은 세로 판자(발 아래는 바닥에 눕힘), 화로마다 점광원 1개.
import * as THREE from 'three';
import type { Prop, World } from '../sim/world';
import propsInfo from '../assets/sprites/props.json';
import propsUrl from '../assets/sprites/props.png';
import stairsInfo from '../assets/sprites/stairs.json';
import stairsUrl from '../assets/sprites/stairs.png';
import { cardGeometry, frameAt, loadSheet, type Clip, type SheetInfo } from './sprites';

export const BRAZIER_RANGE = 4.5;
const VARIANTS: Record<Prop['kind'], string[]> = {
  brazier: ['brazier'],
  prop: ['barrel', 'barrel2', 'crate', 'crate2', 'chest', 'chest2', 'statue', 'statue2'],
  debris: Array.from({ length: 8 }, (_, k) => `bones${k + 1}`),
};
type Card = { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; info: SheetInfo; clip: Clip; t: number; glow: boolean };
type Sheet = { info: SheetInfo; tex?: THREE.Texture; geo?: THREE.BufferGeometry };
const props: Sheet = { info: propsInfo as SheetInfo };
const stairs: Sheet = { info: stairsInfo as SheetInfo };
let cards: Card[] = [];
let lights: THREE.PointLight[] = [];
let time = 0;
export let braziers: { x: number; z: number }[] = [];

// 칸 좌표 → 변형 선택용 해시(렌더 전용, 시드와 무관하게 같은 칸은 같은 모양)
export const cellHash = (x: number, z: number) => (Math.imul(x, 73856093) ^ Math.imul(z, 19349663)) >>> 0;

export async function loadProps() {
  for (const s of [props, stairs]) {
    s.tex = await loadSheet(s === props ? propsUrl : stairsUrl);
    s.geo = cardGeometry(s.info);
  }
}

function card(s: Sheet, name: string, x: number, z: number, flat: boolean): Card {
  const map = s.tex!.clone();
  map.repeat.set(1 / s.info.cols, 1 / s.info.rows);
  const mat = new THREE.MeshBasicMaterial({ map, alphaTest: 0.5, toneMapped: false, depthWrite: !flat });
  const mesh = new THREE.Mesh(s.geo, mat);
  mesh.rotation.y = Math.PI / 4;
  mesh.position.set(x, 0, z);
  mesh.renderOrder = flat ? 1 : 0; // 눕힌 것(계단·잔해)은 바닥 다음, 캐릭터 전에 그리고 깊이를 남기지 않는다
  const clip = s.info.anims[name];
  return { mesh, mat, info: s.info, clip, t: cellHash(x * 2, z * 2) % 1000 / 1000, glow: name === 'brazier' };
}

// 새 층의 소품·계단·화로 빛. 이전 층 것은 재질·질감·광원을 해제한다(지오메트리는 공유)
export function buildProps(world: World): THREE.Group {
  for (const c of cards) {
    c.mat.map!.dispose();
    c.mat.dispose();
  }
  for (const l of lights) l.dispose();
  const group = new THREE.Group();
  cards = world.props.map((p) => {
    const names = VARIANTS[p.kind];
    return card(props, names[cellHash(p.x, p.z) % names.length], p.x + 0.5, p.z + 0.5, p.kind === 'debris');
  });
  if (world.stairs) cards.push(card(stairs, 'stairs', world.stairs[0] + STAIRS_AT[0], world.stairs[1] + STAIRS_AT[1], true));
  braziers = world.props.filter((p) => p.kind === 'brazier').map((p) => ({ x: p.x + 0.5, z: p.z + 0.5 }));
  // ponytail: 화로 빛은 그림자가 없어 벽 너머로 조금 샌다. 거슬리면 화로마다 그림자 켜기(비용 6배)
  lights = braziers.map((b) => {
    const l = new THREE.PointLight(0xff7a30, BRAZIER_LIGHT, BRAZIER_RANGE, 1.5);
    l.position.set(b.x, 1.2, b.z);
    return l;
  });
  group.add(...cards.map((c) => c.mesh), ...lights);
  return group;
}

export function updateProps(dt: number, light: (x: number, z: number) => number) {
  time += dt;
  lights.forEach((l, k) => (l.intensity = BRAZIER_LIGHT * (1 + 0.08 * Math.sin(time * 9 + k * 2.1) + 0.05 * Math.sin(time * 21.3 + k))));
  for (const c of cards) {
    c.t += dt;
    const f = frameAt(c.clip, c.t);
    c.mat.map!.offset.set(f / c.info.cols, 1 - (c.clip.row + 1) / c.info.rows);
    c.mat.color.copy(TINT).multiplyScalar(c.glow ? 1 : light(c.mesh.position.x, c.mesh.position.z));
  }
}
```

상수: `BRAZIER_LIGHT = 18`, `TINT = new THREE.Color(1, 0.82, 0.62)`, `STAIRS_AT: [number, number] = [-1.5, -1.5]`(계단 칸 → 4×4 마름모 위 꼭짓점. 화면에서 구멍 중심이 계단 칸에 오도록 확인 후 조정).

- [ ] **Step 3: render.ts** — `initRender`에서 `loadProps()`와 바닥·벽 질감(`floor.png`, `wall.png`, `loadSheet`) 로드. `buildMap`:
  - 소품 칸 집합 `propAt`; 바닥 칸 = 열린 칸 + 소품 칸; 벽 칸 = 막힘 & 소품 아님 & 열린 칸과 이웃.
  - 바닥: 변형 8개 각각 `InstancedMesh`(`tile(floorTex, i, 8)` = clone + repeat(1/8,1) + offset(i/8,0)). 변형 = `h % 10 < 8 ? h % 4 : 4 + (h >> 8) % 4`, `h = cellHash(x, z)`.
  - 벽: `BoxGeometry(1, 1.2, 1)`, 재질 `[x, x, top, top, zf, zf]`, x = `tile(wallTex, 0, 2)`, zf = `tile(wallTex, 1, 2)`, top = 바닥 변형 3에 `color 0x595959`.
  - 해제: 재질이 배열일 수 있으므로 `[o.material].flat()`.
  - 임시 계단 구멍 삭제, `stoneTexture` 삭제. `mapGroup.add(buildProps(world))`.
  - `draw`: `light(x, z)` = `max(횃불 항, 화로마다 clamp(1 − d/BRAZIER_RANGE)^1.4)`, 캐릭터 밝기에 사용(주인공 1.15 유지, 횃불 깜빡임은 횃불 항에만), `updateProps(dt, light)`.
- [ ] **Step 4: 크레딧 문구** — `index.html`: "캐릭터·던전 그림·마우스 커서:".
- [ ] **Step 5: 확인** — `npm test`, `npm run build` 성공. 헤드리스 Chrome 스크린샷(PC 1280×720, 모바일 390×844): FLARE 바닥·벽, 화로 불꽃·빛, 소품, 계단 그림. `__game`으로 주인공을 계단에 보내 층 이동 후 콘솔 오류 없음, `scene` 광원 수 = 횃불 1 + 반구광 1 + 새 층 화로 수. 계단 그림 위치를 보고 `STAIRS_AT` 조정.
- [ ] **Step 6: Commit** — `feat: FLARE 바닥·벽 질감, 소품·계단 그림, 화로 불빛`
