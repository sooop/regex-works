<script lang="ts">
  // 프리셋 검색 팔레트(kind 'pal', Ctrl/Cmd+K): 검색 입력 + 목록, 키보드·마우스로 고른다.
  import { S, BUILTIN_PRESETS, closeSheet, selectPreset } from '../lib/app.svelte';

  type Entry = { id: string; name: string; desc: string; cat: string; pat: string; group: string; hay: string };

  let q = $state('');
  let active = $state(0);

  const mapP = (p: any, g: string): Entry => ({ id: p.id, name: p.name, desc: p.desc, cat: p.cat || '', pat: p.pattern, group: g, hay: (p.name + ' ' + p.desc + ' ' + (p.cat || '') + ' ' + p.pattern).toLowerCase() });
  const entries = $derived<Entry[]>(
    [{ id: 'new', name: '+ 새로 시작...', desc: '빈 패턴에서 시작', cat: '', pat: '', group: '', hay: '새로 시작 new 빈 작업대' }]
      .concat(S.userPresets.map((p) => mapP(p, '내 프리셋')), BUILTIN_PRESETS.map((p: any) => mapP(p, '기본 프리셋'))),
  );
  const words = $derived(q.toLowerCase().split(/\s+/).filter(Boolean));
  const shown = $derived(entries.filter((e) => words.every((w) => e.hay.includes(w))));
  const cur = $derived(Math.min(active, Math.max(0, shown.length - 1)));

  /** 검색어와 겹치는 부분을 {text, hit} 조각으로 나눈다 */
  function highlightWords(text: string, ws: string[]): { text: string; hit: boolean }[] {
    if (!ws.length) return [{ text, hit: false }];
    const low = text.toLowerCase(), hits: [number, number][] = [];
    ws.forEach((w) => { let p = 0; while ((p = low.indexOf(w, p)) >= 0) { hits.push([p, p + w.length]); p += w.length; } });
    hits.sort((a, b) => a[0] - b[0]);
    const out: { text: string; hit: boolean }[] = []; let i = 0;
    hits.forEach(([a, b]) => { if (a < i) return; if (a > i) out.push({ text: text.slice(i, a), hit: false }); out.push({ text: text.slice(a, b), hit: true }); i = b; });
    if (i < text.length) out.push({ text: text.slice(i), hit: false });
    return out;
  }

  function focusOnMount(node: HTMLElement) { node.focus(); }
  function choose(id: string) { closeSheet(); selectPreset(id); }

  function onkeydown(e: KeyboardEvent) {
    if (!shown.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); active = (cur + 1) % shown.length; }
    else if (e.key === 'ArrowUp') { e.preventDefault(); active = (cur - 1 + shown.length) % shown.length; }
    else if (e.key === 'Home') { e.preventDefault(); active = 0; }
    else if (e.key === 'End') { e.preventDefault(); active = shown.length - 1; }
    else if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); choose(shown[cur].id); }
  }

  // 활성 항목이 바뀌면 보이는 곳까지만 스크롤한다
  $effect(() => {
    const i = cur;
    if (!shown.length) return;
    document.getElementById('pal-' + i)?.scrollIntoView({ block: 'nearest' });
  });
</script>

{#snippet hl(text: string)}{#each highlightWords(text, words) as p}{#if p.hit}<mark class="sr">{p.text}</mark>{:else}{p.text}{/if}{/each}{/snippet}

<div>
  <input class="in pal-in" type="search" placeholder="프리셋 검색 (이름, 설명, 패턴)" aria-label="프리셋 검색" role="combobox" aria-expanded="true" aria-controls="palList"
    aria-activedescendant={shown.length ? 'pal-' + cur : ''} autocapitalize="off" autocorrect="off" spellcheck="false"
    value={q} oninput={(e) => { q = e.currentTarget.value; active = 0; }} {onkeydown} use:focusOnMount />
  <div class="pal-list" id="palList" role="listbox">
    {#each shown as e, i (e.id)}
      {#if e.group && e.group !== (shown[i - 1]?.group ?? '')}
        <div class="pal-g">{e.group}</div>
      {/if}
      <div class="pal-item" class:on={i === cur} role="option" id={'pal-' + i} aria-selected={i === cur} tabindex="-1"
        onclick={() => choose(e.id)} onkeydown={null} onmousemove={() => { if (active !== i) active = i; }}>
        <div class="pal-top">
          <span class="pal-n">{@render hl(e.name)}</span>
          {#if e.id === S.presetId}<span class="pal-cur">사용 중</span>{/if}
          {#if e.cat && e.id !== 'new'}<span class="pal-cat">{e.cat}</span>{/if}
        </div>
        {#if e.desc}<div class="pal-d">{e.desc}</div>{/if}
        {#if e.pat}<code class="pal-p">{@render hl(e.pat)}</code>{/if}
      </div>
    {/each}
    {#if !shown.length}
      <div class="pal-empty">일치하는 프리셋이 없습니다. 검색어를 바꿔 보세요.</div>
    {/if}
  </div>
  <div class="pal-foot"><span>내 프리셋 {S.userPresets.length} · 기본 {BUILTIN_PRESETS.length}</span></div>
</div>
