// 켜진 오브젝트 트리를 JSON 으로 쓰고, 이름이나 경로 주소로 하나를 찾는다 — 게임 오브젝트와 UI Toolkit 요소(UIDocument 아래)를 한 트리로 본다
using System.Collections.Generic;
using System.Text;
using UnityEngine;
using UnityEngine.SceneManagement;
using UnityEngine.UI;
#if CONTROL_CLI_UITK
using UnityEngine.UIElements;
#endif

namespace ControlCli
{
    // 트리 한 칸 — 게임 오브젝트 또는 UI Toolkit 요소 하나. 주소가 가리키는 것이다.
    internal readonly struct Item
    {
        public readonly GameObject Go;
#if CONTROL_CLI_UITK
        public readonly VisualElement Ve;

        public Item(VisualElement ve)
        {
            Go = null;
            Ve = ve;
        }
#endif

        public Item(GameObject go)
        {
            Go = go;
#if CONTROL_CLI_UITK
            Ve = null;
#endif
        }

        public bool Exists =>
#if CONTROL_CLI_UITK
            Ve != null ||
#endif
            Go != null;

        // 이름 없는 요소는 타입 이름으로 부른다 — 대개 겹쳐 경로 주소가 된다.
        public string Name =>
#if CONTROL_CLI_UITK
            Ve != null ? (string.IsNullOrEmpty(Ve.name) ? Ve.GetType().Name : Ve.name) :
#endif
            Go.name;

        public bool Is(Item other) =>
#if CONTROL_CLI_UITK
            Ve != null ? Ve == other.Ve :
#endif
            Go == other.Go;
    }

    internal static class Tree
    {
        // 켜진 것만 담는다 — 꺼진 오브젝트 · 숨은 요소는 화면에 없어 누를 수 없다.
        public static string Dump()
        {
            var sb = new StringBuilder("[");
            var roots = Roots();
            for (var i = 0; i < roots.Count; i++)
            {
                if (i > 0) sb.Append(',');
                Node(roots[i], sb);
            }
            return sb.Append(']').ToString();
        }

        private static void Node(Item item, StringBuilder sb)
        {
            sb.Append("{\"name\":").Append(Json.Str(item.Name));
            var text = TextOf(item);
            if (text != null) sb.Append(",\"text\":").Append(Json.Str(text));
            var kind = KindOf(item);
            if (kind != null) sb.Append(",\"kind\":").Append(Json.Str(kind)).Append(",\"interactable\":").Append(Interactable(item) ? "true" : "false");
            var children = ChildrenOf(item);
            if (children.Count > 0)
            {
                sb.Append(",\"children\":[");
                for (var i = 0; i < children.Count; i++)
                {
                    if (i > 0) sb.Append(',');
                    Node(children[i], sb);
                }
                sb.Append(']');
            }
            sb.Append('}');
        }

        // 켜진 자식 — UIDocument 가 있는 오브젝트는 그 요소들도 자식이다. 트리 · 찾기 · 경로가 모두 이것 하나로 내려간다.
        public static List<Item> ChildrenOf(Item item)
        {
            var list = new List<Item>();
#if CONTROL_CLI_UITK
            if (item.Ve != null)
            {
                // 컨트롤(버튼 · 입력칸 …) 속은 내보내지 않는다 — 안쪽 요소는 컨트롤의 일부이고 비밀번호 칸 속 글자를 드러낼 수 있다.
                if (KindOf(item) == null)
                    foreach (var child in item.Ve.Children())
                        if (Shown(child)) list.Add(new Item(child));
                return list;
            }
#endif
            foreach (Transform child in item.Go.transform)
                if (child.gameObject.activeInHierarchy) list.Add(new Item(child.gameObject));
#if CONTROL_CLI_UITK
            var doc = item.Go.GetComponent<UIDocument>();
            if (doc != null && doc.isActiveAndEnabled && doc.rootVisualElement != null)
                foreach (var child in doc.rootVisualElement.Children())
                    if (Shown(child)) list.Add(new Item(child));
#endif
            return list;
        }

#if CONTROL_CLI_UITK
        private static bool Shown(VisualElement ve) => ve.visible && ve.resolvedStyle.display != DisplayStyle.None;
#endif

        // 누를 수 있는 것의 종류 — uGUI 는 Selectable, UI Toolkit 은 컨트롤 요소. 창 훑기가 이것으로 누를 것을 고른다.
        public static string KindOf(Item item)
        {
#if CONTROL_CLI_UITK
            if (item.Ve != null)
            {
                // uGUI 에도 같은 이름(Button · Toggle · Slider)이 있어 UI Toolkit 쪽은 전체 이름으로 쓴다.
                var ve = item.Ve;
                var control = ve is UnityEngine.UIElements.Button || ve is UnityEngine.UIElements.Toggle || ve is RadioButton || ve is TextField || ve is DropdownField ||
                              ve is UnityEngine.UIElements.Slider || ve is SliderInt;
                return control ? ve.GetType().Name : null;
            }
#endif
            var selectable = item.Go.GetComponent<Selectable>();
            return selectable != null ? selectable.GetType().Name : null;
        }

        public static bool Interactable(Item item)
        {
#if CONTROL_CLI_UITK
            if (item.Ve != null) return item.Ve.enabledInHierarchy;
#endif
            var selectable = item.Go.GetComponent<Selectable>();
            return selectable != null && selectable.IsInteractable();
        }

        public static string TextOf(Item item)
        {
#if CONTROL_CLI_UITK
            if (item.Ve != null)
            {
                if (item.Ve is TextField field) return Masked(field.value ?? "", field.isPasswordField);
                return item.Ve is TextElement label ? label.text : null;
            }
#endif
            var go = item.Go;
            var input = go.GetComponent<InputField>();
            if (input != null) return Masked(input.text, input.inputType == InputField.InputType.Password);
#if CONTROL_CLI_TMP
            var tmpInput = go.GetComponent<TMPro.TMP_InputField>();
            if (tmpInput != null) return Masked(tmpInput.text, tmpInput.inputType == TMPro.TMP_InputField.InputType.Password);
#endif
            var text = go.GetComponent<Text>();
            if (text != null) return text.text;
#if CONTROL_CLI_TMP
            // TMP 입력칸은 글자 칸 끝에 caret 자리용 U+200B 를 붙인다 — 화면에 보이는 글자만 돌려준다.
            var tmp = go.GetComponent<TMPro.TMP_Text>();
            if (tmp != null) return (tmp.text ?? "").TrimEnd((char)0x200B);
#endif
            return null;
        }

        // 비밀번호는 글자를 가리되 비었는지는 보이게 한다 — 「입력 안 됨」을 케이스가 확인할 수 있어야 한다.
        private static string Masked(string text, bool password) => password && text.Length > 0 ? "***" : text;

        // 주소는 이름(하나뿐일 때) 또는 / 로 시작하는 경로다. 같은 이름 형제는 경로 칸에 [순번](0부터)을 붙인다.
        // 이름이 겹치면 고르지 않고 알린다 — 엉뚱한 것을 누르면 케이스가 틀린 곳에서 통과한다.
        public static Item Find(string target, out string problem) => Find(target, out problem, out _);

        // missing 은 「켜진 것 중에 없다」 — 기다리기가 되풀이할 수 있는 실패다. 겹침 · 빈 주소는 몇 번 해도 같다.
        public static Item Find(string target, out string problem, out bool missing)
        {
            problem = null;
            missing = false;
            if (string.IsNullOrEmpty(target))
            {
                problem = "주소가 비었습니다";
                return default;
            }
            if (target[0] == '/') return FindPath(target, out problem, out missing);
            Item found = default;
            var count = 0;
            var todo = new Stack<Item>(Roots());
            while (todo.Count > 0)
            {
                var item = todo.Pop();
                if (item.Name == target)
                {
                    if (count == 0) found = item;
                    count++;
                }
                foreach (var child in ChildrenOf(item)) todo.Push(child);
            }
            missing = count == 0;
            if (count == 0) problem = "켜진 오브젝트 중에 " + target + " 이 없습니다";
            else if (count > 1)
            {
                problem = target + " 이 " + count + "개라 하나를 고를 수 없습니다 — 경로로 주소를 씁니다";
                found = default;
            }
            return found;
        }

        private static Item FindPath(string path, out string problem, out bool missing)
        {
            problem = null;
            missing = false;
            var level = Roots();
            Item at = default;
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
                var same = level.FindAll(x => x.Name == name);
                if (same.Count == 0 || index >= same.Count)
                {
                    missing = true;
                    problem = "켜진 오브젝트 중에 " + path + " 이 없습니다 (" + part + " 에서 끊김)";
                    return default;
                }
                if (index < 0 && same.Count > 1)
                {
                    problem = path + " 의 " + name + " 이 " + same.Count + "개라 " + name + "[0] 처럼 순번을 붙입니다";
                    return default;
                }
                at = same[index < 0 ? 0 : index];
                level = ChildrenOf(at);
            }
            return at;
        }

        // Find 가 받는 꼴 그대로 — CLI 가 트리에서 셈한 경로와 같아야 한다.
        // 위로 올라가지 않고 트리를 내려가며 찾는다 — 요소의 부모 사슬에는 트리에 없는 속 칸(ScrollView 내용 칸 등)이 끼어 있다.
        public static string PathOf(Item item)
        {
            var parts = new List<string>();
            return Seek(Roots(), item, parts) ? "/" + string.Join("/", parts) : null;
        }

        public static string PathOf(Transform t) => PathOf(new Item(t.gameObject));

        private static bool Seek(List<Item> level, Item item, List<string> parts)
        {
            foreach (var x in level)
            {
                int index = 0, count = 0;
                foreach (var s in level)
                {
                    if (s.Name != x.Name) continue;
                    if (s.Is(x)) index = count;
                    count++;
                }
                parts.Add(count > 1 ? x.Name + "[" + index + "]" : x.Name);
                if (x.Is(item) || Seek(ChildrenOf(x), item, parts)) return true;
                parts.RemoveAt(parts.Count - 1);
            }
            return false;
        }

        // 누를 자리(화면 좌표 · 왼쪽 아래가 0,0). UI 는 사각형 가운데, 월드 오브젝트는 보이는 덩어리 가운데를 주 카메라로 비춘다.
        public static Vector2? ScreenPoint(Item item)
        {
#if CONTROL_CLI_UITK
            if (item.Ve != null) return UiToolkit.ScreenRect(item.Ve)?.center;
#endif
            var go = item.Go;
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

        // 화면 좌표(왼쪽 아래가 0,0)의 사각형. 화면 위 uGUI 가 아니면 null.
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

        public static IEnumerable<GameObject> RootObjects()
        {
            for (var i = 0; i < SceneManager.sceneCount; i++)
                foreach (var go in SceneManager.GetSceneAt(i).GetRootGameObjects())
                    yield return go;
            if (KeptScene.IsValid())
                foreach (var go in KeptScene.GetRootGameObjects())
                    if (go.name != "[ControlCli]") yield return go;
        }

        private static List<Item> Roots()
        {
            var list = new List<Item>();
            foreach (var go in RootObjects())
                if (go.activeInHierarchy) list.Add(new Item(go));
            return list;
        }
    }
}
