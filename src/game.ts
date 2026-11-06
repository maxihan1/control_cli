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
  /** 영구 id(QA 빌드가 장면 오브젝트에 붙인 것) 또는 instance id — [@id=…] 로 다시 찾는다. UI Toolkit 요소는 없다 */
  id?: string;
  /** 화면 가운데(왼쪽 아래가 0,0) — 화면에 비친 자리가 없거나 꺼졌으면 없다 */
  x?: number;
  y?: number;
  /** inactive 로 찾은 꺼진 오브젝트 */
  active?: false;
}

export interface FindOptions {
  /** 꺼진 오브젝트 · 숨은 요소도 — 경로 순번이 꺼진 형제까지 센다 */
  inactive?: boolean;
  /** 월드 오브젝트의 화면 자리를 셀 카메라 오브젝트 주소(기본 Camera.main) */
  camera?: string;
}

export interface Member {
  name: string;
  type: string;
  value?: unknown;
  readOnly?: boolean;
  static?: boolean;
}

/** 컴포넌트가 선언한 칸 · 메서드 — Unity 부모(MonoBehaviour …) 칸은 뺀다 */
export interface Members {
  fields: Member[];
  properties: Member[];
  methods: { name: string; args: string[]; returns: string; static?: boolean }[];
}

export interface PingReply {
  app: string;
  version: string;
  /** protocol 2(SDK 0.3.0)부터 — 옛 SDK 는 app · version 만 준다 */
  engine?: string;
  engineVersion?: string;
  sdkVersion?: string;
  protocol?: number;
  caps?: string[];
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

/** 열린 장면 — loads · unloads 는 게임이 켜진 뒤 장면이 열리고 닫힌 수(같은 장면을 다시 열어도 는다) */
export interface Scenes {
  active: string;
  loaded: string[];
  loads: number;
  unloads: number;
}

/** 저장 값(PlayerPrefs) 타입 — 넣은 타입으로 읽는다 */
export type PrefType = 'string' | 'int' | 'float';

/** 누를 자리 — 주소 글자 또는 화면 좌표(왼쪽 아래 0,0 — 살펴볼 때만) */
export type At = string | { x: number; y: number };

/** pointer 가 보내는 Pointer 이벤트 */
export type PointerAction = 'down' | 'up' | 'enter' | 'exit';

/** 탭 · 클릭 — 횟수와 사이 초 */
export interface PressOptions {
  count?: number;
  interval?: number;
}

// 기다리기는 짧은 find 를 되풀이한다 — 명령 하나가 팜 15초 · SDK 10초 한도에 걸리지 않게(게임 명세 「게임 연결」). 장면은 크면 10초를 넘겨 따로 둔다.
export const WAIT = { timeoutMs: 10_000, intervalMs: 300, sceneMs: 30_000 };

// 선택자(// · [@ · [contains( · [-n] · .. · *) · inactive · camera 는 SDK 0.5.0(find-all 과 같은 판)부터. 옛 SDK 는 선택자를 이름으로 찾아 「없음」으로 답해 wait 가 헛돈다.
const SELECTOR = /\/\/|\[@|\[contains\(|\[-\d+\]|(^|\/)(\.\.|\*)(\/|\[|$)/;
const newer = (c: Command) => c.inactive === true || c.camera !== undefined || [c.target, c.to].some((t) => typeof t === 'string' && t.startsWith('/') && SELECTOR.test(t));
// 옵션은 켜졌을 때만 싣는다 — 옛 명령 꼴이 그대로 남는다.
const extra = (o: FindOptions) => ({ ...(o.inactive ? { inactive: true } : {}), ...(o.camera ? { camera: o.camera } : {}) });
// 횟수 · 시간 · 세기 · via · 여러 키(A+LeftShift)는 SDK 0.6.0(touch-down 과 같은 판)부터. 옛 SDK 는 모르는 칸을 버리고 한 번만 눌러 통과한 척한다.
const INPUT = ['count', 'interval', 'via', 'duration', 'power'];
// + 는 key 명령만 본다 — pref-* 의 key 는 PlayerPrefs 키 이름이다.
const timed = (c: Command) => INPUT.some((k) => c[k] !== undefined) || (c.cmd === 'key' && typeof c.key === 'string' && c.key.includes('+'));
const at = (a: At) => (typeof a === 'string' ? { target: a } : { x: a.x, y: a.y });
// 준 칸만 싣는다 — 옛 명령 꼴이 그대로 남는다.
const given = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));
const found = (r: Record<string, unknown>): Found => ({
  path: r.path as string,
  text: r.text as string | undefined,
  interactable: r.interactable as boolean | undefined,
  id: r.id as string | undefined,
  x: r.x as number | undefined,
  y: r.y as number | undefined,
  active: r.active === false ? false : undefined,
});
// 기다린 값과 같은가 — CLI 인자는 늘 글자라 '10' · '[0, 1, 0]' 을 JSON 으로도 읽어 견준다.
const sameValue = (got: unknown, want: unknown) => {
  const g = JSON.stringify(got);
  if (g === JSON.stringify(want)) return true;
  if (typeof want !== 'string') return false;
  try {
    return g === JSON.stringify(JSON.parse(want));
  } catch {
    return false;
  }
};
const sleep = (ms: number) => new Promise((ok) => setTimeout(ok, ms));

export class Game {
  /** wait · wait-prop 의 기본 한도 — CLI 가 세션의 config --wait 로 덮는다 */
  waitMs = WAIT.timeoutMs;

  /** caps 는 그 게임 SDK 의 명령 목록 — 세션 파일에서 받고 ping 마다 새로 적는다. 없으면(옛 SDK) 다 보낸다 */
  constructor(
    private readonly link: Link,
    public caps?: string[],
  ) {}

  /** 명령 하나를 그대로 보낸다 — caps 밖이면 보내기 전에, 실패 답이면 던진다(MCP 가 commands.json 의 명령을 이 길로 보낸다) */
  async call(command: Command): Promise<Reply> {
    if (this.caps && !this.caps.includes(command.cmd))
      throw new Error(`이 게임의 SDK 는 ${command.cmd} 를 못 합니다(할 수 있는 것: ${this.caps.join(' · ')}) — SDK 를 올립니다`);
    if (this.caps && !this.caps.includes('find-all') && newer(command)) throw new Error('이 게임의 SDK 는 선택자 · inactive · camera 를 못 읽습니다 — SDK 0.5.0 이상으로 올립니다');
    if (this.caps && !this.caps.includes('touch-down') && timed(command)) throw new Error('이 게임의 SDK 는 횟수 · 시간 · 세기 · 여러 키 · via 를 못 읽습니다 — SDK 0.6.0 이상으로 올립니다');
    // SDK 의 count 는 int 칸이라 1.5 를 어떻게 읽을지 정해져 있지 않다.
    if (command.count !== undefined && !Number.isInteger(command.count)) throw new Error('count 는 정수입니다');
    const reply = await this.link(command);
    if (reply.ok !== true) throw new Error(reply.error ?? `게임이 실패로 답했습니다: ${JSON.stringify(reply)}`);
    return reply;
  }

  async ping(): Promise<PingReply> {
    const reply = (await this.call({ cmd: 'ping' })) as unknown as PingReply;
    // 게임이 보낸 값이라 꼴을 본다 — 글자 하나면 includes 가 글자 일부로 맞춘다. 꼴이 틀리면 옛 SDK 처럼 다 보낸다.
    const caps: unknown = reply.caps;
    this.caps = Array.isArray(caps) && caps.every((c) => typeof c === 'string') ? caps : undefined;
    return reply;
  }

  async tree(): Promise<TreeReply> {
    return (await this.call({ cmd: 'tree' })) as unknown as TreeReply;
  }

  /** 켜진 오브젝트 중에 없으면 null. 여럿이 맞으면 던진다 — target 은 이름 · 경로 · 선택자(//*[@tag=Player]) */
  async find(target: string, o: FindOptions = {}): Promise<Found | null> {
    const r = await this.call({ cmd: 'find', target, ...extra(o) });
    return r.found === true ? found(r) : null;
  }

  /** 맞는 것 전부 — 없으면 빈 목록 */
  async findAll(target: string, o: FindOptions = {}): Promise<Found[]> {
    return ((await this.call({ cmd: 'find-all', target, ...extra(o) })).found as Record<string, unknown>[]).map(found);
  }

  /** 화면 좌표(왼쪽 아래가 0,0)의 맨 위 — UI Toolkit · uGUI · 물리 차례. 없으면 null */
  async findAt(x: number, y: number, o: { camera?: string } = {}): Promise<Found | null> {
    const r = await this.call({ cmd: 'find-at', x, y, ...extra(o) });
    return r.found === true ? found(r) : null;
  }

  /** 부모 — 뿌리면 null. 경로에 .. 를 붙여 찾는다 */
  async parent(target: string, o: { inactive?: boolean } = {}): Promise<Found | null> {
    const f = await this.find(target, o);
    if (f === null) throw new Error(`${o.inactive ? '' : '켜진 '}오브젝트 중에 ${target} 이 없습니다`);
    return this.find(`${f.path}/..`, o);
  }

  async click(target: string, o: { camera?: string } & PressOptions = {}): Promise<void> {
    await this.call({ cmd: 'click', target, ...extra(o), ...given({ count: o.count, interval: o.interval }) });
  }

  /** via 는 사이에 지날 자리 주소들, duration 은 처음부터 끝까지의 초 */
  async drag(target: string, to: string, o: { camera?: string; via?: string[]; duration?: number } = {}): Promise<void> {
    await this.call({ cmd: 'drag', target, to, ...extra(o), ...given({ via: o.via?.length ? o.via : undefined, duration: o.duration }) });
  }

  /** 넣은 뒤 칸의 글자를 돌려준다 — 글자 수 제한 · 거르기가 자른 결과(비밀번호 칸은 ***) */
  async type(target: string, text: string): Promise<string> {
    return (await this.call({ cmd: 'type', target, text })).text as string;
  }

  async text(target: string): Promise<string> {
    const found = await this.find(target);
    if (found === null) throw new Error(`켜진 오브젝트 중에 ${target} 이 없습니다`);
    if (found.text === undefined) throw new Error(`${target} 에는 글자(Text · InputField · TMP · UI Toolkit)가 없습니다`);
    return found.text;
  }

  /** prop 은 「컴포넌트.칸」 — 'PlayerController.moveSpeed' · 'Transform.position'. UI Toolkit 요소는 요소 칸 — 'value' · 'text' */
  async get(target: string, prop: string, o: { inactive?: boolean } = {}): Promise<unknown> {
    return (await this.call({ cmd: 'get', target, prop, ...extra(o) })).value;
  }

  /** 칸 값이 value 가 될 때까지 get 을 되풀이한다 — '10' · 10 · '[0, 1, 0]' 처럼 글자로 줘도 견준다. 오브젝트 · 칸이 없으면 바로 던진다 */
  async waitForProp(target: string, prop: string, value: unknown, o: { timeoutMs?: number; inactive?: boolean } = {}): Promise<void> {
    const timeoutMs = o.timeoutMs ?? this.waitMs;
    const end = Date.now() + timeoutMs;
    for (;;) {
      const got = await this.get(target, prop, { inactive: o.inactive });
      if (sameValue(got, value)) return;
      if (Date.now() >= end)
        throw new Error(`${target} 의 ${prop} 이 ${timeoutMs / 1000}초 안에 ${typeof value === 'string' ? value : JSON.stringify(value)} 이 되지 않았습니다 (마지막: ${JSON.stringify(got)})`);
      await sleep(WAIT.intervalMs);
    }
  }

  /** 붙은 컴포넌트 — name 은 타입 이름, type 은 전체 이름 */
  async components(target: string, o: { inactive?: boolean } = {}): Promise<{ name: string; type: string }[]> {
    return (await this.call({ cmd: 'components', target, ...extra(o) })).components as { name: string; type: string }[];
  }

  async members(target: string, component: string, o: { inactive?: boolean } = {}): Promise<Members> {
    const r = await this.call({ cmd: 'members', target, component, ...extra(o) });
    return { fields: r.fields as Member[], properties: r.properties as Member[], methods: r.methods as Members['methods'] };
  }

  /** 글자 컴포넌트(Text · TMP · UI Toolkit Label/Button)의 글자를 바꾸고 다시 읽은 글자를 돌려준다 — 입력칸은 type */
  async setText(target: string, text: string, o: { inactive?: boolean } = {}): Promise<string> {
    return (await this.call({ cmd: 'text-set', target, text, ...extra(o) })).text as string;
  }

  async waitFor(target: string, options: WaitOptions = {}): Promise<void> {
    const timeoutMs = options.timeoutMs ?? this.waitMs;
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
  async tap(x: number, y: number, o: PressOptions = {}): Promise<void> {
    await this.call({ cmd: 'tap', x, y, ...given({ count: o.count, interval: o.interval }) });
  }

  /** 키 누르기 — KeyCode 이름(Escape · Space · Return · I · Alpha1 · F1 · Mouse0), A+LeftShift 는 함께. duration 동안(기본 한 프레임). Escape 는 폰 뒤로 키와 같다 */
  async key(name: string, o: { duration?: number; power?: number } = {}): Promise<void> {
    await this.call({ cmd: 'key', key: name, ...given({ duration: o.duration, power: o.power }) });
  }

  /** 손가락을 눌러 둔다 — 돌려준 번호(10~19)로 touchMove · touchUp */
  async touchDown(a: At, o: { camera?: string } = {}): Promise<number> {
    return (await this.call({ cmd: 'touch-down', ...at(a), ...extra(o) })).finger as number;
  }

  async touchMove(finger: number, a: At, o: { camera?: string } = {}): Promise<void> {
    await this.call({ cmd: 'touch-move', finger, ...at(a), ...extra(o) });
  }

  async touchUp(finger: number): Promise<void> {
    await this.call({ cmd: 'touch-up', finger });
  }

  /** 좌표로 끌기 — 한 손가락이 점을 차례로 지난다(살펴볼 때만 — 케이스는 drag) */
  async swipe(points: { x: number; y: number }[], o: { duration?: number } = {}): Promise<void> {
    await this.call({ cmd: 'swipe', points: points.map((p) => `${p.x},${p.y}`), ...given({ duration: o.duration }) });
  }

  /** 길게 누르기 — duration 초(기본 1) */
  async longPress(a: At, o: { duration?: number; camera?: string } = {}): Promise<void> {
    await this.call({ cmd: 'long-press', ...at(a), ...extra(o), ...given({ duration: o.duration }) });
  }

  /** 가짜 마우스를 옮긴다 — hover. 끄기는 resetInput */
  async mouseMove(a: At, o: { duration?: number; camera?: string } = {}): Promise<void> {
    await this.call({ cmd: 'mouse-move', ...at(a), ...extra(o), ...given({ duration: o.duration }) });
  }

  /** 마우스 바퀴 — dy 는 바퀴 칸(위가 +). at 을 주면 먼저 그리로 옮긴다(폰은 준다) */
  async scroll(dy: number, o: { dx?: number; at?: At; duration?: number; camera?: string } = {}): Promise<void> {
    await this.call({ cmd: 'scroll', dy, ...(o.at === undefined ? {} : at(o.at)), ...extra(o), ...given({ dx: o.dx, duration: o.duration }) });
  }

  /** 키를 눌러 둔다 — A+LeftShift 는 함께. power 는 GetAxis 값 · JoystickButton16~19 의 스틱 값 */
  async keyDown(keys: string, o: { power?: number } = {}): Promise<void> {
    await this.call({ cmd: 'key-down', key: keys, ...given({ power: o.power }) });
  }

  async keyUp(keys: string): Promise<void> {
    await this.call({ cmd: 'key-up', key: keys });
  }

  /** 기울이기 — 가속도(g)를 duration 동안(기본 한 프레임) 대신한다 */
  async tilt(acceleration: [number, number, number], o: { duration?: number } = {}): Promise<void> {
    const [x, y, z] = acceleration;
    await this.call({ cmd: 'tilt', x, y, z, ...given({ duration: o.duration }) });
  }

  /** GameObject 하나에 Pointer 이벤트를 바로 보낸다 */
  async pointer(target: string, event: PointerAction): Promise<void> {
    await this.call({ cmd: 'pointer', target, event });
  }

  /** 가짜 입력을 다 거둔다 — 눌러 둔 손가락 · 키 · 가짜 마우스 · 기울기 */
  async resetInput(): Promise<void> {
    await this.call({ cmd: 'input-reset' });
  }

  /** 컴포넌트 메서드를 부른다 — method 는 「컴포넌트.메서드」. 인자는 글자로 보내고 SDK 가 그 메서드 칸 타입으로 바꾼다 */
  async callMethod(target: string, method: string, args: (string | number | boolean)[] = [], o: { inactive?: boolean } = {}): Promise<unknown> {
    return (await this.call({ cmd: 'call', target, method, args: args.map(String), ...extra(o) })).value;
  }

  /** 컴포넌트 칸을 쓰고 다시 읽은 값을 돌려준다 — value 는 get 이 주는 꼴의 글자('2.5' · 'true' · '[0,1,0]') */
  async set(target: string, prop: string, value: string, o: { inactive?: boolean } = {}): Promise<unknown> {
    return (await this.call({ cmd: 'set', target, prop, value, ...extra(o) })).value;
  }

  /** static 메서드 — method 는 「타입.메서드」(전체 이름 또는 하나뿐인 짧은 이름) */
  async callStatic(method: string, args: (string | number | boolean)[] = []): Promise<unknown> {
    return (await this.call({ cmd: 'static-call', method, args: args.map(String) })).value;
  }

  /** prop 은 「타입.칸[.칸…]」 — 'UnityEngine.Time.timeScale' */
  async getStatic(prop: string): Promise<unknown> {
    return (await this.call({ cmd: 'static-get', prop })).value;
  }

  async setStatic(prop: string, value: string): Promise<unknown> {
    return (await this.call({ cmd: 'static-set', prop, value })).value;
  }

  /** 저장 값 — 없으면 null */
  async pref(key: string, type: PrefType = 'string'): Promise<string | number | null> {
    const r = await this.call({ cmd: 'pref-get', key, type });
    return r.found === true ? (r.value as string | number) : null;
  }

  /** 넣고 바로 디스크에 쓴다 — 게임이 죽어도 남는다 */
  async setPref(key: string, value: string | number, type: PrefType = 'string'): Promise<void> {
    await this.call({ cmd: 'pref-set', key, value: String(value), type });
  }

  async deletePref(key: string): Promise<void> {
    await this.call({ cmd: 'pref-delete', key });
  }

  async clearPrefs(): Promise<void> {
    await this.call({ cmd: 'pref-clear' });
  }

  /** 시간 배율 — 1 이 보통, 0 은 멈춤 */
  async timeScale(): Promise<number> {
    return (await this.call({ cmd: 'timescale-get' })).timeScale as number;
  }

  async setTimeScale(scale: number): Promise<void> {
    await this.call({ cmd: 'timescale-set', scale });
  }

  async scenes(): Promise<Scenes> {
    const r = await this.call({ cmd: 'scenes' });
    return { active: r.active as string, loaded: r.loaded as string[], loads: r.loads as number, unloads: r.unloads as number };
  }

  /** 빌드에 넣은 장면을 열고 다 열릴 때까지 기다린다 — add 면 지금 장면 위에 더하고, 아니면 그 장면이 지금 장면이 될 때까지 */
  async loadScene(name: string, options: { add?: boolean; timeoutMs?: number } = {}): Promise<void> {
    const r = await this.call({ cmd: 'scene-load', name, ...(options.add ? { mode: 'add' } : {}) });
    // 게임이 답한 뒤 열린 수가 늘어야 이번 열기다 — 같은 장면을 다시 열면 이름만으로는 열기 전과 같다.
    const loads = r.loads as number;
    await this.untilScenes((s) => s.loads > loads && s.loaded.includes(name) && (options.add === true || s.active === name), `${name} 이 열리지 않았습니다`, options.timeoutMs);
  }

  /** 열린 장면 하나를 닫고 다 닫힐 때까지 기다린다 */
  async unloadScene(name: string, options: { timeoutMs?: number } = {}): Promise<void> {
    const unloads = (await this.call({ cmd: 'scene-unload', name })).unloads as number;
    await this.untilScenes((s) => s.unloads > unloads, `${name} 이 닫히지 않았습니다`, options.timeoutMs);
  }

  /** 게임이 스스로 장면을 바꿀 때 — 지금 장면이 name 이 될 때까지 */
  async waitForScene(name: string, options: { timeoutMs?: number } = {}): Promise<void> {
    await this.untilScenes((s) => s.active === name, `지금 장면이 ${name} 이 되지 않았습니다`, options.timeoutMs);
  }

  private async untilScenes(done: (s: Scenes) => boolean, want: string, timeoutMs = WAIT.sceneMs): Promise<void> {
    const end = Date.now() + timeoutMs;
    for (;;) {
      const s = await this.scenes();
      if (done(s)) return;
      if (Date.now() >= end) throw new Error(`${timeoutMs / 1000}초 안에 ${want} (지금 ${s.active} · 열린 것 ${s.loaded.join(' · ')})`);
      await new Promise((ok) => setTimeout(ok, WAIT.intervalMs));
    }
  }

  /** 게임이 프레임 끝에서 찍은 화면 — Appium 이 없는 PC · iOS · 이미 켠 USB 게임용. png 는 무손실(SDK 0.5.0 부터) */
  async screenshot(format: 'jpg' | 'png' = 'jpg'): Promise<Buffer> {
    const r = await this.call({ cmd: 'screenshot', ...(format === 'png' ? { format } : {}) });
    const data = r[format];
    if (typeof data !== 'string') throw new Error(format === 'png' ? '게임이 PNG 스크린샷을 주지 않았습니다 — PNG 는 SDK 0.5.0 이상' : '게임이 스크린샷을 주지 않았습니다');
    return Buffer.from(data, 'base64');
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
