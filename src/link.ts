// 게임 SDK 에 명령 하나를 보내는 두 길 — 디바이스 팜 게임 명령 주소(HTTP) · USB adb forward(TCP)
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createConnection } from 'node:net';
import { join } from 'node:path';

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
  return (command) =>
    new Promise((resolve, reject) => {
      const socket = createConnection({ host: '127.0.0.1', port }, () => socket.write(JSON.stringify(command) + '\n'));
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
    });
}

// 디바이스 팜 게임 명령 주소 — 잡은 사람만 받는다. 답은 {value: 게임 답}, 성공 · 오류는 HTTP 코드로 가른다(Devicefarm 안내서 12절 · 7절).
export function farmLink(farm: string, headers: Record<string, string>, serial: string): Link {
  return async (command) => {
    const res = await fetch(`${farm}/api/devices/${encodeURIComponent(serial)}/game`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(command),
      signal: AbortSignal.timeout(REPLY_TIMEOUT_MS),
    });
    const body = (await res.json().catch(() => null)) as { value?: unknown } | null;
    if (!res.ok) {
      const message = (body?.value as { message?: string } | undefined)?.message;
      throw new Error(`디바이스 팜이 게임 명령을 HTTP ${res.status} 로 거절했습니다${message ? `: ${message}` : ''}`);
    }
    return asReply(body?.value);
  };
}

function asReply(v: unknown): Reply {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) throw new Error(`게임 답이 JSON 객체가 아닙니다: ${JSON.stringify(v)?.slice(0, 200)}`);
  return v as Reply;
}
