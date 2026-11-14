<script lang="ts">
  // 일치 목록: 처음 100개만 보여 주고, 행을 누르면 미리보기가 그 일치로 이동한다
  import { V, R } from '../lib/app.svelte';

  const ms = $derived(V.matches);
  const text: string = $derived(R.last ? R.last.text : '');
  const names = $derived(V.gInfo.names);

  function focusMatch(i: number) {
    window.dispatchEvent(new CustomEvent('rx:focus-match', { detail: i }));
  }
</script>

<section class="card" aria-label="일치 목록">
  <div class="card-h"><h2>일치 목록</h2></div>
  <div class="mlist">
    {#if V.error}
      <div class="small muted">패턴 오류를 고치면 일치 목록이 표시됩니다.</div>
    {:else}
      {#each ms.slice(0, 100) as m, i (i)}
        {@const txt = text.slice(m.s, m.e)}
        <button class="mrow" type="button" onclick={() => focusMatch(i)}>
          <span class="n">#{i + 1}</span>
          <div style="min-width:0">
            <div class="t">{txt === '' ? '(빈 문자열) 위치 ' + m.s : txt}</div>
            {#if m.g.length}
              <div class="gtags">
                {#each m.g as g, k}
                  <span class="gtag" style="border-color:var(--g{(k % 6) + 1})"><i>{names[k + 1] ? names[k + 1] : '그룹 ' + (k + 1)}</i>{g ? text.slice(g[0], g[1]) : '(참여 안 함)'}</span>
                {/each}
              </div>
            {/if}
          </div>
        </button>
      {/each}
      {#if ms.length > 100}
        <div class="small muted">처음 100개만 표시합니다. 나머지는 미리보기에서 확인하세요.</div>
      {/if}
      {#if !ms.length}
        <div class="small muted">일치하는 부분이 없습니다. 패턴이나 예시 텍스트를 바꿔 보세요.</div>
      {/if}
    {/if}
  </div>
</section>

<style>
  button.mrow { text-align: left; width: 100%; font: inherit; color: inherit; cursor: pointer; }
  button.mrow:hover { border-color: var(--accent-text); }
</style>
