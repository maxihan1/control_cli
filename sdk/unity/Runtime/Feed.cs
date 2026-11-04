// 번호를 붙여 최근 것만 들고 있다가 「이 번호 뒤」를 돌려주는 통 — errors · logs · events 가 같이 쓴다. 다른 스레드에서도 넣는다
using System;
using System.Collections.Generic;
using System.Globalization;
using System.Text;
using System.Text.RegularExpressions;

namespace ControlCli
{
    internal sealed class Feed
    {
        // Issue Bunker nginx 로그 규칙과 같다 — 영숫자 · _ · - 가 40자 넘게 이어진 토막(토큰 · 키)을 가린다. 폰 밖으로 원문이 안 나간다.
        private static readonly Regex Token = new Regex("[A-Za-z0-9_-]{40,}");

        private readonly string _key;
        private readonly int _keep;
        private readonly object _gate = new object();
        private readonly Queue<(long seq, string fields)> _items = new Queue<(long, string)>();
        private long _last;

        public Feed(string key, int keep)
        {
            _key = key;
            _keep = keep;
        }

        public static string Mask(string s) => string.IsNullOrEmpty(s) ? "" : Token.Replace(s, "***");

        // Issue Bunker occurredAt 과 같은 꼴 — UTC, ms 3자리(JS toISOString 과 같다).
        public static string Stamp(DateTime utc) => utc.ToString("yyyy-MM-dd'T'HH:mm:ss.fff'Z'", CultureInfo.InvariantCulture);

        // fields 는 seq 뒤에 이어 붙일 칸들 — 「,"occurredAt":…」 꼴(앞 쉼표 포함). 넣을 때 만들어 둔다.
        public void Add(string fields)
        {
            lock (_gate)
            {
                _items.Enqueue((++_last, fields));
                while (_items.Count > _keep) _items.Dequeue();
            }
        }

        // 케이스는 시작할 때 last 를 받아 두고 끝날 때 그 뒤 것만 받는다 — 여러 케이스가 지우지 않고 같이 쓴다.
        public string Since(long since)
        {
            lock (_gate)
            {
                // 게임이 다시 켜지면 번호가 1 부터 다시 센다 — 받아 둔 번호가 더 크면 다 주고 알린다.
                var restarted = since > _last;
                if (restarted) since = 0;
                var sb = new StringBuilder("{\"ok\":true,\"last\":").Append(_last);
                if (restarted) sb.Append(",\"restarted\":true");
                var first = true;
                var dropped = 0L;
                foreach (var e in _items)
                {
                    if (e.seq <= since) continue;
                    if (first) dropped = e.seq - since - 1; // 들고 있는 수를 넘겨 밀려난 것
                    sb.Append(first ? ",\"" + _key + "\":[" : ",");
                    first = false;
                    sb.Append("{\"seq\":").Append(e.seq).Append(e.fields).Append('}');
                }
                sb.Append(first ? ",\"" + _key + "\":[]" : "]");
                if (dropped > 0) sb.Append(",\"dropped\":").Append(dropped);
                return sb.Append('}').ToString();
            }
        }
    }
}
