// 게임 SDK 에 명령 하나를 보내는 길 — 디바이스 팜 게임 명령 주소 · relay(HTTP) · USB adb forward(TCP) · PC(TCP) · USB iPhone(usbmuxd)
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createConnection, type Socket } from 'node:net';
import { join } from 'node:path';

import { connect as connectPhone } from './usbmux.js';

export type Command = { cmd: string } & Record<string, unknown>;
export interface Reply {
  ok: boolean;
  error?: string;
  [key: string]: unknown;
}
export type Link = (command: Command) => Promise<Reply>;

export const GAME_PORT = 13100;
// 게임은 10초에 스스로 답하고 팜은 15초에 끊는다(Devicefarm 안내서 12절) — 그 둘이 먼저 말하게 조금 더 기다린다.
const REPLY_TIMEOUT_MS = 20_000;

export function adbPath(): string {
  const home = process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT ?? join(process.env.HOME ?? '', 'Library/Android/sdk');
  const p = join(home, 'platform-tools', 'adb');
  return existsSync(p) ? p : 'adb';
}

// 팜은 명령마다 forward 를 걸고 지운다. USB 는 내 컴퓨터라 한 번 걸어 두고 같은 포트를 쓴다.
export function usbLink(udid: string | undefined, port = GAME_PORT): Link {
  let forwarded = false;
  const tcp = tcpLink(port);
  return (command) => {
    if (!forwarded) {
      execFileSync(adbPath(), [...(udid ? ['-s', udid] : []), 'forward', `tcp:${port}`, `tcp:${port}`], { stdio: ['ignore', 'ignore', 'inherit'] });
      forwarded = true;
    }
    return tcp(command);
  };
}

export function tcpLink(port: number): Link {
  return (command) => talk(createConnection({ host: '127.0.0.1', port }), command, port, false);
}

// USB iPhone — usbmuxd 가 이어 준 소켓이 곧 폰의 포트다. 명령마다 새로 잇는다(adb forward 처럼 걸어 둘 것이 없다).
export function iosLink(udid: string | undefined, port = GAME_PORT): Link {
  return async (command) => talk(await connectPhone(udid, port), command, port, true);
}

// 명령 한 줄을 쓰고 답 한 줄을 읽는다 — connected 가 아니면 이어진 뒤에 쓴다.
function talk(socket: Socket, command: Command, port: number, connected: boolean): Promise<Reply> {
  return new Promise((resolve, reject) => {
    const send = () => socket.write(JSON.stringify(command) + '\n');
    if (connected) send();
    else socket.once('connect', send);
    let buf = '';
    let done = false;
    const finish = (e: Error | null, line?: string) => {
      if (done) return;
      done = true;
      socket.destroy();
      if (e) return reject(e);
      try {
        resolve(asReply(JSON.parse(line!)));
      } catch (err) {
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    };
    socket.setEncoding('utf8');
    socket.setTimeout(REPLY_TIMEOUT_MS, () => finish(new Error(`게임이 ${REPLY_TIMEOUT_MS / 1000}초 안에 답하지 않았습니다`)));
    socket.on('data', (chunk: string) => {
      // 오류 기록 답은 수백 KB 라 새 조각에서만 줄 끝을 찾는다.
      const nl = chunk.indexOf('\n');
      if (nl < 0) buf += chunk;
      else finish(null, buf + chunk.slice(0, nl));
    });
    socket.on('error', (e) => finish(new Error(`게임 포트 ${port} 에 붙지 못했습니다 — QA 빌드가 켜져 있나요? (${e.message})`)));
    // 폰 쪽 포트가 안 열려 있어도 adb 는 연결을 받았다가 바로 닫는다.
    socket.on('close', () => finish(new Error(`게임이 답 없이 연결을 닫았습니다 — 폰에서 QA 빌드가 켜져 있고 포트 ${port} 를 여나요?`)));
    // usbmuxd 가 이어 준 소켓은 Connect 답을 읽고 멈춰 둔 채로 온다 — 다시 흐르게 한다.
    socket.resume();
  });
}

// HTTP 로 명령 하나를 보내고 {value: 게임 답} 을 받는다 — 성공 · 오류는 HTTP 코드로 가른다(디바이스 팜 · relay 가 같은 꼴, Devicefarm 안내서 12절 · 7절).
function postLink(endpoint: string, headers: Record<string, string>, refused: (status: number, message?: string) => string): Link {
  return async (command) => {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(command),
      signal: AbortSignal.timeout(REPLY_TIMEOUT_MS),
    });
    const body = (await res.json().catch(() => null)) as { value?: unknown } | null;
    if (!res.ok) throw new Error(refused(res.status, (body?.value as { message?: string } | undefined)?.message));
    return asReply(body?.value);
  };
}

// 디바이스 팜 게임 명령 주소 — 잡은 사람만 받는다.
export function farmLink(farm: string, headers: Record<string, string>, serial: string): Link {
  return postLink(`${farm}/api/devices/${encodeURIComponent(serial)}/game`, headers, (status, message) => `디바이스 팜이 게임 명령을 HTTP ${status} 로 거절했습니다${message ? `: ${message}` : ''}`);
}

// relay 에 붙은 게임 — key 는 <앱>@<기기 id 앞 8자>라 게임을 다시 켜도 같은 세션으로 간다. relay 의 거절 글은 그대로 보인다.
export function relayLink(url: string, headers: Record<string, string>, key: string): Link {
  const link = postLink(`${url}/games/${encodeURIComponent(key)}/command`, headers, (status, message) => message ?? `relay 가 게임 명령을 HTTP ${status} 로 거절했습니다`);
  return (command) =>
    link(command).catch((e: unknown) => {
      // fetch 는 닿지 못하면 TypeError('fetch failed') 를 던진다.
      throw e instanceof TypeError ? new Error(`relay ${url} 에 닿지 못했습니다 — relay 가 꺼졌으면 close 뒤 open --relay 로 다시 엽니다`) : e;
    });
}

function asReply(v: unknown): Reply {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) throw new Error(`게임 답이 JSON 객체가 아닙니다: ${JSON.stringify(v)?.slice(0, 200)}`);
  return v as Reply;
}
