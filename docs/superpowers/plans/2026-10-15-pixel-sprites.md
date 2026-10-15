# 캐릭터 도트 스프라이트 교체 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** KayKit 2등신 3D 캐릭터를 FLARE 8방향 도트 스프라이트(빌보드)로 바꾸고, 크레딧 화면과 디아블로풍 마우스 커서를 넣는다.

**Architecture:** 한 번 실행하는 Python 변환 스크립트가 FLARE 원본에서 필요한 프레임만 합성·축소해 `src/assets/sprites/`에 시트(PNG+JSON)를 만든다. `src/render/sprites.ts`가 시트를 import해 캐릭터마다 카메라를 향한 세로 판자를 만들고 방향·프레임·밝기를 갱신한다. sim은 바뀌지 않는다.

**Tech Stack:** Python 3.13 + Pillow 12 (변환), TypeScript, three.js 0.186.1, Vite 8, Vitest 4

**Spec:** `docs/superpowers/specs/2026-10-15-pixel-sprites-design.md`

## Global Constraints

- `src/sim/**` 변경 금지. 기존 sim 테스트 28개는 그대로 통과해야 한다.
- FLARE 원본은 커밋 `af6eee6d339ac98011864bfe89da837fe7769c28`에 고정. 아트 라이선스 CC-BY-SA 3.0, 가공 결과물도 CC-BY-SA 3.0.
- `SCALE = 0.32`, `PPM = 30`, `SHORT_PX = 360`, 줌 6 고정(휠 줌 없음), 카메라 극각 60°(내려다보는 각 30°)·방위각 45°.
- FLARE 방향 번호: 0=SW, 1=W, 2=NW, 3=N, 4=NE, 5=E, 6=SE, 7=S.
- 게임 동작 → FLARE 동작: `stance→stance`, `move→run`, `attack→swing`, `hit→hit`, `die→die`.
- 새 npm 의존성 추가 금지. Python 스크립트는 표준 라이브러리 + Pillow만.
- 화면 문구는 한국어.
- git push는 사용자 확인 후.

## Review Focus

1. 시트 PNG가 256색 팔레트(투명색 포함)로 저장될 때 브라우저·three.js에서 투명 부분이 제대로 빠지는지 → Task 3 스크린샷에서 캐릭터 주변에 사각형 테두리가 보이면 실패.
2. 방향 번호 매핑이 뒤집힘(예: 오른쪽으로 가는데 왼쪽을 봄) → Task 2 `dirIndex` 단위 테스트 + Task 3 8방향 이동 스크린샷 격자.
3. 벽 바로 뒤(카메라 반대편)에 선 캐릭터가 벽 위로 비쳐 보이거나, 벽 앞 캐릭터가 벽에 가려짐 → Task 3 스크린샷 확인 단계.
4. 화면 크기가 바뀌거나(모바일 세로) 고해상도(devicePixelRatio 3)일 때 스프라이트 픽셀이 뭉개짐 → Task 4 모바일 스크린샷.
5. 서브 경로(`/Drpg/`) 배포에서 시트·커서·크레딧 파일 경로가 404 → Task 4 서브 경로 빌드 확인.

---

### Task 1: 스프라이트 시트 변환

**Files:**
- Create: `tools/sprites.py`
- Create (생성물): `src/assets/sprites/{hero,minion,warrior}.png`, `src/assets/sprites/{hero,minion,warrior}.json`, `public/sprites/CREDITS.txt`, `public/sprites/cursor_normal.png`, `public/sprites/cursor_attack.png`
- Modify: `.gitignore` (`tools/.cache` 추가), `tsconfig.json` (`"resolveJsonModule": true`)
- Test: `src/render/sheets.test.ts`

**Interfaces:**
- Produces: 시트 JSON 형식 `{ cell: [w, h], anchor: [x, y], ppm: 30, cols: number, rows: 40, anims: { stance|move|attack|hit|die: { row, frames, ms, loop: 'back_forth'|'looped'|'play_once' } } }`. 행 = `anims[a].row + 방향번호`, 열 = 프레임 번호. 동작 순서 stance, move, attack, hit, die → row 0, 8, 16, 24, 32.

- [ ] **Step 1: 설정 변경**

`tsconfig.json`의 `"moduleResolution": "bundler",` 다음 줄에 추가:
```json
    "resolveJsonModule": true,
```

`.gitignore` 끝에 추가:
```
tools/.cache
```

- [ ] **Step 2: 실패하는 계약 테스트 작성**

`src/render/sheets.test.ts`:
```ts
import { expect, test } from 'vitest';
import hero from '../assets/sprites/hero.json';
import minion from '../assets/sprites/minion.json';
import warrior from '../assets/sprites/warrior.json';

const ANIMS = ['stance', 'move', 'attack', 'hit', 'die'] as const;

test.each([
  ['hero', hero],
  ['minion', minion],
  ['warrior', warrior],
])('%s 시트: 모든 동작 × 8방향이 시트 범위 안에 있다', (_, info) => {
  expect(info.ppm).toBe(30);
  expect(info.rows).toBe(ANIMS.length * 8);
  expect(info.cell.every((v) => v > 0)).toBe(true);
  ANIMS.forEach((name, k) => {
    const a = info.anims[name];
    expect(a.row).toBe(k * 8);
    expect(a.frames).toBeGreaterThan(0);
    expect(a.frames).toBeLessThanOrEqual(info.cols);
    expect(a.ms).toBeGreaterThan(0);
    expect(['back_forth', 'looped', 'play_once']).toContain(a.loop);
  });
  expect(info.cols * info.cell[0]).toBeLessThanOrEqual(4096);
  expect(info.rows * info.cell[1]).toBeLessThanOrEqual(4096);
});
```

- [ ] **Step 3: 실패 확인**

Run: `npm test`
Expected: FAIL — `../assets/sprites/hero.json`을 찾을 수 없음. 기존 28개는 통과.

- [ ] **Step 4: 변환 스크립트 작성**

`tools/sprites.py`:
```python
"""FLARE 스프라이트를 게임용 8방향 시트로 변환한다. 결과는 커밋한다.

실행: python tools/sprites.py   (Python 3 + Pillow)
원본: Flare: Empyrean Campaign 아트, CC-BY-SA 3.0. 가공 결과물도 CC-BY-SA 3.0.
"""
import json
import re
import shutil
import urllib.request
from pathlib import Path

from PIL import Image

COMMIT = 'af6eee6d339ac98011864bfe89da837fe7769c28'
BASE = f'https://raw.githubusercontent.com/flareteam/flare-game/{COMMIT}/'
ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / 'tools' / '.cache'
SHEETS = ROOT / 'src' / 'assets' / 'sprites'
PUBLIC = ROOT / 'public' / 'sprites'

SCALE = 0.32  # 주인공 키 약 51px = 30px/m × 1.7m
PPM = 30
ALPHA_CUT = 110  # 축소 후 알파를 0/255로 나누는 기준(도트 가장자리)
ANIMS = {'stance': 'stance', 'move': 'run', 'attack': 'swing', 'hit': 'hit', 'die': 'die'}  # 게임 이름 → FLARE 이름
DIRS = ['SW', 'W', 'NW', 'N', 'NE', 'E', 'SE', 'S']  # FLARE 방향 번호 0..7
# engine/hero_layers.txt: 방향별 레이어 그리기 순서(앞이 먼저 = 아래에 깔림)
LAYER_ORDER = {
    'SW': 'main feet legs hands chest off head', 'W': 'main feet legs hands chest off head',
    'NW': 'main feet legs hands chest off head', 'N': 'feet legs hands chest off head main',
    'NE': 'feet legs hands chest off head main', 'E': 'feet legs hands chest off head main',
    'SE': 'feet legs hands main chest head off', 'S': 'main feet legs hands chest head off',
}
KINDS = {
    'hero': {'head': 'avatar/male/chain_coif', 'chest': 'avatar/male/chain_cuirass', 'hands': 'avatar/male/chain_gloves',
             'legs': 'avatar/male/chain_greaves', 'feet': 'avatar/male/chain_boots', 'main': 'avatar/male/longsword',
             'off': 'avatar/male/kite_shield'},
    'minion': {'body': 'enemies/skeleton_weak'},
    'warrior': {'body': 'enemies/skeleton'},
}
CURSORS = ['cursor_normal', 'cursor_attack']
CANVAS, FOOT = 512, (256, 384)  # 합성용 캔버스와 그 안의 발 위치


def fetch(rel):
    path = CACHE / rel
    if not path.exists():
        path.parent.mkdir(parents=True, exist_ok=True)
        urllib.request.urlretrieve(BASE + rel, path)
    return path


class Sheet:
    """FLARE 이미지 + 정의 파일(frame=번호,방향,x,y,w,h,기준x,기준y)."""

    def __init__(self, name):
        self.img = Image.open(fetch(f'mods/fantasycore/images/{name}.png')).convert('RGBA')
        self.anims = {}
        cur = None
        for line in fetch(f'mods/fantasycore/animations/{name}.txt').read_text(encoding='utf-8').splitlines():
            line = line.strip()
            if m := re.match(r'^\[(\w+)\]$', line):
                cur = self.anims.setdefault(m.group(1), {'rects': {}})
            elif cur is not None and line.startswith('frame='):
                i, d, x, y, w, h, ox, oy = map(int, line[6:].split(','))
                cur['rects'][(i, d)] = (x, y, w, h, ox, oy)
            elif cur is not None and '=' in line:
                k, v = line.split('=', 1)
                cur[k] = v

    def draw(self, canvas, anim, i, d):
        rect = self.anims[anim]['rects'].get((i, d))
        assert rect, f'프레임 없음: {anim} frame={i} dir={d}'
        x, y, w, h, ox, oy = rect
        canvas.alpha_composite(self.img.crop((x, y, x + w, y + h)), (FOOT[0] - ox, FOOT[1] - oy))


def frames_of(kind):
    """{(동작, 방향, 프레임): (잘라낸 이미지, 캔버스 안 좌상단)}, {동작: (프레임 수, ms, loop)}"""
    sheets = {slot: Sheet(name) for slot, name in KINDS[kind].items()}
    meta_src = sheets.get('chest') or sheets['body']
    frames, meta = {}, {}
    for anim, src in ANIMS.items():
        a = meta_src.anims[src]
        n = int(a['frames'])
        meta[anim] = (n, int(a['duration'].removesuffix('ms')), a.get('type', 'play_once'))
        for d, dname in enumerate(DIRS):
            order = LAYER_ORDER[dname].split() if kind == 'hero' else ['body']
            for i in range(n):
                c = Image.new('RGBA', (CANVAS, CANVAS))
                for slot in order:
                    sheets[slot].draw(c, src, i, d)
                bb = c.getbbox() or (FOOT[0], FOOT[1], FOOT[0] + 1, FOOT[1] + 1)
                frames[(anim, d, i)] = (c.crop(bb), bb[:2])
    return frames, meta


def build(kind):
    frames, meta = frames_of(kind)
    x0 = min(o[0] for _, o in frames.values())
    y0 = min(o[1] for _, o in frames.values())
    x1 = max(o[0] + im.width for im, o in frames.values())
    y1 = max(o[1] + im.height for im, o in frames.values())
    cw, ch = round((x1 - x0) * SCALE), round((y1 - y0) * SCALE)
    cols, rows = max(n for n, _, _ in meta.values()), len(ANIMS) * 8
    assert cols * cw <= 4096 and rows * ch <= 4096, f'{kind}: 시트가 너무 큼 {cols * cw}x{rows * ch}'
    atlas = Image.new('RGBA', (cols * cw, rows * ch))
    for (anim, d, i), (im, (bx, by)) in frames.items():
        full = Image.new('RGBA', (x1 - x0, y1 - y0))
        full.paste(im, (bx - x0, by - y0))
        small = full.resize((cw, ch), Image.LANCZOS)
        small.putalpha(small.getchannel('A').point(lambda v: 255 if v > ALPHA_CUT else 0))
        atlas.paste(small, (i * cw, (list(ANIMS).index(anim) * 8 + d) * ch))
    atlas.quantize(colors=256, method=Image.Quantize.FASTOCTREE).save(SHEETS / f'{kind}.png', optimize=True)
    info = {
        'cell': [cw, ch],
        'anchor': [round((FOOT[0] - x0) * SCALE), round((FOOT[1] - y0) * SCALE)],
        'ppm': PPM, 'cols': cols, 'rows': rows,
        'anims': {anim: {'row': k * 8, 'frames': n, 'ms': ms, 'loop': loop} for k, (anim, (n, ms, loop)) in enumerate(meta.items())},
    }
    (SHEETS / f'{kind}.json').write_text(json.dumps(info, indent=2) + '\n', encoding='utf-8')
    print(f'{kind}: cell {cw}x{ch}, sheet {cols * cw}x{rows * ch}')


def credits():
    used = sorted({n for k in KINDS.values() for n in k.values()})
    files = '\n'.join(f'  mods/fantasycore/images/{n}.png, mods/fantasycore/animations/{n}.txt' for n in used)
    files += '\n' + '\n'.join(f'  mods/fantasycore/images/cursors/{c}.png' for c in CURSORS)
    flare = fetch('CREDITS.txt').read_text(encoding='utf-8')
    (PUBLIC / 'CREDITS.txt').write_text(
        f'''이 폴더와 게임의 캐릭터 그림·마우스 커서는 Flare: Empyrean Campaign의 아트를 가공한 것입니다.
Character sprites and mouse cursors in this game are derived from Flare: Empyrean Campaign art.

Source: https://github.com/flareteam/flare-game (commit {COMMIT})
License: CC-BY-SA 3.0 - https://creativecommons.org/licenses/by-sa/3.0/
The derived sprite sheets are also licensed under CC-BY-SA 3.0.
Modifications: selected frames, composited equipment layers, scaled by {SCALE},
alpha thresholded, reduced to 256 colors.

Files used:
{files}

--- Flare CREDITS.txt ---
{flare}''', encoding='utf-8')


if __name__ == '__main__':
    SHEETS.mkdir(parents=True, exist_ok=True)
    PUBLIC.mkdir(parents=True, exist_ok=True)
    for kind in KINDS:
        build(kind)
    for c in CURSORS:
        shutil.copy(fetch(f'mods/fantasycore/images/cursors/{c}.png'), PUBLIC / f'{c}.png')
    credits()
    print('done')
```

- [ ] **Step 5: 스크립트 실행**

Run: `python tools/sprites.py`
Expected: `hero: cell ..`, `minion: cell ..`, `warrior: cell ..`, `done` 출력, 시트 크기 모두 4096 이하. `src/assets/sprites/`에 PNG·JSON 6개, `public/sprites/`에 CREDITS.txt·커서 2개.

다운로드가 SSL 오류로 실패하면 `curl --ssl-no-revoke`로 `tools/.cache/` 아래 같은 경로에 받아 둔 뒤 다시 실행한다(스크립트는 캐시에 있으면 받지 않는다).

- [ ] **Step 6: 시트 눈으로 확인**

`src/assets/sprites/hero.png`, `warrior.png`를 열어 확인:
- 5개 동작 블록(각 8행) × 최대 8열, 칸마다 같은 발 위치.
- 각 동작 블록의 1~8행이 SW, W, NW, N, NE, E, SE, S 방향을 향한다(1행 = 왼쪽 아래를 봄, 8행 = 아래를 봄).
- 캐릭터 주변에 반투명 테두리·사각형 배경이 없다.

- [ ] **Step 7: 테스트 통과 확인**

Run: `npm test`
Expected: PASS (기존 28 + 시트 3 = 31)

- [ ] **Step 8: 커밋**

```bash
git add tools/sprites.py src/assets/sprites src/render/sheets.test.ts public/sprites .gitignore tsconfig.json
git commit -m "feat: FLARE 스프라이트 시트 변환 스크립트와 생성물"
```

---

### Task 2: 스프라이트 모듈 (방향·프레임 계산과 빌보드)

**Files:**
- Create: `src/render/sprites.ts`
- Test: `src/render/sprites.test.ts`

**Interfaces:**
- Consumes: 시트 JSON·PNG (Task 1), `STATS`, `Entity`, `Kind` (`../sim/world`)
- Produces (`./sprites`):
  - `dirIndex(facing: number): number` — FLARE 방향 번호 0..7
  - `frameAt(c: Clip, t: number): number`
  - `loadSprites(): Promise<void>` — 시트 텍스처 3장 로드
  - `makeSprite(e: Entity): Sprite` — 메시를 만들지만 장면에 추가하지 않음
  - `updateSprite(s: Sprite, e: Entity, dt: number): void` — 위치·동작·프레임 갱신
  - `type Sprite = { mesh; mat: THREE.MeshBasicMaterial; info; anim; t; hp; hitT }`

- [ ] **Step 1: 실패하는 테스트 작성**

`src/render/sprites.test.ts`:
```ts
import { expect, test } from 'vitest';
import { dirIndex, frameAt } from './sprites';

// 카메라는 +x+z 쪽에서 -x-z를 내려다본다. facing = atan2(dx, dz)
test.each([
  ['카메라 쪽(+x+z) = 화면 아래 S', Math.atan2(1, 1), 7],
  ['카메라 반대(-x-z) = 화면 위 N', Math.atan2(-1, -1), 3],
  ['+x = 화면 오른쪽 아래 SE', Math.atan2(1, 0), 6],
  ['+z = 화면 왼쪽 아래 SW', Math.atan2(0, 1), 0],
  ['-x = 화면 왼쪽 위 NW', Math.atan2(-1, 0), 2],
  ['-z = 화면 오른쪽 위 NE', Math.atan2(0, -1), 4],
  ['+x-z = 화면 오른쪽 E', Math.atan2(1, -1), 5],
  ['-x+z = 화면 왼쪽 W', Math.atan2(-1, 1), 1],
])('dirIndex: %s', (_, facing, dir) => {
  expect(dirIndex(facing)).toBe(dir);
});

const clip = (loop: 'back_forth' | 'looped' | 'play_once') => ({ row: 0, frames: 4, ms: 400, loop });

test('looped는 마지막 다음에 처음으로', () => {
  expect([0, 0.1, 0.2, 0.3, 0.4, 0.55].map((t) => frameAt(clip('looped'), t))).toEqual([0, 1, 2, 3, 0, 1]);
});

test('play_once는 마지막 프레임에 머문다', () => {
  expect([0, 0.25, 0.39, 0.4, 5].map((t) => frameAt(clip('play_once'), t))).toEqual([0, 2, 3, 3, 3]);
});

test('back_forth는 0→3→0 왕복', () => {
  expect([0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7].map((t) => frameAt(clip('back_forth'), t))).toEqual([0, 1, 2, 3, 2, 1, 0, 1]);
});
```

- [ ] **Step 2: 실패 확인**

Run: `npm test`
Expected: FAIL — `./sprites` 모듈 없음.

- [ ] **Step 3: 구현**

`src/render/sprites.ts`:
```ts
// FLARE 8방향 도트 스프라이트로 캐릭터를 그린다. 캐릭터마다 카메라를 향한 세로 판자(빌보드) 1장.
import * as THREE from 'three';
import { STATS, type Entity, type Kind } from '../sim/world';
import heroInfo from '../assets/sprites/hero.json';
import heroUrl from '../assets/sprites/hero.png';
import minionInfo from '../assets/sprites/minion.json';
import minionUrl from '../assets/sprites/minion.png';
import warriorInfo from '../assets/sprites/warrior.json';
import warriorUrl from '../assets/sprites/warrior.png';

export type Anim = 'stance' | 'move' | 'attack' | 'hit' | 'die';
type Clip = { row: number; frames: number; ms: number; loop: 'back_forth' | 'looped' | 'play_once' };
type SheetInfo = { cell: [number, number]; anchor: [number, number]; ppm: number; cols: number; rows: number; anims: Record<Anim, Clip> };
export type Sprite = { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; info: SheetInfo; anim: Anim; t: number; hp: number; hitT: number };

const SHEETS: Record<Kind, { info: SheetInfo; url: string }> = {
  hero: { info: heroInfo as SheetInfo, url: heroUrl },
  minion: { info: minionInfo as SheetInfo, url: minionUrl },
  warrior: { info: warriorInfo as SheetInfo, url: warriorUrl },
};
const ELEV = THREE.MathUtils.degToRad(30); // 카메라가 내려다보는 각도 = FLARE가 그린 각도
const HIT_SHOW = 0.3; // 피격 동작을 보여줄 시간(초)
const BY_SECTOR = [5, 4, 3, 2, 1, 0, 7, 6]; // 화면 각도 구간(E부터 45°씩 반시계) → FLARE 방향 번호(0=SW … 7=S)
const textures = new Map<Kind, THREE.Texture>();

// 월드에서 바라보는 방향(atan2(dx, dz))을 FLARE 방향 번호로. 카메라는 +x+z 쪽에서 -x-z를 내려다본다.
export function dirIndex(facing: number): number {
  const dx = Math.sin(facing);
  const dz = Math.cos(facing);
  const sector = Math.round(Math.atan2(-(dx + dz), dx - dz) / (Math.PI / 4)); // 화면 (위쪽, 오른쪽) 성분
  return BY_SECTOR[((sector % 8) + 8) % 8];
}

// 동작 시작 후 t초의 프레임 번호. 프레임 n개를 한 번 지나가는 데 ms.
export function frameAt(c: Clip, t: number): number {
  const i = Math.floor((t * 1000 * c.frames) / c.ms);
  if (c.loop === 'play_once') return Math.min(i, c.frames - 1);
  if (c.loop === 'looped' || c.frames < 2) return i % c.frames;
  const period = 2 * (c.frames - 1); // back_forth: 0 → n-1 → 0
  const k = i % period;
  return k < c.frames ? k : period - k;
}

export async function loadSprites() {
  const loader = new THREE.TextureLoader();
  await Promise.all(
    (Object.keys(SHEETS) as Kind[]).map(async (k) => {
      const tex = await loader.loadAsync(SHEETS[k].url);
      tex.magFilter = THREE.NearestFilter;
      tex.minFilter = THREE.NearestFilter;
      tex.generateMipmaps = false;
      tex.colorSpace = THREE.SRGBColorSpace;
      textures.set(k, tex);
    }),
  );
}

export function makeSprite(e: Entity): Sprite {
  const info = SHEETS[e.kind].info;
  const [cw, ch] = info.cell;
  const [ax, ay] = info.anchor;
  const k = 1 / Math.cos(ELEV); // 30° 위에서 보면 세로가 cos(30°)만큼 납작해지므로 미리 늘린다
  const geo = new THREE.PlaneGeometry(cw / info.ppm, (ch / info.ppm) * k);
  geo.translate((cw / 2 - ax) / info.ppm, ((ay - ch / 2) / info.ppm) * k, 0); // 발 기준점을 원점으로
  const map = textures.get(e.kind)!.clone(); // 이미지는 공유, 프레임 위치(offset)만 캐릭터별
  map.repeat.set(1 / info.cols, 1 / info.rows);
  const mat = new THREE.MeshBasicMaterial({ map, alphaTest: 0.5, toneMapped: false });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.y = Math.PI / 4; // 카메라(+x+z) 쪽을 향한다
  return { mesh, mat, info, anim: 'stance', t: 0, hp: e.hp, hitT: 0 };
}

export function updateSprite(s: Sprite, e: Entity, dt: number) {
  if (e.hp < s.hp && e.state !== 'attack') s.hitT = HIT_SHOW;
  s.hp = e.hp;
  s.hitT -= dt;
  const anim = animFor(e, s.hitT);
  if (anim !== s.anim) {
    s.anim = anim;
    s.t = 0;
  }
  s.t += anim === 'move' ? (dt * STATS[e.kind].speed) / STATS.hero.speed : dt; // 느린 몬스터는 걸음도 느리게
  const c = s.info.anims[anim];
  // 공격 프레임은 sim의 휘두르기 진행도에 맞춘다
  const f = anim === 'attack' ? Math.min(c.frames - 1, Math.floor((e.attackT / STATS[e.kind].interval) * c.frames)) : frameAt(c, s.t);
  const row = c.row + dirIndex(e.facing);
  s.mat.map!.offset.set(f / s.info.cols, 1 - (row + 1) / s.info.rows);
  s.mesh.position.set(e.x, 0, e.z);
}

function animFor(e: Entity, hitT: number): Anim {
  if (e.state === 'dead') return 'die';
  if (e.state === 'attack') return 'attack';
  if (hitT > 0) return 'hit';
  return e.state === 'move' ? 'move' : 'stance';
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm test`
Expected: PASS (31 + dirIndex 8 + frameAt 3 = 42). 하나라도 dirIndex가 틀리면 `BY_SECTOR`가 아니라 화면 벡터 부호를 먼저 의심한다(+x+z 이동이 화면 아래 = S).

- [ ] **Step 5: 타입 검사**

Run: `npx tsc`
Expected: 오류 없음.

- [ ] **Step 6: 커밋**

```bash
git add src/render/sprites.ts src/render/sprites.test.ts
git commit -m "feat: 스프라이트 빌보드 모듈 (8방향 선택, 프레임 계산)"
```

---

### Task 3: 렌더러를 스프라이트로 교체

**Files:**
- Modify: `src/render/render.ts` (전체 교체)
- Delete: `public/models/` (전체)

**Interfaces:**
- Consumes: `loadSprites`, `makeSprite`, `updateSprite`, `Sprite` (`./sprites`)
- Produces: `renderer`, `camera`, `initRender(world)`, `setWorld(world)`, `draw(world, dt)` — 시그니처는 기존과 동일(main.ts·input.ts 변경 없음)

- [ ] **Step 1: `src/render/render.ts` 전체 교체**

```ts
// three.js 렌더링. sim 상태를 읽기만 하고 수정하지 않는다.
import * as THREE from 'three';
import type { World } from '../sim/world';
import { loadSprites, makeSprite, updateSprite, type Sprite } from './sprites';

const SHORT_PX = 360; // 화면 짧은 변을 이만큼의 렌더 픽셀로 그린다(도트 느낌, 기기와 무관하게 같은 굵기)
const ZOOM = 6; // 화면 짧은 변 절반에 보이는 월드 길이(m). 360px / 12m = 30px/m = 스프라이트 해상도
const TORCH = 80; // 횃불 밝기(칸델라)
const TORCH_RANGE = 9; // 시야 반경(m). 이 밖은 거의 칠흑
const TORCH_TINT = new THREE.Color(1, 0.82, 0.62); // 스프라이트에 입히는 횃불 색

export const renderer = new THREE.WebGLRenderer({ antialias: false });
export const camera = new THREE.OrthographicCamera();
const scene = new THREE.Scene();
const torch = new THREE.PointLight(0xff9a4d, TORCH, TORCH_RANGE, 1.5); // 주인공이 든 횃불
const focus = new THREE.Vector3();
const tmp = new THREE.Vector3();
const right = new THREE.Vector3();
const up = new THREE.Vector3();
// 수평 45°, 내려다보는 각 30°(극각 60°) = FLARE 스프라이트를 그린 각도, 거리 30
const CAM_OFFSET = new THREE.Vector3().setFromSphericalCoords(30, THREE.MathUtils.degToRad(60), THREE.MathUtils.degToRad(45));
let sprites: Sprite[] = [];
let bufH = 1; // 렌더 버퍼 세로 픽셀 수
let time = 0;

export async function initRender(world: World) {
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.BasicShadowMap; // 경계가 딱딱한 픽셀 그림자
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  document.body.prepend(renderer.domElement);
  scene.background = new THREE.Color(0x000000);
  scene.add(new THREE.HemisphereLight(0x3a4a66, 0x000000, 0.1)); // 시야 밖이 완전한 검정은 아니게
  torch.castShadow = true;
  torch.shadow.mapSize.set(512, 512);
  torch.shadow.bias = -0.002;
  scene.add(torch);
  buildMap(world);
  addEventListener('resize', resize);
  resize();
  await loadSprites();
  setWorld(world);
}

export function setWorld(world: World) {
  for (const s of sprites) s.mesh.removeFromParent();
  sprites = world.entities.map(makeSprite);
  for (const s of sprites) scene.add(s.mesh);
  focus.set(world.entities[0].x, 0, world.entities[0].z);
}

export function draw(world: World, dt: number) {
  const hero = world.entities[0];
  time += dt;
  const flicker = 1 + 0.06 * Math.sin(time * 11) + 0.04 * Math.sin(time * 23.7); // 불꽃 깜빡임
  torch.position.set(hero.x, 4, hero.z); // 높을수록 가까운 물체와 먼 바닥의 밝기 차가 줄어든다
  torch.intensity = TORCH * flicker;
  for (const e of world.entities) {
    const s = sprites[e.id];
    updateSprite(s, e, dt);
    // 세로 판자는 머리 위 횃불 빛을 거의 못 받으므로 주인공과의 거리로 밝기를 직접 정한다
    const d = Math.hypot(e.x - hero.x, e.z - hero.z);
    const b = e === hero ? 1.15 : Math.max(0, 1 - d / TORCH_RANGE) ** 1.4 * 1.1 + 0.04;
    s.mat.color.copy(TORCH_TINT).multiplyScalar(b * flicker);
  }
  focus.lerp(tmp.set(hero.x, 0, hero.z), 1 - Math.exp(-8 * dt));
  camera.position.copy(focus).add(CAM_OFFSET);
  camera.lookAt(focus);
  snapToPixel();
  renderer.render(scene, camera);
}

// 카메라를 렌더 픽셀 격자에 맞춘다. 안 맞추면 이동할 때 벽·바닥 픽셀이 지글거린다.
function snapToPixel() {
  camera.updateMatrixWorld();
  right.setFromMatrixColumn(camera.matrixWorld, 0);
  up.setFromMatrixColumn(camera.matrixWorld, 1);
  const px = (camera.top - camera.bottom) / bufH; // 렌더 픽셀 1개의 월드 크기
  const x = camera.position.dot(right);
  const y = camera.position.dot(up);
  camera.position.addScaledVector(right, Math.round(x / px) * px - x).addScaledVector(up, Math.round(y / px) * px - y);
}

// 낮은 해상도로 그리고 CSS(image-rendering: pixelated)로 정수배 확대한다.
function resize() {
  const dpr = devicePixelRatio;
  const pixel = Math.max(1, Math.round((Math.min(innerWidth, innerHeight) * dpr) / SHORT_PX)); // 렌더 픽셀 1개 = 화면 pixel×pixel
  const w = Math.ceil((innerWidth * dpr) / pixel);
  bufH = Math.ceil((innerHeight * dpr) / pixel);
  renderer.setPixelRatio(1);
  renderer.setSize(w, bufH, false);
  Object.assign(renderer.domElement.style, { width: `${(w * pixel) / dpr}px`, height: `${(bufH * pixel) / dpr}px` });
  const sx = Math.max(1, w / bufH); // 가로가 길면 좌우를 넓힌다
  const sy = Math.max(1, bufH / w); // 세로가 길면(모바일) 위아래를 넓힌다
  Object.assign(camera, { left: -ZOOM * sx, right: ZOOM * sx, top: ZOOM * sy, bottom: -ZOOM * sy, near: 1, far: 100 });
  camera.updateProjectionMatrix();
}

function buildMap(world: World) {
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
  scene.add(floor, walls);
}

// 코드로 만든 16×16 픽셀 돌 질감. 바닥은 타일 테두리, 벽은 엇갈린 벽돌 줄눈이 어둡다.
function stoneTexture(base: number, brick: boolean) {
  const S = 16;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  const col = new THREE.Color();
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const offset = ((y >> 2) % 2) * 4;
      const mortar = brick ? y % 4 === 0 || (x + offset) % 8 === 0 : x === 0 || y === 0;
      g.fillStyle = col.set(base).multiplyScalar(mortar ? 0.45 : 0.8 + Math.random() * 0.35).getStyle();
      g.fillRect(x, y, 1, 1);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.magFilter = t.minFilter = THREE.NearestFilter;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
```

- [ ] **Step 2: KayKit 모델 삭제**

Run: `git rm -r -q public/models`
Expected: `public/models/` 사라짐.

- [ ] **Step 3: 빌드·테스트**

Run: `npm run build && npm test`
Expected: 빌드 성공, 테스트 42개 PASS.

- [ ] **Step 4: 화면 확인 (헤드리스 Chrome)**

`npm run dev` 상태에서 헤드리스 Chrome(puppeteer-core, 스크래치 폴더에만 설치)으로:
1. 첫 화면: 기사가 도트 스프라이트로 서 있고(stance), 캐릭터 주변에 사각형 테두리가 없다(Review Focus 1).
2. 주인공 기준 화면 8방향(위, 오른쪽 위, 오른쪽, … 반지름 150px) 지점을 차례로 클릭하고 0.4초 뒤 주인공 주변을 잘라 한 장의 격자 이미지로 합친다. 각 칸에서 기사가 클릭한 방향을 바라보며 달린다(Review Focus 2).
3. 몬스터 쪽으로 이동해 전투: 공격 동작, 몬스터 피격·사망 동작, 시체가 남는다.
4. 벽 앞·뒤에 선 캐릭터: 벽 뒤 캐릭터는 벽에 가려지고, 벽 앞 캐릭터는 벽을 가린다(Review Focus 3).
5. 콘솔 오류 없음.

방향이 체계적으로 틀리면(예: 모두 90° 어긋남) `BY_SECTOR` 대신 화면 벡터 부호를 먼저 확인한다.

- [ ] **Step 5: 커밋**

```bash
git add src/render/render.ts
git commit -m "feat: 캐릭터를 FLARE 도트 스프라이트로 교체, 카메라 30°, KayKit 모델 제거"
```

---

### Task 4: 크레딧 화면과 마우스 커서

**Files:**
- Modify: `index.html`
- Modify: `src/main.ts` (커서 전환 한 줄)

**Interfaces:**
- Consumes: `public/sprites/CREDITS.txt`, `public/sprites/cursor_{normal,attack}.png` (Task 1), `hovered` (`./input`)

- [ ] **Step 1: `index.html` 스타일 추가**

`<style>` 안의 `#restart { ... }` 줄 다음에 추가:
```css
      html { cursor: url(sprites/cursor_normal.png) 0 0, auto; }
      canvas.attack { cursor: url(sprites/cursor_attack.png) 0 0, crosshair; }
      #credits-btn { position: fixed; right: 12px; bottom: 12px; z-index: 2; font: 12px system-ui, sans-serif; color: #8a7f70; background: none; border: 1px solid #3a3530; padding: 4px 10px; cursor: inherit; }
      #credits { max-width: min(480px, 90vw); color: #e8dcc8; background: #14100e; border: 1px solid #b3261e; line-height: 1.6; }
      #credits a { color: #e0a060; }
      #credits::backdrop { background: #000a; }
```

- [ ] **Step 2: `index.html` 크레딧 마크업 추가**

`<div id="banner">…</div>` 줄 다음에 추가:
```html
    <button id="credits-btn" onclick="document.getElementById('credits').showModal()">크레딧</button>
    <dialog id="credits">
      <p>캐릭터 그림·마우스 커서: <a href="https://github.com/flareteam/flare-game" target="_blank" rel="noopener">Flare: Empyrean Campaign</a> — Clint Bellanger 외 Flare 기여자</p>
      <p>라이선스: <a href="https://creativecommons.org/licenses/by-sa/3.0/" target="_blank" rel="noopener">CC-BY-SA 3.0</a>. 프레임 선택, 장비 레이어 합성, 크기 조정, 색 수 감소를 거쳤으며 가공한 그림도 CC-BY-SA 3.0입니다.</p>
      <p><a href="sprites/CREDITS.txt" target="_blank">전체 크레딧 (CREDITS.txt)</a></p>
      <form method="dialog"><button>닫기</button></form>
    </dialog>
```

- [ ] **Step 3: `src/main.ts` 커서 전환**

다음 줄을:
```ts
  renderer.domElement.style.cursor = hovered !== null ? 'crosshair' : '';
```
다음으로 교체:
```ts
  renderer.domElement.classList.toggle('attack', hovered !== null); // 몬스터 위에서는 공격 커서
```

- [ ] **Step 4: 빌드·테스트**

Run: `npm run build && npm test`
Expected: 빌드 성공, 42 PASS.

- [ ] **Step 5: 서브 경로·모바일 확인 (헤드리스 Chrome)**

`dist/`를 스크래치 폴더의 `site/Drpg/`로 복사해 `python -m http.server 8090`으로 서빙하고 `http://localhost:8090/Drpg/`에서:
1. 404 응답 없음(시트 PNG, 커서 2개, CREDITS.txt 포함 — Review Focus 5).
2. PC(1280×720): 몬스터 위에 마우스를 올리면 `canvas.attack` 클래스가 붙는다. [크레딧] 클릭 시 대화상자가 열리고 [닫기]로 닫힌다.
3. 모바일(iPhone 13 에뮬레이션, dpr 3): 스프라이트가 PC와 같은 굵기의 도트로 보인다(Review Focus 4). 크레딧 버튼이 체력바와 겹치지 않는다.
4. 시트 3장 전송량 합계가 1.5MB(기존 모델)보다 작다.

- [ ] **Step 6: 커밋**

```bash
git add index.html src/main.ts
git commit -m "feat: 크레딧 화면과 FLARE 마우스 커서"
```
