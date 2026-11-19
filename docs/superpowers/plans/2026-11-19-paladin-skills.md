# 타락한 성기사 전용 기술 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 타락한 성기사에게 빛의 사슬·성검의 비·심판을 붙이고, 성소 체력 배율을 0.8로 올린다.

**Architecture:** 수치는 `sanctum.ts`의 새 표 `PALADIN`. 행동은 새 파일 `src/sim/paladin.ts`: `paladin(w, e, t)`(성기사 한 틱의 행동, `act()`에서 돌진보다 먼저)과 `tickPaladin(w, hero)`(빛줄 피해·칼 벽 시간·심판 해금, `tickGimmicks`에서 매 틱). 성검 표식은 기존 `w.zones`(owner −1, kind `'sword'`)를 타고, 칼 벽은 사슬 문처럼 `grid.blocked`를 잠시 1로. 그림은 기존 성소↔성기사 선(`props.ts` beams)의 보이는 조건을 `litBeams()`로 바꾸고, 칼·심판 바닥은 `zones.ts`에 더한다.

**Tech Stack:** TypeScript + three.js + vitest.

**Spec:** `docs/superpowers/specs/2026-11-19-paladin-skills-design.md`

## Global Constraints

- 수치 표(스펙 그대로), `src/sim/sanctum.ts`:
  `export const PALADIN = { beamR: 0.4, beamEvery: 1, beamMult: 0.5, rainFirst: 6, rainCd: 12, raise: 0.8, rainDelay: 1, rainCount: 8, rainRange: 12, rainGap: 1.5, altarGap: 2, swordR: 0.7, swordMult: 1.5, swordWall: 6, judgeFirst: 3, judgeCd: 18, judgeWindup: 2.5, judgeSafe: 3, judgeMult: 3 };`
- `SANCTUM.bossHp` 0.5 → 0.8 (1회차 성소 5층 성기사 2280).
- 피해 = `Math.round(roll(w, boss) × 배율)`. 빛줄·성검·심판 피해는 `hurt(w, 대상, dmg)` — `from`을 넘기지 않는다(가시 반사·흡혈이 걸리지 않게).
- 맞는 쪽은 `friends(w)`(주인공 + 아군 소환수).
- 성검의 비 진행 중(예고 시작 ~ 마지막 칼이 사라질 때) 빛줄 없음. 성기사 기절 중 빛줄 없음. 심판과 성검의 비는 겹치지 않는다.
- 게임 문구는 자연스러운 한국어(번역투 금지). 새 화면 문구는 없다.
- 시험: `npm test -- <파일>`(Windows 드라이브 글자 문제 때문에 `npx vitest` 대신 이것). 조각마다 관련 파일만, 전체 `npm test`는 커밋 직전 한 번.
- 커밋은 마지막 Task 5에서 한 번.

## Review Focus

- 칼이 성소 바로 옆에 꽂혀 바칠 자리를 막음 → 성소 중심 2m 안에는 표식을 두지 않는다(Task 2 시험).
- 칼이 누가 선 칸에 꽂혀 그 자리에 갇힘 → 살아 있는 누구(주인공·아군·몬스터)라도 선 칸은 막지 않는다(Task 2 시험).
- 칼이 서 있는 동안 성기사가 죽음 → 벽은 그래도 6초 뒤 풀린다(Task 2 시험).
- 기도·칼 치켜들기 도중 고리가 깨져 기절 → 기술이 끊겨야 한다(지금 `tickAltars`는 `stunT`만 세팅해 phase가 남는다)(Task 3 시험).
- `?test` 소환(성소 밖, 성소 없음) → 빛줄 0, 나머지 둘은 그대로 동작(Task 1 시험).

---

### Task 1: 수치·상태·빛의 사슬

**Files:**
- Modify: `src/sim/sanctum.ts` (`PALADIN` 추가, `SANCTUM.bossHp` 0.8, 주석)
- Modify: `src/sim/rules.ts` (`World`에 `pal`, `swords`; `Zone.kind`에 `'sword'`; `Entity.phase`에 `'raise' | 'pray'`)
- Modify: `src/sim/world.ts:104` (createWorld 초기값)
- Create: `src/sim/paladin.ts`
- Modify: `src/sim/gimmicks.ts:118` 근처 (`tickGimmicks`에서 `tickPaladin(w, hero)` 매 틱, 지역 무관)
- Test: `src/sim/sanctum.test.ts`

**Interfaces:**
- Produces:
  - `World.pal: { rain: number; judge: number; quiet: number; burn: Record<number, number> }` — rain = 다음 성검의 비까지(초), judge = 다음 심판까지(−1 = 아직 잠김), quiet = 빛줄이 꺼져 있을 남은 시간, burn = 대상 id → 다시 데일 수 있을 때까지(초). 초기값 `{ rain: PALADIN.rainFirst, judge: -1, quiet: 0, burn: {} }`.
  - `World.swords: { id: number; x: number; z: number; t: number }[]` — x, z는 칸 정수, t = 벽 남은 시간. 초기값 `[]`.
  - `paladinOf(w: World): Entity | undefined` — 살아 있는 `skin === 'fallen_paladin'` 보스.
  - `litBeams(w: World): Chest[]` — 성기사가 살아 있고 `stunT <= 0`이고 `pal.quiet <= 0`이면 `kind === 'altar' && !open`인 상자들, 아니면 `[]`.
  - `tickPaladin(w: World, hero: Entity): void` — 이 Task에서는 burn 감소 + 빛줄 피해. Task 2·3이 더한다.

- [ ] **Step 1: 실패하는 시험** (`sanctum.test.ts`, 기존 `arena()` 그대로 쓴다. 이 계획 전체에서 더할 import: `paladin`·`landSword`·`litBeams`·`tickPaladin` ← `./paladin`, `PALADIN` ← `./sanctum`, `spawnNear` ← `./gimmicks`, `clearLine` ← `./core`, `stun` ← `./wizard`)

```ts
test('빛의 사슬: 줄 수 = 켜진 성소 수, 기절·성검의 비 동안 0, 성소 밖이면 0', () => {
  const { w, boss, altars } = arena();
  boss.stunT = 0;
  expect(litBeams(w).length).toBe(4);
  altars[0].open = true;
  expect(litBeams(w).length).toBe(3);
  w.pal.quiet = 1;
  expect(litBeams(w).length).toBe(0);
  w.pal.quiet = 0;
  boss.stunT = 1;
  expect(litBeams(w).length).toBe(0);
  const out = createWorld(3, generateFloor(3, 5), 1, 1, LANDS.ruins.skins);
  spawnNear(out, 'boss', out.entities[0].x, out.entities[0].z, 3, -1, 'fallen_paladin');
  expect(litBeams(out).length).toBe(0);
});

test('빛의 사슬: 줄 위에 서면 데이고, 1초에 한 번만', () => {
  const { w, boss, altars, hero } = arena();
  boss.stunT = 0;
  const [ax, az] = [altars[0].x + 0.5, altars[0].z + 0.5];
  Object.assign(hero, { x: boss.x + (ax - boss.x) * 0.25, z: boss.z + (az - boss.z) * 0.25 });
  const hp0 = hero.hp;
  tickPaladin(w, hero);
  const hp1 = hero.hp;
  expect(hp1).toBeLessThan(hp0);
  tickPaladin(w, hero);
  expect(hero.hp).toBe(hp1);
  for (let i = 0; i < Math.round(PALADIN.beamEvery / DT); i++) tickPaladin(w, hero);
  expect(hero.hp).toBeLessThan(hp1);
  Object.assign(hero, { x: altars[2].x + 0.5, z: altars[2].z + 2.5, hp: hero.maxHp }); // 줄에서 먼 곳
  for (let i = 0; i < 30; i++) tickPaladin(w, hero);
  expect(hero.hp).toBe(hero.maxHp);
});
```

- [ ] **Step 2: 실패 확인** — `npm test -- src/sim/sanctum.test.ts` → `litBeams`/`tickPaladin`/`PALADIN` 없음으로 FAIL.

- [ ] **Step 3: 구현** — 위 Interfaces대로. 빛줄 판정: 대상에서 선분(성기사 중심 → 성소 칸 중심)까지 거리 ≤ `PALADIN.beamR`이고 `burn[id] <= 0`이면 피해 `roll × beamMult`, `burn[id] = beamEvery`. 선분 거리 함수는 `paladin.ts` 안에 둔다(기둥은 막지 않는다 — 빛이다).

- [ ] **Step 4: 통과 확인** — `npm test -- src/sim/sanctum.test.ts` PASS(기존 성소 시험 포함).

---

### Task 2: 성검의 비

**Files:**
- Modify: `src/sim/paladin.ts` (`paladin`, `landSword`, `tickPaladin`에 칼 벽 시간)
- Modify: `src/sim/world.ts:505` (`act()`: `if (e.kind === 'boss' && charge(w, e, t))` 앞에 `if (e.skin === 'fallen_paladin' && paladin(w, e, t)) return;`)
- Modify: `src/sim/abilities.ts:528` (`tickZones`: owner 없는 구역이 `kind === 'sword'`면 `explode` 대신 `landSword(w, z)`)
- Test: `src/sim/sanctum.test.ts`

**Interfaces:**
- Consumes: Task 1의 `PALADIN`, `World.pal`, `World.swords`.
- Produces:
  - `paladin(w: World, e: Entity, t: Entity | null): boolean` — 기술 예고·시전 중이면 true(평소 행동을 건너뜀). `t`가 있을 때만 `pal.rain`(과 Task 3의 `pal.judge`)이 흐른다.
  - `landSword(w: World, z: Zone): void` — 반경 `z.r` 안의 `friends(w)`에 `z.dmg`. 그 칸에 살아 있는 누구도 없고 `walkable`이면 `grid.blocked = 1` + `w.swords.push({ id, x, z, t: PALADIN.swordWall })`.
- 동작:
  - `pal.rain <= 0`이고 `e.phase === 'none'`이고 `t`가 있으면: `phase = 'raise'`, `phaseT = PALADIN.raise`, `pal.rain = PALADIN.rainCd`, `pal.quiet = PALADIN.raise + PALADIN.rainDelay + PALADIN.swordWall`, `state = 'idle'`, `path = []`.
  - `raise`가 끝나면 표식 `rainCount`개를 `w.zones`에(r = `swordR`, t = total = `rainDelay`, dmg = `round(roll × swordMult)`, owner −1, kind `'sword'`), `phase = 'none'`. 표식 자리는 칸 중심: ① 주인공 칸 ② 주인공 칸의 8방 이웃 중 걸을 수 있는 칸 하나(rand) ③ 나머지는 성기사 반경 `rainRange` 안의 걸을 수 있는 칸에서 rand, 이미 고른 표식과 `rainGap` 이상, 모든 표식은 성소 칸 중심과 `altarGap` 이상(①②가 이 조건에 걸리면 그 표식은 건너뛴다). 후보가 모자라면 있는 만큼만.
  - `tickPaladin`: 각 칼 `t -= DT`, 0 이하면 `grid.blocked = 0`으로 돌리고 뺀다. 성기사가 없어도 돈다. `pal.quiet`도 여기서 줄인다.

- [ ] **Step 1: 실패하는 시험**

```ts
test('성검의 비: 0.8초 치켜든 뒤 표식 8개, 하나는 주인공 발밑, 성소 2m 안에는 없음', () => {
  const { w, boss, altars, hero } = arena();
  boss.stunT = 0;
  Object.assign(hero, { x: 24.5, z: 27.5 });
  w.pal.rain = 0;
  expect(paladin(w, boss, hero)).toBe(true);
  expect(boss.phase).toBe('raise');
  expect(litBeams(w).length).toBe(0);
  for (let i = 0; i < Math.round(PALADIN.raise / DT); i++) paladin(w, boss, hero);
  const marks = w.zones.filter((z) => z.kind === 'sword');
  expect(marks.length).toBe(PALADIN.rainCount);
  expect(marks.some((z) => Math.floor(z.x) === 24 && Math.floor(z.z) === 27)).toBe(true);
  for (const z of marks) for (const c of altars) expect(Math.hypot(z.x - c.x - 0.5, z.z - c.z - 0.5)).toBeGreaterThanOrEqual(PALADIN.altarGap);
  expect(boss.phase).toBe('none');
});

test('성검: 빈 칸은 6초 벽(돌진 시야도 막음), 사람이 선 칸은 피해만, 성기사가 죽어도 벽은 풀린다', () => {
  const { w, boss, hero } = arena();
  boss.stunT = 0;
  Object.assign(hero, { x: 24.5, z: 26.5 });
  const zone = (x: number, z: number) => ({ id: w.nextItem++, x: x + 0.5, z: z + 0.5, r: PALADIN.swordR, t: 0, total: PALADIN.rainDelay, dmg: 50, owner: -1, kind: 'sword' as const });
  landSword(w, zone(24, 24));
  expect(w.grid.blocked[24 * w.grid.w + 24]).toBe(1);
  expect(clearLine(w, boss, hero)).toBe(false);
  const hp0 = hero.hp;
  landSword(w, zone(24, 26));
  expect(hero.hp).toBeLessThan(hp0);
  expect(w.grid.blocked[26 * w.grid.w + 24]).toBe(0);
  boss.state = 'dead'; // 고리 때문에 hurt로는 못 죽이니 바로 죽은 것으로
  for (let i = 0; i < Math.round(PALADIN.swordWall / DT) + 1; i++) tickPaladin(w, hero);
  expect(w.grid.blocked[24 * w.grid.w + 24]).toBe(0);
  expect(w.swords.length).toBe(0);
});
```

- [ ] **Step 2: 실패 확인** — `npm test -- src/sim/sanctum.test.ts` FAIL.
- [ ] **Step 3: 구현** — 위 Interfaces·동작대로.
- [ ] **Step 4: 통과 확인** — `npm test -- src/sim/sanctum.test.ts src/sim/gimmicks.test.ts` PASS.

---

### Task 3: 심판 + 고리 깨짐이 기술을 끊음

**Files:**
- Modify: `src/sim/paladin.ts` (`paladin`에 심판, `tickPaladin`에 해금)
- Modify: `src/sim/gimmicks.ts:199` (고리가 깨질 때 `boss.stunT`와 함께 `boss.phase = 'none'`)
- Test: `src/sim/sanctum.test.ts`

**Interfaces:**
- Consumes: Task 2의 `paladin`, `World.pal`.
- 동작:
  - 해금(`tickPaladin`): 성기사가 있고 `pal.judge < 0`이고 `hp <= maxHp / 2`면 `pal.judge = PALADIN.judgeFirst`.
  - 시작(`paladin`, 성검의 비보다 먼저 본다): `pal.judge` 0 이하(해금됨) && `phase === 'none'` && `pal.quiet <= 0` && `t` → `phase = 'pray'`, `phaseT = judgeWindup`, `pal.judge = judgeCd`. 성검의 비는 `phase === 'none'`일 때만 시작하므로 기도 중엔 안 나온다.
  - 끝: `phaseT`가 다 되면 성기사에게서 `judgeSafe` 밖의 `friends(w)` 전부 `round(roll × judgeMult)`, `w.blasts`에 기존 종류 하나(성기사 자리, 렌더 Task에서 고름), `phase = 'none'`.
  - 끊김: 기존 `stun()`이 `phase = 'none'`으로 만든다(불굴이면 안 끊김). 쿨은 시작할 때 이미 돌았으니 그대로.

- [ ] **Step 1: 실패하는 시험**

```ts
test('심판: 체력 절반 전에는 잠겨 있고, 절반 아래면 3초 뒤 첫 사용', () => {
  const { w, boss, hero } = arena();
  boss.stunT = 0;
  tickPaladin(w, hero);
  expect(w.pal.judge).toBe(-1);
  boss.hp = Math.floor(boss.maxHp / 2);
  tickPaladin(w, hero);
  expect(w.pal.judge).toBe(PALADIN.judgeFirst);
});

test('심판: 3m 안은 무사, 밖은 맞는다. 성검의 비가 진행 중이면 기다린다', () => {
  const { w, boss, hero } = arena();
  boss.stunT = 0;
  Object.assign(w.pal, { judge: 0, rain: 99, quiet: 1 });
  Object.assign(hero, { x: boss.x + 2, z: boss.z });
  paladin(w, boss, hero);
  expect(boss.phase).toBe('none');
  w.pal.quiet = 0;
  paladin(w, boss, hero);
  expect(boss.phase).toBe('pray');
  const hp0 = hero.hp;
  for (let i = 0; i < Math.round(PALADIN.judgeWindup / DT) + 1; i++) paladin(w, boss, hero);
  expect(hero.hp).toBe(hp0);
  Object.assign(w.pal, { judge: 0 });
  Object.assign(hero, { x: boss.x + 5, z: boss.z });
  paladin(w, boss, hero);
  for (let i = 0; i < Math.round(PALADIN.judgeWindup / DT) + 1; i++) paladin(w, boss, hero);
  expect(hero.hp).toBeLessThan(hp0);
});

test('기도 중 기절하거나 고리가 깨지면 심판이 끊긴다', () => {
  const { w, boss, altars, hero, stand, run } = arena();
  boss.stunT = 0;
  Object.assign(w.pal, { judge: 0, rain: 99 });
  paladin(w, boss, hero);
  stun(boss, 1);
  expect(boss.phase).toBe('none');
  boss.phase = 'pray';
  boss.stunT = 1e9; // 고리 깨짐 경로: tickAltars
  for (const c of altars) { stand(c); w.offer = { id: c.id, t: 0 }; run(SANCTUM.offer + 0.1); }
  expect(boss.phase).toBe('none');
});
```

- [ ] **Step 2: 실패 확인** — `npm test -- src/sim/sanctum.test.ts` FAIL.
- [ ] **Step 3: 구현** — 위 동작대로.
- [ ] **Step 4: 통과 확인** — `npm test -- src/sim/sanctum.test.ts` PASS.

---

### Task 4: 그림

**Files:**
- Modify: `src/render/props.ts:455-464` (beams: `visible = litBeams(world).includes(ch)`, 끝점은 `paladinOf(world)`)
- Modify: `src/render/zones.ts` (`syncSwords(world, time)`, `syncJudge(world)`)
- Modify: `src/render/render.ts:18` 근처 (`syncZones` 옆에서 둘을 부른다)
- 성검 표식 원은 기존 `syncZones`가 그대로 그린다(변경 없음).

**Interfaces:**
- Consumes: `litBeams`, `paladinOf`, `World.swords`, `PALADIN`, `Entity.phase === 'pray'`·`phaseT`.
- 그림:
  - 칼: `w.swords` 하나당 바닥에 선 대검(가는 상자 날 + 금빛 가로대, 칸 하나 크기), 마지막 0.5초 동안 흐려짐. 꽂히는 순간 하얀 고리가 퍼짐(꽂힐 때 sim이 이미 넣는 blast로 충분하면 그것).
  - 심판: 성기사가 `pray`인 동안 성기사 중심 `RingGeometry(PALADIN.judgeSafe, 30)` 붉은 바닥(불투명도 0.1 → 0.45, 진행도 = `1 - phaseT / judgeWindup`) + 반지름 `judgeSafe` 금빛 고리. 터질 때 바깥이 번쩍(Task 3의 blast 종류를 여기서 고른다).

- [ ] **Step 1: 타입 확인** — `npx tsc --noEmit` 오류 없음.
- [ ] **Step 2: 화면 확인** — `npm run dev`, `?test`에서 무작위 직업 하나로 ① 「기사 소환」: 성검 표식→칼→6초 뒤 사라짐, 체력을 절반 아래로 깎아 심판 붉은 바닥과 금빛 고리 ② 성소 5층(가능하면): 성소마다 빛줄, 성소를 끄면 줄이 사라짐, 성검의 비 동안 줄이 꺼짐. 스크린샷 한 장씩.

---

### Task 5: 전체 시험·커밋

- [ ] **Step 1:** `npm test` 전체 PASS.
- [ ] **Step 2:** `npx tsc --noEmit` 오류 없음.
- [ ] **Step 3: 커밋**

```bash
git add docs/superpowers/specs/2026-11-19-paladin-skills-design.md docs/superpowers/plans/2026-11-19-paladin-skills.md src/sim/paladin.ts src/sim/sanctum.ts src/sim/sanctum.test.ts src/sim/rules.ts src/sim/world.ts src/sim/gimmicks.ts src/sim/abilities.ts src/render/props.ts src/render/zones.ts src/render/render.ts
git commit -m "feat: 타락한 성기사 전용 기술 — 빛의 사슬·성검의 비·심판, 성소 체력 배율 0.8"
```
