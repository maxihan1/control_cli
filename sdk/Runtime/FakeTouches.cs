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

        // 내보낼 터치가 남았거나 이번 프레임에 터치를 내보냈으면 아직 바쁘다 — 명령 답을 그 뒤로 미룬다.
        public static bool Idle => Pending.Count == 0 && !_current.HasValue;

        public static int TouchCount => UnityEngine.Input.touchCount + (_current.HasValue ? 1 : 0);

        public static Touch GetTouch(int index) =>
            index < UnityEngine.Input.touchCount ? UnityEngine.Input.GetTouch(index) : _current.GetValueOrDefault();

        private void Update()
        {
            _current = null;
            if (Pending.Count > 0)
            {
                var (position, phase) = Pending.Dequeue();
                var delta = phase == TouchPhase.Began ? Vector2.zero : position - _lastPosition;
                _lastPosition = position;
                _current = new Touch { fingerId = FingerId, position = position, rawPosition = position, deltaPosition = delta, phase = phase, tapCount = 1, pressure = 1, maximumPossiblePressure = 1, type = TouchType.Direct };
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
