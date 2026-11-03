// 새 Input System 을 쓰는 게임에 같은 가짜 터치 · 키를 장치 이벤트로 넣는다 — 폰은 Touchscreen, PC 는 Mouse, 키는 Keyboard
#if CONTROL_CLI_INPUTSYSTEM && ENABLE_INPUT_SYSTEM
using System;
using UnityEngine;
using UnityEngine.InputSystem;
using UnityEngine.InputSystem.LowLevel;
using InputTouchPhase = UnityEngine.InputSystem.TouchPhase;

namespace ControlCli
{
    internal static class FakeInputSystem
    {
        private static Touchscreen _screen;
        private static Mouse _mouse;
        private static Keyboard _keyboard;
        private static uint _queuedAt;
        private static bool _queued;

        // 넣은 이벤트는 다음 Input System 업데이트(보통 다음 프레임 처음, FixedUpdate 처리 게임이면 다음 FixedUpdate)에 처리된다 — 그 전까지 바쁘다.
        public static bool Waiting => _queued && InputState.updateCount <= _queuedAt;

        // 폰에는 진짜 장치가 늘 있다 — 새로 만든 장치는 PlayerInput 짝짓기 밖이라 있는 것부터 쓴다.
        private static T Device<T>(ref T kept, T current) where T : InputDevice
        {
            if (kept == null || !kept.added) kept = current != null ? current : InputSystem.AddDevice<T>();
            return kept;
        }

        public static void Send(int fingerId, Vector2 position, Vector2 delta, UnityEngine.TouchPhase phase)
        {
            // PC 게임은 마우스로 읽는다 — Touchscreen 까지 넣으면 UI 입력 모듈이 두 번 누른다.
            if (!Application.isMobilePlatform)
            {
                var down = phase == UnityEngine.TouchPhase.Began || phase == UnityEngine.TouchPhase.Moved || phase == UnityEngine.TouchPhase.Stationary;
                InputSystem.QueueStateEvent(Device(ref _mouse, Mouse.current), new MouseState { position = position, delta = delta }.WithButton(MouseButton.Left, down));
            }
            else
                InputSystem.QueueStateEvent(Device(ref _screen, Touchscreen.current), new TouchState
                {
                    touchId = fingerId,
                    phase = Map(phase),
                    position = position,
                    delta = delta,
                    pressure = 1,
                    tapCount = 1,
                });
            Queued();
        }

        public static void Key(KeyCode code, bool down)
        {
            if (!TryKey(code, out var key)) return;
            InputSystem.QueueStateEvent(Device(ref _keyboard, Keyboard.current), down ? new KeyboardState(key) : new KeyboardState());
            Queued();
        }

        private static void Queued()
        {
            _queuedAt = InputState.updateCount;
            _queued = true;
        }

        // KeyCode 와 Key 는 이름이 거의 같다 — 다른 것만 짝짓는다(Alpha1 → Digit1 · Return → Enter · Keypad1 → Numpad1 · LeftControl → LeftCtrl).
        private static bool TryKey(KeyCode code, out Key key)
        {
            var name = code.ToString();
            if (name.StartsWith("Alpha")) name = "Digit" + name.Substring(5);
            else if (name.StartsWith("Keypad")) name = "Numpad" + name.Substring(6);
            else if (name == "Return") name = "Enter";
            else if (name.EndsWith("Control")) name = name.Replace("Control", "Ctrl");
            else if (name == "BackQuote") name = "Backquote";
            return Enum.TryParse(name, out key) && key != UnityEngine.InputSystem.Key.None;
        }

        // 두 TouchPhase 는 숫자가 다르다(옛 Began 0 · 새 Began 1) — 캐스트하지 않고 짝짓는다.
        private static InputTouchPhase Map(UnityEngine.TouchPhase phase)
        {
            switch (phase)
            {
                case UnityEngine.TouchPhase.Began: return InputTouchPhase.Began;
                case UnityEngine.TouchPhase.Moved: return InputTouchPhase.Moved;
                case UnityEngine.TouchPhase.Stationary: return InputTouchPhase.Stationary;
                case UnityEngine.TouchPhase.Ended: return InputTouchPhase.Ended;
                default: return InputTouchPhase.Canceled;
            }
        }
    }
}
#endif
