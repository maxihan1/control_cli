// 창 훑기 — 지금 화면의 버튼을 하나씩 눌러 새로 뜬 창을 찍고 닫는다. 결과는 작성 에이전트가 게임 화면 지도로 올린다(GAME-F1-10)
import { createHash } from 'node:crypto';
import { mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { back, type Conn } from './appium.js';
import { SETTLE, settled, type Game, type TreeReply } from './game.js';
import { flatten, line, type Entry } from './snapshot.js';

// 숫자의 정본은 여기다(게임 명세 「창 훑기」 상한 — 작성 30분 예산 안)
export const CRAWL = { maxWindows: 60, minutes: 10 };

// 크롤을 끝내는 버튼(캐릭터 삭제 · 탈퇴 · 로그아웃)은 누르지 않는다 — 웹 「탈퇴 멈춤」과 같다.
const DANGER = /삭제|탈퇴|로그아웃|종료|나가기|delete|remove|log ?out|sign ?out|quit|exit|withdraw/i;
const CLOSE = /^(닫기|취소|뒤로|돌아가기|close|cancel|back|x|×|✕)$|close/i;

export interface CrawlOptions {
  /** 닫기 버튼이 없는 창을 닫을 뒤로 키 — Appium 세션이 없으면(USB 로 붙음) 못 쓴다 */
  back?: { conn: Conn; sessionId: string };
  out: string;
  maxWindows?: number;
  minutes?: number;
  /** /정규식/깃발 또는 이름 · 글자에 든 글자 — 맞으면 안 누른다 */
  exclude: string[];
}

export interface WindowRecord {
  주소: string;
  이름: string;
  /** 같은 창 묶음 — 순번을 뗀 경로. 같은 틀은 한 번만 적는다 */
  틀: string;
  파일: string;
  지문: string;
  글자지문: string;
  연곳: { 창: string; 버튼: string; 글자: string } | null;
}

const sha = (s: string) => createHash('sha1').update(s).digest('hex').slice(0, 16);
const frame = (path: string) => path.replace(/\[\d+\]/g, '');
const parentOf = (path: string) => path.slice(0, path.lastIndexOf('/'));
const under = (path: string, root: string) => path === root || path.startsWith(root + '/');
const label = (e: Entry, all: Entry[]) => e.node.text ?? all.find((d) => d.path.startsWith(e.path + '/') && d.node.text)?.node.text ?? '';

function rule(x: string): (s: string) => boolean {
  const m = /^\/(.+)\/([a-z]*)$/.exec(x);
  if (m) {
    const re = new RegExp(m[1], m[2]);
    return (s) => re.test(s);
  }
  return (s) => s.includes(x);
}

export async function crawl(game: Game, o: CrawlOptions): Promise<string> {
  const maxWindows = o.maxWindows ?? CRAWL.maxWindows;
  const minutes = o.minutes ?? CRAWL.minutes;
  if (!Number.isInteger(maxWindows) || maxWindows < 1) throw new Error('--max 는 1 이상 정수입니다');
  if (!(minutes > 0)) throw new Error('--minutes 는 0 보다 큽니다');
  const excluded = o.exclude.map(rule);
  const started = Date.now();
  const deadline = started + minutes * 60_000;

  // 지난 결과(번호 파일 · json)만 지운다 — 폴더 안 다른 파일은 둔다.
  await mkdir(o.out, { recursive: true });
  for (const f of await readdir(o.out)) if (/^\d{3}\.yml$/.test(f) || f === 'list.json' || f === 'summary.json') await rm(join(o.out, f));

  const records: WindowRecord[] = [];
  const frames = new Set<string>();
  let pressed = 0;
  let stop = '';

  const record = async (key: string, title: string, entries: Entry[], from: WindowRecord['연곳']) => {
    const root = entries[0];
    const depth = root?.depth ?? 0;
    const body = entries.filter((e) => e.shown).map((e) => `${'  '.repeat(Math.max(0, e.depth - depth))}- ${line(e.node)}`);
    const rel = (e: Entry) => frame(e.path.slice(root.path.length));
    const r: WindowRecord = {
      주소: key,
      이름: title,
      틀: frame(key),
      파일: `${String(records.length + 1).padStart(3, '0')}.yml`,
      지문: sha([...new Set(entries.map((e) => `${rel(e)} ${e.node.kind ?? ''}`))].sort().join('\n')),
      글자지문: sha(entries.flatMap((e) => (e.node.text ? [e.node.text] : [])).join('\n')),
      연곳: from,
    };
    const head = [`# ${key}`, ...(from ? [`# 연 곳: ${from.창} 의 ${from.버튼}${from.글자 ? ` 「${from.글자}」` : ''}`] : [])];
    await writeFile(join(o.out, r.파일), [...head, ...body].join('\n') + '\n');
    records.push(r);
    frames.add(r.틀);
    return r;
  };

  const buttons = (all: Entry[], scope: string | null) =>
    all.filter((e) => {
      if (!e.node.kind || e.node.interactable === false) return false;
      if (scope !== null && !under(e.path, scope)) return false;
      // 같은 창의 목록 줄 · 슬롯은 대표 하나(순번 0)만 누른다.
      if (/\[[1-9]\d*\]/.test(e.path)) return false;
      const words = [e.node.name, label(e, all)];
      if (words.some((w) => CLOSE.test(w) || DANGER.test(w) || excluded.some((x) => x(w)))) return false;
      return true;
    });

  // 새로 뜬 창 — 앞 화면에 없던 경로 중 맨 위(부모는 있던 것)
  const opened = (before: Set<string>, after: Entry[]) => after.filter((e) => !before.has(e.path) && (parentOf(e.path) === '' || before.has(parentOf(e.path))));

  // 새 창이 닫히고 사라졌던 것이 돌아오면 되돌린 것이다. 닫기 버튼 → 저절로 사라지기(알림) → 뒤로 키 차례로 해 본다.
  const restore = async (popups: Entry[], lost: string[]): Promise<boolean> => {
    const ok = (t: TreeReply) => {
      const paths = new Set(flatten(t.tree).map((e) => e.path));
      return popups.every((p) => !paths.has(p.path)) && lost.every((p) => paths.has(p));
    };
    const now = await game.tree();
    if (ok(now)) return true;
    const all = flatten(now.tree);
    const closer = all.find((e) => e.node.kind && popups.some((p) => under(e.path, p.path)) && [e.node.name, label(e, all)].some((w) => CLOSE.test(w)));
    if (closer) {
      await game.click(closer.path);
      if (ok(await settled(game))) return true;
    } else {
      await new Promise((done) => setTimeout(done, SETTLE.maxMs));
      if (ok(await game.tree())) return true;
    }
    if (!o.back) return false;
    await back(o.back.conn, o.back.sessionId);
    return ok(await settled(game));
  };

  const explore = async (scope: string | null, from: string, inside: boolean): Promise<void> => {
    const start = flatten((await game.tree()).tree);
    for (const b of buttons(start, scope)) {
      if (records.length >= maxWindows) stop ||= `창 상한 ${maxWindows}개`;
      if (Date.now() >= deadline) stop ||= `시간 상한 ${minutes}분`;
      if (stop) return;
      const beforeEntries = flatten((await game.tree()).tree);
      const before = new Set(beforeEntries.map((e) => e.path));
      // 앞 버튼이 화면을 바꿨으면 이 버튼은 이제 없다.
      if (!before.has(b.path)) continue;
      await game.click(b.path);
      pressed++;
      const after = flatten((await settled(game)).tree);
      // 창 안에서 바뀐 부분(탭 내용)은 창의 일부라 닫지 않는다 — 창 밖에 새로 뜬 것만 닫는다.
      const roots = opened(before, after);
      if (roots.length === 0) continue;
      const popups = scope === null ? roots : roots.filter((r) => !under(r.path, scope));
      // 화면이 통째로 바뀌었으면(앞 창이 사라짐) 되돌린 뒤 돌아와야 할 것들
      const now = new Set(after.map((e) => e.path));
      const lost = beforeEntries.filter((e) => !now.has(e.path) && (parentOf(e.path) === '' || now.has(parentOf(e.path))) && (scope === null || !under(e.path, scope))).map((e) => e.path);
      const via = { 창: from, 버튼: b.address, 글자: label(b, beforeEntries) };
      for (const r of roots) {
        if (frames.has(frame(r.path)) || records.length >= maxWindows) continue;
        const sub = after.filter((e) => under(e.path, r.path));
        const title = sub.find((e) => /title|제목/i.test(e.node.name) && e.node.text)?.node.text ?? r.node.name;
        const rec = await record(r.path, title, sub, via);
        if (!inside && popups.includes(r)) await explore(r.path, rec.주소, true);
      }
      if ((popups.length > 0 || lost.length > 0) && !(await restore(popups, lost))) {
        stop = `${from} 의 ${b.address} 뒤 화면을 되돌리지 못함`;
        return;
      }
    }
  };

  const first = await settled(game);
  const all = flatten(first.tree);
  await record(`scene:${first.scene}`, first.scene, all, null);
  await explore(null, `scene:${first.scene}`, false);
  stop ||= '끝까지 훑음';

  const seconds = Math.round((Date.now() - started) / 1000);
  await writeFile(join(o.out, 'list.json'), JSON.stringify(records, null, 2));
  await writeFile(join(o.out, 'summary.json'), JSON.stringify({ 멈춘까닭: stop, 창: records.length, 누름: pressed, 초: seconds }, null, 2));
  return [`- 창 ${records.length}개 · 누른 버튼 ${pressed}개 · ${seconds}초`, `- 멈춘 까닭: ${stop}`, `- 목록: ${join(o.out, 'list.json')}`].join('\n');
}
