// 엔진과 무관한 명령 한 벌 — protocol/commands.json 을 읽어 CLI · conform · (P1) MCP 가 같은 목록을 쓴다
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface Arg {
  /** array 는 글자 배열 — 메서드 인자 */
  type: 'string' | 'number' | 'array';
  required: boolean;
  summary: string;
  /** 고를 수 있는 글자 — string 칸만 */
  enum?: string[];
}

export interface CommandSpec {
  name: string;
  summary: string;
  args: Record<string, Arg>;
}

export interface Protocol {
  protocol: number;
  commands: CommandSpec[];
}

// dist/protocol.js 에서 저장소 뿌리의 protocol/ — npm 패키지에도 protocol/ 을 싣는다(package.json files).
export const PROTOCOL = JSON.parse(readFileSync(join(import.meta.dirname, '..', 'protocol', 'commands.json'), 'utf8')) as Protocol;
export const COMMANDS = PROTOCOL.commands.map((c) => c.name);
