# P3-C Linux — PC 길 그대로 Linux 빌드 (설계 · 구현 계획)

로드맵은 [plan.md](plan.md) P3, 할 일 체크는 [checklist.md](checklist.md) P3-C, 결정은 [context-notes.md](context-notes.md) 「P3-C 설계」.

## Context

Linux 게임은 PC 게임과 같다 — SDK 는 `127.0.0.1:13100` 에 TCP 를 열고(데스크톱 Mono 의 `TcpListener` · 스레드), relay 를 구우면 `ClientWebSocket` 으로 건다. `Relay.cs` 는 이미 `LinuxPlayer` 를 「Linux」로 부른다. 그래서 SDK · CLI 는 바꿀 것이 없고, 없던 것은 **Linux 빌드와 그 빌드로 돈 `conform`** 뿐이다.

이 맥(Apple Silicon)엔 리눅스 기계가 없다. Docker Desktop 이 `--platform linux/amd64` 컨테이너를 돌린다(시험 — `uname -m` 이 `x86_64`). 화면은 Xvfb, GL 은 Mesa 소프트웨어(llvmpipe)로 띄운다.

## 그림

```
[이 맥 Docker — linux/amd64 컨테이너]
  Xvfb :99 ── control-cli-sample.x86_64 (Unity 6000.0 · Mono · SDK 127.0.0.1:13100)
                     ▲ TCP
  node dist/main.js open --pc --app … → conform      (CLI 도 같은 컨테이너 — 게임 포트가 루프백이라)
```

## 설계

1. **sample 빌드** — `SampleBuild.cs` 의 PC 묶음(Mono · 540×1200 창)에 `StandaloneLinux64` 를 더한다. 리눅스 CI 러너가 바로 굽는 대상이다
2. **sample CI** — `StandaloneLinux64`(6000.0 · 옛 Input) 잡 하나. PC 의 Input System 길은 macOS 잡이 이미 실측했고 Linux 도 같은 C# 이라 늘리지 않는다
3. **CLI 를 컨테이너 안에서** — SDK 가 루프백에만 열어 `docker -p` 로는 못 닿는다. CLI(node)는 플랫폼과 무관한 JS 라 같은 컨테이너에서 돌리면 `--pc` 길이 그대로다. 이 김에 Linux 에서 CLI 의 `launch` · `stop` 도 함께 본다
4. **판** — SDK · CLI 코드가 안 바뀌어 판을 올리지 않는다(tag 없음)

## 확인할 위험

- Rosetta(amd64 흉내) 위에서 Unity 플레이어가 뜨나 · 프레임이 conform 시간 한도(명령 10초) 안에 도나
- Vulkan 이 없을 때 OpenGLCore 로 내려가나(Mesa llvmpipe) · `ReadPixels` 스크린샷이 검지 않나
- Xvfb 에는 창 관리자가 없다 — 창 초점 · 크기(540×1200) · 마우스 좌표가 맞나

## 끝 기준

- sample CI `StandaloneLinux64` 잡 초록
- 이 맥 Docker(Xvfb)에서 `conform` — 「통과 52 · 실패 0 · 미실행 1」(일시정지 — PC 와 같음)이 목표
- README 지원 표 · Linux 루프 절, plan.md AltTester 표 Linux 칸

## 범위 밖

- relay 를 구운 Linux 빌드 — 같은 Mono `ClientWebSocket` 길을 macOS 가 실측했다(P3-A)
- 진짜 리눅스 기계 · GPU, Linux IL2CPP, Linux Input System 잡

# 구현 계획

1. **sample** — `SampleBuild.cs` PC 묶음에 Linux, `sample.yml` Linux 잡 → 확인: PR CI 의 Linux 잡 초록
2. **실기기** — CI 결과물을 받아 Docker amd64 컨테이너(Xvfb · Mesa · node 22)에서 `open --pc --app` → `conform`
3. **문서** — README · plan.md · checklist · context-notes · 진척 페이지
