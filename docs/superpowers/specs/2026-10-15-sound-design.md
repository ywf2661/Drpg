# 5-B단계: 효과음 설계

- 날짜: 2026-10-15
- 목표: 타격·피격·사망·물약·아이템·장비 효과음으로 전투 손맛을 낸다.
- 결정 사항(추천안 채택): FLARE 효과음(Ogg Vorbis, CC-BY-SA 3.0) 그대로 사용. sim은 바꾸지 않고, 렌더 쪽에서 프레임 사이 상태 변화를 비교해 소리 이벤트를 만든다. 거리 감쇠(12m), 음소거 버튼(설정은 브라우저에 기억).

## 1. 이벤트 `src/audio/events.ts` (순수 함수)

`snapshot(world)` → 엔티티별 `{ hp, state, attackT }`, `potions`, `gear`, 아이템 id 집합.
`soundEvents(prev, world)` → `{ name, x, z }[]`:

| 변화 | 소리 |
|---|---|
| 엔티티가 공격을 시작(상태가 attack이 됨, 또는 attackT가 줄어 다음 휘두르기) | 주인공 `swing`, 몬스터 `skel_attack` / 보스 `boss_attack` |
| 체력 감소(살아 있음) | 주인공 `hero_hit`, 몬스터 `skel_hit` / `boss_hit` |
| 사망 | 주인공 `hero_die`, 몬스터 `skel_die` / `boss_die` (피격음 대신) |
| 물약 수 감소 / 증가 | `potion` |
| 새 아이템 등장 | `loot` |
| 무기 / 갑옷 단계 상승 | `equip_weapon` / `equip_armor` |

층이 바뀌면(이전 스냅숏의 엔티티 수가 다르거나 world가 다름) 이벤트 없이 스냅숏만 갱신.

## 2. 재생 `src/audio/sound.ts`

- Web Audio. 첫 사용자 입력(pointerdown/keydown)에서 AudioContext 생성·재개, 그때 파일을 받아 디코드(실패한 소리는 무음).
- 이름 → 파일 여러 개면 무작위(주인공 휘두르기 3종).
- 음량 = 기본 × `max(0, 1 − 거리/12)`(주인공 소리는 1). 같은 소리는 50ms 안에 한 번만.
- 음소거: 오른쪽 위 `소리` 버튼, 상태는 localStorage(try/catch).

## 3. 파일

`tools/sprites.py`가 FLARE `soundfx/`에서 받아 `src/assets/sounds/*.ogg`로 복사(CREDITS 목록 자동 포함): melee_attack{,_2,_3}, male_hit, male_die, enemies/skeleton_{phys,hit,die}, enemies/minotaur_{phys,hit,die}, inventory/inventory_potion, flying_loot, inventory/inventory_metal, inventory/inventory_maille.

## 4. 범위 밖

배경 음악, 환경음(화로 불꽃), 발소리, 입체 음향(좌우 패닝).

## 5. 완료 기준

1. `npm test`: `soundEvents`가 표의 각 변화를 정확히 한 번 만들고, 사망 틱에는 피격음 대신 사망음, 층 변경 시 이벤트 없음.
2. `npm run build`.
3. 헤드리스: 소리 파일이 모두 디코드되고(콘솔 오류 없음), 전투 중 재생 호출이 일어남(개발용 카운터).
