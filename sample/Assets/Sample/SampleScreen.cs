// 샘플 화면을 코드로 만든다 — 장면 YAML 없이 Unity 판마다 같은 화면(글자 · 입력칸 · 버튼 · 끌기 슬롯 · 월드 큐브)
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.UI;

namespace Sample
{
    public static class SampleScreen
    {
        private static readonly DefaultControls.Resources Look = new DefaultControls.Resources();

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        private static void Build()
        {
            new GameObject("EventSystem", typeof(EventSystem), typeof(StandaloneInputModule));
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

            var status = Label(root, "StatusText", 0);
            var id = Field(root, "IdInput", 1, 8, false);
            Field(root, "PasswordInput", 2, 16, true);
            var presses = 0;
            Place(DefaultControls.CreateButton(Look), root, "LoginButton", 3).GetComponent<Button>().onClick.AddListener(() => status.text = "login " + id.text + " " + ++presses);

            // 끌기 — Bag/Slot[0] 의 Item 을 다른 칸으로 옮긴다.
            var bag = Place(new GameObject("Bag", typeof(RectTransform), typeof(HorizontalLayoutGroup)), root, "Bag", 4).transform;
            for (var i = 0; i < 4; i++) DefaultControls.CreateImage(Look).transform.SetParent(bag, false);
            foreach (Transform slot in bag) slot.name = "Slot";
            var item = DefaultControls.CreateImage(Look);
            item.name = "Item";
            item.GetComponent<Image>().color = Color.yellow;
            ((RectTransform)item.transform).sizeDelta = new Vector2(60, 60);
            item.AddComponent<DragItem>();
            item.transform.SetParent(bag.GetChild(0), false);

            canvas.AddComponent<TouchProbe>().Output = Label(root, "TouchText", 5);
        }

        // 위에서부터 row 번째 줄에 둔다(1080×1920 기준 한 줄 200).
        private static GameObject Place(GameObject go, Transform parent, string name, int row)
        {
            go.name = name;
            var rect = (RectTransform)go.transform;
            rect.SetParent(parent, false);
            rect.anchorMin = rect.anchorMax = rect.pivot = new Vector2(0.5f, 1f);
            rect.anchoredPosition = new Vector2(0, -100 - row * 200);
            rect.sizeDelta = new Vector2(800, 140);
            return go;
        }

        private static Text Label(Transform parent, string name, int row)
        {
            var label = Place(DefaultControls.CreateText(Look), parent, name, row).GetComponent<Text>();
            label.text = "";
            label.fontSize = 48;
            label.alignment = TextAnchor.MiddleCenter;
            return label;
        }

        private static InputField Field(Transform parent, string name, int row, int limit, bool password)
        {
            var field = Place(DefaultControls.CreateInputField(Look), parent, name, row).GetComponent<InputField>();
            field.characterLimit = limit;
            if (password) field.inputType = InputField.InputType.Password;
            field.textComponent.fontSize = 48;
            var placeholder = (Text)field.placeholder;
            placeholder.text = name;
            placeholder.fontSize = 48;
            return field;
        }
    }
}
