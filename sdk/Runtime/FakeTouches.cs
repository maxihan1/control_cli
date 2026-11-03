// 바깥 명령이 만든 가짜 터치를 프레임마다 하나씩 내보내고 UI 입력 모듈에도 같은 터치를 먹인다
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.Scripting;

namespace ControlCli
{
    // 게임 · EventSystem 의 Update 보다 먼저 돌아야 같은 프레임에 가짜 터치가 보인다.
    [DefaultExecutionOrder(-32000), Preserve]
    public sealed class FakeTouches : MonoBehaviour
    {
        // 진짜 손가락 번호(0~9)와 겹치지 않게 큰 번호를 쓴다.
        private const int FingerId = 99;
        // 끌기를 몇 프레임에 나눠 움직이나 — EventSystem 의 끌기 문턱을 넘고 끌기 처리기가 중간 자리를 받게 한다.
        private const int DragSteps = 10;

        private static readonly Queue<(Vector2 position, TouchPhase phase)> Pending = new Queue<(Vector2, TouchPhase)>();
        private static Touch? _current;
        private static Vector2 _lastPosition;
        // 내보낸 Began 뒤 아직 Ended 가 안 나갔나 — 거둘 때 손가락을 떼 줘야 EventSystem 이 눌림에 갇히지 않는다.
        private static bool _down;

        public static void Tap(Vector2 position)
        {
            Pending.Enqueue((position, TouchPhase.Began));
            Pending.Enqueue((position, TouchPhase.Ended));
        }

        public static void Drag(Vector2 from, Vector2 to)
        {
            Pending.Enqueue((from, TouchPhase.Began));
            for (var i = 1; i <= DragSteps; i++) Pending.Enqueue((Vector2.Lerp(from, to, i / (float)DragSteps), TouchPhase.Moved));
            Pending.Enqueue((to, TouchPhase.Ended));
        }

        // 답할 곳이 사라진 터치(시간 초과)는 나머지를 버리고, 누른 채면 그 자리에서 손가락을 뗀다.
        public static void Cancel()
        {
            Pending.Clear();
            if (_down) Pending.Enqueue((_lastPosition, TouchPhase.Canceled));
        }

        // 내보낼 터치가 남았거나 이번 프레임에 터치를 내보냈거나 Input System 이 아직 안 받았으면 바쁘다 — 명령 답을 그 뒤로 미룬다.
        public static bool Idle => Pending.Count == 0 && !_current.HasValue
#if CONTROL_CLI_INPUTSYSTEM && ENABLE_INPUT_SYSTEM
            && !FakeInputSystem.Waiting
#endif
            ;

        // 옛 Input 을 끈 게임(Input System 만)은 UnityEngine.Input 을 부르면 던진다 — 가짜 터치만 센다.
#if ENABLE_LEGACY_INPUT_MANAGER
        private static int RealCount => UnityEngine.Input.touchCount;
#else
        private const int RealCount = 0;
#endif

        public static int TouchCount => RealCount + (_current.HasValue ? 1 : 0);

        public static Touch GetTouch(int index) =>
#if ENABLE_LEGACY_INPUT_MANAGER
            index < RealCount ? UnityEngine.Input.GetTouch(index) :
#endif
            _current.GetValueOrDefault();

        // 진짜 폰처럼 simulateMouseWithTouches 가 켜져 있으면 가짜 손가락을 마우스 왼쪽 단추로도 비춘다 — 마우스 API 로 터치를 읽는 게임용.
        // 뗀 프레임에는 GetMouseButtonUp 만 참이다(Unity 와 같게).
        public static bool MouseHeld => _down;
        public static bool MouseDown => _current.HasValue && _current.Value.phase == TouchPhase.Began;
        public static bool MouseUp => _current.HasValue && (_current.Value.phase == TouchPhase.Ended || _current.Value.phase == TouchPhase.Canceled);
        public static Vector2? MousePosition => _down || _current.HasValue ? _lastPosition : (Vector2?)null;

        private void Update()
        {
            _current = null;
            if (Pending.Count > 0)
            {
                var (position, phase) = Pending.Dequeue();
                var delta = phase == TouchPhase.Began ? Vector2.zero : position - _lastPosition;
                _lastPosition = position;
                _down = phase == TouchPhase.Began || phase == TouchPhase.Moved || phase == TouchPhase.Stationary;
                _current = new Touch { fingerId = FingerId, position = position, rawPosition = position, deltaPosition = delta, phase = phase, tapCount = 1, pressure = 1, maximumPossiblePressure = 1, type = TouchType.Direct };
#if CONTROL_CLI_INPUTSYSTEM && ENABLE_INPUT_SYSTEM
                FakeInputSystem.Send(FingerId, position, delta, phase);
#endif
            }
            // 장면이 바뀌면 EventSystem 이 새로 생기므로 매 프레임 확인한다.
            var module = EventSystem.current != null ? EventSystem.current.currentInputModule : null;
            if (module != null && !(module.inputOverride is FakeBaseInput))
                module.inputOverride = module.gameObject.AddComponent<FakeBaseInput>();
        }
    }

    // UI 는 게임 코드가 아니라 입력 모듈이 터치를 읽으므로 inputOverride 로 같은 가짜 터치를 넣는다.
    [Preserve]
    public sealed class FakeBaseInput : BaseInput
    {
        public override int touchCount => FakeTouches.TouchCount;
        public override Touch GetTouch(int index) => FakeTouches.GetTouch(index);
        public override bool touchSupported => true;
    }
}
