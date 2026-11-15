<script lang="ts">
  import { onMount } from 'svelte';
  import { S, init, setEngine, openSheet, loadPy, doUndo, doRedo, duplicateSel, wrapSel } from './lib/app.svelte';
  import { slideFx } from './lib/motion/motion.svelte';
  import PresetCard from './components/PresetCard.svelte';
  import PatternCard from './components/PatternCard.svelte';
  import ExplainCard from './components/ExplainCard.svelte';
  import PreviewCard from './components/PreviewCard.svelte';
  import ReplaceCard from './components/ReplaceCard.svelte';
  import MatchList from './components/MatchList.svelte';
  import TestsCard from './components/TestsCard.svelte';
  import ExportCard from './components/ExportCard.svelte';
  import Toasts from './components/Toasts.svelte';
  import SheetHost from './sheets/SheetHost.svelte';

  let ready = $state(false);
  onMount(() => { init().then(() => { ready = true; }); });

  function onKey(e: KeyboardEvent) {
    // 입력칸 안에서는 그 칸의 기본 동작(글자 단위 되돌리기 등)을 따른다
    const el = e.target as HTMLElement | null;
    const typing = !!el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName));
    const mod = (e.ctrlKey || e.metaKey) && !e.altKey, k = e.key.toLowerCase();
    if (mod && !typing && !e.defaultPrevented) {
      if (k === 'z' && !e.shiftKey) { e.preventDefault(); doUndo(); return; }
      if (k === 'y' || (k === 'z' && e.shiftKey)) { e.preventDefault(); doRedo(); return; }
      if (S.selPath && !S.sheet) {
        if (k === 'd' && !e.shiftKey) { e.preventDefault(); duplicateSel(); return; }
        if (k === 'g') { e.preventDefault(); wrapSel(e.shiftKey ? '(?:' : '('); return; }
      }
    }
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      if (!(S.sheet && S.sheet.kind === 'pal')) openSheet('pal');
    }
  }
  const pyNote = $derived(S.engine === 'py' && (S.pyState === 'loading' || S.pyState === 'failed') ? S.pyState : '');
</script>

<svelte:window onkeydown={onKey} />

<div class="app">
  <header class="top">
    <div class="brand"><h1>정규식 작업대</h1></div>
    <div class="seg" role="group" aria-label="정규식 방언">
      <button type="button" aria-pressed={S.engine === 'js'} onclick={() => setEngine('js')}>JavaScript</button>
      <button type="button" aria-pressed={S.engine === 'py'} onclick={() => setEngine('py')}>Python</button>
    </div>
    <button class="btn" type="button" onclick={() => openSheet('menu')}>내역 · 백업 · 설정</button>
  </header>

  {#if pyNote}
    <div class="status" role="status" aria-live="polite" in:slideFx out:slideFx>
      {#if pyNote === 'loading'}
        <span>Python 엔진을 불러오는 중입니다… (처음 한 번만, 약 14MB) 그동안은 JavaScript 엔진으로 근사한 결과가 표시됩니다.</span>
        <span class="bar"><i></i></span>
      {:else}
        <span>Python 엔진을 불러오지 못했습니다{S.pyError ? ' (' + S.pyError + ')' : ''}. 연결을 확인하고 다시 시도해 주세요. 그동안은 JavaScript 엔진으로 근사한 결과가 표시됩니다.</span>
        <button class="btn sm" type="button" onclick={loadPy}>다시 시도</button>
      {/if}
    </div>
  {/if}

  {#if ready}
    <main class="cols">
      <div class="col-a">
        <PresetCard />
        <PatternCard />
        <ExplainCard />
      </div>
      <div class="col-b">
        <PreviewCard />
        <ReplaceCard />
        <MatchList />
        <TestsCard />
        <ExportCard />
      </div>
    </main>
  {/if}
</div>

<SheetHost />
<Toasts />
