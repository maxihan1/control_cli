# C2. Windows 에서 도는 CLI — 설계 · 구현 계획

위 계획은 [plan.md](plan.md) 의 C2 절이다. 여기에는 코드를 읽고 굳힌 설계와 차례만 적는다. 결정의 까닭과 실측은 [context-notes.md](context-notes.md).

## 전제

- 이 맥에는 Windows 가 없다. Windows 에서 본 것은 모두 GitHub `windows-latest` runner 의 기록이다. 실제 PC 는 C3 이다.
- 판은 그대로다(CLI 0.15.0 · SDK 0.12.0). SDK · `protocol/commands.json` 은 고치지 않는다.
- CLI 의 PC 길은 OS 분기가 거의 없다. 고칠 곳보다 「Windows 에서 돌려 본 기록」을 만드는 일이 크다.

## 고칠 곳

**`src/launch.ts`(새 파일)** — `cli.ts` 의 `launch()` · `stop()` 을 옮겨 `index.ts` 로 내보낸다(QA Hub kit 이 CLI 를 띄우지 않고 쓴다). `cli.ts` 를 그대로 내보내면 라이브러리가 MCP · 인스펙터 · relay 까지 끌고 온다.
- `launch(app): number` — 프로세스 번호를 돌려준다.
  - 끝의 `/`(Windows 는 `\` 도)를 떼고 본다. `.app` 판정과 「파일이 있나」가 같은 글자를 쓴다.
  - 실행 파일을 절대 경로로 바꾸고 **작업 폴더를 그 파일의 폴더로** 한다(탐색기에서 두 번 눌러 띄운 것과 같게). 작업 폴더를 주면 상대 경로가 그 폴더 기준으로 풀리므로 절대 경로가 먼저다. macOS · Linux 도 같게 한다.
  - `windowsHide` — 게임 창까지 숨기는지를 runner 에서 먼저 잰다(아래 「열린 것」). 숨기면 게임에는 걸지 않는다.
- `stop(pid): boolean` — `process.kill`. 이미 꺼졌으면 `false`. iPhone 끄기(`devicectl`)는 `cli.ts` 에 남는다.

**`src/cli.ts`**
- relay 띄우기(`ensureRelay`)에 `windowsHide: true` — node 는 콘솔 프로그램이라 `detached` 로 띄우면 빈 콘솔 창이 뜬다.
- `open --ios` · `open --usb` 는 Windows 에서 미리 거절한다(「Windows 에서는 `--pc` · `--relay` · 디바이스 팜만 됩니다」). 길을 고치지는 않는다.

**테스트**
- `cli.test.ts` PC 줄 — 가짜 앱이 `sh` 스크립트다. Windows 에서는 node 실행 파일을 `Game.exe` 로 복사해 쓰고, 인자 없이 떠도 살아 있게 `NODE_OPTIONS=--require <멈춰 있는 모듈>` 을 그 줄 동안만 건다. 끝에 `\` 를 붙인 경로로 연다.
- `cli.test.ts` iPhone 줄 — Unix 소켓 usbmuxd 라 Windows 에서는 건너뛴다. 그 자리에 「Windows 에서는 `--ios` · `--usb` 거절」 줄(Windows 에서만 돈다).
- `launch.test.ts`(새 파일) — 띄운 프로세스의 작업 폴더가 실행 파일 폴더인지 · 상대 경로 · `stop` 이 끄고 두 번째는 `false` · 없는 파일 거절.
- `drivers.test.ts` 의 `has()` — `sh -c 'command -v'` 대신 Windows 는 `where`. 도구가 있으면 돌고 없으면 건너뛴다.
- 나머지는 `windows-latest` 에서 빨간 줄을 읽고 고친다. 짐작으로 미리 고치지 않는다.

**그 밖**
- `.gitattributes` — `* text=auto eol=lf`. Windows checkout 이 CRLF 로 바꾸면 글자를 그대로 견주는 테스트(`drivers` 생성 칸 · `sdk-meta`)가 깨진다.
- `.github/workflows/cli.yml`(새로) — `npm ci` → `npm test` 를 `ubuntu-latest` · `windows-latest` 에서.
- `.github/workflows/sample.yml` — `conform-windows` 잡(시도). 이 실행이 구운 `StandaloneWindows64` 빌드를 받아 `open --pc --app …\control-cli-sample.exe` → `conform` → `pad xbox`.
- `README.md` — PC 절에 Windows 예시, 지원 표의 Windows 칸.

## 열린 것 — runner 에서 재고 정한다

1. **`windowsHide` 가 게임 창을 숨기는가** — Node 는 이 값을 `STARTUPINFO.wShowWindow = SW_HIDE` 로 넘긴다. Unity 가 첫 `ShowWindow` 에서 그 값을 따르면 창이 안 뜬다. `windowsHide` 를 건 것과 안 건 것으로 띄워 창 손잡이(`MainWindowHandle`)와 스크린샷을 견준다.
2. **GPU 없는 runner 에서 Unity 창이 뜨는가** — 안 뜨면 `conform-windows` 잡은 빼고 C3 으로 넘긴다.
3. **`pad xbox` 의 layout** — 뜨면 `XInputControllerWindows` 인지 본다.

재는 동안은 버리는 workflow(`win-try.yml` · branch push 로 돈다)가 C1 실행(44056206295)의 Windows 빌드를 받아 쓴다 — sample 전체(80분)를 돌리지 않는다. 병합 전에 지운다.

## 차례

1. 이 파일 · checklist. → 확인: 문서만.
2. `launch.ts` · `launch.test.ts` · `cli.ts` · `index.ts` · `cli.test.ts` · `drivers.test.ts` · `.gitattributes` · `cli.yml`. → 확인: 이 맥 `npm test` 초록, PR 의 `cli` 잡이 `ubuntu-latest` · `windows-latest` 에서 초록.
3. `win-try.yml` 로 열린 것 셋을 잰다. → 확인: 결과를 context-notes 에.
4. 되면 `sample.yml` 에 `conform-windows` 잡, 안 되면 까닭을 적고 C3 으로. → 확인: sample 실행 초록.
5. 이 맥 macOS 빌드 conform(작업 폴더를 바꿨으므로). → 확인: 「실패 0」.
6. README · checklist · context-notes · 맨 위 블록 → PR 병합 → `v0.15.0` tag → 진척 페이지.

## 이번에 하지 않는 것

- `--ios` · `--usb` 의 Windows 지원, 드라이버(Python · C# · Java · Robot)의 Windows 보증 — 도구가 있는 runner 에서 테스트가 돌 뿐이다.
- 게임에 실행 인자 넘기기(`launch(app, args)`) — runner 에서 인자 없이는 안 뜰 때만 다시 본다.
- 폴더를 주면 그 안의 `.exe` 를 찾아 주기.
