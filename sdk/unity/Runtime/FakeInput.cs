// 바깥 입력 명령을 프레임마다 한 걸음 도는 일(iterator)로 돌린다 — 탭 · 끌기 · 길게 누르기 · 키 · 마우스 · 바퀴 · 기울기. 한 번에 일 하나, 다 돌면 명령에 답한다
using System.Collections;
using UnityEngine;

namespace ControlCli
{
    public static class FakeInput
    {
        // 명령 하나가 넘지 말아야 할 초 — SDK 답 한도 10초 · 팜 15초. 더 오래 누르기는 touch-down · key-down 뒤 touch-up · key-up.
        public const float LongestSeconds = 8;
        // 끌기 한 마디를 적어도 몇 프레임에 나누나 — EventSystem 의 끌기 문턱을 넘고 끌기 처리기가 중간 자리를 받게 한다.
        private const int MinSteps = 10;

        private static IEnumerator _job;

        // 기울기 — 옛 Input 감싸기 · Input System 이 읽는다. null 이면 진짜 값.
        public static Vector3? Tilt { get; private set; }

        // 도는 일이 없고 Input System 이 넣은 이벤트를 받았으면 한가하다 — 명령 답을 그때까지 미룬다. 눌러 둔 손가락 · 키는 바쁨이 아니다.
        public static bool Idle => _job == null
#if CONTROL_CLI_INPUTSYSTEM && ENABLE_INPUT_SYSTEM
            && !FakeInputSystem.Waiting
#endif
            ;

        public static void Run(IEnumerator job) => _job = job;

        // 드라이버(FakeTouches)가 프레임마다 맨 먼저 부른다.
        internal static void Step()
        {
            if (_job != null && !_job.MoveNext()) _job = null;
        }

        // 시간 초과로 거둘 때 · input-reset — 일을 멈추고 눌린 것을 다 뗀다(다음 프레임에 Canceled · 뗌이 나간다).
        public static void Reset()
        {
            _job = null;
            FakeTouches.CancelAll();
            FakeKeys.ReleaseAll();
            FakeMouse.Reset();
            Tilt = null;
        }

        // 바꾼 상태가 한 프레임 나가게 기다린다.
        public static IEnumerator Settle()
        {
            yield return null;
        }

        // count 번 눌렀다 뗀다 — 사이에 interval 초. tapCount 는 몇 번째인지(진짜 빠른 연타와 같게).
        public static IEnumerator Tap(int finger, Vector2 at, int count, float interval)
        {
            for (var i = 1; i <= count; i++)
            {
                if (i > 1)
                    for (var t = 0f; t < interval; t += Time.unscaledDeltaTime) yield return null;
                FakeTouches.Press(finger, at, i);
                yield return null;
                FakeTouches.Release(finger);
                yield return null;
            }
        }

        // 한 손가락이 점들을 차례로 지나고 끝에서 뗀다 — 점 사이마다 같은 시간(AltTester), 한 마디에 적어도 MinSteps 프레임.
        public static IEnumerator Path(int finger, Vector2[] points, float seconds)
        {
            FakeTouches.Press(finger, points[0], 1);
            yield return null;
            var each = points.Length > 1 ? seconds / (points.Length - 1) : 0;
            for (var i = 1; i < points.Length; i++)
            {
                var t = 0f;
                for (var k = 1; ; k++)
                {
                    t += Time.unscaledDeltaTime;
                    var f = Mathf.Min(1, Mathf.Min(k / (float)MinSteps, each > 0 ? t / each : 1));
                    FakeTouches.Move(finger, Vector2.Lerp(points[i - 1], points[i], f));
                    yield return null;
                    if (f >= 1) break;
                }
            }
            FakeTouches.Release(finger);
            yield return null;
        }

        // 누른 채 seconds 를 둔다 — 그동안 Stationary.
        public static IEnumerator Hold(int finger, Vector2 at, float seconds)
        {
            FakeTouches.Press(finger, at, 1);
            yield return null;
            for (var t = 0f; t < seconds; t += Time.unscaledDeltaTime) yield return null;
            FakeTouches.Release(finger);
            yield return null;
        }

        // 키들을 함께 눌러 seconds(적어도 한 프레임) 두고 뗀다 — 0 이면 지금처럼 한 프레임 누름 → 다음 프레임 뗌.
        public static IEnumerator Keys(KeyCode[] keys, float power, float seconds)
        {
            foreach (var k in keys) FakeKeys.Press(k, power);
            yield return null;
            for (var t = Time.unscaledDeltaTime; t < seconds; t += Time.unscaledDeltaTime) yield return null;
            foreach (var k in keys) FakeKeys.Release(k);
            yield return null;
        }

        // 가짜 마우스를 seconds 동안 곧게 옮긴다(0 이면 한 번에) — 꺼져 있었으면 그 자리에서 켠다.
        public static IEnumerator MouseTo(Vector2 to, float seconds)
        {
            var from = FakeMouse.Active ? FakeMouse.Position : to;
            for (var t = 0f; ;)
            {
                t += Time.unscaledDeltaTime;
                var f = seconds > 0 ? Mathf.Min(1, t / seconds) : 1;
                FakeMouse.MoveTo(Vector2.Lerp(from, to, f));
                yield return null;
                if (f >= 1) break;
            }
        }

        // 바퀴 — at 이 있으면 먼저 그리로 옮겨 한 프레임 두고(hover 가 잡히게), delta 를 seconds 동안 나눠 굴린다.
        public static IEnumerator Scroll(Vector2? at, Vector2 delta, float seconds)
        {
            if (at.HasValue)
            {
                FakeMouse.MoveTo(at.Value);
                yield return null;
            }
            var done = 0f;
            for (var t = 0f; done < 1;)
            {
                t += Time.unscaledDeltaTime;
                var f = seconds > 0 ? Mathf.Min(1, t / seconds) : 1;
                FakeMouse.AddScroll(delta * (f - done));
                done = f;
                yield return null;
            }
        }

        // 가속도를 seconds(적어도 한 프레임) 동안 대신하고 놓는다.
        public static IEnumerator TiltFor(Vector3 acceleration, float seconds)
        {
            Tilt = acceleration;
            yield return null;
            for (var t = Time.unscaledDeltaTime; t < seconds; t += Time.unscaledDeltaTime) yield return null;
            Tilt = null;
            yield return null;
        }
    }
}
