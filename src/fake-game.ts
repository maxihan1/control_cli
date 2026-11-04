// 테스트용 가짜 게임 SDK 와 가짜 디바이스 팜 — 폰 없이 CLI · 창 훑기를 돌려 본다
import { createServer, type Server } from 'node:http';
import { createServer as createNetServer, type AddressInfo, type Server as NetServer } from 'node:net';

import type { Node } from './game.js';
import type { Command, Reply } from './link.js';
import { COMMANDS } from './protocol.js';
import { flatten } from './snapshot.js';
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
}

export const node = (name: string, extra: Partial<FakeNode> = {}, children?: FakeNode[]): FakeNode => ({ name, ...extra, ...(children ? { children } : {}) });
export const button = (name: string, label: string, onClick?: () => void): FakeNode => node(name, { kind: 'Button', interactable: true, onClick }, [node('Text', { text: label })]);

export class FakeGame {
  clicks: string[] = [];
  keys: string[] = [];
  commands: Command[] = [];
  /** SDK 의 Caps 흉내 — 테스트가 빼서 옛 SDK · 다른 엔진을 흉내 낸다 */
  caps: string[] = [...COMMANDS];
  onBack?: () => void;
  onKey?: (key: string) => void;
  /** static 칸 · 메서드 — 「타입.칸」 */
  statics: Record<string, unknown> = {};
  staticMethods: Record<string, (...args: string[]) => unknown> = {};
  prefs = new Map<string, string | number>();
  timeScale = 1;
  /** 장면 이름 → 그 장면을 열 때 만드는 뿌리(샘플은 장면이 열릴 때마다 코드로 채운다). 없는 이름은 빌드에 없는 장면 */
  sceneRoots: Record<string, () => FakeNode[]> = {};
  loaded: { name: string; nodes: FakeNode[] }[];
  loads = 0;
  unloads = 0;
  /** scenes 를 이만큼 물을 때까지 장면이 열리는 중 — Infinity 면 끝내 안 열린다 */
  loadDelay = 0;
  private pending?: { left: number; open: () => void };

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

  // SDK 의 Tree.Find 와 같은 규칙 — 이름은 하나뿐일 때만, 경로는 [순번]
  private find(target: string): { node?: FakeNode; path?: string; error?: string } {
    const all = flatten(this.roots);
    if (target.startsWith('/')) {
      const e = all.find((x) => x.path === target);
      return e ? { node: e.node as FakeNode, path: e.path } : {};
    }
    const same = all.filter((x) => x.node.name === target);
    if (same.length > 1) return { error: `${target} 이 ${same.length}개라 하나를 고를 수 없습니다` };
    return same.length ? { node: same[0].node as FakeNode, path: same[0].path } : {};
  }

  handle(c: Command): Reply {
    this.commands.push(c);
    const strip = (n: FakeNode): Node => ({ name: n.name, ...(n.text !== undefined ? { text: n.text } : {}), ...(n.kind ? { kind: n.kind, interactable: n.interactable } : {}), ...(n.children?.length ? { children: n.children.map(strip) } : {}) });
    const f = typeof c.target === 'string' ? this.find(c.target) : {};
    if (f.error) return { ok: false, error: f.error };
    switch (c.cmd) {
      case 'ping':
        return { ok: true, app: 'com.fake.game', version: '1.0', engine: 'fake', engineVersion: '0', sdkVersion: '0.3.0', protocol: 2, caps: this.caps };
      case 'tree':
        return { ok: true, scene: this.scene, screen: [2400, 1080], tree: this.roots.map(strip) };
      case 'find':
        return f.node ? { ok: true, found: true, path: f.path, ...(f.node.text !== undefined ? { text: f.node.text } : {}) } : { ok: true, found: false };
      case 'click':
        if (!f.node) return { ok: false, error: `켜진 오브젝트 중에 ${c.target as string} 이 없습니다` };
        this.clicks.push(f.path!);
        f.node.onClick?.();
        return { ok: true, x: 1, y: 1 };
      case 'drag': {
        const to = this.find(c.to as string);
        if (!f.node || !to.node) return { ok: false, error: '없음' };
        if (f.node.movable) {
          const parent = this.parentOf(f.node);
          if (parent) parent.children = parent.children!.filter((x) => x !== f.node);
          else this.roots = this.roots.filter((x) => x !== f.node);
          (to.node.children ??= []).push(f.node);
        }
        return { ok: true, x: 1, y: 1 };
      }
      case 'type':
        if (!f.node) return { ok: false, error: '없음' };
        f.node.text = f.node.accept ? f.node.accept(c.text as string) : (c.text as string);
        return { ok: true, text: f.node.password ? '***' : f.node.text };
      case 'get':
        return f.node?.props && (c.prop as string) in f.node.props ? { ok: true, value: f.node.props[c.prop as string] } : { ok: false, error: `${c.prop as string} 칸이 없습니다` };
      case 'errors':
        return { ok: true, last: 0, errors: [] };
      case 'layout':
        return { ok: true, checked: 2, problems: [{ kind: 'overlap', name: 'A', path: '/C/A', other: 'B', otherPath: '/C/B' }] };
      case 'tap':
        return { ok: true, x: c.x, y: c.y };
      case 'key':
        this.keys.push(c.key as string);
        this.onKey?.(c.key as string);
        // SDK 처럼 Escape 는 뒤로 키와 같다.
        if (c.key === 'Escape') this.onBack?.();
        return { ok: true, key: c.key };
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
          const nodes = make();
          if (c.mode === 'add') {
            this.loaded.push({ name, nodes });
            this.roots = [...this.roots, ...nodes];
          } else {
            this.loaded = [{ name, nodes }];
            this.roots = nodes;
            this.scene = name;
          }
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
        return { ok: true, unloads: this.unloads++ };
      }
      default:
        return { ok: false, error: `모르는 명령입니다: ${c.cmd}` };
    }
  }
}

/** 키로 칠 때처럼 영숫자만 남기고 글자 수로 자른다 — 샘플 IdInput(글자 수 8 · 영숫자) 흉내 */
export const keyFilter = (limit: number) => (text: string) => text.replace(/[^A-Za-z0-9]/g, '').slice(0, limit);

/** 표준 화면 흉내 — sample/Assets/Sample 과 같은 이름 · 같은 반응(conform 의 기대값). Sample 장면이 열릴 때마다 화면을 새로 만든다 */
export function standardScreen(idAccept = keyFilter(8)): FakeGame {
  const game = new FakeGame([], 'Sample');
  const build = (): FakeNode[] => {
    const status = node('StatusText', { text: '', set: (p, v) => (p === 'Text.text' ? (status.text = v) : undefined) });
    const tmpStatus = node('TmpStatusText', { text: '' });
    const uitkStatus = node('UitkStatusText', { text: '' });
    const touch = node('TouchText', { text: '' });
    const id = node('IdInput', { kind: 'InputField', interactable: true, text: '', accept: idAccept });
    const tmpId = node('TmpIdInput', { kind: 'TMP_InputField', interactable: true, text: '', accept: keyFilter(8) });
    const uitkId = node('UitkIdInput', { kind: 'TextField', interactable: true, text: '', accept: (t) => t.slice(0, 8) });
    const login = (name: string, label: string, out: FakeNode, from: FakeNode) => {
      let presses = 0;
      return node(name, { kind: 'Button', interactable: true, onClick: () => (out.text = `${label} ${from.text} ${++presses}`) });
    };
    let cubes = 0;
    const position = [0, 0, 5];
    game.onKey = (key) => (touch.text = `key ${key}`);
    return [
      node('WorldCube', {
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
      node('SampleCanvas', { methods: { 'TouchProbe.Say': (word, times) => (touch.text = `${word} ${times}`) } }, [
        status,
        id,
        login('LoginButton', 'login', status, id),
        touch,
        tmpStatus,
        tmpId,
        login('TmpLoginButton', 'tmp login', tmpStatus, tmpId),
        node('Bag', {}, [node('Slot', {}, [node('Item', { movable: true })]), node('Slot'), node('Slot'), node('Slot')]),
      ]),
      node('UitkDocument', {}, [node('UitkPanel', {}, [uitkStatus, uitkId, login('UitkLoginButton', 'uitk login', uitkStatus, uitkId)])]),
    ];
  };
  game.sceneRoots = { Sample: build, Second: () => [node('SecondMarker')] };
  game.roots = build();
  game.loaded = [{ name: 'Sample', nodes: game.roots }];
  game.statics = { 'Sample.TouchProbe.Note': null };
  game.staticMethods = { 'Sample.TouchProbe.Add': (a, b) => Number(a) + Number(b) };
  return game;
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
      if (path === '/wd/hub/session/S1' && req.method === 'DELETE')
        return state.sessionGone ? send(404, { value: { error: 'invalid session id', message: 'A session is either terminated or not started' } }) : send(200, { value: null });
      send(404, { value: { error: 'unknown command', message: path } });
    });
  });
  await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok));
  const { port } = server.address() as AddressInfo;
  return { url: `http://127.0.0.1:${port}/wd/hub`, server, held, seen, state };
}
