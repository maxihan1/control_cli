// 게임 코드처럼 Input 으로 터치를 읽어 TouchText 에 적는다 — QA 빌드에서 가짜 Input 을 잡는지 · 월드 큐브를 누르는지 확인
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
            for (var i = 0; i < Input.touchCount; i++)
            {
                var touch = Input.GetTouch(i);
                if (touch.phase != TouchPhase.Began) continue;
                Output.text = "touch " + Mathf.RoundToInt(touch.position.x) + "," + Mathf.RoundToInt(touch.position.y);
                var cam = Camera.main;
                if (cam != null && Physics.Raycast(cam.ScreenPointToRay(touch.position), out var hit) && hit.collider.name == "WorldCube")
                    Output.text = "cube " + ++_cube;
            }
        }
    }
}
