#!/usr/bin/env node
// control-cli 명령줄 입구 — 찍을 글은 cli.ts 가 만든다
import { run } from './cli.js';

run(process.argv.slice(2), { env: process.env, dir: '.control-cli' }).then(
  (out) => {
    if (out) console.log(out);
  },
  (e: unknown) => {
    console.error(e instanceof Error ? e.message : String(e));
    process.exitCode = 1;
  },
);
