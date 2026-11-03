// 샘플 화면 아래쪽에 UI Toolkit(UIDocument) 칸을 코드로 만든다 — uGUI 칸과 같은 규칙의 입력칸 · 버튼으로 트리 · 누르기 · type 을 확인
using UnityEngine;
using UnityEngine.UIElements;

namespace Sample
{
    public static class SampleUitk
    {
        public static void Build()
        {
            var settings = ScriptableObject.CreateInstance<PanelSettings>();
            settings.scaleMode = PanelScaleMode.ScaleWithScreenSize;
            settings.referenceResolution = new Vector2Int(1080, 1920);
            // panelSettings 를 꺼진 채로 넣고 켜야 rootVisualElement 가 그 panel 에 붙는다.
            var go = new GameObject("UitkDocument");
            go.SetActive(false);
            var doc = go.AddComponent<UIDocument>();
            doc.panelSettings = settings;
            go.SetActive(true);

            // 테마(.tss) 없이 만들어 기본 모양이 없다 — 누를 자리가 생기게 크기 · 색을 직접 준다.
            var panel = new VisualElement { name = "UitkPanel" };
            panel.style.position = Position.Absolute;
            panel.style.left = 40;
            panel.style.right = 40;
            panel.style.bottom = 40;
            panel.style.height = 400;
            doc.rootVisualElement.Add(panel);

            var status = new Label { name = "UitkStatusText" };
            var id = Box(new TextField { name = "UitkIdInput", maxLength = 8 });
            var password = Box(new TextField { name = "UitkPasswordInput", isPasswordField = true });
            var presses = 0;
            var login = Box(new Button(() => status.text = "uitk login " + id.value + " " + ++presses) { name = "UitkLoginButton", text = "UITK Login" });
            foreach (var e in new VisualElement[] { status, id, password, login })
            {
                e.style.height = 80;
                e.style.marginBottom = 10;
                panel.Add(e);
            }
        }

        private static T Box<T>(T e) where T : VisualElement
        {
            e.style.backgroundColor = new Color(0.85f, 0.85f, 0.85f);
            return e;
        }
    }
}
