<script lang="ts">
  // 복사·저장 카드: 언어별 코드, 패턴·코드 복사, 프리셋 저장·갱신·삭제
  import {
    S, findPreset, isUserPreset, codeFor, setLang, copyText, recordHistory, updateCurrentPreset, openSheet,
  } from '../lib/app.svelte';

  const code = $derived(codeFor(S.lang));
  const p = $derived(findPreset(S.presetId));
  const mine = $derived(!!p && isUserPreset(p.id));
  const langs: [string, string][] = [['js', 'JS'], ['py', 'Python'], ['grep', 'grep']];

  function copyPattern() { copyText(S.pattern, '패턴을 복사했습니다'); recordHistory(); }
  function copyCode() { copyText(code, '코드를 복사했습니다'); recordHistory(); }
</script>

<section class="card" aria-label="복사와 저장">
  <div class="card-h">
    <h2>복사 · 저장</h2>
    <div class="seg" role="group" aria-label="언어">
      {#each langs as [k, l]}
        <button type="button" aria-pressed={S.lang === k} onclick={() => setLang(k as any)}>{l}</button>
      {/each}
    </div>
  </div>
  <div class="code"><pre>{code}</pre></div>
  <div class="row" style="margin-top:10px">
    <button class="btn sm primary" type="button" onclick={copyPattern}>패턴 복사</button>
    <button class="btn sm" type="button" onclick={copyCode}>코드 복사</button>
    <span class="vsep"></span>
    {#if mine && p}
      <button class="btn sm" class:primary={S.dirty} type="button" disabled={!S.dirty} onclick={updateCurrentPreset}>프리셋 갱신</button>
      <button class="btn sm" type="button" onclick={() => openSheet('save', { name: p.name + ' 복사본', desc: p.desc })}>다른 이름으로 저장</button>
    {:else}
      <button class="btn sm" type="button" onclick={() => openSheet('save', { name: p ? p.name + ' (수정)' : '', desc: p ? p.desc : '' })}>프리셋으로 저장</button>
    {/if}
  </div>
  {#if mine && p}
    <div class="row" style="margin-top:6px">
      <button class="btn sm" type="button" onclick={() => openSheet('save', { name: p.name, desc: p.desc, editId: p.id })}>이름·설명 수정</button>
      <button class="btn sm danger" type="button" onclick={() => openSheet('del', { preset: p })}>프리셋 삭제</button>
    </div>
  {/if}
</section>
