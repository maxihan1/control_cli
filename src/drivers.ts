// protocol/commands.json 에서 언어마다 드라이버의 명령 메서드를 만든다 — 드라이버 파일의 「생성」 표시 줄 사이만 다시 쓴다(npm run drivers)
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { PROTOCOL, type Arg, type CommandSpec } from './protocol.js';

const ROOT = join(import.meta.dirname, '..');

const parts = (cmd: string) => cmd.split('-');
const cap = (s: string) => s[0].toUpperCase() + s.slice(1);
const snake = (cmd: string) => parts(cmd).join('_');
const camel = (cmd: string) => parts(cmd).map((p, i) => (i ? cap(p) : p)).join('');
const pascal = (cmd: string) => parts(cmd).map(cap).join('');
// 반드시 칸이 앞 — commands.json 의 차례는 그대로 둔다.
const ordered = (c: CommandSpec): [string, Arg][] => {
  const all = Object.entries(c.args);
  return [...all.filter(([, a]) => a.required), ...all.filter(([, a]) => !a.required)];
};
const xml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const choices = (a: Arg) => (a.enum ? ` — ${a.enum.join(' · ')}` : '');

function python(cmds: CommandSpec[]): string[] {
  return cmds.flatMap((c) => {
    const args = ordered(c);
    const req = args.filter(([, a]) => a.required).map(([k]) => k);
    const opt = args.filter(([, a]) => !a.required).map(([k]) => `${k}=None`);
    const sig = ['self', ...req, ...(opt.length ? ['*', ...opt] : [])].join(', ');
    const body = args.length ? `, {${args.map(([k]) => `'${k}': ${k}`).join(', ')}}` : '';
    return [
      `def ${snake(c.name)}(${sig}):`,
      `    """${c.summary}`,
      ...(args.length ? ['', ...args.map(([k, a]) => `    ${k}: ${a.summary}${choices(a)}`)] : []),
      '    """',
      `    return self.send('${c.name}'${body})`,
      '',
    ];
  });
}

const CS_TYPE: Record<Arg['type'], string> = { string: 'string', number: 'double', boolean: 'bool', array: 'IEnumerable<string>' };
const CS_READ: Record<Arg['type'], string> = { string: 'S', number: 'N', boolean: 'B', array: 'A' };
// C# 예약어 칸 이름 — event
const csName = (k: string) => (k === 'event' ? '@event' : k);

function csharp(cmds: CommandSpec[]): string[] {
  const methods = cmds.flatMap((c) => {
    const args = ordered(c);
    const sig = args.map(([k, a]) => `${CS_TYPE[a.type]}${a.required ? '' : '?'} ${csName(k)}${a.required ? '' : ' = null'}`).join(', ');
    const value = (k: string, a: Arg) => (a.type === 'array' ? `Arr(${csName(k)})` : csName(k));
    const obj = args.length ? `new() { ${args.map(([k, a]) => `["${k}"] = ${value(k, a)}`).join(', ')} }` : 'new()';
    return [
      `/// <summary>${xml(c.summary)}</summary>`,
      ...args.map(([k, a]) => `/// <param name="${k}">${xml(a.summary + choices(a))}</param>`),
      `public JsonObject ${pascal(c.name)}(${sig}) => Send("${c.name}", ${obj});`,
      '',
    ];
  });
  const cases = cmds.map((c) => {
    const args = ordered(c).map(([k, a]) => `${a.required ? '' : `${csName(k)}: `}${CS_READ[a.type]}(a, "${k}")${a.required ? '!' : ''}`);
    return `    "${c.name}" => ${pascal(c.name)}(${args.join(', ')}),`;
  });
  return [
    ...methods,
    '/// <summary>명령 JSON 하나를 이 드라이버 메서드로 보낸다 — conform --driver 의 다리</summary>',
    'public JsonObject Dispatch(string cmd, JsonObject a) => cmd switch',
    '{',
    ...cases,
    '    _ => throw new GameException($"모르는 명령입니다: {cmd}"),',
    '};',
  ];
}

const JAVA_TYPE: Record<Arg['type'], string> = { string: 'String', number: 'double', boolean: 'boolean', array: 'List<String>' };
const JAVA_READ: Record<Arg['type'], string> = { string: 'str', number: 'num', boolean: 'bool', array: 'list' };

function java(cmds: CommandSpec[]): string[] {
  const methods = cmds.flatMap((c) => {
    const args = ordered(c);
    const req = args.filter(([, a]) => a.required);
    const opt = args.filter(([, a]) => !a.required).map(([k]) => k);
    const params = req.map(([k, a]) => `${JAVA_TYPE[a.type]} ${k}`);
    const doc = [
      `/** ${xml(c.summary)}`,
      ...req.map(([k, a]) => ` * @param ${k} ${xml(a.summary + choices(a))}`),
      ...(opt.length ? [` * @param options 고를 칸 — ${args.filter(([, a]) => !a.required).map(([k, a]) => `${k}: ${xml(a.summary + choices(a))}`).join(' / ')}`] : []),
      ' */',
    ];
    const fields = req.map(([k]) => `, "${k}", ${k}`).join('');
    const names = req.map(([k]) => k).join(', ');
    const optNames = opt.map((k) => `, "${k}"`).join('');
    if (!opt.length) return [...doc, `public Map<String, Object> ${camel(c.name)}(${params.join(', ')}) { return send("${c.name}", fields(Map.of()${fields})); }`, ''];
    return [
      ...doc,
      `public Map<String, Object> ${camel(c.name)}(${[...params, 'Map<String, ?> options'].join(', ')}) { return send("${c.name}", fields(only(options${optNames})${fields})); }`,
      '',
      `public Map<String, Object> ${camel(c.name)}(${params.join(', ')}) { return ${camel(c.name)}(${[names, 'Map.of()'].filter(Boolean).join(', ')}); }`,
      '',
    ];
  });
  const cases = cmds.map((c) => {
    const args = ordered(c);
    const req = args.filter(([, a]) => a.required);
    const call = [...req.map(([k, a]) => `${JAVA_READ[a.type]}(a, "${k}")`), ...(req.length < args.length ? [`without(a${req.map(([k]) => `, "${k}"`).join('')})`] : [])];
    return `        case "${c.name}" -> ${camel(c.name)}(${call.join(', ')});`;
  });
  return [
    ...methods,
    '/** 명령 JSON 하나를 이 드라이버 메서드로 보낸다 — conform --driver 의 다리 */',
    'public Map<String, Object> dispatch(String cmd, Map<String, Object> a) {',
    '    return switch (cmd) {',
    ...cases,
    '        default -> throw new GameException("모르는 명령입니다: " + cmd);',
    '    };',
    '}',
  ];
}

export const DRIVERS = [
  { file: 'drivers/python/control_cli.py', comment: '#', lines: python },
  { file: 'drivers/csharp/ControlCli.cs', comment: '//', lines: csharp },
  { file: 'drivers/java/controlcli/ControlCli.java', comment: '//', lines: java },
];

/** 표시 줄 사이를 생성 줄로 갈아 끼운 파일 글자 — 표시 줄의 들여쓰기를 따른다 */
export function generate(text: string, comment: string, lines: string[]): string {
  const start = `${comment} ── 생성: protocol/commands.json (npm run drivers) ──`;
  const end = `${comment} ── 생성 끝 ──`;
  const m = new RegExp(`^([ \\t]*)${escape(start)}\\n[\\s\\S]*?^[ \\t]*${escape(end)}$`, 'm').exec(text);
  if (!m) throw new Error(`「${start}」 · 「${end}」 표시 줄이 없습니다`);
  const pad = m[1];
  const body = lines.map((l) => (l ? pad + l : '')).join('\n');
  return text.slice(0, m.index) + `${pad}${start}\n${body}\n${pad}${end}` + text.slice(m.index + m[0].length);
}
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** 저장소의 드라이버 파일과 다시 만든 글자 */
export function drivers(): { file: string; now: string; want: string }[] {
  return DRIVERS.map((d) => {
    const now = readFileSync(join(ROOT, d.file), 'utf8');
    return { file: d.file, now, want: generate(now, d.comment, d.lines(PROTOCOL.commands)) };
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  for (const d of drivers()) {
    if (d.now === d.want) continue;
    writeFileSync(join(ROOT, d.file), d.want);
    console.log(`${d.file} 를 새로 만들었습니다`);
  }
}
