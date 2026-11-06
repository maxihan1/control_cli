// QA 빌드 훅(ControlCli.Editor.StampIds)이 장면 오브젝트에 붙이는 영구 id — 정의 제약 없는 어셈블리라 Editor 가 CONTROL_CLI 없이도 붙일 수 있다
using UnityEngine;

namespace ControlCli
{
    [AddComponentMenu(""), DisallowMultipleComponent]
    public sealed class ControlCliId : MonoBehaviour
    {
        public string Id;
    }
}
