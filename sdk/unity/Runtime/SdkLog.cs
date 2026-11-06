// sdk-log — 켜면 받은 명령마다 「[ControlCli] click LoginButton — 성공」 한 줄을 Unity 로그에 적는다. 입력 글자 · 값은 *** 로 가린다(Issue Bunker 로그 정책)
using System;
using System.Collections.Generic;
using System.Text;
using UnityEngine;

namespace ControlCli
{
    internal static class SdkLog
    {
        // 기본 꺼짐 — 게임을 다시 켜면 꺼진다.
        public static bool On;

        // 알림 읽기와 sdk-log 자신은 안 적는다 — 읽을 때마다 로그가 한 줄씩 늘지 않게.
        private static readonly HashSet<string> Quiet = new HashSet<string> { "logs", "events", "errors", "sdk-log" };

        [Serializable]
        private sealed class ReplyHead
        {
            public string error;
        }

        // 이름 칸(target · to · name · method · prop · key)은 그대로, 값 칸(text · value · args)은 「이름=***」(passwordHash=*** 꼴).
        // 실패 글에 섞인 입력값도 *** — src/fake-game.ts 의 sdkLine 과 같은 줄이다.
        public static void Write(ControlServer.Command c, string reply)
        {
            if (!On || c == null || reply == null || Quiet.Contains(c.cmd ?? "")) return;
            var head = new StringBuilder("[ControlCli] ").Append(c.cmd);
            foreach (var name in new[] { c.target, c.to, c.name, c.method, c.prop, c.key })
                if (!string.IsNullOrEmpty(name)) head.Append(' ').Append(name);
            var secrets = new List<string>();
            if (!string.IsNullOrEmpty(c.text)) { head.Append(" text=***"); secrets.Add(c.text); }
            if (!string.IsNullOrEmpty(c.value)) { head.Append(" value=***"); secrets.Add(c.value); }
            var args = new List<string>();
            if (c.args != null) foreach (var a in c.args) if (!string.IsNullOrEmpty(a)) args.Add(a);
            if (args.Count > 0) { head.Append(" args=***"); secrets.AddRange(args); }
            // 답은 모두 {"ok": 로 시작한다 — 성공이면 수 MB 스크린샷 답을 읽지 않는다.
            if (reply.StartsWith("{\"ok\":true", StringComparison.Ordinal))
            {
                Debug.Log(head.Append(" — 성공").ToString());
                return;
            }
            var error = JsonUtility.FromJson<ReplyHead>(reply).error ?? "";
            foreach (var s in secrets) error = error.Replace(s, "***");
            Debug.Log(head.Append(" — 실패: ").Append(error).ToString());
        }
    }
}
