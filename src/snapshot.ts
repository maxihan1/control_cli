// 게임 트리를 AI 가 읽을 줄인 목록과 ref → 주소 표로 바꾼다
import type { Node, TreeReply } from './game.js';

export interface Entry {
  node: Node;
  /** SDK 가 받는 경로 — 같은 이름 형제는 [순번] */
  path: string;
  /** 케이스에 쓸 주소 — 이름이 트리에 하나뿐이면 이름, 아니면 경로 */
  address: string;
  /** 줄인 목록에 나오나 — 글자 · 버튼이거나 그런 갈래가 둘 이상 갈리는 자리 */
  shown: boolean;
  /** 줄인 목록에서의 들여쓰기 */
  depth: number;
}

const leaf = (n: Node) => n.text !== undefined || n.kind !== undefined;
const keeps = (n: Node): boolean => leaf(n) || (n.children ?? []).some(keeps);

// 트리는 켜진 오브젝트 전부라 이름 개수가 SDK 의 이름 찾기와 같은 셈이다.
export function flatten(tree: Node[]): Entry[] {
  const counts = new Map<string, number>();
  const count = (n: Node) => {
    counts.set(n.name, (counts.get(n.name) ?? 0) + 1);
    n.children?.forEach(count);
  };
  tree.forEach(count);

  const out: Entry[] = [];
  const walk = (nodes: Node[], parent: string, depth: number) => {
    const twins = new Map<string, number>();
    for (const n of nodes) twins.set(n.name, (twins.get(n.name) ?? 0) + 1);
    const seen = new Map<string, number>();
    for (const n of nodes) {
      const index = seen.get(n.name) ?? 0;
      seen.set(n.name, index + 1);
      const path = `${parent}/${twins.get(n.name)! > 1 ? `${n.name}[${index}]` : n.name}`;
      const shown = leaf(n) || (n.children ?? []).filter(keeps).length >= 2;
      out.push({ node: n, path, address: counts.get(n.name) === 1 ? n.name : path, shown, depth });
      walk(n.children ?? [], path, shown ? depth + 1 : depth);
    }
  };
  walk(tree, '', 0);
  return out;
}

export function line(n: Node): string {
  const kind = n.kind ?? (n.text !== undefined ? 'Text' : '');
  const text = n.text === undefined ? '' : ` ${JSON.stringify(n.text)}`;
  return `${kind === '' ? '' : `${kind} `}${n.name}${text}${n.interactable === false ? ' 잠김' : ''}`;
}

export function snapshot(t: TreeReply): { text: string; refs: Record<string, string> } {
  const refs: Record<string, string> = {};
  const lines = [`# 장면 ${t.scene} · 화면 ${t.screen[0]}×${t.screen[1]}`];
  let next = 1;
  for (const e of flatten(t.tree)) {
    if (!e.shown) continue;
    const ref = `e${next++}`;
    refs[ref] = e.address;
    lines.push(`${'  '.repeat(e.depth)}- ${line(e.node)} [ref=${ref}]`);
  }
  return { text: lines.join('\n') + '\n', refs };
}
