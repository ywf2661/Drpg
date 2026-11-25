# 2막 전설 10개 구현 계획 (2막 파밍·성장 2단계)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 2막 땅에서는 2막 전설만, 1막 땅에서는 1막 전설만 나오게 풀을 나누고, 2막 전설 10개의 효과를 만든다.

**Architecture:** `UNIQUES`에 `act2: true` 표시를 단 10개를 더하고, `rollUnique`가 `act2Land(w.land)`로 풀을 고른다. 효과는 기존 장치를 빌린다 — 화약통(powder.ts), 소환수(necro.ts `spawn`), 화살비(ranger.ts `volleys`), 저주(necro.ts `tickCurses`), 전설 무기 스킬(`GEAR_SKILLS`). 효과 하나 = 작업 하나 = 테스트 하나.

**Tech Stack:** TypeScript, vitest(`npm test -- <파일>`), three.js 렌더(src/render).

**Spec:** docs/superpowers/specs/2026-11-25-act2-loot-growth-design.md (2절)

## Global Constraints

- 1막 전용으로 남긴다: 1막 전설(`act2` 없는 것), 기도하는 자의 무기, 정예 사냥꾼 세트. 2막 땅에서는 나오지 않는다. 2막 전설은 1막 땅에서 나오지 않는다.
- 확률은 LEGEND_DROP 그대로. 직업 전설은 그 직업일 때만.
- 화약 망치는 약탈자 우두머리(skin `raider_chief`)가 **기사일 때** LEGEND_DROP.boss 확률로 따로 굴린다(`only: true`, 무작위 풀에는 없음).
- 공용 전설은 무기가 아닌 부위.
- 효과 글(desc)은 번역투 없이. 아래 표의 문장을 그대로 쓴다.
- 그림(인벤토리 그림 `src/assets/legend/<id>.png`)은 사용자가 GPT로 만든다. `LEGEND_ART`(hud.ts)는 Partial이라 그림이 없어도 돌아간다. 그림이 오면 한 줄씩 넣는다.
- sim은 결정적(rand만), three.js·Math.random 금지.
- 빠른 개발 순서: 작업마다 그 테스트만, 전체 `npm test`는 마지막 커밋 직전 한 번.

| id | 이름 | 부위·직업 | desc(그대로) |
|---|---|---|---|
| powderHammer | 우두머리의 화약 망치 | weapon·knight, only | 가르기를 쓰면 불붙은 화약통이 앞으로 굴러가 터진다 |
| bannerSpear | 원정대 깃발창 | weapon·knight | 「깃발 꽂기」가 생긴다. 꽂으면 원정대 병사 둘이 달려와 함께 싸운다 |
| wellScepter | 우물 사제의 홀 | weapon·wizard | 냉기 스킬이 물웅덩이를 남긴다. 물 위의 적이 번개에 맞으면 웅덩이 위의 적이 모두 감전된다 |
| plagueStaff | 역병 의사의 지팡이 | weapon·necromancer | 저주받은 채 쓰러진 적이 일어나 10초 동안 함께 싸운다 |
| boneFlute | 뼈 피리 | weapon·necromancer | 「행진」이 생긴다. 해골 병사들이 가리킨 쪽으로 줄지어 돌격한다 |
| galeBow | 회오리 깃 활 | weapon·ranger | 화살비가 떨어진 자리에 회오리가 일어 둘레의 적을 끌어모은다 |
| twinBows | 사냥꾼의 쌍궁 | weapon·ranger | 걷는 동안 가장 가까운 적에게 저절로 화살을 쏜다 |
| collectorCrown | 수집가의 왕관 | helm·공용 | 창고·가방·몸에 지닌 서로 다른 전설 하나마다 피해 +4%(최대 +60%) |
| runnerBoots | 도망자의 장화 | boots·공용 | 구르면 그 자리에 허수아비가 남아 둘레 적들이 2초 동안 허수아비를 친다 |
| lootSack | 약탈자의 전리품 자루 | armor·공용 | 적을 잡을수록 자루가 차고 받는 피해가 준다(최대 −25%). 맞으면 금화가 흩어진다 |

수치(rules.ts에 한 덩어리로):

```ts
export const LEGEND2 = { kegMult: 3, bannerCd: 30, bannerLife: 15, bannerHp: 1.5, bannerMult: 1, poolR: 1.5, poolT: 4, plagueLife: 10, marchCd: 12, marchSpeed: 9, marchMult: 1.5, marchDist: 8, galeR: 3, galePull: 4, galeT: 1.5, twinMult: 0.5, crownPer: 4, crownMax: 60, decoyT: 2, decoyR: 6, sackMax: 25, sackSpill: 1 / 3 };
```

## Review Focus

1. 1막 땅(초원·설원·미궁·폐허·성소)에서 2막 전설이 한 번도 안 나와야 한다 → Task 1 테스트(시드 여러 개).
2. 2막 땅에 2막 세트가 아직 없을 때 세트 굴림이 빈 목록에서 고르면 안 된다 → Task 1 테스트(`act2` 풀에 세트 0개여도 전설이 나온다).
3. 옛 저장의 장비(2막 전설 없음)와 1막 전설 효과가 그대로여야 한다 → 마지막 전체 테스트.
4. 화약 망치 통이 주인공을 다치게 하면 안 된다(`bump: true`) → Task 2 테스트.
5. 허수아비가 사라지면 몬스터가 다시 주인공을 노려야 한다 → Task 9 테스트.

---

### Task 1: 2막 전설 표와 풀 나누기, 우두머리 망치

**Files:** Modify `src/sim/rules.ts`(UniqueId·UNIQUES·LEGEND2·`act2Land`), `src/sim/core.ts:373-386`(rollUnique), `src/sim/core.ts:559` 근처(보스 드롭). Test: `src/sim/legends2.test.ts`(새)

**Interfaces — Produces:**
- `UNIQUES[id].act2?: true` (표의 10개 모두)
- `export const act2Land = (land: Land) => depthOf(land, 1) >= 5 * STORY.length + 6` (rules.ts)
- `LEGEND2` (위 수치)

- [ ] **Step 1: 실패하는 테스트**

```ts
test('1막 땅은 1막 전설만, 2막 땅은 2막 전설만(세트 0개여도)', () => {
  for (let s = 1; s <= 200; s++) {
    const a = createWorld(s, ['H']); a.land = 'ruins'; a.cls = 'knight';
    expect(UNIQUES[uniqueOf(rollUnique(a, 0, 0, 4))!].act2).toBeUndefined();
    const b = createWorld(s, ['H']); b.land = 'lake'; b.cls = 'ranger';
    const u = uniqueOf(rollUnique(b, 0, 0, 4))!;
    expect(UNIQUES[u].act2).toBe(true);
    expect(u).not.toBe('powderHammer');
    expect([undefined, 'ranger']).toContain(UNIQUES[u].cls);
  }
});
test('약탈자 우두머리는 기사에게 화약 망치를 따로 굴린다', () => {
  // raider_chief 보스를 죽였을 때 rand가 LEGEND_DROP.boss보다 작으면 가방이나 바닥에 powderHammer
  // (seed를 바꿔 가며 한 번이라도 나오고, 궁수일 땐 한 번도 안 나오는지)
});
```

- [ ] **Step 2: FAIL 확인** — `npm test -- src/sim/legends2.test.ts`
- [ ] **Step 3: 구현** — `rollUnique`의 pool에 `!!UNIQUES[id].act2 === act2Land(w.land)`를 더한다. 세트 목록이 비면 세트 굴림을 건너뛰고 전설로(rand 호출 순서는 1막에서 그대로 — 1막에선 세트가 있으니 같다). 보스 드롭: `t.skin === 'raider_chief' && w.cls === 'knight' && rand(w) < LEGEND_DROP.boss`면 `toBagOrFloor(w, makeUnique(w, 'powderHammer', …))`.
- [ ] **Step 4: PASS 확인**
- [ ] **Step 5: 커밋** `git commit -m "2막 전설 10개 표, 땅에 따라 전설 풀 나누기, 우두머리가 기사에게 화약 망치"`

### Task 2: 우두머리의 화약 망치

**Files:** `src/sim/abilities.ts`(가르기 끝), `src/sim/powder.ts`(blow: 망치 통은 무기 피해), `src/sim/rules.ts`(Keg에 `dmg?: number`). Test: `legends2.test.ts`

- 가르기를 쓰면 `hasUnique(w, 'powderHammer')`일 때 주인공 앞 0.8m에 통 하나: `{ x, z, fx, fz, fuse: POWDER.fuse, lit: true, wall: false, done: false, chest: -1, bump: true, roll: [앞으로 POWDER.roll × fuse 만큼], dmg: roll(w, hero) × LEGEND2.kegMult }` + `igniteKeg`와 같은 'warn' 예고.
- `blow`: `k.dmg`가 있으면 몬스터에게 `maxHp × POWDER.mob` 대신 `k.dmg`(주인공은 bump라 안 다침). 보스 기절(우두머리 들이받기)은 그대로 bump 통 규칙을 따른다.
- 통 걷어차기는 이번에 넣지 않는다(설계서에선 "걷어차면 다시 굴러간다" — 기존 통 누르기와 겹쳐 다음에).

- [ ] **Step 1: 테스트** `'화약 망치: 가르기 → 통이 굴러가 터지고 몬스터만 다친다'` — 기사·망치 장착, 앞 2m에 졸개, 가르기 후 2초 돌림: `w.kegs.length === 1`, 그 통 `done`, 졸개 hp 줄음, 주인공 hp 그대로.
- [ ] **Step 2: FAIL** → **Step 3: 구현** → **Step 4: PASS** → **Step 5: 커밋**

### Task 3: 수집가의 왕관

**Files:** `rules.ts`(World `stashLegends: UniqueId[]`), `world.ts`(기본 `[]`), `core.ts`(`roll` 주인공 배율에 곱), `main.ts`(월드 만들 때와 창고를 닫을 때 `w.stashLegends = 창고 장비들의 uniqueOf`). Test: `legends2.test.ts`

- `export const crownBonus = (w: World) => hasUnique(w, 'collectorCrown') ? Math.min(LEGEND2.crownMax, LEGEND2.crownPer * new Set([...w.stashLegends, ...bag, ...mods의 uniqueOf]).size) / 100 : 0` — 왕관 자신도 센다.
- `roll`의 주인공 배율에 `(1 + crownBonus(w))`.
- [ ] 테스트 `'왕관: 서로 다른 전설 하나마다 +4%, 같은 것 둘은 한 번, 최대 60%'` — 왕관만 → 1.04배, 가방에 duelist 둘 → 1.08배, stashLegends에 20개 → 1.6배(roll 비율로 비교, 같은 시드 월드 둘).
- [ ] FAIL → 구현 → PASS → 커밋

### Task 4: 약탈자의 전리품 자루

**Files:** `rules.ts`(World `sack: number`, Item `sack?: number`), `world.ts`(기본 0), `core.ts`(`hurt`: 주인공 피해 감소·흘림 / 몬스터 죽음: +1 / 금화 줍기: `it.sack`이면 자루로). Test: `legends2.test.ts`

- 자루를 입었을 때만: 적을 잡으면 `sack = min(sackMax, sack + 1)`. 주인공이 받는 피해 × `(1 − sack / 100)`(갑옷 감소 뒤). 맞으면(실제 피해 > 0) `k = ceil(sack × sackSpill)`을 빼서 발밑 1m 안 금화 더미 `{ kind: 'gold', amount: k, sack: k }`로 떨군다. 그 더미를 주우면 금화 대신 `sack += k`(최대 넘지 않게).
- 자루를 벗으면 `sack = 0`.
- [ ] 테스트 `'자루: 잡을수록 피해 감소, 맞으면 흘리고, 주우면 되찾는다'` — sack 20 → 피해 0.8배, 맞은 뒤 sack 13·바닥에 sack 7 더미, 주우면 20.
- [ ] FAIL → 구현 → PASS → 커밋

### Task 5: 사냥꾼의 쌍궁

**Files:** `src/sim/ranger.ts`(틱 함수 하나 `tickTwin`), `rules.ts`(World `twinT: number`), `world.ts`. Test: `legends2.test.ts`

- 궁수·쌍궁 장착·주인공 `state === 'move'`일 때 `twinT -= DT`, 0 이하면 RANGER.range 안 가장 가까운 살아 있는 적에게 `kind: 'shaft'` 화살(`dmg = Math.round(roll(w, hero) × LEGEND2.twinMult)`), `twinT = attackInterval(w, hero)`. 멈춰 있으면 쏘지 않는다(평타가 맡는다).
- [ ] 테스트 `'쌍궁: 걷는 동안만 저절로 쏜다'` — 적 하나를 6m 앞에 두고 옆으로 걷기 명령 1초: shaft 1개 이상, 멈춘 채 1초(평타 대상 없음): 새 shaft 0.
- [ ] FAIL → 구현 → PASS → 커밋

### Task 6: 회오리 깃 활

**Files:** `ranger.ts`(volley가 떨어질 때 `w.gales.push`, 틱에서 끌기), `rules.ts`(World `gales: { x: number; z: number; t: number }[]`), `world.ts`, 렌더 `src/render/props.ts`(rain blast 곁에 도는 회색 고리 — 기존 'rain' blast 그림을 빌려 반지름 galeR로). Test: `legends2.test.ts`

- 화살비(volleys) 한 번 떨어질 때 `hasUnique(w, 'galeBow')`면 그 자리에 회오리 `t = galeT`(같은 자리 겹치면 시간만 갱신). 틱마다 반지름 galeR 안의 몬스터(보스 제외, 죽은 것 제외)를 가운데로 `galePull × DT`만큼 끈다(벽은 통과하지 않게 `walkable` 확인).
- [ ] 테스트 `'회오리: 화살비 자리로 적이 끌려온다'` — 화살비 뒤 1초, 2.5m 떨어진 졸개가 가운데에서 1.5m 안.
- [ ] FAIL → 구현 → PASS → 커밋

### Task 7: 역병 의사의 지팡이

**Files:** `src/sim/necro.ts`(`tickCurses`). Test: `legends2.test.ts`

- 저주(`c.amp > 0`) 안에서 죽은 적, `w.raised`에 없으면: 지팡이 장착 시 `w.raised.push(e.id)` 후 `spawn(w, e.x, e.z, e.kind, { life: LEGEND2.plagueLife, hp: e.maxHp, mult: 1, reach: RANGE, interval: STATS[e.kind].interval }, (a) => a.from === 'curse' && !!a.skin, 99, { from: 'curse', skin: e.skin })` — 같은 그림(skin)으로 일어난다. 저주 5단계(mastered)의 해골 일으키기보다 먼저(둘 다면 지팡이 쪽).
- [ ] 테스트 `'역병 의사: 저주 안에서 죽은 적이 그 모습 그대로 10초 동안 편이 된다'` — allies 1, skin 같음, 10.1초 뒤 0.
- [ ] FAIL → 구현 → PASS → 커밋

### Task 8: 뼈 피리 「행진」, 원정대 깃발창 「깃발 꽂기」 (전설 무기 스킬 둘)

**Files:** `rules.ts`(SkillId에 `'march' | 'banner'`, `GEAR_SKILLS`에 `march: { cls: 'necromancer', tab: 0, u: 'boneFlute' }`, `banner: { cls: 'knight', tab: 1, u: 'bannerSpear' }`), 시전은 기존 `finale`·`graveKing`을 따라(`abilities.ts`/`necro.ts`, 키 연결·스킬 창·재사용 대기 표시는 그 둘과 같은 길). Test: `legends2.test.ts`

- 행진(재사용 marchCd): 살아 있는 해골 병사 모두를 가리킨 방향 한 줄로 세워 `marchSpeed`로 `marchDist`m 달리게 하고, 지나며 닿은 적마다 한 번 `roll(w, hero) × marchMult`. 해골이 없으면 쓰지 않는다(0 반환, 기존 스킬의 "못 씀" 규칙).
- 깃발 꽂기(재사용 bannerCd): 가리킨 자리에 깃발(blast 'slam' 하나), 병사 둘 `spawn(w, …, 'warrior', { life: bannerLife, hp: round(heroMax × bannerHp), mult: bannerMult, reach: RANGE, interval: 1.2 }, (a) => a.from === 'banner', 2, { from: 'banner', escort: undefined })`. 다시 쓰면 앞의 병사는 물러난다(dismiss).
- 병사 그림: 지금은 전사 그림에 소환수 색(ALLY_TINT). 사용자 그림이 오면 skin을 붙인다.
- [ ] 테스트 `'행진: 해골이 줄지어 달려가 지나는 적을 친다'`, `'깃발 꽂기: 병사 둘, 15초 뒤 사라진다, 다시 쓰면 바뀐다'`
- [ ] FAIL → 구현 → PASS → 커밋

### Task 9: 도망자의 장화

**Files:** `core.ts` 또는 `world.ts`(구르기 시작하는 곳), `necro.ts`의 `spawn`을 export해 빌린다. Test: `legends2.test.ts`

- 구르기를 시작할 때 장화 장착이면 그 자리에 허수아비 Ally: `{ from: 'decoy' 표시용 skin 없음, life: decoyT, hp: 9999, mult: 0, reach: 0, interval: 99 }`(치지 않는다). decoyR 안 몬스터의 `target`을 허수아비 id로 바꾼다. 허수아비가 사라지면 그 id를 노리던 몬스터의 `target = null`(다음 think에서 주인공을 다시 고른다 — byId가 null이면 지금도 null로 돌아가는지 확인하고, 아니면 여기서 비운다).
- 그림: 지금은 졸개 판자에 짚빛 tint(render.ts allies 루프에서 `a.mult === 0`이면). 사용자 그림이 오면 교체.
- [ ] 테스트 `'허수아비: 2초 동안 둘레 적이 허수아비를 치고, 사라지면 다시 주인공'`
- [ ] FAIL → 구현 → PASS → 커밋

### Task 10: 우물 사제의 홀

**Files:** `rules.ts`(World `pools: { x: number; z: number; t: number }[]`), `world.ts`, `wizard.ts`(냉기 스킬 맞힘 → 웅덩이, 번개 맞힘 → 감전 퍼짐), 렌더 `src/render/water.ts`(puddles와 같은 메시를 맑은 물빛으로). Test: `legends2.test.ts`

- 냉기 탭(1번 탭) 스킬이 적을 맞히면 그 적 발밑에 웅덩이(poolR, poolT). 겹치면 시간만 갱신.
- 번개 탭(2번 탭) 스킬이 웅덩이 위의 적을 맞히면, 같은 웅덩이 위의 다른 적 모두에게 같은 피해(그 적들에게는 퍼지지 않게 한 번만).
- 웅덩이를 몬스터가 쓰지는 않는다(주인공 느려짐 없음 — 역병 웅덩이와 다르다).
- [ ] 테스트 `'우물 사제: 서리 고리 → 웅덩이, 웅덩이 위 적 하나에 번개 → 웅덩이 위 모두 다친다'`
- [ ] FAIL → 구현 → PASS → 커밋

### Task 11: 마무리

- [ ] `npx tsc --noEmit -p .` 깨끗
- [ ] `npm test` 전체 PASS
- [ ] 화면 확인(playwright, 메모리의 전리품 가독성 방법): 호숫가에서 `?test`로 전설 하나씩 입혀 효과가 보이는지 — 회오리 고리, 웅덩이, 허수아비, 깃발 병사, 굴러가는 통
- [ ] 커밋

## 그림 목록(사용자 GPT용)

`src/assets/legend/` 아래 png, 이름 = id: powderHammer, bannerSpear, wellScepter, plagueStaff, boneFlute, galeBow, twinBows, collectorCrown, runnerBoots, lootSack. 그 밖에 있으면 좋은 것: 허수아비, 원정대 병사(게임 판자용).
