// UI Toolkit(UIDocument) 요소의 화면 자리를 셈하고, EventSystem 이 없는 옛 Input 게임에는 가짜 터치를 panel 에 Pointer 이벤트로 보낸다
#if CONTROL_CLI_UITK
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.UIElements;

namespace ControlCli
{
    internal static class UiToolkit
    {
        // 화면 좌표(왼쪽 아래가 0,0)의 사각형 — worldBound 는 panel 좌표(왼쪽 위가 0,0 · panel 배율)다.
        public static Rect? ScreenRect(VisualElement ve)
        {
            if (ve.panel == null) return null;
            var bound = ve.worldBound;
            var a = ToScreen(ve.panel, new Vector2(bound.xMin, bound.yMin));
            var b = ToScreen(ve.panel, new Vector2(bound.xMax, bound.yMax));
            return Rect.MinMaxRect(Mathf.Min(a.x, b.x), Mathf.Min(a.y, b.y), Mathf.Max(a.x, b.x), Mathf.Max(a.y, b.y));
        }

        // ScreenToPanel 은 위아래를 뒤집은 화면 좌표를 받는 1차식(배율 · 화면 맞춤 여백)이다 — 두 점으로 거꾸로 푼다.
        private static Vector2 ToScreen(IPanel panel, Vector2 p)
        {
            var o = RuntimePanelUtils.ScreenToPanel(panel, Vector2.zero);
            var one = RuntimePanelUtils.ScreenToPanel(panel, Vector2.one);
            return new Vector2((p.x - o.x) / (one.x - o.x), Screen.height - (p.y - o.y) / (one.y - o.y));
        }

        // EventSystem 이 없으면 UI Toolkit 은 입력을 스스로 읽는다 — 옛 Input 은 UnityEngine.Input 을 바로 읽어 가짜 Input 을 못 본다.
        // Unity 6 에서 Input System 을 켠 게임은 그 길이 가짜 Touchscreen 을 보므로 보내지 않는다(보내면 두 번 눌린다).
        public static bool Direct =>
#if ENABLE_LEGACY_INPUT_MANAGER && !(UNITY_6000_0_OR_NEWER && CONTROL_CLI_INPUTSYSTEM && ENABLE_INPUT_SYSTEM)
            EventSystem.current == null;
#else
            false;
#endif

        // 누른 panel — 뗄 때까지 같은 panel 로 보낸다(Unity 기본 이벤트 시스템의 soft capture 와 같게).
        private static IPanel _pressed;

        // Unity 기본 이벤트 시스템과 같은 차례 — 위아래 뒤집기 → panel 좌표 → 그 좌표의 Touch 로 Pointer 이벤트.
        public static void Send(Touch touch)
        {
            var flipped = new Vector2(touch.position.x, Screen.height - touch.position.y);
            var panel = touch.phase == TouchPhase.Began || _pressed == null ? Topmost(flipped) : _pressed;
            _pressed = touch.phase == TouchPhase.Ended || touch.phase == TouchPhase.Canceled ? null : panel;
            if (panel == null) return;
            var at = RuntimePanelUtils.ScreenToPanel(panel, flipped);
            var before = RuntimePanelUtils.ScreenToPanel(panel, flipped - new Vector2(touch.deltaPosition.x, -touch.deltaPosition.y));
            touch.position = at;
            touch.deltaPosition = at - before;
            using (var e = Pointer(touch)) panel.visualTree.SendEvent(e);
        }

        private static EventBase Pointer(Touch touch)
        {
            switch (touch.phase)
            {
                case TouchPhase.Began: return PointerDownEvent.GetPooled(touch);
                case TouchPhase.Moved: return PointerMoveEvent.GetPooled(touch);
                case TouchPhase.Stationary: return PointerStationaryEvent.GetPooled(touch);
                case TouchPhase.Ended: return PointerUpEvent.GetPooled(touch);
                default: return PointerCancelEvent.GetPooled(touch);
            }
        }

        // 화면 자리(왼쪽 아래 0,0)에서 맨 앞 panel 이 고른 요소 — find-at 이 쓴다. 트리에 없는 속 칸일 수 있다(Select.At 이 조상으로 올린다).
        public static VisualElement Pick(Vector2 screen)
        {
            var flipped = new Vector2(screen.x, Screen.height - screen.y);
            var panel = Topmost(flipped);
            return panel?.Pick(RuntimePanelUtils.ScreenToPanel(panel, flipped));
        }

        // 그 자리에 요소가 있는 panel 중 맨 앞 — 정렬 순서가 큰 panel 이 위다.
        private static IPanel Topmost(Vector2 flipped)
        {
            IPanel best = null;
            var order = float.MinValue;
            foreach (var doc in Object.FindObjectsOfType<UIDocument>())
            {
                var panel = doc.rootVisualElement?.panel;
                if (panel == null || doc.panelSettings == null || doc.panelSettings.sortingOrder < order) continue;
                if (panel.Pick(RuntimePanelUtils.ScreenToPanel(panel, flipped)) == null) continue;
                best = panel;
                order = doc.panelSettings.sortingOrder;
            }
            return best;
        }
    }
}
#endif
