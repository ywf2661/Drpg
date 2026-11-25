# 보스 그림 도구(3D 렌더) 설계

- 날짜: 2026-11-24
- 이어서: `2026-11-24-act2-expedition-design.md` 8절·"다음 설계 1"
- 상태: 짧은 설계(작은 일)

## 왜

2막 보스 다섯은 쓸 만한 그림이 없어서 스크립트로 3D 모형을 만들어 렌더하기로 했다(사용자). 스크래치패드의 시험판(파수꾼)을 보고 사용자가 질감·걷기·공격 폼을 다듬게 했고 방향을 받아들였다. 이번 일은 그 시험판을 **저장소의 정식 도구**로 옮기고, 파수꾼을 **게임 안에서 `?test` 버튼으로 불러내 걷고 공격하는 모습**을 보게 하는 것이다(사용자가 바랐던 확인 방법).

## 목표 / 아닌 것 / 실패

- 목표
  - `tools/boss3d/`: 공용 부품 + 보스마다 모형 파일 + 렌더러. 한 줄 명령으로 `src/assets/sprites/<이름>.png/.json`을 만든다.
  - 파수꾼 시트: stance·move·attack·**hit**·die(게임 시트와 같은 키, `sheets.test.ts` 검사를 통과).
  - 게임에 스킨 `time_warden` 등록, `?test` 「파수꾼 소환」 버튼(지금 「기사 소환」과 같은 방식). 보스 AI·능력치는 지금 보스 그대로.
- 아닌 것
  - 파수꾼의 기술·메아리 잔상·결전장·2막 연결(보스·땅 설계에서).
  - 다른 보스 넷의 모형(도구가 생긴 뒤 하나씩).
  - 게임 안에서 3D 모형을 실시간으로 그리는 것.
- 실패
  - 시험판보다 질감·동작이 나빠진다.
  - 렌더 결과가 실행할 때마다 달라진다(질감·조각 배치는 시드로 고정).
  - 도구를 돌리려면 따로 설치할 것이 생긴다(파이썬 playwright + 크롬은 이미 쓰고 있다).

## 접근

| 안 | 판단 |
|---|---|
| **브라우저용 JS 모형 + 파이썬 러너(헤드리스 크롬, swiftshader)** | **고름.** 시험판 그대로라 위험이 없다. three는 `node_modules`의 것을 쓴다 |
| node + headless-gl 등으로 브라우저 없이 | 버림 — 새 의존성, 윈도우 설치 부담 |
| 게임 렌더러에서 3D 모형을 실시간으로 | 버림 — 다른 스프라이트와 결이 달라지고 렌더러 손이 많이 간다 |

## 설계

- `tools/boss3d/kit.js`: 장면·카메라(30°, 직교)·조명, 캔버스 질감(모자이크·비늘·긁힘, 시드 고정), 재질, 톱니 모양, 두 마디 IK, `orient`, `renderFrame(facing, anim, t)` 진입점.
- `tools/boss3d/time_warden.js`: 모형과 동작(시험판 model.js의 내용). 새로 **hit**: 몸이 뒤로 젖혀졌다 돌아옴(2프레임).
- `tools/boss3d/render.py <이름>`: 정적 서버(도구 폴더 + three) → 렌더 → 알파 끊기 → 모든 프레임을 감싸는 칸으로 잘라 시트·json(`cell`, `anchor`, `ppm` 30, FLARE 방향 순서 0=W…7=SW). `--preview`면 시험판 viewer 같은 미리보기 html을 스크래치에 만든다.
- 게임: `SKINS.time_warden`(이름 「시간의 파수꾼」), `sprites.ts` SHEETS 등록, `sheets.test.ts`에 추가, `index.html` `#test-warden` + `main.ts` 핸들러(`summonKnight`를 스킨을 받게 고쳐 같이 쓴다).
- `CREDITS.txt`: "시간의 파수꾼: 스크립트(tools/boss3d)로 만든 3D 모형을 렌더. 참고 그림은 전작 timeguardian.png" 한 줄.
- 크기: 아래 질문.

## 확인

- `npm test -- sheets` (시트 키·칸), 소환 관련 테스트가 있으면 그것만.
- 화면: `?test`로 띄워 「파수꾼 소환」 → 걷기·공격·맞기·쓰러짐을 playwright로 찍어 본다.

## 받은 3D 모델 (2026-11-25)

- 사용자: "새 맵 잡몹이 기존과 너무 똑같다, OpenGameArt에서 3D 모델을 찾아 달라". 받은 원본은 `tools/art/models/`에 둔다.
- 길: `.blend` → `blender -b <파일> --python tools/boss3d/blend2glb.py -- tools/.cache/models/<이름>.glb [남길 메시] [메시=텍스처.png]` → `python tools/boss3d/render.py <시트 이름>`.
  render.py의 `MODELS`에 키(h, m)·동작 이름 짝(게임 stance·move·attack·hit·die ← 모델 동작, 프레임 수, ms, 반복, 시작~끝 비율)을 적으면 `glb.js`가 같은 카메라로 찍는다.
- 옛 파일 주의: 재질에 그림이 안 이어져 있으면 `메시=텍스처`로 다시 잇고, 앞이 어두우면 `'normals': 1`(법선 다시 계산).
- 넣은 것: 약탈자 오크(`raider_orc`, orc 1.45m, 진지 전사), 늪 나무 괴물(`swamp_treant`, forest monster 2.6m — 사용자가 더 크게, 호숫가 전사).
