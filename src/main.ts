#!/usr/bin/env node
// 폰의 게임 SDK 포트를 adb forward 로 잇고 명령 한 줄을 보내 답을 찍는다
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createConnection } from 'node:net';
import { join } from 'node:path';
import { parseArgs } from './args.js';
import { instrument } from './instrument.js';

const REPLY_TIMEOUT_MS = 15000;

function adbPath(): string {
  const home = process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT ?? join(process.env.HOME ?? '', 'Library/Android/sdk');
  const p = join(home, 'platform-tools', 'adb');
  return existsSync(p) ? p : 'adb';
}

function send(port: number, line: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = createConnection({ host: '127.0.0.1', port }, () => socket.write(line + '\n'));
    let buf = '';
    socket.setEncoding('utf8');
    socket.setTimeout(REPLY_TIMEOUT_MS, () => socket.destroy(new Error(`게임이 ${REPLY_TIMEOUT_MS / 1000}초 안에 답하지 않았습니다`)));
    socket.on('data', (chunk: string) => {
      buf += chunk;
      const nl = buf.indexOf('\n');
      if (nl >= 0) {
        socket.end();
        resolve(buf.slice(0, nl));
      }
    });
    socket.on('error', (e) => reject(new Error(`게임 포트 ${port} 에 붙지 못했습니다 — QA 빌드가 켜져 있나요? (${e.message})`)));
    // 폰 쪽 포트가 안 열려 있어도 adb 는 연결을 받았다가 바로 닫는다.
    socket.on('close', () => reject(new Error(`게임이 답 없이 연결을 닫았습니다 — 폰에서 QA 빌드가 켜져 있고 포트 ${port} 를 여나요?`)));
  });
}

// 폰이 아니라 Unity 프로젝트 파일을 고치는 명령이라 SDK 로 보내지 않는다.
function runInstrument(argv: string[]): void {
  let ref: string | undefined = 'main';
  const rest: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--ref') ref = argv[++i];
    else rest.push(argv[i]);
  }
  if (rest.length !== 1 || !ref || ref.startsWith('-')) throw new Error('instrument <Unity 프로젝트 폴더> [--ref <태그 · 커밋>] 꼴이어야 합니다');
  const { asmdefs, warnings } = instrument(rest[0], ref);
  console.log(`SDK(${ref}) 를 Packages/manifest.json 에 더했습니다`);
  for (const a of asmdefs) console.log(`asmdef 참조 더함: ${a}`);
  for (const w of warnings) console.warn(`경고: ${w}`);
  console.log('QA 빌드 정의 심볼에 CONTROL_CLI 가 있어야 SDK 가 빌드에 들어갑니다');
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  if (argv[0] === 'instrument') return runInstrument(argv.slice(1));
  const { serial, port, line } = parseArgs(argv);
  // forward 는 같은 포트로 다시 걸어도 덮어쓸 뿐이라 명령마다 건다.
  execFileSync(adbPath(), [...(serial ? ['-s', serial] : []), 'forward', `tcp:${port}`, `tcp:${port}`], { stdio: ['ignore', 'ignore', 'inherit'] });
  const reply = await send(port, line);
  console.log(reply);
  if ((JSON.parse(reply) as { ok?: boolean }).ok !== true) process.exitCode = 1;
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exitCode = 1;
});
