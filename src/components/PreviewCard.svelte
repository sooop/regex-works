<script lang="ts">
  // 미리보기: 예시 텍스트를 그 자리에서 편집하고, 일치·그룹 강조가 입력과 동시에 갱신된다.
  import { tick } from 'svelte';
  import { S, V, R, curSample, selectSample, addSample, deleteSample, setSampleText, setSampleName } from '../lib/app.svelte';
  import { flip } from 'svelte/animate';
  import { slideFx, listFx, flipFx } from '../lib/motion/motion.svelte';
  import HiArea, { type Part } from './HiArea.svelte';

  let ta = $state<HTMLTextAreaElement | null>(null);
  let back = $state<HTMLElement | null>(null);
  let nameIn = $state<HTMLInputElement | null>(null);
  let arm = $state('');
  let renaming = $state(false);
  let armTimer: any = 0;

  function buildParts(text: string, matches: any[]): Part[] {
    const out: Part[] = [];
    const marks: any[] = [], empties = new Set<number>();
    matches.slice(0, 500).forEach((m, i) => {
      if (m.e > m.s) marks.push({ s: m.s, e: m.e, m: i % 2, i });
      else empties.add(m.s);
      m.g.forEach((g: any, k: number) => { if (g && g[1] > g[0]) marks.push({ s: g[0], e: g[1], g: (k % 6) + 1, len: g[1] - g[0] }); });
    });
    const pts = new Set<number>([0, text.length]);
    marks.forEach((x) => { pts.add(x.s); pts.add(x.e); }); empties.forEach((p) => pts.add(p));
    const P = Array.from(pts).filter((p) => p >= 0 && p <= text.length).sort((a, b) => a - b);
    marks.sort((a, b) => a.s - b.s);
    for (let i = 0; i < P.length; i++) {
      const a = P[i];
      if (empties.has(a)) out.push({ ins: true });
      const b = P[i + 1]; if (b === undefined || b <= a) continue;
      let mm: any = null, gg: any = null;
      for (const x of marks) {
        if (x.s > a) break;
        if (x.e >= b) { if (x.m !== undefined) mm = x; else if (!gg || x.len < gg.len) gg = x; }
      }
      const t = text.slice(a, b);
      if (mm) out.push({ text: t, cls: 'mk m' + mm.m + (gg ? ' g' + gg.g : ''), m: mm.i });
      else if (gg) out.push({ text: t, cls: 'g' + gg.g });
      else out.push({ text: t });
    }
    return out;
  }
  const text = $derived(curSample().text);
  const parts = $derived.by((): Part[] => {
    const L = R.last, t = text;
    if (!L || V.error) return [{ text: t }];
    let ms = V.matches;
    if (L.text !== t) {
      // 결과가 아직 이전 텍스트 기준이다(실행 대기 중): 바뀌지 않은 앞부분의 일치만 남겨 깜빡임을 줄인다
      let p = 0; const n = Math.min(L.text.length, t.length);
      while (p < n && L.text.charCodeAt(p) === t.charCodeAt(p)) p++;
      ms = ms.filter((m) => m.e <= p && m.g.every((g: any) => !g || g[1] <= p));
    }
    return buildParts(t, ms);
  });
  const count = $derived(V.matches.length);
  const approxWhy = $derived(R.last && R.last.approx && S.engine === 'py' ? (S.pyState === 'loading' ? 'Python 엔진을 불러오는 중이라' : 'Python 엔진을 쓸 수 없어') : '');
  const groups = $derived(Array.from({ length: Math.min(V.gInfo.count, 12) }, (_, k) => ({ n: k + 1, name: V.gInfo.names[k + 1] || '' })));

  function onDelete(i: number) {
    const s = S.samples[i]; if (!s) return;
    if (arm !== s.id) { arm = s.id; clearTimeout(armTimer); armTimer = setTimeout(() => { arm = ''; }, 3000); return; }
    arm = ''; renaming = false; deleteSample(i);
  }
  async function onAdd() { addSample(); renaming = false; await tick(); ta?.focus(); }
  async function rename(i: number) { selectSample(i); renaming = true; await tick(); nameIn?.focus(); nameIn?.select(); }

  // 일치 목록에서 고른 일치로 스크롤하고 한 번 비춘다
  $effect(() => {
    const on = (e: Event) => {
      const el = back?.querySelector<HTMLElement>(`[data-m="${(e as CustomEvent).detail}"]`);
      if (!el) return;
      el.scrollIntoView({ block: 'nearest' });
      Motion.flash(el, 'tidy');
    };
    window.addEventListener('rx:focus-match', on);
    return () => window.removeEventListener('rx:focus-match', on);
  });
</script>

<section class="card" aria-label="미리보기">
  <div class="card-h">
    <h2>미리보기</h2>
    <div class="row">
      <span class="small muted">입력하는 대로 갱신</span>
      {#if V.error}<span class="count bad">오류</span>{:else}<span class="count" class:zero={!count} class:busy={R.busy}>일치 {count}{count >= 2000 ? '개 이상' : '개'}</span>{/if}
    </div>
  </div>

  <div class="stabs" role="tablist" aria-label="예시 텍스트">
    {#each S.samples as s, i (s.id)}
      <div class="stab-wrap" class:sel={i === S.sampleIdx} animate:flip={flipFx()} in:listFx out:listFx>
        <button class="stab" type="button" role="tab" aria-selected={i === S.sampleIdx} title="두 번 누르면 이름 바꾸기" onclick={() => { renaming = false; arm = ''; selectSample(i); }} ondblclick={() => rename(i)}>{s.name}</button>
        {#if S.samples.length > 1}
          <button class="stab-x" class:armed={arm === s.id} type="button" aria-label={s.name + (arm === s.id ? ' 삭제 확인' : ' 삭제')} title={arm === s.id ? '한 번 더 누르면 삭제' : '이 예시 삭제'} onclick={() => onDelete(i)}>
            {#if arm === s.id}삭제?{:else}<svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true"><path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" fill="none" /></svg>{/if}
          </button>
        {/if}
      </div>
    {/each}
    <button class="stab add" type="button" onclick={onAdd}>+ 예시 추가</button>
  </div>

  {#if renaming}
    <div in:slideFx out:slideFx>
      <input class="in nm" type="text" aria-label="예시 이름" placeholder="예시 이름" maxlength="40" bind:this={nameIn} value={curSample().name}
        oninput={(e) => setSampleName(e.currentTarget.value)} onblur={() => (renaming = false)} onkeydown={(e) => { if (e.key === 'Enter' || e.key === 'Escape') { e.stopPropagation(); renaming = false; } }} />
    </div>
  {/if}

  {#key curSample().id}
    <HiArea cls="view" value={text} {parts} bind:el={ta} bind:back rows={4} aria-label="예시 텍스트" placeholder="여기에 예시 텍스트를 입력하거나 붙여 넣으세요" oninput={(e: Event) => setSampleText((e.currentTarget as HTMLTextAreaElement).value)} />
  {/key}

  {#if groups.length && !V.error}
    <div class="glegend" aria-label="그룹 색">
      {#each groups as g (g.n)}<span class="gtag" style="border-color:var(--g{((g.n - 1) % 6) + 1})"><i>{g.name || '그룹 ' + g.n}</i></span>{/each}
      <span class="small muted">그룹은 색 밑줄로 표시됩니다</span>
    </div>
  {/if}
  {#if approxWhy}
    <div class="note">{approxWhy} JavaScript 엔진으로 근사한 결과입니다.{R.last.notes.length ? ' (' + R.last.notes.join(', ') + ')' : ''} 문법이 같은 부분은 거의 동일하게 보입니다.</div>
  {/if}
</section>
