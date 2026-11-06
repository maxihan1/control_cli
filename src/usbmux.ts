// macOS usbmuxd 로 USB iPhone 의 포트에 바로 붙는다 — iOS 에는 adb forward 가 없다(설치할 것 없음 · 명령마다 새로 잇는다)
import { createConnection, type Socket } from 'node:net';

export interface Phone {
  id: number;
  udid: string;
  usb: boolean;
}

// libimobiledevice 와 같은 환경값으로 자리를 바꿀 수 있다 — 테스트가 가짜 usbmuxd 를 띄운다.
const socketPath = () => (process.env.USBMUXD_SOCKET_ADDRESS ?? '/var/run/usbmuxd').replace(/^UNIX:/, '');

const escapeXml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// 메시지 = 머리 16바이트(길이 · 판 1 · 종류 8(plist) · 꼬리표, little endian) + XML plist
export function frame(dict: Record<string, string | number>, tag = 1): Buffer {
  const entries = Object.entries(dict).map(([k, v]) => `<key>${k}</key>${typeof v === 'number' ? `<integer>${v}</integer>` : `<string>${escapeXml(v)}</string>`}`);
  return packet(`<dict>${entries.join('')}</dict>`, tag);
}

/** plist 안쪽(dict 하나)을 메시지로 싼다 — 가짜 usbmuxd 테스트도 쓴다 */
export function packet(inner: string, tag = 1): Buffer {
  const body = Buffer.from(
    `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0">${inner}</plist>\n`,
    'utf8',
  );
  const head = Buffer.alloc(16);
  head.writeUInt32LE(16 + body.length, 0);
  head.writeUInt32LE(1, 4);
  head.writeUInt32LE(8, 8);
  head.writeUInt32LE(tag, 12);
  return Buffer.concat([head, body]);
}

const message = (type: string, extra: Record<string, string | number> = {}) => frame({ MessageType: type, ProgName: 'control-cli', ClientVersionString: 'control-cli', ...extra });

// 답 하나(머리 + plist)를 읽는다. Connect 가 되면 그 뒤 바이트는 폰 포트의 것이라 읽기를 멈추고 남은 것은 되돌린다.
function readReply(socket: Socket): Promise<string> {
  return new Promise((resolve, reject) => {
    let buf = Buffer.alloc(0);
    const done = (e: Error | null, text?: string) => {
      socket.off('data', onData);
      socket.off('error', onError);
      socket.off('close', onClose);
      if (e) reject(e);
      else resolve(text!);
    };
    const onData = (chunk: Buffer) => {
      buf = Buffer.concat([buf, chunk]);
      if (buf.length < 4 || buf.length < buf.readUInt32LE(0)) return;
      const length = buf.readUInt32LE(0);
      socket.pause();
      if (buf.length > length) socket.unshift(buf.subarray(length));
      done(null, buf.subarray(16, length).toString('utf8'));
    };
    const onError = (e: Error) => done(new Error(`usbmuxd(${socketPath()})에 붙지 못했습니다 — macOS 에서만 됩니다 (${e.message})`));
    const onClose = () => done(new Error('usbmuxd 가 답 없이 연결을 닫았습니다'));
    socket.on('data', onData);
    socket.on('error', onError);
    socket.on('close', onClose);
  });
}

async function ask(type: string, extra?: Record<string, string | number>): Promise<{ socket: Socket; text: string }> {
  const socket = createConnection({ path: socketPath() });
  socket.write(message(type, extra));
  return { socket, text: await readReply(socket) };
}

// plist 를 다 풀지 않는다 — 기기마다 Properties 키가 알파벳 차례라 ConnectionType → DeviceID → SerialNumber(UDID) 로 온다.
// 같은 폰이 USB · Wi-Fi 로 두 번 나올 수 있다(DeviceID 가 다르다).
export async function phones(): Promise<Phone[]> {
  const { socket, text } = await ask('ListDevices');
  socket.destroy();
  const found: Phone[] = [];
  let id = -1;
  let usb = false;
  for (const m of text.matchAll(/<key>(DeviceID|SerialNumber|ConnectionType)<\/key>\s*<(?:integer|string)>([^<]*)</g)) {
    if (m[1] === 'DeviceID') id = Number(m[2]);
    else if (m[1] === 'ConnectionType') usb = m[2] === 'USB';
    else found.push({ id, udid: m[2], usb });
  }
  return found;
}

/** USB 로 꽂힌 폰 하나(udid 가 없으면 하나뿐인 폰) */
export async function phone(udid?: string): Promise<Phone> {
  const list = (await phones()).filter((p) => p.usb && (!udid || p.udid === udid));
  if (list.length === 1) return list[0];
  if (udid) throw new Error(`USB 로 꽂힌 iPhone 중에 ${udid} 가 없습니다`);
  throw new Error(list.length === 0 ? 'USB 로 꽂힌 iPhone 이 없습니다 — 케이블 · 「이 컴퓨터를 신뢰」를 봅니다' : `iPhone 이 ${list.length}대라 하나를 고를 수 없습니다 — --udid 로 고릅니다`);
}

// Connect 가 되면 그 소켓이 그대로 폰의 port 로 이어진다. 포트는 network byte order 로 적는다.
export async function connect(udid: string | undefined, port: number): Promise<Socket> {
  const target = await phone(udid);
  const { socket, text } = await ask('Connect', { DeviceID: target.id, PortNumber: ((port & 0xff) << 8) | (port >> 8) });
  const result = Number(/<key>Number<\/key>\s*<integer>(\d+)<\/integer>/.exec(text)?.[1] ?? -1);
  if (result === 0) return socket;
  socket.destroy();
  throw new Error(result === 3 ? `iPhone 의 포트 ${port} 가 닫혀 있습니다 — QA 빌드가 켜져 있나요?` : `usbmuxd 가 연결을 거절했습니다(결과 ${result})`);
}
