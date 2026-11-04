// 주소를 단계로 풀고 트리에서 맞는 것을 고른다 — src/select.ts 를 같은 규칙 · 같은 실패 글로 옮긴 것(AltTester PATH 꼴의 일부). 좌표로 찾기(find-at)도 여기
using System;
using System.Collections.Generic;
using System.Globalization;
using System.Text;
using System.Text.RegularExpressions;
using UnityEngine;
using UnityEngine.EventSystems;

namespace ControlCli
{
    internal static class Select
    {
        internal sealed class Cond
        {
            public string Key;
            public string Value;
            // contains(@칸,값) — 일부만 맞아도
            public bool Part;
        }

        internal sealed class Step
        {
            // 실패 글에 쓰는 그 단계 글자
            public string Raw;
            // // — 바로 아래가 아니라 아래 어디서나
            public bool Deep;
            // 오브젝트 이름 · * 아무 이름 · .. 부모
            public string Name;
            public readonly List<Cond> Conds = new List<Cond>();
            // 그 단계에 맞은 형제 중 몇 번째(0부터) — 음수는 뒤에서(-1 이 마지막)
            public int? Index;
        }

        internal sealed class Result
        {
            // 맞은 것마다 뿌리에서 그것까지의 줄(마지막이 맞은 것)
            public List<List<Item>> Trails;
            // 비었으면 끊긴 단계 번호
            public int Stop = -1;
        }

        private static readonly string[] Keys = { "name", "tag", "layer", "component", "text", "id" };
        private static readonly Regex Eq = new Regex(@"^@(\w+)=(.*)$", RegexOptions.Singleline);
        private static readonly Regex Has = new Regex(@"^contains\(@(\w+),(.*)\)$", RegexOptions.Singleline);
        private static readonly Regex Num = new Regex(@"^-?\d+$");
        private static readonly Regex Quoted = new Regex(@"^(['""])(.*)\1$", RegexOptions.Singleline);
        private static readonly Regex Literal = new Regex(@"^(.+)\[(\d+)\]$", RegexOptions.Singleline);

        private static FormatException Bad(string target, string why) => new FormatException("주소 " + target + " 의 꼴이 틀렸습니다 — " + why);

        // / 로 시작하지 않으면 이름 그대로(아래 어디서나 그 이름). 꼴이 틀리면 까닭을 던진다.
        public static List<Step> Steps(string target)
        {
            if (string.IsNullOrEmpty(target)) throw new FormatException("주소가 비었습니다");
            var steps = new List<Step>();
            if (target[0] != '/')
            {
                steps.Add(new Step { Raw = target, Deep = true, Name = target });
                return steps;
            }
            var i = 0;
            while (i < target.Length)
            {
                var start = i;
                var deep = i + 1 < target.Length && target[i + 1] == '/';
                i += deep ? 2 : 1;
                var nameStart = i;
                while (i < target.Length && target[i] != '/' && target[i] != '[') i++;
                var step = new Step { Deep = deep, Name = target.Substring(nameStart, i - nameStart) };
                while (i < target.Length && target[i] == '[')
                {
                    var end = target.IndexOf(']', i);
                    if (end < 0) throw Bad(target, target.Substring(i) + " 를 닫는 ] 가 없습니다");
                    var inside = target.Substring(i + 1, end - i - 1);
                    // 조건 · 순번 꼴이 아닌 [ ] 는 이름의 일부다([DOTween] · Slot[A]) — 단계 전체가 이름이고 끝의 [숫자]만 순번(옛 경로 규칙 그대로).
                    if (!Num.IsMatch(inside) && !inside.StartsWith("@", StringComparison.Ordinal) && !inside.StartsWith("contains(", StringComparison.Ordinal))
                    {
                        var slash = target.IndexOf('/', nameStart);
                        i = slash < 0 ? target.Length : slash;
                        var segment = target.Substring(nameStart, i - nameStart);
                        var m = Literal.Match(segment);
                        step.Name = m.Success ? m.Groups[1].Value : segment;
                        step.Conds.Clear();
                        step.Index = m.Success ? int.Parse(m.Groups[2].Value, CultureInfo.InvariantCulture) : (int?)null;
                        break;
                    }
                    AddCond(step, inside, target);
                    i = end + 1;
                }
                if (i < target.Length && target[i] != '/') throw Bad(target, "] 뒤에는 / 가 와야 합니다");
                if (step.Name.Length == 0) throw Bad(target, "단계마다 이름이나 * 가 있어야 합니다 (예: //*[@tag=Player])");
                if (step.Name == ".." && (deep || step.Conds.Count > 0 || step.Index != null)) throw Bad(target, ".. 은 /.. 꼴로만 씁니다");
                step.Raw = target.Substring(start, i - start).TrimStart('/');
                steps.Add(step);
            }
            return steps;
        }

        private static void AddCond(Step step, string inside, string target)
        {
            if (Num.IsMatch(inside))
            {
                if (step.Index != null) throw Bad(target, "순번이 둘입니다 [" + inside + "]");
                step.Index = int.Parse(inside, CultureInfo.InvariantCulture);
                return;
            }
            var m = Eq.Match(inside);
            if (!m.Success) m = Has.Match(inside);
            if (!m.Success) throw Bad(target, "[" + inside + "] 는 [@칸=값] · [contains(@칸,값)] · [순번] 중 하나여야 합니다");
            var key = m.Groups[1].Value;
            if (Array.IndexOf(Keys, key) < 0) throw Bad(target, "모르는 칸 @" + key + " — " + string.Join(" · ", Keys));
            var value = m.Groups[2].Value.Trim();
            var quoted = Quoted.Match(value);
            step.Conds.Add(new Cond { Key = key, Value = quoted.Success ? quoted.Groups[2].Value : value, Part = inside.StartsWith("contains(", StringComparison.Ordinal) });
        }

        public static Result Run(List<Step> path, bool all)
        {
            var trails = new List<List<Item>> { new List<Item>() };
            for (var k = 0; k < path.Count; k++)
            {
                var s = path[k];
                var next = new List<List<Item>>();
                foreach (var t in trails)
                {
                    if (s.Name == "..")
                    {
                        if (t.Count > 1) next.Add(t.GetRange(0, t.Count - 1));
                        continue;
                    }
                    // 형제 묶음마다 순번을 센다 — // 는 아래 모든 층의 묶음이다.
                    var groups = new List<KeyValuePair<List<Item>, List<Item>>>();
                    Gather(t, t.Count > 0 ? Tree.ChildrenOf(t[t.Count - 1], all) : Tree.Roots(all), s.Deep, all, groups);
                    foreach (var g in groups)
                    {
                        var hit = g.Value.FindAll(n => Fits(n, s));
                        if (s.Index == null)
                        {
                            foreach (var n in hit) next.Add(With(g.Key, n));
                            continue;
                        }
                        var at = s.Index.Value < 0 ? hit.Count + s.Index.Value : s.Index.Value;
                        if (at >= 0 && at < hit.Count) next.Add(With(g.Key, hit[at]));
                    }
                }
                // 같은 것에 두 길로 닿으면(// 를 두 번 · 형제의 ..) 하나만 남긴다.
                var seen = new HashSet<object>();
                trails = next.FindAll(t => seen.Add(t[t.Count - 1].Key));
                if (trails.Count == 0) return new Result { Trails = trails, Stop = k };
            }
            return new Result { Trails = trails };
        }

        private static void Gather(List<Item> trail, List<Item> under, bool deep, bool all, List<KeyValuePair<List<Item>, List<Item>>> groups)
        {
            groups.Add(new KeyValuePair<List<Item>, List<Item>>(trail, under));
            if (!deep) return;
            foreach (var n in under) Gather(With(trail, n), Tree.ChildrenOf(n, all), true, all, groups);
        }

        private static List<Item> With(List<Item> trail, Item n) => new List<Item>(trail) { n };

        private static bool Fits(Item n, Step s)
        {
            if (s.Name != "*" && n.Name != s.Name) return false;
            foreach (var c in s.Conds)
            {
                var ok = false;
                foreach (var x in Attr(n, c.Key))
                    if (c.Part ? x.IndexOf(c.Value, StringComparison.Ordinal) >= 0 : x == c.Value)
                    {
                        ok = true;
                        break;
                    }
                if (!ok) return false;
            }
            return true;
        }

        // 선택자 칸의 값들 — select.ts 의 View.attr. UI Toolkit 요소에 없는 칸(tag · layer · id)은 빈 목록이라 늘 안 맞는다.
        internal static List<string> Attr(Item item, string key)
        {
            var list = new List<string>();
            switch (key)
            {
                case "name":
                    list.Add(item.Name);
                    break;
                case "text":
                {
                    var t = Tree.TextOf(item);
                    if (t != null) list.Add(t);
                    break;
                }
                case "component":
#if CONTROL_CLI_UITK
                    if (item.Ve != null)
                    {
                        list.Add(item.Ve.GetType().Name);
                        list.Add(item.Ve.GetType().FullName);
                        break;
                    }
#endif
                    foreach (var c in item.Go.GetComponents<Component>())
                        if (c != null)
                        {
                            list.Add(c.GetType().Name);
                            list.Add(c.GetType().FullName);
                        }
                    break;
                case "tag":
                    if (item.Go != null) list.Add(item.Go.tag);
                    break;
                case "layer":
                    if (item.Go != null)
                    {
                        list.Add(LayerMask.LayerToName(item.Go.layer));
                        list.Add(item.Go.layer.ToString(CultureInfo.InvariantCulture));
                    }
                    break;
                case "id":
                    if (item.Go != null)
                    {
                        // 영구 id(QA 빌드 훅이 붙인 것)가 먼저 — find 답의 id 가 이것이다.
                        var stamped = item.Go.GetComponent<ControlCliId>();
                        if (stamped != null && !string.IsNullOrEmpty(stamped.Id)) list.Add(stamped.Id);
                        list.Add(item.Go.GetInstanceID().ToString(CultureInfo.InvariantCulture));
                    }
                    break;
            }
            return list;
        }

        // 줄을 SDK 가 받는 경로로 — 같은 이름 형제가 있으면 [순번](CLI snapshot 의 flatten 과 같은 셈). all 이면 꺼진 형제까지 센다.
        public static string PathOf(List<Item> trail, bool all)
        {
            var level = Tree.Roots(all);
            var sb = new StringBuilder();
            foreach (var n in trail)
            {
                int index = 0, count = 0;
                foreach (var x in level)
                {
                    if (x.Name != n.Name) continue;
                    if (x.Is(n)) index = count;
                    count++;
                }
                sb.Append('/').Append(count > 1 ? n.Name + "[" + index + "]" : n.Name);
                level = Tree.ChildrenOf(n, all);
            }
            return sb.ToString();
        }

        // 한 것을 짚는 명령의 찾기 — missing 은 「없음」(기다리기가 되풀이할 수 있다), 여럿 · 틀린 꼴은 몇 번 해도 같다.
        public static List<Item> Find(string target, bool all, out string problem, out bool missing)
        {
            missing = false;
            List<Step> path;
            try { path = Steps(target); }
            catch (Exception e) when (e is FormatException || e is OverflowException)
            {
                problem = e.Message;
                return null;
            }
            var r = Run(path, all);
            problem = null;
            if (r.Trails.Count == 1) return r.Trails[0];
            var bare = target[0] != '/';
            if (r.Trails.Count == 0)
            {
                missing = true;
                problem = (all ? "" : "켜진 ") + "오브젝트 중에 " + target + " 이 없습니다" + (bare || r.Stop < 0 ? "" : " (" + path[r.Stop].Raw + " 에서 끊김)");
                return null;
            }
            problem = bare
                ? target + " 이 " + r.Trails.Count + "개라 하나를 고를 수 없습니다 — 경로로 주소를 씁니다"
                : target + " 에 맞는 것이 " + r.Trails.Count + "개라 하나를 고를 수 없습니다 — [순번] · 조건을 더하거나 find-all 로 경로를 봅니다";
            return null;
        }

        // find-all — 여럿이 맞아도 된다. 꼴이 틀리면 null 과 까닭.
        public static List<List<Item>> All(string target, bool all, out string problem)
        {
            problem = null;
            try { return Run(Steps(target), all).Trails; }
            catch (Exception e) when (e is FormatException || e is OverflowException)
            {
                problem = e.Message;
                return null;
            }
        }

        private static readonly List<RaycastResult> Hits = new List<RaycastResult>();

        // 화면 자리(왼쪽 아래 0,0)의 맨 위 — UI Toolkit → uGUI → 3D · 2D 물리. 트리에 없는 속 칸이 맞으면 트리에 있는 조상으로 올린다.
        // ponytail: UI Toolkit 과 uGUI 가 겹치면 UI Toolkit 이 이긴다 — 두 정렬 순서를 견주는 건 겹친 게임이 생기면.
        public static Item At(Vector2 p, Camera cam)
        {
#if CONTROL_CLI_UITK
            for (var ve = UiToolkit.Pick(p); ve != null; ve = ve.hierarchy.parent)
                if (Tree.TrailOf(new Item(ve), false) != null) return new Item(ve);
#endif
            var events = EventSystem.current;
            if (events != null)
            {
                Hits.Clear();
                events.RaycastAll(new PointerEventData(events) { position = p }, Hits);
                foreach (var hit in Hits)
                    for (var t = hit.gameObject != null ? hit.gameObject.transform : null; t != null; t = t.parent)
                        if (Tree.TrailOf(new Item(t.gameObject), false) != null) return new Item(t.gameObject);
            }
            if (cam == null) cam = Camera.main;
            if (cam == null) return default;
            var ray = cam.ScreenPointToRay(p);
            GameObject best = null;
            // 카메라가 그리는 끝(far clip) 너머는 화면에 없다.
            var near = cam.farClipPlane;
#if CONTROL_CLI_PHYSICS
            if (Physics.Raycast(ray, out var h3, near))
            {
                best = h3.collider.gameObject;
                near = h3.distance;
            }
#endif
#if CONTROL_CLI_PHYSICS2D
            var h2 = Physics2D.GetRayIntersection(ray);
            if (h2.collider != null && h2.distance < near) best = h2.collider.gameObject;
#endif
            return best != null ? new Item(best) : default;
        }
    }
}
