// control-cli inspect — 로컬 웹 화면 인스펙터(트리 · 스크린샷 · 상세 · 누르면 명령)와 Recorder 를 띄우는 HTTP 서버
import { randomBytes } from 'node:crypto';
import { createServer, type IncomingMessage, type Server } from 'node:http';

import type { Game } from './game.js';
import { exportTest, FILES, replay, steps, typeStep, type Lang, type Step } from './recorder.js';
import { flatten } from './snapshot.js';

export const INSPECT_PORT = 13110;
const MAX_BODY = 1 << 20;

async function body(req: IncomingMessage): Promise<Record<string, unknown>> {
  let text = '';
  for await (const chunk of req) {
    text += chunk;
    if (text.length > MAX_BODY) throw new Error('요청이 너무 큽니다');
  }
  const v: unknown = text ? JSON.parse(text) : {};
  if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new Error('요청은 JSON 객체입니다');
  return v as Record<string, unknown>;
}

const str = (v: unknown, what: string) => {
  if (typeof v !== 'string' || v === '') throw new Error(`${what} 이 필요합니다`);
  return v;
};

/**
 * 인스펙터 서버 — 127.0.0.1 만 듣고, 모든 요청에 띄울 때 만든 토큰이 있어야 한다(X-Inspect 머리 · 스크린샷은 ?t=).
 * 다른 사이트가 브라우저로 localhost 에 명령을 쏘는 길(CSRF · DNS rebinding)을 막는다 — 사이트는 토큰을 모른다
 */
export async function inspect(game: Game, o: { port?: number; title: string; env?: Record<string, string | undefined> }): Promise<{ url: string; server: Server }> {
  const token = randomBytes(16).toString('hex');
  const routes: Record<string, (b: Record<string, unknown>) => Promise<unknown>> = {
    '/tree': async () => {
      const t = await game.tree();
      const entries = flatten(t.tree).map((e) => ({ path: e.path, address: e.address, name: e.node.name, kind: e.node.kind, text: e.node.text, interactable: e.node.interactable, depth: e.path.split('/').length - 2 }));
      return { scene: t.scene, screen: t.screen, entries };
    },
    // 살펴보기(find-at · components · members · get)와 고른 명령 — 게임 답 그대로
    '/call': (b) => game.call({ ...b, cmd: str(b.cmd, 'cmd') }),
    // 동작 — 하고 나서 적을 단계를 돌려준다
    '/do': async (b): Promise<Step> => {
      if (b.do === 'click') {
        const target = str(b.target, 'target');
        await game.click(target);
        return { do: 'click', target };
      }
      if (b.do === 'key') {
        const key = str(b.key, 'key');
        await game.key(key);
        return { do: 'key', key };
      }
      if (b.do === 'type') return typeStep(game, str(b.target, 'target'), typeof b.text === 'string' ? b.text : '');
      throw new Error('do 는 click · type · key 중 하나입니다');
    },
    // 확인 — 지금 글자 · 칸 값을 기대값으로
    '/check': async (b): Promise<Step> => {
      const target = str(b.target, 'target');
      if (b.check === 'text') return { check: 'text', target, contains: await game.text(target) };
      const prop = str(b.prop, 'prop');
      return { check: 'prop', target, prop, equals: await game.get(target, prop) };
    },
    '/replay': (b) => replay(game, steps(b.steps), o.env),
    '/export': async (b) => {
      const lang = str(b.lang, 'lang') as Lang;
      return { file: FILES[lang], code: exportTest(steps(b.steps), lang) };
    },
  };

  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://x');
    const send = (status: number, type: string, data: string | Buffer) => {
      res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
      res.end(data);
    };
    try {
      if (req.method === 'GET' && url.pathname === '/') return send(200, 'text/html; charset=utf-8', page(o.title));
      const given = url.pathname === '/shot' ? url.searchParams.get('t') : req.headers['x-inspect'];
      if (given !== token) return send(403, 'application/json', JSON.stringify({ error: '토큰이 맞지 않습니다 — inspect 가 찍은 주소로 엽니다' }));
      if (req.method === 'GET' && url.pathname === '/shot') return send(200, 'image/jpeg', await game.screenshot());
      const route = req.method === 'POST' ? routes[url.pathname] : undefined;
      if (!route) return send(404, 'application/json', JSON.stringify({ error: '없는 길입니다' }));
      send(200, 'application/json', JSON.stringify(await route(await body(req))));
    } catch (e) {
      send(500, 'application/json', JSON.stringify({ error: e instanceof Error ? e.message : String(e) }));
    }
  });
  await new Promise<void>((ok, no) => {
    server.once('error', no);
    server.listen(o.port ?? INSPECT_PORT, '127.0.0.1', ok);
  });
  const port = (server.address() as { port: number }).port;
  return { url: `http://127.0.0.1:${port}/?t=${token}`, server };
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

// 화면 한 장 — 설치 없이 브라우저만. 브라우저 dialog(alert · prompt)는 쓰지 않는다.
function page(title: string): string {
  return `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>control-cli inspect</title>
<style>
:root{--bg:#fff;--fg:#1d1d1f;--mute:#6e6e73;--line:#d2d2d7;--pick:#e8f0fe;--accent:#0a66d8;--bad:#c62828;--good:#1b7f3b;color-scheme:light dark}
@media (prefers-color-scheme:dark){:root{--bg:#161618;--fg:#f2f2f7;--mute:#a1a1a6;--line:#3a3a3c;--pick:#1f3354;--accent:#5aa2ff;--bad:#ff6b6b;--good:#4cd07d}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:13px/1.45 -apple-system,system-ui,sans-serif}
header{display:flex;gap:12px;align-items:center;padding:8px 16px;border-bottom:1px solid var(--line)}header b{font-size:14px}header span{color:var(--mute)}
main{display:grid;grid-template-columns:minmax(220px,1fr) minmax(260px,1.3fr) minmax(260px,1fr);gap:12px;padding:12px 16px}
@media (max-width:900px){main{grid-template-columns:1fr}}
section{border:1px solid var(--line);border-radius:8px;padding:8px;min-width:0}h2{font-size:12px;margin:0 0 6px;color:var(--mute);font-weight:600}
#tree{max-height:70vh;overflow:auto;font-family:ui-monospace,monospace;font-size:12px}#tree div{cursor:pointer;white-space:nowrap;border-radius:4px;padding:0 4px}#tree div.on{background:var(--pick)}#tree i{color:var(--mute);font-style:normal}
#shot{width:100%;cursor:crosshair;border-radius:4px;display:block}
button,select,input{font:inherit;color:inherit;background:transparent;border:1px solid var(--line);border-radius:6px;padding:3px 8px}button{cursor:pointer}button:hover{border-color:var(--accent)}
.row{display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin:6px 0}code{font-family:ui-monospace,monospace;font-size:12px;word-break:break-all}
#members{max-height:32vh;overflow:auto}#members div{display:flex;gap:6px;align-items:center;padding:1px 0}#members code{flex:1}
#steps{margin:6px 0;padding-left:20px;font-family:ui-monospace,monospace;font-size:12px}#steps li button{padding:0 5px;margin-left:4px}
#out{white-space:pre-wrap;font-family:ui-monospace,monospace;font-size:12px;max-height:40vh;overflow:auto;margin:6px 0 0}.bad{color:var(--bad)}.good{color:var(--good)}
</style></head><body>
<header><b>control-cli inspect</b><span>${esc(title)}</span><span id="scene"></span><button id="refresh">새로고침</button><span id="msg"></span></header>
<main>
<section><h2>트리</h2><div id="tree"></div></section>
<section><h2>스크린샷 — 누르면 그 자리 오브젝트를 고른다</h2><img id="shot" alt="게임 화면">
<div class="row"><input id="key" placeholder="키 (Escape · Space)" size="14"><button id="keyBtn">키 누르기</button></div></section>
<section><h2>고른 것</h2><div id="picked"><code>—</code></div>
<div class="row"><button id="click">누르기</button><input id="text" placeholder="넣을 글자" size="12"><button id="type">글자 넣기</button><button id="checkText">글자 확인</button></div>
<div id="comps" class="row"></div><div id="members"></div>
<h2 style="margin-top:12px">Recorder</h2>
<div class="row"><label><input type="checkbox" id="rec" checked> 기록</label><button id="replay">돌리기</button><button id="save">저장(JSON)</button><button id="clear">지우기</button></div>
<ol id="steps"></ol>
<div class="row"><select id="lang"><option value="ts">TypeScript</option><option value="py">Python</option><option value="cs">C#</option><option value="java">Java</option><option value="robot">Robot</option></select><button id="export">내보내기</button><button id="download">내려받기</button></div>
<pre id="out"></pre></section>
</main>
<script>
const T = new URLSearchParams(location.search).get('t');
const $ = (id) => document.getElementById(id);
let tree = null, picked = null, recorded = [];
try { recorded = JSON.parse(sessionStorage.getItem('steps') || '[]'); } catch {}
const api = async (path, body = {}) => {
  const r = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Inspect': T }, body: JSON.stringify(body) });
  const v = await r.json();
  if (!r.ok) throw new Error(v.error);
  return v;
};
const say = (text, cls = '') => { $('msg').textContent = text; $('msg').className = cls; };
const guard = (fn) => async (...a) => { try { await fn(...a); } catch (e) { say(e.message, 'bad'); } };
const show = (s) => s.do ? s.do + ' ' + (s.target ?? s.key) + (s.do === 'type' ? ' ← ' + (s.secret ? '$' + s.secret : JSON.stringify(s.text)) : '')
  : s.check === 'text' ? '확인 ' + s.target + ' 글자에 ' + JSON.stringify(s.contains) : '확인 ' + s.target + ' ' + s.prop + ' = ' + JSON.stringify(s.equals);
function drawSteps() {
  try { sessionStorage.setItem('steps', JSON.stringify(recorded)); } catch {}
  $('steps').replaceChildren(...recorded.map((s, i) => {
    const li = document.createElement('li');
    li.textContent = show(s);
    const del = document.createElement('button');
    del.textContent = '빼기';
    del.onclick = () => { recorded.splice(i, 1); drawSteps(); };
    li.append(del);
    return li;
  }));
}
const record = (s) => { if ($('rec').checked) { recorded.push(s); drawSteps(); } };
const refresh = guard(async () => {
  tree = await api('/tree');
  $('scene').textContent = '장면 ' + tree.scene + ' · ' + tree.screen.join('×');
  $('tree').replaceChildren(...tree.entries.map((e) => {
    const d = document.createElement('div');
    d.style.paddingLeft = (e.depth * 12 + 4) + 'px';
    d.textContent = e.name;
    const extra = [e.kind, e.text !== undefined ? JSON.stringify(e.text) : '', e.interactable === false ? '잠김' : ''].filter(Boolean).join(' ');
    if (extra) { const i = document.createElement('i'); i.textContent = ' ' + extra; d.append(i); }
    d.className = picked && picked.path === e.path ? 'on' : '';
    d.onclick = () => pick(e);
    return d;
  }));
  $('shot').src = '/shot?t=' + T + '&n=' + Date.now();
});
const pick = guard(async (e) => {
  picked = e;
  [...$('tree').children].forEach((d, i) => (d.className = tree.entries[i].path === e.path ? 'on' : ''));
  $('picked').innerHTML = '';
  const c = document.createElement('code');
  c.textContent = e.address + (e.address !== e.path ? '  (' + e.path + ')' : '');
  $('picked').append(c);
  $('members').replaceChildren();
  const r = await api('/call', { cmd: 'components', target: e.address });
  $('comps').replaceChildren(...r.components.map((k) => {
    const b = document.createElement('button');
    b.textContent = k.name;
    b.onclick = guard(() => members(k.name));
    return b;
  }));
});
async function members(comp) {
  const m = await api('/call', { cmd: 'members', target: picked.address, component: comp });
  const rows = [...m.fields, ...m.properties].filter((x) => !x.static).map((x) => {
    const d = document.createElement('div');
    const c = document.createElement('code');
    const prop = comp + '.' + x.name;
    c.textContent = prop + ' : ' + x.type + (x.value !== undefined ? ' = ' + JSON.stringify(x.value) : '');
    const read = document.createElement('button');
    read.textContent = '읽기';
    read.onclick = guard(async () => { const v = await api('/call', { cmd: 'get', target: picked.address, prop }); c.textContent = prop + ' = ' + JSON.stringify(v.value); });
    const check = document.createElement('button');
    check.textContent = '값 확인';
    check.onclick = guard(async () => record(await api('/check', { check: 'prop', target: picked.address, prop })));
    d.append(c, read, check);
    return d;
  });
  const meth = m.methods.map((x) => { const d = document.createElement('div'); const c = document.createElement('code'); c.textContent = x.name + '(' + x.args.join(', ') + ') → ' + x.returns; d.append(c); return d; });
  $('members').replaceChildren(...rows, ...meth);
}
const act = (fn) => guard(async () => { const s = await fn(); record(s); say(show(s), 'good'); await refresh(); });
const need = () => { if (!picked) throw new Error('트리나 스크린샷에서 먼저 고릅니다'); return picked.address; };
$('click').onclick = act(() => api('/do', { do: 'click', target: need() }));
$('type').onclick = act(() => api('/do', { do: 'type', target: need(), text: $('text').value }));
$('keyBtn').onclick = act(() => api('/do', { do: 'key', key: $('key').value }));
$('checkText').onclick = guard(async () => { const s = await api('/check', { check: 'text', target: need() }); record(s); say(show(s), 'good'); });
$('shot').onclick = guard(async (ev) => {
  const img = ev.currentTarget, [w, h] = tree.screen;
  const x = Math.round(ev.offsetX / img.clientWidth * w), y = Math.round((1 - ev.offsetY / img.clientHeight) * h);
  const r = await api('/call', { cmd: 'find-at', x, y });
  if (!r.found) return say('(' + x + ', ' + y + ') 에 맞는 것이 없습니다');
  const e = tree.entries.find((t) => t.path === r.path) ?? { path: r.path, address: r.path, name: r.path.split('/').pop(), depth: 0 };
  await pick(e);
  say('(' + x + ', ' + y + ') → ' + e.address);
});
$('refresh').onclick = refresh;
$('clear').onclick = () => { recorded = []; drawSteps(); $('out').textContent = ''; };
$('replay').onclick = guard(async () => {
  say('돌리는 중…');
  const r = await api('/replay', { steps: recorded });
  $('out').textContent = r.lines.join('\\n');
  $('out').className = r.ok ? 'good' : 'bad';
  say(r.ok ? '통과' : '실패', r.ok ? 'good' : 'bad');
  await refresh();
});
let exported = null;
$('export').onclick = guard(async () => { exported = await api('/export', { steps: recorded, lang: $('lang').value }); $('out').textContent = exported.code; $('out').className = ''; });
const download = (name, text) => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text])); a.download = name; a.click(); URL.revokeObjectURL(a.href); };
$('download').onclick = guard(async () => { exported = await api('/export', { steps: recorded, lang: $('lang').value }); download(exported.file, exported.code); });
$('save').onclick = () => download('recorded.json', JSON.stringify({ steps: recorded }, null, 2) + '\\n');
drawSteps();
refresh();
</script></body></html>`;
}
