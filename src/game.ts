// 게임 드라이버 — 케이스 몸통의 game 과 같은 메서드. CLI 의 Ran 줄이 이 호출을 그대로 찍는다
import type { Command, Link, Reply } from './link.js';

export interface Node {
  name: string;
  text?: string;
  kind?: string;
  interactable?: boolean;
  children?: Node[];
}

export interface TreeReply {
  scene: string;
  screen: [number, number];
  tree: Node[];
}

export interface Found {
  path: string;
  text?: string;
  interactable?: boolean;
}

export interface WaitOptions {
  /** 이 글자가 들어 있을 때까지 */
  text?: string;
  /** 사라질 때까지 */
  gone?: boolean;
  timeoutMs?: number;
}

export interface LayoutProblem {
  kind: 'outside' | 'overlap';
  name: string;
  path: string;
  other?: string;
  otherPath?: string;
  rect?: number[];
}

export interface GameErrors {
  last: number;
  errors: { seq: number; time: string; type: string; message: string; stack: string }[];
  /** 들고 있는 수(200)를 넘겨 밀려난 수 */
  dropped?: number;
  /** 게임이 다시 켜져 번호가 1 부터 다시 셌다 */
  restarted?: boolean;
}

// 기다리기는 짧은 find 를 되풀이한다 — 명령 하나가 팜 15초 · SDK 10초 한도에 걸리지 않게(게임 명세 「게임 연결」).
export const WAIT = { timeoutMs: 10_000, intervalMs: 300 };

export class Game {
  constructor(private readonly link: Link) {}

  private async call(command: Command): Promise<Reply> {
    const reply = await this.link(command);
    if (reply.ok !== true) throw new Error(reply.error ?? `게임이 실패로 답했습니다: ${JSON.stringify(reply)}`);
    return reply;
  }

  async ping(): Promise<{ app: string; version: string }> {
    return (await this.call({ cmd: 'ping' })) as unknown as { app: string; version: string };
  }

  async tree(): Promise<TreeReply> {
    return (await this.call({ cmd: 'tree' })) as unknown as TreeReply;
  }

  /** 켜진 오브젝트 중에 없으면 null. 이름이 겹치면 던진다 */
  async find(target: string): Promise<Found | null> {
    const r = await this.call({ cmd: 'find', target });
    return r.found === true ? { path: r.path as string, text: r.text as string | undefined, interactable: r.interactable as boolean | undefined } : null;
  }

  async click(target: string): Promise<void> {
    await this.call({ cmd: 'click', target });
  }

  async drag(target: string, to: string): Promise<void> {
    await this.call({ cmd: 'drag', target, to });
  }

  /** 넣은 뒤 칸의 글자를 돌려준다 — 글자 수 제한 · 거르기가 자른 결과(비밀번호 칸은 ***) */
  async type(target: string, text: string): Promise<string> {
    return (await this.call({ cmd: 'type', target, text })).text as string;
  }

  async text(target: string): Promise<string> {
    const found = await this.find(target);
    if (found === null) throw new Error(`켜진 오브젝트 중에 ${target} 이 없습니다`);
    if (found.text === undefined) throw new Error(`${target} 에는 글자(Text · InputField)가 없습니다`);
    return found.text;
  }

  /** prop 은 「컴포넌트.칸」 — 'PlayerController.moveSpeed' · 'Transform.position' */
  async get(target: string, prop: string): Promise<unknown> {
    return (await this.call({ cmd: 'get', target, prop })).value;
  }

  async waitFor(target: string, options: WaitOptions = {}): Promise<void> {
    const timeoutMs = options.timeoutMs ?? WAIT.timeoutMs;
    const end = Date.now() + timeoutMs;
    for (;;) {
      const found = await this.find(target);
      const done = options.gone ? found === null : found !== null && (options.text === undefined || (found.text ?? '').includes(options.text));
      if (done) return;
      if (Date.now() >= end) {
        const want = options.gone ? '사라지지 않았습니다' : options.text === undefined ? '뜨지 않았습니다' : `「${options.text}」이 되지 않았습니다`;
        const last = found === null ? '없음' : found.text === undefined ? '있음' : `「${found.text}」`;
        throw new Error(`${target} 이 ${timeoutMs / 1000}초 안에 ${want} (마지막: ${last})`);
      }
      await new Promise((ok) => setTimeout(ok, WAIT.intervalMs));
    }
  }

  /** 누를 수 있는 UI 가 안전 영역 밖이거나 서로 겹치면 problems 에 나온다 */
  async layout(target?: string): Promise<{ checked: number; problems: LayoutProblem[] }> {
    const r = await this.call({ cmd: 'layout', ...(target === undefined ? {} : { target }) });
    return { checked: r.checked as number, problems: r.problems as LayoutProblem[] };
  }

  /** 게임 예외 · 에러 로그 — 받아 둔 last 를 다음에 넘기면 그 뒤 것만 */
  async errors(since = 0): Promise<GameErrors> {
    return (await this.call({ cmd: 'errors', since })) as unknown as GameErrors;
  }

  /** 좌표 누르기(왼쪽 아래가 0,0) — 살펴볼 때만. 케이스는 좌표를 쓰지 않는다 */
  async tap(x: number, y: number): Promise<void> {
    await this.call({ cmd: 'tap', x, y });
  }
}

// CLI · 창 훑기가 액션 뒤 화면을 찍을 때만 쓴다(케이스 메서드가 아니다). 트리가 두 번 같을 때까지 — 계속 바뀌는 HUD 는 상한에서 찍는다.
export const SETTLE = { maxMs: 3000, stepMs: 300 };

export async function settled(game: Game): Promise<TreeReply> {
  const end = Date.now() + SETTLE.maxMs;
  let last = await game.tree();
  for (;;) {
    if (Date.now() >= end) return last;
    await new Promise((ok) => setTimeout(ok, SETTLE.stepMs));
    const next = await game.tree();
    if (JSON.stringify(next) === JSON.stringify(last)) return next;
    last = next;
  }
}
