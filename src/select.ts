// 주소를 단계로 풀고 트리에서 맞는 것을 고른다 — AltTester PATH 꼴의 일부. 가짜 SDK 가 쓰고 엔진 SDK(Unity Select.cs …)가 같은 규칙 · 같은 글로 옮긴다
export type Key = 'name' | 'tag' | 'layer' | 'component' | 'text' | 'id';
const KEYS: Key[] = ['name', 'tag', 'layer', 'component', 'text', 'id'];

export interface Cond {
  key: Key;
  value: string;
  /** contains(@칸,값) — 일부만 맞아도 */
  part: boolean;
}

export interface Step {
  /** 실패 글에 쓰는 그 단계 글자 */
  raw: string;
  /** // — 바로 아래가 아니라 아래 어디서나 */
  deep: boolean;
  /** 오브젝트 이름 · * 아무 이름 · .. 부모 */
  name: string;
  conds: Cond[];
  /** 그 단계에 맞은 형제 중 몇 번째(0부터) — 음수는 뒤에서(-1 이 마지막) */
  index?: number;
}

export interface View<T> {
  roots: T[];
  children: (n: T) => T[];
  /** 그 칸의 값들 — 없으면 빈 배열(UI Toolkit 요소의 tag). name 은 하나, component 는 붙은 것 전부 */
  attr: (n: T, key: Key) => string[];
}

const bad = (target: string, why: string) => new Error(`주소 ${target} 의 꼴이 틀렸습니다 — ${why}`);

/** / 로 시작하지 않으면 이름 그대로(아래 어디서나 그 이름). 꼴이 틀리면 까닭을 던진다 */
export function steps(target: string): Step[] {
  if (target === '') throw new Error('주소가 비었습니다');
  if (!target.startsWith('/')) return [{ raw: target, deep: true, name: target, conds: [] }];
  const out: Step[] = [];
  let i = 0;
  while (i < target.length) {
    const start = i;
    const deep = target.startsWith('//', i);
    i += deep ? 2 : 1;
    const nameStart = i;
    let name = '';
    while (i < target.length && target[i] !== '/' && target[i] !== '[') name += target[i++];
    const step: Step = { raw: '', deep, name, conds: [] };
    while (target[i] === '[') {
      const end = target.indexOf(']', i);
      if (end < 0) throw bad(target, `${target.slice(i)} 를 닫는 ] 가 없습니다`);
      const inside = target.slice(i + 1, end);
      // 조건 · 순번 꼴이 아닌 [ ] 는 이름의 일부다([DOTween] · Slot[A]) — 단계 전체가 이름이고 끝의 [숫자]만 순번(옛 경로 규칙 그대로).
      if (!/^-?\d+$/.test(inside) && !inside.startsWith('@') && !inside.startsWith('contains(')) {
        const slash = target.indexOf('/', nameStart);
        i = slash < 0 ? target.length : slash;
        const m = /^(.+)\[(\d+)\]$/s.exec(target.slice(nameStart, i));
        Object.assign(step, { name: m ? m[1] : target.slice(nameStart, i), conds: [], index: m ? Number(m[2]) : undefined });
        break;
      }
      cond(step, inside, target);
      i = end + 1;
    }
    if (i < target.length && target[i] !== '/') throw bad(target, '] 뒤에는 / 가 와야 합니다');
    if (step.name === '') throw bad(target, '단계마다 이름이나 * 가 있어야 합니다 (예: //*[@tag=Player])');
    if (step.name === '..' && (deep || step.conds.length > 0 || step.index !== undefined)) throw bad(target, '.. 은 /.. 꼴로만 씁니다');
    step.raw = target.slice(start, i).replace(/^\/+/, '');
    out.push(step);
  }
  return out;
}

function cond(step: Step, inside: string, target: string): void {
  if (/^-?\d+$/.test(inside)) {
    if (step.index !== undefined) throw bad(target, `순번이 둘입니다 [${inside}]`);
    step.index = Number(inside);
    return;
  }
  const m = /^@(\w+)=(.*)$/s.exec(inside) ?? /^contains\(@(\w+),(.*)\)$/s.exec(inside);
  if (!m) throw bad(target, `[${inside}] 는 [@칸=값] · [contains(@칸,값)] · [순번] 중 하나여야 합니다`);
  if (!KEYS.includes(m[1] as Key)) throw bad(target, `모르는 칸 @${m[1]} — ${KEYS.join(' · ')}`);
  step.conds.push({ key: m[1] as Key, value: m[2].trim().replace(/^(['"])(.*)\1$/s, '$2'), part: inside.startsWith('contains(') });
}

const fits = <T>(n: T, s: Step, v: View<T>) =>
  (s.name === '*' || v.attr(n, 'name')[0] === s.name) && s.conds.every((c) => v.attr(n, c.key).some((x) => (c.part ? x.includes(c.value) : x === c.value)));

/** 맞은 것마다 뿌리에서 그것까지의 줄(마지막이 맞은 것). 비면 stop 이 끊긴 단계 번호 */
export function select<T>(path: Step[], v: View<T>): { trails: T[][]; stop?: number } {
  let trails: T[][] = [[]];
  for (const [k, s] of path.entries()) {
    const next: T[][] = [];
    for (const t of trails) {
      if (s.name === '..') {
        if (t.length > 1) next.push(t.slice(0, -1));
        continue;
      }
      // 형제 묶음마다 순번을 센다 — // 는 아래 모든 층의 묶음이다.
      const groups: [T[], T[]][] = [];
      const gather = (trail: T[], under: T[]) => {
        groups.push([trail, under]);
        if (s.deep) for (const n of under) gather([...trail, n], v.children(n));
      };
      gather(t, t.length ? v.children(t[t.length - 1]) : v.roots);
      for (const [trail, under] of groups) {
        const hit = under.filter((n) => fits(n, s, v));
        const at = s.index === undefined ? -1 : s.index < 0 ? hit.length + s.index : s.index;
        for (const n of s.index === undefined ? hit : at >= 0 && at < hit.length ? [hit[at]] : []) next.push([...trail, n]);
      }
    }
    // 같은 것에 두 길로 닿으면(// 를 두 번 · 형제의 ..) 하나만 남긴다.
    const seen = new Set<T>();
    trails = next.filter((t) => !seen.has(t[t.length - 1]) && Boolean(seen.add(t[t.length - 1])));
    if (trails.length === 0) return { trails, stop: k };
  }
  return { trails };
}

/** 줄을 SDK 가 받는 경로로 — 같은 이름 형제가 있으면 [순번](CLI snapshot 의 flatten 과 같은 셈) */
export function pathOf<T>(trail: T[], v: View<T>): string {
  let level = v.roots;
  let out = '';
  for (const n of trail) {
    const name = v.attr(n, 'name')[0];
    const twins = level.filter((x) => v.attr(x, 'name')[0] === name);
    out += `/${twins.length > 1 ? `${name}[${twins.indexOf(n)}]` : name}`;
    level = v.children(n);
  }
  return out;
}

/** 한 것을 짚는 명령 — 없음(missing: 기다리기가 되풀이할 수 있다) · 여럿(몇 번 해도 같다)을 갈라 말한다. shown 은 켜진 것만 본 찾기인가 */
export function one<T>(target: string, r: { trails: T[][]; stop?: number }, shown: boolean, path?: Step[]): { trail?: T[]; problem?: string; missing: boolean } {
  const bare = !target.startsWith('/');
  if (r.trails.length === 1) return { trail: r.trails[0], missing: false };
  if (r.trails.length === 0) {
    const where = bare || r.stop === undefined ? '' : ` (${(path ?? steps(target))[r.stop].raw} 에서 끊김)`;
    return { problem: `${shown ? '켜진 ' : ''}오브젝트 중에 ${target} 이 없습니다${where}`, missing: true };
  }
  return {
    problem: bare
      ? `${target} 이 ${r.trails.length}개라 하나를 고를 수 없습니다 — 경로로 주소를 씁니다`
      : `${target} 에 맞는 것이 ${r.trails.length}개라 하나를 고를 수 없습니다 — [순번] · 조건을 더하거나 find-all 로 경로를 봅니다`,
    missing: false,
  };
}
