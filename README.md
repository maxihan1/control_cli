# control_cli

Unity 게임을 자동화 테스트로 조작하는 SDK 와 CLI.

- **SDK** (Unity UPM 패키지) — QA 빌드에서만 폰 안 `127.0.0.1` 에 포트를 열고, 오브젝트 트리 읽기 · 찾기 · 누르기 · 끌기 · 글자 넣기 · 속성 읽기를 받는다. 터치는 빌드 때 이름이 같은 가짜 `Input` 으로 바꿔치기한다
- **CLI** — snapshot(줄인 트리 + 스크린샷) → ref → 액션. 폰은 `adb forward` 로 잇는다(USB 또는 디바이스 팜)

아직 0단계 실측 중이다.

## License

MIT
