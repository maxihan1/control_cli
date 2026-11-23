#!/usr/bin/env node
// 개발사에 넘기는 zip 의 입구 — instrument 하나만 받는다. tools/handoff.mjs 가 dist/main.js 로 싣는다
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';

import { instrumentUnity } from './instrument.js';

const USAGE = 'instrument <Unity 프로젝트 폴더> [--relay <주소>] 꼴이어야 합니다';

function run(argv: string[]): string {
  const { values, positionals } = parseArgs({ args: argv, allowPositionals: true, options: { ref: { type: 'string' }, relay: { type: 'boolean' } } });
  const [name, ...args] = positionals;
  if (name !== 'instrument') throw new Error(USAGE);
  const address = values.relay ? args.find((a) => /^(ws|http)s?:\/\//.test(a)) : undefined;
  if (values.relay && !address) throw new Error('--relay 뒤에 게임이 걸 주소(ws:// · wss://)를 줍니다');
  const folders = args.filter((a) => a !== address);
  if (folders.length !== 1) throw new Error(USAGE);
  if (existsSync(join(folders[0], 'project.godot'))) throw new Error('Unity 프로젝트만 받습니다');
  return instrumentUnity(folders[0], values.ref, address?.replace(/^http/, 'ws'));
}

try {
  console.log(run(process.argv.slice(2)));
} catch (e) {
  console.error(e instanceof Error ? e.message : String(e));
  process.exitCode = 1;
}
