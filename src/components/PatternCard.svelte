<script lang="ts">
  // 패턴 작성 카드: 항상 직접 편집할 수 있는 입력창(구문 색칠·오류·커서 위치 설명) + 접을 수 있는 블록 도구.
  import { S, V, R, RX, FLAG_DEFS, ed, applyPattern, doUndo, doRedo, toggleFlag, clearSel, selN, pathAt, setToolsOpen } from '../lib/app.svelte';
  import { slideFx } from '../lib/motion/motion.svelte';
  import HiArea from './HiArea.svelte';
  import BlockBoard from './BlockBoard.svelte';

  let ta = $state<HTMLTextAreaElement | null>(null);
  let badge = $state<HTMLElement | null>(null);
  $effect(() => { ed.el = ta; return () => { ed.el = null; }; });

  // ---- 구문 색칠 ----
  type Tok = { a: number; b: number; cls: string };
  function tokens(tree: any): Tok[] {
    const out: Tok[] = [];
    (function rec(list: any[]) {
      for (const n of list) {
        if (n.t === 'grp') {
          const cls = 'tk-grp' + (n.gnum ? ' gc' + (((n.gnum - 1) % 6) + 1) : '');
          out.push({ a: n.start, b: n.cStart, cls });
          rec(n.children);
          if (n.qStart > n.cEnd) out.push({ a: n.cEnd, b: n.qStart, cls });
        } else if (n.qStart > n.start) out.push({ a: n.start, b: n.qStart, cls: 'tk-' + n.t });
        if (n.end > n.qStart) out.push({ a: n.qStart, b: n.end, cls: 'tk-q' });
      }
    })(tree.children);
    return out;
  }
  /** 범위 [r.a, r.b) 에 걸친 토큰을 잘라 extra 클래스를 덧붙인다 */
  function overlay(toks: Tok[], r: { a: number; b: number } | null, extra: string): Tok[] {
    if (!r || r.b <= r.a) return toks;
    const out: Tok[] = [];
    for (const t of toks) {
      if (t.b <= r.a || t.a >= r.b) { out.push(t); continue; }
      const a = Math.max(t.a, r.a), b = Math.min(t.b, r.b);
      if (t.a < a) out.push({ a: t.a, b: a, cls: t.cls });
      out.push({ a, b, cls: t.cls + ' ' + extra });
      if (b < t.b) out.push({ a: b, b: t.b, cls: t.cls });
    }
    return out;
  }
  const selRange = $derived.by(() => {
    if (!S.selPath || S.edFocus) return null;
    try {
      const l = RX.listAt(V.tree, S.selPath), i = S.selPath[S.selPath.length - 1];
      const ns = l.slice(i, i + selN());
      return ns.length ? { a: ns[0].start, b: ns[ns.length - 1].end } : null;
    } catch (e) { return null; }
  });
  const parts = $derived.by(() => {
    const s = S.pattern;
    let toks = overlay(tokens(V.tree), selRange, 'at-sel');
    toks = overlay(toks, S.hover, 'at-hover');
    return toks.map((t) => ({ text: s.slice(t.a, t.b), cls: t.cls }));
  });

  // ---- 상태 줄: 오류 > 커서(또는 선택) 위치의 블록 설명 > 요약 ----
  const hint = $derived.by(() => {
    const p = S.edFocus ? pathAt(S.caret) : S.selPath && selN() === 1 ? S.selPath : null;
    if (!p) return null;
    try {
      const n = RX.getNode(V.tree, p);
      return { code: (n.t === 'grp' ? n.open + '…' + (n.closed ? ')' : '') : n.raw) + n.q, text: RX.describe(n) };
    } catch (e) { return null; }
  });
  const count = $derived(V.matches.length);
  let prevCount = -1;
  $effect(() => {
    const c = count;
    if (prevCount >= 0 && c !== prevCount && badge) Motion.pulse(badge);
    prevCount = c;
  });

  // ---- 입력 ----
  const PAIRS: Record<string, string> = { '(': ')', '[': ']', '{': '}' };
  const onInput = () => { if (ta) applyPattern(ta.value, { sel: null, caret: ta.selectionStart, coalesce: true, fromInput: true }); };
  const track = () => { if (ta) S.caret = ta.selectionEnd; };
  function fieldEdit(f: HTMLTextAreaElement | HTMLInputElement, value: string, caret: number) {
    f.value = value; try { f.setSelectionRange(caret, caret); } catch (e) {}
    f.dispatchEvent(new Event('input', { bubbles: true }));
  }
  const isPat = (f: any) => f === ta;
  function typeChar(f: any, ch: string) {
    const a = f.selectionStart, b = f.selectionEnd, v = f.value;
    if (isPat(f)) {
      if (PAIRS[ch]) {
        if (b > a) { fieldEdit(f, v.slice(0, a) + ch + v.slice(a, b) + PAIRS[ch] + v.slice(b), b + 2); return; }
        fieldEdit(f, v.slice(0, a) + ch + PAIRS[ch] + v.slice(a), a + 1); return;
      }
      if ((ch === ')' || ch === ']' || ch === '}') && a === b && v[a] === ch && v[a - 1] !== '\\') { f.setSelectionRange(a + 1, a + 1); S.caret = a + 1; return; }
    }
    fieldEdit(f, v.slice(0, a) + ch + v.slice(b), a + ch.length);
  }
  function typeVariant(f: any, open: string, close?: string) {
    const a = f.selectionStart, b = f.selectionEnd, v = f.value;
    if (close && isPat(f)) { fieldEdit(f, v.slice(0, a) + open + v.slice(a, b) + close + v.slice(b), a + open.length + (b > a ? b - a : 0)); return; }
    fieldEdit(f, v.slice(0, a) + open + v.slice(b), a + open.length);
  }
  function onBeforeInput(e: InputEvent) {
    if (e.isComposing || !ta) return;
    if (e.inputType === 'insertText' && e.data && e.data.length === 1 && '([{)]}'.includes(e.data)) { e.preventDefault(); typeChar(ta, e.data); }
    else if (e.inputType === 'deleteContentBackward' && ta.selectionStart === ta.selectionEnd) {
      const a = ta.selectionStart, v = ta.value;
      if (a > 0 && PAIRS[v[a - 1]] === v[a]) { e.preventDefault(); fieldEdit(ta, v.slice(0, a - 1) + v.slice(a + 1), a - 1); }
    }
  }
  function onKeydown(e: KeyboardEvent) {
    const k = e.key.toLowerCase(), mod = e.ctrlKey || e.metaKey;
    if (mod && !e.shiftKey && k === 'z') { e.preventDefault(); doUndo(); }
    else if (mod && (k === 'y' || (e.shiftKey && k === 'z'))) { e.preventDefault(); doRedo(); }
  }
  function onFocus() { lastField = ta; S.edFocus = true; clearSel(); track(); }
  // 블록 선택·팔레트 삽입이 요청한 선택 영역을 입력창에 반영한다
  $effect(() => {
    const r = S.selReq;
    if (!r.n || !ta) return;
    try { ta.setSelectionRange(r.a, r.b); } catch (e) {}
  });

  // ---- 입력 키(터치 기기, 또는 설정에서 항상 표시) ----
  const KEYS = ['\\', '^', '$', '.', '|', '?', '*', '+', '(', ')', '[', ']', '{', '}', '-', ','];
  const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  const showKeys = $derived(S.settings.kbAlways || coarse);
  const vmap = $derived.by((): Record<string, string[][]> => {
    const py = S.engine === 'py';
    return {
      '\\': [['\\d'], ['\\w'], ['\\s'], ['\\b'], ['\\D'], ['\\W'], ['\\S'], ['\\B'], ['\\.'], ['\\n'], ['\\t']],
      '*': [['*?']], '+': [['+?']].concat(py ? [['++']] : []), '?': [['??']],
      '(': [['(?:', ')'], ['(?=', ')'], ['(?!', ')'], ['(?<=', ')'], ['(?<!', ')'], [py ? '(?P<name>' : '(?<name>', ')']],
      '[': [['[가-힣]'], ['[a-zA-Z]'], ['[0-9]'], ['[^', ']'], ['[ㄱ-ㅎ]']],
      '{': [['{1,}'], ['{2,3}'], ['{3}']], '.': [['.*'], ['.+'], ['.*?']], '^': [['[^', ']']],
    };
  });
  let lastField: any = null;
  let variants = $state<string[][] | null>(null);
  let downKey = $state('');
  let timer: any = 0, long = false;
  function target(): any {
    const a = document.activeElement;
    if (a && (a === ta || a === ed.repl)) return a;
    return (lastField && lastField.isConnected && lastField) || ta;
  }
  function keyDown(k: string) {
    long = false; downKey = k;
    if (vmap[k]) timer = setTimeout(() => { long = true; downKey = ''; variants = vmap[k]; }, 380);
  }
  function keyUp(k: string, fire: boolean) { clearTimeout(timer); downKey = ''; if (fire && !long) typeChar(target(), k); }
  function moveCaret(d: number) {
    const f = target(); const p = Math.max(0, Math.min(f.value.length, (d < 0 ? f.selectionStart : f.selectionEnd) + d));
    f.setSelectionRange(p, p); if (isPat(f)) S.caret = p;
  }
  function backspace() {
    const f = target(), a = f.selectionStart, b = f.selectionEnd, v = f.value;
    if (a !== b) fieldEdit(f, v.slice(0, a) + v.slice(b), a);
    else if (a > 0) { const pair = isPat(f) && PAIRS[v[a - 1]] === v[a]; fieldEdit(f, v.slice(0, a - 1) + v.slice(a + (pair ? 1 : 0)), a - 1); }
  }
  const noBlur = (e: Event) => e.preventDefault();
  $effect(() => {
    const onFocusIn = (e: FocusEvent) => { if (e.target === ed.repl) lastField = ed.repl; };
    document.addEventListener('focusin', onFocusIn);
    return () => document.removeEventListener('focusin', onFocusIn);
  });
</script>

<section class="card pcard" class:open={S.toolsOpen} aria-label="패턴 작성">
  <div class="card-h pcard-h">
    <h2>패턴</h2>
    <div class="row">
      {#if V.error}
        <span class="count bad">오류</span>
      {:else}
        <span class="count" class:zero={!count} class:busy={R.busy} bind:this={badge}>일치 {count}{count >= 2000 ? '개 이상' : '개'}</span>
      {/if}
      <button class="btn sm ico icon-btn" type="button" aria-label="되돌리기" title="되돌리기 (Ctrl+Z)" disabled={!S.canUndo} onclick={doUndo}>↶</button>
      <button class="btn sm ico icon-btn" type="button" aria-label="다시 실행" title="다시 실행 (Ctrl+Y)" disabled={!S.canRedo} onclick={doRedo}>↷</button>
      <button class="btn sm" type="button" aria-expanded={S.toolsOpen} aria-controls="toolsBody" onclick={() => setToolsOpen(!S.toolsOpen)}>블록 도구 {S.toolsOpen ? '접기' : '펼치기'}</button>
    </div>
  </div>

  <div class="flags" role="group" aria-label="플래그 (전체에 적용)">
    {#each FLAG_DEFS[S.engine] as [c, lab, tip] (c)}
      <button class="flag" type="button" aria-pressed={S.flags.includes(c)} title={tip} onclick={() => toggleFlag(c)}><code>{c}</code> {lab}</button>
    {/each}
  </div>

  <HiArea
    cls="pat" value={S.pattern} {parts} bind:el={ta} invalid={!!V.error} rows={1}
    aria-label="패턴" aria-describedby="patStatus" aria-invalid={!!V.error} placeholder="정규식을 직접 입력하세요  예: \d&#123;3&#125;-\d&#123;4&#125;"
    oninput={onInput} onbeforeinput={onBeforeInput} onkeydown={onKeydown} onkeyup={track} onclick={track} onselect={track}
    onfocus={onFocus} onblur={() => { track(); S.edFocus = false; }}
  />
  <div class="pstatus" id="patStatus">
    {#if V.error}
      <span class="errmsg" role="alert">{V.error}</span>
    {:else if hint}
      <code>{hint.code}</code><span>{hint.text}</span>
    {:else if !S.pattern}
      <span class="muted">패턴을 직접 입력하거나, 블록 도구에서 블록을 끌어다 조립하세요.</span>
    {:else}
      <span class="muted">블록 {V.tree.children.length}개{V.gInfo.count ? ' · 캡처 그룹 ' + V.gInfo.count + '개' : ''} · 입력창에 커서를 두면 그 자리의 뜻을 보여 줍니다</span>
    {/if}
  </div>

  {#if showKeys}
    {#if variants}
      <div class="variants">
        {#each variants as [open, close]}
          <button class="key" type="button" tabindex="-1" onmousedown={noBlur} onclick={() => { variants = null; typeVariant(target(), open, close); }}>{close ? open + close : open}</button>
        {/each}
        <button class="key fn" type="button" tabindex="-1" onmousedown={noBlur} onclick={() => (variants = null)}>취소</button>
      </div>
    {/if}
    <div class="keys" aria-label="기호 입력 키">
      {#each KEYS as k}
        <button
          class="key" class:down={downKey === k} class:has-v={!!vmap[k]} type="button" tabindex="-1" aria-label={k}
          onmousedown={noBlur} oncontextmenu={noBlur}
          onpointerdown={() => keyDown(k)} onpointerup={() => keyUp(k, true)} onpointercancel={() => keyUp(k, false)}
          onpointerleave={() => { clearTimeout(timer); downKey = ''; }}
        >{k}</button>
      {/each}
      <button class="key fn" type="button" tabindex="-1" aria-label="왼쪽" onmousedown={noBlur} onclick={() => moveCaret(-1)}>◀</button>
      <button class="key fn" type="button" tabindex="-1" aria-label="오른쪽" onmousedown={noBlur} onclick={() => moveCaret(1)}>▶</button>
      <button class="key fn wide" type="button" tabindex="-1" aria-label="글자 지우기" onmousedown={noBlur} onclick={backspace}>지움</button>
    </div>
  {/if}

  {#if S.toolsOpen}
    <div id="toolsBody" class="tools" in:slideFx out:slideFx>
      <BlockBoard />
    </div>
  {/if}
</section>
