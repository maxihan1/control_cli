# P5 인스펙터 · Recorder — 설계 · 구현 계획

AltTester Desktop 의 인스펙터(트리 · 컴포넌트 · 스크린샷)와 Recorder(누른 차례를 테스트 코드로)를 설치 없는 로컬 웹 화면으로 만든다(plan.md 「인스펙터 모양」). 엔진은 모른다 — 통신 꼴 명령만 쓰므로 Unity · Godot 둘 다 그대로.

## 모양

- `control-cli inspect [--port 13110] [--no-open]` — 열린 세션의 게임에 붙는 HTTP 서버를 `127.0.0.1` 에 띄우고 브라우저로 연다. 세션이 없으면 「마지막 연결」(아래)로 연다
- 화면 한 장(HTML 하나, `src/inspect.ts` 안 글자) — 왼쪽 트리 · 가운데 스크린샷 · 오른쪽 상세(컴포넌트 → 칸 · 메서드 → 값) · 아래 Recorder
  - 스크린샷을 누르면 `find-at` 으로 그 자리 오브젝트를 고른다(화면 좌표는 왼쪽 아래 0,0 — 그림 크기를 `tree.screen` 비율로 바꾼다)
  - 고른 오브젝트에 「누르기」(click) · 「글자 넣기」(type) · 키 칸(key) — 하고 나면 트리 · 스크린샷을 새로 받는다
  - 「글자 확인」 · 「값 확인」 — 지금 글자 · 칸 값을 기대값으로 적는다(assertion)
- 보안 — 서버는 `127.0.0.1` 만 듣고, 모든 요청에 띄울 때 만든 임의 토큰(`X-Inspect` 머리 · 스크린샷은 `?t=`)이 있어야 한다. 다른 사이트가 localhost 로 명령을 쏘는 길(CSRF · DNS rebinding)을 막는다
- 브라우저 dialog(alert · prompt)는 쓰지 않는다 — 입력칸으로

## Recorder

- 기록은 단계 목록(JSON) — 동작 셋 · 확인 둘
  - `{do:'click', target}` · `{do:'type', target, text}` · `{do:'key', key}`
  - `{check:'text', target, contains}` · `{check:'prop', target, prop, equals}`
  - 비밀번호 칸(`type` 답이 `***`)은 글자를 적지 않고 `secret: 'SECRET_<칸 이름>'` 환경 변수 이름을 적는다(Ran 줄 가리기와 같은 까닭)
- target 은 snapshot 과 같은 주소(이름이 트리에 하나뿐이면 이름, 아니면 경로) — `flatten` 을 그대로
- 확인은 기다림 꼴 — 동작 뒤 화면이 바로 안 바뀐다. 글자는 「들어 있다」(waitFor text), 값은 「같다」(waitForProp). 다른 언어는 생성 파일 안 작은 `until` 도우미(10초 · 0.3초)
- 내보내기 — `src/recorder.ts` 의 `exportTest(steps, lang)`, 언어 다섯
  - TS: `node --test`(`import { Game, linkTo } from 'control-cli'`) — 줄은 Ran 줄과 같은 `await game.click('X')`
  - Python: `test_recorded()` 함수(pytest · `python3 파일` 둘 다) · Java: `RecordedTest` main · C#: 최상위 문장 프로그램(`ControlCli.cs` 옆) · Robot: Python 드라이버를 라이브러리로
  - 게임 주소는 모두 `CONTROL_CLI_GAME`(기본 `tcp://127.0.0.1:13100`) — drivers/ 의 주소 꼴. TS 에는 `linkTo(주소)` 를 새로 내보낸다(`tcp://` · relay `http(s)://…/games/<key>`)
- CLI — `control-cli replay <기록.json>`(지금 세션에 돌려 단계마다 통과/실패, 실패면 종료 코드 1) · `control-cli export <기록.json> --lang ts|py|cs|java|robot [--out <파일>]`
- 인스펙터의 「돌리기」 · 「내보내기」 · 「저장」(JSON 내려받기)은 같은 함수

## 마지막 연결 기억

- `open` 이 성공하면 연 인자(세션 이름 · `--app` 밖의 연결 칸)를 `<세션 폴더>/last-open.json` 에 적는다
- `inspect` 는 세션이 없으면 그 인자로 `open` 을 다시 부른다 — 「지난번처럼 붙기」. `--app` 은 싣지 않는다(이미 켜진 게임에 붙는다 — 다시 깔지 않는다)

## 하지 않는 것

- 녹화 중 게임 안 손 입력 잡기(AltTester Recorder 는 에디터에서만) — 동작은 인스펙터에서 누른 것만 적는다
- drag · 좌표 입력 기록 — 주소 없는 좌표는 케이스에 못 쓴다(Ran 줄 규칙). 필요하면 칸을 더한다
- 인스펙터에서 칸 쓰기(set) · 메서드 부르기(call) — CLI 로 된다

## 태스크

1. `src/recorder.ts` — 단계 꼴 · `replay` · `exportTest` 다섯 언어 → 검증: `recorder.test.ts`(가짜 표준 화면에 replay 초록 · TS · Python · Java 내보낸 파일을 실제로 돌려 초록 · 실패 기록은 빨강)
2. `linkTo` · `tcpLink(host)` · index 내보내기 → 검증: 내보낸 TS 가 `control-cli` 를 불러 돈다
3. CLI `replay` · `export` · `last-open.json` → 검증: `cli.test.ts`
4. `src/inspect.ts` — HTTP 서버(토큰 · /tree · /call · /shot · /replay · /export) · HTML → 검증: `inspect.test.ts`(토큰 없으면 403 · 트리 · find-at · 기록 → 내보내기)
5. CI `drivers` 잡 — C# · Robot 내보낸 파일도 가짜 표준 화면에 → 검증: 잡 초록 · 건너뜀 0
6. 실측 — 이 맥 macOS 앱(Unity sample · Godot 결과물): `inspect` 로 기록 → `replay` · 내보낸 TS · Python · Java 초록
7. README · 체크리스트 · context-notes · 진척 db · 판 0.13.0
