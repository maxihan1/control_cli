// conform B 칸 경로 줄이 펼치는 데이터 묶음 — 게임의 능력치 ScriptableObject 처럼 칸만 있다. TouchProbe 가 실행 중에 만든다
using UnityEngine;

namespace Sample
{
    public sealed class ProbeData : ScriptableObject
    {
        public int MaxHP = 30;
    }
}
