// 명령줄 인자를 SDK 로 보낼 한 줄과 연결 설정으로 바꾼다
export const DEFAULT_PORT = 13100;
export const COMMANDS = ['ping', 'tree', 'tap', 'click', 'errors', 'layout'] as const;

export interface Parsed {
  serial?: string;
  port: number;
  line: string;
}

export function parseArgs(argv: string[]): Parsed {
  let serial: string | undefined;
  let port = DEFAULT_PORT;
  const rest: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--serial' || a === '-s') serial = need(argv, ++i, a);
    else if (a === '--port') port = Number(need(argv, ++i, a));
    else rest.push(a);
  }
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error(`--port 는 1~65535 정수여야 합니다`);
  const [cmd, ...params] = rest;
  if (!cmd) throw new Error(`명령이 없습니다 (${COMMANDS.join(' · ')})`);
  if (!(COMMANDS as readonly string[]).includes(cmd)) throw new Error(`모르는 명령입니다: ${cmd} (${COMMANDS.join(' · ')})`);
  if (cmd === 'tap' && (params.length !== 2 || params.some((p) => !Number.isFinite(Number(p)))))
    throw new Error('tap <x> <y> 꼴이어야 합니다');
  if (cmd === 'click' && params.length !== 1) throw new Error('click <오브젝트 이름> 꼴이어야 합니다');
  if (cmd === 'errors' && (params.length > 1 || params.some((p) => !/^\d+$/.test(p))))
    throw new Error('errors [이 번호 뒤부터] 꼴이어야 합니다');
  if (cmd === 'layout' && params.length > 1) throw new Error('layout [이 오브젝트 아래만] 꼴이어야 합니다');
  return { serial, port, line: [cmd, ...params].join(' ') };
}

function need(argv: string[], i: number, flag: string): string {
  const v = argv[i];
  if (v === undefined || v.startsWith('-')) throw new Error(`${flag} 다음에 값이 없습니다`);
  return v;
}
