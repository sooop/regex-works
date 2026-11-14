<script lang="ts">
  // 패턴을 한국어로 풀어 읽어 주는 접이식 카드
  import { V, RX } from '../lib/app.svelte';

  const lines = $derived<any[]>(RX.explainLines(V.tree));
</script>

<details class="explain card">
  <summary>한국어로 읽기</summary>
  <ol>
    {#if !lines.length}
      <li class="muted">아직 설명할 내용이 없습니다.</li>
    {:else}
      {#each lines as l}
        <li><code style="margin-left:{l.d * 16}px">{l.code}</code><span>{l.text}</span></li>
      {/each}
    {/if}
  </ol>
</details>
