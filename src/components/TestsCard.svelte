<script lang="ts">
  // 통과/실패 검증 카드: 요약·경고는 접혀 있어도 보이고, 입력과 줄별 결과는 펼쳤을 때만 보인다
  import { S, R, setMust, setMustNot, setTestMode, warnings } from '../lib/app.svelte';
  import { slideFx } from '../lib/motion/motion.svelte';

  const t = $derived(R.tests);
  const warns = $derived(warnings());
  /** 요약 한 줄: 문구와 상태(muted/ok/bad/plain) */
  const sum = $derived.by(() => {
    if (t.state === 'idle') return { text: '검증할 문장을 입력하면 패턴을 고칠 때마다 자동으로 통과 여부를 확인합니다.', cls: 'muted' };
    if (t.state === 'nopattern') return { text: '패턴이 비어 있습니다.', cls: '' };
    if (t.state === 'error') return { text: '검증하지 못했습니다: ' + t.error, cls: 'bad' };
    return t.pass === t.total
      ? { text: '모두 통과 (' + t.total + '/' + t.total + ')', cls: 'ok' }
      : { text: '통과 ' + t.pass + ' / 전체 ' + t.total, cls: 'bad' };
  });
</script>

{#snippet summary()}
  <div class="sumline {sum.cls}" class:plain={sum.cls === 'muted'}>{sum.text}</div>
{/snippet}

<section class="card" aria-label="검증">
  <div class="card-h">
    <h2>통과 / 실패 검증</h2>
    <div class="row">
      {#if S.open.tests}
        <div class="seg" role="group" aria-label="검증 방식">
          <button type="button" aria-pressed={S.testMode === 'search'} onclick={() => setTestMode('search')}>일부 일치</button>
          <button type="button" aria-pressed={S.testMode === 'full'} onclick={() => setTestMode('full')}>전체 일치</button>
        </div>
      {/if}
      <button class="btn sm" type="button" aria-expanded={S.open.tests} onclick={() => (S.open.tests = !S.open.tests)}>
        {S.open.tests ? '접기' : '펼치기'}
      </button>
    </div>
  </div>
  {#if !S.open.tests}
    <div class="small">{@render summary()}</div>
  {/if}
  <div class="small muted">
    {#each warns as w}<div class="note">{w}</div>{/each}
  </div>
  {#if S.open.tests}
    <div in:slideFx out:slideFx>
      <div class="tgrid">
        <div>
          <label class="l" for="mustText">일치해야 함 (한 줄에 하나)</label>
          <textarea id="mustText" class="in" rows="4" spellcheck="false" style="font-size:14px" value={S.must} oninput={(e) => setMust(e.currentTarget.value)}></textarea>
          <div class="tlines">
            {#each t.must as r}
              <div class="tl {r.ok ? 'ok' : 'bad'}"><b>{r.ok ? '통과' : '실패'}</b><span>{r.line}</span></div>
            {/each}
          </div>
        </div>
        <div>
          <label class="l" for="mustNotText">일치하면 안 됨 (한 줄에 하나)</label>
          <textarea id="mustNotText" class="in" rows="4" spellcheck="false" style="font-size:14px" value={S.mustnot} oninput={(e) => setMustNot(e.currentTarget.value)}></textarea>
          <div class="tlines">
            {#each t.mustnot as r}
              <div class="tl {r.ok ? 'ok' : 'bad'}"><b>{r.ok ? '통과' : '실패'}</b><span>{r.line}</span></div>
            {/each}
          </div>
        </div>
      </div>
      <div style="margin-top:10px">{@render summary()}</div>
    </div>
  {/if}
</section>

<style>
  .plain { font-weight: 400; color: var(--muted); }
</style>
