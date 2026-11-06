// 샘플 화면 아래쪽에 UI Toolkit(UIDocument) 칸을 코드로 만든다 — uGUI 칸과 같은 규칙의 입력칸 · 버튼으로 트리 · 누르기 · type 을 확인
using UnityEngine;
using UnityEngine.UIElements;

namespace Sample
{
    public static class SampleUitk
    {
        public static void Build()
        {
            var panel = Panel("UitkDocument", "UitkPanel");

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

        // Second 를 한 장면으로 열 때 — EventSystem 없는 UI Toolkit 칸(SDK 의 UI Toolkit 직접 길). 누르기 · 마우스 들어옴 · 바퀴를 SecondText · scrollOffset 으로 본다.
        public static void BuildSecond()
        {
            var panel = Panel("SecondDocument", "SecondPanel");
            var text = new Label { name = "SecondText" };
            var presses = 0;
            var button = Box(new Button(() => text.text = "second " + ++presses) { name = "SecondButton", text = "Second" });
            // 마우스만 — 터치도 Enter 를 내 click 글자를 덮지 않게.
            button.RegisterCallback<PointerEnterEvent>(e =>
            {
                if (e.pointerId == PointerId.mousePointerId) text.text = "enter";
            });
            var scroll = new ScrollView { name = "SecondScroll" };
            // 테마가 주던 내용 칸의 flex-shrink 0 — 없으면 줄이 10 높이로 줄어 내용이 보이는 높이와 같아지고 굴릴 거리가 0 이다(이 맥 실측).
            scroll.contentContainer.style.flexShrink = 0;
            // 바퀴 한 칸을 직접 준다 — 테마가 없으면 ScrollView.ReadSingleLineHeight 가 줄 높이 변수를 못 찾고 null 조상에 콜백을 걸다 NullReferenceException 으로 멈춘다(6000.0 실측).
            // 기본값 18 과 달라야 inline 으로 잡혀 그 함수를 건너뛴다 — 30 은 uGUI ScrollList 의 scrollSensitivity 와 같다.
            scroll.mouseWheelScrollSize = 30;
            for (var i = 0; i < 20; i++) scroll.Add(new Label("row " + i) { style = { height = 60 } });
            text.style.height = button.style.height = 80;
            scroll.style.height = 200;
            foreach (var e in new VisualElement[] { text, button, scroll })
            {
                e.style.marginBottom = 10;
                panel.Add(e);
            }
        }

        private static VisualElement Panel(string documentName, string panelName)
        {
            var settings = ScriptableObject.CreateInstance<PanelSettings>();
            settings.scaleMode = PanelScaleMode.ScaleWithScreenSize;
            settings.referenceResolution = new Vector2Int(1080, 1920);
            // panelSettings 를 꺼진 채로 넣고 켜야 rootVisualElement 가 그 panel 에 붙는다.
            var go = new GameObject(documentName);
            go.SetActive(false);
            var doc = go.AddComponent<UIDocument>();
            doc.panelSettings = settings;
            go.SetActive(true);

            // 테마(.tss) 없이 만들어 기본 모양이 없다 — 누를 자리가 생기게 크기 · 색을 직접 준다.
            // 뿌리도 테마가 주던 「화면 가득」이 없어 높이 0 이 되고 아래 붙임 패널이 화면 밖으로 나간다(실기기에서 안 보임).
            var root = doc.rootVisualElement;
            root.style.position = Position.Absolute;
            root.style.left = root.style.top = root.style.right = root.style.bottom = 0;
            var panel = new VisualElement { name = panelName };
            panel.style.position = Position.Absolute;
            panel.style.left = 40;
            panel.style.right = 40;
            panel.style.bottom = 40;
            panel.style.height = 400;
            doc.rootVisualElement.Add(panel);
            return panel;
        }

        private static T Box<T>(T e) where T : VisualElement
        {
            e.style.backgroundColor = new Color(0.85f, 0.85f, 0.85f);
            return e;
        }
    }
}
