// 게임 코드처럼 터치를 읽어 TouchText 에 적는다 — QA 빌드에서 가짜 터치가 게임 코드에 닿는지 · 월드 큐브를 누르는지 확인. Input System 을 켠 게임은 Touchscreen 으로 읽는다
using UnityEngine;
using UnityEngine.UI;

namespace Sample
{
    public sealed class TouchProbe : MonoBehaviour
    {
        public Text Output;
        private int _cube;

        private void Update()
        {
#if SAMPLE_INPUTSYSTEM && ENABLE_INPUT_SYSTEM
            var screen = UnityEngine.InputSystem.Touchscreen.current;
            if (UnityEngine.InputSystem.Keyboard.current != null && UnityEngine.InputSystem.Keyboard.current.iKey.wasPressedThisFrame) Output.text = "key I";
            // PC 는 SDK 가 Touchscreen 대신 Mouse 로 넣는다.
            var mouse = UnityEngine.InputSystem.Mouse.current;
            if (mouse != null && mouse.leftButton.wasPressedThisFrame) Began(mouse.position.ReadValue());
            if (screen == null) return;
            foreach (var touch in screen.touches)
                if (touch.press.wasPressedThisFrame) Began(touch.position.ReadValue());
#else
            if (Input.GetKeyDown(KeyCode.I)) Output.text = "key I";
            for (var i = 0; i < Input.touchCount; i++)
            {
                var touch = Input.GetTouch(i);
                if (touch.phase == TouchPhase.Began) Began(touch.position);
            }
#endif
        }

        private void Began(Vector2 position)
        {
            Output.text = "touch " + Mathf.RoundToInt(position.x) + "," + Mathf.RoundToInt(position.y);
            var cam = Camera.main;
            if (cam != null && Physics.Raycast(cam.ScreenPointToRay(position), out var hit) && hit.collider.name == "WorldCube")
                Output.text = "cube " + ++_cube;
        }
    }
}
