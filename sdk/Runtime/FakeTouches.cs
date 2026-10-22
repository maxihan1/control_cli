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

        private static readonly Queue<(Vector2 position, TouchPhase phase)> Pending = new Queue<(Vector2, TouchPhase)>();
        private static Touch? _current;

        public static void Tap(Vector2 position)
        {
            Pending.Enqueue((position, TouchPhase.Began));
            Pending.Enqueue((position, TouchPhase.Ended));
        }

        public static int TouchCount => UnityEngine.Input.touchCount + (_current.HasValue ? 1 : 0);

        public static Touch GetTouch(int index) =>
            index < UnityEngine.Input.touchCount ? UnityEngine.Input.GetTouch(index) : _current.GetValueOrDefault();

        private void Update()
        {
            _current = null;
            if (Pending.Count > 0)
            {
                var (position, phase) = Pending.Dequeue();
                _current = new Touch { fingerId = FingerId, position = position, rawPosition = position, phase = phase, tapCount = 1, pressure = 1, maximumPossiblePressure = 1, type = TouchType.Direct };
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
