// 명령줄 하나를 받아 세션 파일을 읽고 게임 · 디바이스 팜 · Appium 에 보낸 뒤 찍을 글을 돌려준다
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseArgs } from 'node:util';

import { call, connect, farmOf, openSession, screenshot, type Conn } from './appium.js';
import { crawl, CRAWL } from './crawl.js';
import { Game, settled, type WaitOptions } from './game.js';
import { instrument } from './instrument.js';
import { farmLink, GAME_PORT, usbLink } from './link.js';
import { snapshot } from './snapshot.js';

interface Session {
  via: 'farm' | 'usb';
  /** USB 는 비면 adb 에 꽂힌 하나뿐인 폰 */
  udid?: string;
  /** Appium 세션 번호 — 없으면 스크린샷이 없다(USB 로 이미 켠 게임에 붙었을 때) */
  appium?: string;
  refs: Record<string, string>;
}

export interface Options {
  env: Record<string, string | undefined>;
  /** 세션 파일 · 화면 파일을 두는 폴더 */
  dir: string;
}

// 테스트가 줄일 수 있게 묶어 둔다
export const TIMING = { openWaitMs: 60_000, openStepMs: 1000 };

export const HELP = `control-cli [-s=<세션>] <명령>

  hold [--udid <serial>] [--minutes 30|60|120]   디바이스 팜 폰을 잡는다 (udid 가 없으면 빈 폰 하나)
  open --app <QA APK 주소>                        잡은 폰에 깔고 켠 뒤 첫 화면을 찍는다
  open --usb [--app <APK>] [--udid <serial>]      USB 폰 — app 이 있으면 내 컴퓨터 Appium 이 깔고 켠다
  snapshot                                         줄인 오브젝트 목록 + 스크린샷 파일
  click <ref|주소>                                 Ran: await game.click('LoginButton')
  drag <ref|주소> <ref|주소>
  type <ref|주소> <글자>
  text <ref|주소>                                  글자 읽기
  get <ref|주소> <컴포넌트.칸>                     속성 읽기 (PlayerController.moveSpeed)
  find <ref|주소>
  wait <ref|주소> [--text <글자>] [--gone] [--timeout <초>]
  layout [ref|주소]                                안전 영역 밖 · 겹침
  errors [번호]                                    게임 예외 · 에러 로그(이 번호 뒤만)
  tap <x> <y>                                      좌표 누르기(살펴볼 때만 — Ran 줄 없음)
  ping · tree
  crawl [--max ${CRAWL.maxWindows}] [--minutes ${CRAWL.minutes}] [--exclude <정규식>]… [--out <폴더>]   창 훑기
  close                                            Appium 세션을 닫는다
  release [--udid <serial>]                        폰을 놓는다 — 팜이 깐 게임 · 데이터를 지운다
  instrument <Unity 프로젝트 폴더> [--ref <커밋>]  QA 빌드에 SDK 를 넣는다

주소는 오브젝트 이름(하나뿐일 때) 또는 /Canvas/Panel/Slot[2] 경로. ref(e3)는 마지막 화면에서만 쓴다.
연결: --url 또는 PLATFORM_APPIUM_URL (없으면 http://127.0.0.1:4723) · 토큰: --token 또는 PLATFORM_APPIUM_TOKEN
앱: --app 또는 PLATFORM_APP · 폰: --udid 또는 PLATFORM_DEVICE_UDID · USB 게임 포트: --port (기본 ${GAME_PORT})`;

const quote = (s: string) => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n')}'`;
const ran = (method: string, ...args: string[]) => `Ran: await game.${method}(${args.join(', ')})`;
const sleep = (ms: number) => new Promise((ok) => setTimeout(ok, ms));

export async function run(argv: string[], o: Options): Promise<string> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      session: { type: 'string', short: 's' },
      url: { type: 'string' },
      token: { type: 'string' },
      app: { type: 'string' },
      udid: { type: 'string' },
      usb: { type: 'boolean' },
      port: { type: 'string' },
      minutes: { type: 'string' },
      text: { type: 'string' },
      gone: { type: 'boolean' },
      timeout: { type: 'string' },
      max: { type: 'string' },
      exclude: { type: 'string', multiple: true },
      out: { type: 'string' },
      ref: { type: 'string' },
    },
  });
  const [name, ...args] = positionals;
  if (name === undefined || name === 'help') return HELP;
  const env = o.env;

  // 폰이 아니라 Unity 프로젝트 파일을 고치는 명령이다.
  if (name === 'instrument') {
    const ref = values.ref ?? 'main';
    if (args.length !== 1) throw new Error('instrument <Unity 프로젝트 폴더> [--ref <태그 · 커밋>] 꼴이어야 합니다');
    const { asmdefs, warnings } = instrument(args[0], ref);
    return [
      `SDK(${ref}) 를 Packages/manifest.json 에 더했습니다`,
      ...asmdefs.map((a) => `asmdef 참조 더함: ${a}`),
      ...warnings.map((w) => `경고: ${w}`),
      'QA 빌드 정의 심볼에 CONTROL_CLI 가 있어야 SDK 가 빌드에 들어갑니다',
    ].join('\n');
  }

  // -s=probe 도 받는다 (appium-cli · playwright-cli 와 같은 꼴)
  const sname = (values.session ?? 'default').replace(/^=/, '');
  if (!/^[\w-]+$/.test(sname)) throw new Error(`세션 이름은 글자 · 숫자 · _ · - 만 씁니다: ${sname}`);
  await mkdir(o.dir, { recursive: true });
  const file = join(o.dir, `${sname}.json`);
  const heldFile = join(o.dir, 'held');
  const appium = connect(values.url ?? env.PLATFORM_APPIUM_URL ?? 'http://127.0.0.1:4723', values.token ?? env.PLATFORM_APPIUM_TOKEN);
  const farm = farmOf(appium);
  const port = values.port === undefined ? GAME_PORT : Number(values.port);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('--port 는 1~65535 정수여야 합니다');

  if (name === 'hold') {
    const minutes = Number(values.minutes ?? 30);
    if (![30, 60, 120].includes(minutes)) throw new Error('--minutes 는 30 · 60 · 120 중 하나입니다');
    let serial = values.udid ?? env.PLATFORM_DEVICE_UDID;
    if (!serial) {
      // 다른 실행이 쓰는 폰은 고르지 않는다 — 팜은 QA Hub 를 한 사람으로 본다(게임 명세 「게임 연결」).
      const v = (await call(farm, 'GET', '/api/devices?status=idle')) as { devices?: { serial: string }[] } | null;
      serial = v?.devices?.[0]?.serial;
      if (!serial) throw new Error('잡을 수 있는 빈 폰이 없습니다 — 폰이 다른 실행에 쓰이는 중일 수 있습니다');
    }
    const v = (await call(farm, 'POST', `/api/devices/${encodeURIComponent(serial)}/hold`, { minutes })) as { held?: { until?: number } } | null;
    await writeFile(heldFile, serial);
    const until = v?.held?.until === undefined ? '' : ` — ${new Date(v.held.until).toTimeString().slice(0, 5)} 까지`;
    return `폰 ${serial} 잡음${until}. 다 쓰면 close 뒤 release`;
  }
  if (name === 'release') {
    const serial = values.udid ?? env.PLATFORM_DEVICE_UDID ?? (await readFile(heldFile, 'utf8').catch(() => '')).trim();
    if (!serial) throw new Error('놓을 폰을 모릅니다 — --udid 로 줍니다');
    await call(farm, 'DELETE', `/api/devices/${encodeURIComponent(serial)}/hold`);
    await rm(heldFile, { force: true });
    return `폰 ${serial} 놓음 — 팜이 깐 게임 · 데이터를 정리합니다`;
  }

  if (name === 'open') {
    if (await readFile(file).then(() => true, () => false)) throw new Error(`세션 ${sname} 이 이미 열려 있습니다 — close 부터 합니다`);
    const via = values.usb ? 'usb' : 'farm';
    const udid = values.udid ?? env.PLATFORM_DEVICE_UDID ?? (via === 'farm' ? (await readFile(heldFile, 'utf8').catch(() => '')).trim() || undefined : undefined);
    if (via === 'farm' && !udid) throw new Error('잡은 폰이 없습니다 — hold 부터 합니다');
    const app = values.app ?? env.PLATFORM_APP;
    if (via === 'farm' && !app) throw new Error('게임을 깔려면 --app 이나 PLATFORM_APP 이 필요합니다(QA APK 주소)');
    const s: Session = { via, udid, refs: {} };
    if (app) s.appium = await openSession(appium, app, udid);
    // 게임이 답하기 전에 실패해도 close 로 Appium 세션을 닫을 수 있게 먼저 적는다.
    await save(file, s);
    const game = gameOf(s, farm, port);
    const info = await untilAnswers(game);
    return `세션 ${sname} 열림 — ${info.app} ${info.version} (${via === 'farm' ? `디바이스 팜 ${udid}` : 'USB'})\n${await shot(game, s, appium, file, sname, o.dir)}`;
  }

  const s = await load(file);
  if (name === 'close') {
    if (s.appium) await call(appium, 'DELETE', `/session/${s.appium}`);
    await rm(file, { force: true });
    return `세션 ${sname} 닫음${s.via === 'farm' ? ' — 폰은 아직 잡혀 있습니다(release)' : ''}`;
  }

  const game = gameOf(s, farm, port);
  const target = (x: string | undefined, what = '주소') => {
    if (x === undefined) throw new Error(`${name} 에 ${what}(ref 나 오브젝트 이름 · 경로)가 필요합니다`);
    if (!/^e\d+$/.test(x)) return x;
    const address = s.refs[x];
    if (address === undefined) throw new Error(`ref ${x} 가 마지막 화면에 없습니다 — snapshot 을 다시 찍고 거기 ref 를 씁니다`);
    return address;
  };
  const after = async (line: string) => `${line}\n${await shot(game, s, appium, file, sname, o.dir, true)}`;

  switch (name) {
    case 'ping':
      return JSON.stringify(await game.ping());
    case 'tree':
      return JSON.stringify(await game.tree());
    case 'snapshot':
      return shot(game, s, appium, file, sname, o.dir);
    case 'click': {
      const a = target(args[0]);
      await game.click(a);
      return after(ran('click', quote(a)));
    }
    case 'drag': {
      const [a, b] = [target(args[0]), target(args[1], '놓을 자리')];
      await game.drag(a, b);
      return after(ran('drag', quote(a), quote(b)));
    }
    case 'type': {
      const a = target(args[0]);
      if (args[1] === undefined) throw new Error('type <ref|주소> <글자> 꼴이어야 합니다');
      const now = await game.type(a, args[1]);
      return after(`${ran('type', quote(a), quote(args[1]))}\n- 칸 글자: ${JSON.stringify(now)}`);
    }
    case 'text': {
      const a = target(args[0]);
      return `${ran('text', quote(a))}\n- 값: ${JSON.stringify(await game.text(a))}`;
    }
    case 'get': {
      const a = target(args[0]);
      if (args[1] === undefined) throw new Error('get <ref|주소> <컴포넌트.칸> 꼴이어야 합니다');
      return `${ran('get', quote(a), quote(args[1]))}\n- 값: ${JSON.stringify(await game.get(a, args[1]))}`;
    }
    case 'find': {
      const a = target(args[0]);
      return `${ran('find', quote(a))}\n- 값: ${JSON.stringify(await game.find(a))}`;
    }
    case 'wait': {
      const a = target(args[0]);
      const opts: WaitOptions = {};
      const shown: string[] = [];
      if (values.text !== undefined) {
        opts.text = values.text;
        shown.push(`text: ${quote(values.text)}`);
      }
      if (values.gone) {
        opts.gone = true;
        shown.push('gone: true');
      }
      if (values.timeout !== undefined) {
        const sec = Number(values.timeout);
        if (!(sec > 0)) throw new Error('--timeout 은 0 보다 큰 초입니다');
        opts.timeoutMs = sec * 1000;
        shown.push(`timeoutMs: ${opts.timeoutMs}`);
      }
      await game.waitFor(a, opts);
      return after(ran('waitFor', quote(a), ...(shown.length ? [`{ ${shown.join(', ')} }`] : [])));
    }
    case 'layout': {
      const a = args[0] === undefined ? undefined : target(args[0]);
      const r = await game.layout(a);
      const problems = r.problems.map((p) => (p.kind === 'outside' ? `- 안전 영역 밖: ${p.path}` : `- 겹침: ${p.path} ↔ ${p.otherPath}`));
      return [ran('layout', ...(a === undefined ? [] : [quote(a)])), `- 검사 ${r.checked}개 · 문제 ${r.problems.length}개`, ...problems].join('\n');
    }
    case 'errors': {
      if (args[0] !== undefined && !/^\d+$/.test(args[0])) throw new Error('errors [이 번호 뒤부터] 꼴이어야 합니다');
      return JSON.stringify(await game.errors(Number(args[0] ?? 0)));
    }
    case 'tap': {
      const [x, y] = args.map(Number);
      if (args.length !== 2 || !Number.isFinite(x) || !Number.isFinite(y)) throw new Error('tap <x> <y> 꼴이어야 합니다');
      await game.tap(x, y);
      return after(`- 좌표 (${x}, ${y}) 누름 — 케이스에는 주소로 씁니다`);
    }
    case 'crawl':
      return crawl(game, {
        back: s.appium ? { conn: appium, sessionId: s.appium } : undefined,
        out: values.out ?? join(o.dir, 'crawl'),
        maxWindows: values.max === undefined ? undefined : Number(values.max),
        minutes: values.minutes === undefined ? undefined : Number(values.minutes),
        exclude: values.exclude ?? [],
      });
    default:
      throw new Error(`모르는 명령입니다: ${name} — help 로 목록을 봅니다`);
  }
}

function gameOf(s: Session, farm: Conn, port: number): Game {
  return new Game(s.via === 'farm' ? farmLink(farm.base, farm.headers, s.udid!) : usbLink(s.udid, port));
}

async function load(file: string): Promise<Session> {
  try {
    return JSON.parse(await readFile(file, 'utf8')) as Session;
  } catch {
    throw new Error('열린 세션이 없습니다 — open 부터 합니다');
  }
}

const save = (file: string, s: Session) => writeFile(file, JSON.stringify(s, null, 2));

// Unity 가 뜨고 첫 장면이 SDK 포트를 열 때까지 — 스플래시 · 로딩이 길다.
async function untilAnswers(game: Game): Promise<{ app: string; version: string }> {
  const end = Date.now() + TIMING.openWaitMs;
  for (;;) {
    try {
      return await game.ping();
    } catch (e) {
      if (Date.now() >= end)
        throw new Error(`게임이 ${TIMING.openWaitMs / 1000}초 안에 답하지 않았습니다 — QA 빌드(정의 심볼 CONTROL_CLI)인가요? (${e instanceof Error ? e.message : String(e)})`);
      await sleep(TIMING.openStepMs);
    }
  }
}

// 화면은 파일로 떨군다 — 트리 글이 대화에 실리지 않게 경로만 돌려준다.
async function shot(game: Game, s: Session, appium: Conn, file: string, sname: string, dir: string, settle = false): Promise<string> {
  const t = settle ? await settled(game) : await game.tree();
  const { text, refs } = snapshot(t);
  const base = join(dir, `${sname}-${Date.now()}`);
  await writeFile(`${base}.yml`, text);
  s.refs = refs;
  await save(file, s);
  const lines = [`- Snapshot: ${base}.yml`];
  if (s.appium) {
    try {
      await writeFile(`${base}.png`, await screenshot(appium, s.appium));
      lines.push(`- Screenshot: ${base}.png`);
    } catch (e) {
      lines.push(`- 스크린샷 못 받음: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return lines.join('\n');
}
