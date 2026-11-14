<script lang="ts">
  // 프리셋 카드: 현재 프리셋 이름과 설명, 저장하지 않은 수정 안내
  import { S, BUILTIN_PRESETS, findPreset, isUserPreset, openSheet } from '../lib/app.svelte';

  const p = $derived(findPreset(S.presetId));
  const isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || '');
</script>

<section class="card" aria-label="프리셋">
  <div class="card-h">
    <h2>프리셋</h2>
    <span class="small muted">내 {S.userPresets.length} · 기본 {BUILTIN_PRESETS.length}</span>
  </div>
  <button class="pickbtn" class:is-new={!p} type="button" aria-haspopup="dialog" onclick={() => openSheet('pal')}>
    <span class="pk-l">현재 프리셋</span>
    <span class="pk-n">{p ? p.name : '+ 새로 시작...'}</span>
    <kbd>{isMac ? '⌘K' : 'Ctrl K'}</kbd>
  </button>
  <div class="pinfo">
    {#if p}
      <p>{p.desc || '설명이 없습니다'}</p>
      {#if !isUserPreset(p.id)}
        <div class="small muted">기본 프리셋은 수정해도 원본이 바뀌지 않습니다. 저장하면 내 프리셋이 됩니다.</div>
      {/if}
    {/if}
    {#if S.dirty}
      <div class="small dirty">저장하지 않은 수정이 있습니다.</div>
    {/if}
  </div>
</section>

<style>
  .dirty { color: var(--warn); font-weight: 700; }
</style>
