// 표준 화면에 정해진 차례로 명령을 보내 기대값과 견준다 — 엔진마다 같은 표준 화면이면 같은 결과가 나와야 한다(docs/roadmap/plan.md 「적합성 검사」)
import { WAIT, type Game, type PingReply } from './game.js';

// 테스트가 줄일 수 있게 묶어 둔다 — 실기기에서 누른 뒤 글자가 바뀌기까지 1초 안팎이다.
export const CONFORM = { waitMs: 5000 };

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
