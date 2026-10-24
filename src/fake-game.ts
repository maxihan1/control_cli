// 테스트용 가짜 게임 SDK 와 가짜 디바이스 팜 — 폰 없이 CLI · 창 훑기를 돌려 본다
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import type { Node } from './game.js';
import type { Command, Reply } from './link.js';
import { flatten } from './snapshot.js';

export interface FakeNode extends Node {
  children?: FakeNode[];
  onClick?: () => void;
  props?: Record<string, unknown>;
  password?: boolean;
}

export const node = (name: string, extra: Partial<FakeNode> = {}, children?: FakeNode[]): FakeNode => ({ name, ...extra, ...(children ? { children } : {}) });
export const button = (name: string, label: string, onClick?: () => void): FakeNode => node(name, { kind: 'Button', interactable: true, onClick }, [node('Text', { text: label })]);

export class FakeGame {
  clicks: string[] = [];
  commands: Command[] = [];
  onBack?: () => void;

  constructor(public roots: FakeNode[], public scene = 'Boot') {}

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
        return { ok: true, app: 'com.fake.game', version: '1.0' };
      case 'tree':
        return { ok: true, scene: this.scene, screen: [2400, 1080], tree: this.roots.map(strip) };
      case 'find':
        return f.node ? { ok: true, found: true, path: f.path, ...(f.node.text !== undefined ? { text: f.node.text } : {}) } : { ok: true, found: false };
      case 'click':
        if (!f.node) return { ok: false, error: `켜진 오브젝트 중에 ${c.target as string} 이 없습니다` };
        this.clicks.push(f.path!);
        f.node.onClick?.();
        return { ok: true, x: 1, y: 1 };
      case 'drag':
        return f.node ? { ok: true, x: 1, y: 1 } : { ok: false, error: '없음' };
      case 'type':
        if (!f.node) return { ok: false, error: '없음' };
        f.node.text = c.text as string;
        return { ok: true, text: f.node.password ? '***' : f.node.text };
      case 'get':
        return f.node?.props && (c.prop as string) in f.node.props ? { ok: true, value: f.node.props[c.prop as string] } : { ok: false, error: `${c.prop as string} 칸이 없습니다` };
      case 'errors':
        return { ok: true, last: 0, errors: [] };
      case 'layout':
        return { ok: true, checked: 2, problems: [{ kind: 'overlap', name: 'A', path: '/C/A', other: 'B', otherPath: '/C/B' }] };
      case 'tap':
        return { ok: true, x: c.x, y: c.y };
      default:
        return { ok: false, error: `모르는 명령입니다: ${c.cmd}` };
    }
  }
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
