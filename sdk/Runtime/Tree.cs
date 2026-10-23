// 켜진 오브젝트 트리를 JSON 으로 쓰고, 이름이나 경로 주소로 오브젝트 하나를 찾는다
using System.Collections.Generic;
using System.Text;
using UnityEngine;
using UnityEngine.SceneManagement;
using UnityEngine.UI;

namespace ControlCli
{
    internal static class Tree
    {
        // 켜진 오브젝트만 담는다 — 꺼진 것은 화면에 없어 누를 수 없다.
        public static string Dump()
        {
            var sb = new StringBuilder("[");
            var first = true;
            foreach (var root in ActiveRoots())
            {
                if (!first) sb.Append(',');
                first = false;
                Node(root.transform, sb);
            }
            return sb.Append(']').ToString();
        }

        private static void Node(Transform t, StringBuilder sb)
        {
            sb.Append("{\"name\":").Append(Json.Str(t.name));
            var text = TextOf(t.gameObject);
            if (text != null) sb.Append(",\"text\":").Append(Json.Str(text));
            var selectable = t.GetComponent<Selectable>();
            if (selectable != null)
                sb.Append(",\"kind\":").Append(Json.Str(selectable.GetType().Name))
                    .Append(",\"interactable\":").Append(selectable.IsInteractable() ? "true" : "false");
            var children = false;
            foreach (Transform child in t)
            {
                if (!child.gameObject.activeInHierarchy) continue;
                sb.Append(children ? "," : ",\"children\":[");
                children = true;
                Node(child, sb);
            }
            if (children) sb.Append(']');
            sb.Append('}');
        }

        public static string TextOf(GameObject go)
        {
            var input = go.GetComponent<InputField>();
            // 비밀번호는 글자를 가리되 비었는지는 보이게 한다 — 「입력 안 됨」을 케이스가 확인할 수 있어야 한다.
            if (input != null) return input.inputType == InputField.InputType.Password && input.text.Length > 0 ? "***" : input.text;
            var label = go.GetComponent<Text>();
            return label != null ? label.text : null;
        }

        // 주소는 이름(하나뿐일 때) 또는 / 로 시작하는 경로다. 같은 이름 형제는 경로 칸에 [순번](0부터)을 붙인다.
        // 이름이 겹치면 고르지 않고 알린다 — 엉뚱한 것을 누르면 케이스가 틀린 곳에서 통과한다.
        public static GameObject Find(string target, out string problem) => Find(target, out problem, out _);

        // missing 은 「켜진 것 중에 없다」 — 기다리기가 되풀이할 수 있는 실패다. 겹침 · 빈 주소는 몇 번 해도 같다.
        public static GameObject Find(string target, out string problem, out bool missing)
        {
            problem = null;
            missing = false;
            if (string.IsNullOrEmpty(target))
            {
                problem = "주소가 비었습니다";
                return null;
            }
            if (target[0] == '/') return FindPath(target, out problem, out missing);
            GameObject found = null;
            var count = 0;
            foreach (var root in ActiveRoots())
                foreach (var t in root.GetComponentsInChildren<Transform>(false))
                    if (t.name == target) { found ??= t.gameObject; count++; }
            missing = count == 0;
            if (count == 0) problem = "켜진 오브젝트 중에 " + target + " 이 없습니다";
            else if (count > 1) { problem = target + " 이 " + count + "개라 하나를 고를 수 없습니다 — 경로로 주소를 씁니다"; found = null; }
            return found;
        }

        private static GameObject FindPath(string path, out string problem, out bool missing)
        {
            problem = null;
            missing = false;
            IList<Transform> level = ActiveRoots().ConvertAll(g => g.transform);
            Transform at = null;
            foreach (var part in path.Substring(1).Split('/'))
            {
                var name = part;
                var index = -1;
                var open = part.LastIndexOf('[');
                if (open > 0 && part.EndsWith("]") && int.TryParse(part.Substring(open + 1, part.Length - open - 2), out var n))
                {
                    name = part.Substring(0, open);
                    index = n;
                }
                var same = new List<Transform>();
                foreach (var t in level)
                    if (t.name == name) same.Add(t);
                if (same.Count == 0 || index >= same.Count)
                {
                    missing = true;
                    problem = "켜진 오브젝트 중에 " + path + " 이 없습니다 (" + part + " 에서 끊김)";
                    return null;
                }
                if (index < 0 && same.Count > 1)
                {
                    problem = path + " 의 " + name + " 이 " + same.Count + "개라 " + name + "[0] 처럼 순번을 붙입니다";
                    return null;
                }
                at = same[index < 0 ? 0 : index];
                level = ActiveChildren(at);
            }
            return at.gameObject;
        }

        // Find 가 받는 꼴 그대로 — CLI 가 트리에서 셈한 경로와 같아야 한다.
        public static string PathOf(Transform t)
        {
            var parts = new List<string>();
            for (var at = t; at != null; at = at.parent)
            {
                IList<Transform> siblings = at.parent == null ? ActiveRoots().ConvertAll(g => g.transform) : ActiveChildren(at.parent);
                int index = 0, count = 0;
                foreach (var s in siblings)
                {
                    if (s.name != at.name) continue;
                    if (s == at) index = count;
                    count++;
                }
                parts.Insert(0, count > 1 ? at.name + "[" + index + "]" : at.name);
            }
            return "/" + string.Join("/", parts);
        }

        private static List<Transform> ActiveChildren(Transform t)
        {
            var list = new List<Transform>();
            foreach (Transform child in t)
                if (child.gameObject.activeInHierarchy) list.Add(child);
            return list;
        }

        // 누를 자리(화면 좌표 · 왼쪽 아래가 0,0). UI 는 사각형 가운데, 월드 오브젝트는 보이는 덩어리 가운데를 주 카메라로 비춘다.
        public static Vector2? ScreenPoint(GameObject go)
        {
            var rect = ScreenRect(go);
            if (rect != null) return rect.Value.center;
            var cam = Camera.main;
            if (cam == null) return null;
            var renderer = go.GetComponentInChildren<Renderer>();
            var world = renderer != null ? renderer.bounds.center : go.transform.position;
            var p = cam.WorldToScreenPoint(world);
            // 카메라 뒤는 화면에 없다.
            return p.z > 0 ? new Vector2(p.x, p.y) : (Vector2?)null;
        }

        // 화면 좌표(왼쪽 아래가 0,0)의 사각형. 화면 위 UI 가 아니면 null.
        public static Rect? ScreenRect(GameObject go)
        {
            if (!(go.transform is RectTransform rect)) return null;
            var corners = new Vector3[4];
            rect.GetWorldCorners(corners);
            var canvas = go.GetComponentInParent<Canvas>();
            var cam = canvas == null || canvas.rootCanvas.renderMode == RenderMode.ScreenSpaceOverlay ? null : canvas.rootCanvas.worldCamera;
            // 돌린 UI 는 대각 두 점만으로는 둘레가 안 나와 네 점을 다 본다.
            var min = new Vector2(float.MaxValue, float.MaxValue);
            var max = new Vector2(float.MinValue, float.MinValue);
            foreach (var corner in corners)
            {
                var p = RectTransformUtility.WorldToScreenPoint(cam, corner);
                min = Vector2.Min(min, p);
                max = Vector2.Max(max, p);
            }
            return Rect.MinMaxRect(min.x, min.y, max.x, max.y);
        }

        // DontDestroyOnLoad 로 옮긴 오브젝트는 장면 목록에 없어 우리 오브젝트가 있는 그 장면으로 따로 읽는다.
        public static Scene KeptScene;

        public static IEnumerable<GameObject> Roots()
        {
            for (var i = 0; i < SceneManager.sceneCount; i++)
                foreach (var go in SceneManager.GetSceneAt(i).GetRootGameObjects())
                    yield return go;
            if (KeptScene.IsValid())
                foreach (var go in KeptScene.GetRootGameObjects())
                    if (go.name != "[ControlCli]") yield return go;
        }

        private static List<GameObject> ActiveRoots()
        {
            var list = new List<GameObject>();
            foreach (var go in Roots())
                if (go.activeInHierarchy) list.Add(go);
            return list;
        }
    }
}
