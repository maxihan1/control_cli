// 가짜 입력 드라이버 — 프레임마다 게임보다 먼저 일(FakeInput)을 한 걸음 돌리고 손가락 · 키 · 마우스 상태를 옛 Input · Input System · UI Toolkit 길로 내보낸다. 손가락 칸 10개도 여기
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.Scripting;

namespace ControlCli
{
    // 게임 · EventSystem 의 Update 보다 먼저 돌아야 같은 프레임에 가짜 입력이 보인다.
    [DefaultExecutionOrder(-32000), Preserve]
    public sealed class FakeTouches : MonoBehaviour
    {
        // 진짜 손가락 번호(0~9)와 겹치지 않게 10~19 를 쓴다. UI Toolkit 은 터치 손가락을 0~19 만 받아(PointerId.touchPointerCount 20)
        // 그보다 크면 EventSystem 의 PanelRaycaster 가 IndexOutOfRange 를 던져 uGUI 까지 아무것도 안 눌린다(샘플 실기기 2026-11-03).
        public const int FirstFinger = 10;
        private const int Count = 10;

        private sealed class Finger
        {
            // 일이 정한 눌림 · 자리(Down · Next)와 내보낸 눌림 · 자리(Shown — Began 을 냈고 아직 Ended · Canceled 를 안 냄 · Position)
            public bool Down, Shown, Cancel;
            public Vector2 Next, Position;
            public int Taps;
        }

        private static readonly Finger[] Slots = Make();
        // 이번 프레임 터치 — 누른 동안(Stationary 포함)과 뗀 프레임, 번호 차례.
        private static readonly Touch[] Live = new Touch[Count];
        private static int _live;

        private static Finger[] Make()
        {
            var slots = new Finger[Count];
            for (var i = 0; i < Count; i++) slots[i] = new Finger();
            return slots;
        }

        private static Finger Slot(int finger) => finger >= FirstFinger && finger < FirstFinger + Count ? Slots[finger - FirstFinger] : null;

        // 비어 있는 가장 작은 번호 — 다 눌렸으면 -1. 뗀 손가락은 Ended 를 내보낸 뒤에 빈다.
        public static int Free()
        {
            for (var i = 0; i < Count; i++)
                if (!Slots[i].Down && !Slots[i].Shown) return FirstFinger + i;
            return -1;
        }

        public static bool IsDown(int finger) => Slot(finger)?.Down == true;

        // 일 · 명령이 부른다 — 다음 내보내기에 실린다.
        internal static void Press(int finger, Vector2 at, int taps)
        {
            var s = Slot(finger);
            s.Down = true;
            s.Next = at;
            s.Taps = taps;
        }

        internal static void Move(int finger, Vector2 to) => Slot(finger).Next = to;
        internal static void Release(int finger) => Slot(finger).Down = false;

        // 거둘 때 — 내보낸 손가락은 Canceled 로 떼 EventSystem 이 눌림에 갇히지 않게, 아직 안 내보낸 것은 그냥 지운다.
        internal static void CancelAll()
        {
            foreach (var s in Slots)
            {
                s.Cancel = s.Shown;
                s.Down = false;
            }
        }

        // 옛 Input 을 끈 게임(Input System 만)은 UnityEngine.Input 을 부르면 던진다 — 가짜 터치만 센다.
#if ENABLE_LEGACY_INPUT_MANAGER
        private static int RealCount => UnityEngine.Input.touchCount;
#else
        private const int RealCount = 0;
#endif

        public static int TouchCount => RealCount + _live;

        public static Touch GetTouch(int index) =>
#if ENABLE_LEGACY_INPUT_MANAGER
            index < RealCount ? UnityEngine.Input.GetTouch(index) :
#endif
            Live[index - RealCount];

        // 진짜 폰처럼 simulateMouseWithTouches 가 켜져 있으면 가장 작은 번호 손가락(Live[0])을 마우스 왼쪽 단추로도 비춘다 — 마우스 API 로 터치를 읽는 게임용.
        // 뗀 프레임에는 GetMouseButtonUp 만 참이다(Unity 와 같게).
        private static bool Ended(TouchPhase p) => p == TouchPhase.Ended || p == TouchPhase.Canceled;
        public static bool MouseHeld => _live > 0 && !Ended(Live[0].phase);
        public static bool MouseDown => _live > 0 && Live[0].phase == TouchPhase.Began;
        public static bool MouseUp => _live > 0 && Ended(Live[0].phase);
        public static Vector2? MousePosition => _live > 0 ? Live[0].position : (Vector2?)null;

        private void Update()
        {
            FakeInput.Step();
            FakeKeys.Tick();
            FakeMouse.Tick();
            Fingers();
#if CONTROL_CLI_INPUTSYSTEM && ENABLE_INPUT_SYSTEM
            FakeInputSystem.Publish();
#endif
#if CONTROL_CLI_UITK
            if (UiToolkit.Direct) UiToolkit.SendMouse();
#endif
            // 장면이 바뀌면 EventSystem 이 새로 생기므로 매 프레임 확인한다.
            var events = EventSystem.current;
            var module = events != null ? events.currentInputModule : null;
            if (module != null && !(module.inputOverride is FakeBaseInput))
                module.inputOverride = module.gameObject.AddComponent<FakeBaseInput>();
            // PC 는 창 초점이 없으면 uGUI 입력 모듈이 입력을 버린다 — 가짜 입력이 있는 동안 EventSystem 에 초점을 다시 알린다.
            if ((_live > 0 || FakeMouse.Active || FakeKeys.Any) && events != null && !events.isFocused && !Application.isMobilePlatform) Focus?.Invoke(events, Focused);
        }

        // 칸마다 이번 프레임 phase 를 셈해 옛 Input 이 읽을 터치로 두고, 바뀐 것(Stationary 밖)만 Input System · UI Toolkit 직접 길로 보낸다.
        private static void Fingers()
        {
            _live = 0;
            for (var i = 0; i < Count; i++)
            {
                var s = Slots[i];
                var delta = s.Next - s.Position;
                TouchPhase phase;
                if (s.Down && !s.Shown)
                {
                    phase = TouchPhase.Began;
                    delta = Vector2.zero;
                    s.Shown = true;
                }
                else if (s.Shown && !s.Down)
                {
                    phase = s.Cancel ? TouchPhase.Canceled : TouchPhase.Ended;
                    s.Shown = s.Cancel = false;
                }
                else if (s.Shown) phase = delta == Vector2.zero ? TouchPhase.Stationary : TouchPhase.Moved;
                else continue;
                s.Position = s.Next;
                var touch = new Touch { fingerId = FirstFinger + i, position = s.Position, rawPosition = s.Position, deltaPosition = delta, phase = phase, tapCount = s.Taps, pressure = 1, maximumPossiblePressure = 1, type = TouchType.Direct };
                Live[_live++] = touch;
                if (phase == TouchPhase.Stationary) continue;
#if CONTROL_CLI_INPUTSYSTEM && ENABLE_INPUT_SYSTEM
                FakeInputSystem.Send(touch.fingerId, touch.position, delta, phase);
#endif
#if CONTROL_CLI_UITK
                if (UiToolkit.Direct) UiToolkit.Send(touch);
#endif
            }
        }

        private static readonly object[] Focused = { true };
        private static readonly System.Reflection.MethodInfo Focus =
            typeof(EventSystem).GetMethod("OnApplicationFocus", System.Reflection.BindingFlags.Instance | System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Public);
    }

    // UI 는 게임 코드가 아니라 입력 모듈이 터치 · 마우스를 읽으므로 inputOverride 로 같은 가짜 입력을 넣는다.
    [Preserve]
    public sealed class FakeBaseInput : BaseInput
    {
        public override int touchCount => FakeTouches.TouchCount;
        public override Touch GetTouch(int index) => FakeTouches.GetTouch(index);
        public override bool touchSupported => true;
        // 가짜 마우스 — 폰에서도 hover · 바퀴 · 단추가 uGUI 마우스 길에 닿게 마우스가 있다고 답한다.
        public override bool mousePresent => FakeMouse.Active || base.mousePresent;
        public override Vector2 mousePosition => FakeMouse.Active ? FakeMouse.Position : base.mousePosition;
        public override Vector2 mouseScrollDelta => base.mouseScrollDelta + FakeMouse.Scroll;
        public override bool GetMouseButton(int button) => base.GetMouseButton(button) || FakeKeys.Held(FakeKeys.MouseKey(button));
        public override bool GetMouseButtonDown(int button) => base.GetMouseButtonDown(button) || FakeKeys.Down(FakeKeys.MouseKey(button));
        public override bool GetMouseButtonUp(int button) => base.GetMouseButtonUp(button) || FakeKeys.Up(FakeKeys.MouseKey(button));
    }
}
