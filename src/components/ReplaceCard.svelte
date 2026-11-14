<script lang="ts">
  // 치환 카드: 접으면 요약 한 줄, 펼치면 입력·보조 키·결과
  import { tick } from 'svelte';
  import { S, V, R, ed, setRepl, setUseRepl, copyText, recordHistory } from '../lib/app.svelte';
  import { slideFx } from '../lib/motion/motion.svelte';

  const toks = $derived(
    S.engine === 'py' ? ['\\1', '\\2', '\\3', '\\g<', '>', '\\\\', '\\n'] : ['$1', '$2', '$3', '$&', '$<', '>', '$$'],
  );
  const hint = $derived(
    S.engine === 'py'
      ? 'Python 방식: \\1 또는 \\g<이름>. 여기에 $1 로 써도 Python 형식으로 변환해 적용합니다.'
      : 'JavaScript 방식: $1, $<이름>, $& (일치 전체), $$ ($ 문자)',
  );
  const res = $derived(R.last && R.last.res);
  const summary = $derived(
    S.useRepl ? '바꿀 문자열: ' + (S.repl === '' ? '(빈 문자열 — 일치한 부분을 지움)' : S.repl) : '사용 안 함',
  );

  /** 치환 입력창을 앱에 등록한다(마운트 때 대입, 해제 때 null) */
  function register(node: HTMLInputElement) {
    ed.repl = node;
    return { destroy() { if (ed.repl === node) ed.repl = null; } };
  }

  async function insertToken(t: string) {
    const f = ed.repl;
    if (!f) return;
    const a = f.selectionStart == null ? f.value.length : f.selectionStart;
    const b = f.selectionEnd == null ? a : f.selectionEnd;
    setRepl(f.value.slice(0, a) + t + f.value.slice(b));
    await tick();
    f.setSelectionRange(a + t.length, a + t.length);
  }
  function copyResult() {
    if (res && res.replaced != null) { copyText(res.replaced, '치환 결과를 복사했습니다'); recordHistory(); }
  }
</script>

<section class="card" aria-label="치환">
  <div class="card-h">
    <h2>치환</h2>
    <button class="btn sm" type="button" aria-expanded={S.open.repl} onclick={() => (S.open.repl = !S.open.repl)}>
      {S.open.repl ? '접기' : '펼치기'}
    </button>
  </div>
  {#if !S.open.repl}
    <div><span class="small muted">{summary}</span></div>
  {:else}
    <div in:slideFx out:slideFx>
      <label class="small usel">
        <input type="checkbox" checked={S.useRepl} onchange={(e) => setUseRepl(e.currentTarget.checked)} /> 치환 결과 보기
      </label>
      <label class="l" for="repl">치환 문자열</label>
      <input
        id="repl" class="in" type="text" spellcheck="false" autocapitalize="off" autocorrect="off" autocomplete="off"
        placeholder="예: $1-$2  (이름 그룹은 $&lt;이름&gt;)" value={S.repl} use:register
        oninput={(e) => setRepl(e.currentTarget.value)}
      />
      <div class="rkeys" aria-label="치환 문자열 입력 보조">
        {#each toks as t}
          <button class="key rk" type="button" tabindex="-1" aria-label={t}
            onmousedown={(e) => e.preventDefault()} onclick={() => insertToken(t)}>{t}</button>
        {/each}
      </div>
      <div class="small muted hint">{hint}</div>
      {#if S.useRepl && res && !V.error && (res.replError || res.replaced != null)}
        <div>
          <span class="l">치환 결과</span>
          <div class="out" class:err={!!res.replError}>{res.replError ? '치환 오류: ' + res.replError : res.replaced}</div>
          {#if !res.replError}
            <div class="row" style="margin-top:6px"><button class="btn sm" type="button" onclick={copyResult}>결과 복사</button></div>
          {/if}
        </div>
      {/if}
    </div>
  {/if}
</section>

<style>
  .usel { display: flex; gap: 6px; align-items: center; margin-bottom: 10px; }
  .hint { margin: 4px 0 10px; }
  .err { color: var(--bad); }
</style>
