// Recorder — 인스펙터에서 누른 차례(동작 · 확인)를 다시 돌리고 TS · Python · C# · Java · Robot 테스트로 내보낸다
import type { Game } from './game.js';

/** 기록 한 단계 — 동작 셋(click · type · key) · 확인 둘(글자가 들어 있다 · 칸 값이 같다). secret 은 비밀번호 칸 — 글자 대신 환경 변수 이름 */
export type Step =
  | { do: 'click'; target: string }
  | { do: 'type'; target: string; text?: string; secret?: string }
  | { do: 'key'; key: string }
  | { check: 'text'; target: string; contains: string }
  | { check: 'prop'; target: string; prop: string; equals: unknown };

export type Lang = 'ts' | 'py' | 'cs' | 'java' | 'robot';
/** 언어마다 내보낼 파일 이름 */
export const FILES: Record<Lang, string> = { ts: 'recorded.test.ts', py: 'test_recorded.py', cs: 'Recorded.cs', java: 'RecordedTest.java', robot: 'recorded.robot' };
export const LANGS = Object.keys(FILES) as Lang[];

const DEFAULT_GAME = 'tcp://127.0.0.1:13100';
// 확인은 기다림 꼴 — 동작 뒤 화면이 바로 안 바뀐다. TS 는 Game 의 기본 한도(10초), 다른 언어도 같은 10초 · 0.3초.
const UNTIL_S = 10;

/** 비밀번호 칸 이름에서 환경 변수 이름 — SECRET_PWINPUT */
export const secretName = (target: string) => `SECRET_${(target.split('/').pop() ?? target).replace(/\[\d+\]$/, '').replace(/\W/g, '_').toUpperCase()}`;

/** 글자를 넣고 그 단계를 돌려준다 — 비밀번호 칸(답이 ***)은 글자를 적지 않고 환경 변수 이름을 적는다 */
export async function typeStep(game: Game, target: string, text: string): Promise<Step> {
  const now = await game.type(target, text);
  return now === '***' ? { do: 'type', target, secret: secretName(target) } : { do: 'type', target, text };
}

/** 기록 파일의 단계를 꼴만 본다 — 사람이 고친 파일 · 브라우저가 보낸 JSON 이라 믿지 않는다 */
export function steps(v: unknown): Step[] {
  const list = Array.isArray(v) ? v : (v as { steps?: unknown } | null)?.steps;
  if (!Array.isArray(list)) throw new Error('기록은 단계 목록(또는 {"steps": [...]})입니다');
  const str = (x: unknown) => typeof x === 'string';
  return list.map((s: Record<string, unknown>, i) => {
    const ok =
      s?.do === 'click' ? str(s.target)
      : s?.do === 'type' ? str(s.target) && (str(s.text) || (str(s.secret) && /^\w+$/.test(s.secret as string)))
      : s?.do === 'key' ? str(s.key)
      : s?.check === 'text' ? str(s.target) && str(s.contains)
      : s?.check === 'prop' ? str(s.target) && str(s.prop) && 'equals' in s
      : false;
    if (!ok) throw new Error(`기록 ${i + 1}번째 단계의 꼴이 틀렸습니다: ${JSON.stringify(s)}`);
    return s as unknown as Step;
  });
}

/** 지금 게임에 차례로 돌린다 — 실패하면 그 단계에서 멈춘다. 줄은 TS 로 내보낸 줄과 같다 */
export async function replay(game: Game, list: Step[], env: Record<string, string | undefined> = process.env): Promise<{ ok: boolean; lines: string[] }> {
  const lines: string[] = [];
  for (const s of list) {
    const line = tsLine(s);
    try {
      if ('do' in s) {
        if (s.do === 'click') await game.click(s.target);
        else if (s.do === 'key') await game.key(s.key);
        else await game.type(s.target, typed(s, env));
      } else if (s.check === 'text') await game.waitFor(s.target, { text: s.contains });
      else await game.waitForProp(s.target, s.prop, s.equals);
      lines.push(`통과 · ${line}`);
    } catch (e) {
      lines.push(`실패 · ${line}\n  ${e instanceof Error ? e.message : String(e)}`);
      return { ok: false, lines };
    }
  }
  return { ok: true, lines };
}

function typed(s: { text?: string; secret?: string }, env: Record<string, string | undefined>): string {
  if (s.secret === undefined) return s.text!;
  const v = env[s.secret];
  if (v === undefined) throw new Error(`비밀번호 칸 글자는 환경 변수 ${s.secret} 로 줍니다`);
  return v;
}

// ── 언어마다 글자 ──
const ts = (s: string) => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n')}'`;
// JSON 글자는 Python · Java · C# 의 글자 꼴로도 맞다(U+2028 · U+2029 만 Java 가 못 읽어 \u 로).
const dq = (s: string) => JSON.stringify(s).replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
const json = (v: unknown) => JSON.stringify(v ?? null);
// Robot 칸 — 역슬래시 · 변수 꼴 · 이어진 빈칸 · 빈 글자를 감싼다.
const rb = (s: string) => (s === '' ? '${EMPTY}' : s.replace(/\\/g, '\\\\').replace(/([$@&%])\{/g, '\\$1{').replace(/ {2,}/g, (m) => '${SPACE}'.repeat(m.length)).replace(/^ | $/g, '${SPACE}').replace(/\n/g, '\\n'));
const what = (s: Step) => ('check' in s ? (s.check === 'text' ? `${s.target} 글자에 ${JSON.stringify(s.contains)}` : `${s.target} 의 ${s.prop} = ${json(s.equals)}`) : '');

function tsLine(s: Step): string {
  if ('do' in s) {
    if (s.do === 'click') return `await game.click(${ts(s.target)});`;
    if (s.do === 'key') return `await game.key(${ts(s.key)});`;
    return `await game.type(${ts(s.target)}, ${s.secret ? `process.env.${s.secret} ?? ''` : ts(s.text!)});`;
  }
  if (s.check === 'text') return `await game.waitFor(${ts(s.target)}, { text: ${ts(s.contains)} });`;
  return `await game.waitForProp(${ts(s.target)}, ${ts(s.prop)}, ${json(s.equals)});`;
}

const EXPORT: Record<Lang, (list: Step[]) => string[]> = {
  ts: (list) => [
    '// control_cli Recorder 가 기록한 테스트 — node --test recorded.test.ts (게임 주소는 CONTROL_CLI_GAME)',
    "import test from 'node:test';",
    "import { Game, linkTo } from 'control-cli';",
    '',
    "test('기록', async () => {",
    `  const game = new Game(linkTo(process.env.CONTROL_CLI_GAME ?? '${DEFAULT_GAME}'));`,
    ...list.map((s) => `  ${tsLine(s)}`),
    '});',
  ],
  py: (list) => [
    '# control_cli Recorder 가 기록한 테스트 — python3 test_recorded.py 또는 pytest (게임 주소는 CONTROL_CLI_GAME, 드라이버는 drivers/python)',
    'import json',
    'import os',
    'import time',
    '',
    'from control_cli import Game',
    '',
    '',
    `def until(what, check, timeout=${UNTIL_S}):`,
    '    end = time.time() + timeout',
    '    while not check():',
    "        if time.time() > end:",
    `            raise AssertionError(what + ' — ${UNTIL_S}초 안에 맞지 않았습니다')`,
    '        time.sleep(0.3)',
    '',
    '',
    'def test_recorded():',
    `    game = Game(os.environ.get('CONTROL_CLI_GAME', '${DEFAULT_GAME}'))`,
    ...list.map((s) => {
      if ('do' in s) {
        if (s.do === 'click') return `    game.click(${dq(s.target)})`;
        if (s.do === 'key') return `    game.key(${dq(s.key)})`;
        return `    game.type(${dq(s.target)}, ${s.secret ? `os.environ[${dq(s.secret)}]` : dq(s.text!)})`;
      }
      if (s.check === 'text') return `    until(${dq(what(s))}, lambda: ${dq(s.contains)} in (game.find(${dq(s.target)}).get('text') or ''))`;
      return `    until(${dq(what(s))}, lambda: game.get(${dq(s.target)}, ${dq(s.prop)})['value'] == json.loads(${dq(json(s.equals))}))`;
    }),
    '',
    '',
    "if __name__ == '__main__':",
    '    test_recorded()',
    "    print('통과')",
  ],
  cs: (list) => [
    '// control_cli Recorder 가 기록한 테스트 — drivers/csharp/ControlCli.cs 옆에 두고 dotnet run (게임 주소는 CONTROL_CLI_GAME)',
    'using System.Text.Json.Nodes;',
    'using ControlCli;',
    '',
    `var game = new Game(Environment.GetEnvironmentVariable("CONTROL_CLI_GAME") ?? "${DEFAULT_GAME}");`,
    ...list.map((s) => {
      if ('do' in s) {
        if (s.do === 'click') return `game.Click(${dq(s.target)});`;
        if (s.do === 'key') return `game.Key(${dq(s.key)});`;
        return `game.Type(${dq(s.target)}, ${s.secret ? `Environment.GetEnvironmentVariable(${dq(s.secret)}) ?? ""` : dq(s.text!)});`;
      }
      if (s.check === 'text') return `Until(${dq(what(s))}, () => (game.Find(${dq(s.target)})["text"]?.GetValue<string>() ?? "").Contains(${dq(s.contains)}));`;
      return `Until(${dq(what(s))}, () => JsonNode.DeepEquals(game.Get(${dq(s.target)}, ${dq(s.prop)})["value"], JsonNode.Parse(${dq(json(s.equals))})));`;
    }),
    'Console.WriteLine("통과");',
    '',
    'static void Until(string what, Func<bool> check)',
    '{',
    `    var end = DateTime.UtcNow.AddSeconds(${UNTIL_S});`,
    '    while (!check())',
    '    {',
    `        if (DateTime.UtcNow > end) throw new Exception(what + " — ${UNTIL_S}초 안에 맞지 않았습니다");`,
    '        Thread.Sleep(300);',
    '    }',
    '}',
  ],
  java: (list) => [
    '// control_cli Recorder 가 기록한 테스트 — java -cp <ControlCli 를 빌드한 폴더> RecordedTest.java (게임 주소는 CONTROL_CLI_GAME)',
    'import controlcli.ControlCli;',
    'import java.util.function.BooleanSupplier;',
    '',
    'public class RecordedTest {',
    '    static void until(String what, BooleanSupplier check) throws InterruptedException {',
    `        long end = System.currentTimeMillis() + ${UNTIL_S * 1000};`,
    '        while (!check.getAsBoolean()) {',
    `            if (System.currentTimeMillis() > end) throw new AssertionError(what + " — ${UNTIL_S}초 안에 맞지 않았습니다");`,
    '            Thread.sleep(300);',
    '        }',
    '    }',
    '',
    '    public static void main(String[] args) throws Exception {',
    `        ControlCli game = new ControlCli(System.getenv().getOrDefault("CONTROL_CLI_GAME", "${DEFAULT_GAME}"));`,
    ...list.map((s) => {
      if ('do' in s) {
        if (s.do === 'click') return `        game.click(${dq(s.target)});`;
        if (s.do === 'key') return `        game.key(${dq(s.key)});`;
        return `        game.type(${dq(s.target)}, ${s.secret ? `System.getenv().getOrDefault(${dq(s.secret)}, "")` : dq(s.text!)});`;
      }
      if (s.check === 'text') return `        until(${dq(what(s))}, () -> String.valueOf(game.find(${dq(s.target)}).getOrDefault("text", "")).contains(${dq(s.contains)}));`;
      // 양쪽을 드라이버의 JSON 쓰기로 맞춘다 — 수는 Double 로 읽혀도 정수면 2 로 쓴다.
      return `        until(${dq(what(s))}, () -> ControlCli.Json.write(game.get(${dq(s.target)}, ${dq(s.prop)}).get("value")).equals(ControlCli.Json.write(ControlCli.Json.read(${dq(json(s.equals))}))));`;
    }),
    '        System.out.println("통과");',
    '    }',
    '}',
  ],
  robot: (list) => [
    '# control_cli Recorder 가 기록한 테스트 — robot --pythonpath drivers/python recorded.robot (게임 주소는 CONTROL_CLI_GAME)',
    '*** Settings ***',
    `Library           control_cli.Game    %{CONTROL_CLI_GAME=${DEFAULT_GAME}}`,
    '',
    '*** Test Cases ***',
    '기록',
    ...list.map((s) => {
      const until = `    Wait Until Keyword Succeeds    ${UNTIL_S}s    0.3s    `;
      if ('do' in s) {
        if (s.do === 'click') return `    Click    ${rb(s.target)}`;
        if (s.do === 'key') return `    Key    ${rb(s.key)}`;
        return `    Type    ${rb(s.target)}    ${s.secret ? `%{${s.secret}}` : rb(s.text!)}`;
      }
      if (s.check === 'text') return `${until}글자에 들어 있다    ${rb(s.target)}    ${rb(s.contains)}`;
      return `${until}값이 같다    ${rb(s.target)}    ${rb(s.prop)}    ${rb(json(s.equals))}`;
    }),
    '',
    '*** Keywords ***',
    '글자에 들어 있다',
    '    [Arguments]    ${target}    ${text}',
    '    ${r}=    Find    ${target}',
    '    Should Contain    ${r}[text]    ${text}',
    '',
    '값이 같다',
    '    [Arguments]    ${target}    ${prop}    ${want}',
    '    ${r}=    Get    ${target}    ${prop}',
    '    Should Be Equal    ${r}[value]    ${{json.loads($want)}}',
  ],
};

/** 그 언어 테스트 파일 글자 */
export function exportTest(list: Step[], lang: Lang): string {
  const make = EXPORT[lang];
  if (!make) throw new Error(`언어는 ${LANGS.join(' · ')} 중 하나입니다: ${lang}`);
  return make(list).join('\n') + '\n';
}
