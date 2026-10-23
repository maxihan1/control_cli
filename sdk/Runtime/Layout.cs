// 누를 수 있는 UI 가 화면 안전 영역 안에 있고 서로 안 겹치는지 좌표로 본다(화면 잘림 검사)
using System.Collections.Generic;
using System.Text;
using UnityEngine;
using UnityEngine.UI;

namespace ControlCli
{
    internal static class Layout
    {
        // 테두리가 1px 닿는 것은 겹침 · 벗어남으로 치지 않는다 — 좌표 반올림으로 생긴다.
        private const float Slack = 1f;

        public static string Check(string under)
        {
            Transform scope = null;
            if (under.Length > 0)
            {
                var root = Tree.Find(under, out var problem);
                if (root == null) return "{\"ok\":false,\"error\":" + Json.Str(problem) + "}";
                scope = root.transform;
            }

            var items = new List<(Selectable s, Rect rect)>();
            foreach (var go in Tree.Roots())
                foreach (var s in go.GetComponentsInChildren<Selectable>(false))
                {
                    if (!s.IsActive() || !s.IsInteractable()) continue;
                    if (scope != null && !s.transform.IsChildOf(scope)) continue;
                    var rect = VisibleRect(s.transform);
                    if (rect != null) items.Add((s, rect.Value));
                }

            var safe = Screen.safeArea;
            var problems = new StringBuilder();
            void Add(string json) => problems.Append(problems.Length > 0 ? "," : "").Append(json);
            for (var i = 0; i < items.Count; i++)
            {
                var (s, r) = items[i];
                if (r.xMin < safe.xMin - Slack || r.yMin < safe.yMin - Slack || r.xMax > safe.xMax + Slack || r.yMax > safe.yMax + Slack)
                    Add("{\"kind\":\"outside\",\"name\":" + Json.Str(s.name) + ",\"path\":" + Json.Str(Tree.PathOf(s.transform)) + ",\"rect\":" + Arr(r) + "}");
                for (var j = i + 1; j < items.Count; j++)
                {
                    var (o, q) = items[j];
                    // 부모 · 자식(스크롤 막대와 그 손잡이 같은)은 원래 포개져 있다.
                    if (s.transform.IsChildOf(o.transform) || o.transform.IsChildOf(s.transform)) continue;
                    var w = Mathf.Min(r.xMax, q.xMax) - Mathf.Max(r.xMin, q.xMin);
                    var h = Mathf.Min(r.yMax, q.yMax) - Mathf.Max(r.yMin, q.yMin);
                    if (w > Slack && h > Slack)
                        Add("{\"kind\":\"overlap\",\"name\":" + Json.Str(s.name) + ",\"path\":" + Json.Str(Tree.PathOf(s.transform)) +
                            ",\"other\":" + Json.Str(o.name) + ",\"otherPath\":" + Json.Str(Tree.PathOf(o.transform)) + "}");
                }
            }

            return "{\"ok\":true,\"screen\":[" + Screen.width + "," + Screen.height + "],\"safeArea\":" + Arr(safe) +
                   ",\"checked\":" + items.Count + ",\"problems\":[" + problems + "]}";
        }

        // 스크롤 목록처럼 마스크에 잘린 부분은 화면에 안 보여 누를 수 없다 — 보이는 부분만 본다. 다 잘렸으면 null.
        private static Rect? VisibleRect(Transform t)
        {
            var rect = Tree.ScreenRect(t.gameObject);
            if (rect == null) return null;
            var r = rect.Value;
            for (var p = t.parent; p != null; p = p.parent)
            {
                if (p.GetComponent<RectMask2D>() == null && p.GetComponent<Mask>() == null) continue;
                var clip = Tree.ScreenRect(p.gameObject);
                if (clip == null) continue;
                var c = clip.Value;
                r = Rect.MinMaxRect(Mathf.Max(r.xMin, c.xMin), Mathf.Max(r.yMin, c.yMin), Mathf.Min(r.xMax, c.xMax), Mathf.Min(r.yMax, c.yMax));
                if (r.width <= 0 || r.height <= 0) return null;
            }
            return r;
        }

        private static string Arr(Rect r) =>
            "[" + Mathf.RoundToInt(r.x) + "," + Mathf.RoundToInt(r.y) + "," + Mathf.RoundToInt(r.width) + "," + Mathf.RoundToInt(r.height) + "]";
    }
}
