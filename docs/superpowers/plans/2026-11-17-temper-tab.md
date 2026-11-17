# 기사 5번째 탭 「벼림」 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 기사에 5번째 스킬 탭 「벼림」(불 벼림·서리 벼림·덧벼림·검기 해방)을 더하고, 칼이 강화 색으로 빛나며 휘두를 때마다 충전을 쓰는 손맛을 만든다.

**Architecture:** 규칙은 `src/sim/temper.ts`(새 파일)에 모은다. 칼 상태는 `World.edge` 하나(회오리 `spinT`처럼 주인공 상태를 world에 둔다). 칼로 베는 근접 타격 여덟 곳이 맞힌 적 목록을 `temper(w, hero, hit, use)` 한 함수에 넘기고, 충전 차감·추가 피해·빙결·해방 참격은 거기서 처리한다. 렌더는 sim을 바꾸지 않는다: 무기 층 물들이기는 기존 원색 외형(`looksOf` → `tinted`)에 강화 색을 얹고, 빛 점·불티·참격 칼선은 `src/render/temper.ts`가 상태를 읽어 그린다.

**Tech Stack:** TypeScript, Vitest, three.js, Vite

**Spec:** `docs/superpowers/specs/2026-11-17-temper-tab-design.md`

## Global Constraints

- 주석·화면 문구는 한국어(코드 주석은 기존처럼 짧은 평서문).
- `src/sim/`은 three.js·DOM을 쓰지 않고, 난수는 `rand(w)`만(같은 시드 = 같은 결과).
- 기존 검술·돌격·투척·발도 탭의 수치·동작과 봇 `BASIC`은 바꾸지 않는다. 기존 `npm test` 전부 통과(밸런스 회귀 포함).
- 수치는 `rules.ts`의 상수 `TEMPER` 하나에 모은다(설계서 시작값 그대로).
- 새 주인공 그림·새 소리를 만들지 않는다. 적의 화상·감속 상태를 만들지 않는다.
- 스킬 id: `flameEdge`(불 벼림), `frostEdge`(서리 벼림), `reforge`(덧벼림), `unleash`(검기 해방).
- 검사 명령: `npx vitest run <파일>`(태스크), `npm test` + `npm run build`(태스크 끝).
- 태스크 끝마다 커밋한다(브랜치 `claude/byeolim-design-docs-qmu21j`).

## 정한 것(설계서의 "짓는 사람 몫")

- 상태: `World.edge: { kind: 'flame' | 'frost' | 'both' | null; left: number; t: number }`, 적의 서리 타수 `Entity.frost?: number`.
- 해방 참격: 즉시 판정(투사체 없음). 바라보는 방향 앞 0~3m, 칼선에서 옆으로 0.4m(폭 0.8m) 안의 적, 시선이 트인 적.
- 해방 참격은 "휘두름"마다 한 번: 아래 `use = true`인 호출마다(빈 휘두름 포함 — 가르기·그어두기·회오리 틱·대지 강타 착지는 아무도 못 맞혀도 참격이 나간다. 돌진·일섬·처형·평타는 맞혔을 때만 불리므로 맞혔을 때만).
- 칼 빛: 무기 층 물들이기(`looksOf`가 강화 중이면 `weapon` 색을 강화 색으로) + 손 높이 가산 혼합 빛 점. 깜빡임(충전 1)은 빛 점에만(시트를 다시 그리지 않는다).
- 색: 불 `#ffb070`, 서리 `#a8e0ff`, 해방 `#ffffff`.
- 발도 연결(납도로 충전 쓰기)은 **이번 범위에서 뺀다**(설계서: 넣지 않아도 탭은 완결).
- 데미지 숫자 주황색은 하지 않는다(설계서: "지원되면" — 지금 숫자는 종류를 모른다).

## Review Focus

1. 불 벼림 추가 피해로 적이 죽은 같은 휘두름에서 → 죽은 적에게 다시 피해·빙결을 주지 않는다, 처치 보상은 한 번(Task 2 테스트 "죽은 적에겐 효과 없음").
2. 해방 중 해방이 끝나는 틱에 휘두름 → 끝난 뒤엔 참격이 나가지 않고 칼이 빈다(Task 4 테스트).
3. 스킬 포인트 되돌리기(respec)로 벼림을 잃음 → 칼 강화도 꺼진다(Task 2 테스트).
4. 덧벼림 폭발로 죽은 적 → 폭발이 다시 충전을 쓰거나 연쇄하지 않는다(Task 3 테스트 "폭발은 충전을 쓰지 않는다").
5. 해방 참격이 벽 너머 적을 맞힘 → `clearLine`으로 막힌다(Task 4 테스트).

---

### Task 1: 벼림 탭 등록 + 수치

**Files:**
- Modify: `src/sim/rules.ts` (`SkillId`, `TREES.knight[4]`, `TEMPER` 상수, `World.edge`, `Entity.frost`, `Affix.tab` 주석 0~4, 직업 주석 "탭 3~5개")
- Modify: `src/sim/core.ts` (단계 수치 함수 넷)
- Modify: `src/sim/world.ts` (`createWorld` 초기값 `edge: { kind: null, left: 0, t: 0 }`, 수치 함수 다시 내보내기)
- Modify: `src/hud.ts` (`SKILL_TEXT`, `ICON`에 네 스킬, import)
- Modify: `src/sim/iaido.test.ts:17` (기사 탭 이름 목록에 '벼림')
- Create: `src/sim/temper.test.ts`

**Interfaces:**
- Produces:
  - `SkillId`에 `'flameEdge' | 'frostEdge' | 'reforge' | 'unleash'`
  - `TREES.knight[4] = { name: '벼림', skills: ['flameEdge', 'frostEdge', 'reforge', 'unleash'] }`
  - `TEMPER = { charges: 6, flame: 0.4, flameCd: 4, burstR: 1.5, burst: 0.6, hits: 3, freeze: 1, frostCd: 6, reforgeR: 2.5, reforge: 0.3, reforgeFreeze: 0.8, time: 6, cd: 15, len: 3, width: 0.8, slash: 0.5 }`
  - 비용은 기존 기력 단계값(16·24·36) 그대로 — `COST_OVERRIDE` 손대지 않음
  - 단계 수치(core.ts, 이름이 `Stat`으로 끝나 `legend.test`의 7단계 안전 검사에 잡힌다):
    - `flameEdgeStat(w) => { cd: TEMPER.flameCd, mult: (TEMPER.flame + 0.1·ext) · syn(w,'flameEdge'), charges: TEMPER.charges + ext(w,'reforge') }`
    - `frostEdgeStat(w) => { cd: TEMPER.frostCd, hits: mastered ? 2 : TEMPER.hits, freeze: TEMPER.freeze + 0.15·ext, charges: TEMPER.charges + ext(w,'reforge') }`
    - `reforgeStat(w) => { radius: TEMPER.reforgeR, mult: (TEMPER.reforge + 0.05·ext) · syn(w,'reforge') }`
    - `unleashStat(w) => { cd: TEMPER.cd − 0.5·ext, time: TEMPER.time + 0.5·ext, mult: TEMPER.slash · syn(w,'unleash') }`

- [ ] **Step 1: 실패하는 테스트 작성** (`src/sim/temper.test.ts`)

```ts
test('기사는 탭 다섯(다섯째 = 벼림), 다른 직업은 셋', () => {
  expect(TREES.knight.map((t) => t.name)).toEqual(['검술', '돌격', '투척', '발도', '벼림']);
  expect(TREES.knight[4].skills).toEqual(['flameEdge', 'frostEdge', 'reforge', 'unleash']);
  expect(SKILLS.reforge).toEqual({ cls: 'knight', tab: 4, tier: 2 });
  expect(isPassive('reforge')).toBe(true);
  expect([skillCost('knight', 'flameEdge'), skillCost('knight', 'frostEdge'), skillCost('knight', 'unleash')]).toEqual([16, 24, 36]);
});
test('벼림 수치: 1단계 시작값, 단계마다', () => {
  const w = createWorld(1, ['H....']); useClass(w, 'knight');
  Object.assign(w.ranks, { flameEdge: 1, frostEdge: 1, unleash: 1 });
  expect(flameEdgeStat(w)).toMatchObject({ cd: 4, charges: 6 }); expect(flameEdgeStat(w).mult).toBeCloseTo(0.4 * syn(w, 'flameEdge'));
  expect(frostEdgeStat(w)).toMatchObject({ cd: 6, hits: 3, freeze: 1 });
  expect(unleashStat(w)).toMatchObject({ cd: 15, time: 6 });
  Object.assign(w.ranks, { frostEdge: 5, reforge: 3 });
  expect(frostEdgeStat(w)).toMatchObject({ hits: 2, charges: 8 }); expect(frostEdgeStat(w).freeze).toBeCloseTo(1.6);
});
test('저장: 탭 옵션 4는 통과, 5는 거부', () => { /* iaido.test.ts의 run(tab) 그대로, run(4) → not null, run(5) → null */ });
test('새 판의 칼은 비어 있다(층 이동·불러오기는 새 world)', () => {
  expect(createWorld(1, ['H....']).edge).toEqual({ kind: null, left: 0, t: 0 });
});
```

- [ ] **Step 2: 실행해 실패 확인** — `npx vitest run src/sim/temper.test.ts` → FAIL(`flameEdge` 없음)
- [ ] **Step 3: 구현** — 위 Interfaces 그대로. `save.ts`는 이미 `TREES[cls].length`로 검사하므로 고치지 않는다. `hud.ts`의 `ICON`: `flameEdge: 0, frostEdge: 0, reforge: 0, unleash: 1`. `SKILL_TEXT` 네 줄(설계서 2절 문구, `stat`은 위 수치, `cap`: 불 벼림 = "충전을 다 쓰는 마지막 휘두름이 맞힌 적 자리에서 작은 화염 폭발", 서리 벼림 = "두 번만 맞혀도 언다").
- [ ] **Step 4: 통과 확인** — `npx vitest run src/sim/temper.test.ts src/sim/iaido.test.ts src/sim/legend.test.ts src/sim/tree.test.ts` → PASS. `tree.test.ts`의 "모든 액티브 스킬이 칸에서 나간다"는 Task 2·4에서 시전이 생기기 전까지 실패할 수 있다 — 실패하면 그 테스트만 확인하고 Task 4 끝에서 통과시킨다.
- [ ] **Step 5: 스킬 창 탭 머리 다섯 개가 360px 폭에서 한 줄인지** — `npm run dev`를 띄워 Playwright로 360×740에서 스킬 창(T)을 열고 탭 머리의 `offsetTop`이 모두 같은지 확인. 넘치면 탭 머리 CSS의 좌우 여백을 줄인다.
- [ ] **Step 6: 커밋** — `feat: 기사 5번째 탭 벼림 등록과 수치`

---

### Task 2: 칼 강화 — 불 벼림·서리 벼림과 충전

**Files:**
- Create: `src/sim/temper.ts`
- Modify: `src/sim/world.ts` (`CASTS`에 `flameEdge`, `frostEdge`; `swing`의 평타; `respec`이 `edge`도 끈다)
- Modify: `src/sim/abilities.ts` (`cleave`, `spin`, `execute`, `dashStep`, `leapStep`)
- Modify: `src/sim/iaido.ts` (`markSlash`, `flashStep`)
- Test: `src/sim/temper.test.ts`

**Interfaces:**
- Consumes: Task 1의 `TEMPER`, `flameEdgeStat`, `frostEdgeStat`, `World.edge`, `Entity.frost`
- Produces (`src/sim/temper.ts`):
  - `temper(w: World, hero: Entity, hit: Entity[], use = true): void` — 칼이 비었으면 아무것도 안 함. `hit` 중 살아 있는 적마다 효과(불: `skillHit(w, e, round(roll(w, hero) × flameEdgeStat.mult))`, 서리: `e.frost++`, `≥ frostEdgeStat.hits`면 `stun(e, freeze)` + `blasts` `'ice'` + `e.frost = 0`; `both`는 둘 다). `use`이고 `kind !== 'both'`이고 `hit.length > 0`이면 `left--`, 0이 되면 (불 5단계면 맞힌 적 자리마다 `flameBurst`) 칼을 비운다(`clearEdge`). 해방 참격은 Task 4에서 여기에 붙는다.
  - `clearEdge(w: World): void` — `edge = { kind: null, left: 0, t: 0 }`, 모든 적 `frost = 0`
  - `flameBurst(w: World, x: number, z: number): void` — 반경 `TEMPER.burstR` 안 살아 있는 적에게 `skillHit(round(roll × TEMPER.burst))`, `blasts` `{ kind: 'fire', r: TEMPER.burstR }`. 충전을 쓰지 않는다
  - `flameEdge(w: World, hero: Entity): number`, `frostEdge(w: World, hero: Entity): number` — 해방 중(`kind === 'both'`)이면 0(안 나감). 아니면 `clearEdge` 뒤 `{ kind, left: stat.charges, t: 0 }`, 재사용 대기를 돌려준다. 덧벼림은 Task 3에서 이 앞에 붙는다.
  - `w.edgeSwings: number` — 충전을 쓴 휘두름 수(렌더 불티용), `temper`가 `use && hit.length`일 때 +1. `rules.ts` `World`에 필드, `createWorld` 0.
- 타격 연결(맞힌 적 목록 = 피해를 준 적, 죽었어도 넣는다):
  - `cleave` 끝, `markSlash` 끝, `spin` 틱(타격하는 틱만), `leapStep` 착지 끝: `temper(w, hero, hit)`
  - `execute`: `temper(w, hero, [t])`
  - 평타(`swing`의 `damage(w, e, t)` 줄): `e.kind === 'hero'`일 때만 `temper(w, e, [t])` (기사만 이 줄에 온다)
  - `dashStep`: 이번 틱에 새로 맞은 적 목록으로 `temper(w, hero, hitNow, wasEmpty)` — `wasEmpty` = 이 틱 전에 `w.dashHit`이 비어 있었음(돌진 하나 = 휘두름 하나)
  - `flashStep`: 꿰뚫을 때마다 `temper(w, hero, [t])`
  - 쓰지 않는 것: 도끼 셋, 불길, 시체 폭발(`burst`), 검흔 터짐(`pop`·`sheatheBurst`), `flameBurst`, 덧벼림 폭발

테스트 도우미(파일 위쪽에 한 번, `iaido.test.ts`의 `arena`·`runFor`와 같은 꼴):

```ts
const arena = (map: string[], ranks: Partial<Record<SkillId, number>>, keys: Partial<World['keys']> = {}) => {
  const w = createWorld(1, map); useClass(w, 'knight'); Object.assign(w.ranks, ranks);
  Object.assign(w.keys, { cleave: 'cleave', dash: 'flameEdge', shout: 'frostEdge', throw: null }, keys);
  for (const e of w.entities.slice(1)) Object.assign(e, { hp: 1e5, maxHp: 1e5, stunT: 1e9 });
  return w;
};
```

(`stunT: 1e9`는 적이 움직이지 않게. 서리 빙결 시험은 `stunT: 0`으로 따로 두고 `stunT`가 늘었는지 본다.)

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
test('불 벼림: 충전 6, 휘두름마다 1, 여러 적을 맞혀도 1, 못 맞히면 그대로', () => {
  const w = arena(['Hmm..', '.m...'], { flameEdge: 1 }); runFor(w, 0.1, [{ type: 'dash' }]);
  expect(w.edge).toMatchObject({ kind: 'flame', left: 6 });
  runFor(w, 1, [{ type: 'skill', x: 2, z: 0.5 }]); expect(w.edge.left).toBe(5); // 가르기가 여럿을 맞혀도 1
  const far = arena(['H....m'], { flameEdge: 1 }); runFor(far, 0.1, [{ type: 'dash' }]); runFor(far, 1, [{ type: 'skill', x: 3, z: 0.5 }]);
  expect(far.edge.left).toBe(6);
});
test('불 벼림 추가 피해 = 평타 굴림 × 배율(받아치기 등 연계는 skillHit 그대로)', () => {
  // 같은 시드 두 판: 칼이 빈 판과 불 칼 판의 가르기 피해 차 = 불꽃 피해. rand 순서가 같도록 불꽃 굴림은 가르기 굴림 뒤
  // 기대: 차이가 roll 범위 × flameEdgeStat.mult 안(무기 1단계 굴림의 최소·최대로 경계)
});
test('충전이 0이면 꺼지고, 5단계는 마지막 휘두름 자리에서 화염 폭발', () => {
  const w = arena(['Hm...'], { flameEdge: 1 }); w.edge = { kind: 'flame', left: 1, t: 0 };
  temper(w, w.entities[0], [w.entities[1]]); expect(w.edge.kind).toBeNull();
  const m = arena(['Hm...'], { flameEdge: 5 }); m.edge = { kind: 'flame', left: 1, t: 0 };
  temper(m, m.entities[0], [m.entities[1]]); expect(m.blasts.some((b) => b.kind === 'fire' && b.r === 1.5)).toBe(true);
});
test('서리 벼림: 같은 적 3타에 빙결(5단계 2타), 강화가 바뀌면 센 수가 지워진다', () => {
  const w = arena(['Hm...'], { frostEdge: 1 }); const e = w.entities[1]; e.stunT = 0;
  w.edge = { kind: 'frost', left: 6, t: 0 };
  temper(w, w.entities[0], [e]); temper(w, w.entities[0], [e]); expect(e.stunT).toBe(0);
  temper(w, w.entities[0], [e]); expect(e.stunT).toBeCloseTo(1); expect(e.frost).toBe(0);
  e.frost = 2; clearEdge(w); expect(e.frost).toBe(0);
  const m = arena(['Hm...'], { frostEdge: 5 }); m.entities[1].stunT = 0; m.edge = { kind: 'frost', left: 6, t: 0 };
  temper(m, m.entities[0], [m.entities[1]]); temper(m, m.entities[0], [m.entities[1]]); expect(m.entities[1].stunT).toBeGreaterThan(0);
});
test('죽은 적엔 효과 없음', () => {
  const w = arena(['Hm...'], { flameEdge: 1 }); const e = w.entities[1]; Object.assign(e, { hp: 0, state: 'dead' });
  w.edge = { kind: 'flame', left: 6, t: 0 }; const xp = w.xp;
  temper(w, w.entities[0], [e]); expect(e.hp).toBe(0); expect(w.xp).toBe(xp); expect(w.edge.left).toBe(5);
});
test('충전을 쓰는 타격과 쓰지 않는 타격', () => {
  // 쓰는 것: 평타(attack 명령), 가르기, 회오리(틱마다), 처형, 돌진 베기(돌진 하나에 1), 대지 강타 착지, 그어두기, 일섬(꿰뚫을 때마다)
  // 쓰지 않는 것: 도끼 던지기·튕기는 도끼·도끼 폭풍, 불길, 시체 폭발, 검흔 터짐(납도)
  // 각각 arena에서 그 스킬을 칸에 끼우고 w.edge = { kind: 'flame', left: 6, t: 0 }로 시작해 한 번 쓴 뒤 left를 본다
  // 회오리 2초(틱 8번, 적이 늘 붙어 있음) → left = 0 이고 꺼짐
});
test('불러오기 대신: respec하면 칼이 빈다', () => {
  const w = arena(['Hm...'], { flameEdge: 1 }); w.gold = 1e4; w.edge = { kind: 'flame', left: 3, t: 0 };
  respec(w); expect(w.edge.kind).toBeNull();
});
```

(주석으로 적은 두 테스트는 그 줄 그대로를 단언으로 쓴다: 평타 피해 비교는 `w.entities[1].hp` 감소량, 타격 목록은 스킬마다 `expect(w.edge.left, id).toBe(5 또는 6)`.)

- [ ] **Step 2: 실행해 실패 확인** — `npx vitest run src/sim/temper.test.ts` → FAIL(`temper` 없음)
- [ ] **Step 3: 구현** — 위 Interfaces 그대로. `stun`은 `./wizard`에서 가져온다(`abilities.ts`와 같은 길). `cleave`·`spin`·`leapStep`은 이미 도는 루프에서 피해를 준 적을 `hit` 배열에 모은다(`killed`와 같은 방식).
- [ ] **Step 4: 통과 확인** — `npx vitest run src/sim/temper.test.ts src/sim/iaido.test.ts src/sim/skills.test.ts src/sim/combos.test.ts` → PASS
- [ ] **Step 5: 전체 확인** — `npm test` + `npm run build` → 모두 통과(칼이 빈 판은 난수열이 그대로라 밸런스 테스트가 바뀌지 않아야 한다)
- [ ] **Step 6: 커밋** — `feat: 벼림 — 불·서리 칼 강화와 휘두름마다 쓰는 충전`

---

### Task 3: 덧벼림(패시브)

**Files:**
- Modify: `src/sim/temper.ts`
- Test: `src/sim/temper.test.ts`

**Interfaces:**
- Consumes: Task 2의 `clearEdge`, `flameEdge`, `frostEdge`; Task 1의 `reforgeStat`
- Produces: `reforge(w: World, hero: Entity): void` — `rank(w,'reforge')`가 0이거나 칼이 `flame`/`frost`가 아니거나 `left === 0`이면 아무것도 안 함. 아니면 주인공 둘레 `reforgeStat.radius` 안 살아 있는 적마다 `skillHit(round(left × roll(w, hero) × reforgeStat.mult))`; 서리면 살아남은 적에 `stun(e, TEMPER.reforgeFreeze)`. `blasts`에 `{ kind: flame ? 'fire' : 'ice', r: reforgeStat.radius }` 한 번. 충전을 쓰지 않는다(`temper`를 부르지 않는다). `flameEdge`·`frostEdge`(그리고 Task 4의 `unleash`)가 `clearEdge` 앞에서 부른다.

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
test('덧벼림: 남은 충전이 있으면 다른 벼림을 쓸 때 터진다(남은 충전 × 굴림 × 배율)', () => {
  const w = arena(['.m...', 'mH.m.'], { flameEdge: 1, frostEdge: 1, reforge: 1 }); // 2.5m 안 둘, 바깥 하나
  w.edge = { kind: 'flame', left: 4, t: 0 };
  runFor(w, 0.1, [{ type: 'shout' }]); // 서리 벼림
  expect(w.edge).toMatchObject({ kind: 'frost', left: 6 });
  expect(w.blasts.some((b) => b.kind === 'fire' && b.r === 2.5)).toBe(true);
  // 2.5m 안 적의 피해는 4 × 굴림 × 0.3 범위 안, 바깥 적은 1e5 그대로
});
test('덧벼림 서리: 피해와 0.8초 빙결', () => { /* 위와 같고 시작 칼 'frost', 둘레 적 stunT 0 → 0.8 */ });
test('덧벼림을 배우기 전에는 그냥 덮어쓴다', () => { /* reforge 없이 같은 상황 → blasts에 r 2.5 없음, 적 hp 그대로 */ });
test('덧벼림 단계마다 충전 +1, 폭발 배율 +0.05', () => {
  const w = arena(['H....'], { flameEdge: 1, reforge: 3 });
  expect(flameEdgeStat(w).charges).toBe(8); expect(reforgeStat(w).mult).toBeCloseTo((0.3 + 0.1) * syn(w, 'reforge'));
});
test('폭발은 충전을 쓰지 않는다', () => { /* 폭발로 적이 죽어도 새 칼의 left === charges */ });
```

- [ ] **Step 2: 실행해 실패 확인** — `npx vitest run src/sim/temper.test.ts -t 덧벼림` → FAIL
- [ ] **Step 3: 구현** — 위 Interfaces 그대로.
- [ ] **Step 4: 통과 확인** — `npx vitest run src/sim/temper.test.ts` → PASS
- [ ] **Step 5: 커밋** — `feat: 벼림 — 덧벼림(남은 충전을 터뜨리기)`

---

### Task 4: 검기 해방(궁극)

**Files:**
- Modify: `src/sim/temper.ts`
- Modify: `src/sim/world.ts` (`CASTS.unleash`, `step`에서 `tickEdge`)
- Modify: `src/sim/rules.ts` (`World.edgeSlashes: number` — 참격 수(렌더용), `createWorld` 0)
- Test: `src/sim/temper.test.ts`

**Interfaces:**
- Consumes: Task 2·3의 `temper`, `reforge`, `clearEdge`; Task 1의 `unleashStat`
- Produces:
  - `unleash(w: World, hero: Entity): number` — 해방 중이면 0. 아니면 `reforge` → `clearEdge` → `edge = { kind: 'both', left: 0, t: unleashStat.time }`, `unleashStat.cd`를 돌려준다
  - `tickEdge(w: World): void` — `kind === 'both'`면 `t -= DT`, `t ≤ 0`이면 `clearEdge`. `step`에서 `tickMarks` 옆(명령 처리 **전**)에 부른다 → 끝나는 틱의 휘두름엔 참격이 없다
  - `edgeSlash(w: World, hero: Entity): void` — 바라보는 방향 앞 0~`TEMPER.len`, 칼선과의 거리 ≤ `TEMPER.width / 2`, `clearLine`이 트인 살아 있는 적에게 `skillHit(round(roll × unleashStat.mult))`, 맞은 적에게 `temper(w, hero, slashHit, false)`(효과만, 참격 다시 안 냄). `w.edgeSlashes++`
  - `temper`: `use`이고 `kind === 'both'`면 (맞힌 적이 없어도) 끝에 `edgeSlash`. 해방 중 `left`는 줄지 않는다
  - `flameEdge`·`frostEdge`는 해방 중 0(Task 2에서 이미). HUD 칸 어둡게는 Task 5

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
test('해방: 6초 동안 불과 서리가 함께, 충전이 줄지 않고, 끝나면 칼이 빈다', () => {
  const w = arena(['Hm...'], { flameEdge: 1, frostEdge: 1, reforge: 1, unleash: 1 }, { throw: 'unleash' });
  runFor(w, 0.1, [{ type: 'throw' }]); expect(w.edge.kind).toBe('both');
  const e = w.entities[1]; e.stunT = 0;
  for (let i = 0; i < 3; i++) temper(w, w.entities[0], [e]);
  expect(e.stunT).toBeGreaterThan(0); expect(e.hp).toBeLessThan(1e5); expect(w.edge.kind).toBe('both');
  runFor(w, 6); expect(w.edge.kind).toBeNull();
});
test('해방 참격: 앞쪽 3m·폭 0.8m 안의 적만, 벽 너머는 안 맞는다', () => {
  // 'H..m.m' 바라보는 쪽 +x: 3m 안 적(x=3.5)은 맞고 5.5는 안 맞음. 'H.#m' 벽 너머는 안 맞음. 옆으로 1m 벗어난 적도 안 맞음
  // w.edge = { kind: 'both', left: 0, t: 6 }; hero.facing = Math.PI / 2; temper(w, hero, []) → edgeSlashes 1
});
test('해방 중엔 불·서리 벼림이 나가지 않는다(비용·대기 없음)', () => {
  const w = arena(['H....'], { flameEdge: 1, unleash: 1 }); w.edge = { kind: 'both', left: 0, t: 6 }; w.res = 100;
  step(w, [{ type: 'dash' }]); expect(w.dashCd).toBe(0); expect(w.res).toBeCloseTo(100, 0);
});
test('끝나는 틱의 휘두름엔 참격이 없다', () => {
  const w = arena(['H..m.'], { unleash: 1 }); w.edge = { kind: 'both', left: 0, t: DT / 2 };
  step(w, []); expect(w.edge.kind).toBeNull(); temper(w, w.entities[0], []); expect(w.edgeSlashes).toBe(0);
});
```

- [ ] **Step 2: 실행해 실패 확인** — `npx vitest run src/sim/temper.test.ts -t 해방` → FAIL
- [ ] **Step 3: 구현** — 위 Interfaces 그대로.
- [ ] **Step 4: 통과 확인** — `npx vitest run src/sim/temper.test.ts src/sim/tree.test.ts` → PASS(`tree.test`의 "모든 액티브 스킬이 칸에서 나가고 재사용 대기" 포함 — 세 액티브 모두 빈 칼에서 나간다)
- [ ] **Step 5: 전체 확인** — `npm test` + `npm run build`
- [ ] **Step 6: 커밋** — `feat: 벼림 — 검기 해방(불과 서리를 함께, 앞으로 나는 참격)`

---

### Task 5: 화면 — 칼 빛·충전 표시·참격·소리

**Files:**
- Create: `src/render/edge.ts` (순수 함수, three·DOM 없음)
- Create: `src/render/edge.test.ts`
- Create: `src/render/temper.ts` (빛 점·불티·참격 칼선)
- Modify: `src/render/sprites.ts` (`looksOf`가 강화 색을 무기에)
- Modify: `src/render/render.ts` (매 프레임 `setHeroGear(..., looksOf(world))`, 횃불 색 섞기, `temperFx` 부르기, 그룹 추가, 층 바뀔 때 초기화)
- Modify: `src/hud.ts` (칸에 남은 충전 수, 해방 중 벼림 칸 어둡게)
- Modify: `index.html` (칸 버튼 안 충전 글자 `<b>` 자리와 CSS)
- Modify: `src/audio/events.ts` (참격 = `'cleave'` 소리)

**Interfaces:**
- Consumes: `World.edge`, `World.edgeSwings`, `World.edgeSlashes`, `blasts`의 `'fire'`·`'ice'`(r 포함 — props.ts가 이미 그림)
- Produces (`src/render/edge.ts`):
  - `EDGE_COLOR: Record<'flame' | 'frost' | 'both', string> = { flame: '#ffb070', frost: '#a8e0ff', both: '#ffffff' }`
  - `edgeColor(w: Pick<World, 'edge'>): string | null`
  - `edgeBlink(w: Pick<World, 'edge'>, time: number): boolean` — `left === 1`이고 `kind !== 'both'`이면 초당 6번 깜빡(`Math.floor(time * 12) % 2 === 1`이면 꺼짐 = true), 아니면 false
  - `edgeLeft(w: Pick<World, 'edge' | 'keys'>, id: SkillId): number | null` — 칸 스킬이 `flameEdge`이고 칼이 `flame`(서리도 같게)이면 `left`, 아니면 null
  - `mixColor(a: number, b: number, k: number): number` — 횃불 색 섞기(0x 정수 RGB, k = 0.3)
- `looksOf(w)`: `w.edge?.kind`가 있으면 `out.weapon = EDGE_COLOR[kind]`(전설 원색보다 우선). 시트는 `setHeroGear`가 키로 중복을 거르고 다 그린 뒤에야 바꾸므로 깜빡이지 않는다.

- [ ] **Step 1: 실패하는 테스트 작성** (`src/render/edge.test.ts`)

```ts
test('강화 색: 불 주황·서리 하늘·해방 흰색, 빈 칼은 null', () => {
  expect(edgeColor({ edge: { kind: 'flame', left: 3, t: 0 } })).toBe('#ffb070');
  expect(edgeColor({ edge: { kind: 'both', left: 0, t: 2 } })).toBe('#ffffff');
  expect(edgeColor({ edge: { kind: null, left: 0, t: 0 } })).toBeNull();
});
test('깜빡임: 충전 1일 때만, 해방은 깜빡이지 않는다', () => {
  const one = { edge: { kind: 'flame' as const, left: 1, t: 0 } };
  expect([0, 1 / 12, 2 / 12].map((t) => edgeBlink(one, t + 0.01))).toEqual([false, true, false]);
  expect(edgeBlink({ edge: { kind: 'flame', left: 2, t: 0 } }, 1 / 12 + 0.01)).toBe(false);
});
test('칸 충전 수: 끼운 벼림과 칼이 같을 때만', () => { /* flameEdge 칸 + flame 칼 → left, frostEdge 칸 + flame 칼 → null */ });
test('looksOf: 강화 중이면 무기 색이 강화 색', () => { /* sprites.test.ts 옆에: looksOf({ mods: 빈, edge: flame }).weapon === '#ffb070' */ });
test('횃불 색 섞기 30%', () => { expect(mixColor(0x000000, 0xffffff, 0.3)).toBe(0x4d4d4d); });
```

- [ ] **Step 2: 실행해 실패 확인** — `npx vitest run src/render/edge.test.ts` → FAIL
- [ ] **Step 3: 순수 함수·`looksOf` 구현** → `npx vitest run src/render/edge.test.ts src/render/sprites.test.ts` PASS
- [ ] **Step 4: 그림 구현** (`src/render/temper.ts`, `render.ts`에서 `iaidoGroup`처럼 붙인다)
  - 빛 점: 가산 혼합 `THREE.Sprite` 하나, 주인공 판자 위치 + 높이 0.7m, 크기 0.5m, 색 `edgeColor`, `edgeBlink`면 투명도 0.15·아니면 0.9, 빈 칼이면 숨김.
  - 불티: `edgeSwings`가 늘면 칼끝 높이(0.9m)에서 작은 가산 사각형 6개가 0.4초 동안 떨어진다(불 주황 / 서리 하늘 / 해방 흰색).
  - 참격: `edgeSlashes`가 늘면 바라보는 방향으로 3m, 폭 0.12m 흰 칼선 0.15초(`iaido.ts`의 `BLADE` 모양을 가로로 늘인 것과 같은 방식).
  - 횃불: `torch.color`를 `mixColor(mood.torch, edge색, 0.3)`로(빈 칼이면 `mood.torch`).
  - 무기 물들이기: 매 프레임 `void setHeroGear(world.gear, world.cls, looksOf(world))`(키가 같으면 아무것도 안 함). `hud.ts:845`도 같은 `looksOf`라 서로 덮어쓰지 않는다.
- [ ] **Step 5: HUD** — 칸 버튼 안 `<b class="charges">`에 `edgeLeft` 값(null이면 비움). 해방 중이면 `flameEdge`·`frostEdge` 칸에 `disabled` 모양 클래스(기존 기력 부족과 같은 클래스가 있으면 그것). 툴팁 문구는 `SKILL_TEXT`가 이미 맡는다.
- [ ] **Step 6: 소리** — `events.ts`: 스냅샷에 `edgeSlashes`, 늘면 `at('cleave')`. 덧벼림·5단계 폭발은 기존 `BLAST_SOUND`의 `fire`·`ice`가 맡는지 확인(없으면 `ice: 'shout'`을 더한다). `src/audio/events.test.ts`에 참격 한 줄.
- [ ] **Step 7: 눈으로 확인** — `npm run dev` + Playwright(1280×720, 테스터 버튼으로 레벨을 올려 벼림 네 개를 배우고 초원 낮·미궁 밤에서) 스크린샷: 불 칼·서리 칼·해방 중 칼 빛, 칸 충전 수, 참격. 칼을 켜고 끌 때 주인공 그림이 사라지는 프레임이 없는지 0.05초 간격 스크린샷 10장으로 확인.
- [ ] **Step 8: 전체 확인 + 커밋** — `npm test` + `npm run build`, `feat: 벼림 화면 — 칼 빛·충전 표시·해방 참격`

---

### Task 6: 봇 밸런스 측정

**Files:**
- Modify: `src/sim/bot.ts` (`Build`에 `'whirl' | 'temper'`)
- Modify: `docs/superpowers/specs/2026-11-17-temper-tab-design.md` (끝에 "구현" 절)
- Modify: `README.md` (기사 스킬 소개에 벼림 한 줄 — 발도 커밋이 README를 고친 자리와 같은 곳)

**Interfaces:**
- Consumes: 지금까지의 모든 것
- Produces: `playthrough(seed, true, true, 'knight', 'dungeon', 'whirl' | 'temper')`
  - `whirl` 빌드 칸: `['cleave', 'whirl', 'shout', 'throw']`, 배우는 순서 `LEARN`과 같은 방식
  - `temper` 빌드 칸: `['cleave', 'whirl', 'shout', 'flameEdge']` — whirl 빌드에 불 벼림 1점만 얹음(배우는 목록에 `flameEdge`를 넣되 1단계에서 멈춘다)
  - 판단: 둘 다 기본 기사 판단 + 적이 2m 안 둘 이상이면 회오리(`dash` 칸). `temper`는 회오리 직전에 칼이 비었으면 불 벼림(`throw` 칸)

- [ ] **Step 1: 측정** — 시드 1~10으로 `whirl`·`temper` 각각 10판(`npx vitest`가 아닌 짧은 node 스크립트를 스크래치 폴더에 두고 `npx tsx`나 vitest `test.skip` 없이 일회성 테스트 파일로 실행 후 지운다). 클리어·사망 수를 센다.
- [ ] **Step 2: 판정** — `temper`가 `whirl`보다 클리어 3판 이상 많으면(압도적) `TEMPER.flame`을 0.1씩 내려 다시 잰다. 결과(최종 배율, 두 빌드의 클리어/사망)를 설계서 "구현" 절에 적는다.
- [ ] **Step 3: 전체 확인 + 커밋** — `npm test` + `npm run build`, `feat: 벼림 봇 빌드와 밸런스 측정`
