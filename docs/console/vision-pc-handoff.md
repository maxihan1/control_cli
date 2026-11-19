# VISION 윈도우 PC 를 control_cli 로 쓰는 길 — Devicefarm 세션이 넘기는 글 (2026-11-19)

> 다음 control_cli 세션이 이 파일부터 읽는다. 사용자가 「control_cli 세션이 만든다」 고 골랐다(2026-11-19).
> VISION 쪽 원본은 `~/Projects/Devicefarm/docs/guides/test-platform.md` 15절(PC) · 12절(게임 명령) · 4절(잡기) · 7절(오류) · 10절(산출물), 결정은 `Devicefarm/docs/adr/061-windows-pc-device.md`.

## 먼저 사용자에게 물을 것 — 두 계획이 다른 길을 그린다

- control_cli `C3` · QA Hub `Q1`(`PC_RUNNER_URL`) — PC 에 CLI · 러너를 깔고 `open --pc` 로 게임 `127.0.0.1:13100` 에 바로 붙는다
- VISION ADR-061(2026-11-18 사용자) — **러너를 PC 에 직접 까는 안은 버림.** PC 는 VISION 기기 `pc-<이름>` 이고 Commander 는 폰과 같은 길(잡기 · 원격 화면 · 녹화 · 토큰)로 쓴다
- 둘 다 둘지, VISION 길 하나로 갈지를 첫 질문으로 둔다. QA Hub Q1 명세도 이 답을 따른다

## 만들 것 — VISION 길 (폰 길과 나란히)

지금 팜 길은 폰 전용이다 — `hold` → `open --app <APK>` → Appium 세션(`src/cli.ts:284~320`). PC 는 Appium 이 없다(`/wd/hub` 로 PC 를 잡으면 400).

PC 길 순서 (모두 VISION 주소 + Commander 러너 토큰, 사람 PAT 는 정책상 없음):
1. 잡기 — `POST /api/devices/acquire {"minutes":30,"filter":"platform=windows"}` → `held.serial`(`pc-pc1`). `platform` 조건이 없으면 안드로이드 폰만 고른다
2. 깔기 — `POST /api/devices/pc-pc1/install` 본문 = zip 바이트 · `Content-Type: application/zip` → `{"installed":true,"game":"BossRoom"}`. zip 맨 위 또는 한 폴더 아래에 exe 하나(`UnityCrashHandler*` 는 셈에서 뺌) · 1GB 까지
3. 목록 — `GET …/games` → `[{name, unity, by:"vision"|"person"}]`
4. 켜기 — `POST …/launch {"game":"BossRoom"}` → `{"pid"}`. SDK 준비는 `/game` ping 으로 기다린다. VISION 이 `-screen-fullscreen 1 -window-mode borderless` 를 붙여 켠다
5. 명령 — `POST …/game {"cmd":…}` — 폰과 같은 12절 꼴. VISION 이 PC 에이전트를 거쳐 PC 안 `127.0.0.1:13100` 으로 넘긴다. 15초 안에 답 없으면 502
6. 끄기 · 놓기 — `POST …/stop {}` · `DELETE …/hold`(놓으면 VISION 이 켠 게임을 끄고 Unity 데이터를 지운다)
7. 녹화 — `GET /api/sessions/<held.sessionId>/artifacts` → `video-N.mp4` · `game.log`

## 오늘 실물 상태 (2026-11-19)

- `pc-pc1` 연결됨 — DESKTOP-3BNL05I · Windows 10.0.26300 · 1920×1080 · 에이전트 0.1.0 · VISION 화면에 PC 화면 보임(사용자 확인)
- Boss Room 윈도우 QA 빌드 — boss-room `showcase` 의 「윈도우 QA 빌드」 workflow(`ShowcaseBuild.WindowsQa` · Mono · 창 전체화면 · runInBackground · `CONTROL_CLI` · CLI `v0.8.0` instrument). 첫 run 44430823087 · 합친 뒤 run 44435682949. zip 맨 위 `BossRoom.exe` · `ControlCli.Id/Input/Runtime.dll`. 14일 뒤 지워짐
  - control_cli 「보스룸 굽지마」(11-17)는 패드 확인 얘기였고, 11-19 사용자가 VISION PC 용으로 굽자고 했다
- PC 에 손으로 깐 것 — `C:\Games\BossRoom` + 바로가기 `C:\VISION\games\BossRoomQA.lnk`(VISION 목록에 `by:"person"`). 사용자가 실행 확인
- **실물 미확인** — 게임 명령(SDK 13100) · VISION 깔기 · 켜기 · 끄기 · 녹화 · 놓을 때 정리. 가짜 PC 로만 확인했다

## 조심

- boss-room `showcase` 에 합치거나 올리면 QA 배포 끝에 Test Commander 자동 테스트가 폰을 120분 잡고 돈다(2026-11-19 실제로 남 — 사용자가 손으로 중단)
- 끝-끝 확인 결과는 Devicefarm `DEV-F16-05` 로 이어진다 — 지연 · 대역 5회 측정은 그쪽이 한다
