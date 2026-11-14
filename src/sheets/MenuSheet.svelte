<script lang="ts">
  // 내역과 백업 시트(kind 'menu'): 내역 검색·불러오기·삭제, 백업 내보내기·가져오기, 보기 설정.
  import { flip } from 'svelte/animate';
  import { S, closeSheet, copyText, backupJson, saveBackupFile, doImport, deleteHistoryItem, clearHistory, loadHistoryItem, setSetting } from '../lib/app.svelte';
  import { flipFx, listFx, removeFx } from '../lib/motion/motion.svelte';

  const PAGE = 20;
  let shown = $state(PAGE);
  let confirmClear = $state(false);
  let importRes = $state<{ ok: boolean; msg: string } | null>(null);
  let pasteText = $state('');

  const words = $derived(S.histQuery.toLowerCase().split(/\s+/).filter(Boolean));
  const items = $derived(S.history.filter((h) => words.every((w) => (h.pattern + ' ' + h.flags + ' ' + h.repl).toLowerCase().includes(w))));
  const visible = $derived(items.slice(0, shown));

  /** 검색어와 겹치는 부분을 표시하기 위해 {text, hit} 조각으로 나눈다 */
  function pieces(text: string, ws: string[]): { text: string; hit: boolean }[] {
    if (!ws.length) return [{ text, hit: false }];
    const low = text.toLowerCase(), hits: [number, number][] = [];
    ws.forEach((w) => { let p = 0; while ((p = low.indexOf(w, p)) >= 0) { hits.push([p, p + w.length]); p += w.length; } });
    hits.sort((a, b) => a[0] - b[0]);
    const out: { text: string; hit: boolean }[] = []; let i = 0;
    hits.forEach(([a, b]) => { if (a < i) return; if (a > i) out.push({ text: text.slice(i, a), hit: false }); out.push({ text: text.slice(a, b), hit: true }); i = b; });
    if (i < text.length) out.push({ text: text.slice(i), hit: false });
    return out;
  }

  // 항목 삭제 단추로 지울 때만 '무엇이 지워지는지' 보여 주는 삭제 연출을 쓰고, 검색으로 걸러질 때는 목록 사라짐을 쓴다
  let byDelete = false;
  function histOut(node: Element, _p: unknown, o: any) {
    return byDelete ? removeFx(node, { collapse: true }, o) : listFx(node, undefined, o);
  }
  function removeItem(id: string) {
    byDelete = true;
    deleteHistoryItem(id);
    setTimeout(() => { byDelete = false; }, 100);
  }

  function onSearch(e: Event) {
    const inp = e.currentTarget as HTMLInputElement;
    if ((e as InputEvent).isComposing) return; // 한글 조합 중에는 반영하지 않는다
    S.histQuery = inp.value; shown = PAGE;
  }
  function onSearchEnd(e: Event) { S.histQuery = (e.currentTarget as HTMLInputElement).value; shown = PAGE; }

  function fmt(t: number) { return new Date(t).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }); }

  async function onFile(e: Event) {
    const inp = e.currentTarget as HTMLInputElement;
    const f = inp.files && inp.files[0];
    if (!f) return;
    if (f.size > 5e6) { importRes = { ok: false, msg: '파일이 너무 큽니다(5MB 초과).' }; return; }
    importRes = doImport(await f.text());
    inp.value = '';
  }
  function importPaste() { importRes = doImport(pasteText); }

  const THEMES: ['system' | 'light' | 'dark', string][] = [['system', '시스템'], ['light', '밝게'], ['dark', '어둡게']];
</script>

<div>
  <h3>내역과 백업</h3>
  <div class="sub">내역은 복사하거나 프리셋을 저장할 때 기록됩니다. 데이터는 이 브라우저에만 저장되며 브라우저 데이터를 지우면 사라집니다. 다른 기기로 옮기려면 백업을 내보내세요.</div>

  <div class="sec">
    <h4>최근 작성한 패턴 ({S.history.length})</h4>
    <input class="in" type="search" value={S.histQuery} placeholder="내역 검색 (공백으로 여러 단어)" style="font-family:var(--font);font-size:14px" aria-label="내역 검색"
      oninput={onSearch} oncompositionend={onSearchEnd} />
    <div class="hist">
      {#each visible as h (h.id)}
        <div class="hitem" animate:flip={flipFx()} out:histOut>
          <code>{#each pieces(h.pattern, words) as p}{#if p.hit}<mark class="sr">{p.text}</mark>{:else}{p.text}{/if}{/each}</code>
          <div class="row small muted">
            <span>{(h.engine === 'py' ? 'Python' : 'JS') + (h.flags ? ' · 플래그 ' + h.flags : '') + (h.useRepl ? ' · 치환 있음' : '')}</span>
            <span>{fmt(h.t)}</span>
          </div>
          <div class="btnrow">
            <button class="btn sm primary" type="button" onclick={() => loadHistoryItem(h)}>불러오기</button>
            <button class="btn sm" type="button" onclick={() => copyText(h.pattern)}>패턴 복사</button>
            <button class="btn sm danger" type="button" onclick={() => removeItem(h.id)}>삭제</button>
          </div>
        </div>
      {/each}
      {#if !items.length}
        <div class="small muted">{S.history.length ? '검색 결과가 없습니다.' : '아직 내역이 없습니다. 코드나 패턴을 복사하거나 프리셋을 저장하면 기록됩니다.'}</div>
      {/if}
      {#if items.length > shown}
        <button class="btn sm" type="button" onclick={() => { shown += PAGE; }}>더 보기 ({items.length - shown}개 남음)</button>
      {/if}
    </div>
    <div class="btnrow" style="margin-top:8px">
      {#if confirmClear}
        <button class="btn danger sm" type="button" onclick={() => { clearHistory(); confirmClear = false; }}>정말 내역 {S.history.length}개를 모두 삭제</button>
        <button class="btn sm" type="button" onclick={() => { confirmClear = false; }}>취소</button>
      {:else if S.history.length}
        <button class="btn sm" type="button" onclick={() => { confirmClear = true; }}>내역 전체 삭제</button>
      {/if}
    </div>
  </div>

  <div class="sec">
    <h4>백업 (내 프리셋 {S.userPresets.length} · 내역 {S.history.length})</h4>
    <div class="btnrow">
      <button class="btn sm primary" type="button" onclick={saveBackupFile}>파일로 저장</button>
      <button class="btn sm" type="button" onclick={() => copyText(backupJson(), '백업 JSON을 복사했습니다')}>JSON 복사</button>
    </div>
    <label class="l" for="impFile" style="margin-top:10px">가져오기</label>
    <input id="impFile" type="file" accept=".json,application/json" aria-label="백업 파일 선택" onchange={onFile} />
    <div style="height:8px"></div>
    <textarea class="in" rows="3" placeholder="백업 JSON을 붙여넣기" style="font-size:13px" aria-label="백업 JSON 붙여넣기" bind:value={pasteText}></textarea>
    <div class="btnrow" style="margin-top:6px">
      <button class="btn sm" type="button" onclick={importPaste}>붙여넣은 내용 가져오기</button>
    </div>
    <div class="small" style="margin-top:6px" role="status" style:color={importRes ? (importRes.ok ? 'var(--good)' : 'var(--bad)') : null}>{importRes ? importRes.msg : ''}</div>
  </div>

  <div class="sec">
    <h4>보기 설정</h4>
    <div class="btnrow">
      <span class="small muted" style="align-self:center">애니메이션</span>
      <button class="opt" type="button" aria-pressed={S.settings.anim} onclick={() => setSetting('anim', true)}>켬</button>
      <button class="opt" type="button" aria-pressed={!S.settings.anim} onclick={() => setSetting('anim', false)}>끔</button>
    </div>
    <div class="btnrow" style="margin-top:8px">
      <span class="small muted" style="align-self:center">테마</span>
      {#each THEMES as [k, l] (k)}
        <button class="opt" type="button" aria-pressed={S.settings.theme === k} onclick={() => setSetting('theme', k)}>{l}</button>
      {/each}
    </div>
    <div class="btnrow" style="margin-top:8px">
      <button class="opt" type="button" aria-pressed={S.settings.kbAlways} title="터치 기기가 아니어도 패턴 입력창에서 입력 바를 보여 줍니다"
        onclick={() => setSetting('kbAlways', !S.settings.kbAlways)}>입력 키 항상 표시</button>
    </div>
  </div>

  <div class="btnrow" style="margin-top:14px">
    <button class="btn primary" type="button" onclick={closeSheet}>닫기</button>
  </div>
</div>
