# 캐릭터 도트 스프라이트 교체 설계

- 날짜: 2026-10-15
- 목표: 2등신 KayKit 3D 캐릭터를 디아블로 1·2풍의 8방향 프리렌더 도트 스프라이트로 교체한다.
- 결정 사항: FLARE 계열 에셋(CC-BY-SA 3.0), 미리 변환한 스프라이트 시트 + 3D 장면 속 세로 빌보드. 게임 규칙(sim)은 변경하지 않는다.
- 미리보기: 합성 목업으로 외형 승인 (사슬갑옷 기사, 스켈레톤, 화면 짧은 변 360px, 카메라 30°).

## 1. 에셋

### 1.1 출처

- 저장소: https://github.com/flareteam/flare-game , 커밋 `af6eee6d339ac98011864bfe89da837fe7769c28` 고정
- 라이선스: 아트·데이터 CC-BY-SA 3.0. 변환 결과물도 CC-BY-SA 3.0. 게임 코드는 영향 없음.

| 종류 | 원본 |
|---|---|
| 주인공 | `avatar/male/` 레이어 합성: head=`chain_coif`, chest=`chain_cuirass`, hands=`chain_gloves`, legs=`chain_greaves`, feet=`chain_boots`, main=`longsword`, off=`kite_shield` |
| 졸개 (minion) | `enemies/skeleton_weak` |
| 전사 (warrior) | `enemies/skeleton` |

### 1.2 동작 매핑 (게임 이름 → FLARE 이름)

`stance`→`stance`, `move`→`run`, `attack`→`swing`, `hit`→`hit`, `die`→`die`. 모두 8방향.

FLARE 방향 번호: 0=SW, 1=W, 2=NW, 3=N, 4=NE, 5=E, 6=SE, 7=S (화면 기준, `engine/hero_layers.txt` 순서).

주인공 레이어 그리기 순서 (방향별, 앞쪽이 먼저 = 뒤에 깔림, `hero_layers.txt`):
- SW, W, NW: main, feet, legs, hands, chest, off, head
- N, NE, E: feet, legs, hands, chest, off, head, main
- SE: feet, legs, hands, main, chest, head, off
- S: main, feet, legs, hands, chest, head, off

### 1.3 변환 스크립트 `tools/sprites.py`

Python 3 + Pillow. 한 번 실행하고 결과를 커밋한다. 원본은 `tools/.cache/`(git 무시)에 받는다.

1. FLARE 정의 파일(`frame=번호,방향,x,y,w,h,기준x,기준y`)을 파싱한다.
2. 종류별로 필요한 (동작, 방향, 프레임)을 큰 캔버스의 같은 발 위치에 그린다. 주인공은 레이어 순서대로 합성.
3. 종류 내 모든 프레임의 합집합 경계 상자로 자른다.
4. `SCALE = 0.32`로 축소(LANCZOS), 알파를 110 기준으로 0/255 이진화(도트 가장자리), 256색 팔레트로 줄인다.
5. 시트: 열 = 프레임 번호, 행 = 동작 기준 행 + 방향. 모든 칸 크기 동일.
6. 결과: `src/assets/sprites/{hero,minion,warrior}.png`, `.json`(코드에서 import → Vite가 번들·해시), `public/sprites/CREDITS.txt`(크레딧 링크용).
7. 자체 검사: 모든 (동작, 방향, 프레임) 원본 존재, 시트 크기 ≤ 4096×4096.

JSON 형식:
```json
{
  "cell": [w, h], "anchor": [x, y], "ppm": 30, "cols": 8, "rows": 40,
  "anims": { "stance": { "row": 0, "frames": 4, "ms": 800, "loop": "back_forth" }, "...": {} }
}
```
`anchor`는 칸 안의 발 위치(픽셀), `ppm`은 1m당 픽셀, `loop`은 `back_forth | looped | play_once`.

## 2. 화면 표시

### 2.1 카메라·해상도

- 카메라 수평 45°, 내려다보는 각 **30°**(극각 60°). 거리 30.
- 화면 짧은 변 렌더 픽셀 `SHORT_PX = 360`, 줌 6(짧은 변 12m) → 30px/m. 주인공 키 약 51px.
- 마우스 휠 줌 제거(배율 변화 시 스프라이트 픽셀이 불균일해짐).

### 2.2 빌보드

- 캐릭터마다 세로 평면 1장, `rotation.y = π/4`로 카메라(+x+z) 쪽을 향함.
- 크기: 가로 `cell.w / ppm`, 세로 `cell.h / ppm / cos(30°)` (카메라 기울기로 납작해지는 만큼 보정).
- 평면을 옮겨 발 기준점이 원점에 오게 하고, 엔티티 `(x, 0, z)`에 놓는다.
- 재질: `MeshBasicMaterial`, `alphaTest 0.5`, `toneMapped: false`, 시트 텍스처는 Nearest 필터. 종류별 텍스처 1장을 공유하고 캐릭터마다 `offset/repeat`만 다르게(텍스처 clone).
- 실제 3D 위치에 서므로 앞 벽에 가려지고 뒤 벽은 가리지 않는다. 벽에 바짝 붙으면 옆으로 뻗은 무기 끝이 벽에 묻힐 수 있음(허용).

### 2.3 방향·프레임

- `dirIndex(facing)`: 월드 방향 (sin f, cos f)를 화면 벡터 (dx−dz, −(dx+dz))로 바꿔 45° 구간 → FLARE 번호. 구간(E부터 반시계) → `[5,4,3,2,1,0,7,6]`.
- `frameAt(anim, t)`: 한 바퀴(프레임 n개) = `ms`. `looped` 반복, `play_once` 마지막 프레임 유지, `back_forth` 0→n−1→0 왕복.
- 동작 선택: 사망 → `die`, 공격 상태 → `attack`(프레임 = 휘두르기 진행도 × 프레임 수, sim `attackT`에 동기), 피격 표시 중(0.3초) → `hit`, 이동 → `move`, 그 외 `stance`. 동작이 바뀌면 t=0.
- 이동 재생 속도 = 해당 종류 이동 속도 / 주인공 이동 속도(4m/s).

### 2.4 조명

- 세로 평면은 머리 위 횃불 빛을 거의 받지 못하므로 재질 색으로 직접 밝힌다.
- 밝기 `b = clamp(1 − d / TORCH_RANGE, 0, 1)^1.4 × 1.1 + 0.04` (d = 주인공과의 거리), 주인공은 1.15. 횃불 깜빡임 비율을 곱한다. 색 = 횃불색(1.0, 0.82, 0.62) × b.
- 캐릭터는 그림자를 만들지 않는다(FLARE 그림에 발밑 그림자 포함). 벽 그림자는 유지.

## 3. 크레딧

- 오른쪽 아래 [크레딧] 버튼 → `<dialog>`: "캐릭터 그림: Flare: Empyrean Campaign (Clint Bellanger 외 Flare 기여자), CC-BY-SA 3.0, 원본 링크, 수정 내용(프레임 선택·장비 레이어 합성·크기 조정·색 수 감소), 전체 목록 `sprites/CREDITS.txt`".
- `CREDITS.txt`는 스크립트가 생성: 출처·커밋·라이선스·수정 내용·사용 파일 목록 + FLARE `CREDITS.txt` 전문.

## 3.1 마우스 커서

- FLARE `images/cursors/cursor_normal.png`(평소), `cursor_attack.png`(몬스터 위) 40×40, 핫스팟 (0,0). `public/sprites/`로 복사, CREDITS에 포함.
- CSS: `html`에 기본 커서, 몬스터 위에서는 캔버스에 `attack` 클래스.

## 4. 제거

- `public/models/` 전체(KayKit 캐릭터·무기·라이선스), GLTFLoader·MeshoptDecoder·SkeletonUtils 사용 코드, 스켈레톤 눈 재질.

## 5. 범위 밖

- 장비에 따른 외형 변화(3단계 아이템에서 레이어 합성 재사용 가능), 새 몬스터, 던전 소품, 벽 투명화.

## 6. 완료 기준

1. `python tools/sprites.py`가 자체 검사를 통과하고 `src/assets/sprites/`에 시트 3종·JSON, `public/sprites/`에 CREDITS를 만든다.
2. `npm test` 통과: 기존 sim 테스트 + `dirIndex`·`frameAt` 단위 테스트 + 시트 JSON 계약 테스트(모든 동작 존재, 행·열 범위).
3. `npm run build` 성공.
4. 헤드리스 Chrome(PC·모바일)에서: 기사·스켈레톤이 도트 스프라이트로 보이고, 8방향으로 이동할 때 진행 방향을 바라보며, 공격·피격·사망 동작이 나오고, 시체가 남는다. 앞 벽에 가려진다. [크레딧]이 열린다.
5. 모델 전송량이 기존(약 1.5MB)보다 작다.
