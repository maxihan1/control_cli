// conform --driver 의 다리 실행 파일 — CONTROL_CLI_GAME 주소의 게임으로 stdin 명령을 보낸다(dotnet run --project drivers/csharp)
ControlCli.Game.Bridge(new ControlCli.Game(Environment.GetEnvironmentVariable("CONTROL_CLI_GAME") ?? "tcp://127.0.0.1:13100"));
