// 게임 코드처럼 using UnityEngine; 을 둔 채 Input 을 불러 QA 빌드의 가짜 Input 으로 컴파일되는지 보는 확인 스크립트
using UnityEngine;

namespace GameProbe
{
    public sealed class TouchReader : MonoBehaviour
    {
        private void Update()
        {
            if (Input.touchCount > 0 && Input.GetTouch(0).phase == TouchPhase.Began) Debug.Log(Input.touches.Length);
            if (Input.GetMouseButtonDown(0)) Debug.Log(Input.mousePosition);
            if (Input.GetKeyDown(KeyCode.Escape) || Input.GetButtonDown("Fire1")) Debug.Log(Input.GetAxis("Horizontal"));
        }
    }
}
