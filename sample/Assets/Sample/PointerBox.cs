// 누르면 PointerText 에 마지막 Pointer 이벤트(down · up · enter · exit)와 누른 초를 적는 uGUI 칸 — long-press · mouse-move · pointer 명령 확인용
using System.Globalization;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.UI;

namespace Sample
{
    public sealed class PointerBox : MonoBehaviour, IPointerDownHandler, IPointerUpHandler, IPointerEnterHandler, IPointerExitHandler
    {
        public Text Output;
        private float _downAt;
        private string _held = "-";

        private void Start() => Show("-");

        public void OnPointerDown(PointerEventData e)
        {
            _downAt = Time.unscaledTime;
            Show("down");
        }

        public void OnPointerUp(PointerEventData e)
        {
            _held = (Time.unscaledTime - _downAt).ToString("0.0", CultureInfo.InvariantCulture);
            Show("up");
        }

        public void OnPointerEnter(PointerEventData e) => Show("enter");
        public void OnPointerExit(PointerEventData e) => Show("exit");

        private void Show(string last) => Output.text = "last " + last + " · held " + _held;
    }
}
