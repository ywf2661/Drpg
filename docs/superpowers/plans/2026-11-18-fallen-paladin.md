# 타락한 성기사 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hormelz 대검 기사를 배색 C로 칠한 몬스터 스킨 `fallen_paladin`(「타락한 성기사」)을 만들고, 은은한 후광을 붙이고, `?test`에서 불러낼 수 있게 한다.

**Architecture:** `tools/sprites.py`가 로컬 원본(zip 세 개를 푼 것)에서 색 바꾸기·방향 맞추기·피격/쓰러짐 지어내기까지 한 표준 몬스터 시트를 만든다 → 게임은 다른 스킨과 똑같이 읽는다. sim은 스킨 등록과 폐허 기믹 좁히기만. 후광은 렌더러가 그림 뒤에 붙이는 가산 혼합 판 두 장.

**Tech Stack:** Python 3 + Pillow(시트), TypeScript + three.js + vitest(게임).

**Spec:** `docs/superpowers/specs/2026-11-18-fallen-paladin-design.md`

## Global Constraints

- 스킨 이름 `fallen_paladin`, 표시 이름 「타락한 성기사」, 체력 ×1.2, 속도 ×1, 전투 원형 `boss`. 어느 `LANDS[*].skins`에도 넣지 않는다.
- 배색 C 표(스펙 그대로, 아래 Task 1).
- 시트 형식은 기존 몬스터와 같다: 동작 `stance move attack hit die` × 8방향, `ppm` 30, 시트 4096px 이하, `die`는 `play_once`.
- **커밋하지 않는다.** 작업 폴더에 같은 파일들(`rules.ts`, `gimmicks.ts`, `main.ts`, `world.ts` …)의 다른 미완성 작업이 섞여 있다. 끝나면 바뀐 파일 목록만 사용자에게 알린다.
- 테스트: `npm test -- <파일>`(Windows 드라이브 글자 문제 때문에 `npx vitest` 대신 이것).

## Review Focus

- 폐허에서 소환한 기사가 체력 절반 아래로 떨어질 때 악마의 무덤 기믹이 기사에게 걸림 → 걸리면 안 된다(Task 2 테스트).
- 원래 보스가 있는 층에서 소환: 원래 보스가 살아 있는 동안 기사를 죽여도 클리어가 되면 안 된다(Task 2 테스트).
- 방향이 엇갈림(왼쪽을 보며 오른쪽으로 걸음) — 시트 변환의 방향 대응. 화면 확인(Task 4)에서 8방향 걷기를 본다.
- 쓰러짐 마지막 장이 칸 밖으로 잘리거나 발 기준선 아래로 꺼짐 — Task 1의 시트 테스트(기준점이 칸 안)와 화면 확인.
- 후광이 죽은 뒤에도 남음 / 다른 몬스터에 붙음 — Task 3 테스트.

---

### Task 1: 시트 `fallen_paladin` 만들기

**Files:**
- Create: `tools/.cache/local/greatsword_knight/{2hIdle5,2hWalk,Slash}/GreatSwordKnight_<동작>_dir<1-8>.{png,json}` (사용자의 `C:\Users\HYGOOD\Downloads\{2hIdle5,2hWalk,Slash}.zip`을 각각 풀어 넣는다. zip 안의 폴더 한 겹을 그대로 둬도 되고 벗겨도 된다 — 코드 경로와만 맞출 것. `tools/.cache`는 git 밖)
- Modify: `tools/sprites.py` (상수 `KNIGHT`, 함수 `knight_frames()`, `__main__`, `credits()`)
- Create(생성물): `src/assets/sprites/fallen_paladin.png`, `src/assets/sprites/fallen_paladin.json`; Modify(생성물): `public/sprites/CREDITS.txt`
- Test: `src/render/sheets.test.ts`

**Interfaces:**
- Produces: `src/assets/sprites/fallen_paladin.{png,json}` — `SheetInfo` 형식(`cell, anchor, ppm, cols, rows, anims{stance,move,attack,hit,die}`).

- [ ] **Step 1: 실패하는 테스트** — `sheets.test.ts`에서 `import fallenPaladin from '../assets/sprites/fallen_paladin.json'`; 첫 `test.each` 목록, "사망 동작은 모두 1회 재생", "모든 시트의 기준점" 목록에 `fallenPaladin`을 더한다. 그리고:

```ts
test('타락한 성기사 시트: 원본 동작 수(대기는 솎음), 지어낸 피격·쓰러짐', () => {
  expect(fallenPaladin.anims.move).toMatchObject({ frames: 9, loop: 'looped' });
  expect(fallenPaladin.anims.attack).toMatchObject({ frames: 12, loop: 'play_once' });
  expect(fallenPaladin.anims.stance.frames).toBeGreaterThanOrEqual(8);
  expect(fallenPaladin.anims.hit.frames).toBe(2);
  expect(fallenPaladin.anims.die.frames).toBeGreaterThanOrEqual(5);
});
```

- [ ] **Step 2: 실패 확인** — `npm test -- src/render/sheets.test.ts` → 모듈 없음으로 FAIL.

- [ ] **Step 3: 원본 풀기** — 위 경로로 zip 세 개를 푼다(각각 빈 폴더에). 48개 파일(png 24 + json 24) 확인.

- [ ] **Step 4: `sprites.py`에 `KNIGHT` 상수와 `knight_frames() -> (frames, meta)` 구현**

`frames_of`와 같은 반환 형식: `frames = {(anim, d, i): (잘라낸 RGBA, 캔버스 안 좌상단)}`(발 기준점이 `FOOT`인 좌표), `meta = {anim: (프레임 수, ms, loop)}`. 그 다음 `__main__`에서 `pack('fallen_paladin', *knight_frames(), KNIGHT['scale'], 8)`(KINDS 반복 바로 뒤).

정할 값(이것만 정하고 나머지는 짓는 사람 몫):
- `KNIGHT['dir']`: 시트 방향 d(0..7, 화면 기준 0=W 1=NW 2=N 3=NE 4=E 5=SE 6=S 7=SW) → 원본 `dir((d + 1) % 8 + 1)`.
- 원본 읽기: PixelOver JSON `frames[i].frame = {x,y,w,h}`(512×512), `frames[i].duration`(ms).
- 발 기준점(원본 512 칸 안): x = 256, y = `2hIdle5` dir8 첫 장의 불투명 픽셀 맨 아래 줄. 이 값을 재서 상수로 적는다(모든 장·방향 공통).
- 동작: `stance` = `2hIdle5` 26장 중 짝수 번째 13장, ms = 13 × 142 × 2, `back_forth`가 아니라 `looped`. `move` = `2hWalk` 9장, 9 × 142 ms, `looped`. `attack` = `Slash` 12장, 1200 ms, `play_once`. `hit` = 2장, 133 ms, `play_once`. `die` = 6장, 900 ms, `play_once`.
- `hit`: 대기 첫 장을 발 기준점을 축으로 뒤로 8°, 그다음 4° 젖히고(`Image.rotate(…, center=발, expand=False)` 후 `ImageEnhance.Brightness` 1.5 → 1.2). 뒤 = 그 방향에서 바라보는 쪽의 반대: d가 W·NW·SW면 화면 시계 방향, E·NE·SE면 반시계, N은 시계, S는 반시계.
- `die`: 대기 첫 장을 같은 축·같은 방향으로 15°, 35°, 55°, 70°, 80°, 85° 눕히며 밝기 1 → 0.55. 회전으로 칸이 잘리지 않게 512 캔버스를 먼저 넉넉히 키우고 돌린 뒤 `getbbox()`로 자른다(좌상단은 발 기준점 기준으로 다시 계산).
- 색: 원본은 32색. 아래 표의 부위별 기준점으로 바꿔 끼운다. 각 원본 색은 부위 안 밝기(0.299R+0.587G+0.114B)의 최저~최고 사이 비율 t로 기준점 사이를 선형 보간. 표에 없는 색(검은 윤곽 (0,0,2) 등)은 그대로. 시험 구현: 세션 임시 폴더의 `recolor.py`의 `palette()`·`ramp()`와 같다.

| 부위 | 원본 색 | 기준점(어두운 → 밝은) |
|---|---|---|
| 판금 | (54,115,143) (65,128,156) (43,108,136) (32,96,122) (79,144,171) (92,154,181) (72,134,163) (19,84,112) (108,168,192) (124,186,210) | (28,10,12) (62,22,24) (108,44,40) |
| 가슴·등판 | (52,200,225) (44,183,208) (24,160,181) (0,134,158) (0,93,118) | (40,14,16) (90,32,30) (152,64,50) |
| 그늘 | (1,64,91) (0,20,51) (0,45,70) | (8,2,4) (20,6,8) |
| 투구 꼭대기 | (132,132,0) (89,89,0) (47,47,0) (170,170,0) | (36,30,20) (90,76,46) (140,120,70) |
| 눈구멍·칼자루 | (147,8,0) (42,0,0) (100,0,0) (184,25,0) | (120,40,0) (255,140,20) (255,220,120) |
| 얼굴 조각 | (147,158,95) (176,187,125) | (60,40,36) (100,70,60) |
| 칼날 | (164,175,177) (255,255,255) (240,238,238) | (30,20,20) (255,110,10) (255,230,140) |

- `KNIGHT['scale']` = 0.5. `pack`의 4096 검사에 걸리면 0.48로 낮춘다.
- `credits()`에 악마 줄 아래 한 단락: `Fallen paladin (boss): "8 Directional Greatsword Knight" by Hormelz, itch.io, CC0 - https://hormelz.itch.io/8-directional-great-sword-knight-character` / `Modifications: idle frames halved, recolored (32-color palette swap), hit and death frames made by rotating the idle frame, scaled by <scale>, alpha thresholded, reduced to 256 colors.`

- [ ] **Step 5: 생성** — `python tools/sprites.py`(전체가 다시 돈다. 캐시가 있어 내려받지 않는다). 출력에 `fallen_paladin: cell …, sheet …` 줄 확인. 그다음 `git status --short src/assets public`: 새 `fallen_paladin.*`와 `CREDITS.txt` 말고 바뀐 생성물이 있으면 `git checkout -- <그 파일들>`로 되돌린다(이번 일과 무관한 재생성 차이).

- [ ] **Step 6: 통과 확인** — `npm test -- src/render/sheets.test.ts` → PASS.

- [ ] **Step 7: 눈 확인** — 시트 png를 열어 8방향 × 5동작이 줄마다 같은 방향을 보는지, 쓰러짐 마지막 장이 칸 안에 누워 있는지 본다.

### Task 2: 스킨 등록 + 폐허 기믹 좁히기

**Files:**
- Modify: `src/sim/rules.ts` (`Skin` 유니언, `SKINS`)
- Modify: `src/sim/gimmicks.ts:121` 부근(폐허 보스 무덤)
- Modify: `src/render/sprites.ts` (`SHEETS`에 등록 — `Record<Kind | Skin, …>`라 안 하면 타입 오류)
- Test: `src/sim/gimmicks.test.ts`

**Interfaces:**
- Consumes: Task 1의 `fallen_paladin.{png,json}`.
- Produces: `Skin`에 `'fallen_paladin'`; `SKINS.fallen_paladin = { name: '타락한 성기사', hp: 1.2, speed: 1 }`. `spawnNear(w, 'boss', x, z, r, -1, 'fallen_paladin')`로 만들 수 있다(기존 함수, `gimmicks.ts`에서 export).

- [ ] **Step 1: 실패하는 테스트** (`gimmicks.test.ts`, `spawnNear`는 `./gimmicks`에서 import)

```ts
test('타락한 성기사: 소환하면 이름·체력 배율이 붙고, 폐허에서 체력 절반이 돼도 무덤을 일으키지 않는다', () => {
  const w = createWorld(1, ['#########', '#H......#', '#.......#', '#.......#', '#########'], 1, 1, LANDS.ruins.skins);
  w.land = 'ruins';
  const k = spawnNear(w, 'boss', 1.5, 1.5, 3, -1, 'fallen_paladin')!;
  expect(k.skin).toBe('fallen_paladin');
  expect(monsterName(k)).toBe('타락한 성기사');
  k.hp = Math.floor(k.maxHp / 2) - 1;
  w.entities[0].hp = 99999;
  run(w, 10);
  expect(w.bossRaised).toBe(false);
  expect(w.entities.some((e) => e.skin === 'grave')).toBe(false);
});

test('타락한 성기사: 원래 보스가 살아 있으면 기사를 쓰러뜨려도 클리어가 아니다', () => {
  const w = createWorld(1, ['#########', '#H......#', '#.......#', '#......M#', '#########']);
  const k = spawnNear(w, 'boss', 1.5, 1.5, 2, -1, 'fallen_paladin')!;
  k.state = 'dead';
  expect(outcome(w)).toBe(null);
});
```

(`monsterName`·`outcome`은 `./world`에서 import — 없으면 각각 `rules.ts`·`world.ts`에서. 두 번째 테스트는 지금도 통과할 수 있다: 회귀 방지용.)

- [ ] **Step 2: 실패 확인** — `npm test -- src/sim/gimmicks.test.ts` → `'fallen_paladin'`이 `Skin`이 아니라 실패(타입/이름).

- [ ] **Step 3: 구현** — `Skin`·`SKINS`에 추가(주석: 최종 보스 후보, 지금은 `?test` 소환만). `SHEETS`에 `fallen_paladin: { info: fallenPaladinInfo as SheetInfo, url: fallenPaladinUrl }`(import 두 줄). 폐허 무덤 조건을 `e.kind === 'boss' && e.skin === 'demon' && …`로 좁힌다.

- [ ] **Step 4: 통과 확인** — `npm test -- src/sim/gimmicks.test.ts` PASS, 그다음 `npm test` 전체 PASS(`playthrough` 포함), `npx tsc --noEmit` 오류 없음.

### Task 3: 후광

**Files:**
- Modify: `src/render/sprites.ts` (`Sprite` 타입, `makeSprite`, `updateSprite`, 새 상수 `HALO`, 새 함수 `haloLevel`)
- Test: `src/render/sprites.test.ts`

**Interfaces:**
- Produces: `export const HALO = { period: 2.6, min: 0.35, max: 0.6, fade: 1.2 }`(초·밝기 비율; 화면 보고 조정), `export function haloLevel(t: number): number`(맥동 밝기, `min`~`max`), `export function attachHalo(s: Sprite, e: Entity): void`(`e.skin === 'fallen_paladin'`일 때만 붙인다. `makeSprite`가 부른다), `Sprite.halo?: { glow: THREE.Mesh; ring: THREE.Mesh; k: number; t: number }`(k = 켜짐 정도 0~1).

- [ ] **Step 1: 실패하는 테스트**

```ts
test('후광 맥동: min~max 사이를 period 주기로 오르내린다', () => {
  const xs = Array.from({ length: 200 }, (_, i) => haloLevel((i / 200) * HALO.period));
  expect(Math.min(...xs)).toBeCloseTo(HALO.min, 2);
  expect(Math.max(...xs)).toBeCloseTo(HALO.max, 2);
  expect(haloLevel(0.3)).toBeCloseTo(haloLevel(0.3 + HALO.period), 6);
});

test('후광은 타락한 성기사에게만 붙고, 죽으면 꺼진다', () => {
  const w = createWorld(1, ['H.M']);
  const boss = w.entities[1];
  const card = () => {
    const mat = new THREE.MeshBasicMaterial({ map: new THREE.Texture() });
    return { mesh: new THREE.Mesh(cardGeometry(hero as never), mat), mat, info: hero as never, anim: 'stance' as const, t: 0, hp: boss.hp, maxHp: boss.maxHp, hitT: 0, castT: 0, tint: new THREE.Color(1, 1, 1) } as Sprite;
  };
  const plain = card();
  attachHalo(plain, boss);
  expect(plain.halo).toBeUndefined();
  boss.skin = 'fallen_paladin';
  const s = card();
  attachHalo(s, boss);
  expect(s.halo).toBeDefined();
  updateSprite(s, boss, 2, 1.8);
  expect(s.halo!.k).toBe(1);
  boss.state = 'dead';
  for (let i = 0; i < 120; i++) updateSprite(s, boss, 1 / 30, 1.8);
  expect(s.halo!.k).toBe(0);
  expect(s.halo!.glow.visible).toBe(false);
});
```

(기존 "시체는 아래 층…" 테스트처럼 `Sprite`를 직접 조립한다 — `makeSprite`는 불러온 시트 텍스처가 필요해 테스트에서 못 쓴다.)

- [ ] **Step 2: 실패 확인** — `npm test -- src/render/sprites.test.ts` → `haloLevel` 없음으로 FAIL.

- [ ] **Step 3: 구현**
- 텍스처 둘은 처음 쓸 때 한 번만 `THREE.DataTexture`(64×64 RGBA, 픽셀을 JS로 계산 — 테스트 환경에 캔버스가 없다)로 만든다: 빛무리 = 방사형(가운데 (255,120,40) → 반지름 0.5에서 (200,40,20) → 가장자리 0, 부드럽게), 고리 = 타원 둘레 근처만 금빛 (255,200,110), 각도 200°~330°와 345°~170° 두 호(금 간 고리), 둘레에서 멀어질수록 빠르게 0.
- `attachHalo`: `e.skin === 'fallen_paladin'`이면 `PlaneGeometry` 판 둘을 `s.mesh`의 자식으로(`makeSprite` 끝에서 부른다): 빛무리 약 2.0m × 2.4m, 중심 높이 약 0.9m; 고리 약 0.6m × 0.3m, 높이 = 시트 `anchor[1]`에서 잰 머리 높이(약 1.6m). 둘 다 지역 z = −0.05(그림 뒤), `MeshBasicMaterial({ transparent, depthWrite: false, toneMapped: false, blending: AdditiveBlending })`, `renderOrder` = 1.
- `updateSprite`: `halo.t += dt`; 살아 있으면 `k = min(1, k + dt / HALO.fade)`, 죽었으면 `k = max(0, k − dt / HALO.fade)`. 빛무리 불투명도 = `haloLevel(t) × k`, 고리 = 그 0.6배. `k === 0`이면 둘 다 `visible = false`.

- [ ] **Step 4: 통과 확인** — `npm test -- src/render/sprites.test.ts` PASS, `npx tsc --noEmit` 오류 없음.

### Task 4: `?test` 소환 버튼 + 화면 확인

**Files:**
- Modify: `index.html:401` (`#tester`에 버튼 하나)
- Modify: `src/main.ts:432` 부근(테스터 모드 블록)

**Interfaces:**
- Consumes: Task 2의 `spawnNear(..., 'fallen_paladin')`.

- [ ] **Step 1: 버튼** — `<button id="test-knight" title="주인공 근처에 타락한 성기사를 불러낸다(야영지 제외)">기사 소환</button>`.
- [ ] **Step 2: 처리** — 테스터 블록에 클릭 처리: `playing() && land !== 'camp'`일 때 `spawnNear(world, 'boss', hero.x, hero.z, 3, -1, 'fallen_paladin')`. 렌더러는 `draw()`가 새 엔티티에 스프라이트를 만든다(`render.ts:259`) — 따로 할 일 없음.
- [ ] **Step 3: 빌드** — `npm run build` 성공.
- [ ] **Step 4: 화면 확인** — `npm run dev` 후 헤드리스 Chrome으로 `?test` 열기(이 저장소의 기존 확인 방식대로, DEV의 `window.__game` 사용 가능). 미궁 1층·폐허에서 소환 → 스크린샷: (1) 배색 C, (2) 후광 은은함(번쩍이지 않음, 어두운 바닥에서 보임), (3) 8방향 걷기 방향이 이동 방향과 맞음, (4) 내려베기가 보스 간격에 맞게 재생, (5) 쓰러짐 후 후광이 꺼지고 시체가 남음. 이상하면 Task 1·3의 수치를 고친다.
- [ ] **Step 5: 마무리** — `npm test` 전체 PASS. 커밋하지 않고, 바뀐 파일 목록을 사용자에게 보고.
