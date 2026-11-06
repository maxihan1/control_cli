// 바깥 명령이 옮긴 가짜 마우스 — 자리 · 이번 프레임 이동량 · 바퀴. 단추는 FakeKeys 의 Mouse0~4
using UnityEngine;

namespace ControlCli
{
    public static class FakeMouse
    {
        // mouse-move · 자리를 준 scroll 이 켜고 input-reset 이 끈다 — 꺼져 있으면 진짜 마우스 그대로.
        public static bool Active { get; private set; }
        public static Vector2 Position { get; private set; }
        // 이번 프레임 이동량 · 바퀴 — 옛 Input 축(Mouse X · Y · ScrollWheel)과 Input System Mouse 가 읽는다.
        public static Vector2 Delta { get; private set; }
        public static Vector2 Scroll { get; private set; }
        // 이번 프레임에 자리를 옮겼나 — UI Toolkit 직접 길 · Input System 이 바뀐 프레임에만 보낸다.
        public static bool Moved { get; private set; }

        private static Vector2? _next;
        private static Vector2 _scroll;
        // Reset 뒤 몇 번째 Tick 에 끄나 — 뗀 단추가 나가는 다음 프레임까지는 켜 둔다(uGUI · UI Toolkit 은 마우스가 꺼지면 뗌을 못 본다).
        private static int _offIn;

        internal static void MoveTo(Vector2 p) => _next = p;
        internal static void AddScroll(Vector2 d) => _scroll += d;

        // 드라이버(FakeTouches)가 프레임마다 일(FakeInput) 다음에 부른다.
        internal static void Tick()
        {
            if (_offIn > 0 && --_offIn == 0) Active = false;
            Moved = _next.HasValue;
            Delta = Moved && Active ? _next.Value - Position : Vector2.zero;
            if (Moved)
            {
                Position = _next.Value;
                Active = true;
            }
            _next = null;
            Scroll = _scroll;
            _scroll = Vector2.zero;
        }

        internal static void Reset()
        {
            _offIn = 2;
            _next = null;
            _scroll = Vector2.zero;
        }
    }
}
