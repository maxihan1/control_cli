// 게임 코드의 Input 호출을 가로채 가짜 터치를 섞어 주는 같은 이름 클래스(QA 빌드만)
using UnityEngine;
using ControlCli;

// 전역 이름공간에 둬야 게임 파일의 `using UnityEngine;` 보다 먼저 잡힌다(C# 이름 찾기는 이름공간 멤버가 using 보다 앞선다).
// ponytail: Ashveil 이 쓰는 멤버만 감쌌다. 다른 게임을 붙일 때 UnityEngine.Input 의 나머지 멤버를 같은 꼴로 더한다.
public static class Input
{
    public static int touchCount => FakeTouches.TouchCount;
    public static Touch GetTouch(int index) => FakeTouches.GetTouch(index);
    public static bool touchSupported => UnityEngine.Input.touchSupported;
    public static Vector3 mousePosition => UnityEngine.Input.mousePosition;
    public static bool GetMouseButton(int button) => UnityEngine.Input.GetMouseButton(button);
    public static bool GetMouseButtonDown(int button) => UnityEngine.Input.GetMouseButtonDown(button);
    public static bool GetMouseButtonUp(int button) => UnityEngine.Input.GetMouseButtonUp(button);
    public static float GetAxis(string axisName) => UnityEngine.Input.GetAxis(axisName);
    public static float GetAxisRaw(string axisName) => UnityEngine.Input.GetAxisRaw(axisName);
    public static bool GetKey(KeyCode key) => UnityEngine.Input.GetKey(key);
    public static bool GetKeyDown(KeyCode key) => UnityEngine.Input.GetKeyDown(key);
    public static bool GetKeyUp(KeyCode key) => UnityEngine.Input.GetKeyUp(key);
}
