# 검술 탭 개편(내리베기 · 거인의 칼) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 기사 검술 탭의 회오리를 내리베기(`downcut`)로, 처형을 거인의 칼(`greatsword`)로 바꾸고, 옛 세이브를 옮긴다.

**Architecture:**
- 내리베기는 세계 상태 하나(`w.cut`: 모은 시간, 모으지 않으면 −1)로 돈다. 같은 칸 명령이 다시 들어오면 벤다.
- 거인의 칼은 남은 시간(`w.bigT`) 하나다. 평타·가르기·내리베기의 수치 함수가 이 값을 보고 커진다.
- 새 스킬을 옛 스킬 옆에 먼저 만들고(태스크 1·2), 트리를 바꾸면서 옛 것을 지운다(태스크 3). 그래서 각 태스크가 끝날 때마다 타입 검사와 테스트가 통과한다.

**Tech Stack:** TypeScript, vitest, three.js 렌더

**Spec:** `docs/superpowers/specs/2026-11-25-sword-tab-rework-design.md`

## Global Constraints

- 스킬 id: 내리베기 `downcut`, 거인의 칼 `greatsword`. 강령술사에 `giant`가 이미 있으므로 그 이름은 쓰지 않는다.
- 게임 문구는 자연스러운 한국어로 쓴다. 번역투는 쓰지 않는다.
- 내리베기는 모으는 중에 맞아도 끊기지 않는다.
- 빠른 개발 순서: 조각마다 관련 테스트만 돌린다. 전체 테스트(`npx vitest run`)와 `npx tsc --noEmit`은 커밋 직전에 한 번씩 돌린다.
- 커밋 메시지는 한국어로 쓰고, 끝에 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`을 붙인다.

## Review Focus

1. **Q를 꾹 누른다.** 브라우저가 반복 keydown을 보내도 모으기가 이어져야 한다. 반복 입력에 바로 베이면 안 된다. → 태스크 4
2. **모으는 사이 기력이 비었다.** 키를 떼면 그래도 베고 비용을 낸다. 시간이 다 되어 저절로 베는 것도 막히지 않는다(영원히 모으기 상태로 남지 않는다). → 태스크 1 테스트 `모으는 사이 기력이 모자라도 벤다`
3. **모으는 중에 상태가 바뀐다.** 칸에서 빼거나, 스킬을 되돌리거나, 죽으면 모으기가 풀리고 다시 쓸 수 있다. → 태스크 1 테스트 `죽거나 칸에서 빠지면 모으기가 풀린다`
4. **사슬 도끼를 배운 상태에서 거인의 칼을 쓴다.** 사슬 가르기의 마지막 베기도 커진다. → 태스크 2 테스트 `거인의 칼: 가르기 범위·피해가 커진다`
5. **룬이 달린 장비가 있는 옛 세이브.** `whirl+2` 룬이 박힌 장비, 룬 주머니, 칸 배치가 모두 옮겨져 세이브가 읽힌다. → 태스크 3 테스트

---

### Task 1: 내리베기 sim

**Files:**
- Modify: `src/sim/rules.ts` (`SkillId`에 `'downcut'`, `World`에 `cut`·`reeled`, 수치 `DOWNCUT`)
- Modify: `src/sim/core.ts` (`downcutStat`, `reel`)
- Modify: `src/sim/abilities.ts` (`downcut`, `downcutStrike`)
- Modify: `src/sim/world.ts` (`createWorld` 기본값, `CASTS`, 틱, 이동 속도, 평타 막기, 비용 예외)
- Modify: `src/sim/iaido.ts:129-130` (`SLASHES`·`TAKES`에 `'downcut'`)
- Test: `src/sim/downcut.test.ts` (새 파일)

**Interfaces:**
- Produces:
  - `DOWNCUT = { cd: 6, full: 1.5, fullMaster: 1, hold: 1, len0: 2, len1: 6, lenStep: 0.3, width: 1.2, mult0: 1.2, mult1: 4, multStep: 0.3, knock: 2, slow: 0.4 }`
  - `REEL = { stun: 0.5, every: 2 }`
  - `downcutStat(w): { cd: number; full: number; len: number; mult: number; p: number }`
    - `p`: 지금 모은 정도 0~1(`clamp(w.cut / full)`).
    - `len`: `lerp(len0, len1, p) + lenStep * ext`.
    - `mult`: `(lerp(mult0, mult1, p) + multStep * ext) * syn`.
    - `cd`: `DOWNCUT.cd − 0.4 * cdExt`.
    - `full`: 5단계(`mastered`)면 1초, 아니면 1.5초.
  - `reel(w, e)`: 무거운 적(`heavy(e)`)을 휘청이게 한다. `stunT = max(stunT, REEL.stun)`으로 하고, `w.reeled[e.id] = REEL.every` 동안은 다시 휘청이지 않는다.
  - `downcut(w, hero, x?, z?): number`
    - 모으지 않을 때 부르면 모으기를 시작하고(`w.cut = 0`) 0을 돌려준다.
    - 모으는 중에 부르면 `downcutStrike` 후 `cd`를 돌려준다.
  - `downcutStrike(w, hero, x?, z?)`
    - 방향: 조준점 → 가까운 적(`SKILL.aim` 안) → 바라보는 방향 순으로 정한다.
    - 폭 1.2m 직선 안의 벽에 막히지 않은 적을 모두 벤다(`skillHit`).
    - 밀어내기: `lerp(KNOCK.cleave, DOWNCUT.knock, p)`.
    - p가 1이면 맞은 적에게 `reel`을 건다.
    - 시체 폭발, `temper`, `echoCut(w, 'downcut', () => [[x0, z0, x1, z1]], hit)`을 부른다. 그다음 `w.cut = -1`, `w.cleaves++`.
- `w.cut`이 −1이 아니면 모으는 중이다. 틱마다 `w.cut += DT`.
  - `w.cut ≥ full + DOWNCUT.hold`가 되면 그 칸 명령으로 `cast`를 불러 저절로 벤다.
  - 모으는 동안: 이동 속도 ×0.4, 평타를 하지 않는다(`act`에서 회오리 줄처럼 `idle`), 바라보는 방향 유지.
  - 구르기를 시작하거나, 죽거나, `downcut`이 어느 칸에도 없으면 `w.cut = -1`이 된다. 이때 재사용 대기는 돌지 않는다.
- `cast`의 비용 검사: `id === 'downcut' && w.cut >= 0`이면 `canAfford`를 건너뛴다. 비용은 벨 때(cd > 0) 기존 `pay`가 낸다.

- [ ] **Step 1: 실패하는 테스트를 쓴다** — `downcut.test.ts`. 도우미는 `tree.test.ts`의 `make`·`run`·`lost`를 본떠 이 파일에 둔다(`make(map, 'knight', { downcut: r }, 'downcut')`).

```ts
test('누르면 모으기만 하고 재사용 대기는 돌지 않는다, 다시 누르면 벤다', () => {
  const w = make(['Hm.....'], 'knight', { downcut: 1 }, 'downcut');
  step(w, [{ type: 'skill' }]);
  expect(w.cut).toBeGreaterThanOrEqual(0); expect(w.skillCd).toBe(0); expect(lost(w)).toBe(0);
  run(w, 0.5); step(w, [{ type: 'skill' }]);
  expect(w.cut).toBe(-1); expect(w.skillCd).toBeCloseTo(DOWNCUT.cd); expect(lost(w)).toBeGreaterThan(0);
});
test('오래 모을수록 길고 세다: 짧게 모으면 4m 앞 적에 닿지 않는다', () => {
  const tap = make(['H...m'], 'knight', { downcut: 1 }, 'downcut');
  step(tap, [{ type: 'skill' }]); step(tap, [{ type: 'skill' }]);
  const full = make(['H...m'], 'knight', { downcut: 1 }, 'downcut');
  step(full, [{ type: 'skill' }]); run(full, DOWNCUT.full); step(full, [{ type: 'skill' }]);
  expect(lost(tap)).toBe(0); expect(lost(full)).toBeGreaterThan(0);
});
test('다 모이고 hold초가 지나면 저절로 벤다, 5단계는 1초면 다 모인다', () => {
  const w = make(['Hm...'], 'knight', { downcut: 1 }, 'downcut');
  step(w, [{ type: 'skill' }]); run(w, DOWNCUT.full + DOWNCUT.hold + 0.1);
  expect(w.cut).toBe(-1); expect(w.skillCd).toBeGreaterThan(0);
  const m = make(['Hm...'], 'knight', { downcut: 5 }, 'downcut'); m.cut = 1;
  expect(downcutStat(m).p).toBe(1);
});
test('모으는 동안 맞아도 끊기지 않고, 천천히 걷고, 평타를 하지 않는다', () => {
  const w = make(['Hm...'], 'knight', { downcut: 1 }, 'downcut');
  w.entities[1].stunT = 0; // 적이 때린다
  step(w, [{ type: 'skill' }, { type: 'attack', targetId: 1 }]); run(w, 1);
  expect(w.cut).toBeGreaterThan(0.9); expect(w.entities[0].hp).toBeLessThan(w.entities[0].maxHp); expect(lost(w)).toBe(0);
  // 걷기: 같은 시간 동안 모으지 않을 때의 0.4배 남짓
});
test('모으는 사이 기력이 모자라도 벤다', () => {
  const w = make(['Hm...'], 'knight', { downcut: 1 }, 'downcut');
  step(w, [{ type: 'skill' }]); w.res = 0; step(w, [{ type: 'skill' }]);
  expect(w.cut).toBe(-1); expect(lost(w)).toBeGreaterThan(0);
});
test('죽거나 구르거나 칸에서 빠지면 모으기가 풀린다', () => {
  // 세 경우 각각 w.cut === -1, w.skillCd === 0
});
test('다 모은 베기: 무거운 적은 밀리지 않고 휘청이며, 2초 안에는 다시 휘청이지 않는다', () => {
  // 보스(kind 'boss', stunT 0) 앞에서 다 모아 벤다 → stunT ≈ REEL.stun, 위치 그대로; 곧바로 reel(w, boss)을 다시 불러도 stunT가 늘지 않는다
});
test('시체 폭발·벼림·칼의 여운이 붙는다', () => {
  // burst 1: 죽은 적이 터진다 / w.edge = 불 벼림이면 left −1 / echo 2칸이면 벤 직선 그대로 칼선(w.cuts 길이 1)
});
```

- [ ] **Step 2: 실패를 확인한다** — `npx vitest run src/sim/downcut.test.ts` → `DOWNCUT`이 없다는 오류로 실패한다.
- [ ] **Step 3: 위 Interfaces대로 구현한다.** 방향 정하기는 `swingCleave`와 같은 순서다. 직선 판정은 주인공 기준 앞쪽 투영이 `[−r, len + r]`, 옆 거리가 `width/2 + r` 안이면 맞은 것으로 본다.
- [ ] **Step 4: 통과를 확인한다** — `npx vitest run src/sim/downcut.test.ts src/sim/tree.test.ts src/sim/temper.test.ts` → PASS.
- [ ] **Step 5: 커밋한다** — `npx tsc --noEmit` 통과 후 `git commit -m "내리베기 sim: 모았다가 일직선으로, 맞아도 안 끊긴다"`.

### Task 2: 거인의 칼 sim

**Files:**
- Modify: `src/sim/rules.ts` (`SkillId`에 `'greatsword'`, `World.bigT`, `GREATSWORD`)
- Modify: `src/sim/core.ts` (`greatswordStat`, `cleaveStat`·`downcutStat`·`attackInterval`에 `w.bigT > 0` 반영)
- Modify: `src/sim/abilities.ts` (`greatsword`, `cleave`의 밀어내기·휘청, `bigSweep`, `bigFinale`)
- Modify: `src/sim/world.ts` (`CASTS`, `bigT` 틱, 평타 분기)
- Test: `src/sim/greatsword.test.ts` (새 파일)

**Interfaces:**
- Consumes: 태스크 1의 `reel`, `downcutStat`.
- Produces:
  - `GREATSWORD = { cd: 20, cdStep: 1, time: 6, timeStep: 0.5, radius: 1.8, len: 1.5, dmg: 1.5, slow: 1.4, sweep: 2.5, knock: 1.5, finaleR: 3.5, finale: 3 }`
  - `greatswordStat(w): { cd: number; time: number }`
  - `greatsword(w, hero): number`: `w.bigT = time`으로 두고 `cd`를 돌려준다(조준 없음).
  - `w.bigT > 0`인 동안(기사만):
    - `cleaveStat`: radius ×1.8, mult ×1.5.
    - `downcutStat`: len ×1.5, mult ×1.5.
    - `attackInterval`(주인공): ×1.4.
    - 스킬 밀어내기: `KNOCK.cleave` 대신 1.5m. 맞은 무거운 적에게 `reel`.
  - 평타: `swing`의 기사 평타 분기에서 `w.bigT > 0`이면 `damage` 대신 `bigSweep(w, hero)`를 부른다.
    - 바라보는 쪽 반원 2.5m 안의 적 모두에게 `roll × 1.5`.
    - 밀어내기 1.5m, 무거운 적은 `reel`.
    - `temper`, 시체 폭발.
  - `bigFinale(w, hero)`: `bigT`가 0이 되는 틱에 `mastered(w, 'greatsword')`면 부른다. 반경 3.5m 한 바퀴, `roll × 3`, 밀어내기 1.5m.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

```ts
test('거인의 칼: 쓰면 time초 동안 켜지고 cd초 재사용 대기', () => { /* w.bigT ≈ GREATSWORD.time, w.skillCd ≈ GREATSWORD.cd */ });
test('거인의 칼: 평타가 앞쪽 반원의 적을 모두 벤다, 뒤쪽은 안 맞는다', () => {
  // map ['mHm', '.m.']: 오른쪽·아래 적을 공격 → 켜기 전엔 하나만, 켠 뒤엔 앞쪽 둘 다 맞고 뒤쪽은 0
});
test('거인의 칼: 평타 간격이 1.4배', () => { /* attackInterval 비 = GREATSWORD.slow */ });
test('거인의 칼: 가르기 범위·피해가 커진다(사슬 가르기의 베기 포함)', () => {
  // cleaveStat radius·mult 비 = 1.8·1.5; chainAxe 1이어도 cleaveStat를 거치므로 같은 비
});
test('거인의 칼: 내리베기 길이·피해 ×1.5', () => { /* downcutStat 비 */ });
test('거인의 칼: 맞은 보스는 밀리지 않고 휘청인다', () => { /* 가르기로 보스 → stunT > 0, 위치 그대로 */ });
test('거인의 칼 5단계: 끝날 때 한 바퀴 크게 벤다, 4단계는 안 벤다', () => {
  // 주인공 뒤 3m 적: 5단계는 time초 뒤 피해 > 0, 4단계는 0
});
```

- [ ] **Step 2: 실패를 확인한다** — `npx vitest run src/sim/greatsword.test.ts` → FAIL.
- [ ] **Step 3: 위 Interfaces대로 구현한다.**
- [ ] **Step 4: 통과를 확인한다** — `npx vitest run src/sim/greatsword.test.ts src/sim/downcut.test.ts src/sim/knock.test.ts src/sim/combos.test.ts` → PASS.
- [ ] **Step 5: 커밋한다** — `npx tsc --noEmit` 통과 후 `git commit -m "거인의 칼 sim: 몇 초 동안 모든 베기가 넓고 무겁게"`.

### Task 3: 트리 교체 · 회오리/처형 삭제 · 세이브 옮기기 · 문구 · 봇

**Files:**
- Modify: `src/sim/rules.ts:11,23` (`TREES.knight[0] = ['cleave', 'downcut', 'burst', 'greatsword']`; `whirl`·`execute`, `WHIRL`·`EXECUTE`, `spinT`·`spinAcc`, `ECHO.x` 삭제)
- Modify: `src/sim/core.ts:71,73` (`whirlStat`·`executeStat` 삭제)
- Modify: `src/sim/abilities.ts` (`whirl`·`spin`·`execute` 삭제, 시체 폭발 주석)
- Modify: `src/sim/world.ts` (`CASTS`·`spin` 틱·회오리 평타 줄·`castT` 조건의 `spinT`)
- Modify: `src/sim/iaido.ts:129-130` (`whirl`·`execute` 빼기)
- Modify: `src/main.ts:508` (`AIM.execute` 빼기)
- Modify: `src/hud.ts:303-305,316,378` (이름·설명·수치 줄·아이콘)
- Modify: `src/sim/bot.ts:15-22,131-140` (빌드 `whirl` → `downcut`)
- Modify: `src/render/props.ts:573` (회오리 방향 회전 삭제)
- Modify: `src/save.ts` (`decodeSave` 앞에서 이름 옮기기)
- Test: `src/save.test.ts`, 그리고 `whirl`·`execute`를 쓰는 테스트(`tree`, `temper`, `iaido`, `legend`, `runes`)

**Interfaces:**
- Produces:
  - `renameSkills(d: Record<string, unknown>): void` (`save.ts`)
    - `RENAMED = { whirl: 'downcut', execute: 'greatsword' }`
    - 바꿀 곳: `ranks`의 키, `keys`의 값, `runes`의 키(`whirl+2` → `downcut+2`), `mods`·`bag`·`stash` 장비 affix의 `r` 문자열.
  - 문구(hud):
    - downcut
      - 이름: `'내리베기'`
      - 설명: `'누르고 있으면 칼을 뒤로 젖혀 힘을 모으고, 떼거나 한 번 더 누르면 앞으로 일직선으로 내리벤다. 모으는 동안은 천천히 걷고, 맞아도 끊기지 않는다'`
      - 5단계: `'1초면 다 모인다'`
      - 수치 줄: `` `길이 ${m(len0)}~${m(len1)}, ${wd(mult0)}~${wd(mult1)} · 다 모으면 무거운 적이 휘청인다${cd}` ``
    - greatsword
      - 이름: `'거인의 칼'`
      - 설명: `'잠시 칼이 몸집만큼 커진다. 그동안 평타는 앞쪽의 적을 한꺼번에 베고, 가르기·내리베기는 더 넓고 세진다. 대신 휘두르는 속도가 느려진다. 맞은 적은 멀리 밀려나고, 무거운 적은 휘청인다'`
      - 5단계: `'끝날 때 거대한 칼로 한 바퀴 크게 벤다'`
    - burst 설명: `'가르기·회오리·처형'`을 `'가르기·내리베기'`로 바꾼다(평타는 거인의 칼 설명에 둔다).
    - echo 설명: `'가르기·회오리·처형·돌진 베기·대지 강타'`를 `'가르기·내리베기·돌진 베기·대지 강타'`로 바꾼다.
  - 봇 `downcut` 빌드: 슬롯 `['cleave', 'downcut', 'shout', 'throw']`.
    - 앞 직선 4m 안에 적이 둘 이상이거나 보스가 7m 안이면 모으기 시작한다(`dash` 명령).
    - 다 모였거나(`downcutStat(w).p === 1`) 보스가 `windup`이면 다시 `dash`를 보낸다.

- [ ] **Step 1: 실패하는 테스트를 쓴다** — `save.test.ts`

```ts
test('옛 세이브: 회오리·처형 단계와 칸, 룬 주머니, 장비 룬을 내리베기·거인의 칼로 옮긴다', () => {
  const old = JSON.stringify({ ...knightRunWith({ ranks: { cleave: 1, whirl: 3, execute: 1 }, keys: { cleave: 'cleave', dash: 'whirl', shout: 'execute', throw: null }, runes: { 'whirl+2': 1 }, mods: { weapon: [{ kind: 'socket', value: 1 }, { r: 'execute+1' }] /* 실제 affix 꼴은 save.ts:31 참고 */ } }), v: VERSION });
  const r = decodeSave(old)!;
  expect(r.ranks).toEqual({ cleave: 1, downcut: 3, greatsword: 1 });
  expect(r.keys).toEqual({ cleave: 'cleave', dash: 'downcut', shout: 'greatsword', throw: null });
  expect(r.runes).toEqual({ 'downcut+2': 1 });
});
```

- [ ] **Step 2: 실패를 확인한다** — `npx vitest run src/save.test.ts` → FAIL(`null`).
- [ ] **Step 3: 트리 교체, 삭제, `renameSkills`, 문구, 봇을 위 Interfaces대로 바꾼다.** 옛 테스트는 이렇게 고친다.
  - 회오리 테스트(`tree.test.ts`)와 처형 테스트는 지운다. 같은 내용은 태스크 1·2의 새 테스트가 맡는다.
  - `temper.test.ts`의 처형·회오리 줄은 내리베기 줄로 바꾼다(`left('downcut', ['Hm...'], …)` → 5).
  - `iaido.test.ts:112`는 회오리 대신 내리베기로 바꾼다.
  - `tree.test.ts:27-64`는 `whirl` 자리에 `downcut`을 넣는다.
- [ ] **Step 4: 통과를 확인한다** — `npx vitest run` 전체 → PASS. `npx tsc --noEmit` → 오류 없음. `grep -rn "whirl\|execute\|EXECUTE\|spinT" src` → 세이브 옮기기 표 말고는 없음.
- [ ] **Step 5: 커밋한다** — `git commit -m "검술 탭: 회오리 → 내리베기, 처형 → 거인의 칼, 옛 세이브 옮기기"`. 설계 문서와 이 계획도 같이 커밋한다.

### Task 4: 입력 — 누르고 떼기

**Files:**
- Modify: `src/main.ts:653-670` (keydown 반복 무시, keyup으로 베기)

**Interfaces:**
- Consumes: 태스크 1의 `w.cut`.
- keydown:
  - 칸 키(Q W E R)에 `downcut`이 끼워져 있고 `e.repeat`이면 무시한다. 다른 스킬의 꾹 누르기는 그대로 둔다.
- keyup:
  - 그 칸에 `downcut`이 있고 `world.cut >= 0`이면 `commands.push({ type: cmd, ...(aim() ?? {}) })`. 마우스가 있으면 커서 쪽으로 벤다.
- 터치: 버튼 click이 이미 명령을 보내므로, 한 번 탭하면 모으고 다시 탭하면 벤다(코드 변경 없음).
- 스킬 키 옆 칸 이름 표시나 조준 표에는 넣지 않는다(바로 쓰는 스킬).

- [ ] **Step 1: 구현한다.**
- [ ] **Step 2: 화면으로 확인한다** — run 스킬 또는 playwright로 기사를 띄우고 Q에 내리베기를 끼운다(`?test`로 레벨 올리기).
  - Q를 1초 누르고 있다 뗀다 → 한 번만 벤다.
  - Q를 두 번 짧게 누른다 → 짧게 벤다.
- [ ] **Step 3: 커밋한다** — `git commit -m "내리베기: 키를 떼면 벤다, 키 반복은 무시"`.

### Task 5: 렌더 · 소리

**Files:**
- Modify: `src/render/props.ts` (모으기 빛과 점선, 직선 베기 효과, 커진 칼)
- Modify: `src/audio/events.ts` (내리베기·거인의 칼 소리)
- Test: `src/audio/events.test.ts` (소리 이벤트 하나씩)

**Interfaces:**
- Consumes: `w.cut`, `downcutStat(w)`(p·len), `w.bigT`, `w.cleaves`.
- 화면에 보일 것은 스펙의 "화면에 보일 것" 그대로다. 그리는 방식은 만드는 사람이 정한다.
  - 모으기: 칼 빛 세기 = p, 바닥 점선 길이 = len, p가 1이면 칼끝이 번쩍인다.
  - 베기: 바닥에 금빛 직선이 0.4초 동안 남는다. 다 모은 베기는 화면이 흔들린다(기존 흔들림이 있으면 그것을 쓴다).
  - 거인의 칼: 주인공 칼이 커 보이고 빛무리가 생긴다. 휘두르기 자국 반경은 `cleaveStat`를 따른다.
- 소리:
  - 베기: 가르기 소리를 낮고 무겁게.
  - 거인의 칼을 켤 때: 금속이 울리는 소리 한 번.

- [ ] **Step 1: 소리 이벤트 테스트를 쓴다** — `events.test.ts`에 `'내리베기: 가르기보다 낮은 베기 소리'`, `'거인의 칼: 켤 때 한 번'`.
- [ ] **Step 2: 실패를 확인하고 구현한다.**
- [ ] **Step 3: 화면으로 확인한다** — playwright 스크린샷 세 장: 모으는 중(점선), 다 모은 베기 직후, 거인의 칼 켠 상태.
- [ ] **Step 4: 전체 테스트와 `npx tsc --noEmit`을 돌리고 커밋한다** — `git commit -m "내리베기·거인의 칼 그림과 소리"`.
