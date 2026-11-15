// 앱 상태와 동작의 단일 출처. 패턴 문자열이 원본이고, 블록(트리)은 항상 문자열에서 다시 파싱한다.
// 컴포넌트는 S(상태)·V(파생 값)·R(실행 결과)를 읽고, 여기서 내보낸 함수로만 상태를 바꾼다.
import { RX } from './rx.js';
import { Engine } from './engine.js';
import { BUILTIN_PRESETS } from './presets.js';
import { Store, Pref, debounce, uid, hashStr } from './store.js';

export { RX, BUILTIN_PRESETS, Pref, Engine };

export type Path = number[];
export type Dialect = 'js' | 'py';

export const FLAG_DEFS: Record<Dialect, [string, string, string][]> = {
  js: [['g', '전체', '모든 일치 찾기'], ['i', '대소문자', '대소문자 무시'], ['m', '여러 줄', '^ $ 가 줄마다 적용'], ['s', '점=줄바꿈', '. 이 줄바꿈도 포함'], ['u', '유니코드', '유니코드 모드']],
  py: [['g', '전체', '모든 일치 찾기'], ['i', '대소문자', 're.I'], ['m', '여러 줄', 're.M'], ['s', '점=줄바꿈', 're.S'], ['x', '주석·공백', 're.X'], ['a', 'ASCII', 're.A']],
};
export const QUANTIFIABLE = ['lit', 'esc', 'cls', 'dot', 'grp', 'ref'];

const newSample = (n = 1) => ({ id: uid(), name: '예시 ' + n, text: '' });

export const S = $state({
  engine: 'js' as Dialect,
  presetId: 'new',
  pattern: '',
  flags: 'g',
  repl: '',
  useRepl: false,
  samples: [newSample()] as { id: string; name: string; text: string }[],
  sampleIdx: 0,
  must: '',
  mustnot: '',
  testMode: 'search' as 'search' | 'full',
  dirty: false,
  userPresets: [] as any[],
  history: [] as any[],
  /** 블록 도구(블록 작업대 + 팔레트) 펼침. 접혀 있어도 패턴 입력창은 항상 편집할 수 있다 */
  toolsOpen: true,
  lang: Pref.get('lang', 'js') as 'js' | 'py' | 'grep',
  palTab: 'chars',
  selPath: null as Path | null,
  selCount: 1,
  multi: false,
  anchor: null as number | null,
  /** 패턴 입력창의 커서 위치(팔레트 삽입 위치) */
  caret: 0,
  /** 입력창 선택 영역을 바꿔 달라는 요청. PatternCard 가 n 의 변화를 보고 적용한다 */
  selReq: { a: 0, b: 0, n: 0 },
  /** 블록에 포인터를 올렸을 때 패턴 입력창에서 강조할 범위 */
  hover: null as { a: number; b: number } | null,
  /** 패턴 입력창에 포커스가 있는가(커서 위치의 블록을 표시할지) */
  edFocus: false,
  canUndo: false,
  canRedo: false,
  open: { repl: false, tests: false },
  pyState: 'idle' as 'idle' | 'loading' | 'ready' | 'failed',
  pyError: '',
  sheet: null as { kind: string; props: any } | null,
  toasts: [] as { id: number; msg: string }[],
  settings: {
    anim: Pref.get('anim', true) as boolean,
    theme: Pref.get('theme', 'system') as 'system' | 'light' | 'dark',
    kbAlways: Pref.get('kbAlways', false) as boolean,
  },
  histQuery: '',
});

/** 실행 결과. 일치가 수천 개일 수 있어 깊은 반응성을 쓰지 않는다(통째로 교체한다) */
class Results {
  /** { res: { matches, ng, names, error?, replaced?, replError? }, text, approx, notes, empty? } */
  last = $state.raw<any>(null);
  /** { state: 'idle'|'nopattern'|'error'|'done', error?, must: {line, ok}[], mustnot: {line, ok}[], pass, total } */
  tests = $state.raw<any>({ state: 'idle', must: [], mustnot: [], pass: 0, total: 0 });
  /** 실행 대기·진행 중 */
  busy = $state(false);
}
export const R = new Results();

// ---------- 파생: 트리 ----------
function keyTree(root: any) {
  const seen: Record<string, number> = {};
  (function rec(list: any[]) {
    for (const n of list) {
      const fk = (n.t === 'grp' ? n.open : n.raw) + '\u0001' + n.q;
      seen[fk] = (seen[fk] || 0) + 1;
      n.key = fk + '#' + seen[fk];
      if (n.t === 'grp') rec(n.children);
    }
  })(root.children);
}
const parsed = $derived.by(() => {
  const root = RX.parse(S.pattern, S.engine);
  RX.serialize(root);
  const gInfo = RX.numberGroups(root);
  keyTree(root);
  return { root, gInfo };
});
/** 파생 값: tree(각 노드에 start·end·key 가 있다), gInfo({ count, names }) */
export const V = {
  get tree(): any { return parsed.root; },
  get gInfo(): { count: number; names: Record<number, string> } { return parsed.gInfo as any; },
  get error(): string { return (R.last && R.last.res && R.last.res.error) || ''; },
  get matches(): any[] { return (R.last && !R.last.res.error && R.last.res.matches) || []; },
};

/** 패턴 입력창. PatternCard 가 등록한다 */
export const ed = { el: null as HTMLTextAreaElement | null, repl: null as HTMLInputElement | null };

// ---------- 유틸 ----------
let toastSeq = 0;
export function toast(msg: string) {
  const id = ++toastSeq;
  S.toasts = S.toasts.slice(-2).concat({ id, msg });
  setTimeout(() => { S.toasts = S.toasts.filter((t) => t.id !== id); }, 2400);
}
Store.onFail = () => toast('저장 공간이 가득 찼거나 사용할 수 없어 저장하지 못했습니다. 내역·백업에서 JSON을 복사해 보관해 주세요');

export async function copyText(text: string, okMsg?: string) {
  try { await navigator.clipboard.writeText(text); toast(okMsg || '복사했습니다'); return true; }
  catch (e) {
    const ta = document.createElement('textarea');
    ta.style.cssText = 'position:fixed;left:-9999px;top:0'; ta.readOnly = true; ta.value = text;
    document.body.append(ta); ta.select(); ta.setSelectionRange(0, text.length);
    let ok = false; try { ok = document.execCommand('copy'); } catch (x) {}
    ta.remove(); toast(ok ? (okMsg || '복사했습니다') : '복사하지 못했습니다. 직접 선택해서 복사해 주세요');
    return ok;
  }
}

export function allPresets() { return S.userPresets.concat(BUILTIN_PRESETS); }
export function findPreset(id: string) { return allPresets().find((p) => p.id === id) || null; }
export function isUserPreset(id: string) { return S.userPresets.some((p) => p.id === id); }
export function curSample() { return S.samples[S.sampleIdx] || S.samples[0]; }
export function cleanFlags(f: string, engine: Dialect) {
  const ok = FLAG_DEFS[engine].map((x) => x[0]);
  return Array.from(new Set(f.split(''))).filter((c) => ok.includes(c)).join('');
}
export function markDirty() { if (!S.dirty) S.dirty = true; }

// ---------- 시트(모달) ----------
/** kind: 'node' | 'lit' | 'save' | 'guard' | 'del' | 'menu' | 'pal' */
export function openSheet(kind: string, props: any = {}) { S.sheet = { kind, props }; }
export function closeSheet() { S.sheet = null; }

// ---------- 설정 ----------
export function applySettings() {
  const h = document.documentElement;
  if (S.settings.anim) delete h.dataset.anim; else h.dataset.anim = 'off';
  if (S.settings.theme === 'system') delete h.dataset.theme; else h.dataset.theme = S.settings.theme;
}
export function setSetting<K extends keyof typeof S.settings>(k: K, v: (typeof S.settings)[K]) {
  S.settings[k] = v; Pref.set(k, v); applySettings();
}

// ---------- 패턴 편집 ----------
let undo: string[] = [], redo: string[] = [], lastUndoPush = 0;
const syncUndo = () => { S.canUndo = undo.length > 0; S.canRedo = redo.length > 0; };
export function validPath(p: Path | null) { if (!p || !p.length) return false; try { return !!RX.getNode(V.tree, p); } catch (e) { return false; } }
function requestSel(a: number, b: number) { S.selReq = { a, b, n: S.selReq.n + 1 }; }

/**
 * 모든 패턴 변경은 여기를 지난다.
 * o.sel: 새 선택 경로(null 이면 해제) · o.selCount · o.caret: 커서 위치 · o.coalesce: 연속 타이핑을 한 번의 되돌리기로 묶음
 * o.fromInput: 입력창에서 온 변경(선택 영역을 다시 쓰지 않는다) · o.user: false 면 '수정됨' 표시를 하지 않는다
 */
export function applyPattern(str: string, o: any = {}) {
  if (str !== S.pattern) {
    const now = Date.now();
    if (!(o.coalesce && now - lastUndoPush < 700)) { undo.push(S.pattern); if (undo.length > 100) undo.shift(); }
    lastUndoPush = now; redo = [];
  }
  S.pattern = str;
  const tree = V.tree;
  if (o.sel !== undefined) { S.selPath = o.sel; S.selCount = o.selCount || 1; }
  if (!validPath(S.selPath)) { S.selPath = null; S.selCount = 1; }
  else { const room = RX.listAt(tree, S.selPath).length - S.selPath![S.selPath!.length - 1]; S.selCount = Math.max(1, Math.min(S.selCount || 1, room)); }
  if (o.caret != null) { S.caret = o.caret; if (!o.fromInput) requestSel(o.caret, o.caret); }
  else if (S.selPath) S.caret = RX.getNode(tree, S.selPath).end;
  else S.caret = Math.min(S.caret, str.length);
  if (o.user !== false) markDirty();
  syncUndo(); scheduleRun(); persistState();
}
export function doUndo() {
  if (!undo.length) return;
  const prev = undo.pop()!, cur = S.pattern, keepUndo = undo.slice(), keepRedo = redo.concat(cur);
  applyPattern(prev, { sel: null });
  undo = keepUndo; redo = keepRedo; syncUndo();
}
export function doRedo() {
  if (!redo.length) return;
  const nxt = redo.pop()!, keepRedo = redo.slice(), keepUndo = undo.concat(S.pattern);
  applyPattern(nxt, { sel: null });
  undo = keepUndo; redo = keepRedo; syncUndo();
}
function resetUndo() { undo = []; redo = []; syncUndo(); }

// ---------- 블록 선택 ----------
export function nodeCode(n: any) { return n.t === 'grp' ? n.open : n.raw; }
export function selN() { return S.selPath ? (S.selCount || 1) : 0; }
export function sameParent(a: Path | null, b: Path | null) { if (!a || !b || a.length !== b.length) return false; for (let i = 0; i < a.length - 1; i++) if (a[i] !== b[i]) return false; return true; }
export function inSel(path: Path) {
  const sp = S.selPath; if (!sp || !sameParent(path, sp)) return false;
  const i = path[path.length - 1], s0 = sp[sp.length - 1];
  return i >= s0 && i < s0 + selN();
}
export function selNodes(): any[] {
  if (!S.selPath || !validPath(S.selPath)) return [];
  const l = RX.listAt(V.tree, S.selPath), i = S.selPath[S.selPath.length - 1];
  return l.slice(i, i + selN());
}
function syncCaretToSel() {
  const nodes = selNodes(); if (!nodes.length) return;
  S.caret = nodes[nodes.length - 1].end;
  requestSel(nodes[0].start, nodes[nodes.length - 1].end);
}
export function selectPath(path: Path, count = 1) {
  S.selPath = path.slice(); S.selCount = count; S.anchor = path[path.length - 1];
  syncCaretToSel();
}
export function clearSel() { S.selPath = null; S.selCount = 1; S.multi = false; }
/** 블록을 눌렀다. Shift 또는 '범위' 모드면 같은 줄의 anchor 부터 여기까지 선택한다 */
export function tapBlock(path: Path, shift = false) {
  if ((S.multi || shift) && S.selPath && sameParent(path, S.selPath)) {
    const a = S.anchor != null ? S.anchor : S.selPath[S.selPath.length - 1], b = path[path.length - 1];
    const lo = Math.min(a, b), hi = Math.max(a, b);
    S.selPath = path.slice(0, -1).concat(lo); S.selCount = hi - lo + 1;
    syncCaretToSel(); return;
  }
  selectPath(path);
}
export function growSel(d: number) {
  if (!S.selPath) return;
  const i = S.selPath[S.selPath.length - 1], c = selN(), len = RX.listAt(V.tree, S.selPath).length;
  if (d < 0 && i > 0) { S.selPath = S.selPath.slice(0, -1).concat(i - 1); S.selCount = c + 1; S.anchor = i + c - 1; }
  else if (d > 0 && i + c < len) { S.selCount = c + 1; S.anchor = i; }
  else return;
  syncCaretToSel();
}
/** pos(문자열 위치)를 포함하는 가장 안쪽 노드의 경로 */
export function pathAt(pos: number): Path | null {
  let found: Path | null = null;
  (function rec(list: any[], base: Path) {
    list.forEach((n, i) => {
      if (n.start < pos && pos <= n.end) { found = base.concat(i); if (n.t === 'grp' && pos > n.cStart - 1 && pos <= n.cEnd) rec(n.children, base.concat(i)); }
    });
  })(V.tree.children, []);
  return found;
}

// ---------- 트리 편집 ----------
function freshTree() { const t = RX.parse(S.pattern, S.engine); RX.serialize(t); return t; }
/** fn(t, p, count) -> 새 경로(undefined 면 그대로, null 이면 선택 해제) */
export function editRange(fn: (t: any, p: Path, c: number) => any, newPath?: Path | null, newCount?: number) {
  if (!S.selPath) return;
  const t = freshTree(), p = S.selPath.slice(), c = selN();
  const np = fn(t, p, c);
  const s = RX.serialize(t);
  const sel = newPath !== undefined ? newPath : (np === undefined ? p : np);
  applyPattern(s, { sel, selCount: sel ? (newCount || (np === undefined && newPath === undefined ? c : 1)) : 1 });
  if (sel) syncCaretToSel();
}
export function editTree(fn: (t: any, p: Path) => any, newPath?: Path | null) { editRange((t, p) => fn(t, p), newPath, 1); }
/** 선택한 노드 하나를 고친다. fn(node, tree, path) */
export function setNode(fn: (n: any, t: any, p: Path) => void) { editTree((t, p) => { fn(RX.getNode(t, p), t, p); }); }
export function wrapSel(open: string) { editRange((t, p, c) => RX.wrapRange(t, p, c, open), undefined, 1); S.multi = false; }
export function moveSel(d: number) {
  if (!S.selPath) return;
  editRange((t, p, cc) => (cc > 1 ? RX.moveRangeBy(t, p, cc, d) : RX.moveBy(t, p, d)), undefined, selN());
}
export function duplicateSel() { const c = selN(); editRange((t, p, cc) => RX.duplicateRange(t, p, cc), undefined, c); }
export function unwrapSel() { editTree((t, p) => RX.unwrap(t, p)); }
export function deleteSel() {
  if (!S.selPath) return;
  if (S.sheet && S.sheet.kind === 'node') closeSheet();
  editRange((t, p, c) => { RX.removeRange(t, p, c); return null; }, null);
  S.multi = false;
}

/** 다시 파싱한 뒤 pos 에서 시작하는 노드를 선택한다(글자 블록은 이웃과 합쳐질 수 있어 못 찾으면 해제) */
function selectAtStart(pos: number) {
  const p = RX.findPath(V.tree, (n: any) => n.start === pos && n.end > pos);
  if (p) { S.selPath = p; S.selCount = 1; S.anchor = p[p.length - 1]; S.caret = RX.getNode(V.tree, p).end; }
  return p;
}
const childrenOf = (t: any, pp: Path) => (pp.length === 0 ? t.children : RX.getNode(t, pp).children);

/** 끌어 놓기: from 에서 시작하는 count 개를 (toParent, idx) 자리로 옮긴다. 자기 안으로는 옮길 수 없다 */
export function moveBlocks(from: Path, count: number, toParent: Path, idx: number): boolean {
  const t = freshTree();
  const fi = from[from.length - 1];
  for (let k = 0; k < count; k++) {
    const fp = from.slice(0, -1).concat(fi + k);
    if (RX.isInside(toParent, fp) || RX.samePath(toParent, fp)) return false;
  }
  const src = RX.listAt(t, from), dest = childrenOf(t, toParent);
  const same = src === dest;
  if (same && idx >= fi && idx <= fi + count) return false; // 제자리
  const items = src.splice(fi, count);
  let at = idx; if (same && fi < idx) at -= count;
  dest.splice(at, 0, ...items);
  const s = RX.serialize(t);
  const start = items[0].start;
  applyPattern(s, { sel: null });
  selectAtStart(start);
  return true;
}
/** Ctrl 끌어 놓기: from 에서 시작하는 count 개를 복제해 (toParent, idx) 자리에 넣는다. 원본은 그대로 둔다 */
export function copyBlocks(from: Path, count: number, toParent: Path, idx: number): boolean {
  const t = freshTree();
  const fi = from[from.length - 1];
  const items = RX.listAt(t, from).slice(fi, fi + count);
  if (!items.length) return false;
  const copy = items.map((n: any) => RX.clone(n));
  childrenOf(t, toParent).splice(idx, 0, ...copy);
  const s = RX.serialize(t);
  const start = copy[0].start;
  applyPattern(s, { sel: null });
  const p = selectAtStart(start);
  if (p) { const len = RX.listAt(V.tree, p).length; S.selCount = Math.max(1, Math.min(copy.length, len - p[p.length - 1])); }
  return true;
}
/** 팔레트 항목을 노드로 만든다(끌어 놓기용). 수량 항목은 null */
export function nodesForItem(it: any): any[] | null {
  const k = it.kind || 'text';
  if (k === 'group') return [{ t: 'grp', open: it.open, children: [], closed: true, q: '' }];
  if (k !== 'text') return null;
  return RX.parse(it.ins != null ? it.ins : it.code, S.engine).children;
}
/** 끌어 놓기: 새 노드들을 (toParent, idx) 자리에 넣는다 */
export function insertNodesAt(nodes: any[], toParent: Path, idx: number) {
  const t = freshTree();
  const copy = nodes.map((n) => RX.clone(n));
  childrenOf(t, toParent).splice(idx, 0, ...copy);
  const s = RX.serialize(t);
  const start = copy[0].start;
  applyPattern(s, { sel: null });
  selectAtStart(start);
}
/** 끌어 놓기: 수량 항목을 블록 위에 놓았다 */
export function applyQuantTo(path: Path, it: any): boolean {
  const n = RX.getNode(V.tree, path);
  if (!n || !QUANTIFIABLE.includes(n.t)) { toast('이 블록에는 수량을 붙일 수 없습니다'); return false; }
  S.selPath = path.slice(); S.selCount = 1;
  quantEdit(it);
  return true;
}
function quantEdit(it: any) {
  const k = it.kind;
  editTree((t, p) => {
    const node = RX.getNode(t, p), o = RX.parseQ(node.q);
    if (k === 'quant') node.q = it.q + (o.lazy ? '?' : o.poss ? '+' : '');
    else if (k === 'lazy') { if (!node.q) node.q = '?'; else node.q = RX.buildQ(Object.assign(o, { lazy: !o.lazy, poss: false })); }
    else if (node.q) node.q = RX.buildQ(Object.assign(o, { poss: !o.poss, lazy: false }));
  });
}

// ---------- 팔레트 ----------
export function paletteTabs() {
  const py = S.engine === 'py';
  return [
    { id: 'chars', label: '문자', items: [
      { code: '\\d', desc: '숫자' }, { code: '\\w', desc: '영문·숫자·_' }, { code: '\\s', desc: '공백' }, { code: '.', desc: '아무 문자' },
      { code: '[가-힣]', desc: '한글' }, { code: '[a-zA-Z]', desc: '영문' }, { code: '[0-9]', desc: '숫자 범위' }, { code: '[ㄱ-ㅎ]', desc: '자음' },
      { code: '[ ]', desc: '문자 집합', ins: '[]', caret: 1 }, { code: '[^ ]', desc: '제외 집합', ins: '[^]', caret: 2 },
      { code: '\\D', desc: '숫자 아님' }, { code: '\\W', desc: '단어문자 아님' }, { code: '\\S', desc: '공백 아님' },
      { code: '글자…', desc: '글자 직접 입력', kind: 'literal' },
    ] as any[] },
    { id: 'quant', label: '수량', items: ([
      { code: '?', desc: '없거나 1번', kind: 'quant', q: '?' }, { code: '*', desc: '0번 이상', kind: 'quant', q: '*' }, { code: '+', desc: '1번 이상', kind: 'quant', q: '+' },
      { code: '{3}', desc: '정확히 3번', kind: 'quant', q: '{3}' }, { code: '{2,4}', desc: '2~4번', kind: 'quant', q: '{2,4}' }, { code: '{2,}', desc: '2번 이상', kind: 'quant', q: '{2,}' },
      { code: '게으르게', desc: '가능한 적게(?)', kind: 'lazy' },
    ] as any[]).concat(py ? [{ code: '소유형', desc: '되돌리지 않음(+)', kind: 'poss' }] : []) },
    { id: 'pos', label: '위치', items: ([
      { code: '^', desc: '시작' }, { code: '$', desc: '끝' }, { code: '\\b', desc: '단어 경계' }, { code: '\\B', desc: '경계 아님' },
    ] as any[]).concat(py ? [{ code: '\\A', desc: '문자열 시작' }, { code: '\\Z', desc: '문자열 끝' }] : []) },
    { id: 'group', label: '그룹', items: [
      { code: '( )', desc: '캡처 그룹', kind: 'group', open: '(' }, { code: '(?: )', desc: '묶기만', kind: 'group', open: '(?:' },
      { code: py ? '(?P<이름> )' : '(?<이름> )', desc: '이름 그룹', kind: 'group', open: py ? '(?P<name>' : '(?<name>' },
      { code: '(?= )', desc: '뒤에 ~가 있음', kind: 'group', open: '(?=' }, { code: '(?! )', desc: '뒤에 ~가 없음', kind: 'group', open: '(?!' },
      { code: '(?<= )', desc: '앞에 ~가 있음', kind: 'group', open: '(?<=' }, { code: '(?<! )', desc: '앞에 ~가 없음', kind: 'group', open: '(?<!' },
      { code: '|', desc: '또는' },
    ] as any[] },
    { id: 'misc', label: '이스케이프', items: [
      { code: '\\.', desc: '마침표' }, { code: '\\-', desc: '하이픈' }, { code: '\\/', desc: '슬래시' }, { code: '\\\\', desc: '역슬래시' },
      { code: '\\(', desc: '여는 괄호' }, { code: '\\)', desc: '닫는 괄호' }, { code: '\\[', desc: '대괄호' }, { code: '\\$', desc: '달러' },
      { code: '\\n', desc: '줄바꿈' }, { code: '\\t', desc: '탭' }, { code: '\\1', desc: '1번 그룹 재사용' },
    ] as any[] },
  ];
}
function insertPos() {
  if (S.selPath && validPath(S.selPath)) { const ns = selNodes(); return ns[ns.length - 1].end; }
  const ta = ed.el;
  return ta && document.activeElement === ta ? ta.selectionEnd : Math.min(S.caret, S.pattern.length);
}
/** code 를 선택한 블록 뒤(없으면 커서 위치)에 넣는다 */
export function insertRaw(code: string, caretInside?: number | null) {
  const pos = insertPos();
  const s = S.pattern, ns = s.slice(0, pos) + code + s.slice(pos);
  const caret = pos + (caretInside != null ? caretInside : code.length);
  applyPattern(ns, { sel: null, caret });
  if (caretInside == null) selectAtStart(pos);
}
function quantTarget(): Path | null {
  if (S.selPath && validPath(S.selPath)) return S.selPath;
  return RX.findPath(V.tree, (n: any) => n.end === S.caret && QUANTIFIABLE.includes(n.t));
}
function wrapSelection(open: string, close: string) {
  const ta = ed.el!, a = ta.selectionStart, b = ta.selectionEnd, s = S.pattern;
  applyPattern(s.slice(0, a) + open + s.slice(a, b) + close + s.slice(b), { sel: null, caret: b + open.length + close.length });
}
/** 팔레트 항목을 눌렀다 */
export function insertItem(it: any) {
  const k = it.kind || 'text';
  if (k === 'literal') return openSheet('lit');
  if (k === 'quant' || k === 'lazy' || k === 'poss') {
    if (selN() > 1) { toast('여러 블록에는 수량을 붙일 수 없습니다. 먼저 묶으세요'); return; }
    const path = quantTarget();
    if (!path) { toast('수량을 붙일 블록을 먼저 선택하세요'); return; }
    if (!QUANTIFIABLE.includes(RX.getNode(V.tree, path).t)) { toast('이 블록에는 수량을 붙일 수 없습니다'); return; }
    S.selPath = path.slice(); S.selCount = 1;
    quantEdit(it);
    return;
  }
  if (k === 'group') {
    if (S.selPath) { wrapSel(it.open); return; }
    const ta = ed.el;
    if (ta && document.activeElement === ta && ta.selectionEnd > ta.selectionStart) { wrapSelection(it.open, ')'); return; }
    insertRaw(it.open + ')', it.open.length); return;
  }
  insertRaw(it.ins != null ? it.ins : it.code, it.caret);
}

// ---------- 플래그 · 엔진 ----------
export function toggleFlag(c: string) {
  S.flags = S.flags.includes(c) ? S.flags.replace(c, '') : S.flags + c;
  markDirty(); scheduleRun(); persistState();
}
function onPyState() {
  const was = S.pyState;
  S.pyState = Engine.pyState as any; S.pyError = Engine.pyError;
  if (S.pyState === 'ready' && was !== 'ready') { toast('Python 엔진이 준비되었습니다'); scheduleRun(); }
}
export function loadPy() { Engine.loadPy(onPyState); }
export function setEngine(e: Dialect) {
  S.engine = e; Pref.set('engine', e);
  S.flags = cleanFlags(S.flags, e);
  clearSel();
  if (e === 'py') loadPy();
  scheduleRun(); persistState();
}

// ---------- 예시 텍스트 ----------
export function selectSample(i: number) { S.sampleIdx = i; scheduleRun(); persistState(); }
export function addSample() {
  S.samples.push(newSample(S.samples.length + 1)); S.sampleIdx = S.samples.length - 1;
  markDirty(); scheduleRun(); persistState();
}
export function deleteSample(i: number) {
  if (S.samples.length < 2 || !S.samples[i]) return;
  S.samples.splice(i, 1);
  if (i < S.sampleIdx) S.sampleIdx--;
  S.sampleIdx = Math.min(S.sampleIdx, S.samples.length - 1);
  markDirty(); scheduleRun(); persistState();
}
export function setSampleText(v: string) { curSample().text = v; markDirty(); scheduleRun(); persistState(); }
export function setSampleName(v: string) { curSample().name = v.slice(0, 40) || '예시'; markDirty(); persistState(); }

// ---------- 치환 · 검증 입력 ----------
export function setRepl(v: string) { S.repl = v; if (v && !S.useRepl) S.useRepl = true; markDirty(); scheduleRun(); persistState(); }
export function setUseRepl(v: boolean) { S.useRepl = v; markDirty(); scheduleRun(); persistState(); }
export function setMust(v: string) { S.must = v; markDirty(); scheduleTests(); persistState(); }
export function setMustNot(v: string) { S.mustnot = v; markDirty(); scheduleTests(); persistState(); }
export function setTestMode(m: 'search' | 'full') { S.testMode = m; markDirty(); runTests(); persistState(); }
export function setLang(l: 'js' | 'py' | 'grep') { S.lang = l; Pref.set('lang', l); }

// ---------- 실행 ----------
let runSeq = 0, testSeq = 0;
const runSoon = debounce(() => { runAll(); }, 90);
/** 패턴·플래그·예시가 바뀔 때마다 부른다. 짧게 모아서 워커에서 실행한다 */
export function scheduleRun() { R.busy = true; runSoon(); }
export const scheduleTests = debounce(() => { runTests(); }, 200);

export async function runAll() {
  const seq = ++runSeq;
  const text = curSample().text;
  const all = S.flags.includes('g');
  if (!S.pattern) {
    R.last = { res: { matches: [], ng: 0, names: {} }, text, empty: true, notes: [] };
    R.busy = false; runTests(); return;
  }
  const replJs = S.useRepl ? S.repl : null;
  const repl = S.useRepl ? (S.engine === 'py' ? RX.replToPy(S.repl) : S.repl) : null;
  let out: any;
  try { out = await Engine.exec(S.engine, { pattern: S.pattern, flags: S.flags, text, all, repl, replJs }); }
  catch (e: any) { if (seq !== runSeq) return; out = { res: { error: '실행 중 오류: ' + e.message }, notes: [] }; }
  if (seq !== runSeq) return;
  if (S.pyState !== Engine.pyState) { S.pyState = Engine.pyState as any; if (S.pyState === 'idle' && S.engine === 'py') loadPy(); }
  R.last = { res: out.res, approx: !!out.approx, notes: out.notes || [], text };
  R.busy = false;
  runTests();
}

export function splitLines(s: string) { return s.split('\n').map((x) => x.replace(/\r$/, '')).filter((x) => x !== ''); }
export async function runTests() {
  const seq = ++testSeq;
  const must = splitLines(S.must), not = splitLines(S.mustnot);
  const total = must.length + not.length;
  if (!total) { R.tests = { state: 'idle', must: [], mustnot: [], pass: 0, total: 0 }; return; }
  if (!S.pattern) { R.tests = { state: 'nopattern', must: [], mustnot: [], pass: 0, total }; return; }
  const r: any = await Engine.test(S.engine, { pattern: S.pattern, flags: S.flags, lines: must.concat(not), mode: S.testMode });
  if (seq !== testSeq) return;
  if (r.error) { R.tests = { state: 'error', error: r.error, must: [], mustnot: [], pass: 0, total }; return; }
  const m = must.map((line, i) => ({ line, ok: r.res[i] === true }));
  const n = not.map((line, i) => ({ line, ok: r.res[must.length + i] === false }));
  R.tests = { state: 'done', must: m, mustnot: n, pass: m.concat(n).filter((x) => x.ok).length, total };
}

// ---------- 경고 ----------
function unbounded(q: string) { const o = RX.parseQ(q); return o.mode !== 'none' && o.max === Infinity; }
function lintTree(root: any) {
  const w: string[] = []; let dotStars = 0;
  (function rec(list: any[], inUnb: boolean) {
    list.forEach((n, i) => {
      if (n.t === 'dot' && unbounded(n.q)) dotStars++;
      if (n.t === 'alt' && (i === 0 || i === list.length - 1 || list[i - 1].t === 'alt')) w.push('비어 있는 선택지(| 양옆이 비어 있음)가 있어 빈 문자열에도 일치합니다.');
      if (n.t === 'raw' && !n.cmt && !n.flagsOnly) w.push('해석하지 못한 조각 "' + n.raw + '"이 있습니다. 괄호나 수량자 짝을 확인하세요.');
      if (n.t === 'grp') {
        if (!n.closed) w.push('닫히지 않은 괄호가 있습니다.');
        const u = unbounded(n.q);
        if (u && inUnb) w.push('반복 안에 또 반복이 중첩되어 있습니다. 입력에 따라 매우 느려질 수 있습니다(백트래킹 폭주).');
        rec(n.children, inUnb || u);
      } else if (unbounded(n.q) && inUnb && n.t !== 'lit') w.push('반복 안에 또 반복이 중첩되어 있습니다.');
    });
  })(root.children, false);
  if (dotStars >= 2) w.push('.* 또는 .+ 가 여러 번 쓰였습니다. 느려지거나 의도보다 넓게 일치할 수 있습니다.');
  return Array.from(new Set(w));
}
/** 패턴의 구조적 경고(실행 오류와 별개) */
export function warnings(): string[] {
  if (!S.pattern) return [];
  const w = lintTree(V.tree);
  if (V.matches.some((m) => m.e === m.s)) w.push('빈 문자열에 일치하는 곳이 있습니다(미리보기의 세로선). 치환에 쓰면 그 위치에 삽입됩니다.');
  return w;
}

// ---------- 코드로 복사 ----------
function pyStr(p: string) {
  if (!/["\n\r]/.test(p) && !/(^|[^\\])(\\\\)*\\$/.test(p)) return 'r"' + p + '"';
  return '"' + p.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '\\r') + '"';
}
function toPyDialect(p: string) {
  const t = RX.parse(p, 'js'); RX.serialize(t);
  (function rec(l: any[]) { l.forEach((n) => { if (n.t === 'grp') { n.open = n.open.replace(/^\(\?<(\w+)>$/, '(?P<$1>'); rec(n.children); } else if (n.t === 'ref' && /^\\k</.test(n.raw)) n.raw = '(?P=' + n.raw.slice(3, -1) + ')'; }); })(t.children);
  return RX.serialize(t);
}
export function codeFor(lang: string) {
  const all = S.flags.includes('g');
  const pat = S.pattern || '(?:)';
  const lines: string[] = [];
  if (lang === 'js') {
    let p = pat, f = S.flags.replace(/[^gimsu]/g, '');
    if (S.engine === 'py') { const t = RX.pyToJs(pat, S.flags); p = t.pattern; f = t.flags + (all && !t.flags.includes('g') ? 'g' : ''); lines.push('// Python 문법을 JavaScript 로 근사 변환한 패턴입니다. 동작을 꼭 확인하세요.'); }
    p = p.replace(/\\.|\//g, (m: string) => (m === '/' ? '\\/' : m));
    lines.push('const re = /' + p + '/' + f + ';', '');
    lines.push(all ? 'const matches = [...text.matchAll(re)];' : 'const match = text.match(re);');
    if (S.useRepl) lines.push('const result = text.replace(re, ' + JSON.stringify(S.repl) + ');');
  } else if (lang === 'py') {
    let p = pat; if (S.engine === 'js') p = toPyDialect(pat);
    const fl = S.flags.split('').map((c) => ({ i: 're.I', m: 're.M', s: 're.S', x: 're.X', a: 're.A' } as any)[c]).filter(Boolean);
    lines.push('import re', '', 'pattern = re.compile(' + pyStr(p) + (fl.length ? ', ' + fl.join(' | ') : '') + ')', '');
    lines.push(all ? 'matches = list(pattern.finditer(text))' : 'match = pattern.search(text)');
    if (S.useRepl) lines.push('result = pattern.sub(' + pyStr(RX.replToPy(S.repl)) + ', text' + (all ? '' : ', count=1') + ')');
    if (S.engine === 'js') lines.push('', '# JavaScript 문법에서 옮긴 패턴입니다. 이름 그룹은 (?P<이름>...) 형태로 바꿨습니다.');
  } else {
    const q = "'" + pat.replace(/'/g, "'\\''") + "'";
    lines.push('grep -' + (S.flags.includes('i') ? 'i' : '') + 'oP ' + q + ' file.txt', '', '# -P 는 PCRE 방언입니다(macOS 기본 grep 은 -P 미지원, ggrep 사용).');
  }
  return lines.join('\n');
}

// ---------- 프리셋 ----------
function loadPresetIntoWorkspace(p: any) {
  S.pattern = p ? p.pattern : '';
  S.flags = cleanFlags(p ? p.flags : 'g', S.engine);
  S.repl = p ? p.repl || '' : '';
  S.useRepl = p ? (p.useRepl != null ? !!p.useRepl : !!p.repl) : false;
  S.samples = p && p.samples && p.samples.length ? p.samples.map((s: any) => ({ id: uid(), name: s.name, text: s.text })) : [newSample()];
  S.sampleIdx = 0;
  S.must = p ? p.must || '' : '';
  S.mustnot = p ? p.mustnot || '' : '';
  S.testMode = p ? p.testMode || 'search' : 'search';
  S.dirty = false; clearSel(); S.caret = S.pattern.length; resetUndo();
  S.open.repl = S.useRepl; S.open.tests = false;
}
export function hasUnsaved() { return S.dirty && !!(S.pattern.trim() || S.samples.some((s) => s.text.trim())); }
/** 저장하지 않은 수정이 있으면 확인 시트를 띄우고, 없으면 바로 next 를 실행한다 */
export function guardDiscard(next: () => void) {
  if (!hasUnsaved()) { next(); return; }
  openSheet('guard', { next });
}
/** guard 시트의 '저장하고 이동' */
export function saveThen(next: () => void) {
  if (isUserPreset(S.presetId)) { updateCurrentPreset(); next(); return; }
  const p = findPreset(S.presetId);
  openSheet('save', { name: p ? p.name + ' (수정)' : '', desc: p ? p.desc : '', after: next });
}
export function selectPreset(id: string) {
  if (id === S.presetId && id !== 'new') return;
  guardDiscard(() => doSelectPreset(id));
}
function doSelectPreset(id: string) {
  const p = id === 'new' ? null : findPreset(id);
  S.presetId = p ? p.id : 'new';
  loadPresetIntoWorkspace(p);
  scheduleRun(); persistState();
}
function workspaceAsPreset(name: string, desc: string) {
  return {
    id: uid(), name, desc: desc || '', cat: '내 프리셋',
    pattern: S.pattern, flags: S.flags, repl: S.repl, useRepl: S.useRepl,
    samples: S.samples.map((s) => ({ name: s.name, text: s.text })),
    must: S.must, mustnot: S.mustnot, testMode: S.testMode, engine: S.engine,
  };
}
const saveUserPresets = () => Store.set('presets', $state.snapshot(S.userPresets));
const saveHistory = () => Store.set('history', $state.snapshot(S.history));
export function saveAsNewPreset(name: string, desc: string, after?: () => void) {
  const p = workspaceAsPreset(name.trim() || '이름 없는 프리셋', desc);
  S.userPresets.unshift(p); S.presetId = p.id; S.dirty = false;
  saveUserPresets(); persistState(); recordHistory();
  toast('프리셋을 저장했습니다');
  if (after) after();
}
export function updateCurrentPreset() {
  const i = S.userPresets.findIndex((p) => p.id === S.presetId);
  if (i < 0) return;
  const old = S.userPresets[i];
  const n = workspaceAsPreset(old.name, old.desc); n.id = old.id;
  S.userPresets[i] = n; S.dirty = false;
  saveUserPresets(); recordHistory(); persistState(); toast('프리셋을 갱신했습니다');
}
export function deletePreset(id: string) {
  S.userPresets = S.userPresets.filter((p) => p.id !== id);
  saveUserPresets();
  if (S.presetId === id) { S.presetId = 'new'; loadPresetIntoWorkspace(null); S.toolsOpen = true; scheduleRun(); }
  persistState();
}
export function renamePreset(id: string, name: string, desc: string) {
  const p = S.userPresets.find((x) => x.id === id); if (!p) return;
  p.name = name.trim() || p.name; p.desc = desc; saveUserPresets();
}

// ---------- 내역: 복사하거나 저장하는 시점에만 기록 (패턴 기준 중복 제거) ----------
function histKey(e: any) { return hashStr(e.engine + '\u0001' + e.pattern.replace(/\r\n/g, '\n').trim()); }
export function recordHistory() {
  if (!S.pattern.trim() || V.error) return;
  const e: any = { engine: S.engine, pattern: S.pattern, flags: S.flags, repl: S.repl, useRepl: S.useRepl, t: Date.now() };
  e.id = histKey(e);
  S.history = [e].concat(S.history.filter((h) => h.id !== e.id)).slice(0, 300);
  saveHistory();
}
export function deleteHistoryItem(id: string) { S.history = S.history.filter((x) => x.id !== id); saveHistory(); }
export function clearHistory() { S.history = []; saveHistory(); }
export function loadHistoryItem(h: any) {
  guardDiscard(() => {
    S.engine = h.engine; Pref.set('engine', S.engine);
    S.pattern = h.pattern; S.flags = cleanFlags(h.flags || '', S.engine); S.repl = h.repl || ''; S.useRepl = !!h.useRepl;
    S.presetId = 'new'; S.dirty = false; resetUndo(); S.toolsOpen = true; clearSel(); S.caret = S.pattern.length;
    S.open.repl = S.useRepl;
    if (S.engine === 'py') loadPy();
    closeSheet(); toast('내역에서 불러왔습니다'); scheduleRun(); persistState();
  });
}

// ---------- 백업 ----------
export function backupJson() { return JSON.stringify({ app: 'regex-workbench', version: 1, exportedAt: new Date().toISOString(), presets: S.userPresets, history: S.history }, null, 1); }
export function saveBackupFile() {
  try {
    const url = URL.createObjectURL(new Blob([backupJson()], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = 'regex-workbench-backup.json';
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast('백업 파일을 저장했습니다');
  } catch (e) { toast('백업 파일을 저장하지 못했습니다. JSON 복사로 보관해 주세요'); }
}
const cleanStr = (v: any, max: number) => (typeof v === 'string' ? v.slice(0, max) : '');
function sanitizePreset(p: any) {
  if (!p || typeof p !== 'object' || typeof p.pattern !== 'string' || p.pattern.length > 4000) return null;
  const eng: Dialect = p.engine === 'py' ? 'py' : 'js';
  const samples = (Array.isArray(p.samples) ? p.samples : []).slice(0, 20).filter((s: any) => s && typeof s.text === 'string').map((s: any) => ({ name: cleanStr(s.name, 40) || '예시', text: s.text.slice(0, 20000) }));
  return {
    id: uid(), name: cleanStr(p.name, 60) || '가져온 프리셋', desc: cleanStr(p.desc, 300), cat: '내 프리셋', pattern: p.pattern,
    flags: cleanFlags(cleanStr(p.flags, 10), eng), repl: cleanStr(p.repl, 1000), useRepl: !!p.useRepl,
    samples: samples.length ? samples : [{ name: '예시 1', text: '' }], must: cleanStr(p.must, 5000), mustnot: cleanStr(p.mustnot, 5000), testMode: p.testMode === 'full' ? 'full' : 'search', engine: eng,
  };
}
function validatePresets(arr: any) { return (Array.isArray(arr) ? arr : []).map((p) => { const q = sanitizePreset(p); if (q && p.id && typeof p.id === 'string') q.id = p.id.slice(0, 20); return q; }).filter(Boolean).slice(0, 500); }
function validateHistory(arr: any) {
  return (Array.isArray(arr) ? arr : []).filter((h) => h && typeof h.pattern === 'string' && h.pattern.length <= 4000).map((h) => {
    const eng: Dialect = h.engine === 'py' ? 'py' : 'js';
    const e: any = { engine: eng, pattern: h.pattern, flags: cleanFlags(cleanStr(h.flags, 10), eng), repl: cleanStr(h.repl, 1000), useRepl: !!h.useRepl, t: +h.t || Date.now() };
    e.id = histKey(e); return e;
  }).slice(0, 300);
}
const presetSig = (p: any) => hashStr([p.name, p.pattern, p.flags, p.repl].join('\u0001'));
/** 백업 JSON 을 합친다. 결과 문구를 돌려준다 */
export function doImport(text: string): { ok: boolean; msg: string } {
  let data: any;
  try { data = JSON.parse(text); } catch (e) { return { ok: false, msg: 'JSON 형식이 올바르지 않습니다.' }; }
  if (!data || typeof data !== 'object' || (data.app !== 'regex-workbench' && !Array.isArray(data.presets) && !Array.isArray(data.history))) return { ok: false, msg: '이 앱의 백업 파일이 아닙니다.' };
  const rawP = Array.isArray(data.presets) ? data.presets : [], rawH = Array.isArray(data.history) ? data.history : [];
  const sigs = new Set(S.userPresets.map(presetSig)); let add = 0, dup = 0, skip = 0;
  const addList: any[] = [];
  rawP.slice(0, 500).forEach((p: any) => { const q = sanitizePreset(p); if (!q) { skip++; return; } const s = presetSig(q); if (sigs.has(s)) { dup++; return; } sigs.add(s); addList.push(q); add++; });
  S.userPresets = S.userPresets.concat(addList);
  const have = new Set(S.history.map((h) => h.id)); let hAdd = 0, hDup = 0;
  const vh = validateHistory(rawH), hSkip = Math.max(0, Math.min(rawH.length, 300) - vh.length);
  const hist = S.history.slice();
  vh.forEach((h) => { if (have.has(h.id)) { hDup++; return; } have.add(h.id); hist.push(h); hAdd++; });
  hist.sort((a, b) => b.t - a.t);
  S.history = hist.slice(0, 300);
  saveUserPresets(); saveHistory();
  return { ok: true, msg: '프리셋: 추가 ' + add + ', 중복 ' + dup + ', 제외 ' + skip + ' / 내역: 추가 ' + hAdd + ', 중복 ' + hDup + ', 제외 ' + hSkip };
}

// ---------- 임시 저장(초안): 마지막 작업 내용만 localStorage 에 ----------
const DRAFT_KEY = 'regexbench.draft';
function saveDraft() {
  try {
    const s = JSON.stringify({
      engine: S.engine, presetId: S.presetId, pattern: S.pattern, flags: S.flags, repl: S.repl, useRepl: S.useRepl,
      samples: S.samples, sampleIdx: S.sampleIdx, must: S.must, mustnot: S.mustnot, testMode: S.testMode, dirty: S.dirty, toolsOpen: S.toolsOpen,
    });
    if (s.length > 2e6) return;
    localStorage.setItem(DRAFT_KEY, s);
  } catch (e) {}
}
export const persistState = debounce(saveDraft, 400);
function restoreState(st: any) {
  if (!st || typeof st !== 'object') return false;
  try {
    if (st.engine === 'py' || st.engine === 'js') S.engine = st.engine;
    S.presetId = typeof st.presetId === 'string' && (st.presetId === 'new' || findPreset(st.presetId)) ? st.presetId : 'new';
    S.pattern = typeof st.pattern === 'string' ? st.pattern : '';
    S.flags = cleanFlags(typeof st.flags === 'string' ? st.flags : 'g', S.engine);
    S.repl = typeof st.repl === 'string' ? st.repl : ''; S.useRepl = !!st.useRepl;
    let samples: any[] = [];
    if (Array.isArray(st.samples)) samples = st.samples.filter((s: any) => s && typeof s.text === 'string').map((s: any) => ({ id: uid(), name: String(s.name || '예시'), text: s.text }));
    S.samples = samples.length ? samples : [newSample()];
    S.sampleIdx = Math.min(Math.max(0, st.sampleIdx | 0), S.samples.length - 1);
    S.must = typeof st.must === 'string' ? st.must : ''; S.mustnot = typeof st.mustnot === 'string' ? st.mustnot : '';
    S.testMode = st.testMode === 'full' ? 'full' : 'search';
    S.dirty = !!st.dirty;
    // 예전 초안의 builderOpen 도 읽는다
    S.toolsOpen = st.toolsOpen != null ? !!st.toolsOpen : st.builderOpen != null ? !!st.builderOpen : true;
    S.open.repl = S.useRepl;
    S.caret = S.pattern.length;
    return true;
  } catch (e) { return false; }
}
export function setToolsOpen(v: boolean) { S.toolsOpen = v; persistState(); }

// ---------- 시작 ----------
export async function init() {
  applySettings();
  window.addEventListener('pagehide', saveDraft);
  document.addEventListener('visibilitychange', () => { if (document.hidden) saveDraft(); });
  await Store.init();
  S.userPresets = validatePresets(await Store.get('presets', []));
  S.history = validateHistory(await Store.get('history', []));
  S.engine = Pref.get('engine', 'js') === 'py' ? 'py' : 'js';
  let st: any = null;
  try { const s = localStorage.getItem(DRAFT_KEY); st = s ? JSON.parse(s) : null; } catch (e) {}
  const restored = restoreState(st);
  if (!restored) { S.presetId = 'b-mobile'; loadPresetIntoWorkspace(findPreset('b-mobile')); }
  if (restored && S.dirty) toast('작업 중이던 내용을 복구했습니다');
  if (S.engine === 'py') loadPy();
  runAll();
  // 다른 탭에서 프리셋·내역을 바꿨을 수 있다
  window.addEventListener('focus', async () => {
    if (S.sheet || Store.mode === 'memory') return;
    S.userPresets = validatePresets(await Store.get('presets', $state.snapshot(S.userPresets)));
    if (S.presetId !== 'new' && !findPreset(S.presetId)) S.presetId = 'new';
    S.history = validateHistory(await Store.get('history', $state.snapshot(S.history)));
  });
}
