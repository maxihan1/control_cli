// 게임 코드처럼 손가락 수 · 누른 키 · 축 · 가상 단추 · 기울기를 읽어 InputText 에 적는다 — 옛 Input 과 Input System 이 같은 글자가 되는지 conform C 줄이 본다
using UnityEngine;
using UnityEngine.UI;

namespace Sample
{
    public sealed class InputProbe : MonoBehaviour
    {
        public Text Output;
        private string _tilt = "-";

        private void Update()
        {
            var fingers = 0;
            var keys = "";
            float axis, tilt;
            bool fire;
#if SAMPLE_INPUTSYSTEM && ENABLE_INPUT_SYSTEM
            var screen = UnityEngine.InputSystem.Touchscreen.current;
            if (screen != null)
                foreach (var t in screen.touches)
                    if (t.press.isPressed) fingers++;
            // PC 는 SDK 가 마우스 손가락을 Mouse 왼 단추로 넣는다.
            var mouse = UnityEngine.InputSystem.Mouse.current;
            if (!Application.isMobilePlatform && mouse != null && mouse.leftButton.isPressed) fingers++;
            var kb = UnityEngine.InputSystem.Keyboard.current;
            if (kb != null)
            {
                if (kb.aKey.isPressed) keys += " A";
                if (kb.leftShiftKey.isPressed) keys += " LeftShift";
                if (kb.wKey.isPressed) keys += " W";
            }
            var pad = UnityEngine.InputSystem.Gamepad.current;
            axis = pad != null ? pad.leftStick.x.ReadValue() : 0;
            fire = pad != null && pad.buttonSouth.isPressed;
            var acc = UnityEngine.InputSystem.Accelerometer.current;
            tilt = acc != null ? acc.acceleration.ReadValue().y : 0;
#else
            for (var i = 0; i < Input.touchCount; i++)
            {
                var phase = Input.GetTouch(i).phase;
                if (phase != TouchPhase.Ended && phase != TouchPhase.Canceled) fingers++;
            }
            foreach (var k in new[] { KeyCode.A, KeyCode.LeftShift, KeyCode.W })
                if (Input.GetKey(k)) keys += " " + k;
            // InputManager 기본 축 — Horizontal(left · right · a · d) · Fire1(left ctrl · mouse 0 · joystick button 0).
            axis = Input.GetAxis("Horizontal");
            fire = Input.GetButton("Fire1");
            tilt = Input.acceleration.y;
#endif
            // 진짜 기울기는 늘 흔들린다 — 사람이 못 내는 큰 값(conform 은 20~49)만 남긴다.
            if (Mathf.Abs(tilt) > 10) _tilt = Mathf.RoundToInt(tilt).ToString();
            var text = "fingers " + fingers + " · keys " + (keys.Length > 0 ? keys.Substring(1) : "-") + " · axis " + Mathf.RoundToInt(axis) + " · fire " + (fire ? 1 : 0) + " · tilt " + _tilt;
            if (Output.text != text) Output.text = text;
        }
    }
}
