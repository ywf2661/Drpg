# 3-B단계: 장비(무기·갑옷) 설계

- 날짜: 2026-10-15
- 목표: 몬스터가 무기·갑옷을 떨어뜨리고, 더 좋은 장비를 밟으면 장착되어 공격력·방어력과 **외형**이 바뀐다. 층이 깊을수록 좋은 장비가 나온다.
- 결정 사항(추천안 채택): 인벤토리 없이 "더 좋은 것만 자동 장착"(모바일 친화, 비교 UI 불필요), 슬롯 2개(무기, 갑옷 세트 = 투구·몸통·장갑·다리·신발·방패), 외형은 16조합 시트를 미리 합성해 장착할 때 그 조합만 불러온다.
- 후속: 인벤토리·아이템 비교, 접두사(마법 옵션), 상점.

## 1. 장비표

| 단계 | 무기 | 데미지 | 공격 간격 | 갑옷 | 받는 피해 감소 | 갑옷 레이어(FLARE avatar/male) |
|---|---|---|---|---|---|---|
| 1 | 단검 dagger | 4–7 | 0.6초 | 천옷 | 0% | cloth_shirt, cloth_pants, cloth_gloves, cloth_sandals, head_short, buckler |
| 2 | 숏소드 shortsword | 6–10 | 0.7초 | 가죽 갑옷 | 10% | leather_chest, leather_pants, leather_gloves, leather_boots, leather_hood, iron_buckler |
| 3 | 롱소드 longsword | 8–12 | 0.8초 | 사슬 갑옷 | 20% | chain_cuirass, chain_greaves, chain_gloves, chain_boots, chain_coif, kite_shield |
| 4 | 그레이트소드 greatsword | 11–17 | 1.0초 | 판금 갑옷 | 30% | plate_cuirass, plate_greaves, plate_gauntlets, plate_boots, plate_helm, shield |

- 시작 장비: 숏소드 + 가죽 갑옷(기존 롱소드·0% 감소와 비슷한 난이도).
- 받는 피해 = `max(1, round(피해 × (1 − 감소)))`.

## 2. 규칙 `src/sim/world.ts`

- `World.gear = { weapon: 1..4, armor: 1..4 }`, `World.maxTier`(드롭 최고 단계). main이 넣는다(기본 2, 2).
- 주인공의 데미지·공격 간격은 무기에서, 받는 피해는 갑옷으로 줄인다. 몬스터는 기존 STATS. `attackInterval(w, e)`를 내보내 렌더가 휘두르기 프레임을 맞춘다.
- 드롭: 몬스터가 죽을 때 물약 판정 뒤 별도로 장비 판정(졸개 5%, 전사 12%). 종류는 무기·갑옷 반반, 단계 = `1 + floor(rand × maxTier)`. 물약과 같은 `items`에 `{ id, x, z, kind: 'potion' | 'weapon' | 'armor', tier }`(물약은 tier 0).
- 줍기: 물약은 기존 규칙. 장비는 0.6m 이내이고 **현재보다 단계가 높을 때만** 장착하고 사라진다(낮거나 같으면 바닥에 남음).
- `maxTier`: main이 `min(4, 층 + 1)`.

## 3. 진행 `src/main.ts`

- 내려가기: 장비 유지. 사망 후 재시작: 그 층에 들어왔을 때 장비. 클리어 후 1층: 시작 장비.
- 장비가 바뀌면 화면 아래 가운데에 "<이름> 장착" 알림 2초, HUD 장비 칸 갱신, 주인공 시트 교체.

## 4. 그림

- `tools/sprites.py`: 주인공 16조합 `src/assets/sprites/hero_<무기>_<갑옷>.png`(예 `hero_shortsword_leather.png`), 모든 조합이 **같은 칸 크기·기준점**(공통 경계 상자)이라 `hero.json` 하나를 공유. 기존 `hero.png` 삭제.
- 바닥 그림: `loot` 시트에 `dagger shortsword longsword greatsword clothes leather_armor steel_armor` 추가(사슬·판금은 steel_armor 공유), 각 FLARE `animations/loot/*.txt`의 `power` 동작.
- HUD 아이콘: `src/assets/sprites/gear_icons.png` = 64px 아이콘 8개 가로 1줄(무기 96~99, 갑옷 129·145·153·161).
- 렌더: `sprites.ts`가 `import.meta.glob`으로 16장 URL을 알고, `setHeroGear(weapon, armor)`가 해당 시트를 불러와(처음 한 번, 이후 캐시) 주인공 판자 질감을 바꾼다. 불러오는 동안은 이전 외형 유지.
- HUD: 물약 버튼 오른쪽에 무기·갑옷 칸(40×40, 아이콘, title에 이름·수치).

## 5. 크레딧

새로 쓰는 avatar 레이어·loot 애니메이션 파일을 CREDITS 목록에 추가(스크립트가 실제 사용 목록에서 생성).

## 6. 범위 밖

인벤토리, 장비 비교 툴팁, 마법 옵션, 다른 무기 계열(도끼·둔기·활), 판매.

## 7. 완료 기준

1. `npm test`: 무기별 데미지·간격, 갑옷 감소(최소 1), 장비 드롭 확률·단계 범위(`maxTier` 이하), 더 좋은 장비만 장착·나머지는 남음, 물약 규칙 유지, 재현성, 시트 계약(16조합 모두 존재, loot 동작 8개).
2. `npm run build` 성공, 첫 화면 전송량 증가 없음(주인공 시트 1장만 로딩).
3. 헤드리스: 장비를 떨어뜨려 밟으면 알림·HUD·외형이 바뀌고 공격 간격이 달라짐, 층 이동 후 유지, 콘솔 오류 없음.
