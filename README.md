# control_cli

Unity 게임을 자동화 테스트로 조작하는 SDK 와 CLI.

- **SDK** (Unity UPM 패키지) — QA 빌드에서만 폰 안 `127.0.0.1` 에 포트를 열고, 오브젝트 트리 읽기 · 찾기 · 누르기 · 끌기 · 글자 넣기 · 속성 읽기를 받는다. 터치는 빌드 때 이름이 같은 가짜 `Input` 으로 바꿔치기한다
- **CLI** — snapshot(줄인 트리 + 스크린샷) → ref → 액션. 폰은 `adb forward` 로 잇는다(USB 또는 디바이스 팜)

0단계 실측 결과는 [docs/step0.md](docs/step0.md). 지금은 `ping` · `tree` · `click` · `tap` · `errors` · `layout` 이 된다.

## 게임에 넣기 (QA 빌드만)

게임 저장소에는 SDK 를 넣지 않는다. QA 빌드 잡에서 Unity 를 켜기 전에 한 번 돌린다.

```bash
npx -y github:maxihan1/control_cli#<커밋> instrument <Unity 프로젝트 폴더> --ref <커밋>
```

1. `Packages/manifest.json` 에 SDK 패키지를 `--ref` 로 고정해 더한다(없으면 `main`)
2. `Assets/` 아래 asmdef 의 `references` 에 `ControlCli.Input` 을 더한다 — 에디터 전용 · `noEngineReferences` 는 건너뛴다. asmdef 없는 스크립트(Assembly-CSharp)는 자동으로 참조한다
3. `namespace` 안에 `using UnityEngine;` 을 둔 파일은 `UnityEngine.Input` 이 먼저 잡혀 가짜 터치를 못 본다 — 경고로 알려 준다

그리고 **QA 빌드 스크립트가 정의 심볼 `CONTROL_CLI` 를 더한다** — 없으면 SDK 코드가 빌드에 아예 안 들어간다. Release 빌드는 손대지 않으면 된다.

가짜 `Input` 은 `UnityEngine.Input` 의 멤버를 다 감싼다(펜 · `mousePositionDelta` 는 빠짐). 터치만 가짜를 섞고 나머지는 그대로 넘긴다.

## CLI

```bash
npm install -g github:maxihan1/control_cli
control-cli ping                 # 게임이 답하나
control-cli tree                 # 켜진 오브젝트 트리(글자 · 누를 수 있나)
control-cli click LoginButton    # 그 UI 가운데를 가짜 터치로 누른다
control-cli tap 540 1200         # 화면 좌표를 누른다(왼쪽 아래가 0,0)
control-cli errors               # 게임에서 난 예외 · 에러 로그(최근 200개). 답의 last 를 받아 두고
control-cli errors 42            #   다음에 그 번호 뒤 것만 받는다. 밀려난 수는 dropped
control-cli layout               # 누를 수 있는 UI 가 안전 영역 밖이거나 서로 겹치면 problems 에 나온다
control-cli layout LoginView     #   그 오브젝트 아래만 본다
control-cli -s <serial> --port 13100 ping
```

명령마다 `adb forward tcp:13100 tcp:13100` 을 먼저 건다. adb 는 `ANDROID_HOME` → `~/Library/Android/sdk` → PATH 순서로 찾는다.

## License

MIT
