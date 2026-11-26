# 2막 ⑤ 뒤틀린 차원 ① 메아리·발판·문 + 1~3층 맵 — 만드는 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 뒤틀린 차원 1~3층을 걸어서 깰 수 있게 한다. 4초 늦게 따라오는 메아리가 발판을 누르고, 발판 짝이 함께 눌리면 문이 열린다.

**Architecture:** 신전(`temple.ts`·`templemap.ts`)과 같은 모양. 맵 생성은 `warpmap.ts`, 퍼즐 상태와 틱은 `warp.ts`, `World.warp`에 담고 `tickGimmicks`에서 돈다. 그림(②)·파수꾼(③④)·엔딩(⑤)은 이 계획에 넣지 않는다.

**Tech Stack:** TypeScript, vitest(`npx vitest run <파일>`).

**Spec:** `docs/superpowers/specs/2026-11-26-act2-rift-design.md` 1~4절

## Global Constraints

- sim(`src/sim`)에 three.js·`Math.random` 금지. 맵은 시드 → 확인 → 안 되면 다음 시드.
- 땅 이름은 `warp`(설계서의 `rift`는 이미 세트 이름 `rift`·`RIFT`가 써서 바꿈). 이름 「뒤틀린 차원」, 단위 "층".
- 맵 글자(아스키는 다 썼다): `α β γ δ` 발판(같은 글자 둘이 한 짝), `Α Β Γ Δ` 그 짝의 문(닫히면 막힘), `ψ` 불기둥, `Ω` 출구(천막 → 차원, 층 → 다음 층). 허공 `-`, 벽 `#`는 그대로.
- 수치(`WARP` in rules.ts): `delay: 4`(메아리 늦음, 초), `fireEvery: 3`, `fireUp: 1`, `fireDmg: 0.15`(최대 체력 비율, 한 번 솟을 때 한 번).
- 층: 1·2·3층, 3층 출구는 결전장(`FLOORS`)으로 바로 간다. 결전장은 ④에서 만든다(그때까지 결전장 층은 3층 맵).
- 문구는 번역투 없이. 처음 들어오면 한 줄: "발밑에서 내 발소리가 한 박자 늦게 따라온다."
- 조각마다 그 테스트만, 전체 테스트는 커밋 직전 한 번.

## Review Focus

- 발판 위에 주인공과 메아리가 같이 서 있다(같은 발판): 짝의 다른 발판이 비어 있으면 문은 안 열린다.
- 메아리가 아직 없다(들어온 지 4초 안): 발판은 주인공만 누른다.
- 문 칸에 몬스터가 서 있을 수 없다(닫힌 문은 막힘) — 열린 뒤에는 그냥 바닥.
- 망령(`mummy`)이 차원에 나와도 끝내 죽는다(신전 밖에서 `mummyFalls`가 늘 다시 일으키지 않게).
- 맵: 모든 발판 짝 사이 걸음이 4초 걸음(주인공 4m/s → 16칸)보다 넉넉히 짧고(1·2층 ≤ 10칸, 3층 ≤ 13칸), 문을 다 열면 출구에 걸어서 닿는다.

---

### Task 1: 메아리·발판·문·불기둥 sim (`warp.ts`)

**Files:**
- Create: `src/sim/warp.ts`, `src/sim/warp.test.ts`
- Modify: `src/sim/rules.ts`(`Land`·`Exit.to`·`World.warp`·`WARP`·`LANDS.warp`), `src/sim/dungeon.ts`(`Theme`·`BLOCKS`에 `ΑΒΓΔ`), `src/sim/world.ts`(`EXIT_TO` `Ω`, `makeWarp` 호출, 방마다 스킨), `src/sim/gimmicks.ts`(`tickWarp`), `src/sim/temple.ts`(`mummyFalls`: `!w.temple`이면 false)

**Interfaces:**
- Produces:
  - `type Warp = { trail: Float32Array; head: number; filled: number; echo: [number, number] | null; plates: { pair: number; cell: number; on: boolean }[]; doors: { pair: number; cells: number[]; open: boolean }[]; fires: number[]; fireT: number; fireHit: boolean; room: Int16Array; rooms: Land[]; ver: number }`
  - `makeWarp(map: string[], grid: Grid): Warp | null` — 발판·문·불기둥이 하나도 없으면 null. `room`은 문을 막힌 채로 둔 걷는 칸 덩어리 번호(없으면 -1), `rooms[k]` = 방 번호 순서대로 lake → raid → mine → temple 반복(`['lake','raid','mine','temple'][k % 4]`).
  - `tickWarp(w: World): void` — 매 틱: 주인공 자리 기록 → `echo` = `WARP.delay`초 전 자리(쌓이기 전엔 null) → 발판 `on` = 주인공 또는 메아리가 그 칸에 → 짝의 발판이 모두 `on`이면 문 열기(`grid.blocked` 0, `ver++`) → 불기둥.
  - `warpSkins(w: World): void` — `createWorld` 끝에서 부른다. 주인공이 아닌 몬스터마다 그 칸 방의 땅 `LANDS[land].skins`로 `dress`.
- Consumes: `dress`(core.ts), `hurt`(core.ts), `walkable`(path.ts).

- [ ] **Step 1: 실패하는 테스트** (`warp.test.ts`, 손으로 짠 작은 맵 — 방 둘, 가운데 벽에 문 `Α` 3칸, 왼쪽 방에 `α` 둘)
  - `메아리는 4초 동안 없고, 그 뒤엔 4초 전 주인공 자리에 있다`: 주인공을 x 방향으로 옮기며 `step`, 3.9초에 `echo === null`, 4.1초 뒤 `echo`가 0.1초 무렵 자리와 0.3칸 안.
  - `주인공 혼자서는 문이 안 열리고, 메아리와 발판 둘을 함께 누르면 열린 채로 남는다`: 주인공을 발판1 → 발판2로 옮겨 놓고 기다림 → 메아리가 발판1에 닿는 틱에 `doors[0].open`, 문 칸 `walkable`. 주인공이 떠나도 그대로.
  - `한 발판에 주인공과 메아리가 함께 서 있어도 문은 안 열린다`.
  - `불기둥: 솟은 동안 위에 선 주인공은 한 번만 최대 체력의 15%를 잃는다`.
  - `차원의 망령은 쓰러지면 끝이다`: 신전이 없는 월드에서 `mummy`를 `hurt`로 죽이면 `state === 'dead'`.
- [ ] **Step 2:** `npx vitest run src/sim/warp.test.ts` → 실패(모듈 없음).
- [ ] **Step 3:** 위 Interfaces대로 만든다. 주인공 자리 기록은 `WARP.delay / DT`칸 고리 버퍼. 발판 판정은 칸 단위(`Math.floor`).
- [ ] **Step 4:** 같은 명령 → 통과. `npx tsc --noEmit` 통과.

### Task 2: 1~3층 맵 생성 (`warpmap.ts`)

**Files:**
- Create: `src/sim/warpmap.ts`; Test: `src/sim/warp.test.ts`에 더함
- Modify: `src/sim/wilds.ts`(`makeMap`: `land === 'warp'` → `generateWarp`)

**Interfaces:**
- Produces: `generateWarp(seed: number, floor: number, from: Side = 'w'): string[]` — 64×64. 허공 위에 방(가로 9~13 × 세로 8~11, 벽 `#` 한 칸)들이 이어진다. 방 수 1층 3, 2층 4, 3층 5. 이웃한 방은 벽 한 줄을 함께 쓰고 그 벽에 문 3칸(`Α`…). 문 하나마다 그 문 **앞쪽 방**(들어오는 쪽)에 같은 짝 발판 둘. 첫 방에 `H`(들어온 쪽), 마지막 방에 `Ω` 3칸과 상자 `c`. 2층부터 몬스터, 2층은 나중 발판(문에 가까운 쪽) 둘레 2칸에 무리(`m`·`w`·`a` 4~6), 불기둥 `ψ`는 2층부터 방마다 1~2개(발판·문·주인공 둘레 1칸 밖). 3층은 방 하나에 문 둘(갈림길, 한쪽은 상자 방).
- 확인(안 되면 다음 시드): 짝마다 두 발판 사이 걸음 거리 ≤ 10(3층 ≤ 13), 모든 문을 연 상태에서 `H`→`Ω` 걸음이 이어짐, 문을 닫은 상태에서 `H` → 첫 문의 두 발판에 닿음.

- [ ] **Step 1: 실패하는 테스트**
  - `차원 1~3층: 방 3·4·5, 문을 닫으면 출구에 못 닿고, 발판 짝을 차례로 누르면(메아리로) 출구까지 걷는다`: 시드 3·41·977 × 층 1·2·3. 문을 하나씩: 주인공을 발판 하나에 순간이동 → 다른 발판으로 → `WARP.delay + 0.2`초 `step` → 그 문 `open`. 다 열고 `H`에서 `Ω`까지 `walkable` 너비 우선 탐색으로 닿음.
  - `같은 시드면 같은 맵`.
  - `짝마다 두 발판 사이 걸음 ≤ 10(3층 ≤ 13)`.
- [ ] **Step 2:** 실행 → 실패.
- [ ] **Step 3:** 만든다. 방 배치는 광산처럼 격자 자리(4×4 슬롯, 슬롯 16칸)에서 들어온 쪽 → 반대쪽으로 이웃 슬롯을 잇는 길. 발판 거리 확인은 `walkDistances`.
- [ ] **Step 4:** 통과.

### Task 3: 게임에 잇기(천막 출구·층 넘김·첫 한 줄)

**Files:**
- Modify: `src/sim/wilds.ts`(`generateTent`에 `warp` 인자: 천막 북서쪽 길 끝 `Ω`), `src/sim/rules.ts`(`depthOf` warp = 신전 + 5), `src/sim/act2.ts`(`ACT2_MAX` 그대로 — 7은 엔딩에서), `src/main.ts`(`hubOf`·출구 표시 목록·`openLands`에 `act2 >= 6 → 'warp'`·`nextFloor`: warp 3층 → `FLOORS`·처음 들어올 때 한 줄)

- [ ] **Step 1: 실패하는 테스트**: `천막: 차원이 열리면 북서쪽에 차원 출구 3칸, 다른 출구와 같은 시드 난수열`(신전 테스트의 천막 테스트 따라).
- [ ] **Step 2~4:** 만들고 통과. 그다음 전체 `npx vitest run` 한 번 + `npx tsc --noEmit`.
- [ ] **Step 5: 커밋**(내 파일만): `git add src/sim/warp.ts src/sim/warpmap.ts src/sim/warp.test.ts …` 메시지에 무엇이 되는지 한국어로.
