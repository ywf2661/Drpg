# 전설·세트 장비, 스킬 +N 옵션 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 스킬 +N 옵션(초월 6·7단계), 전설 8개, 정예 사냥꾼 세트, 고유 장비 드롭·연출·원색 외형을 넣고 상점 강화를 없앤다.

**Architecture:** 고유 장비 표식을 **옵션 목록 안의 특수 옵션**(`{ kind: 'unique', value: 0, u }`)으로 둔다 — 장착(`w.mods`)·보관함·층 이동(`Carry`)·저장이 지금 코드 그대로 따라온다. 스킬 보너스도 옵션(`skill`·`tab`·`allSkills`)이고 `rank()` 한 곳에서 더한다. 효과는 `hasUnique(w, id)`·`setCount(w)`로 각 직업 파일의 기존 장치에 끼운다.

**Tech Stack:** TypeScript, Vite, three.js, Vitest(`npm test`).

**Spec:** `docs/superpowers/specs/2026-11-16-legendary-design.md`

## Global Constraints

- 초월 상한 `RANK_MAX + 2`(= 7). 장비 보너스는 배운 스킬에만.
- 드롭: 정예 3% + 운 보정(정예 처치마다 +0.5%p, 나오면 0), 해골 왕·보스 25%, 상자 1%. 고유 판정 성공 시 전설 60% / 세트 40%, 세트는 없는 부위 70%.
- 자동 장착은 고유 장비를 입히지도 벗기지도 않는다.
- 원색: 망토 `#f5c400`, 쪼개지는 구슬 `#e8261c`, 매의 눈 두건 `#1fb83c`, 결투자의 투구 `#1f5fe8`.
- 난수는 `rand(w)`만(재현성). 기존 저장은 `VERSION`을 올려 버린다(지금 정책).

## Review Focus

1. 고유 장비를 입은 채 죽음 → 층 입구 상태로 돌아가도 고유·운 보정이 입구 값과 같다(`Carry` 복사). — Task 3 테스트.
2. 보관함이 가득할 때 보스 고유 드롭 → 사라지지 않고 바닥에 남는다. — Task 3 테스트.
3. 초월 7단계에서 재사용 대기·확률·감소율이 비정상(0 이하, 1 초과)이 되지 않는다. — Task 2 테스트.
4. 장비를 벗어 스킬 단계가 내려가도 `learn`·칸 끼우기·트리 창이 기본 단계로 동작한다. — Task 2 테스트.
5. 원색 레이어를 입고 벗을 때 시트가 다시 칠해진다(조합 키에 색). — Task 7 테스트.

---

### Task 1: 상점 강화 삭제

**Files:** Modify `src/shop.ts`, `src/hud.ts`(`showShop` 강화 줄), `src/sim/bot.ts:143`, `src/shop.test.ts`

- [ ] 테스트: `offers(c)`의 항목이 `['potion']`뿐, `buy(c, 'potion')`은 그대로.
- [ ] `ShopItem = 'potion'`, `UPGRADE`·장비 분기 삭제. HUD 강화 줄, 봇 강화 구매 삭제.
- [ ] `npm test`(playthrough는 Task 8에서 다시 잼 — 여기서 실패하면 기준만 메모).

### Task 2: 스킬 +N 옵션과 초월

**Files:** `src/sim/rules.ts`(Affix·AFFIXES), `src/sim/core.ts`(rank·rollGear), `src/sim/world.ts`(learn), `src/save.ts`, `src/hud.ts`(옵션 줄·트리), Test: `src/sim/legend.test.ts`

**Interfaces — Produces:**
- `Affix = { kind: AffixKind; value: number; skill?: SkillId; tab?: number; u?: UniqueId }`, `AffixKind`에 `'skill' | 'tab' | 'allSkills' | 'unique'`.
- `AFFIXES[k].special?: true` — 무작위 후보에서 빠짐(`tab`·`allSkills`·`unique`).
- `baseRank(w, id)`, `gearBonus(w, id)`, `rank(w, id) = base ? min(base + bonus, RANK_MAX + 2) : 0`.
- `rollSkillAffix(w, rare): Affix` — 지금 직업 스킬 중 하나, 값 1(희귀면 25%로 2).

- [ ] 테스트: 가르기 3단계 + `skill 가르기 +2` 무기 → `rank` 5·`mastered`; + 탭 +1 + 모든 +1 → 7에서 멈춤; 안 배운 스킬은 0; `learnBlock`은 기본 5에서만 '최고 단계'.
- [ ] 테스트: 4직업 × 모든 스킬 7단계로 모든 `*Stat` 함수 값이 유한·≥0, `cd`는 5단계 값의 60% 이상, `chance`·`reduce` ≤ 0.9. 실패하는 식만 바닥값.
- [ ] 테스트: `rollGear` 희귀는 15%로 옵션 하나가 `tab`; 스킬 옵션의 대상은 늘 `w.cls`.
- [ ] 구현. `learn`·`learnBlock`·`respec`은 `baseRank`. `save.ts` 옵션 검증에 `cls`를 넘겨 `skill`은 그 직업 스킬, `tab` 0~2.
- [ ] HUD: `AFFIX_TEXT`에 `가르기 +N`·`검술 스킬 +N`·`모든 스킬 +N`(안 배우면 "(배우지 않음)"), 트리의 단계 `4 (+2)` 초록·6~7 금색.

### Task 3: 고유 장비 데이터·드롭·운 보정

**Files:** `rules.ts`(UNIQUES, LEGEND_DROP), `core.ts`(rollUnique, 드롭 훅, 점수, wear), `world.ts`(줍기, 상자), `main.ts`·`save.ts`(pity), `shop.ts`(sellPrice), `render/labels.ts`(이름), Test: `legend.test.ts`

**Interfaces — Produces:**
- `UniqueId`, `UNIQUES: Record<UniqueId, { name: string; slot: Slot; cls?: HeroClass; set?: true; fixed: Affix[] | 'tab' | 'tier1'; look?: string; desc: string }>` — 이름의 `%`는 단계 기본 이름.
- `uniqueOf(it: { affixes: Affix[] }): UniqueId | undefined`, `hasUnique(w, id): boolean`, `setCount(w): number`, `quality(it): 0|1|2|3|4`(3 전설, 4 세트).
- `rollUnique(w, x, z, tier): Item`, `World.pity: number`(Carry·Run·저장에 포함).

- [ ] 테스트: 정예 처치 시 판정(시드 고정, `LEGEND_DROP.elite` 0.03 + pity), 실패마다 pity +0.005, 성공 시 0; 해골 왕·보스 0.25(보스는 보관함으로, 가득하면 바닥); 상자 0.01.
- [ ] 테스트: 직업 전설은 그 직업만; 세트는 없는 부위 70%; 전설 옵션 = `unique` + 고정 + 무작위 1~2.
- [ ] 테스트: 자동 장착 켜도 고유는 보관함으로, 입은 고유는 더 좋은 일반 장비가 와도 안 벗겨짐.
- [ ] 테스트: 저장 왕복(고유·pity), 이상한 `u`는 저장 버림, `sellPrice` 고유 +100.
- [ ] 구현. `gearName`: 고유면 `UNIQUES[u].name`(`%` 치환), 아니면 지금처럼(스킬 옵션은 접두어 없음).

### Task 4: 전설 효과 8개

**Files:** `abilities.ts`(도끼), `wizard.ts`(화염구), `ranger.ts`(관통), `necro.ts`(해골), `core.ts`(받아치기·광전사·망토), `world.ts`(구르기 불길), Test: `legend.test.ts`

수치(`LEGEND_FX`): 귀환 도끼 돌아올 때 `hit` 비움 · 분열 구슬 3개 굴림 ×0.4 · 관통 튕김 1회 · 해골 최대 +2, 쓰러지면 반경 1.2m 해골 굴림 ×1.5 · 결투자 재사용 −1초·자원 +15 · 불꽃 걸음 2초 · 광전사 최대 +40% · 망토 최대 체력 ×0.85.

- [ ] 효과마다 테스트 하나(입었을 때 / 안 입었을 때 차이) → 구현 → 통과.

### Task 5: 정예 사냥꾼 세트

**Files:** `core.ts`, `world.ts`, Test: `legend.test.ts`

**Interfaces — Produces:** `World.trophies: Partial<Record<EliteKind, number>>`(남은 초).

- [ ] 테스트: 2부위 — 정예·보스 피해 ×1.25, 정예 처치 시 자원 +30.
- [ ] 테스트: 4부위 — 정예 처치 시 그 특성 20초(같은 특성 다시 20초), 신속 이동 ×1.35·공격 ×1.25, 흡혈 10%, 폭발(잡은 적 자리 반경 1.2m 굴림 ×1.5, 바로·연쇄), 통솔 ×1.3, 분열(10초짜리 해골 병사, 최대 3).
- [ ] 구현.

### Task 6: 화면 — 등급 색·연출·세트 진행·특성

**Files:** `index.html`(CSS `--legend`·`--set`, `q3`·`q4`), `hud.ts`, `render/labels.ts`, `render/render.ts`, `render/automap.ts`, `audio/events.ts`

- [ ] `data-q`·`q${n}`을 `quality(it)`로. 툴팁에 전설 효과·세트 진행 `(2/4)`·세트 줄(켜진 줄 밝게).
- [ ] 바닥 고유 장비에 빛기둥(가산 혼합 판자, 주황·초록), 지도 점, 처음 보일 때 0.3초 멈춤 + `level_up` 소리(이벤트 테스트).
- [ ] HUD 특성 아이콘·남은 초, 주인공 발밑 특성 고리.
- [ ] `npm run build`, 헤드리스 확인.

### Task 7: 원색 외형

**Files:** `src/render/sprites.ts`(heroSheet·setHeroGear), 호출부(`main.ts`·`hud.ts`·`render.ts`), Test: `src/render/sprites.test.ts`

**Interfaces — Produces:** `looksOf(w): Partial<Record<Slot, string>>`, `setHeroGear(g, cls, looks = {})`.

- [ ] 테스트: `looksOf` — 망토 입으면 `{ armor: '#f5c400' }`; 조합 키가 색에 따라 다르다.
- [ ] 구현: 레이어를 `'color'` 합성 후 `'destination-in'`으로 투명도 복원, `url + 색` 캐시.

### Task 8: 밸런스·문서

- [ ] `playthrough.test.ts` 다시 재고 기준 갱신(강화 삭제 영향은 `GEAR_DROP`·`maxTier`로).
- [ ] 봇 30판에서 고유 장비 수 측정 → 판당 1~2개가 되게 `LEGEND_DROP` 조정.
- [ ] README 도움말, `roadmap.md`에 단계 추가, 설계서에 바뀐 점.
- [ ] 커밋.
