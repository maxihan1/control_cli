// 게임 로그에 번호를 붙여 최근 것만 들고 있다가 logs(전부) · errors(예외 · 에러만) 명령에 돌려준다
using System;
using UnityEngine;
using UnityEngine.Scripting;

namespace ControlCli
{
    internal static class GameErrors
    {
        public static readonly Feed Errors = new Feed("errors", 200);
        // 로그는 많다 — errors 를 밀어내지 않게 따로 든다.
        public static readonly Feed Logs = new Feed("logs", 500);

        // 첫 장면보다 먼저 듣기 시작해야 켜지자마자 난 예외도 잡힌다.
        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.SubsystemRegistration), Preserve]
        private static void Listen()
        {
            Application.logMessageReceivedThreaded -= OnLog;
            Application.logMessageReceivedThreaded += OnLog;
        }

        // 다른 스레드에서도 불린다 — Unity API 를 부르지 않는다.
        private static void OnLog(string message, string stack, LogType type)
        {
            var now = DateTime.UtcNow;
            var fields = ",\"occurredAt\":" + Json.Str(Feed.Stamp(now)) + ",\"type\":" + Json.Str(type.ToString())
                + ",\"message\":" + Json.Str(Feed.Mask(message)) + ",\"stack\":" + Json.Str(Feed.Mask(stack));
            Logs.Add(fields);
            if (type == LogType.Log || type == LogType.Warning) return;
            // time 은 SDK 0.7.0 전 꼴 그대로 둔다 — test_platform kit 증적 · 옛 CLI 가 읽는다(Issue Bunker 의 칸 더하기 하위호환).
            Errors.Add(",\"time\":" + Json.Str(now.ToString("o")) + fields);
        }
    }
}
