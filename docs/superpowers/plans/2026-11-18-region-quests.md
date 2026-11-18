# 지역 의뢰 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 지역마다 다른 선택 의뢰(2·3·4구역 대상 3개) — 끝낼수록 보스 약화, 셋이면 스킬 포인트·전설 확정.

**Architecture:** 이야기 표(`rules.ts`)에 지역별 의뢰를 넣고, 맵 생성이 대상 글자를 놓고, sim이 대상을 끝내면 `w.marked`를 남긴다. main이 진행 비트(`marks`)·저장·대화·보스 약화를 맡는다.

**Tech Stack:** TypeScript, vitest, three.js(그림은 기존 판자 + 색).

**Spec:** `docs/superpowers/specs/2026-11-18-region-quests-design.md`

## Global Constraints

- sim(`src/sim/`)은 three.js·`Math.random` 금지(난수는 `rand(w)`, 맵은 시드).
- 대사·조각 글은 번역투 금지, 순찰대장 말투("~네", "~게").
- 수치는 `QUEST = { weaken: 0.1, beacon: ['mmm', 'mwa'], graves: 2 }`.
- 검증은 PowerShell에서 `npx vitest run`(Git Bash에선 경로 대소문자로 vitest가 실패한다), 종료 코드로 판단.

## Review Focus

- 지난 지역(이미 깬 단계)에 들어가면 대상이 없어야 한다 → Task 4 `markLetter`가 지금 단계 지역만.
- 같은 구역 대상을 끝낸 뒤 죽고 다시 와도 다시 나오지 않는다 → Task 4 `markLetter`가 비트 확인.
- 봉화 물결 중 죽으면 다시 들어왔을 때 처음부터(진행 없음) → 맵이 새로 만들어지므로 자연스럽다, 따로 테스트 없음.
- 셋째 대상에서 스킬 포인트가 두 번 들어가지 않는다 → Task 4: 이미 켜진 비트면 아무것도 안 함.
- 옛 저장(marks 없음) → Task 5에서 0.

---

### Task 1: 이야기 표·의뢰 규칙

**Files:** Modify `src/sim/rules.ts`(STORY, CLUE_FLOOR 자리), Test `src/sim/story.test.ts`

**Produces:** `type QuestKind = 'note' | 'beacon' | 'keeper' | 'seal'`; `Story.quest: { kind: QuestKind; name: string; sign: string; marks: { name: string; text: string }[] }`(`clue` 삭제); `QUEST`; `MARK_LETTER: Record<QuestKind, string>` = `{ note: 'L', beacon: 'J', keeper: 'k', seal: 'O' }`; `markBit(floor: number): number`(2→1, 3→2, 4→4, 그 밖 0); `markCount(marks: number): number`; `bossHpScale(count: number): number`.

- [ ] 테스트: 지역별 의뢰 종류 `['note','beacon','keeper','seal']`, 조각 3개씩; `markBit(1)=0, markBit(2)=1, markBit(4)=4, markBit(5)=0`; `markCount(5)=2`; `bossHpScale(0)=1`, `bossHpScale(3)≈0.7`.
- [ ] 실패 확인 → 구현(조각 글은 스펙 표대로: 셋째 조각 = 지금 `clue`의 글을 이어 씀) → 통과.

### Task 2: 맵에 대상 놓기

**Files:** Modify `src/sim/wilds.ts`(`makeMap`, `withClue`→`withMark`), `src/sim/bot.ts:245`; Test `src/sim/wilds.test.ts`

**Consumes:** `MARK_LETTER`. **Produces:** `makeMap(seed, floor, land, from, open?, mark?: string)`, `withMark(map, seed, letter): string[]`.

- [ ] 테스트: `makeMap(s, 3, 'snow', 'w', undefined, 'J')`에 `J`가 하나; 미궁 `'k'`면 `k` 하나 + 둘레 3칸 안에 `W`가 있다.
- [ ] 구현: 자리 고르기는 지금 그대로, `k`면 둘레 거리 2 빈 칸에 `W` 1·`m` 2. 봇은 `goal === land && markBit(n) ? MARK_LETTER[STORY[stage].quest.kind] : undefined`.

### Task 3: sim — 대상 끝내기

**Files:** Modify `src/sim/rules.ts`(Chest.kind, World.marked·sureLegend, talk), `src/sim/dungeon.ts:19`(BLOCKS에 `JkO`), `src/sim/world.ts`(CHEST_KIND, 지킴이 guards, 상자 열기), `src/sim/gimmicks.ts`(touchChest, tickGimmicks), `src/sim/core.ts:396`; Test `src/sim/gimmicks.test.ts`

**Produces:** `Chest.kind`에 `'beacon' | 'keeper' | 'seal'`; `World.marked: boolean`, `World.sureLegend: boolean`(기본 false).

- [ ] 테스트(작은 글자 맵으로 `createWorld`):
  - 흔적 `L`: 열면 `talk === 'clue'`, `marked`.
  - 봉화 `J`: 누르면 물결 1(`mmm` 3마리), 다 죽이면 물결 2, 다 죽이면 `open && marked`, 전리품 없음.
  - 궤 `k`: 지킴이 살아 있으면 안 열림, 다 죽인 뒤 열면 `open && marked`.
  - 봉인 `O`: 누르면 `open && marked`, 무덤(skin `grave`) 2개.
  - `sureLegend`면 보스 처치 시 전설이 반드시 나온다.
- [ ] 구현 → 통과.

### Task 4: main — 진행·대화·보스 약화·이름표·HUD

**Files:** Modify `src/main.ts`

**Consumes:** Task 1~3 전부.

- [ ] `let marks = 0`. `clueHere` → `markLetter(): string | undefined`(지금 단계 지역 && `markBit(floor)` && `!(marks & bit)`), `makeFloor`가 넘긴다.
- [ ] 보스 구역(지금 단계 지역, floor === FLOORS): 보스 `hp·maxHp × bossHpScale(count)`, count 3이면 `w.sureLegend = true`.
- [ ] 프레임에서 `world.marked`: 지우고, 비트가 새로 켜질 때만 조각(찾은 순서 = 켜기 전 count) 대화 + `(의뢰명 n/3 · 보스 이름이 약해졌다)`, 셋째면 `world.points++`·`entry.points++` + 문구 `스킬 포인트 +1, 주인은 전설 장비를 남긴다`. 저장, `showFloor` 다시.
- [ ] 이름표: 안 열린 `clue/beacon/keeper/seal` 상자 위에 `quest.sign`. HUD 임무 줄 `goal · name n/3`(지금 단계 지역 아닌 야영지에서도 보임).
- [ ] 단계가 넘어가면 `marks = 0`; 저장·이어하기·새 게임에서 `marks` 주고받기.

### Task 5: 저장

**Files:** Modify `src/save.ts`, Test `src/save.test.ts`

- [ ] 테스트: 왕복에 `marks` 유지, 없으면 0, `8`·`-1`·`1.5`는 null.
- [ ] 구현 → 통과.

### Task 6: 그림·확인

**Files:** Modify `src/render/props.ts:706-711`

- [ ] 봉화 = 시련 제단 판자 + 푸른 색(`ICE_CHEST`), 열리면 glow; 봉인 = 성소 판자 + 붉은 색; 궤 = 상자 + 금빛.
- [ ] 전체 테스트(PowerShell `npx vitest run`, 종료 0), `npm run build`, 헤드리스 Edge로 각 지역 대상 화면 확인(`__game.goto`).
- [ ] 커밋.
