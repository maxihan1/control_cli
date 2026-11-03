// stdio MCP 서버 — protocol/commands.json 의 명령과 세션 명령(hold · open · close · release)을 AI 앱(Claude Desktop · Claude Code)의 도구로 내준다
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import type { Readable, Writable } from 'node:stream';

import type { Command, Reply } from './link.js';
import { PROTOCOL } from './protocol.js';

export interface Handlers {
  /** 게임 명령 하나 — 열린 세션의 게임에 보내고 답을 그대로 */
  game: (command: Command) => Promise<Reply>;
  /** CLI 명령줄 하나(hold · open · close · release) — CLI 가 찍을 글을 그대로 */
  session: (argv: string[]) => Promise<string>;
}

interface Prop {
  type: 'string' | 'number';
  description: string;
  enum?: (string | number)[];
}

type Content = { type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string };

interface Tool {
  name: string;
  description: string;
  inputSchema: { type: 'object'; properties: Record<string, Prop>; required: string[] };
  run: (args: Record<string, unknown>) => Promise<Content[]>;
}

// 받는 판 — 쓰는 것(도구 · 글 · 그림)은 2024-11-05 부터 같다. 모르는 판을 달라면 맨 앞 판으로 답하고 클라이언트가 고른다.
export const VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];
const VERSION = (JSON.parse(readFileSync(join(import.meta.dirname, '..', 'package.json'), 'utf8')) as { version: string }).version;

const INSTRUCTIONS = [
  'QA 빌드 게임(control_cli SDK)을 조작한다.',
  '먼저 open — 디바이스 팜은 hold 로 폰을 잡은 뒤 open {app: QA APK}, 이 컴퓨터 PC 게임은 open {via: "pc"}.',
  '화면은 tree · screenshot 으로 본다. 주소는 오브젝트 이름(켜진 것 중 하나뿐일 때) 또는 /Canvas/Panel/Slot[2] 경로.',
  '다 쓰면 close, 팜 폰은 release.',
].join(' ');

const schema = (properties: Record<string, Prop>, required: string[] = []) => ({ type: 'object' as const, properties, required });
const text = (t: string): Content[] => [{ type: 'text', text: t }];

export function tools(h: Handlers): Tool[] {
  const game: Tool[] = PROTOCOL.commands.map((c) => ({
    name: c.name,
    description: c.summary,
    inputSchema: schema(
      Object.fromEntries(Object.entries(c.args).map(([k, a]) => [k, { type: a.type, description: a.summary }])),
      Object.entries(c.args)
        .filter(([, a]) => a.required)
        .map(([k]) => k),
    ),
    run: async (args) => {
      const { ok: _ok, jpg, ...rest } = await h.game({ cmd: c.name, ...args });
      // 스크린샷은 그림으로 — AI 앱이 화면을 바로 본다.
      return typeof jpg === 'string' ? [{ type: 'image', data: jpg, mimeType: 'image/jpeg' }] : text(JSON.stringify(rest));
    },
  }));
  return game;
}

// AI 가 준 인자를 도구 꼴과 견준다 — 틀리면 도구 실패로 알려 AI 가 고쳐 다시 부른다. 꼴 밖 칸은 버린다.
function pick(tool: Tool, args: unknown): Record<string, unknown> {
  const given = (args ?? {}) as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [k, p] of Object.entries(tool.inputSchema.properties)) {
    const v = given[k];
    if (v === undefined) {
      if (tool.inputSchema.required.includes(k)) throw new Error(`${tool.name} 에 ${k} 칸이 필요합니다 — ${p.description}`);
      continue;
    }
    if (typeof v !== p.type || (p.enum !== undefined && !p.enum.includes(v as string | number)))
      throw new Error(`${tool.name} 의 ${k} 는 ${p.enum ? `${p.enum.join(' · ')} 중 하나여야` : `${p.type} 여야`} 합니다 (받은 값 ${JSON.stringify(v)})`);
    out[k] = v;
  }
  return out;
}

const rpcError = (code: number, message: string) => Object.assign(new Error(message), { code });

async function answer(method: string | undefined, params: Record<string, unknown>, list: Tool[]): Promise<unknown> {
  switch (method) {
    case 'initialize': {
      const asked = params.protocolVersion;
      return {
        protocolVersion: typeof asked === 'string' && VERSIONS.includes(asked) ? asked : VERSIONS[0],
        capabilities: { tools: {} },
        serverInfo: { name: 'control-cli', version: VERSION },
        instructions: INSTRUCTIONS,
      };
    }
    case 'ping':
      return {};
    case 'tools/list':
      return { tools: list.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })) };
    case 'tools/call': {
      const tool = list.find((t) => t.name === params.name);
      if (!tool) throw rpcError(-32602, `모르는 도구입니다: ${String(params.name)}`);
      // 게임 · CLI · 인자 실패는 도구 실패로 — AI 가 글을 읽고 다음 수를 고른다.
      try {
        return { content: await tool.run(pick(tool, params.arguments)) };
      } catch (e) {
        return { content: text(e instanceof Error ? e.message : String(e)), isError: true };
      }
    }
    default:
      throw rpcError(-32601, `모르는 메서드입니다: ${String(method)}`);
  }
}

/** 줄 하나에 JSON-RPC 메시지 하나(MCP stdio) — 입력이 닫히면 끝난다 */
export async function serve(input: Readable, output: Writable, h: Handlers): Promise<void> {
  const list = tools(h);
  const send = (m: object) => output.write(`${JSON.stringify({ jsonrpc: '2.0', ...m })}\n`);
  // ponytail: 요청을 한 줄씩 차례로 답한다 — 게임 SDK 도 받은 차례대로 돈다. open(최대 60초) 동안 뒤 요청이 기다리니, 클라이언트가 동시에 부르는 일이 잦아지면 줄마다 따로 돌린다.
  for await (const line of createInterface({ input, crlfDelay: Infinity })) {
    if (line.trim() === '') continue;
    let m: { id?: number | string | null; method?: string; params?: Record<string, unknown> } | null;
    try {
      m = JSON.parse(line);
    } catch {
      send({ id: null, error: { code: -32700, message: 'JSON 이 아닌 줄입니다' } });
      continue;
    }
    // 알림(notifications/initialized · cancelled)에는 답하지 않는다.
    if (m?.id === undefined || m.id === null) continue;
    try {
      send({ id: m.id, result: await answer(m.method, m.params ?? {}, list) });
    } catch (e) {
      send({ id: m.id, error: { code: (e as { code?: number }).code ?? -32603, message: e instanceof Error ? e.message : String(e) } });
    }
  }
}
