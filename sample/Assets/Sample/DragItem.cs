// 가방 칸 사이로 끌어 옮기는 아이템 — drag 명령 확인용. 놓은 자리가 칸이 아니면 원래 칸으로 돌아간다
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.UI;

namespace Sample
{
    public sealed class DragItem : MonoBehaviour, IBeginDragHandler, IDragHandler, IEndDragHandler
    {
        private Transform _from;

        public void OnBeginDrag(PointerEventData e)
        {
            _from = transform.parent;
            transform.SetParent(transform.root, true);
            // 끄는 동안 아래 칸이 놓을 자리로 잡히게 한다.
            GetComponent<Image>().raycastTarget = false;
        }

        public void OnDrag(PointerEventData e) => transform.position = e.position;

        public void OnEndDrag(PointerEventData e)
        {
            var under = e.pointerCurrentRaycast.gameObject;
            transform.SetParent(under != null && under.name == "Slot" ? under.transform : _from, false);
            ((RectTransform)transform).anchoredPosition = Vector2.zero;
            GetComponent<Image>().raycastTarget = true;
        }
    }
}
