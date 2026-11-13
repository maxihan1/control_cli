// 테스트용 가짜 게임 SDK 와 가짜 디바이스 팜 — 폰 없이 CLI · 창 훑기를 돌려 본다
import { spawn } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import { createServer as createNetServer, type AddressInfo, type Server as NetServer } from 'node:net';

import type { Node, PointerAction } from './game.js';
import type { Command, Reply } from './link.js';
import { COMMANDS, FEATURES } from './protocol.js';
import { one, pathOf, select, steps, type View } from './select.js';
import type { Step } from './recorder.js';
import { packet } from './usbmux.js';

export interface FakeNode extends Node {
  children?: FakeNode[];
  onClick?: () => void;
  props?: Record<string, unknown>;
  password?: boolean;
  /** type 이 넣을 글자를 거른다 — 입력칸의 글자 수 · 거르기 흉내 */
  accept?: (text: string) => string;
  /** drag 하면 놓은 자리의 자식으로 옮긴다 — 샘플 Bag/Slot 의 Item 흉내 */
  movable?: boolean;
  /** call 이 부르는 컴포넌트 메서드 — 「컴포넌트.메서드」, 인자는 SDK 처럼 글자로 온다 */
  methods?: Record<string, (...args: string[]) => unknown>;
  /** set — 바꾼 뒤 읽은 값, 그런 칸이 없으면 undefined */
  set?: (prop: string, value: string) => unknown;
  tag?: string;
  layer?: string;
  /** 붙은 컴포넌트 전체 이름 — UnityEngine.UI.Button · Sample.TouchProbe */
  components?: string[];
  /** instance id 흉내 — node() 가 늘어나는 번호를 준다(다시 만든 장면은 새 번호). 영구 id 흉내는 직접 준다 */
  id?: string;
  /** 꺼진 오브젝트 — inactive 로만 보인다 */
  active?: false;
  /** 화면 가운데(Camera.main) · 카메라 이름별 자리 */
  at?: [number, number];
  atBy?: Record<string, [number, number]>;
  /** members 답 — 컴포넌트 이름별 */
  members?: Record<string, unknown>;
  /** touch · long-press · mouse-move · pointer 가 부르는 Pointer 이벤트 — up 은 누른 초 */
  onPointer?: (event: PointerAction, seconds?: number) => void;
  /** 바퀴 · swipe — dy 는 바퀴 칸(위가 +, 손가락을 위로 밀면 −) */
  onScroll?: (dy: number) => void;
}

let ids = 0;
export const node = (name: string, extra: Partial<FakeNode> = {}, children?: FakeNode[]): FakeNode => ({ name, id: String(++ids), ...extra, ...(children ? { children } : {}) });
const INPUTS = ['InputField', 'TMP_InputField', 'TextField'];
const short = (full: string) => full.slice(full.lastIndexOf('.') + 1);
export const button = (name: string, label: string, onClick?: () => void): FakeNode => node(name, { kind: 'Button', interactable: true, onClick }, [node('Text', { text: label })]);
// SDK 처럼 입력 명령 하나는 8초 안 — SDK 답 한도 10초 · 팜 15초
// SDK 처럼 프레임 바닥도 센다(느린 폰 30fps) — 누를 때마다 2프레임, drag · swipe 는 마디마다 10프레임
const frames = (c: Command) =>
  (c.cmd === 'tap' || c.cmd === 'click' ? Number(c.count ?? 1) * 2 : 0)
  + (c.cmd === 'drag' ? (((c.via as unknown[] | undefined) ?? []).length + 1) * 10 : 0)
  + (c.cmd === 'swipe' ? Math.max(((c.points as unknown[] | undefined) ?? []).length - 1, 0) * 10 : 0);
const tooLong = (c: Command) => Math.max(Number(c.duration ?? 0), 0) + Math.max(Number(c.count ?? 1) - 1, 0) * Math.max(Number(c.interval ?? 0.1), 0) + frames(c) / 30 > 8;
// SDK Limits 와 같은 차례 · 문구 — count · power 를 먼저 본다
const limits = (c: Command) =>
  Number(c.count ?? 1) < 1 ? 'count 는 1 이상입니다'
  : Math.abs(Number(c.power ?? 1)) > 1 ? 'power 는 -1~1 입니다'
  : tooLong(c) ? `${c.cmd} 은 8초 안이어야 합니다 — 더 길게는 touch-down · key-down 뒤 touch-up · key-up` : undefined;
const FINGERS = Array.from({ length: 10 }, (_, i) => 10 + i);
const keysOf = (c: Command) => String(c.key).split('+').map((k) => k.trim());

// SDK Feed.Mask 와 같다 — 영숫자 · _ · - 가 40자 넘게 이어진 토막(토큰)을 가린다(Issue Bunker nginx 규칙)
const mask = (s: string) => s.replace(/[A-Za-z0-9_-]{40,}/g, '***');
const STAMP = '2026-11-04T00:00:00.000Z';
const SCREEN = [2400, 1080];
// SDK SdkLog 와 같은 줄 — 이름 칸은 그대로, 값 칸은 「이름=***」, 실패 글 속 입력값도 ***. 알림 읽기와 sdk-log 자신은 안 적는다
const NAMED = ['target', 'to', 'name', 'method', 'prop', 'key'];
const SECRET = ['text', 'value', 'args'];
const QUIET = ['logs', 'events', 'errors', 'sdk-log'];
const valuesOf = (c: Command, k: string) => (Array.isArray(c[k]) ? (c[k] as unknown[]).map(String) : typeof c[k] === 'string' ? [c[k] as string] : []).filter((s) => s !== '');
function sdkLine(c: Command, r: Reply): string {
  const head = ['[ControlCli]', c.cmd, ...NAMED.filter((k) => typeof c[k] === 'string' && c[k] !== '').map((k) => c[k] as string), ...SECRET.filter((k) => valuesOf(c, k).length > 0).map((k) => `${k}=***`)];
  if (r.ok) return `${head.join(' ')} — 성공`;
  const error = SECRET.flatMap((k) => valuesOf(c, k)).reduce((e, s) => e.split(s).join('***'), String(r.error ?? ''));
  return `${head.join(' ')} — 실패: ${error}`;
}

export class FakeGame {
  clicks: string[] = [];
  keys: string[] = [];
  commands: Command[] = [];
  /** SDK 의 Caps 흉내 — 테스트가 빼서 옛 SDK · 다른 엔진을 흉내 낸다 */
  caps: string[] = [...COMMANDS, ...FEATURES];
  onBack?: () => void;
  onKey?: (key: string) => void;
  /** static 칸 · 메서드 — 「타입.칸」 */
  statics: Record<string, unknown> = {};
  staticMethods: Record<string, (...args: string[]) => unknown> = {};
  prefs = new Map<string, string | number>();
  timeScale = 1;
  /** 장면 이름 → 그 장면을 열 때 만드는 뿌리(샘플은 장면이 열릴 때마다 코드로 채운다). 없는 이름은 빌드에 없는 장면 */
  sceneRoots: Record<string, (add: boolean) => FakeNode[]> = {};
  loaded: { name: string; nodes: FakeNode[] }[];
  loads = 0;
  unloads = 0;
  /** scenes 를 이만큼 물을 때까지 장면이 열리는 중 — Infinity 면 끝내 안 열린다 */
  loadDelay = 0;
  /** get 을 받을 때마다 — 테스트가 값이 늦게 바뀌는 게임을 흉내 낸다 */
  onGet?: () => void;
  /** 눌러 둔 손가락 — 번호 → 누른 것 · 지금 위에 있는 것(touch-up 때 끌기 흉내) */
  fingers = new Map<number, { node?: FakeNode; over?: FakeNode }>();
  /** 눌러 둔 키 → 세기 */
  held = new Map<string, number>();
  /** 가짜 마우스가 올라간 것 */
  hovered?: FakeNode;
  /** tilt 의 y — 표준 화면 탐침처럼 절댓값 10 넘는 값만 남긴다 */
  tilted?: number;
  /** 입력 명령마다 — 표준 화면이 InputText 를 다시 쓴다 */
  onInput?: () => void;
  /** 게임 로그 · 알림 — 번호는 자리 + 1. SDK 처럼 로그는 넣을 때 토큰을 가린다 */
  logs: Record<string, unknown>[] = [];
  events: Record<string, unknown>[] = [];
  /** sdk-log 켬 — 받은 명령마다 SDK 와 같은 한 줄을 logs 에 */
  sdkLog = false;
  private pending?: { left: number; open: () => void };

  log(type: string, message: string): void {
    this.logs.push({ occurredAt: STAMP, type, message: mask(message), stack: '' });
  }

  event(e: Record<string, unknown>): void {
    this.events.push({ occurredAt: STAMP, ...e });
  }

  /** 앱이 뒤로 갔다 돌아온다 — Appium backgroundApp 흉내 */
  background(): void {
    this.event({ type: 'game.paused' });
    this.event({ type: 'game.resumed' });
  }

  constructor(
    public roots: FakeNode[],
    public scene = 'Boot',
  ) {
    this.loaded = [{ name: scene, nodes: roots }];
  }

  private parentOf(child: FakeNode, nodes: FakeNode[] = this.roots): FakeNode | undefined {
    for (const n of nodes) {
      if (n.children?.includes(child)) return n;
      const p = this.parentOf(child, n.children ?? []);
      if (p) return p;
    }
    return undefined;
  }

  // SDK 가 보는 트리 — inactive 가 아니면 꺼진 것을 뺀다. 선택자 칸은 Select.cs 의 Attr 과 같은 뜻.
  private view(all: boolean): View<FakeNode> {
    const shown = (ns: FakeNode[]) => (all ? ns : ns.filter((n) => n.active !== false));
    return {
      roots: shown(this.roots),
      children: (n) => shown(n.children ?? []),
      attr: (n, k) => {
        const v = k === 'name' ? n.name : k === 'text' ? (n.password && n.text ? '***' : n.text) : k === 'tag' ? n.tag : k === 'layer' ? n.layer : k === 'id' ? n.id : undefined;
        if (k === 'component') return (n.components ?? []).flatMap((c) => [short(c), c]);
        return v === undefined ? [] : [v];
      },
    };
  }

  // SDK 의 Tree.Find 와 같은 규칙 — select.ts. 없음은 {}, 여럿 · 틀린 꼴은 error
  private find(target: string, all = false): { node?: FakeNode; path?: string; trail?: FakeNode[]; error?: string } {
    const v = this.view(all);
    try {
      const path = steps(target);
      const r = one(target, select(path, v), !all, path);
      if (r.trail) return { node: r.trail[r.trail.length - 1], trail: r.trail, path: pathOf(r.trail, v) };
      return r.missing ? {} : { error: r.problem };
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e) };
    }
  }

  // find · find-all · find-at 답 한 칸 — SDK 의 Found 와 같은 꼴
  private found(trail: FakeNode[], all: boolean, camera?: string): Record<string, unknown> {
    const n = trail[trail.length - 1];
    const active = trail.every((x) => x.active !== false);
    const at = camera ? n.atBy?.[camera] : n.at;
    return {
      path: pathOf(trail, this.view(all)),
      ...(n.text !== undefined ? { text: n.text } : {}),
      ...(n.kind ? { interactable: n.interactable } : {}),
      ...(n.id ? { id: n.id } : {}),
      ...(active && at ? { x: at[0], y: at[1] } : {}),
      // 가짜 사각형은 자리 둘레 100×100 — rect 를 빼면 옛 SDK(0.7.0)처럼 rect · screen 을 안 준다.
      ...(active && at && this.caps.includes('rect') ? { rect: [at[0] - 50, at[1] - 50, 100, 100] } : {}),
      ...(active ? {} : { active: false }),
      ...(this.caps.includes('rect') ? { screen: SCREEN } : {}),
    };
  }

  private cameraProblem(camera: unknown): string | undefined {
    if (camera === undefined) return undefined;
    const f = this.find(camera as string);
    if (f.error || !f.node) return f.error ?? `켜진 오브젝트 중에 ${camera as string} 이 없습니다`;
    return f.node.components?.some((c) => short(c) === 'Camera') ? undefined : `${camera as string} 에 Camera 가 없습니다`;
  }

  // 좌표의 맨 위 — find-at 과 같은 맞춤(가짜 자리는 점 하나)
  private hit(x: unknown, y: unknown, camera?: string): FakeNode[] | undefined {
    return select(steps('//*'), this.view(false)).trails.find((t) => {
      const n = t[t.length - 1];
      const at = camera ? n.atBy?.[camera] : n.at;
      return at?.[0] === x && at?.[1] === y;
    });
  }

  // 한 점 명령의 자리 — SDK 처럼 target 이 있으면 그 오브젝트, 없으면 x · y
  private point(c: Command, f: { node?: FakeNode }): { node?: FakeNode; x: number; y: number } | { error: string } {
    if (typeof c.target === 'string') {
      if (!f.node) return { error: `켜진 오브젝트 중에 ${c.target} 이 없습니다` };
      const [x, y] = (c.camera ? f.node.atBy?.[c.camera as string] : f.node.at) ?? [1, 1];
      return { node: f.node, x, y };
    }
    if (typeof c.x !== 'number' || typeof c.y !== 'number') return { error: `${c.cmd} 에 target 또는 x · y 가 필요합니다` };
    const hit = this.hit(c.x, c.y);
    return { node: hit?.[hit.length - 1], x: c.x, y: c.y };
  }

  // drag · touch-up — 움직일 수 있으면 놓은 자리의 자식으로(샘플 Bag/Slot 의 Item)
  private move(node: FakeNode, to: FakeNode): void {
    if (!node.movable) return;
    const parent = this.parentOf(node);
    if (parent) parent.children = parent.children!.filter((x) => x !== node);
    else this.roots = this.roots.filter((x) => x !== node);
    (to.children ??= []).push(node);
  }

  // 가짜 마우스 — 올라간 것이 바뀌면 exit · enter
  private hover(node?: FakeNode): void {
    if (node === this.hovered) return;
    this.hovered?.onPointer?.('exit');
    node?.onPointer?.('enter');
    this.hovered = node;
  }

  handle(c: Command): Reply {
    const r = this.reply(c);
    if (this.sdkLog && !QUIET.includes(c.cmd)) this.log('Log', sdkLine(c, r));
    return r;
  }

  private reply(c: Command): Reply {
    this.commands.push(c);
    // 트리는 켜진 것만 — SDK 의 Tree.Dump 처럼.
    const on = (ns: FakeNode[] = []) => ns.filter((n) => n.active !== false);
    const strip = (n: FakeNode): Node => ({ name: n.name, ...(n.text !== undefined ? { text: n.text } : {}), ...(n.kind ? { kind: n.kind, interactable: n.interactable } : {}), ...(on(n.children).length ? { children: on(n.children).map(strip) } : {}) });
    const all = c.inactive === true;
    // find-all 은 여럿이 맞아도 된다 — 따로 고른다.
    const f = typeof c.target === 'string' && c.cmd !== 'find-all' ? this.find(c.target, all) : {};
    if (f.error) return { ok: false, error: f.error };
    const camera = this.cameraProblem(c.camera);
    if (camera) return { ok: false, error: camera };
    const limit = limits(c);
    if (limit) return { ok: false, error: limit };
    switch (c.cmd) {
      case 'ping':
        return { ok: true, app: 'com.fake.game', version: '1.0', engine: 'fake', engineVersion: '0', sdkVersion: '0.3.0', protocol: 2, caps: this.caps };
      case 'tree':
        return { ok: true, scene: this.scene, screen: SCREEN, tree: on(this.roots).map(strip) };
      case 'find':
        return f.trail ? { ok: true, found: true, ...this.found(f.trail, all, c.camera as string | undefined) } : { ok: true, found: false };
      case 'find-all':
        try {
          const v = this.view(all);
          return { ok: true, found: select(steps(c.target as string), v).trails.map((t) => this.found(t, all, c.camera as string | undefined)) };
        } catch (e) {
          return { ok: false, error: e instanceof Error ? e.message : String(e) };
        }
      case 'find-at': {
        const hit = this.hit(c.x, c.y, c.camera as string | undefined);
        return hit ? { ok: true, found: true, ...this.found(hit, false, c.camera as string | undefined) } : { ok: true, found: false };
      }
      case 'components':
        if (!f.node) return { ok: false, error: `켜진 오브젝트 중에 ${c.target as string} 이 없습니다` };
        return { ok: true, components: (f.node.components ?? []).map((t) => ({ name: short(t), type: t })) };
      case 'members': {
        const m = f.node?.members?.[c.component as string];
        return m ? { ok: true, ...(m as object) } : { ok: false, error: `${c.target as string} 에 ${c.component as string} 컴포넌트가 없습니다` };
      }
      case 'text-set':
        if (!f.node) return { ok: false, error: `켜진 오브젝트 중에 ${c.target as string} 이 없습니다` };
        if (INPUTS.includes(f.node.kind ?? '')) return { ok: false, error: `${c.target as string} 은 입력칸이라 type 으로 넣습니다` };
        if (f.node.text === undefined) return { ok: false, error: `${c.target as string} 에 글자 컴포넌트(Text · TMP_Text · UI Toolkit Label/Button)가 없습니다` };
        f.node.text = c.text as string;
        return { ok: true, text: f.node.text };
      case 'click':
        if (!f.node) return { ok: false, error: `켜진 오브젝트 중에 ${c.target as string} 이 없습니다` };
        this.clicks.push(f.path!);
        for (let i = 0; i < Number(c.count ?? 1); i++) f.node.onClick?.();
        return { ok: true, x: 1, y: 1 };
      case 'drag': {
        const to = this.find(c.to as string);
        if (!f.node || !to.node || ((c.via as string[] | undefined) ?? []).some((v) => !this.find(v).node)) return { ok: false, error: '없음' };
        this.move(f.node, to.node);
        return { ok: true, x: 1, y: 1 };
      }
      case 'type':
        if (!f.node) return { ok: false, error: '없음' };
        f.node.text = f.node.accept ? f.node.accept(c.text as string) : (c.text as string);
        return { ok: true, text: f.node.password ? '***' : f.node.text };
      case 'get':
        this.onGet?.();
        return f.node?.props && (c.prop as string) in f.node.props ? { ok: true, value: f.node.props[c.prop as string] } : { ok: false, error: `${c.prop as string} 칸이 없습니다` };
      case 'errors':
        return { ok: true, last: 0, errors: [] };
      case 'logs':
      case 'events': {
        const items = c.cmd === 'logs' ? this.logs : this.events;
        const since = Number(c.since ?? 0);
        return { ok: true, last: items.length, [c.cmd]: items.slice(since).map((x, i) => ({ seq: since + i + 1, ...x })) };
      }
      case 'sdk-log':
        this.sdkLog = c.on === true;
        return { ok: true, on: this.sdkLog };
      case 'layout':
        return { ok: true, checked: 2, problems: [{ kind: 'overlap', name: 'A', path: '/C/A', other: 'B', otherPath: '/C/B' }] };
      case 'tap':
        return { ok: true, x: c.x, y: c.y };
      case 'key':
        for (const k of keysOf(c)) {
          this.keys.push(k);
          this.onKey?.(k);
          // SDK 처럼 Escape 는 뒤로 키와 같다.
          if (k === 'Escape') this.onBack?.();
        }
        return { ok: true, key: c.key };
      case 'touch-down': {
        const p = this.point(c, f);
        if ('error' in p) return { ok: false, error: p.error };
        const finger = FINGERS.find((n) => !this.fingers.has(n));
        if (finger === undefined) return { ok: false, error: '손가락 10개가 다 눌려 있습니다 — touch-up · input-reset 으로 뗍니다' };
        this.fingers.set(finger, { node: p.node });
        p.node?.onPointer?.('enter');
        p.node?.onPointer?.('down');
        this.onInput?.();
        return { ok: true, finger, x: p.x, y: p.y };
      }
      case 'touch-move':
      case 'touch-up': {
        const t = this.fingers.get(c.finger as number);
        if (!t) return { ok: false, error: `손가락 ${String(c.finger)} 은 눌려 있지 않습니다 — touch-down 이 준 번호를 씁니다` };
        if (c.cmd === 'touch-move') {
          const p = this.point(c, f);
          if ('error' in p) return { ok: false, error: p.error };
          t.over = p.node;
          return { ok: true, x: p.x, y: p.y };
        }
        if (t.node && t.over) this.move(t.node, t.over);
        t.node?.onPointer?.('up', 0);
        t.node?.onPointer?.('exit');
        this.fingers.delete(c.finger as number);
        this.onInput?.();
        return { ok: true };
      }
      case 'swipe': {
        const points = ((c.points as string[] | undefined) ?? []).map((s) => /^(-?[\d.]+),(-?[\d.]+)$/.exec(s));
        if (points.length < 2 || points.some((m) => !m)) return { ok: false, error: 'swipe 의 points 는 "x,y" 글자 둘 이상입니다 — ["540,400", "540,900"]' };
        const [a, b] = [points[0]!, points[points.length - 1]!].map((m) => [Number(m[1]), Number(m[2])]);
        // uGUI 처럼 누른 자리(첫 점)가 끌 대상이다 — 손가락을 위로 밀면 바퀴를 아래로 굴린 것과 같다.
        const hit = this.hit(a[0], a[1]);
        hit?.[hit.length - 1].onScroll?.(-Math.sign(b[1] - a[1]));
        return { ok: true, x: b[0], y: b[1] };
      }
      case 'long-press': {
        const p = this.point(c, f);
        if ('error' in p) return { ok: false, error: p.error };
        p.node?.onPointer?.('enter');
        p.node?.onPointer?.('down');
        p.node?.onPointer?.('up', Number(c.duration ?? 1));
        p.node?.onPointer?.('exit');
        return { ok: true, x: p.x, y: p.y };
      }
      case 'mouse-move': {
        const p = this.point(c, f);
        if ('error' in p) return { ok: false, error: p.error };
        this.hover(p.node);
        return { ok: true, x: p.x, y: p.y };
      }
      case 'scroll': {
        if (c.target !== undefined || c.x !== undefined) {
          const p = this.point(c, f);
          if ('error' in p) return { ok: false, error: p.error };
          this.hover(p.node);
        }
        this.hovered?.onScroll?.(c.dy as number);
        return { ok: true };
      }
      case 'key-down':
        for (const k of keysOf(c)) this.held.set(k, Number(c.power ?? 1));
        this.onInput?.();
        return { ok: true };
      case 'key-up':
        for (const k of keysOf(c)) this.held.delete(k);
        this.onInput?.();
        return { ok: true };
      case 'tilt':
        if (Math.abs(c.y as number) > 10) this.tilted = Math.round(c.y as number);
        this.onInput?.();
        return { ok: true };
      case 'pointer':
        if (!f.node) return { ok: false, error: `켜진 오브젝트 중에 ${c.target as string} 이 없습니다` };
        if (f.node.components?.some((t) => t.startsWith('UnityEngine.UIElements.'))) return { ok: false, error: `${c.target as string} 은 UI Toolkit 요소라 pointer 를 못 보냅니다 — mouse-move · touch-down 으로` };
        if (!['down', 'up', 'enter', 'exit'].includes(c.event as string)) return { ok: false, error: 'event 는 down · up · enter · exit 중 하나입니다' };
        f.node.onPointer?.(c.event as PointerAction, c.event === 'up' ? 0 : undefined);
        return { ok: true };
      case 'input-reset':
        this.fingers.clear();
        this.held.clear();
        this.hovered = undefined;
        this.onInput?.();
        return { ok: true };
      case 'screenshot':
        // PNG 는 머리 8바이트만 — 받는 쪽이 꼴을 가르는지 본다.
        if (c.format === 'png') return { ok: true, png: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).toString('base64') };
        return { ok: true, jpg: Buffer.from('jpg').toString('base64') };
      case 'call': {
        if (!f.node) return { ok: false, error: `켜진 오브젝트 중에 ${c.target as string} 이 없습니다` };
        const m = f.node.methods?.[c.method as string];
        return m ? { ok: true, value: m(...((c.args as string[] | undefined) ?? [])) ?? null } : { ok: false, error: `${c.method as string} 메서드가 없습니다` };
      }
      case 'set': {
        const v = f.node?.set?.(c.prop as string, c.value as string);
        return v === undefined ? { ok: false, error: `${c.prop as string} 칸이 없습니다` } : { ok: true, value: v };
      }
      case 'static-call': {
        const m = this.staticMethods[c.method as string];
        return m ? { ok: true, value: m(...((c.args as string[] | undefined) ?? [])) ?? null } : { ok: false, error: `${c.method as string} 메서드가 없습니다` };
      }
      case 'static-get':
      case 'static-set': {
        const prop = c.prop as string;
        if (!(prop in this.statics)) return { ok: false, error: `${prop} 칸이 없습니다` };
        if (c.cmd === 'static-set') this.statics[prop] = c.value;
        return { ok: true, value: this.statics[prop] };
      }
      case 'pref-get': {
        const v = this.prefs.get(c.key as string);
        return v === undefined ? { ok: true, found: false } : { ok: true, found: true, value: v };
      }
      case 'pref-set':
        // SDK GameState.PrefSet 처럼 실패 글에 받은 값을 싣는다 — sdk-log 가 그 값을 가리는지 본다
        if (c.type === 'int' && !/^-?\d+$/.test(String(c.value))) return { ok: false, error: `「${String(c.value)}」은 int 가 아닙니다` };
        this.prefs.set(c.key as string, c.type === 'int' || c.type === 'float' ? Number(c.value) : (c.value as string));
        return { ok: true };
      case 'pref-delete':
        this.prefs.delete(c.key as string);
        return { ok: true };
      case 'pref-clear':
        this.prefs.clear();
        return { ok: true };
      case 'timescale-get':
        return { ok: true, timeScale: this.timeScale };
      case 'timescale-set':
        this.timeScale = c.scale as number;
        return { ok: true, timeScale: this.timeScale };
      case 'scenes':
        if (this.pending && --this.pending.left <= 0) {
          this.pending.open();
          this.pending = undefined;
        }
        return { ok: true, active: this.scene, loaded: this.loaded.map((l) => l.name), loads: this.loads, unloads: this.unloads };
      case 'scene-load': {
        const name = c.name as string;
        const make = this.sceneRoots[name];
        if (!make) return { ok: false, error: `장면 ${name} 은 빌드에 없습니다` };
        // SDK 처럼 바로 답하고 장면은 뒤에 열린다 — 답의 loads 는 열기 전 수.
        const open = () => {
          const nodes = make(c.mode === 'add');
          if (c.mode === 'add') {
            this.loaded.push({ name, nodes });
            this.roots = [...this.roots, ...nodes];
          } else {
            // 한 장면 열기는 열린 장면을 닫는다 — Unity 의 sceneUnloaded 차례는 실기기로 확인 안 함
            for (const l of this.loaded) this.event({ type: 'scene.unloaded', scene: l.name });
            this.loaded = [{ name, nodes }];
            this.roots = nodes;
            this.scene = name;
          }
          this.event({ type: 'scene.loaded', scene: name, mode: c.mode === 'add' ? 'add' : 'single' });
          this.loads++;
        };
        const loads = this.loads;
        if (this.loadDelay > 0) this.pending = { left: this.loadDelay, open };
        else open();
        return { ok: true, loads };
      }
      case 'scene-unload': {
        const i = this.loaded.findIndex((l) => l.name === c.name);
        if (i < 0) return { ok: false, error: `열린 장면 중에 ${c.name as string} 이 없습니다` };
        if (this.loaded.length < 2) return { ok: false, error: '마지막 장면은 닫을 수 없습니다' };
        const [gone] = this.loaded.splice(i, 1);
        this.roots = this.roots.filter((n) => !gone.nodes.includes(n));
        this.event({ type: 'scene.unloaded', scene: gone.name });
        return { ok: true, unloads: this.unloads++ };
      }
      default:
        return { ok: false, error: `모르는 명령입니다: ${c.cmd}` };
    }
  }
}

/** 키로 칠 때처럼 영숫자만 남기고 글자 수로 자른다 — 샘플 IdInput(글자 수 8 · 영숫자) 흉내 */
export const keyFilter = (limit: number) => (text: string) => text.replace(/[^A-Za-z0-9]/g, '').slice(0, limit);

/** 표준 화면 InputText 흉내 — sample InputProbe 와 같은 꼴. 축은 옛 Input 기본 축(Horizontal — right · d 와 left · a)과 Input System 왼 스틱 x(JoystickButton16)를 함께 흉내 낸다 */
function inputLine(g: FakeGame): string {
  const has = (...k: string[]) => k.some((x) => g.held.has(x));
  const axis = has('RightArrow', 'D') ? 1 : has('LeftArrow', 'A') ? -1 : Math.round(g.held.get('JoystickButton16') ?? 0);
  const keys = ['A', 'LeftShift', 'W'].filter((k) => g.held.has(k)).join(' ') || '-';
  return `fingers ${g.fingers.size} · keys ${keys} · axis ${axis} · fire ${has('LeftControl', 'JoystickButton0') ? 1 : 0} · tilt ${g.tilted ?? '-'}`;
}

/** 표준 화면 흉내 — sample/Assets/Sample 과 같은 이름 · 같은 반응(conform 의 기대값). Sample 장면이 열릴 때마다 화면을 새로 만든다 */
export function standardScreen(idAccept = keyFilter(8)): FakeGame {
  const game = new FakeGame([], 'Sample');
  const build = (): FakeNode[] => {
    const status: FakeNode = node('StatusText', {
      text: '',
      set: (p, v) => (p === 'Text.text' ? (status.text = v) : undefined),
      props: {
        get 'Text.text'() {
          return status.text;
        },
      },
    });
    const tmpStatus = node('TmpStatusText', { text: '' });
    const uitkStatus = node('UitkStatusText', { text: '' });
    const touch = node('TouchText', { text: '' });
    const id = node('IdInput', { kind: 'InputField', interactable: true, text: '', accept: idAccept });
    const tmpId = node('TmpIdInput', { kind: 'TMP_InputField', interactable: true, text: '', accept: keyFilter(8) });
    const uitkId = node('UitkIdInput', { kind: 'TextField', interactable: true, text: '', accept: (t) => t.slice(0, 8) });
    const login = (name: string, label: string, out: FakeNode, from: FakeNode, extra: Partial<FakeNode>) => {
      let presses = 0;
      return node(name, { kind: 'Button', interactable: true, onClick: () => (out.text = `${label} ${from.text} ${++presses}`), ...extra });
    };
    const uguiButton = (at: [number, number]): Partial<FakeNode> => ({ components: ['UnityEngine.RectTransform', 'UnityEngine.UI.Image', 'UnityEngine.UI.Button'], at });
    let cubes = 0;
    const position = [0, 0, 5];
    game.onKey = (key) => (touch.text = `key ${key}`);
    // C — 입력 탐침 · Pointer 칸 · 세로 목록(sample InputProbe · PointerBox · ScrollList)
    const input = node('InputText', { text: inputLine(game) });
    game.onInput = () => (input.text = inputLine(game));
    const pointerText = node('PointerText', { text: 'last - · held -' });
    let last = '-';
    let held = '-';
    const holdBox = node('HoldBox', {
      at: [810, 900],
      components: ['UnityEngine.RectTransform', 'UnityEngine.UI.Image', 'Sample.PointerBox'],
      onPointer: (e, seconds) => {
        last = e;
        if (e === 'up') held = (seconds ?? 0).toFixed(1);
        pointerText.text = `last ${last} · held ${held}`;
      },
    });
    let scrolled = 1;
    const scrollList = node('ScrollList', {
      at: [810, 700],
      props: {
        get 'ScrollRect.verticalNormalizedPosition'() {
          return scrolled;
        },
      },
      onScroll: (dy) => (scrolled = Math.min(1, Math.max(0, scrolled + Math.sign(dy) * 0.3))),
    });
    return [
      node('WorldCube', {
        tag: 'Player',
        layer: 'Water',
        components: ['UnityEngine.Transform', 'UnityEngine.MeshFilter', 'UnityEngine.BoxCollider', 'UnityEngine.MeshRenderer'],
        at: [540, 600],
        atBy: { SideCamera: [400, 600] },
        onClick: () => (touch.text = `cube ${++cubes}`),
        props: {
          get 'Transform.position'() {
            return [...position];
          },
        },
        // SDK 처럼 칸 길 끝을 바꾸고 다시 읽은 값 — 벡터는 [x,y,z] 글자로 온다.
        set: (p, v) => {
          if (p === 'Transform.position') position.splice(0, 3, ...(JSON.parse(v) as number[]));
          else if (p === 'Transform.position.y') position[1] = Number(v);
          else return undefined;
          return p === 'Transform.position' ? [...position] : position[1];
        },
      }),
      // 화면을 덮지 않게 끈 옆 카메라 — camera 칸이 Camera.main 과 다른 자리를 셈하는지(WorldCube 의 atBy).
      node('SideCamera', { components: ['UnityEngine.Transform', 'UnityEngine.Camera'] }),
      node(
        'SampleCanvas',
        {
          methods: { 'TouchProbe.Say': (word, times) => (touch.text = `${word} ${times}`) },
          components: ['UnityEngine.RectTransform', 'UnityEngine.Canvas', 'UnityEngine.UI.CanvasScaler', 'UnityEngine.UI.GraphicRaycaster', 'Sample.TouchProbe'],
          members: {
            TouchProbe: {
              fields: [{ name: 'Output', type: 'Text', value: 'TouchText (UnityEngine.UI.Text)' }],
              properties: [{ name: 'Note', type: 'String', static: true }],
              methods: [
                { name: 'Say', args: ['String', 'Int32'], returns: 'String' },
                { name: 'Add', args: ['Int32', 'Int32'], returns: 'Int32', static: true },
              ],
            },
          },
        },
        [
          status,
          id,
          login('LoginButton', 'login', status, id, uguiButton([270, 1500])),
          touch,
          tmpStatus,
          tmpId,
          login('TmpLoginButton', 'tmp login', tmpStatus, tmpId, uguiButton([810, 1500])),
          node('Bag', {}, [node('Slot', {}, [node('Item', { movable: true })]), node('Slot'), node('Slot'), node('Slot')]),
          node('HiddenText', { active: false, text: 'hidden', props: { 'Text.text': 'hidden' } }),
          input,
          pointerText,
          holdBox,
          scrollList,
        ],
      ),
      node('UitkDocument', {}, [
        node('UitkPanel', { props: { 'layout.height': 200 } }, [
          uitkStatus,
          uitkId,
          login('UitkLoginButton', 'uitk login', uitkStatus, uitkId, { components: ['UnityEngine.UIElements.Button'], at: [540, 200], text: 'UITK Login', props: { text: 'UITK Login' } }),
        ]),
      ]),
    ];
  };
  // Second 를 한 장면으로 열면 EventSystem 없는 UI Toolkit 칸(sample SampleUitk.BuildSecond) — 더해 열면 Sample 의 EventSystem 이 있어 만들지 않는다.
  const second = (): FakeNode[] => {
    const text = node('SecondText', { text: '' });
    let presses = 0;
    let offset = 0;
    return [
      node('SecondDocument', {}, [
        node('SecondPanel', {}, [
          text,
          node('SecondButton', {
            kind: 'Button',
            interactable: true,
            text: 'Second',
            components: ['UnityEngine.UIElements.Button'],
            at: [540, 300],
            onClick: () => (text.text = `second ${++presses}`),
            onPointer: (e) => (e === 'enter' ? (text.text = 'enter') : undefined),
          }),
          node('SecondScroll', {
            components: ['UnityEngine.UIElements.ScrollView'],
            at: [540, 150],
            props: {
              get scrollOffset() {
                return [0, offset];
              },
            },
            onScroll: (dy) => (offset = Math.max(0, offset - dy * 18)),
          }),
        ]),
      ]),
    ];
  };
  // SecondSaved 는 장면에 저장된 오브젝트 흉내 — 영구 id 가 다시 열어도 같다. SecondMarker 는 실행 중에 만들어 열 때마다 새 id.
  game.sceneRoots = { Sample: build, Second: (add) => [node('SecondMarker'), node('SecondSaved', { id: 'saved-1' }), ...(add ? [] : second())] };
  game.roots = build();
  game.loaded = [{ name: 'Sample', nodes: game.roots }];
  game.statics = { 'Sample.TouchProbe.Note': null };
  game.staticMethods = { 'Sample.TouchProbe.Add': (a, b) => Number(a) + Number(b), 'Sample.TouchProbe.Log': (text) => game.log('Log', text) };
  return game;
}

/** 표준 화면에서 인스펙터로 누를 법한 기록 — Recorder 시험(recorder.test · drivers.test 의 언어별 내보내기)이 같은 것을 쓴다 */
export const RECORDED: Step[] = [
  { do: 'type', target: 'IdInput', text: 'qa_user01!' },
  { do: 'click', target: 'LoginButton' },
  { check: 'text', target: 'StatusText', contains: 'login qauser01' },
  { do: 'key', key: 'Escape' },
  { check: 'text', target: 'TouchText', contains: 'key Escape' },
  { check: 'prop', target: 'WorldCube', prop: 'Transform.position', equals: [0, 0, 5] },
];

/** 다른 프로세스를 띄워 끝날 때까지 — 동기 실행은 이벤트 루프를 막아 가짜 게임이 못 답한다 */
export function exec(cmd: string, args: string[], env: NodeJS.ProcessEnv = {}, cwd?: string): Promise<{ code: number | null; text: string }> {
  return new Promise((resolve) => {
    // 바깥 node --test 가 건 NODE_TEST_CONTEXT 가 남으면 안쪽 node --test 가 결과를 바깥에 넘기고 종료 코드 0 으로 끝난다.
    const { NODE_TEST_CONTEXT: _, ...outer } = process.env;
    const p = spawn(cmd, args, { cwd, env: { ...outer, ...env } });
    let text = '';
    p.stdout.on('data', (b) => (text += b));
    p.stderr.on('data', (b) => (text += b));
    p.on('error', (e) => resolve({ code: -1, text: String(e) }));
    p.on('close', (code) => resolve({ code, text }));
  });
}

/** PC 게임 흉내 — SDK 처럼 127.0.0.1 포트에서 JSON 한 줄을 받아 한 줄로 답한다 */
export async function fakeTcp(game: FakeGame): Promise<{ port: number; server: NetServer }> {
  const server = createNetServer((socket) => {
    let buf = '';
    socket.setEncoding('utf8');
    socket.on('data', (chunk: string) => {
      buf += chunk;
      for (let nl = buf.indexOf('\n'); nl >= 0; nl = buf.indexOf('\n')) {
        socket.write(JSON.stringify(game.handle(JSON.parse(buf.slice(0, nl)) as Command)) + '\n');
        buf = buf.slice(nl + 1);
      }
    });
  });
  await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok));
  return { port: (server.address() as AddressInfo).port, server };
}

// 같은 폰이 Wi-Fi(7) · USB(9) 로 두 번 나온다 — USB 쪽을 골라야 한다.
const DEVICES = ['Network', 'USB']
  .map((type, i) => {
    const id = 7 + i * 2;
    return `<dict><key>DeviceID</key><integer>${id}</integer><key>MessageType</key><string>Attached</string><key>Properties</key><dict><key>ConnectionType</key><string>${type}</string><key>DeviceID</key><integer>${id}</integer><key>SerialNumber</key><string>UDID-1</string></dict></dict>`;
  })
  .join('');

/** usbmuxd 흉내 — ListDevices 에 폰 목록을 주고, Connect 뒤에는 그 소켓으로 게임 명령 한 줄씩을 받는다 */
export async function fakeUsbmux(game: FakeGame, path: string): Promise<{ server: NetServer; connects: { id: number; port: number }[] }> {
  const connects: { id: number; port: number }[] = [];
  const server = createNetServer((socket) => {
    let buf = Buffer.alloc(0);
    let tunnel = false;
    let lines = '';
    socket.on('data', (chunk: Buffer) => {
      if (tunnel) {
        lines += chunk.toString('utf8');
        for (let nl = lines.indexOf('\n'); nl >= 0; nl = lines.indexOf('\n')) {
          socket.write(JSON.stringify(game.handle(JSON.parse(lines.slice(0, nl)) as Command)) + '\n');
          lines = lines.slice(nl + 1);
        }
        return;
      }
      buf = Buffer.concat([buf, chunk]);
      if (buf.length < 16 || buf.length < buf.readUInt32LE(0)) return;
      const text = buf.subarray(16, buf.readUInt32LE(0)).toString('utf8');
      buf = Buffer.alloc(0);
      if (text.includes('<string>ListDevices</string>')) socket.write(packet(`<dict><key>DeviceList</key><array>${DEVICES}</array></dict>`));
      else if (text.includes('<string>Connect</string>')) {
        const port = Number(/<key>PortNumber<\/key><integer>(\d+)/.exec(text)![1]);
        connects.push({ id: Number(/<key>DeviceID<\/key><integer>(\d+)/.exec(text)![1]), port: ((port & 0xff) << 8) | (port >> 8) });
        socket.write(packet('<dict><key>MessageType</key><string>Result</string><key>Number</key><integer>0</integer></dict>'));
        tunnel = true;
      }
    });
  });
  await new Promise<void>((ok) => server.listen(path, ok));
  return { server, connects };
}

/** 디바이스 팜 입구 흉내 — 잡기 · Appium 세션 · 게임 명령 주소 */
export interface FakeDevice {
  serial: string;
  state: string;
  detail: string;
}

export async function fakeFarm(
  game: FakeGame,
): Promise<{ url: string; server: Server; held: Set<string>; seen: string[]; state: { sessionGone: boolean; devices: () => FakeDevice[] } }> {
  const held = new Set<string>();
  // Appium 이 세션을 이미 끝냈을 때(쉼 300초 · 잡기 시간 끝) · 기기 목록(부를 때마다 읽는다 — 정리 중 → 빈 폰을 흉내 낸다)
  const state = { sessionGone: false, devices: (): FakeDevice[] => [{ serial: 'R1', state: 'IDLE', detail: 'ready' }] };
  const seen: string[] = [];
  const server = createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      const path = req.url ?? '';
      seen.push(`${req.method} ${path}`);
      const send = (status: number, body: unknown) => {
        res.writeHead(status, { 'content-type': 'application/json' });
        res.end(JSON.stringify(body));
      };
      if (path === '/api/devices') return send(200, { value: { devices: state.devices(), now: Date.now() } });
      const hold = /^\/api\/devices\/([^/]+)\/hold$/.exec(path);
      if (hold && req.method === 'POST') return held.add(hold[1]), send(200, { held: { until: Date.now() + 1800_000 } });
      if (hold && req.method === 'DELETE') return held.delete(hold[1]), send(200, { released: true });
      const g = /^\/api\/devices\/([^/]+)\/game$/.exec(path);
      if (g) {
        if (req.headers['content-type'] !== 'application/json') return send(415, { value: { error: 'unknown error', message: '본문 형식은 application/json' } });
        if (!held.has(g[1])) return send(409, { value: { error: 'invalid argument', message: '잡은 폰이 아니다 — 잡은 사람만 게임 명령을 보낸다' } });
        return send(200, { value: game.handle(JSON.parse(raw) as Command) });
      }
      if (path === '/wd/hub/session' && req.method === 'POST') return send(200, { value: { sessionId: 'S1', capabilities: JSON.parse(raw) } });
      if (path === '/wd/hub/session/S1/screenshot') return send(200, { value: Buffer.from('png').toString('base64') });
      if (path === '/wd/hub/session/S1/back') return game.onBack?.(), send(200, { value: null });
      if (path === '/wd/hub/session/S1/execute/sync' && (JSON.parse(raw) as { script?: string }).script === 'mobile: backgroundApp')
        return game.background(), send(200, { value: null });
      if (path === '/wd/hub/session/S1' && req.method === 'DELETE')
        return state.sessionGone ? send(404, { value: { error: 'invalid session id', message: 'A session is either terminated or not started' } }) : send(200, { value: null });
      send(404, { value: { error: 'unknown command', message: path } });
    });
  });
  await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok));
  const { port } = server.address() as AddressInfo;
  return { url: `http://127.0.0.1:${port}/wd/hub`, server, held, seen, state };
}

/** relay 에 거는 게임 흉내 — SDK Relay.cs 처럼 hello 한 줄 뒤 `<번호> <명령>` 에 `<번호> <답>` 으로 답한다 */
export async function fakeRelayGame(game: FakeGame, url: string, hello: Record<string, unknown> = {}): Promise<WebSocket> {
  const ws = new WebSocket(`${url.replace(/^http/, 'ws')}/game`);
  await new Promise<void>((ok, no) => {
    ws.onopen = () => ok();
    ws.onerror = () => no(new Error(`relay ${url} 에 붙지 못했습니다`));
  });
  ws.send(`hello ${JSON.stringify({ app: 'com.fake.game', version: '1.0', engine: 'fake', engineVersion: '0', sdkVersion: '0.3.0', platform: 'macOS', model: 'FakeBook', device: 'fake', deviceId: 'fake-device-1', ...hello })}`);
  ws.onmessage = (e) => {
    const text = String(e.data);
    const sp = text.indexOf(' ');
    ws.send(`${text.slice(0, sp)} ${JSON.stringify(game.handle(JSON.parse(text.slice(sp + 1)) as Command))}`);
  };
  return ws;
}
