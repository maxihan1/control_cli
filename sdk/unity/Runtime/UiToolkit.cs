// UI Toolkit(UIDocument) 요소의 화면 자리를 셈하고, EventSystem 이 없는 옛 Input 게임에는 가짜 터치 · 마우스를 panel 에 Pointer · Wheel 이벤트로 보낸다
#if CONTROL_CLI_UITK
using System.Collections.Generic;
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

        // 누른 panel — 뗄 때까지 같은 panel 로 보낸다(Unity 기본 이벤트 시스템의 soft capture 와 같게). 손가락 · 마우스마다 따로.
        private static readonly Dictionary<int, IPanel> Pressed = new Dictionary<int, IPanel>();
        private static int _mouseButtons;

        private static Vector2 Flip(Vector2 p) => new Vector2(p.x, Screen.height - p.y);

        private static IPanel Target(int pointer, Vector2 flipped, bool begin, bool end)
        {
            Pressed.TryGetValue(pointer, out var pressed);
            var panel = begin || pressed == null ? Topmost(flipped) : pressed;
            if (end || panel == null) Pressed.Remove(pointer);
            else Pressed[pointer] = panel;
            return panel;
        }

        // Unity 기본 이벤트 시스템과 같은 차례 — 위아래 뒤집기 → panel 좌표 → 그 좌표의 Touch 로 Pointer 이벤트. 손가락 번호가 pointerId 가 된다.
        public static void Send(Touch touch)
        {
            var flipped = Flip(touch.position);
            var panel = Target(touch.fingerId, flipped, touch.phase == TouchPhase.Began, touch.phase == TouchPhase.Ended || touch.phase == TouchPhase.Canceled);
            if (panel == null) return;
            var at = RuntimePanelUtils.ScreenToPanel(panel, flipped);
            var before = RuntimePanelUtils.ScreenToPanel(panel, flipped - new Vector2(touch.deltaPosition.x, -touch.deltaPosition.y));
            touch.position = at;
            touch.deltaPosition = at - before;
            using (var e = Pointer(touch)) panel.visualTree.SendEvent(e);
        }

        // 가짜 마우스 — 옮긴 프레임에 PointerMove, 단추(키 Mouse0~2)가 바뀐 프레임에 PointerDown/Up, 바퀴는 WheelEvent. IMGUI Event 로 만들어 기본 이벤트 시스템과 같은 꼴(마우스 pointerId).
        public static void SendMouse()
        {
            if (!FakeMouse.Active) return;
            var flipped = Flip(FakeMouse.Position);
            var buttons = 0;
            for (var b = 0; b < 3; b++)
                if (FakeKeys.Held(KeyCode.Mouse0 + b)) buttons |= 1 << b;
            if (FakeMouse.Moved) Mouse(EventType.MouseMove, 0, flipped, Vector2.zero, buttons);
            for (var b = 0; b < 3; b++)
            {
                var bit = 1 << b;
                if ((buttons & bit) != 0 && (_mouseButtons & bit) == 0) Mouse(EventType.MouseDown, b, flipped, Vector2.zero, buttons);
                if ((buttons & bit) == 0 && (_mouseButtons & bit) != 0) Mouse(EventType.MouseUp, b, flipped, Vector2.zero, buttons);
            }
            _mouseButtons = buttons;
            // IMGUI 바퀴는 아래가 + 라 옛 Input 꼴(위가 +)을 뒤집는다.
            if (FakeMouse.Scroll != Vector2.zero) Mouse(EventType.ScrollWheel, 0, flipped, new Vector2(FakeMouse.Scroll.x, -FakeMouse.Scroll.y), buttons);
        }

        // 단추를 누른 동안(이번 프레임에 뗀 단추도 — _mouseButtons 는 지난 프레임 단추)은 누른 panel 을 붙잡고 마지막 단추를 뗄 때 놓는다
        // — 빈 곳에서 떼도 누른 panel 이 PointerUp 을 받는다. 안 누른 hover 는 프레임마다 맨 앞 panel 을 다시 고른다.
        private static void Mouse(EventType type, int button, Vector2 flipped, Vector2 delta, int buttons)
        {
            var panel = Target(PointerId.mousePointerId, flipped, type == EventType.MouseDown || (buttons | _mouseButtons) == 0, type == EventType.MouseUp && buttons == 0);
            if (panel == null) return;
            var e = new Event { type = type, button = button, delta = delta, mousePosition = RuntimePanelUtils.ScreenToPanel(panel, flipped) };
            EventBase pooled;
            switch (type)
            {
                case EventType.MouseMove: pooled = PointerMoveEvent.GetPooled(e); break;
                case EventType.MouseDown: pooled = PointerDownEvent.GetPooled(e); break;
                case EventType.MouseUp: pooled = PointerUpEvent.GetPooled(e); break;
                default: pooled = WheelEvent.GetPooled(e); break;
            }
            using (pooled) panel.visualTree.SendEvent(pooled);
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
            var flipped = Flip(screen);
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
