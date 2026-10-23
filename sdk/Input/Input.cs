// 게임 코드의 Input 호출을 가로채 가짜 터치를 섞어 주는 같은 이름 클래스(QA 빌드만)
using UnityEngine;
using ControlCli;

// 전역 이름공간에 둬야 게임 파일의 `using UnityEngine;` 보다 먼저 잡힌다(C# 이름 찾기는 이름공간 멤버가 using 보다 앞선다).
// UnityEngine.Input 의 멤버를 전부 감싼다 — 빠진 멤버를 쓰는 게임 파일은 QA 빌드에서만 컴파일이 깨지기 때문이다.
// 터치만 가짜를 섞고 나머지는 그대로 넘긴다.
// ponytail: 펜(GetPenEvent 등) · mousePositionDelta 는 Unity 판마다 있고 없고가 달라 뺐다. 쓰는 게임이 오면 더한다.
public static class Input
{
    public static int touchCount => FakeTouches.TouchCount;
    public static Touch GetTouch(int index) => FakeTouches.GetTouch(index);
    public static Touch[] touches
    {
        get
        {
            var all = new Touch[FakeTouches.TouchCount];
            for (var i = 0; i < all.Length; i++) all[i] = FakeTouches.GetTouch(i);
            return all;
        }
    }

    // 가짜 터치는 어느 폰에서나 들어온다 — UI 입력 모듈(FakeBaseInput)과 같은 답을 해야 게임과 UI 가 같은 길을 탄다.
    public static bool touchSupported => true;
    public static bool touchPressureSupported => UnityEngine.Input.touchPressureSupported;
    public static bool stylusTouchSupported => UnityEngine.Input.stylusTouchSupported;
    public static bool multiTouchEnabled { get => UnityEngine.Input.multiTouchEnabled; set => UnityEngine.Input.multiTouchEnabled = value; }
    public static bool simulateMouseWithTouches { get => UnityEngine.Input.simulateMouseWithTouches; set => UnityEngine.Input.simulateMouseWithTouches = value; }

    public static bool mousePresent => UnityEngine.Input.mousePresent;
    public static Vector3 mousePosition => UnityEngine.Input.mousePosition;
    public static Vector2 mouseScrollDelta => UnityEngine.Input.mouseScrollDelta;
    public static bool GetMouseButton(int button) => UnityEngine.Input.GetMouseButton(button);
    public static bool GetMouseButtonDown(int button) => UnityEngine.Input.GetMouseButtonDown(button);
    public static bool GetMouseButtonUp(int button) => UnityEngine.Input.GetMouseButtonUp(button);

    public static bool anyKey => UnityEngine.Input.anyKey;
    public static bool anyKeyDown => UnityEngine.Input.anyKeyDown;
    public static string inputString => UnityEngine.Input.inputString;
    public static bool GetKey(KeyCode key) => UnityEngine.Input.GetKey(key);
    public static bool GetKey(string name) => UnityEngine.Input.GetKey(name);
    public static bool GetKeyDown(KeyCode key) => UnityEngine.Input.GetKeyDown(key);
    public static bool GetKeyDown(string name) => UnityEngine.Input.GetKeyDown(name);
    public static bool GetKeyUp(KeyCode key) => UnityEngine.Input.GetKeyUp(key);
    public static bool GetKeyUp(string name) => UnityEngine.Input.GetKeyUp(name);

    public static float GetAxis(string axisName) => UnityEngine.Input.GetAxis(axisName);
    public static float GetAxisRaw(string axisName) => UnityEngine.Input.GetAxisRaw(axisName);
    public static bool GetButton(string buttonName) => UnityEngine.Input.GetButton(buttonName);
    public static bool GetButtonDown(string buttonName) => UnityEngine.Input.GetButtonDown(buttonName);
    public static bool GetButtonUp(string buttonName) => UnityEngine.Input.GetButtonUp(buttonName);
    public static void ResetInputAxes() => UnityEngine.Input.ResetInputAxes();
    public static string[] GetJoystickNames() => UnityEngine.Input.GetJoystickNames();
    public static bool IsJoystickPreconfigured(string joystickName) => UnityEngine.Input.IsJoystickPreconfigured(joystickName);

    public static IMECompositionMode imeCompositionMode { get => UnityEngine.Input.imeCompositionMode; set => UnityEngine.Input.imeCompositionMode = value; }
    public static string compositionString => UnityEngine.Input.compositionString;
    public static bool imeIsSelected => UnityEngine.Input.imeIsSelected;
    public static Vector2 compositionCursorPos { get => UnityEngine.Input.compositionCursorPos; set => UnityEngine.Input.compositionCursorPos = value; }

    public static Vector3 acceleration => UnityEngine.Input.acceleration;
    public static int accelerationEventCount => UnityEngine.Input.accelerationEventCount;
    public static AccelerationEvent[] accelerationEvents => UnityEngine.Input.accelerationEvents;
    public static AccelerationEvent GetAccelerationEvent(int index) => UnityEngine.Input.GetAccelerationEvent(index);
    public static DeviceOrientation deviceOrientation => UnityEngine.Input.deviceOrientation;
    public static bool compensateSensors { get => UnityEngine.Input.compensateSensors; set => UnityEngine.Input.compensateSensors = value; }
    public static Gyroscope gyro => UnityEngine.Input.gyro;
    public static Compass compass => UnityEngine.Input.compass;
    public static LocationService location => UnityEngine.Input.location;
    public static bool backButtonLeavesApp { get => UnityEngine.Input.backButtonLeavesApp; set => UnityEngine.Input.backButtonLeavesApp = value; }
}
