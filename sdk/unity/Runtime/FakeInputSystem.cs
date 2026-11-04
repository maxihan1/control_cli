// 새 Input System 을 쓰는 게임에 같은 가짜 입력을 장치 이벤트로 넣는다 — 폰은 손가락마다 Touchscreen, PC 는 마우스 손가락을 Mouse 로, 키는 Keyboard · Gamepad, 기울기는 Accelerometer
#if CONTROL_CLI_INPUTSYSTEM && ENABLE_INPUT_SYSTEM
using System;
using System.Collections.Generic;
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
        private static Gamepad _gamepad;
        private static Accelerometer _accelerometer;
        private static uint _queuedAt;
        private static bool _queued;
        // PC 에서 Mouse 에 실은 손가락 — 아무 손가락도 안 실렸을 때 처음 누른 것, 뗄 때까지. 나머지 손가락은 Touchscreen.
        private static int _mouseFinger = -1;
        private static bool _fingerDown;
        private static Vector2 _mouseAt, _sentAt;
        private static int _sentButtons;
        private static bool _mouseDirty, _keysSent, _padSent;
        private static Vector3? _sentTilt;

        // 넣은 이벤트는 다음 Input System 업데이트(보통 다음 프레임 처음, FixedUpdate 처리 게임이면 다음 FixedUpdate)에 처리된다 — 그 전까지 바쁘다.
        public static bool Waiting => _queued && InputState.updateCount <= _queuedAt;

        // 폰에는 진짜 장치가 늘 있다 — 새로 만든 장치는 PlayerInput 짝짓기 밖이라 있는 것부터 쓴다.
        private static T Device<T>(ref T kept, T current) where T : InputDevice
        {
            if (kept == null || !kept.added) kept = current != null && current.added ? current : InputSystem.AddDevice<T>();
            return kept;
        }

        public static void Send(int finger, Vector2 position, Vector2 delta, UnityEngine.TouchPhase phase)
        {
            var end = phase == UnityEngine.TouchPhase.Ended || phase == UnityEngine.TouchPhase.Canceled;
            // PC 게임은 마우스로 읽는다 — 같은 손가락을 Touchscreen 에도 넣으면 UI 입력 모듈이 두 번 누른다. Mouse 는 Publish 가 가짜 마우스 · 단추와 한 상태로 보낸다.
            if (!Application.isMobilePlatform && (_mouseFinger == finger || (_mouseFinger < 0 && phase == UnityEngine.TouchPhase.Began)))
            {
                _mouseFinger = end ? -1 : finger;
                _fingerDown = !end;
                _mouseAt = position;
                _mouseDirty = true;
                return;
            }
            InputSystem.QueueStateEvent(Device(ref _screen, Touchscreen.current), new TouchState
            {
                touchId = finger,
                phase = Map(phase),
                position = position,
                delta = delta,
                pressure = 1,
                tapCount = 1,
            });
            Queued();
        }

        // 드라이버가 프레임마다 손가락 다음에 부른다 — 마우스 · 키보드 · 게임패드 · 가속도를 바뀐 프레임에만 한 상태로.
        public static void Publish()
        {
            PublishMouse();
            if (FakeKeys.Changed) PublishKeys();
            PublishTilt();
        }

        private static void PublishMouse()
        {
            if (FakeMouse.Moved)
            {
                _mouseAt = FakeMouse.Position;
                _mouseDirty = true;
            }
            var buttons = (_fingerDown || FakeKeys.Held(KeyCode.Mouse0) ? 1 : 0) | (FakeKeys.Held(KeyCode.Mouse1) ? 2 : 0) | (FakeKeys.Held(KeyCode.Mouse2) ? 4 : 0)
                | (FakeKeys.Held(KeyCode.Mouse3) ? 8 : 0) | (FakeKeys.Held(KeyCode.Mouse4) ? 16 : 0);
            // 가짜 마우스 · 마우스 손가락 · 단추를 안 쓰면 진짜 마우스를 건드리지 않는다.
            if (!_mouseDirty && buttons == _sentButtons && FakeMouse.Scroll == Vector2.zero) return;
            var state = new MouseState { position = _mouseAt, delta = _mouseAt - _sentAt, scroll = FakeMouse.Scroll }
                .WithButton(MouseButton.Left, (buttons & 1) != 0)
                .WithButton(MouseButton.Right, (buttons & 2) != 0)
                .WithButton(MouseButton.Middle, (buttons & 4) != 0)
                .WithButton(MouseButton.Forward, (buttons & 8) != 0)
                .WithButton(MouseButton.Back, (buttons & 16) != 0);
            InputSystem.QueueStateEvent(Device(ref _mouse, Mouse.current), state);
            Queued();
            _sentAt = _mouseAt;
            _sentButtons = buttons;
            _mouseDirty = false;
        }

        // 누른 키 전부를 한 상태로 — 키보드 키는 Keyboard, JoystickButton 은 Gamepad. 한 번이라도 보낸 장치는 다 뗄 때도 보낸다.
        private static void PublishKeys()
        {
            var keys = new List<Key>();
            var pad = default(GamepadState);
            var padUsed = false;
            foreach (var kv in FakeKeys.All)
            {
                if (TryKey(kv.Key, out var key)) keys.Add(key);
                else padUsed |= Pad(kv.Key, kv.Value, ref pad);
            }
            if (keys.Count > 0 || _keysSent)
            {
                InputSystem.QueueStateEvent(Device(ref _keyboard, Keyboard.current), new KeyboardState(keys.ToArray()));
                _keysSent = keys.Count > 0;
                Queued();
            }
            if (padUsed || _padSent)
            {
                InputSystem.QueueStateEvent(Device(ref _gamepad, Gamepad.current), pad);
                _padSent = padUsed;
                Queued();
            }
        }

        // AltTester 와 같은 짝 — JoystickButton0~15 는 단추(6 · 7 은 방아쇠 값), 16~19 는 왼 스틱 x · y · 오른 스틱 x · y(값 = 세기).
        private static readonly GamepadButton[] Buttons =
        {
            GamepadButton.South, GamepadButton.East, GamepadButton.West, GamepadButton.North, GamepadButton.LeftShoulder, GamepadButton.RightShoulder,
            GamepadButton.LeftTrigger, GamepadButton.RightTrigger, GamepadButton.Select, GamepadButton.Start, GamepadButton.LeftStick, GamepadButton.RightStick,
            GamepadButton.DpadUp, GamepadButton.DpadDown, GamepadButton.DpadLeft, GamepadButton.DpadRight,
        };

        private static bool Pad(KeyCode code, float power, ref GamepadState pad)
        {
            var n = code - KeyCode.JoystickButton0;
            switch (n)
            {
                case 6: pad.leftTrigger = Mathf.Abs(power); return true;
                case 7: pad.rightTrigger = Mathf.Abs(power); return true;
                case 16: pad.leftStick.x = power; return true;
                case 17: pad.leftStick.y = power; return true;
                case 18: pad.rightStick.x = power; return true;
                case 19: pad.rightStick.y = power; return true;
            }
            if (n < 0 || n >= Buttons.Length) return false;
            pad = pad.WithButton(Buttons[n]);
            return true;
        }

        private static void PublishTilt()
        {
            var tilt = FakeInput.Tilt;
            if (tilt == _sentTilt) return;
            _sentTilt = tilt;
            // AccelerometerState 는 Input System 안(internal)이라 acceleration 칸 하나만 바꾸는 이벤트로 넣는다.
            InputSystem.QueueDeltaStateEvent(Accel().acceleration, tilt ?? Vector3.zero);
            Queued();
        }

        // 켜진 가속도 장치 — 폰의 것은 게임이 켜야 이벤트를 받아(꺼진 장치는 이벤트를 버린다) 꺼져 있으면 하나 더한다.
        private static Accelerometer Accel()
        {
            if (_accelerometer != null && _accelerometer.added) return _accelerometer;
            var current = Accelerometer.current;
            _accelerometer = current != null && current.added && current.enabled ? current : InputSystem.AddDevice<Accelerometer>();
            if (!_accelerometer.enabled) InputSystem.EnableDevice(_accelerometer);
            return _accelerometer;
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
            return Enum.TryParse(name, out key) && key != Key.None;
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
