# control_cli

Unity 게임을 자동화 테스트로 조작하는 SDK 와 CLI.

- **SDK** (Unity UPM 패키지) — QA 빌드에서만 폰 안 `127.0.0.1` 에 포트를 열고, 오브젝트 트리 읽기 · 찾기 · 누르기 · 끌기 · 글자 넣기 · 속성 읽기를 받는다. 터치는 빌드 때 이름이 같은 가짜 `Input` 으로 바꿔치기한다
- **CLI** — snapshot(줄인 트리 + 스크린샷) → ref → 액션. 폰은 `adb forward` 로 잇는다(USB 또는 디바이스 팜)

0단계 실측 결과는 [docs/step0.md](docs/step0.md). 지금은 `ping` · `tree` · `click` · `tap` 만 된다.

## 게임에 넣기 (QA 빌드만)

1. `Packages/manifest.json` 에 `"com.maxihan1.control-cli": "https://github.com/maxihan1/control_cli.git?path=/sdk"` 를 더한다
2. QA 빌드 스크립트가 정의 심볼 `CONTROL_CLI` 를 더한다 — 없으면 SDK 코드가 빌드에 아예 안 들어간다
3. 게임 터치를 읽는 어셈블리(asmdef)의 `references` 에 `ControlCli.Input` 을 더한다 — 게임 코드의 `Input.GetTouch` 가 가짜 터치도 보게 된다

## CLI

```bash
npm install -g github:maxihan1/control_cli
control-cli ping                 # 게임이 답하나
control-cli tree                 # 켜진 오브젝트 트리(글자 · 누를 수 있나)
control-cli click LoginButton    # 그 UI 가운데를 가짜 터치로 누른다
control-cli tap 540 1200         # 화면 좌표를 누른다(왼쪽 아래가 0,0)
control-cli -s <serial> --port 13100 ping
```

명령마다 `adb forward tcp:13100 tcp:13100` 을 먼저 건다. adb 는 `ANDROID_HOME` → `~/Library/Android/sdk` → PATH 순서로 찾는다.

## License

MIT
