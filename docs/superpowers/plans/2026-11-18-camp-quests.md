# 야영지 의뢰·느낌표 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 순찰대장이 야영지 도착 즉시 말을 걸지 않고, 주민(의뢰인)이 지역 의뢰를 맡기며, 할 말이 있는 NPC 위에 `!`를 띄운다.

**Architecture:** 규칙(대사 고르기·의뢰가 켜졌는지·조각 보상)은 `src/sim/rules.ts`의 순수 함수, 상태(`news`·`took`)는 `main.ts` 전역 + `save.ts`. 의뢰인은 새 chest kind `asker`(맵 글자 `q`).

**Tech Stack:** TypeScript, Vite, three.js, vitest

**Spec:** `docs/superpowers/specs/2026-11-18-camp-quests-design.md`

## Global Constraints
- 조각 금화 = `10 × depthOf(land, floor)`. 보스 약화 비율은 지금 그대로(`QUEST.weaken` 0.1).
- 초원·설원 의뢰 = `ask` 있음, reward `'gold'`. 미궁·폐허 = `ask` 없음, reward `'weaken'`.
- 옛 저장: `news = false`, `took = marks > 0`.
- 커밋 안 된 보스 깊이 배율(`toughenBoss`) 변경은 건드리지 않고, 커밋에 넣지 않는다.

## Review Focus
- 수락 전 저장·불러오기 → 의뢰 대상이 안 생겨야 한다(`questOn`이 `took`을 본다).
- 보스 처치 직후 야영지 → 대화창 없음, 대장 `!`. 대장과 이야기한 뒤 `!`가 사라져야 한다.
- 지난 지역 보스를 다시 깸(단계 안 넘어감) → `news`가 켜지면 안 된다.
- 옛 저장(news·took 없음)을 불러와도 깨지지 않아야 한다.
- 야영지 배치를 바꾼 뒤에도 NPC가 모두 걸어서 닿아야 한다(wilds.test 야영지 테스트).

---

### Task 1: 규칙 함수 + 데이터
**Files:** Modify `src/sim/rules.ts`, Test `src/sim/story.test.ts`
**Produces:**
- `Quest`에 `ask?: string`, `reward: 'gold' | 'weaken'`
- `captainNews(stage: number, cycle: number): string` — stage 0·cycle 0이면 OPENING, 아니면 `STORY[(stage + STORY.length - 1) % STORY.length].done`
- `questOn(stage: number, took: boolean): boolean` — `!STORY[stage].quest.ask || took`
- `markGold(land, floor) = 10 * depthOf(land, floor)`
- [ ] 테스트: captainNews(0,0)=OPENING, (1,0)=STORY[0].done, (0,1)=STORY[3].done; questOn(0,false)=false, (0,true)=true, (2,false)=true; reward·ask 배치가 Global Constraints대로.
- [ ] 구현 → `npx vitest run src/sim/story.test.ts` 통과 → 커밋

### Task 2: 의뢰인 NPC·야영지 배치
**Files:** `src/sim/rules.ts`(Chest kind·talk 유니온에 `asker`), `src/sim/world.ts`(CHEST_KIND `q: 'asker'`), `src/sim/gimmicks.ts`(touchChest), `src/render/props.ts`(asker → villager1 그림), `src/sim/wilds.ts`(generateCamp), Test `src/sim/wilds.test.ts`
- [ ] 야영지 테스트를 `'HEVq'` 각 1, `P` 1, kinds `['asker','elder','merchant','villager']`, 각 NPC가 모닥불(B)에서 4칸 이상 떨어지고 서로 4칸 이상, 모두 닿음으로 고친다 → 실패 확인
- [ ] 배치: E (c-5,c), V (c,c-5), q (c+4,c+2), P (c-3,c+4); 큰 소품 o는 NPC 둘레 1칸과 겹치지 않게 옮긴다 → 통과 → 커밋

### Task 3: main 흐름·`!`·저장
**Files:** `src/main.ts`, `src/save.ts`, `src/render/labels.ts`, `index.html`, Test `src/save.test.ts`
- [ ] `Run`에 `news: boolean; took: boolean`; 파싱 기본값(Global Constraints). 테스트: 옛 저장 → news false, took = marks>0.
- [ ] `Sign`에 `alert?: boolean` → className `label sign alert`; CSS `.label.sign.alert::before { content: '! '; color: #ffd84a; font-weight: bold }`.
- [ ] main: `toCamp`·새 게임에서 showTalk 대신 `news = true`(새 게임과 단계가 넘어갈 때만); `talkTo('elder')`는 news면 captainNews 후 news=false·저장; `talkTo('asker')`는 ask·!took면 부탁 대사 후 took=true·저장·HUD, took면 진행, 아니면 잡담; signsOf에서 대장·의뢰인 alert; `markLetter`·`goalLine`이 `questOn` 확인; `markDone` 보상 분기(gold: 금화, weaken: 지금 메시지); makeFloor 보스 약화·전설은 reward weaken일 때만; 단계 넘어가면 took=false.
- [ ] `npx vitest run > log; echo $?` 0, `npx tsc --noEmit` 0 → 커밋
