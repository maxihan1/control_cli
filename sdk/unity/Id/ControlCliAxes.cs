// QA 빌드 훅(ControlCli.Editor.BakeAxes)이 장면마다 구워 넣는 InputManager 축 표 — 깨어나면 static 표로 옮기고 제 오브젝트를 지운다. 정의 제약 없는 어셈블리라 Editor 가 CONTROL_CLI 없이도 붙인다
using System;
using UnityEngine;

namespace ControlCli
{
    [AddComponentMenu("")]
    public sealed class ControlCliAxes : MonoBehaviour
    {
        [Serializable]
        public sealed class Axis
        {
            public string name, positive, negative, altPositive, altNegative;
            public float sensitivity;
            public bool invert;
            // 0 키 · 마우스 단추 · 1 마우스 이동 · 2 조이스틱 축
            public int type;
            // 마우스 이동 축의 번호 — 0 X · 1 Y · 2 바퀴
            public int axis;
        }

        public Axis[] axes;

        // 처음 깨어난 장면의 표 — 장면마다 같은 표라 하나만 둔다. 없으면(축 훅 전 빌드) null.
        public static Axis[] Table { get; private set; }

        private void Awake()
        {
            if (Table == null) Table = axes;
            Destroy(gameObject);
        }
    }
}
