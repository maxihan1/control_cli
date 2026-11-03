// 샘플 화면을 코드로 만든다 — 장면 YAML 없이 Unity 판마다 같은 화면. 왼쪽 칸은 uGUI(글자 · 입력칸 · 버튼 · 끌기 슬롯), 오른쪽 칸은 TextMeshPro
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.UI;
#if SAMPLE_TMP
using TMPro;
#endif

namespace Sample
{
    public static class SampleScreen
    {
        private const float Left = -270, Right = 270;
        private static readonly DefaultControls.Resources Look = new DefaultControls.Resources();

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        private static void Build()
        {
            // Input System 을 켠 게임은 그 UI 입력 모듈을 쓴다 — SDK 의 Touchscreen 이벤트 길을 본다.
#if SAMPLE_INPUTSYSTEM && ENABLE_INPUT_SYSTEM
            new GameObject("EventSystem", typeof(EventSystem), typeof(UnityEngine.InputSystem.UI.InputSystemUIInputModule));
#else
            new GameObject("EventSystem", typeof(EventSystem), typeof(StandaloneInputModule));
#endif
            new GameObject("Main Camera", typeof(Camera)) { tag = "MainCamera" }.transform.position = new Vector3(0, 0, -10);
            var cube = GameObject.CreatePrimitive(PrimitiveType.Cube);
            cube.name = "WorldCube";
            cube.transform.position = new Vector3(0, -2.5f, 0);

            var canvas = new GameObject("SampleCanvas", typeof(Canvas), typeof(CanvasScaler), typeof(GraphicRaycaster));
            canvas.GetComponent<Canvas>().renderMode = RenderMode.ScreenSpaceOverlay;
            var scaler = canvas.GetComponent<CanvasScaler>();
            scaler.uiScaleMode = CanvasScaler.ScaleMode.ScaleWithScreenSize;
            scaler.referenceResolution = new Vector2(1080, 1920);
            var root = canvas.transform;

            // uGUI — 아이디 칸은 영숫자 8자라 「qa_user01!」은 「qauser01」로 걸러진다.
            var status = Label(root, "StatusText", Left, 0);
            var id = Field(root, "IdInput", Left, 1, 8, InputField.ContentType.Alphanumeric);
            Field(root, "PasswordInput", Left, 2, 16, InputField.ContentType.Password);
            var presses = 0;
            Place(DefaultControls.CreateButton(Look), root, "LoginButton", Left, 3).GetComponent<Button>().onClick.AddListener(() => status.text = "login " + id.text + " " + ++presses);

            // 끌기 — Bag/Slot[0] 의 Item 을 다른 칸으로 옮긴다.
            var bag = Place(new GameObject("Bag", typeof(RectTransform), typeof(HorizontalLayoutGroup)), root, "Bag", Left, 4).transform;
            for (var i = 0; i < 4; i++) DefaultControls.CreateImage(Look).transform.SetParent(bag, false);
            foreach (Transform slot in bag) slot.name = "Slot";
            var item = DefaultControls.CreateImage(Look);
            item.name = "Item";
            item.GetComponent<Image>().color = Color.yellow;
            ((RectTransform)item.transform).sizeDelta = new Vector2(60, 60);
            item.AddComponent<DragItem>();
            item.transform.SetParent(bag.GetChild(0), false);

            canvas.AddComponent<TouchProbe>().Output = Label(root, "TouchText", Left, 5);
#if SAMPLE_TMP
            BuildTmp(root);
#endif
        }

#if SAMPLE_TMP
        // TMP — uGUI 칸과 같은 규칙을 걸어 같은 글자를 넣으면 같은 결과가 나와야 한다.
        private static void BuildTmp(Transform root)
        {
            var look = new TMP_DefaultControls.Resources();
            var status = Place(TMP_DefaultControls.CreateText(look), root, "TmpStatusText", Right, 0).GetComponent<TMP_Text>();
            status.text = "";
            status.fontSize = 48;
            var id = TmpField(look, root, "TmpIdInput", 1, 8, TMP_InputField.ContentType.Alphanumeric);
            TmpField(look, root, "TmpPasswordInput", 2, 16, TMP_InputField.ContentType.Password);
            var presses = 0;
            var button = Place(TMP_DefaultControls.CreateButton(look), root, "TmpLoginButton", Right, 3);
            button.GetComponentInChildren<TMP_Text>().text = "TMP Login";
            button.GetComponent<Button>().onClick.AddListener(() => status.text = "tmp login " + id.text + " " + ++presses);
        }

        private static TMP_InputField TmpField(TMP_DefaultControls.Resources look, Transform root, string name, int row, int limit, TMP_InputField.ContentType type)
        {
            var field = Place(TMP_DefaultControls.CreateInputField(look), root, name, Right, row).GetComponent<TMP_InputField>();
            field.characterLimit = limit;
            field.contentType = type;
            field.textComponent.fontSize = 48;
            var placeholder = (TMP_Text)field.placeholder;
            placeholder.text = name;
            placeholder.fontSize = 48;
            return field;
        }
#endif

        // x 칸 · 위에서부터 row 번째 줄에 둔다(1080×1920 기준 칸 넓이 500 · 한 줄 200).
        private static GameObject Place(GameObject go, Transform parent, string name, float x, int row)
        {
            go.name = name;
            var rect = (RectTransform)go.transform;
            rect.SetParent(parent, false);
            rect.anchorMin = rect.anchorMax = rect.pivot = new Vector2(0.5f, 1f);
            rect.anchoredPosition = new Vector2(x, -100 - row * 200);
            rect.sizeDelta = new Vector2(500, 140);
            return go;
        }

        private static Text Label(Transform parent, string name, float x, int row)
        {
            var label = Place(DefaultControls.CreateText(Look), parent, name, x, row).GetComponent<Text>();
            label.text = "";
            label.fontSize = 48;
            label.alignment = TextAnchor.MiddleCenter;
            return label;
        }

        private static InputField Field(Transform parent, string name, float x, int row, int limit, InputField.ContentType type)
        {
            var field = Place(DefaultControls.CreateInputField(Look), parent, name, x, row).GetComponent<InputField>();
            field.characterLimit = limit;
            field.contentType = type;
            field.textComponent.fontSize = 48;
            var placeholder = (Text)field.placeholder;
            placeholder.text = name;
            placeholder.fontSize = 48;
            return field;
        }
    }
}
