// 명령줄 하나를 받아 세션 파일을 읽고 게임 · 디바이스 팜 · Appium 에 보낸 뒤 찍을 글을 돌려준다
import { spawn } from 'node:child_process';
import { closeSync, existsSync, openSync, readdirSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from 'node:util';

import { back, backgroundApp, call, connect, farmOf, openSession, screenshot, type Conn } from './appium.js';
import { conform, report } from './conform.js';
import { crawl, CRAWL } from './crawl.js';
import { installAndLaunch, terminate } from './devicectl.js';
import { Game, settled, WAIT, type At, type FindOptions, type PingReply, type PrefType, type WaitOptions } from './game.js';
import { instrument, instrumentGodot } from './instrument.js';
import { driverLink, farmLink, GAME_PORT, iosLink, relayLink, tcpLink, usbLink, type Command, type Reply } from './link.js';
import { serve, VERSION } from './mcp.js';
import { relay, RELAY_PORT, type GameInfo } from './relay.js';
import { snapshot } from './snapshot.js';
import { phone } from './usbmux.js';

interface Session {
  /** pc 는 내 컴퓨터에서 도는 게임(Windows · macOS 빌드), ios 는 USB iPhone(usbmuxd)에 바로 붙는다, relay 는 이미 켜진 게임이 relay 에 걸어 왔다 */
  via: 'farm' | 'usb' | 'pc' | 'ios' | 'relay';
  /** USB 는 비면 adb 에 꽂힌 하나뿐인 폰. iPhone 은 열 때 찾은 UDID */
  udid?: string;
  /** Appium 세션 번호 — 없으면(PC · iPhone · USB 로 이미 켠 게임) 스크린샷 · 뒤로 키를 SDK 가 한다 */
  appium?: string;
  /** open --pc · --ios --app 으로 띄운 게임 — close 가 끈다 */
  pid?: number;
  /** open 때 ping 으로 받은 게임 SDK 의 명령 목록 — 밖의 명령은 보내기 전에 거절한다 */
  caps?: string[];
  /** config --wait — wait · wait-prop 의 기본 한도 */
  waitMs?: number;
  refs: Record<string, string>;
  /** open --relay — 명령은 이 relay 의 이 게임으로(깔고 켜기는 via 길 그대로) */
  relay?: { url: string; key: string };
}

export interface Options {
  env: Record<string, string | undefined>;
  /** 세션 파일 · 화면 파일을 두는 폴더 */
  dir: string;
}

// 테스트가 줄일 수 있게 묶어 둔다
// 놓은 폰은 팜이 정리하는 동안(실측 2~4초 — GAME-F1-14) 빈 폰이 아니다. 기다림은 QA Hub 폰 잡기(test_platform farm.ts)와 같은 20초다
export const TIMING = { openWaitMs: 60_000, openStepMs: 1000, cleanWaitMs: 20_000, cleanStepMs: 1000 };

export const HELP = `control-cli [-s=<세션>] <명령>

  hold [--udid <serial>] [--minutes 30|60|120]   디바이스 팜 폰을 잡는다 (udid 가 없으면 빈 폰 하나)
  open --app <QA APK 주소>                        잡은 폰에 깔고 켠 뒤 첫 화면을 찍는다
  open --usb [--app <APK>] [--udid <serial>]      USB 폰 — app 이 있으면 내 컴퓨터 Appium 이 깔고 켠다
  open --pc [--app <실행 파일 · .app>]            내 컴퓨터의 PC 게임 — app 이 있으면 띄우고 close 가 끈다
  open --ios [--app <서명된 .app>] [--udid <UDID>]  USB iPhone(usbmuxd) — app 이 있으면 devicectl 로 깔고 켠다(Xcode 15+ · iOS 17+)
  open --relay [주소] [--game <이름>] [--app …]   relay 에 걸어 온 게임 — 주소가 없으면 이 컴퓨터 relay(없으면 띄운다). --app 이면 깔고 켜기는 팜 · --pc · --ios 길
  relay [--port 13101] [--token <비밀값>] · relay status [주소]   게임이 거는 중계를 띄운다 · 붙은 게임을 본다
  snapshot [--png]                                 줄인 오브젝트 목록 + 스크린샷 파일(--png 은 게임이 PNG 로)
  click <ref|주소> [--count <n>] [--interval <초>]  Ran: await game.click('LoginButton')
  drag <ref|주소> <ref|주소> [--via <주소>]… [--duration <초>]
  type <ref|주소> <글자>
  text <ref|주소>                                  글자 읽기
  get <ref|주소> <컴포넌트.칸>                     속성 읽기 (PlayerController.moveSpeed)
  find <ref|주소> [--inactive] [--camera <주소>]     답의 x · y 는 화면 가운데 · inactive 는 꺼진 것도
  find-all <주소> [--inactive] [--camera <주소>]    맞는 것 전부
  find-at <x> <y> [--camera <주소>]                 좌표의 맨 위(살펴볼 때만 — Ran 줄 없음)
  parent <ref|주소> · components <ref|주소> · members <ref|주소> <컴포넌트>   부모 · 컴포넌트 목록 · 칸 · 메서드 목록
  text-set <ref|주소> <글자>                        글자 컴포넌트(Text · TMP · UI Toolkit Label/Button)에 글자 — 입력칸은 type
  wait-prop <ref|주소> <컴포넌트.칸> <값> [--timeout <초>]   칸 값이 될 때까지
  config [--wait <초>]                              wait · wait-prop 의 기본 한도(세션에 적는다)
  call <ref|주소> <컴포넌트.메서드> [인자…]        메서드 부르기 — 인자는 글자로, 게임이 칸 타입으로 바꾼다
  set <ref|주소> <컴포넌트.칸> <값>                칸 쓰기 — 값은 get 꼴(2.5 · true · [0,1,0] · 열거 이름)
  static-call <타입.메서드> [인자…] · static-get <타입.칸> · static-set <타입.칸> <값>
  pref-get <키> · pref-set <키> <값> · pref-delete <키> · pref-clear   저장 값(PlayerPrefs) — --type string|int|float(기본 string)
  timescale-get · timescale-set <배율>              시간 배율(1 보통 · 0 멈춤)
  scenes · scene-load <장면> [--add] · scene-unload <장면> · scene-wait <장면> [--timeout <초>]   장면 — 다 열리고 닫힐 때까지 기다린다(기본 30초)
  wait <ref|주소> [--text <글자>] [--gone] [--timeout <초>]
  layout [ref|주소]                                안전 영역 밖 · 겹침
  errors [번호] · logs [번호] · events [번호]       게임 예외 · 로그 전부 · 알림(장면 열림 · 닫힘 · 일시정지) — 이 번호 뒤만
  sdk-log on|off                                   SDK 가 받은 명령마다 게임 로그에 한 줄(입력 글자 · 값은 ***)
  key <키[+키…]> [--duration <초>] [--power <-1~1>]   키(KeyCode 이름 — Escape · Space · Return · I · Alpha1 · Mouse0). Escape 는 폰 뒤로 키와 같다
  tap <x> <y> [--count <n>] [--interval <초>]      좌표 누르기(살펴볼 때만 — Ran 줄 없음)
  touch-down <ref|주소>|<x> <y> · touch-move <번호> <ref|주소>|<x> <y> · touch-up <번호>   손가락 눌러 두기 · 옮기기 · 떼기(번호 10~19)
  swipe <x,y> <x,y>… [--duration <초>]             좌표로 끌기(살펴볼 때만 — 케이스는 drag)
  long-press <ref|주소>|<x> <y> [--duration <초>]  길게 누르기(기본 1초)
  mouse-move <ref|주소>|<x> <y> [--duration <초>]  가짜 마우스 — hover. 단추는 key Mouse0
  scroll [<ref|주소>|<x> <y>] <dy> [--dx <칸>] [--duration <초>]   마우스 바퀴(위가 +)
  key-down <키[+키…]> [--power <-1~1>] · key-up <키[+키…]>   키 눌러 두기 · 떼기(JoystickButton16~19 는 스틱 — power 가 값)
  tilt <x> <y> <z> [--duration <초>]               기울이기(가속도 g)
  pointer <ref|주소> <down|up|enter|exit>          GameObject 하나에 Pointer 이벤트
  input-reset                                      눌러 둔 손가락 · 키 · 가짜 마우스 · 기울기를 다 거둔다
  ping · tree
  conform                                          표준 화면(샘플)에 명령을 차례로 보내 기대값과 견준다 — open 바로 뒤에
  conform --driver '<다리 명령>'                    같은 차례를 다른 언어 드라이버(drivers/)가 보낸다 — PC · relay 세션
  mcp                                              stdio MCP 서버 — AI 앱(Claude Desktop · Claude Code)이 띄운다. 세션 파일은 ~/.control-cli
  crawl [--max ${CRAWL.maxWindows}] [--minutes ${CRAWL.minutes}] [--exclude <정규식>]… [--out <폴더>]   창 훑기
  close                                            Appium 세션을 닫는다
  release [--udid <serial>]                        폰을 놓는다 — 팜이 깐 게임 · 데이터를 지운다
  instrument <Unity · Godot 프로젝트 폴더> [--ref <커밋>] [--relay <주소>]  QA 빌드에 SDK 를 넣는다 — relay 주소를 주면 게임이 그리로 건다(Godot 는 이 CLI 에 실린 SDK · --ref 없음)

주소는 오브젝트 이름(하나뿐일 때) · /Canvas/Panel/Slot[2] 경로 · //*[@tag=Player] · //*[contains(@name,Slot)] · //*[@text=OK]/.. 선택자(AltTester PATH 꼴).
읽기 · 쓰기 명령(get · set · call · text-set …)은 --inactive 로 꺼진 것도, 누르기 · 끌기는 --camera 로 카메라를 고른다. ref(e3)는 마지막 화면에서만 쓴다.
입력 시간은 초 — 명령 하나는 8초 안(더 길게는 touch-down · key-down 뒤 touch-up · key-up).
연결: --url 또는 PLATFORM_APPIUM_URL (없으면 http://127.0.0.1:4723) · 토큰: --token 또는 PLATFORM_APPIUM_TOKEN, 둘 다 없으면 macOS Keychain 의 control-cli-farm
relay 토큰: CONTROL_CLI_RELAY_TOKEN, 없으면 macOS Keychain 의 control-cli-relay
앱: --app 또는 PLATFORM_APP · 폰: --udid 또는 PLATFORM_DEVICE_UDID · USB 게임 포트: --port (기본 ${GAME_PORT})`;

const quote = (s: string) => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n')}'`;
const ran = (method: string, ...args: string[]) => `Ran: await game.${method}(${args.join(', ')})`;
// 메서드 인자 — 없으면 칸을 싣지 않는다.
const list = (xs: string[]) => (xs.length ? [`[${xs.map(quote).join(', ')}]`] : []);
const opts = (shown: string[]) => (shown.length ? [`{ ${shown.join(', ')} }`] : []);
const sleep = (ms: number) => new Promise((ok) => setTimeout(ok, ms));

/**
 * 빈 폰(IDLE) 하나. 방금 놓은 폰은 팜이 정리하는 동안 OCCUPIED · cleaning 이라, 그런 폰이 있으면 정리가 끝나기를 기다린다.
 * 정리 중인 폰이 없으면 기다려도 안 바뀌어 바로 거절한다 — 두 거절 문구를 갈라야 AI 가 「다른 실행이 가져갔다」고 잘못 알리지 않는다
 */
async function idlePhone(farm: Conn): Promise<string> {
  const end = Date.now() + TIMING.cleanWaitMs;
  for (;;) {
    const v = (await call(farm, 'GET', '/api/devices')) as { devices?: { serial?: string; state?: string; detail?: string }[] } | null;
    const devices = v?.devices ?? [];
    const idle = devices.find((d) => d.state === 'IDLE' && d.serial)?.serial;
    if (idle) return idle;
    if (!devices.some((d) => d.detail === 'cleaning')) throw new Error('잡을 수 있는 빈 폰이 없습니다 — 폰이 다른 실행에 쓰이는 중일 수 있습니다');
    if (Date.now() >= end) throw new Error(`디바이스 팜이 놓은 폰을 정리하는 중이라 아직 못 잡습니다(${TIMING.cleanWaitMs / 1000}초 기다림) — 조금 뒤 다시 잡습니다`);
    await sleep(TIMING.cleanStepMs);
  }
}

export async function run(argv: string[], o: Options): Promise<string> {
  // parseArgs 는 -10 을 짧은 옵션으로 읽는다 — 음수는 잠깐 다른 글자로 감쌌다 푼다(scroll ScrollList -10 · tilt 0 -5 0 · --power -1).
  const NEG = '\u0000';
  const un = (s: string) => (s.startsWith(NEG) ? s.slice(NEG.length) : s);
  const { values, positionals } = parseArgs({
    args: argv.map((a) => (/^-\.?\d/.test(a) ? NEG + a : a)),
    allowPositionals: true,
    options: {
      session: { type: 'string', short: 's' },
      url: { type: 'string' },
      token: { type: 'string' },
      app: { type: 'string' },
      udid: { type: 'string' },
      usb: { type: 'boolean' },
      pc: { type: 'boolean' },
      ios: { type: 'boolean' },
      relay: { type: 'boolean' },
      game: { type: 'string' },
      port: { type: 'string' },
      minutes: { type: 'string' },
      text: { type: 'string' },
      gone: { type: 'boolean' },
      timeout: { type: 'string' },
      max: { type: 'string' },
      exclude: { type: 'string', multiple: true },
      out: { type: 'string' },
      ref: { type: 'string' },
      type: { type: 'string' },
      add: { type: 'boolean' },
      inactive: { type: 'boolean' },
      camera: { type: 'string' },
      png: { type: 'boolean' },
      wait: { type: 'string' },
      duration: { type: 'string' },
      count: { type: 'string' },
      interval: { type: 'string' },
      power: { type: 'string' },
      dx: { type: 'string' },
      via: { type: 'string', multiple: true },
      driver: { type: 'string' },
    },
  });
  for (const [k, v] of Object.entries(values)) {
    if (typeof v === 'string') (values as Record<string, unknown>)[k] = un(v);
    else if (Array.isArray(v)) (values as Record<string, unknown>)[k] = v.map(un);
  }
  const [name, ...args] = positionals.map(un);
  if (name === undefined || name === 'help') return HELP;
  const env = o.env;
  // AI 앱이 MCP 서버를 어느 폴더에서 띄울지 모른다(Claude Desktop 은 쓸 수 없는 /) — MCP 세션 파일은 홈 폴더에 둔다.
  if (name === 'mcp') o = { ...o, dir: join(env.HOME ?? homedir(), '.control-cli') };

  // 폰이 아니라 Unity 프로젝트 파일을 고치는 명령이다.
  if (name === 'instrument') {
    // 기본은 이 CLI 판 tag — CLI 가 아는 SDK 경로(?path=/sdk/unity)와 SDK 판이 늘 맞는다(그 tag 를 먼저 찍는다).
    const ref = values.ref ?? `v${VERSION}`;
    const address = values.relay ? args.find((a) => /^(ws|http)s?:\/\//.test(a)) : undefined;
    if (values.relay && !address) throw new Error('--relay 뒤에 게임이 걸 주소(ws:// · wss://)를 줍니다');
    const folders = args.filter((a) => a !== address);
    if (folders.length !== 1) throw new Error('instrument <Unity · Godot 프로젝트 폴더> [--ref <태그 · 커밋>] [--relay <주소>] 꼴이어야 합니다');
    const gameAddress = address?.replace(/^http/, 'ws');
    // Godot 는 project.godot 로 알아본다 — SDK 는 이 CLI 에 실린 판이라 --ref 를 받지 않는다.
    if (existsSync(join(folders[0], 'project.godot'))) {
      if (values.ref) throw new Error('Godot SDK 는 이 CLI 에 실린 판을 넣습니다 — --ref 는 Unity 만 받습니다(다른 판은 그 판의 CLI 로)');
      instrumentGodot(folders[0], gameAddress);
      return [
        `Godot SDK(${VERSION}) 를 addons/control_cli 에 넣고 autoload ControlCli 를 project.godot 에 더했습니다`,
        ...(gameAddress ? [`relay 주소를 구웠습니다 — 게임이 ${gameAddress} 로 겁니다`] : []),
      ].join('\n');
    }
    const { asmdefs, warnings } = instrument(folders[0], ref, gameAddress);
    return [
      `SDK(${ref}) 를 Packages/manifest.json 에 더했습니다`,
      ...(gameAddress ? [`relay 주소를 구웠습니다 — 게임이 ${gameAddress} 로 겁니다`] : []),
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

  if (name === 'relay') {
    if (args[0] === 'status') {
      const url = relayUrl(args[1]);
      const games = await relayGames(url, relayHeaders(env));
      return [`relay ${url} — 게임 ${games.length}개`, ...games.map((g) => `  ${gameLine(g)} · ${ago(g.since)}째 · 신호 ${ago(g.lastSeen)} 전`)].join('\n');
    }
    if (args.length) throw new Error('relay [--port <n>] [--token <비밀값>] · relay status [주소] 꼴이어야 합니다');
    const token = values.token ?? env.CONTROL_CLI_RELAY_TOKEN;
    const listenPort = values.port === undefined ? RELAY_PORT : port;
    const server = relay({ token });
    await new Promise<void>((ok, no) => {
      server.once('error', no);
      server.listen(listenPort, ok);
    });
    console.log(`relay 가 ${listenPort} 에서 게임을 받습니다 — 명령은 ${token ? '토큰이 있어야' : '이 컴퓨터에서만'}`);
    return new Promise<never>(() => {});
  }
  if (name === 'mcp') {
    // 세션 도구는 이 run 을 그대로 부른다 — 서버를 띄울 때 준 세션 · 연결 옵션을 넘긴다.
    const globals = [`--session=${sname}`, ...(['url', 'token', 'port'] as const).flatMap((k) => (values[k] === undefined ? [] : [`--${k}=${values[k]}`]))];
    await serve(process.stdin, process.stdout, {
      session: (argv) => run([...globals, ...argv], o),
      game: async (command: Command): Promise<Reply> => {
        const s = await load(file);
        const game = gameOf(s, farm, port, env);
        if (command.cmd !== 'ping') return game.call(command);
        // CLI ping 처럼 받은 caps 를 세션에 적는다 — 게임을 새 SDK 로 다시 띄웠을 수 있다.
        const reply = await game.ping();
        await save(file, { ...s, caps: game.caps });
        return reply as unknown as Reply;
      },
    });
    return '';
  }
  if (name === 'hold') {
    const minutes = Number(values.minutes ?? 30);
    if (![30, 60, 120].includes(minutes)) throw new Error('--minutes 는 30 · 60 · 120 중 하나입니다');
    let serial = values.udid ?? env.PLATFORM_DEVICE_UDID;
    if (!serial) {
      // 다른 실행이 쓰는 폰은 고르지 않는다 — 팜은 QA Hub 를 한 사람으로 본다(게임 명세 「게임 연결」).
      serial = await idlePhone(farm);
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
    // 다른 폰을 --udid 로 놓았으면 잡아 둔 폰 기록은 그대로 둔다.
    if ((await readFile(heldFile, 'utf8').catch(() => '')).trim() === serial) await rm(heldFile, { force: true });
    return `폰 ${serial} 놓음 — 팜이 깐 게임 · 데이터를 정리합니다`;
  }

  if (name === 'open') {
    if (await readFile(file).then(() => true, () => false)) throw new Error(`세션 ${sname} 이 이미 열려 있습니다 — close 부터 합니다`);
    if ([values.usb, values.pc, values.ios].filter(Boolean).length > 1) throw new Error('--usb · --pc · --ios 는 하나만 씁니다');
    if (values.game !== undefined && !values.relay) throw new Error('--game 은 --relay 와 함께 씁니다');
    const address = values.relay ? args.find((a) => /^(ws|http)s?:\/\//.test(a)) : undefined;
    // --relay 만 주면 이미 켜진 게임에 붙는다 — 깔 게 없다(PLATFORM_APP 은 보지 않는다).
    const via: Session['via'] = values.ios ? 'ios' : values.pc ? 'pc' : values.usb ? 'usb' : values.relay && values.app === undefined ? 'relay' : 'farm';
    const local = via === 'pc' || via === 'ios' || via === 'relay';
    const udid =
      via === 'pc' || via === 'relay' ? undefined
      : via === 'ios' ? (await phone(values.udid)).udid
      : (values.udid ?? env.PLATFORM_DEVICE_UDID ?? (via === 'farm' ? (await readFile(heldFile, 'utf8').catch(() => '')).trim() || undefined : undefined));
    if (via === 'farm' && !udid) throw new Error('잡은 폰이 없습니다 — hold 부터 합니다');
    const app = local ? values.app : (values.app ?? env.PLATFORM_APP);
    if (via === 'farm' && !app) throw new Error('게임을 깔려면 --app 이나 PLATFORM_APP 이 필요합니다(QA APK 주소)');
    const s: Session = { via, udid, refs: {} };
    // relay 는 켜기 전에 본다 — --app 으로 켜면 켠 뒤 (다시) 붙은 게임을 고른다.
    const url = values.relay ? relayUrl(address) : undefined;
    const headers = relayHeaders(env);
    const started = url ? await ensureRelay(url, headers, o.dir) : '';
    const before = url && app ? await relayGames(url, headers) : undefined;
    if (via === 'pc') {
      if (app) s.pid = launch(app);
    } else if (via === 'ios') {
      if (app) s.pid = installAndLaunch(udid!, app).pid;
    } else if (app) s.appium = await openSession(appium, app, udid);
    // 게임이 답하기 전에 실패해도 close 로 Appium 세션 · 띄운 게임을 닫을 수 있게 먼저 적는다.
    await save(file, s);
    const picked = url ? await pickGame(url, headers, values.game, before) : undefined;
    if (url && picked) s.relay = { url, key: picked.key };
    const game = gameOf(s, farm, port, env);
    const info = await untilAnswers(game);
    s.caps = game.caps;
    await save(file, s);
    const pid = s.pid ? ` · 프로세스 ${s.pid}` : '';
    const where =
      picked ? `relay · ${picked.platform} · ${picked.model}${via === 'farm' ? ` · 디바이스 팜 ${udid}` : ''}${pid}`
      : via === 'farm' ? `디바이스 팜 ${udid}` : via === 'usb' ? 'USB' : via === 'pc' ? `PC${pid}` : `iPhone ${udid}${pid}`;
    const engine = info.engine ? ` · ${info.engine} ${info.engineVersion} · SDK ${info.sdkVersion}` : '';
    return `${started}세션 ${sname} 열림 — ${info.app} ${info.version} (${where})${engine}\n${await shot(game, s, appium, file, sname, o.dir)}`;
  }

  const s = await load(file);
  if (name === 'close') {
    // Appium 이 세션을 이미 끝냈어도(300초 쉼 · 잡기 시간 끝) 파일은 지운다 — 남으면 open 이 막힌다.
    const closed = s.appium ? await call(appium, 'DELETE', `/session/${s.appium}`).then(() => '', (e: unknown) => ` (Appium 세션은 이미 없음: ${e instanceof Error ? e.message : String(e)})`) : '';
    // 띄운 게임이 이미 꺼졌어도 세션은 닫는다.
    const killed = s.pid === undefined ? '' : stop(s) ? ` — 게임(프로세스 ${s.pid})을 껐습니다` : ` — 게임(프로세스 ${s.pid})은 이미 꺼져 있었습니다`;
    await rm(file, { force: true });
    return `세션 ${sname} 닫음${closed}${killed}${s.via === 'farm' ? ' — 폰은 아직 잡혀 있습니다(release)' : ''}`;
  }

  const game = gameOf(s, farm, port, env);
  const target = (x: string | undefined, what = '주소') => {
    if (x === undefined) throw new Error(`${name} 에 ${what}(ref 나 오브젝트 이름 · 경로)가 필요합니다`);
    if (!/^e\d+$/.test(x)) return x;
    const address = s.refs[x];
    if (address === undefined) throw new Error(`ref ${x} 가 마지막 화면에 없습니다 — snapshot 을 다시 찍고 거기 ref 를 씁니다`);
    return address;
  };
  const after = async (line: string) => `${line}\n${await shot(game, s, appium, file, sname, o.dir, true)}`;
  const value = (v: unknown) => `- 값: ${JSON.stringify(v)}`;
  const prefType = (): PrefType | undefined => {
    if (values.type === undefined) return undefined;
    if (!['string', 'int', 'float'].includes(values.type)) throw new Error('--type 은 string · int · float 중 하나입니다');
    return values.type as PrefType;
  };
  const typed = () => (values.type === undefined ? [] : [quote(values.type)]);
  type Flag = 'inactive' | 'camera' | 'count' | 'interval' | 'duration' | 'power' | 'dx' | 'via';
  // Number('') 는 0 이다 — 빈 글자는 수가 아니다.
  const toNum = (s: string | undefined) => (s === undefined || s.trim() === '' ? NaN : Number(s));
  const num = (k: 'count' | 'interval' | 'duration' | 'power' | 'dx') => {
    const v = values[k];
    if (v === undefined) return undefined;
    const n = toNum(v as string);
    if (!Number.isFinite(n)) throw new Error(`--${k} 은 수입니다`);
    return n;
  };
  // --inactive · --camera · --count … — Game 옵션과 Ran 줄의 { … } 칸을 같이 만든다. 그 명령이 받는 것만.
  const flags = (...which: Flag[]) => {
    const o: FindOptions & { count?: number; interval?: number; duration?: number; power?: number; dx?: number; via?: string[] } = {};
    const shown: string[] = [];
    if (which.includes('inactive') && values.inactive) {
      o.inactive = true;
      shown.push('inactive: true');
    }
    if (which.includes('camera') && values.camera !== undefined) {
      o.camera = target(values.camera, '카메라 주소');
      shown.push(`camera: ${quote(o.camera)}`);
    }
    if (which.includes('via') && values.via?.length) {
      o.via = values.via.map((v) => target(v, '지날 자리'));
      shown.push(`via: [${o.via.map(quote).join(', ')}]`);
    }
    for (const k of ['count', 'interval', 'duration', 'power', 'dx'] as const) {
      const n = which.includes(k) ? num(k) : undefined;
      if (n === undefined) continue;
      o[k] = n;
      shown.push(`${k}: ${n}`);
    }
    return { o, list: shown, shown: opts(shown) };
  };
  // 한 점 — 인자 둘이 다 수면 좌표, 아니면 ref · 주소. shown 은 Ran 줄 인자(좌표면 없음)
  const point = (xs: string[], usage: string): { at: At; shown?: string; where: string } => {
    if (xs.length === 2 && xs.every((x) => x.trim() !== '' && Number.isFinite(Number(x)))) return { at: { x: Number(xs[0]), y: Number(xs[1]) }, where: `좌표 (${xs[0]}, ${xs[1]})` };
    if (xs.length !== 1) throw new Error(`${usage} 꼴이어야 합니다`);
    const a = target(xs[0]);
    return { at: a, shown: quote(a), where: a };
  };
  const finger = (x: string | undefined, usage: string) => {
    if (x === undefined || !/^\d+$/.test(x)) throw new Error(`${usage} 꼴이어야 합니다`);
    return Number(x);
  };
  const waitLine = () => `- 기본 기다림 ${(s.waitMs ?? WAIT.timeoutMs) / 1000}초 — wait · wait-prop (장면 기다림은 ${WAIT.sceneMs / 1000}초)`;
  // 장면 기다리기 한도 — Ran 줄에도 같은 칸을 싣는다.
  const timeout = (): { timeoutMs?: number; shown: string[] } => {
    if (values.timeout === undefined) return { shown: [] };
    const sec = Number(values.timeout);
    if (!(sec > 0)) throw new Error('--timeout 은 0 보다 큰 초입니다');
    return { timeoutMs: sec * 1000, shown: [`timeoutMs: ${sec * 1000}`] };
  };

  switch (name) {
    case 'ping': {
      // 게임을 다시 띄웠으면 SDK 가 바뀌었을 수 있다 — 받은 caps 를 세션에 적는다.
      const r = await game.ping();
      s.caps = game.caps;
      await save(file, s);
      return JSON.stringify(r);
    }
    case 'tree':
      return JSON.stringify(await game.tree());
    case 'snapshot':
      return shot(game, s, appium, file, sname, o.dir, false, values.png === true);
    case 'click': {
      const a = target(args[0]);
      const f = flags('camera', 'count', 'interval');
      await game.click(a, f.o);
      return after(ran('click', quote(a), ...f.shown));
    }
    case 'drag': {
      const [a, b] = [target(args[0]), target(args[1], '놓을 자리')];
      const f = flags('camera', 'via', 'duration');
      await game.drag(a, b, f.o);
      return after(ran('drag', quote(a), quote(b), ...f.shown));
    }
    case 'type': {
      const a = target(args[0]);
      if (args[1] === undefined) throw new Error('type <ref|주소> <글자> 꼴이어야 합니다');
      const now = await game.type(a, args[1]);
      // 비밀번호 칸은 SDK 가 *** 로 가린다 — 넣은 글자를 대화 · 케이스 코드에 남기지 않는다.
      if (now === '***') return after(`${ran('type', quote(a), quote('***'))}\n- 비밀번호 칸이라 넣은 글자를 Ran 줄에 싣지 않습니다 — 케이스에는 비밀값으로 씁니다`);
      return after(`${ran('type', quote(a), quote(args[1]))}\n- 칸 글자: ${JSON.stringify(now)}`);
    }
    case 'text': {
      const a = target(args[0]);
      return `${ran('text', quote(a))}\n- 값: ${JSON.stringify(await game.text(a))}`;
    }
    case 'get': {
      const a = target(args[0]);
      if (args[1] === undefined) throw new Error('get <ref|주소> <컴포넌트.칸> 꼴이어야 합니다');
      const f = flags('inactive');
      return `${ran('get', quote(a), quote(args[1]), ...f.shown)}\n- 값: ${JSON.stringify(await game.get(a, args[1], f.o))}`;
    }
    case 'find':
    case 'find-all': {
      const a = target(args[0]);
      const f = flags('inactive', 'camera');
      const v = name === 'find' ? await game.find(a, f.o) : await game.findAll(a, f.o);
      return `${ran(name === 'find' ? 'find' : 'findAll', quote(a), ...f.shown)}\n- 값: ${JSON.stringify(v)}`;
    }
    case 'find-at': {
      const [x, y] = args.map(Number);
      if (args.length !== 2 || !Number.isFinite(x) || !Number.isFinite(y)) throw new Error('find-at <x> <y> [--camera <주소>] 꼴이어야 합니다');
      // 좌표는 살펴볼 때만 — tap 처럼 Ran 줄 없이 맞은 것의 주소를 준다.
      const hit = await game.findAt(x, y, flags('camera').o);
      return hit ? `- 좌표 (${x}, ${y}) 의 맨 위: ${hit.path} — 케이스에는 주소로 씁니다` : `- 좌표 (${x}, ${y}) 에 맞는 것이 없습니다`;
    }
    case 'parent': {
      const a = target(args[0]);
      const f = flags('inactive');
      return `${ran('parent', quote(a), ...f.shown)}\n- 값: ${JSON.stringify(await game.parent(a, f.o))}`;
    }
    case 'wait-prop': {
      const a = target(args[0]);
      if (args[1] === undefined || args[2] === undefined) throw new Error('wait-prop <ref|주소> <컴포넌트.칸> <값> [--timeout <초>] [--inactive] 꼴이어야 합니다');
      const t = timeout();
      const f = flags('inactive');
      await game.waitForProp(a, args[1], args[2], { ...f.o, timeoutMs: t.timeoutMs });
      return ran('waitForProp', quote(a), quote(args[1]), quote(args[2]), ...opts([...t.shown, ...(f.o.inactive ? ['inactive: true'] : [])]));
    }
    case 'components': {
      const a = target(args[0]);
      const f = flags('inactive');
      return `${ran('components', quote(a), ...f.shown)}\n- 값: ${JSON.stringify(await game.components(a, f.o))}`;
    }
    case 'members': {
      const a = target(args[0]);
      if (args[1] === undefined) throw new Error('members <ref|주소> <컴포넌트> 꼴이어야 합니다');
      const f = flags('inactive');
      return `${ran('members', quote(a), quote(args[1]), ...f.shown)}\n- 값: ${JSON.stringify(await game.members(a, args[1], f.o))}`;
    }
    case 'text-set': {
      const a = target(args[0]);
      if (args[1] === undefined) throw new Error('text-set <ref|주소> <글자> 꼴이어야 합니다');
      const f = flags('inactive');
      const now = await game.setText(a, args[1], f.o);
      return after(`${ran('setText', quote(a), quote(args[1]), ...f.shown)}\n- 칸 글자: ${JSON.stringify(now)}`);
    }
    case 'config': {
      if (values.wait !== undefined) {
        const sec = Number(values.wait);
        if (!(sec > 0)) throw new Error('--wait 은 0 보다 큰 초입니다');
        s.waitMs = sec * 1000;
        await save(file, s);
      }
      return waitLine();
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
    case 'errors':
    case 'logs':
    case 'events': {
      if (args[0] !== undefined && !/^\d+$/.test(args[0])) throw new Error(`${name} [이 번호 뒤부터] 꼴이어야 합니다`);
      const since = Number(args[0] ?? 0);
      return JSON.stringify(await (name === 'errors' ? game.errors(since) : name === 'logs' ? game.logs(since) : game.events(since)));
    }
    case 'sdk-log': {
      if (args[0] !== 'on' && args[0] !== 'off') throw new Error('sdk-log on|off 꼴이어야 합니다');
      await game.sdkLog(args[0] === 'on');
      return ran('sdkLog', String(args[0] === 'on'));
    }
    case 'key': {
      if (args[0] === undefined) throw new Error('key <키[+키…]> 꼴이어야 합니다 — KeyCode 이름(Escape · Space · Return · I · Alpha1 · Mouse0)');
      const f = flags('duration', 'power');
      await game.key(args[0], f.o);
      return after(ran('key', quote(args[0]), ...f.shown));
    }
    case 'tap': {
      const [x, y] = args.map(Number);
      if (args.length !== 2 || !Number.isFinite(x) || !Number.isFinite(y)) throw new Error('tap <x> <y> 꼴이어야 합니다');
      await game.tap(x, y, flags('count', 'interval').o);
      return after(`- 좌표 (${x}, ${y}) 누름 — 케이스에는 주소로 씁니다`);
    }
    case 'touch-down': {
      const p = point(args, 'touch-down <ref|주소> 또는 touch-down <x> <y>');
      const f = flags('camera');
      const n = await game.touchDown(p.at, f.o);
      return after(`${p.shown ? ran('touchDown', p.shown, ...f.shown) : `- ${p.where} 누름 — 케이스에는 주소로 씁니다`}\n- 손가락 ${n}`);
    }
    case 'touch-move': {
      const usage = 'touch-move <손가락 번호> <ref|주소> 또는 touch-move <손가락 번호> <x> <y>';
      const n = finger(args[0], usage);
      const p = point(args.slice(1), usage);
      const f = flags('camera');
      await game.touchMove(n, p.at, f.o);
      return after(p.shown ? ran('touchMove', String(n), p.shown, ...f.shown) : `- 손가락 ${n} 을 ${p.where} 로 — 케이스에는 주소로 씁니다`);
    }
    case 'touch-up': {
      const n = finger(args[0], 'touch-up <손가락 번호>');
      await game.touchUp(n);
      return after(ran('touchUp', String(n)));
    }
    case 'swipe': {
      const usage = 'swipe <x,y> <x,y> [x,y…] [--duration <초>]';
      const points = args.map((a) => {
        const m = /^(-?[\d.]+),(-?[\d.]+)$/.exec(a);
        const p = m && { x: toNum(m[1]), y: toNum(m[2]) };
        if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) throw new Error(`${usage} 꼴이어야 합니다`);
        return p;
      });
      if (points.length < 2) throw new Error(`${usage} 꼴이어야 합니다`);
      await game.swipe(points, flags('duration').o);
      return after(`- 좌표 ${args.join(' → ')} 끎 — 케이스에는 drag 로 씁니다`);
    }
    case 'long-press':
    case 'mouse-move': {
      const p = point(args, `${name} <ref|주소> 또는 ${name} <x> <y> [--duration <초>]`);
      const f = flags('camera', 'duration');
      if (name === 'long-press') await game.longPress(p.at, f.o);
      else await game.mouseMove(p.at, f.o);
      return after(p.shown ? ran(name === 'long-press' ? 'longPress' : 'mouseMove', p.shown, ...f.shown) : `- ${p.where} ${name === 'long-press' ? '길게 누름' : '로 마우스'} — 케이스에는 주소로 씁니다`);
    }
    case 'scroll': {
      const usage = 'scroll [<ref|주소> | <x> <y>] <dy> [--dx <칸>] [--duration <초>]';
      const dy = toNum(args[args.length - 1]);
      if (!args.length || !Number.isFinite(dy)) throw new Error(`${usage} 꼴이어야 합니다`);
      const p = args.length > 1 ? point(args.slice(0, -1), usage) : undefined;
      const f = flags('camera', 'dx', 'duration');
      await game.scroll(dy, { ...f.o, ...(p ? { at: p.at } : {}) });
      if (p && !p.shown) return after(`- ${p.where} 에서 바퀴 ${dy} — 케이스에는 주소로 씁니다`);
      return after(ran('scroll', String(dy), ...opts([...(p ? [`at: ${p.shown}`] : []), ...f.list])));
    }
    case 'key-down':
    case 'key-up': {
      if (args[0] === undefined) throw new Error(`${name} <키[+키…]> 꼴이어야 합니다`);
      if (name === 'key-up') {
        await game.keyUp(args[0]);
        return after(ran('keyUp', quote(args[0])));
      }
      const f = flags('power');
      await game.keyDown(args[0], f.o);
      return after(ran('keyDown', quote(args[0]), ...f.shown));
    }
    case 'tilt': {
      const xyz = args.map(toNum);
      if (xyz.length !== 3 || !xyz.every(Number.isFinite)) throw new Error('tilt <x> <y> <z> [--duration <초>] 꼴이어야 합니다');
      const f = flags('duration');
      await game.tilt(xyz as [number, number, number], f.o);
      return after(ran('tilt', `[${xyz.join(', ')}]`, ...f.shown));
    }
    case 'pointer': {
      const a = target(args[0]);
      const e = args[1];
      if (e !== 'down' && e !== 'up' && e !== 'enter' && e !== 'exit') throw new Error('pointer <ref|주소> <down|up|enter|exit> 꼴이어야 합니다');
      await game.pointer(a, e);
      return after(ran('pointer', quote(a), quote(e)));
    }
    case 'input-reset':
      await game.resetInput();
      return after(ran('resetInput'));
    case 'call': {
      const a = target(args[0]);
      const [method, ...rest] = args.slice(1);
      if (method === undefined) throw new Error('call <ref|주소> <컴포넌트.메서드> [인자…] 꼴이어야 합니다');
      const f = flags('inactive');
      const v = await game.callMethod(a, method, rest, f.o);
      // 인자가 없어도 옵션이 있으면 빈 배열 자리를 채운다 — kit 의 callMethod(target, method, args, options) 차례.
      return after(`${ran('callMethod', quote(a), quote(method), ...(f.shown.length && !rest.length ? ['[]'] : list(rest)), ...f.shown)}\n${value(v)}`);
    }
    case 'set': {
      const a = target(args[0]);
      if (args[1] === undefined || args[2] === undefined) throw new Error('set <ref|주소> <컴포넌트.칸> <값> 꼴이어야 합니다');
      const f = flags('inactive');
      const v = await game.set(a, args[1], args[2], f.o);
      return after(`${ran('set', quote(a), quote(args[1]), quote(args[2]), ...f.shown)}\n${value(v)}`);
    }
    case 'static-call': {
      const [method, ...rest] = args;
      if (method === undefined) throw new Error('static-call <타입.메서드> [인자…] 꼴이어야 합니다');
      const v = await game.callStatic(method, rest);
      return after(`${ran('callStatic', quote(method), ...list(rest))}\n${value(v)}`);
    }
    case 'static-get':
      if (args[0] === undefined) throw new Error('static-get <타입.칸> 꼴이어야 합니다');
      return `${ran('getStatic', quote(args[0]))}\n${value(await game.getStatic(args[0]))}`;
    case 'static-set': {
      if (args[0] === undefined || args[1] === undefined) throw new Error('static-set <타입.칸> <값> 꼴이어야 합니다');
      const v = await game.setStatic(args[0], args[1]);
      return after(`${ran('setStatic', quote(args[0]), quote(args[1]))}\n${value(v)}`);
    }
    case 'pref-get':
      if (args[0] === undefined) throw new Error('pref-get <키> [--type string|int|float] 꼴이어야 합니다');
      return `${ran('pref', quote(args[0]), ...typed())}\n${value(await game.pref(args[0], prefType()))}`;
    case 'pref-set':
      if (args[0] === undefined || args[1] === undefined) throw new Error('pref-set <키> <값> [--type string|int|float] 꼴이어야 합니다');
      await game.setPref(args[0], args[1], prefType());
      return ran('setPref', quote(args[0]), quote(args[1]), ...typed());
    case 'pref-delete':
      if (args[0] === undefined) throw new Error('pref-delete <키> 꼴이어야 합니다');
      await game.deletePref(args[0]);
      return ran('deletePref', quote(args[0]));
    case 'pref-clear':
      await game.clearPrefs();
      return ran('clearPrefs');
    case 'timescale-get':
      return `${ran('timeScale')}\n${value(await game.timeScale())}`;
    case 'timescale-set': {
      const scale = Number(args[0]);
      if (args[0] === undefined || !Number.isFinite(scale)) throw new Error('timescale-set <배율> 꼴이어야 합니다 — 1 보통 · 0 멈춤 · 2 두 배');
      await game.setTimeScale(scale);
      return ran('setTimeScale', String(scale));
    }
    case 'scenes':
      return `${ran('scenes')}\n${value(await game.scenes())}`;
    case 'scene-load':
    case 'scene-unload':
    case 'scene-wait': {
      if (args[0] === undefined) throw new Error(`${name} <장면>${name === 'scene-load' ? ' [--add]' : ''} [--timeout <초>] 꼴이어야 합니다`);
      const t = timeout();
      if (name === 'scene-load') {
        await game.loadScene(args[0], { add: values.add === true, timeoutMs: t.timeoutMs });
        return after(ran('loadScene', quote(args[0]), ...opts([...(values.add ? ['add: true'] : []), ...t.shown])));
      }
      if (name === 'scene-unload') await game.unloadScene(args[0], { timeoutMs: t.timeoutMs });
      else await game.waitForScene(args[0], { timeoutMs: t.timeoutMs });
      return after(ran(name === 'scene-unload' ? 'unloadScene' : 'waitForScene', quote(args[0]), ...opts(t.shown)));
    }
    case 'conform': {
      // --driver 면 명령을 그 언어 드라이버의 다리가 보낸다 — 다리는 CONTROL_CLI_GAME 주소로 직접 붙는다.
      const driven = values.driver === undefined ? undefined : driverLink(values.driver, { ...process.env, ...env, CONTROL_CLI_GAME: driverAddress(s, port) });
      const g = driven ? new Game(driven.link, s.caps) : game;
      // 일시정지 줄은 Appium 세션이 있을 때(팜 · USB --app)만 앱을 뒤로 보낸다.
      const r = await conform(g, { background: s.appium ? async () => void (await backgroundApp(appium, s.appium!, 2)) : undefined }).finally(() => driven?.close());
      s.caps = g.caps;
      await save(file, s);
      const out = (driven ? `드라이버 — ${values.driver}\n` : '') + report(r);
      // 실패가 있으면 종료 코드 1 — CI · 스크립트가 알아챈다.
      if (r.failed > 0) throw new Error(out);
      return out;
    }
    case 'crawl':
      return crawl(game, {
        // Appium 이 없으면(PC · USB 로 이미 켠 게임) Escape 키 — Unity 는 폰 뒤로 키를 Escape 로 준다. iPhone 에는 뒤로 키가 없다.
        back: s.appium ? () => back(appium, s.appium!) : s.via === 'ios' ? undefined : () => game.key('Escape'),
        out: values.out ?? join(o.dir, 'crawl'),
        maxWindows: values.max === undefined ? undefined : Number(values.max),
        minutes: values.minutes === undefined ? undefined : Number(values.minutes),
        exclude: values.exclude ?? [],
      });
    default:
      throw new Error(`모르는 명령입니다: ${name} — help 로 목록을 봅니다`);
  }
}

function gameOf(s: Session, farm: Conn, port: number, env: Options['env']): Game {
  // PC 게임의 SDK 는 이 컴퓨터의 127.0.0.1 에 열려 있다 — adb 없이 바로 붙는다. relay 면 깔고 켠 길과 상관없이 relay 로.
  const link =
    s.relay ? relayLink(s.relay.url, relayHeaders(env), s.relay.key)
    : s.via === 'farm' ? farmLink(farm.base, farm.headers, s.udid!)
    : s.via === 'usb' ? usbLink(s.udid, port)
    : s.via === 'ios' ? iosLink(s.udid, port)
    : tcpLink(port);
  const game = new Game(link, s.caps);
  if (s.waitMs !== undefined) game.waitMs = s.waitMs;
  return game;
}

// 드라이버 다리가 붙을 주소 — 드라이버는 TCP · relay 만 안다(drivers/ 의 Game 주소 꼴).
function driverAddress(s: Session, port: number): string {
  if (s.relay) return `${s.relay.url}/games/${encodeURIComponent(s.relay.key)}`;
  if (s.via === 'pc') return `tcp://127.0.0.1:${port}`;
  throw new Error('conform --driver 는 PC(open --pc) · relay(open --relay) 세션만 됩니다 — 드라이버는 TCP · relay 로 붙습니다');
}

// ws:// · wss:// 도 받는다 — 게임에 구운 주소를 그대로 써도 된다.
function relayUrl(address?: string): string {
  const url = (address ?? `http://127.0.0.1:${RELAY_PORT}`).replace(/^ws(s?):\/\//, 'http$1://').replace(/\/+$/, '');
  if (!/^https?:\/\/[^/]+$/.test(url)) throw new Error(`relay 주소는 http(s) · ws(s)://<호스트>[:<포트>] 꼴입니다: ${address}`);
  return url;
}

const relayHeaders = (env: Options['env']): Record<string, string> => (env.CONTROL_CLI_RELAY_TOKEN ? { Authorization: `Bearer ${env.CONTROL_CLI_RELAY_TOKEN}` } : {});

async function relayGames(url: string, headers: Record<string, string>): Promise<GameInfo[]> {
  const res = await fetch(`${url}/games`, { headers, signal: AbortSignal.timeout(5000) });
  const body = (await res.json().catch(() => null)) as { value?: unknown } | null;
  if (!res.ok) throw new Error((body?.value as { message?: string } | undefined)?.message ?? `relay ${url} 가 HTTP ${res.status} 로 답했습니다`);
  return body?.value as GameInfo[];
}

const gameLine = (g: GameInfo) => `${g.app} ${g.version} · ${g.platform} · ${g.model}`;
const ago = (t: number) => {
  const s = Math.max(0, Math.round((Date.now() - t) / 1000));
  return s < 60 ? `${s}초` : `${Math.floor(s / 60)}분`;
};

// 이 컴퓨터 주소에 relay 가 없으면 띄운다 — 토큰 변수를 지워 늘 토큰 없이(명령은 이 컴퓨터에서만). close 는 끄지 않는다(다음 open · 다른 세션이 쓴다).
async function ensureRelay(url: string, headers: Record<string, string>, dir: string): Promise<string> {
  try {
    await relayGames(url, headers);
    return '';
  } catch (e) {
    if (!(e instanceof TypeError)) throw e; // 닿았는데 거절(403 …)이면 그대로 알린다
  }
  const { hostname, port } = new URL(url);
  if (!['127.0.0.1', 'localhost'].includes(hostname)) throw new Error(`relay ${url} 에 닿지 못했습니다 — 밖 relay 는 띄우지 않습니다. 주소 · 터널이 살아 있나 봅니다`);
  const logFile = join(dir, 'relay.log');
  const log = openSync(logFile, 'a');
  // 띄운 relay 도 main.ts 를 지나 Keychain control-cli-relay 를 읽는다 — 그것도 끈다.
  const { CONTROL_CLI_RELAY_TOKEN: _token, ...env } = process.env;
  const child = spawn(process.execPath, [join(import.meta.dirname, 'main.js'), 'relay', `--port=${port || 80}`], { detached: true, stdio: ['ignore', log, log], env: { ...env, CONTROL_CLI_KEYCHAIN: '0' } });
  child.on('error', () => {});
  child.unref();
  closeSync(log);
  const end = Date.now() + 5000;
  for (;;) {
    await sleep(100);
    try {
      await relayGames(url, headers);
      return `relay 를 띄웠습니다 — ${url} (프로세스 ${child.pid}, 기록 ${logFile})\n`;
    } catch (e) {
      if (!(e instanceof TypeError) || Date.now() >= end) throw new Error(`relay 를 띄우지 못했습니다 — ${logFile} 를 봅니다`);
    }
  }
}

// open 이 고를 게임 — want 가 있으면 key · 앱 · 기종 · 기기 이름에 그 글자가 든 것, before 가 있으면(--app 으로 켰다) 켠 뒤 붙거나 다시 붙은 것.
async function pickGame(url: string, headers: Record<string, string>, want: string | undefined, before?: GameInfo[]): Promise<GameInfo> {
  const end = Date.now() + TIMING.openWaitMs;
  for (;;) {
    let games = await relayGames(url, headers);
    if (before) games = games.filter((g) => !before.some((b) => b.key === g.key && b.since === g.since));
    if (want !== undefined) games = games.filter((g) => [g.key, g.app, g.model, g.device].some((v) => v.includes(want)));
    if (games.length === 1) return games[0];
    if (games.length > 1) throw new Error([`게임이 ${games.length}개 붙어 있습니다 — --game 으로 고릅니다`, ...games.map((g) => `  ${gameLine(g)} (${g.key})`)].join('\n'));
    if (Date.now() >= end) throw new Error(`${TIMING.openWaitMs / 1000}초 안에 relay ${url} 에 붙은 게임이 없습니다${want ? `(--game ${want})` : ''} — QA 빌드에 instrument --relay 로 이 주소를 구웠나요?`);
    await sleep(TIMING.openStepMs);
  }
}

// PC 게임을 띄운다 — macOS .app 은 Contents/MacOS 안 실행 파일을 바로 띄워야 프로세스 번호를 잡아 close 가 끌 수 있다.
function launch(app: string): number {
  let exe = app;
  if (app.replace(/\/+$/, '').endsWith('.app')) {
    const dir = join(app, 'Contents', 'MacOS');
    const files = existsSync(dir) ? readdirSync(dir) : [];
    if (files.length !== 1) throw new Error(`${dir} 에서 실행 파일 하나를 찾지 못했습니다(${files.join(', ') || '없음'})`);
    exe = join(dir, files[0]);
  }
  if (!existsSync(exe)) throw new Error(`게임 실행 파일이 없습니다: ${exe}`);
  const child = spawn(exe, [], { detached: true, stdio: 'ignore' });
  // 띄우기 실패는 나중에 이벤트로 온다 — 그때는 untilAnswers 가 답 없음으로 알린다.
  child.on('error', () => {});
  child.unref();
  if (child.pid === undefined) throw new Error(`${app} 을 띄우지 못했습니다`);
  return child.pid;
}

/** 띄운 게임을 끈다 — 이미 꺼졌으면 false */
function stop(s: Session): boolean {
  try {
    if (s.via === 'ios') terminate(s.udid!, s.pid!);
    else process.kill(s.pid!);
    return true;
  } catch {
    return false;
  }
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
async function untilAnswers(game: Game): Promise<PingReply> {
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
async function shot(game: Game, s: Session, appium: Conn, file: string, sname: string, dir: string, settle = false, png = false): Promise<string> {
  const t = settle ? await settled(game) : await game.tree();
  const { text, refs } = snapshot(t);
  const base = join(dir, `${sname}-${Date.now()}`);
  await writeFile(`${base}.yml`, text);
  s.refs = refs;
  await save(file, s);
  const lines = [`- Snapshot: ${base}.yml`];
  // Appium 이 없으면(PC · USB 로 이미 켠 게임) 게임이 프레임 끝에서 찍는다 — 팜은 수 MB 답을 HTTP 로 나르지 않게 Appium 으로.
  // --png 은 게임이 PNG 로 찍는다(SDK 0.5.0) — Appium 은 원래 PNG.
  const ext = s.appium || png ? 'png' : 'jpg';
  const take = s.appium ? () => screenshot(appium, s.appium!) : () => game.screenshot(png ? 'png' : 'jpg');
  try {
    await writeFile(`${base}.${ext}`, await take());
    lines.push(`- Screenshot: ${base}.${ext}`);
  } catch (e) {
    lines.push(`- 스크린샷 못 받음: ${e instanceof Error ? e.message : String(e)}`);
  }
  return lines.join('\n');
}
