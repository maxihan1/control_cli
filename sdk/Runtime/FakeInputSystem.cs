// 새 Input System 을 쓰는 게임에 같은 가짜 터치를 Touchscreen 장치 이벤트로 넣는다(InputSystemUIInputModule · EnhancedTouch · Touchscreen.current 가 같이 본다)
#if CONTROL_CLI_INPUTSYSTEM && ENABLE_INPUT_SYSTEM
using UnityEngine;
using UnityEngine.InputSystem;
using UnityEngine.InputSystem.LowLevel;
using InputTouchPhase = UnityEngine.InputSystem.TouchPhase;

namespace ControlCli
{
    internal static class FakeInputSystem
    {
        private static Touchscreen _screen;
        private static uint _queuedAt;
        private static bool _queued;

        // 넣은 이벤트는 다음 Input System 업데이트(보통 다음 프레임 처음, FixedUpdate 처리 게임이면 다음 FixedUpdate)에 처리된다 — 그 전까지 바쁘다.
        public static bool Waiting => _queued && InputState.updateCount <= _queuedAt;

        public static void Send(int fingerId, Vector2 position, Vector2 delta, UnityEngine.TouchPhase phase)
        {
            // 폰에는 진짜 Touchscreen 이 늘 있다 — 새로 만든 장치는 PlayerInput 짝짓기 밖이라 그것부터 쓴다.
            if (_screen == null || !_screen.added) _screen = Touchscreen.current ?? InputSystem.AddDevice<Touchscreen>();
            InputSystem.QueueStateEvent(_screen, new TouchState
            {
                touchId = fingerId,
                phase = Map(phase),
                position = position,
                delta = delta,
                pressure = 1,
                tapCount = 1,
            });
            _queuedAt = InputState.updateCount;
            _queued = true;
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
