<script lang="ts" module>
  export type Part = { text?: string; cls?: string; m?: number; ins?: boolean };
</script>

<script lang="ts">
  // 강조 표시가 있는 입력창: 색을 입힌 <pre> 위에 글자가 투명한 <textarea> 를 같은 격자 칸에 겹친다.
  // 높이는 <pre> 가 정하고 스크롤은 바깥 상자가 하므로 두 층의 스크롤을 맞출 필요가 없다.
  let { value, parts, el = $bindable(null), back = $bindable(null), invalid = false, cls = '', ...rest }:
    { value: string; parts: Part[]; el?: HTMLTextAreaElement | null; back?: HTMLElement | null; invalid?: boolean; cls?: string; [k: string]: any } = $props();
</script>

<div class="hi {cls}" class:err={invalid}>
  <pre class="hi-back" aria-hidden="true" bind:this={back}>{#each parts as p}{#if p.ins}<i class="ins"></i>{:else if p.cls}<span class={p.cls} data-m={p.m}>{p.text}</span>{:else}{p.text}{/if}{/each}{'​'}</pre>
  <textarea class="hi-ta" bind:this={el} {value} spellcheck="false" autocapitalize="off" autocomplete="off" {...rest}></textarea>
</div>
