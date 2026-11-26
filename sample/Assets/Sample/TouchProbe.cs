// 게임 코드처럼 터치를 읽어 TouchText 에 적는다 — QA 빌드에서 가짜 터치가 게임 코드에 닿는지 · 월드 큐브를 누르는지 확인. Input System 을 켠 게임은 Touchscreen 으로 읽는다
using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Scripting;
using UnityEngine.UI;

namespace Sample
{
    public sealed class TouchProbe : MonoBehaviour
    {
        public Text Output;
        private int _cube;

        // conform A 줄 — call 이 부르는 메서드 · static-call · static-get/set 이 보는 칸. 게임 코드가 안 불러 IL2CPP 코드 줄이기에서 빠지지 않게 붙잡는다.
        [Preserve] public string Say(string word, int times) => Output.text = word + " " + times;
        [Preserve] public static int Add(int a, int b) => a + b;
        [Preserve] public static string Note { get; set; }
        // conform D 로그 줄 — static-call 로 게임 로그 한 줄을 남긴다(logs 가 받는지 · 토큰을 가리는지).
        [Preserve] public static void Log(string text) => Debug.Log(text);

        // conform B 칸 경로 줄 — 목록 원소 · 길이(get 칸[i] · Count) · 데이터 묶음 펼치기(members TouchProbe.Data).
        [Serializable]
        public sealed class Wave
        {
            public string Name;
            public int[] Counts;
        }

        public List<Wave> Waves = new List<Wave> { new Wave { Name = "first", Counts = new[] { 3, 5 } }, new Wave { Name = "boss", Counts = new[] { 1 } } };
        public float[] Breaks = { 1.5f, 3f };
        public ProbeData Data;

        // ScriptableObject 는 생성자에서 못 만든다 — AddComponent 가 바로 부르는 Awake 에서.
        private void Awake() => Data = ScriptableObject.CreateInstance<ProbeData>();

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
