# C3. VISION 윈도우 PC 길 — 설계 · 구현 계획

위 계획은 [plan.md](plan.md) 의 C3 절이었다. 2026-11-19 사용자가 길을 바꿨다 — 「모바일 스펙과 동일하게」. 넘겨받은 글은 [vision-pc-handoff.md](vision-pc-handoff.md), 결정의 까닭은 [context-notes.md](context-notes.md) 「C3」.

## 바뀐 것

- 모바일은 러너가 QA Hub 서버에 있고, VISION 이 폰을 잡아 준다(러너는 `DEVICE_FARM_URL` 로 잡기 → Appium 으로 깔고 켜기 → `/game` 으로 명령).
- PC 도 같게 간다. 러너 · CLI 를 PC 에 깔지 않는다. PC 는 VISION 기기 `pc-<이름>` 이고(ADR-061), CLI 는 폰처럼 잡고 → zip 을 깔고 → 켜고 → `/game` → 끄고 → 놓는다. Appium 만 빠진다.
- 원래 C3 의 「PC 러너」와 QA Hub Q1 의 `PC_RUNNER_URL` 은 버린다. Q1 명세는 QA Hub 쪽이 이 답을 따라 고친다(여기서는 고치지 않는다).
- 이미 있는 `open --pc`(같은 컴퓨터에서 게임에 바로 붙기)는 그대로 둔다 — 사람이 손으로 시험할 때 쓰는 길이다.

## VISION 입구 (Devicefarm `docs/guides/test-platform.md` 15절)

| 순서 | 요청 | 답 |
|---|---|---|
| 잡기 | `POST /api/devices/acquire {"minutes","filter":"platform=windows"}` (serial 을 알면 `POST /api/devices/<serial>/hold`) | `held.serial` · `held.sessionId` |
| 깔기 | `POST /api/devices/<serial>/install` 본문 zip 바이트 · `Content-Type: application/zip` | `{"installed":true,"game":"<exe 이름>"}` |
| 켜기 | `POST …/launch {"game"}` | `{"pid"}` — SDK 준비는 `/game` ping 으로 기다린다 |
| 명령 | `POST …/game {cmd…}` | 폰과 같다 — `farmLink` 그대로 |
| 끄기 | `POST …/stop {}` | `{"stopped"}` |
| 놓기 | `DELETE …/hold` | VISION 이 켠 게임을 끄고 Unity 데이터를 지운다 |
| 녹화 | `GET /api/sessions/<held.sessionId>/artifacts` | `video-N.mp4` · `game.log` |

## 고칠 곳

**`src/vision.ts`(새 파일)** — PC 기기 셋을 함수로. QA Hub kit 이 CLI 를 띄우지 않고 쓰게 `index.ts` 로 내보낸다(C2 의 `launch.ts` 와 같은 까닭).
- `isPc(serial)` — serial 이 `pc-` 로 시작하면 PC(VISION C7 · `pc-<이름>`). 기기 목록을 따로 묻지 않는다.
- `pcInstall(farm, serial, zip: Uint8Array): Promise<string>` — 게임 이름을 돌려준다. 1GB · 5분 기다림은 VISION 몫이라 받는 쪽 시간 한도만 10분으로 늘린다.
- `pcLaunch(farm, serial, game): Promise<number>` · `pcStop(farm, serial): Promise<boolean>`.

**`src/cli.ts`**
- `hold --pc` — serial 이 없으면 `acquire` + `platform=windows`(폰은 지금처럼 빈 폰 찾기 → `hold`). 답의 `sessionId` 를 `held-session` 파일에 적어 둔다.
- `open` — 잡은 기기가 PC 면 Appium 세션 대신, `--app` 이 `.zip` 이면 깔고 그 이름으로 켜고, 아니면 `--app` 을 VISION 게임 목록의 이름으로 보고 켠다(사람이 깐 `BossRoomQA` 같은 것). `PLATFORM_APP`(APK 주소)은 PC 에 쓰지 않는다. 세션에 `pcGame` 을 적고, 명령 · 스크린샷은 지금처럼 `/game` · SDK 가 한다.
- `close` — `pcGame` 이 있으면 `stop`.
- `release` — 문구를 「PC … 놓음」으로, `held-session` 이 있으면 녹화 받는 주소를 한 줄 더.
- HELP · README 「디바이스 팜」 절에 PC 한 단락.

**테스트** — `fake-game.ts` 의 `fakeFarm` 에 `acquire` · `install` · `launch` · `stop` 을 더하고 `cli.test.ts` 에 한 줄: `hold --pc` → `open --app game.zip`(올라간 바이트 · `Content-Type` 확인) → 명령 · 스크린샷이 SDK 로 → `close` 가 `stop` → `release` 가 녹화 주소.

## 하지 않는 것

- MCP `hold` 에 PC 고르기 — `udid: "pc-pc1"` 로 이미 된다. 요청이 오면 더한다.
- 녹화 받기 명령(`artifacts`) — `release` 가 주소를 알려 준다. 받는 일은 QA Hub kit 몫이다.
- 원래 C3 칸 중 실물 패드 꽂기 · 초점 잃은 창 · IL2CPP — 이번 PR 은 VISION 길을 연다. 남은 칸은 체크리스트에 그대로 둔다.

## 차례

1. `fakeFarm` · `cli.test.ts` 에 실패하는 줄 → `vision.ts` · `cli.ts` 를 채운다 → `npm test` 초록.
2. README · HELP.
3. 실물 — `pc-pc1` 에 Boss Room 윈도우 QA 빌드(run 44435682949 결과물)로 `hold --pc` → `open --app BossRoom.zip` → `snapshot` · 명령 몇 개 → `close` → `release` → 녹화 목록. VISION 토큰이 있어야 한다(사람 PAT 는 정책상 없다 — 사용자에게 묻는다).
4. PR · 합치기 · `v0.16.0` tag(라이브러리에 함수가 늘어 CLI 판을 올린다 · SDK 는 그대로 0.12.0).

## 조심

- boss-room `showcase` 에 올리지 않는다 — QA 배포 끝에 Commander 자동 테스트가 폰을 잡는다. 빌드는 이미 있는 run 결과물을 받기만 한다.
- 끝-끝 지연 · 대역 측정은 Devicefarm `DEV-F16-05` 몫이다.
