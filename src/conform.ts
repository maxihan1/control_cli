// 표준 화면에 정해진 차례로 명령을 보내 기대값과 견준다 — 엔진마다 같은 표준 화면이면 같은 결과가 나와야 한다(docs/roadmap/plan.md 「적합성 검사」)
import { WAIT, type Game, type PingReply } from './game.js';

// 테스트가 줄일 수 있게 묶어 둔다 — 실기기에서 누른 뒤 글자가 바뀌기까지 1초 안팎이다. holdS · dragS · keyS 는 C 줄이 보내는 시간(가짜는 기다리지 않아 테스트는 0).
export const CONFORM = { waitMs: 5000, holdS: 1, dragS: 0.5, keyS: 0.5 };

interface Step {
  /** 이 줄이 쓰는 명령 — 하나라도 게임 SDK 의 caps 에 없으면 건너뛴다 */
  cmds: string[];
  label: string;
  run: (game: Game) => Promise<void>;
}

export interface ConformResult {
  ping: PingReply;
  lines: string[];
  passed: number;
  failed: number;
  skipped: number;
}

function same(what: string, got: unknown, want: unknown): void {
  if (JSON.stringify(got) !== JSON.stringify(want)) throw new Error(`${what}: ${JSON.stringify(got)} — 기대 ${JSON.stringify(want)}`);
}

const typed = (target: string, want: string): Step => ({
  cmds: ['type'],
  label: `type ${target} 'qa_user01!' → ${want}`,
  run: async (g) => same(target, await g.type(target, 'qa_user01!'), want),
});

// 상태 글자가 누르기 전과 달라지고 이 글자가 들어 있어야 통과 — 다시 돌려 앞 판 글자가 남아 있어도 이번 누르기를 본다(샘플은 누를 때마다 번호가 늘거나 글자가 바뀐다).
const pressed = (cmd: 'click' | 'key', target: string, status: string, text: string): Step => ({
  cmds: [cmd, 'find'],
  label: `${cmd} ${target} → ${status} 에 「${text}」`,
  run: async (g) => {
    const before = (await g.find(status))?.text;
    if (cmd === 'click') await g.click(target);
    else await g.key(target);
    const end = Date.now() + CONFORM.waitMs;
    for (;;) {
      const now = (await g.find(status))?.text;
      if (now !== undefined && now !== before && now.includes(text)) return;
      if (Date.now() >= end) throw new Error(`${status}: ${JSON.stringify(now ?? null)} — 기대 「${text}」 · 누르기 전(${JSON.stringify(before ?? null)})과 달라야 함`);
      await new Promise((ok) => setTimeout(ok, WAIT.intervalMs));
    }
  },
});

// 값이 그렇게 될 때까지 다시 읽는다 — 실기기는 다음 프레임에 바뀐다
async function poll<T>(what: string, read: () => Promise<T>, ok: (v: T) => boolean): Promise<T> {
  const end = Date.now() + CONFORM.waitMs;
  for (;;) {
    const v = await read();
    if (ok(v)) return v;
    if (Date.now() >= end) throw new Error(`${what} — 마지막 ${JSON.stringify(v)}`);
    await new Promise((r) => setTimeout(r, WAIT.intervalMs));
  }
}
const textOf = (g: Game, target: string) => async () => (await g.find(target))?.text ?? '';
// 「fingers 2 · keys A LeftShift · …」 꼴 글자에서 이름 뒤 값 — InputText · PointerText
const part = (text: string, name: string) => text.split(' · ').find((p) => p.startsWith(`${name} `))?.slice(name.length + 1);
const shows = (g: Game, target: string, name: string, value: string) => poll(`${target} 의 ${name} — 기대 ${value}`, textOf(g, target), (t) => part(t, name) === value);
// Item 이 든 칸 번호 — 끌기 줄은 늘 다른 칸으로 옮겨 다시 돌려도 움직임을 본다
async function slotOf(g: Game): Promise<number> {
  const path = (await g.find('Item'))?.path ?? '없음';
  const k = Number(/\/Bag\/Slot\[(\d)\]\/Item$/.exec(path)?.[1]);
  if (!Number.isInteger(k)) throw new Error(`Item 자리: ${path}`);
  return k;
}
const slot = (k: number) => `/SampleCanvas/Bag/Slot[${k % 4}]`;
const listPos = (g: Game) => async () => (await g.get('ScrollList', 'ScrollRect.verticalNormalizedPosition')) as number;
// 눌러 둔 채 실패하면 다음 줄이 갇힌다 — 끝에 거둔다.
const released = (run: (g: Game) => Promise<void>) => async (g: Game) => {
  try {
    await run(g);
  } finally {
    await g.resetInput().catch(() => undefined);
  }
};

// 표준 화면 — Unity 는 sample/Assets/Sample. 다른 엔진 샘플도 같은 이름 · 같은 반응을 만든다.
export const STEPS: Step[] = [
  {
    cmds: ['tree'],
    label: 'tree 뿌리에 SampleCanvas · UitkDocument',
    run: async (g) => {
      const roots = (await g.tree()).tree.map((n) => n.name);
      same('없는 뿌리', ['SampleCanvas', 'UitkDocument'].filter((n) => !roots.includes(n)), []);
    },
  },
  { cmds: ['find'], label: 'find /UitkDocument/UitkPanel/UitkIdInput', run: async (g) => same('찾음', (await g.find('/UitkDocument/UitkPanel/UitkIdInput')) !== null, true) },
  typed('IdInput', 'qauser01'),
  typed('TmpIdInput', 'qauser01'),
  typed('UitkIdInput', 'qa_user0'),
  pressed('click', 'LoginButton', 'StatusText', 'login qauser01'),
  pressed('click', 'TmpLoginButton', 'TmpStatusText', 'tmp login qauser01'),
  pressed('click', 'UitkLoginButton', 'UitkStatusText', 'uitk login qa_user0'),
  {
    cmds: ['drag', 'find'],
    label: 'drag Item → 다른 칸',
    run: async (g) => {
      // 처음엔 Slot[0] → Slot[3]. 다시 돌려 이미 Slot[3] 에 있으면 Slot[2] 로 — 옮겨졌는지를 본다.
      const to = `/SampleCanvas/Bag/Slot[${(await g.find('/SampleCanvas/Bag/Slot[3]/Item')) ? 2 : 3}]`;
      await g.drag('Item', to);
      same(`${to}/Item 있음`, (await g.find(`${to}/Item`)) !== null, true);
    },
  },
  pressed('click', 'WorldCube', 'TouchText', 'cube'),
  pressed('key', 'I', 'TouchText', 'key I'),
  {
    cmds: ['get'],
    label: 'get WorldCube Transform.position → 숫자 셋',
    run: async (g) => {
      const v = await g.get('WorldCube', 'Transform.position');
      if (!(Array.isArray(v) && v.length === 3 && v.every((n) => typeof n === 'number'))) throw new Error(`값 ${JSON.stringify(v)} — 숫자 셋이어야 합니다`);
    },
  },
  { cmds: ['tap'], label: 'tap 10 10', run: (g) => g.tap(10, 10) },
  { cmds: ['layout'], label: 'layout 이 답한다', run: async (g) => void (await g.layout()) },
  { cmds: ['screenshot'], label: 'screenshot 이 그림을 준다', run: async (g) => same('그림이 있음', (await g.screenshot()).length > 0, true) },
  // A — 게임 상태(P2-A). 표준 화면의 SampleCanvas 에 TouchProbe(Say · static Add · static Note), 빌드 두 번째 장면 Second 에 SecondMarker.
  {
    cmds: ['call', 'find'],
    label: 'A call SampleCanvas TouchProbe.Say hi 3 → TouchText 「hi 3」',
    run: async (g) => {
      same('돌려준 값', await g.callMethod('SampleCanvas', 'TouchProbe.Say', ['hi', 3]), 'hi 3');
      same('TouchText', (await g.find('TouchText'))?.text, 'hi 3');
    },
  },
  {
    cmds: ['set', 'get', 'find'],
    label: 'A set StatusText Text.text · WorldCube Transform.position.y 를 바꿨다 되돌린다',
    run: async (g) => {
      same('StatusText', await g.set('StatusText', 'Text.text', 'set by conform'), 'set by conform');
      same('StatusText 글자', (await g.find('StatusText'))?.text, 'set by conform');
      // 값 타입 칸(Vector3.y)을 바꾸면 SDK 가 position 에 다시 써 넣어야 큐브가 움직인다.
      const p = (await g.get('WorldCube', 'Transform.position')) as number[];
      same('position.y', await g.set('WorldCube', 'Transform.position.y', String(p[1] + 0.5)), p[1] + 0.5);
      same('position', await g.get('WorldCube', 'Transform.position'), [p[0], p[1] + 0.5, p[2]]);
      same('되돌림', await g.set('WorldCube', 'Transform.position', JSON.stringify(p)), p);
    },
  },
  {
    cmds: ['static-call', 'static-get', 'static-set'],
    label: 'A static-call Sample.TouchProbe.Add 2 3 → 5 · static-set/get Sample.TouchProbe.Note',
    run: async (g) => {
      same('Add', await g.callStatic('Sample.TouchProbe.Add', [2, 3]), 5);
      const note = `note ${Date.now()}`;
      same('static-set', await g.setStatic('Sample.TouchProbe.Note', note), note);
      same('static-get', await g.getStatic('Sample.TouchProbe.Note'), note);
    },
  },
  {
    cmds: ['timescale-get', 'timescale-set'],
    label: 'A timescale-set 0.5 → 0.5 → 1 로 되돌림',
    run: async (g) => {
      await g.setTimeScale(0.5);
      same('배율', await g.timeScale(), 0.5);
      await g.setTimeScale(1);
      same('되돌린 배율', await g.timeScale(), 1);
    },
  },
  {
    cmds: ['pref-get', 'pref-set', 'pref-delete', 'pref-clear'],
    label: 'A pref — int · float · string 넣고 읽기 · 키 지우기 · 다 지우기',
    run: async (g) => {
      await g.setPref('conform_int', 7, 'int');
      await g.setPref('conform_float', 0.5, 'float');
      await g.setPref('conform_text', 'qa 한글');
      same('int', await g.pref('conform_int', 'int'), 7);
      same('float', await g.pref('conform_float', 'float'), 0.5);
      same('string', await g.pref('conform_text'), 'qa 한글');
      await g.deletePref('conform_int');
      same('지운 키', await g.pref('conform_int', 'int'), null);
      same('남은 키', await g.pref('conform_float', 'float'), 0.5);
      await g.clearPrefs();
      same('다 지운 뒤', [await g.pref('conform_float', 'float'), await g.pref('conform_text')], [null, null]);
    },
  },
  // B — 찾기 · 설정(P2-B). 표준 화면의 WorldCube(태그 Player · 레이어 Water) · SideCamera(꺼진 Camera) · HiddenText(꺼짐) · Second 의 SecondSaved(장면에 저장).
  {
    cmds: ['find-all', 'find'],
    label: 'B find-all //Bag/Slot → 넷 · //Bag/Slot[-1] → Slot[3]',
    run: async (g) => {
      same('Slot', (await g.findAll('//Bag/Slot')).map((f) => f.path), [0, 1, 2, 3].map((i) => `/SampleCanvas/Bag/Slot[${i}]`));
      same('마지막', (await g.find('//Bag/Slot[-1]'))?.path, '/SampleCanvas/Bag/Slot[3]');
    },
  },
  {
    cmds: ['find', 'find-all'],
    label: 'B 선택자 @tag · @layer · @component · @text · contains · 이어 붙이기',
    run: async (g) => {
      same('tag', (await g.find('//*[@tag=Player]'))?.path, '/WorldCube');
      same('layer', (await g.find('//*[@layer=Water]'))?.path, '/WorldCube');
      same('tag + layer', (await g.findAll('//*[@tag=Player][@layer=Water]')).length, 1);
      same('component', (await g.find('//*[@component=TouchProbe]'))?.path, '/SampleCanvas');
      same('text', (await g.find('//*[@text=UITK Login]'))?.path, '/UitkDocument/UitkPanel/UitkLoginButton');
      same('contains', (await g.findAll('//*[contains(@name,LoginButton)]')).map((f) => f.path).sort(), ['/SampleCanvas/LoginButton', '/SampleCanvas/TmpLoginButton', '/UitkDocument/UitkPanel/UitkLoginButton']);
    },
  },
  {
    cmds: ['find'],
    label: 'B //*[@text=UITK Login]/.. → UitkPanel · parent Item → Bag/Slot',
    run: async (g) => {
      same('..', (await g.find('//*[@text=UITK Login]/..'))?.path, '/UitkDocument/UitkPanel');
      const p = (await g.parent('Item'))?.path ?? '';
      if (!/^\/SampleCanvas\/Bag\/Slot\[\d\]$/.test(p)) throw new Error(`Item 의 부모 ${JSON.stringify(p)} — /SampleCanvas/Bag/Slot[n] 이어야 합니다`);
    },
  },
  {
    cmds: ['find', 'find-at'],
    label: 'B find 의 x,y 로 find-at → 같은 것 · camera SideCamera 는 다른 x',
    run: async (g) => {
      for (const name of ['LoginButton', 'UitkLoginButton', 'WorldCube']) {
        const f = (await g.find(name))!;
        const at = (await g.findAt(f.x!, f.y!))?.path ?? '';
        // 버튼 속 글자가 맞을 수 있다 — 그 버튼이거나 그 아래면 된다.
        if (at !== f.path && !at.startsWith(`${f.path}/`)) throw new Error(`${name} (${f.x}, ${f.y}) 의 find-at ${JSON.stringify(at)} — ${f.path} 이어야 합니다`);
      }
      const main = (await g.find('WorldCube'))!;
      const side = (await g.find('WorldCube', { camera: 'SideCamera' }))!;
      if (side.x === main.x) throw new Error(`SideCamera 로 본 x(${side.x})가 Camera.main 과 같습니다`);
      same('SideCamera find-at', (await g.findAt(side.x!, side.y!, { camera: 'SideCamera' }))?.path, '/WorldCube');
    },
  },
  {
    cmds: ['find', 'get'],
    label: 'B HiddenText 는 찾기에 없고 inactive 로는 active:false · get',
    run: async (g) => {
      same('켜진 것만', await g.find('HiddenText'), null);
      const f = await g.find('HiddenText', { inactive: true });
      same('inactive', [f?.active, f?.text], [false, 'hidden']);
      same('get', await g.get('HiddenText', 'Text.text', { inactive: true }), 'hidden');
    },
  },
  {
    cmds: ['scenes', 'scene-load', 'scene-unload', 'find'],
    label: 'B 영구 id — SecondSaved 는 다시 열어도 id 가 같고 [@id] 로 찾는다',
    run: async (g) => {
      await g.loadScene('Second', { add: true });
      const a = (await g.find('SecondSaved'))?.id;
      const marker = (await g.find('SecondMarker'))?.id;
      same('[@id]', (await g.find(`//*[@id=${a}]`))?.path, '/SecondSaved');
      await g.unloadScene('Second');
      await g.loadScene('Second', { add: true });
      same('다시 연 SecondSaved id', (await g.find('SecondSaved'))?.id, a);
      // 실행 중 만든 SecondMarker 는 instance id 라 바뀐다 — 같은 id 가 우연이 아님을 본다.
      if ((await g.find('SecondMarker'))?.id === marker) throw new Error(`SecondMarker id(${marker})가 다시 열어도 같습니다 — 영구 id 가 아닌 instance id 여야 합니다`);
      await g.unloadScene('Second');
    },
  },
  {
    cmds: ['components', 'members'],
    label: 'B components SampleCanvas · members TouchProbe → Output · Say(String, Int32)',
    run: async (g) => {
      const c = await g.components('SampleCanvas');
      same('TouchProbe', c.some((x) => x.name === 'TouchProbe' && x.type === 'Sample.TouchProbe'), true);
      const m = await g.members('SampleCanvas', 'TouchProbe');
      same('Output', m.fields.some((f) => f.name === 'Output' && f.type === 'Text'), true);
      same('Say', m.methods.some((x) => x.name === 'Say' && JSON.stringify(x.args) === '["String","Int32"]' && x.returns === 'String'), true);
    },
  },
  {
    cmds: ['get'],
    label: 'B UI Toolkit get UitkLoginButton text · UitkPanel layout.height · wait-prop',
    run: async (g) => {
      same('text', await g.get('UitkLoginButton', 'text'), 'UITK Login');
      const h = await g.get('UitkPanel', 'layout.height');
      if (!(typeof h === 'number' && h > 0)) throw new Error(`UitkPanel 높이 ${JSON.stringify(h)} — 0 보다 큰 숫자여야 합니다`);
      await g.waitForProp('UitkLoginButton', 'text', 'UITK Login', { timeoutMs: CONFORM.waitMs });
    },
  },
  {
    cmds: ['text-set', 'find', 'get'],
    label: 'B text-set StatusText · TmpStatusText · UitkStatusText · 입력칸은 type 으로',
    run: async (g) => {
      for (const name of ['StatusText', 'TmpStatusText', 'UitkStatusText']) {
        same(name, await g.setText(name, 'text-set ok'), 'text-set ok');
        same(`${name} 글자`, (await g.find(name))?.text, 'text-set ok');
      }
      await g.waitForProp('StatusText', 'Text.text', 'text-set ok', { timeoutMs: CONFORM.waitMs });
      const refused = await g.setText('IdInput', 'x').then(() => '', (e: unknown) => (e instanceof Error ? e.message : String(e)));
      if (!refused.includes('type')) throw new Error(`IdInput text-set — 「type 으로 넣습니다」 실패여야 합니다 (받은 것 ${JSON.stringify(refused)})`);
    },
  },
  {
    cmds: ['screenshot'],
    label: 'B screenshot png → PNG 머리',
    run: async (g) => same('PNG 머리', [...(await g.screenshot('png')).subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  },
  // C — 입력(P2-C). 표준 화면에 InputText(입력 탐침) · HoldBox · PointerText · ScrollList. cmds 의 touch-down 은 SDK 0.6.0 표 — 바뀐 칸을 못 읽는 옛 SDK 는 건너뛴다.
  {
    cmds: ['click', 'find', 'touch-down'],
    label: 'C click LoginButton count 2 → 끝 번호가 2 늚',
    run: async (g) => {
      const n = async () => Number(/ (\d+)$/.exec(await textOf(g, 'StatusText')())?.[1] ?? NaN);
      await g.click('LoginButton');
      const first = await poll('StatusText 끝 번호', n, (v) => Number.isFinite(v));
      await g.click('LoginButton', { count: 2 });
      await poll(`StatusText 끝 번호 — 기대 ${first + 2}`, n, (v) => v === first + 2);
    },
  },
  {
    cmds: ['touch-down', 'touch-up', 'input-reset', 'find'],
    label: 'C 손가락 둘 — touch-down 둘 → fingers 2 · touch-up → fingers 0',
    run: released(async (g) => {
      const a = await g.touchDown('StatusText');
      const b = await g.touchDown('TouchText');
      same('번호가 다름', a !== b, true);
      await shows(g, 'InputText', 'fingers', '2');
      await g.touchUp(a);
      await g.touchUp(b);
      await shows(g, 'InputText', 'fingers', '0');
    }),
  },
  {
    cmds: ['touch-down', 'touch-move', 'touch-up', 'input-reset', 'find'],
    label: 'C touch-down Item · touch-move 다음 칸 · touch-up → Item 이 그 칸',
    run: released(async (g) => {
      const to = slot((await slotOf(g)) + 1);
      const f = await g.touchDown('Item');
      await g.touchMove(f, to);
      await g.touchUp(f);
      same(`${to}/Item 있음`, (await g.find(`${to}/Item`)) !== null, true);
    }),
  },
  {
    cmds: ['drag', 'find', 'touch-down'],
    label: 'C drag Item via 다음 칸 → 그다음 칸 · duration 만큼 걸림',
    run: async (g) => {
      const k = await slotOf(g);
      const t0 = Date.now();
      await g.drag('Item', slot(k + 2), { via: [slot(k + 1)], duration: CONFORM.dragS });
      same('걸린 초가 duration 이상', (Date.now() - t0) / 1000 >= CONFORM.dragS, true);
      same(`${slot(k + 2)}/Item 있음`, (await g.find(`${slot(k + 2)}/Item`)) !== null, true);
    },
  },
  {
    cmds: ['swipe', 'find', 'get'],
    label: 'C swipe ScrollList → 위치가 바뀜',
    run: async (g) => {
      const list = await g.find('ScrollList');
      if (list?.x === undefined || list.y === undefined) throw new Error(`ScrollList 자리: ${JSON.stringify(list)}`);
      const before = await listPos(g)();
      // 위로 밀면 아래 것이 올라와 위치가 준다 — 이미 아래쪽이면 아래로 민다.
      const up = before > 0.5 ? 1 : -1;
      await g.swipe([{ x: list.x, y: list.y - 150 * up }, { x: list.x, y: list.y + 150 * up }], { duration: 0.3 });
      await poll(`ScrollList 위치 — 기대 ${up > 0 ? '줄어듦' : '늚'}(앞 ${before})`, listPos(g), (v) => (up > 0 ? v < before : v > before));
    },
  },
  {
    cmds: ['pointer', 'find'],
    label: 'C pointer HoldBox enter · down · up · exit → PointerText last',
    run: async (g) => {
      for (const e of ['enter', 'down', 'up', 'exit'] as const) {
        await g.pointer('HoldBox', e);
        await shows(g, 'PointerText', 'last', e);
      }
    },
  },
  {
    cmds: ['long-press', 'find', 'touch-down'],
    label: 'C long-press HoldBox → PointerText held 가 duration 이상',
    run: async (g) => {
      await g.longPress('HoldBox', { duration: CONFORM.holdS });
      await poll(`PointerText 의 held — 기대 ${CONFORM.holdS} 이상`, textOf(g, 'PointerText'), (t) => Number(part(t, 'held')) >= CONFORM.holdS - 0.05);
    },
  },
  {
    cmds: ['mouse-move', 'find'],
    label: 'C mouse-move HoldBox → enter · StatusText 로 → exit',
    run: async (g) => {
      await g.mouseMove('HoldBox');
      await shows(g, 'PointerText', 'last', 'enter');
      await g.mouseMove('StatusText');
      await shows(g, 'PointerText', 'last', 'exit');
    },
  },
  {
    cmds: ['scroll', 'get', 'touch-down'],
    label: 'C scroll ScrollList → 위치가 바뀜',
    run: async (g) => {
      const before = await listPos(g)();
      const dy = before > 0.5 ? -10 : 10;
      await g.scroll(dy, { at: 'ScrollList' });
      await poll(`ScrollList 위치 — 기대 ${dy < 0 ? '줄어듦' : '늚'}(앞 ${before})`, listPos(g), (v) => (dy < 0 ? v < before : v > before));
    },
  },
  {
    cmds: ['key-down', 'key-up', 'input-reset', 'find'],
    label: 'C key-down A+LeftShift → keys A LeftShift · key-up → keys -',
    run: released(async (g) => {
      await g.keyDown('A+LeftShift');
      await shows(g, 'InputText', 'keys', 'A LeftShift');
      await g.keyUp('A+LeftShift');
      await shows(g, 'InputText', 'keys', '-');
    }),
  },
  {
    cmds: ['key', 'text-set', 'find', 'touch-down'],
    label: 'C key I duration → duration 만큼 걸림 · TouchText 「key I」',
    run: async (g) => {
      await g.setText('TouchText', '-');
      const t0 = Date.now();
      await g.key('I', { duration: CONFORM.keyS });
      same('걸린 초가 duration 이상', (Date.now() - t0) / 1000 >= CONFORM.keyS, true);
      await poll('TouchText — 기대 「key I」', textOf(g, 'TouchText'), (t) => t === 'key I');
    },
  },
  {
    cmds: ['key-down', 'key-up', 'input-reset', 'find'],
    label: 'C 축 · 조이스틱 — RightArrow+JoystickButton16 → axis 1 · LeftControl+JoystickButton0 → fire 1',
    run: released(async (g) => {
      await g.keyDown('RightArrow+JoystickButton16', { power: 1 });
      await shows(g, 'InputText', 'axis', '1');
      await g.keyDown('LeftControl+JoystickButton0');
      await shows(g, 'InputText', 'fire', '1');
      await g.keyUp('RightArrow+JoystickButton16+LeftControl+JoystickButton0');
      await shows(g, 'InputText', 'axis', '0');
      await shows(g, 'InputText', 'fire', '0');
    }),
  },
  {
    cmds: ['tilt', 'find'],
    label: 'C tilt 0 v 0 → InputText tilt v',
    run: async (g) => {
      // 판마다 다른 값 — 앞 판 값이 남아 있어도 이번 기울기를 본다.
      const v = 20 + (Date.now() % 30);
      await g.tilt([0, v, 0]);
      await shows(g, 'InputText', 'tilt', String(v));
    },
  },
  {
    cmds: ['touch-down', 'key-down', 'input-reset', 'find'],
    label: 'C input-reset — 눌러 둔 손가락 · 키를 거둔다',
    run: released(async (g) => {
      await g.touchDown('StatusText');
      await g.keyDown('W');
      await shows(g, 'InputText', 'fingers', '1');
      await shows(g, 'InputText', 'keys', 'W');
      await g.resetInput();
      await shows(g, 'InputText', 'fingers', '0');
      await shows(g, 'InputText', 'keys', '-');
    }),
  },
  // 장면 줄은 맨 뒤 — 한 장면 열기로 Second 에 갔다 Sample 로 돌아오면 표준 화면이 새로 선다.
  {
    cmds: ['scenes', 'scene-load', 'scene-unload', 'find'],
    label: 'A scene-load Second add → SecondMarker · scene-unload → 사라짐',
    run: async (g) => {
      same('지금 장면', (await g.scenes()).active, 'Sample');
      await g.loadScene('Second', { add: true });
      const s = await g.scenes();
      same('열린 장면', [s.active, s.loaded], ['Sample', ['Sample', 'Second']]);
      same('SecondMarker 있음', (await g.find('SecondMarker')) !== null, true);
      await g.unloadScene('Second');
      same('닫은 뒤', (await g.scenes()).loaded, ['Sample']);
      same('SecondMarker', await g.find('SecondMarker'), null);
    },
  },
  {
    cmds: ['scenes', 'scene-load', 'find'],
    label: 'A scene-load Second → Sample 로 돌아오면 표준 화면을 다시 만든다',
    run: async (g) => {
      await g.loadScene('Second');
      same('열린 장면', (await g.scenes()).loaded, ['Second']);
      same('SampleCanvas', await g.find('SampleCanvas'), null);
      await g.loadScene('Sample');
      await g.waitForScene('Sample');
      same('SampleCanvas 있음', (await g.find('SampleCanvas')) !== null, true);
    },
  },
  {
    cmds: ['scene-load', 'scenes', 'click', 'mouse-move', 'scroll', 'get', 'find', 'input-reset'],
    label: 'C UI Toolkit 직접 — Second(EventSystem 없음)의 SecondButton click · hover · scroll',
    run: async (g) => {
      await g.loadScene('Second');
      try {
        await g.click('SecondButton');
        await poll('SecondText — 기대 「second 1」', textOf(g, 'SecondText'), (t) => t === 'second 1');
        await g.mouseMove('SecondButton');
        await poll('SecondText — 기대 「enter」', textOf(g, 'SecondText'), (t) => t === 'enter');
        await g.scroll(-10, { at: 'SecondScroll' });
        await poll('SecondScroll 의 scrollOffset y — 기대 0 보다 큼', async () => (await g.get('SecondScroll', 'scrollOffset')) as number[], (v) => Array.isArray(v) && v[1] > 0);
      } finally {
        await g.resetInput().catch(() => undefined);
        await g.loadScene('Sample');
        await g.waitForScene('Sample');
      }
    },
  },
  { cmds: ['errors'], label: 'errors 가 비었다', run: async (g) => same('오류', (await g.errors()).errors.map((e) => e.message), []) },
];

export async function conform(game: Game): Promise<ConformResult> {
  const ping = await game.ping();
  const r: ConformResult = { ping, lines: [], passed: 0, failed: 0, skipped: 0 };
  for (const step of STEPS) {
    // caps 는 ping 이 꼴을 보고 game 에 적은 것 — 옛 SDK(caps 없음)는 다 보낸다.
    const missing = step.cmds.filter((c) => game.caps && !game.caps.includes(c));
    if (missing.length) {
      r.skipped++;
      r.lines.push(`- ${step.label} (이 SDK 의 caps 에 ${missing.join(' · ')} 없음)`);
      continue;
    }
    try {
      await step.run(game);
      r.passed++;
      r.lines.push(`✓ ${step.label}`);
    } catch (e) {
      r.failed++;
      r.lines.push(`✗ ${step.label} — ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return r;
}

export function report(r: ConformResult): string {
  const engine = r.ping.engine ? `${r.ping.engine} ${r.ping.engineVersion} · SDK ${r.ping.sdkVersion} · protocol ${r.ping.protocol}` : 'protocol 1(옛 SDK — caps 없음)';
  return [`conform — ${r.ping.app} ${r.ping.version} · ${engine}`, ...r.lines, `통과 ${r.passed} · 실패 ${r.failed} · 건너뜀 ${r.skipped}`].join('\n');
}
