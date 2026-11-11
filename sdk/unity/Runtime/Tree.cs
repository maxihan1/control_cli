// 켜진 오브젝트 트리를 JSON 으로 쓰고, 주소(이름 · 경로 · 선택자 — Select.cs)로 하나를 찾는다 — 게임 오브젝트와 UI Toolkit 요소(UIDocument 아래)를 한 트리로 본다
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

        // 같은 것 가르기(선택자가 두 길로 닿을 때) — 게임 오브젝트 또는 요소 그 자체.
        public object Key =>
#if CONTROL_CLI_UITK
            Ve != null ? (object)Ve :
#endif
            Go;
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

        // 켜진 자식 — UIDocument 가 있는 오브젝트는 그 요소들도 자식이다. 트리 · 찾기 · 경로가 모두 이것 하나로 내려간다. all 이면 꺼진 것 · 숨은 요소도(inactive).
        public static List<Item> ChildrenOf(Item item, bool all = false)
        {
            var list = new List<Item>();
#if CONTROL_CLI_UITK
            if (item.Ve != null)
            {
                // 컨트롤(버튼 · 입력칸 …) 속은 내보내지 않는다 — 안쪽 요소는 컨트롤의 일부이고 비밀번호 칸 속 글자를 드러낼 수 있다.
                if (KindOf(item) == null)
                    foreach (var child in item.Ve.Children())
                        if (all || Shown(child)) list.Add(new Item(child));
                return list;
            }
#endif
            foreach (Transform child in item.Go.transform)
                if (all || child.gameObject.activeInHierarchy) list.Add(new Item(child.gameObject));
#if CONTROL_CLI_UITK
            var doc = item.Go.GetComponent<UIDocument>();
            if (doc != null && (all || doc.isActiveAndEnabled) && doc.rootVisualElement != null)
                foreach (var child in doc.rootVisualElement.Children())
                    if (all || Shown(child)) list.Add(new Item(child));
#endif
            return list;
        }

#if CONTROL_CLI_UITK
        private static bool Shown(VisualElement ve) => ve.visible && ve.resolvedStyle.display != DisplayStyle.None;
#endif

        // 줄(뿌리 → 그것)이 다 켜졌나 — inactive 로 찾은 것은 find 답에 active:false 로 알린다.
        public static bool Active(List<Item> trail)
        {
            foreach (var x in trail)
            {
#if CONTROL_CLI_UITK
                if (x.Ve != null)
                {
                    if (!Shown(x.Ve)) return false;
                    continue;
                }
#endif
                if (!x.Go.activeSelf) return false;
            }
            return true;
        }

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

        // 주소는 이름(하나뿐일 때) · / 로 시작하는 경로 · 선택자(//*[@tag=Player] — Select.cs)다. 같은 이름 형제는 경로 칸에 [순번](0부터)을 붙인다.
        // 여럿이 맞으면 고르지 않고 알린다 — 엉뚱한 것을 누르면 케이스가 틀린 곳에서 통과한다.
        public static Item Find(string target, out string problem) => Find(target, false, out problem, out _, out _);

        // missing 은 「켜진 것 중에 없다」 — 기다리기가 되풀이할 수 있는 실패다. 여럿 · 틀린 꼴 · 빈 주소는 몇 번 해도 같다.
        public static Item Find(string target, out string problem, out bool missing) => Find(target, false, out problem, out missing, out _);

        // all 은 꺼진 것도(inactive), trail 은 뿌리에서 그것까지의 줄(경로 · 켜짐을 셈한다).
        public static Item Find(string target, bool all, out string problem, out bool missing, out List<Item> trail)
        {
            trail = Select.Find(target, all, out problem, out missing);
            return trail == null ? default : trail[trail.Count - 1];
        }

        // Find 가 받는 꼴 그대로 — CLI 가 트리에서 셈한 경로와 같아야 한다.
        public static string PathOf(Item item)
        {
            var trail = TrailOf(item, false);
            return trail == null ? null : Select.PathOf(trail, false);
        }

        public static string PathOf(Transform t) => PathOf(new Item(t.gameObject));

        // 뿌리에서 그것까지의 줄 — 위로 올라가지 않고 트리를 내려가며 찾는다. 요소의 부모 사슬에는 트리에 없는 속 칸(ScrollView 내용 칸 등)이 끼어 있다.
        public static List<Item> TrailOf(Item item, bool all)
        {
            var trail = new List<Item>();
            return Seek(Roots(all), item, trail, all) ? trail : null;
        }

        private static bool Seek(List<Item> level, Item item, List<Item> trail, bool all)
        {
            foreach (var x in level)
            {
                trail.Add(x);
                if (x.Is(item) || Seek(ChildrenOf(x, all), item, trail, all)) return true;
                trail.RemoveAt(trail.Count - 1);
            }
            return false;
        }

        // 누를 자리(화면 좌표 · 왼쪽 아래가 0,0). UI 는 사각형 가운데, 월드 오브젝트는 보이는 덩어리 가운데를 주 카메라로 비춘다.
        // cam 은 월드 오브젝트를 비출 카메라(camera 칸) — 없으면 주 카메라. UI 는 Canvas · panel 이 제 카메라를 안다.
        public static Vector2? ScreenPoint(Item item, Camera cam = null)
        {
#if CONTROL_CLI_UITK
            if (item.Ve != null) return UiToolkit.ScreenRect(item.Ve)?.center;
#endif
            var go = item.Go;
            var rect = ScreenRect(go);
            if (rect != null) return rect.Value.center;
            if (cam == null) cam = Camera.main;
            if (cam == null) return null;
            var renderer = go.GetComponentInChildren<Renderer>();
            var world = renderer != null ? renderer.bounds.center : go.transform.position;
            var p = cam.WorldToScreenPoint(world);
            // 카메라 뒤는 화면에 없다.
            return p.z > 0 ? new Vector2(p.x, p.y) : (Vector2?)null;
        }

        // 화면 사각형(왼쪽 아래가 0,0) — 오브젝트 윤곽을 그릴 때. UI 는 제 사각형, 월드 오브젝트는 켜진 렌더러 bounds 를 합친 상자를 카메라로 비춘다.
        // 화면 밖으로 나간 만큼은 자르지 않는다. 렌더러가 없거나 다 카메라 뒤면 null.
        public static Rect? ScreenBox(Item item, Camera cam = null)
        {
#if CONTROL_CLI_UITK
            if (item.Ve != null) return UiToolkit.ScreenRect(item.Ve);
#endif
            var go = item.Go;
            var rect = ScreenRect(go);
            if (rect != null) return rect;
            if (cam == null) cam = Camera.main;
            if (cam == null) return null;
            // ponytail: 켜진 렌더러를 다 합친다 — 큰 파티클 · 그림자 판이 붙은 오브젝트는 사각형이 커진다. 문제면 ParticleSystemRenderer 를 뺀다.
            Bounds? box = null;
            foreach (var r in go.GetComponentsInChildren<Renderer>())
            {
                if (!r.enabled) continue;
                var b = box ?? r.bounds;
                b.Encapsulate(r.bounds);
                box = b;
            }
            return box == null ? (Rect?)null : Project(cam, box.Value);
        }

        // 상자 꼭짓점 8개를 비춘다. 카메라 앞뒤에 걸친 모서리는 near 면에서 자른 점을 쓴다 — 뒤 점을 그대로 비추면 화면 반대편으로 뒤집힌다.
        private static Rect? Project(Camera cam, Bounds b)
        {
            var corners = new Vector3[8];
            var depth = new float[8];
            for (var i = 0; i < 8; i++)
            {
                corners[i] = b.center + Vector3.Scale(b.extents, new Vector3((i & 1) == 0 ? -1 : 1, (i & 2) == 0 ? -1 : 1, (i & 4) == 0 ? -1 : 1));
                depth[i] = cam.WorldToScreenPoint(corners[i]).z;
            }
            var near = cam.nearClipPlane;
            var points = new List<Vector3>();
            for (var i = 0; i < 8; i++)
            {
                if (depth[i] >= near) points.Add(corners[i]);
                // 모서리는 번호가 한 비트만 다른 꼭짓점 둘 — 작은 번호 쪽에서 한 번씩 본다.
                for (var bit = 1; bit < 8; bit <<= 1)
                {
                    var j = i | bit;
                    if (j != i && (depth[i] >= near) != (depth[j] >= near))
                        points.Add(Vector3.Lerp(corners[i], corners[j], (depth[i] - near) / (depth[i] - depth[j])));
                }
            }
            if (points.Count == 0) return null;
            var min = new Vector2(float.MaxValue, float.MaxValue);
            var max = new Vector2(float.MinValue, float.MinValue);
            foreach (var w in points)
            {
                Vector2 p = cam.WorldToScreenPoint(w);
                min = Vector2.Min(min, p);
                max = Vector2.Max(max, p);
            }
            return Rect.MinMaxRect(min.x, min.y, max.x, max.y);
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
            {
                // 열리는 중인 장면(scene-load 뒤)은 GetRootGameObjects 가 던진다 — 다 열린 장면만 본다.
                var scene = SceneManager.GetSceneAt(i);
                if (!scene.isLoaded) continue;
                foreach (var go in scene.GetRootGameObjects())
                    yield return go;
            }
            if (KeptScene.IsValid())
                foreach (var go in KeptScene.GetRootGameObjects())
                    if (go.name != "[ControlCli]") yield return go;
        }

        public static List<Item> Roots(bool all = false)
        {
            var list = new List<Item>();
            foreach (var go in RootObjects())
                if (all || go.activeInHierarchy) list.Add(new Item(go));
            return list;
        }
    }
}
