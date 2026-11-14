import { RX } from "./rx.js";
const PY_CODE = `
import re, json

def _flags(f):
    m = 0
    for c in f:
        m |= {'i': re.I, 'm': re.M, 's': re.S, 'x': re.X, 'a': re.A}.get(c, 0)
    return m

def _compile(pattern, flags):
    return re.compile(pattern, _flags(flags))

def _exec(pattern, flags, text, all_, repl):
    try:
        rx = _compile(pattern, flags)
    except re.error as e:
        return json.dumps({'error': 're.error: ' + str(e.msg) + (' (위치 %s)' % e.pos if e.pos is not None else '')})
    except Exception as e:
        return json.dumps({'error': str(e)})
    ms = []
    if all_:
        it = rx.finditer(text)
    else:
        m0 = rx.search(text)
        it = [m0] if m0 else []
    for m in it:
        if len(ms) >= 2000:
            break
        gs = []
        for i in range(1, rx.groups + 1):
            s, e = m.span(i)
            gs.append(None if s < 0 else [s, e])
        ms.append({'s': m.start(), 'e': m.end(), 'g': gs})
    out = {'matches': ms, 'ng': rx.groups, 'names': {str(v): k for k, v in rx.groupindex.items()}}
    if repl is not None:
        try:
            out['replaced'] = rx.sub(repl, text, count=0 if all_ else 1)
        except Exception as e:
            out['replError'] = str(e)
    return json.dumps(out)

def _test(pattern, flags, lines, mode):
    try:
        rx = _compile(pattern, flags)
    except re.error as e:
        return json.dumps({'error': 're.error: ' + str(e.msg)})
    f = rx.fullmatch if mode == 'full' else rx.search
    return json.dumps({'res': [bool(f(l)) for l in lines]})
`;

const WORKER_TAIL = `
self.onmessage = async (e) => {
  const { id, type, payload } = e.data;
  try {
    const result = await handlers[type](payload);
    self.postMessage({ id, ok: true, result });
  } catch (err) {
    self.postMessage({ id, ok: false, error: String((err && err.message) || err) });
  }
};
`;

const JS_WORKER_SRC = `
function flagsOf(f) { return Array.from(new Set(f.replace(/[^imsu]/g, ''))).join(''); }
const handlers = {
  exec({ pattern, flags, text, all, repl }) {
    const jf = flagsOf(flags);
    let rx, hasIdx = true;
    try { rx = new RegExp(pattern, jf + 'gd'); }
    catch (e1) {
      try { rx = new RegExp(pattern, jf + 'g'); hasIdx = false; }
      catch (e2) { return { error: String(e2.message || e2) }; }
    }
    let ng = 0;
    try { ng = new RegExp(pattern + '|', jf).exec('').length - 1; } catch (e) {}
    const matches = [];
    for (const m of text.matchAll(rx)) {
      const g = [];
      for (let k = 1; k < m.length; k++) {
        if (hasIdx) { const ix = m.indices[k]; g.push(ix ? [ix[0], ix[1]] : null); }
        else if (m[k] === undefined) g.push(null);
        else { const o = m.index + Math.max(0, m[0].indexOf(m[k])); g.push([o, o + m[k].length]); }
      }
      matches.push({ s: m.index, e: m.index + m[0].length, g });
      if (!all || matches.length >= 2000) break;
    }
    const out = { matches, ng, names: {} };
    if (repl !== null && repl !== undefined) {
      try { out.replaced = text.replace(new RegExp(pattern, jf + (all ? 'g' : '')), repl); }
      catch (e) { out.replError = String(e.message || e); }
    }
    return out;
  },
  test({ pattern, flags, lines, mode }) {
    const jf = flagsOf(flags);
    let rx;
    try { rx = new RegExp(mode === 'full' ? '^(?:' + pattern + ')$' : pattern, jf); }
    catch (e) { return { error: String(e.message || e) }; }
    return { res: lines.map((l) => { rx.lastIndex = 0; return rx.test(l); }) };
  }
};
` + WORKER_TAIL;

const PY_WORKER_SRC = `
const PY_CODE = ${JSON.stringify(PY_CODE)};
let py = null, initP = null;
function init(base) {
  if (initP) return initP;
  initP = (async () => {
    /* 표준 라이브러리 zip 은 게시할 수 없는 형식이라 base64 스크립트로 싣고, 요청을 가로채 돌려준다 */
    importScripts(base + 'stdlib.js');
    const bin = atob(self.__STDLIB_B64); const u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    self.__STDLIB_B64 = null;
    const realFetch = self.fetch.bind(self);
    self.fetch = (u, o) => String((u && u.url) || u).endsWith('python_stdlib.zip')
      ? Promise.resolve(new Response(u8, { headers: { 'Content-Type': 'application/zip' } }))
      : realFetch(u, o);
    importScripts(base + 'pyodide.js');
    py = await loadPyodide({ indexURL: base });
    py.runPython(PY_CODE);
    return true;
  })();
  initP.catch(() => { initP = null; });
  return initP;
}
const handlers = {
  async init({ base }) { await init(base); return true; },
  async exec({ pattern, flags, text, all, repl }) {
    if (!py) throw new Error('not ready');
    const r = py.globals.get('_exec')(pattern, flags, text, !!all, repl === undefined ? null : repl);
    return JSON.parse(r);
  },
  async test({ pattern, flags, lines, mode }) {
    if (!py) throw new Error('not ready');
    const r = py.globals.get('_test')(pattern, flags, lines, mode);
    return JSON.parse(r);
  }
};
` + WORKER_TAIL;

class WorkerClient {
  constructor(src) { this.src = src; this.seq = 0; this.pending = new Map(); this.w = null; this.url = null; this.ok = true; this.start(); }
  start() {
    try {
      if (!this.url) this.url = URL.createObjectURL(new Blob([this.src], { type: 'text/javascript' }));
      this.w = new Worker(this.url);
      this.w.onmessage = (e) => {
        const { id, ok, result, error } = e.data;
        const p = this.pending.get(id); if (!p) return;
        this.pending.delete(id); clearTimeout(p.timer);
        ok ? p.resolve(result) : p.reject(new Error(error));
      };
      this.w.onerror = () => { this.failAll(new Error('worker')); this.restart(); };
    } catch (e) { this.ok = false; this.w = null; }
  }
  failAll(err) { for (const p of this.pending.values()) { clearTimeout(p.timer); p.reject(err); } this.pending.clear(); }
  restart() { try { this.w && this.w.terminate(); } catch (e) {} this.start(); }
  call(type, payload, timeout) {
    if (!this.w) return Promise.reject(new Error('worker-unavailable'));
    const id = ++this.seq;
    return new Promise((resolve, reject) => {
      const timer = timeout ? setTimeout(() => {
        this.pending.delete(id); reject(new Error('timeout')); this.failAll(new Error('cancelled')); this.restart();
      }, timeout) : 0;
      this.pending.set(id, { resolve, reject, timer });
      this.w.postMessage({ id, type, payload });
    });
  }
}

/* 워커를 만들 수 없는 환경: 같은 코드를 메인 스레드에서 실행 (JS 전용) */
function makeInlineJs() {
  const box = { onmessage: null, postMessage: null };
  try { new Function('self', JS_WORKER_SRC)(box); } catch (e) { return null; }
  return {
    ok: true,
    call(type, payload) {
      return new Promise((resolve, reject) => {
        box.postMessage = (m) => (m.ok ? resolve(m.result) : reject(new Error(m.error)));
        box.onmessage({ data: { id: 1, type, payload } });
      });
    }
  };
}

/* 코드포인트 인덱스 → UTF-16 인덱스 (Python 결과용) */
function cpMap(text) {
  if (!/[\uD800-\uDFFF]/.test(text)) return null;
  const map = []; let u = 0;
  for (const ch of text) { map.push(u); u += ch.length; }
  map.push(u);
  return map;
}
function remapResult(res, text) {
  const map = cpMap(text);
  if (!map || !res.matches) return res;
  const f = (x) => map[x];
  res.matches.forEach((m) => { m.s = f(m.s); m.e = f(m.e); m.g = m.g.map((g) => g && [f(g[0]), f(g[1])]); });
  return res;
}

const Engine = {
  js: null,
  py: null,
  pyState: 'idle', // idle | loading | ready | failed
  pyError: '',
  pyBase() { return new URL('pyodide/', document.baseURI).href; },
  initJs() { if (!this.js) { const c = new WorkerClient(JS_WORKER_SRC); this.js = c.ok ? c : makeInlineJs(); } return this.js; },
  async loadPy(onState) {
    if (this.pyState === 'loading' || this.pyState === 'ready') return;
    this.pyState = 'loading'; this.pyError = ''; onState && onState();
    try {
      if (!this.py || !this.py.ok) this.py = new WorkerClient(PY_WORKER_SRC);
      if (!this.py.ok) throw new Error('worker-unavailable');
      await this.py.call('init', { base: this.pyBase() }, 90000);
      this.pyState = 'ready';
    } catch (e) {
      this.pyState = 'failed';
      this.pyError = e.message === 'timeout' ? '시간 초과' : e.message === 'worker-unavailable' ? '이 환경에서는 워커를 만들 수 없음' : '엔진 파일을 읽지 못함';
      try { this.py && this.py.w && this.py.w.terminate(); } catch (x) {}
      this.py = null;
    }
    onState && onState();
  },
  /* 반환: { res, approx, note } — res.error 가 있으면 패턴 오류 */
  async exec(dialect, p) {
    if (dialect === 'py' && this.pyState === 'ready') {
      try {
        const res = await this.py.call('exec', p, 4000);
        return { res: remapResult(res, p.text), approx: false };
      } catch (e) {
        if (e.message === 'timeout') { this.pyState = 'idle'; this.py = null; this.loadPy(); return { res: { error: '시간 초과: 백트래킹이 너무 깊습니다. Python 엔진을 다시 불러옵니다.' }, approx: false }; }
        if (e.message === 'cancelled') throw e;
      }
    }
    const js = this.initJs();
    if (!js) return { res: { error: '이 환경에서는 정규식을 실행할 수 없습니다.' }, approx: false };
    let q = p;
    let notes = [];
    if (dialect === 'py') {
      const t = RX.pyToJs(p.pattern, p.flags);
      q = Object.assign({}, p, { pattern: t.pattern, flags: t.flags, repl: p.replJs === undefined ? p.repl : p.replJs });
      notes = t.notes;
    }
    try {
      const res = await js.call('exec', q, 1500);
      return { res, approx: dialect === 'py', notes };
    } catch (e) {
      if (e.message === 'timeout') return { res: { error: '시간 초과: 백트래킹이 너무 깊은 패턴입니다. (a+)+ 같은 중첩 반복을 줄여 보세요.' }, approx: false };
      throw e;
    }
  },
  async test(dialect, p) {
    if (dialect === 'py' && this.pyState === 'ready') {
      try { return await this.py.call('test', p, 4000); } catch (e) { if (e.message === 'cancelled') throw e; }
    }
    const js = this.initJs();
    if (!js) return { error: '실행할 수 없음' };
    let q = p;
    if (dialect === 'py') { const t = RX.pyToJs(p.pattern, p.flags); q = Object.assign({}, p, { pattern: t.pattern, flags: t.flags }); }
    try { return await js.call('test', q, 1500); }
    catch (e) { return { error: e.message === 'timeout' ? '시간 초과' : e.message }; }
  }
};

export { Engine };
