// 게임에서 난 예외 · 에러 로그에 번호를 붙여 최근 것만 들고 있다가 errors 명령에 돌려준다
using System;
using System.Collections.Generic;
using System.Text;
using UnityEngine;
using UnityEngine.Scripting;

namespace ControlCli
{
    internal static class GameErrors
    {
        private const int Keep = 200;
        private static readonly object Gate = new object();
        private static readonly Queue<(long seq, string time, string type, string message, string stack)> Items =
            new Queue<(long, string, string, string, string)>();
        private static long _last;

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
            if (type == LogType.Log || type == LogType.Warning) return;
            lock (Gate)
            {
                Items.Enqueue((++_last, DateTime.UtcNow.ToString("o"), type.ToString(), message, stack));
                while (Items.Count > Keep) Items.Dequeue();
            }
        }

        // 케이스는 시작할 때 last 를 받아 두고 끝날 때 그 뒤 것만 받는다 — 여러 케이스가 지우지 않고 같이 쓴다.
        public static string Since(long since)
        {
            lock (Gate)
            {
                // 게임이 다시 켜지면 번호가 1 부터 다시 센다 — 받아 둔 번호가 더 크면 다 주고 알린다.
                var restarted = since > _last;
                if (restarted) since = 0;
                var sb = new StringBuilder("{\"ok\":true,\"last\":").Append(_last);
                if (restarted) sb.Append(",\"restarted\":true");
                var first = true;
                var dropped = 0L;
                foreach (var e in Items)
                {
                    if (e.seq <= since) continue;
                    if (first) dropped = e.seq - since - 1; // 들고 있는 수를 넘겨 밀려난 것
                    sb.Append(first ? ",\"errors\":[" : ",");
                    first = false;
                    sb.Append("{\"seq\":").Append(e.seq)
                        .Append(",\"time\":").Append(Json.Str(e.time))
                        .Append(",\"type\":").Append(Json.Str(e.type))
                        .Append(",\"message\":").Append(Json.Str(e.message))
                        .Append(",\"stack\":").Append(Json.Str(e.stack)).Append('}');
                }
                sb.Append(first ? ",\"errors\":[]" : "]");
                if (dropped > 0) sb.Append(",\"dropped\":").Append(dropped);
                return sb.Append('}').ToString();
            }
        }
    }
}
