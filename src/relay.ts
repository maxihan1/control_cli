// 게임이 WebSocket 으로 걸어 오는 연결을 붙잡아 두고 CLI 의 HTTP 명령을 그 게임에 넘긴다 — control-cli relay
import { createHash, timingSafeEqual } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { Duplex } from 'node:stream';

export const RELAY_PORT = 13101;
// 게임은 10초 · CLI 는 20초에 끊는다 — relay 는 그 사이(15초). ping 은 터널이 조용한 연결을 끊는 것(100초 꼴)보다 자주. 테스트가 줄인다.
export const RELAY = { replyMs: 15_000, pingMs: 15_000 };

/** 게임이 붙자마자 보내는 hello(ping 답 + 플랫폼 · 기종 · 기기)에 relay 가 key · 시각을 더한 것 */
export interface GameInfo {
  /** `<앱>@<기기 id 앞 8자>` — 게임을 다시 켜도 같다 */
  key: string;
  app: string;
  version: string;
  platform: string;
  model: string;
  device: string;
  engine?: string;
  engineVersion?: string;
  sdkVersion?: string;
  since: number;
  lastSeen: number;
}

// 게임 답 한 줄(JSON) · 시간 초과 · 명령 중 끊김
type Outcome = string | 'timeout' | 'gone';

interface Conn {
  info: GameInfo;
  socket: Duplex;
  pending: Map<number, (o: Outcome) => void>;
  // 한 게임에는 명령을 하나씩 — 게임도 받은 차례대로 돈다.
  queue: Promise<unknown>;
  alive: boolean;
}

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const LOOPBACK = ['127.0.0.1', '::1', '::ffff:127.0.0.1'];

/** 서버 → 게임 frame — 서버는 가리지 않는다(RFC 6455 5.1) */
export function frame(op: number, payload: Buffer): Buffer {
  const n = payload.length;
  let head: Buffer;
  if (n < 126) head = Buffer.from([0x80 | op, n]);
  else if (n < 65536) head = Buffer.from([0x80 | op, 126, n >> 8, n & 255]);
  else {
    head = Buffer.alloc(10);
    head[0] = 0x80 | op;
    head[1] = 127;
    head.writeBigUInt64BE(BigInt(n), 2);
  }
  return Buffer.concat([head, payload]);
}

/** 게임 → 서버 frame 을 읽는다 — TCP 조각을 모으고, 여러 조각 메시지(FIN 0 + 이어짐)는 한 글로 */
export function reader(onText: (text: string) => void, onControl: (op: number, payload: Buffer) => void): (chunk: Buffer) => void {
  let buf = Buffer.alloc(0);
  let parts: Buffer[] = [];
  return (chunk) => {
    // ponytail: 조각마다 이어 붙여 큰 답(오류 기록 수백 KB)은 O(n²) — 느리면 조각 목록으로
    buf = Buffer.concat([buf, chunk]);
    for (;;) {
      if (buf.length < 2) return;
      const fin = (buf[0] & 0x80) !== 0;
      const op = buf[0] & 0x0f;
      const masked = (buf[1] & 0x80) !== 0;
      let len = buf[1] & 0x7f;
      let at = 2;
      if (len === 126) {
        if (buf.length < 4) return;
        len = buf.readUInt16BE(2);
        at = 4;
      } else if (len === 127) {
        if (buf.length < 10) return;
        len = Number(buf.readBigUInt64BE(2));
        at = 10;
      }
      const maskAt = at;
      if (masked) at += 4;
      if (buf.length < at + len) return;
      const payload = Buffer.from(buf.subarray(at, at + len));
      if (masked) for (let i = 0; i < len; i++) payload[i] ^= buf[maskAt + (i & 3)];
      buf = buf.subarray(at + len);
      if (op >= 8) onControl(op, payload);
      else {
        parts.push(payload);
        if (fin) {
          const text = Buffer.concat(parts).toString('utf8');
          parts = [];
          onText(text);
        }
      }
    }
  };
}

/** 명령 입구 권한 — 토큰 relay 는 늘 토큰, 토큰 없는 relay 는 이 컴퓨터에서 온 요청만. 막으면 까닭 */
export function allowed(remote: string | undefined, auth: string | undefined, token: string | undefined): string | undefined {
  if (token) {
    const want = Buffer.from(`Bearer ${token}`);
    const got = Buffer.from(auth ?? '');
    return got.length === want.length && timingSafeEqual(got, want) ? undefined : 'relay 토큰이 맞지 않습니다 — CONTROL_CLI_RELAY_TOKEN 이나 Keychain control-cli-relay 를 봅니다';
  }
  return LOOPBACK.includes(remote ?? '') ? undefined : '이 relay 는 그 컴퓨터 안에서만 명령을 받습니다 — 밖에서 쓰려면 relay 를 --token 으로 띄웁니다';
}

export function relay(o: { token?: string } = {}): Server {
  const games = new Map<string, Conn>();
  let next = 0;

  const drop = (c: Conn) => {
    if (games.get(c.info.key) === c) games.delete(c.info.key);
    for (const done of [...c.pending.values()]) done('gone');
    c.socket.destroy();
  };

  const ask = (c: Conn, line: string): Promise<Outcome> => {
    const run = () =>
      new Promise<Outcome>((done) => {
        if (c.socket.destroyed) return done('gone');
        const id = ++next;
        const finish = (out: Outcome) => {
          clearTimeout(timer);
          c.pending.delete(id);
          done(out);
        };
        const timer = setTimeout(() => finish('timeout'), RELAY.replyMs);
        c.pending.set(id, finish);
        c.socket.write(frame(1, Buffer.from(`${id} ${line}`)));
      });
    const p = c.queue.then(run, run);
    c.queue = p;
    return p;
  };

  const send = (res: ServerResponse, status: number, body: string) => {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(body);
  };
  const fail = (res: ServerResponse, status: number, message: string) => send(res, status, JSON.stringify({ value: { message } }));

  async function http(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const why = allowed(req.socket.remoteAddress, req.headers.authorization, o.token);
    if (why) return fail(res, 403, why);
    const path = new URL(req.url ?? '/', 'http://relay').pathname;
    if (req.method === 'GET' && path === '/games') return send(res, 200, JSON.stringify({ value: [...games.values()].map((c) => c.info) }));
    const m = /^\/games\/([^/]+)\/command$/.exec(path);
    if (req.method !== 'POST' || !m) return fail(res, 404, `relay 에 없는 주소입니다: ${req.method} ${path}`);
    req.setEncoding('utf8');
    let body = '';
    for await (const chunk of req) body += chunk;
    let line: string;
    try {
      const cmd = JSON.parse(body) as { cmd?: unknown } | null;
      if (typeof cmd?.cmd !== 'string') throw new Error('cmd 없음');
      line = JSON.stringify(cmd);
    } catch {
      return fail(res, 400, '명령은 {"cmd": …} JSON 객체여야 합니다');
    }
    const key = decodeURIComponent(m[1]);
    const c = games.get(key);
    if (!c) return fail(res, 404, `게임 ${key} 이 relay 에 붙어 있지 않습니다 — 게임이 켜져 있나요? 켜면 2초 안에 다시 붙습니다`);
    const out = await ask(c, line);
    if (out === 'timeout') return fail(res, 504, `게임이 ${RELAY.replyMs / 1000}초 안에 relay 에 답하지 않았습니다`);
    if (out === 'gone') return fail(res, 502, '게임이 명령 중에 relay 와 끊겼습니다 — 명령이 실행됐을 수도 있습니다');
    send(res, 200, `{"value":${out}}`);
  }

  const server = createServer((req, res) => void http(req, res).catch((e: unknown) => fail(res, 500, e instanceof Error ? e.message : String(e))));

  server.on('upgrade', (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    const wsKey = req.headers['sec-websocket-key'];
    if (new URL(req.url ?? '/', 'http://relay').pathname !== '/game' || typeof wsKey !== 'string') return void socket.destroy();
    socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${createHash('sha1').update(wsKey + GUID).digest('base64')}\r\n\r\n`);
    let c: Conn | undefined;
    const read = reader(
      (text) => {
        if (c) {
          c.alive = true;
          c.info.lastSeen = Date.now();
          const sp = text.indexOf(' ');
          c.pending.get(Number(text.slice(0, sp)))?.(text.slice(sp + 1));
          return;
        }
        let h: Partial<GameInfo> & { deviceId?: string };
        try {
          if (!text.startsWith('hello ')) throw new Error('hello 아님');
          h = JSON.parse(text.slice(6)) as typeof h;
        } catch {
          return void socket.destroy();
        }
        const now = Date.now();
        const info: GameInfo = {
          key: `${h.app ?? '?'}@${(h.deviceId ?? '').slice(0, 8)}`,
          app: h.app ?? '?',
          version: h.version ?? '?',
          platform: h.platform ?? '?',
          model: h.model ?? '?',
          device: h.device ?? '?',
          engine: h.engine,
          engineVersion: h.engineVersion,
          sdkVersion: h.sdkVersion,
          since: now,
          lastSeen: now,
        };
        // 같은 게임이 다시 붙었다 — 옛 연결은 죽은 것(앱을 다시 켰거나 Wi-Fi 가 바뀌었다).
        const old = games.get(info.key);
        if (old) drop(old);
        c = { info, socket, pending: new Map(), queue: Promise.resolve(), alive: true };
        games.set(info.key, c);
      },
      (op, payload) => {
        if (c) {
          c.alive = true;
          c.info.lastSeen = Date.now();
        }
        if (op === 9) socket.write(frame(10, payload));
        else if (op === 8) {
          socket.end(frame(8, Buffer.alloc(0)));
          if (c) drop(c);
        }
      },
    );
    socket.on('data', read);
    socket.on('error', () => {});
    socket.on('close', () => c && drop(c));
    // 요청과 같은 조각에 온 frame 은 head 로 온다.
    if (head.length) read(head);
  });

  // ping 한 번 사이(15초) 아무것도 안 온 연결은 뺀다 — 잠든 폰 · 끊긴 Wi-Fi 는 close 가 안 온다.
  const beat = setInterval(() => {
    for (const c of [...games.values()]) {
      if (!c.alive) {
        drop(c);
        continue;
      }
      c.alive = false;
      c.socket.write(frame(9, Buffer.alloc(0)));
    }
  }, RELAY.pingMs);
  beat.unref();
  server.on('close', () => {
    clearInterval(beat);
    for (const c of [...games.values()]) drop(c);
  });
  return server;
}
