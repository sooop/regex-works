<script lang="ts">
  // 블록 작업대: 패턴을 중첩 블록으로 보여 주고, 팔레트에서 끌어다 놓거나 블록끼리 끌어 옮겨 조립한다.
  // 문자열이 원본이므로 모든 조작은 app.svelte 의 함수로 문자열을 바꾸고, 블록은 다시 파싱된 트리에서 그려진다.
  import { tick } from 'svelte';
  import {
    S, V, RX, QUANTIFIABLE, paletteTabs, insertItem, tapBlock, selectPath, clearSel, inSel, selN, selNodes, nodeCode, openSheet,
    moveSel, growSel, wrapSel, duplicateSel, deleteSel, moveBlocks, nodesForItem, insertNodesAt, applyQuantTo, pathAt, type Path,
  } from '../lib/app.svelte';
  import { flip } from 'svelte/animate';
  import { listFx, flipFx } from '../lib/motion/motion.svelte';

  let board = $state<HTMLElement | null>(null);
  let rootList = $state<HTMLElement | null>(null);
  let line = $state<HTMLElement | null>(null);
  let trash = $state<HTMLElement | null>(null);

  const key = (p: Path) => p.join('.');
  const toPath = (s: string): Path => (s === '' ? [] : s.split('.').map(Number));
  const disp = (n: any) => (n.raw === ' ' ? '␣' : n.raw.replace(/\n/g, '⏎').replace(/\t/g, '⇥'));
  const caretKey = $derived.by(() => { if (!S.edFocus) return ''; const p = pathAt(S.caret); return p ? key(p) : ''; });
  const tabs = $derived(paletteTabs());
  const curTab = $derived(tabs.find((t) => t.id === S.palTab) || tabs[0]);

  // ---- 끌어 놓기 상태 ----
  /** 끌기 중이거나 방금 놓아 자리 이동이 일어나는 동안: 삽입·삭제 연출을 끈다(고스트의 비행이 그 역할을 한다) */
  let fxOff = $state(false);
  let dragKind = $state<'' | 'blocks' | 'item'>('');
  let src = $state<{ parent: string; lo: number; hi: number } | null>(null);
  let overTrash = $state(false);
  let qOver = $state('');
  let drag: any = null;
  let suppressUntil = 0;

  function isSrc(path: Path) {
    if (!src) return false;
    const i = path[path.length - 1];
    return key(path.slice(0, -1)) === src.parent && i >= src.lo && i < src.hi;
  }
  const blockEl = (p: Path) => board?.querySelector<HTMLElement>(`.blk[data-path="${key(p)}"]`) || null;
  const inside = (r: DOMRect, x: number, y: number, pad = 0) => x >= r.left - pad && x <= r.right + pad && y >= r.top - pad && y <= r.bottom + pad;
  const isQuantItem = (it: any) => it && (it.kind === 'quant' || it.kind === 'lazy' || it.kind === 'poss');

  function onBoardDown(e: PointerEvent) {
    if (e.button !== 0 || e.pointerType === 'touch') return;
    const main = (e.target as HTMLElement).closest('.main');
    const blk = main && (main.closest('.blk') as HTMLElement | null);
    if (!blk) return;
    const path = toPath(blk.dataset.path!);
    let from = path, count = 1;
    if (inSel(path) && selN() > 1) { from = S.selPath!.slice(); count = selN(); }
    begin(e, { kind: 'blocks', from, count });
  }
  function onItemDown(e: PointerEvent, it: any) {
    if (e.button !== 0 || e.pointerType === 'touch' || it.kind === 'literal') return;
    begin(e, { kind: 'item', item: it, el: e.currentTarget });
  }
  function begin(e: PointerEvent, d: any) {
    if (drag) cancel();
    drag = { ...d, x0: e.clientX, y0: e.clientY, px: e.clientX, py: e.clientY, started: false, ghost: null, slot: null, raf: 0 };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', cancel);
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('blur', cancel);
    document.addEventListener('visibilitychange', cancel);
  }
  function unlisten() {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', cancel);
    window.removeEventListener('keydown', onKey, true);
    window.removeEventListener('blur', cancel);
    document.removeEventListener('visibilitychange', cancel);
  }
  function start(e: PointerEvent) {
    const d = drag;
    d.started = true;
    if (d.kind === 'blocks') {
      const base = d.from.slice(0, -1), i0 = d.from[d.from.length - 1];
      d.els = [];
      for (let k = 0; k < d.count; k++) { const el = blockEl(base.concat(i0 + k)); if (el) d.els.push(el); }
      if (!d.els.length) { drag = null; unlisten(); return; }
    } else d.els = [d.el];
    // 고스트는 지금 모습으로 복제하므로 자리표시 스타일을 주기 전에 만든다
    d.ghost = Motion.dragGhost({ items: d.els, pointer: { x: e.clientX, y: e.clientY }, count: d.els.length });
    if (d.kind === 'blocks') src = { parent: key(d.from.slice(0, -1)), lo: d.from[d.from.length - 1], hi: d.from[d.from.length - 1] + d.count };
    document.documentElement.classList.add('mo-dragging');
    dragKind = d.kind; fxOff = true; S.hover = null;
    const loop = () => { if (!drag || drag !== d) return; edgeScroll(); d.raf = requestAnimationFrame(loop); };
    d.raf = requestAnimationFrame(loop);
  }
  function onMove(e: PointerEvent) {
    const d = drag; if (!d) return;
    if (!d.started) { if (Math.hypot(e.clientX - d.x0, e.clientY - d.y0) < 5) return; start(e); if (!drag) return; }
    d.px = e.clientX; d.py = e.clientY;
    d.ghost.move(e.clientX, e.clientY);
    locate();
  }
  /** 작업대 가장자리 48px 안에서는 저절로 스크롤한다 */
  function edgeScroll() {
    const d = drag; if (!d || !board || board.scrollHeight <= board.clientHeight) return;
    const r = board.getBoundingClientRect();
    if (d.px < r.left || d.px > r.right) return;
    let dy = 0;
    if (d.py > r.top - 12 && d.py < r.top + 48) dy = -8; else if (d.py < r.bottom + 12 && d.py > r.bottom - 48) dy = 8;
    if (!dy) return;
    const before = board.scrollTop; board.scrollTop += dy;
    if (board.scrollTop !== before) locate();
  }
  function hideLine() { if (line) line.hidden = true; }
  function showLine(x: number, y: number, h: number) {
    if (!line || !board) return;
    const br = board.getBoundingClientRect();
    const tf = `translate(${Math.round(x - br.left + board.scrollLeft - 1.5)}px, ${Math.round(y - br.top + board.scrollTop)}px)`;
    if (line.hidden) {
      // 처음 나타날 때는 제자리에: 이후에만 자리 사이를 스프링으로 건너간다
      line.style.transition = 'none'; line.style.transform = tf; line.style.height = h + 'px'; line.hidden = false;
      line.getBoundingClientRect(); line.style.transition = '';
    } else { line.style.transform = tf; line.style.height = h + 'px'; }
  }
  /** 포인터 위치에서 놓일 자리(부모 경로 + 인덱스)를 찾아 삽입 선을 옮긴다 */
  function locate() {
    const d = drag; if (!d || !board || !rootList) return;
    const x = d.px, y = d.py;
    const ot = d.kind === 'blocks' && !!trash && inside(trash.getBoundingClientRect(), x, y, 4);
    overTrash = ot;
    if (ot) { d.slot = null; hideLine(); d.ghost.setInto(true); d.ghost.setLabel('삭제'); return; }
    d.ghost.setLabel('');
    const br = board.getBoundingClientRect();
    if (d.kind === 'item' && isQuantItem(d.item)) {
      // 수량은 자리가 아니라 블록 위에 놓는다
      const hit = inside(br, x, y) ? (document.elementFromPoint(x, y)?.closest('.blk') as HTMLElement | null) : null;
      let k = '';
      if (hit && board.contains(hit)) { try { if (QUANTIFIABLE.includes(RX.getNode(V.tree, toPath(hit.dataset.path!)).t)) k = hit.dataset.path!; } catch (e) {} }
      qOver = k; d.ghost.setInto(!!k); d.ghost.setLabel(k ? '수량 붙이기' : '');
      return;
    }
    d.ghost.setInto(false);
    if (!inside(br, x, y, 14)) { d.slot = null; hideLine(); return; }
    let cont: HTMLElement = rootList, parent: Path = [];
    // 문서 순서로 훑으면 마지막에 맞은 것이 가장 안쪽 그룹이다
    board.querySelectorAll<HTMLElement>('.gb').forEach((gb) => { if (inside(gb.getBoundingClientRect(), x, y, 2)) { cont = gb; parent = toPath(gb.dataset.gpath!); } });
    if (d.kind === 'blocks') {
      // 자기 자신 안으로는 옮길 수 없다
      for (let k = 0; k < d.count; k++) {
        const fp = d.from.slice(0, -1).concat(d.from[d.from.length - 1] + k);
        if (RX.samePath(parent, fp) || RX.isInside(parent, fp)) { d.slot = null; hideLine(); return; }
      }
    }
    const kids = Array.from(cont.children).filter((c) => c.classList.contains('blk')) as HTMLElement[];
    if (!kids.length) {
      const cr = cont.getBoundingClientRect();
      d.slot = { parent, idx: 0 }; showLine(cr.left + 5, cr.top + 2, Math.max(22, cr.height - 4)); return;
    }
    const rects = kids.map((k) => k.getBoundingClientRect());
    // 줄(row) 단위로 묶는다: 높이가 다른 블록이 섞여 있어도 같은 줄로 판정한다
    const rows: { a: number; b: number; top: number; bottom: number }[] = [];
    rects.forEach((r, i) => {
      const last = rows[rows.length - 1];
      if (last && r.left > rects[i - 1].left && r.top < last.bottom) { last.b = i + 1; last.top = Math.min(last.top, r.top); last.bottom = Math.max(last.bottom, r.bottom); }
      else rows.push({ a: i, b: i + 1, top: r.top, bottom: r.bottom });
    });
    let row = rows[rows.length - 1];
    for (const rw of rows) { if (y <= rw.bottom + 3) { row = rw; break; } }
    let idx = row.b;
    for (let i = row.a; i < row.b; i++) { if (x < rects[i].left + rects[i].width / 2) { idx = i; break; } }
    d.slot = { parent, idx };
    const lx = idx === row.b ? rects[idx - 1].right + 3 : rects[idx].left - 3;
    showLine(lx, row.top, row.bottom - row.top);
  }
  function clearMarks() {
    cancelAnimationFrame(drag?.raf || 0);
    document.documentElement.classList.remove('mo-dragging');
    hideLine(); overTrash = false; qOver = ''; dragKind = '';
  }
  async function onUp() {
    const d = drag; if (!d) return;
    unlisten();
    if (!d.started) { drag = null; return; } // 끌지 않았다: 클릭으로 처리된다
    suppressUntil = performance.now() + 120;
    const g = d.ghost, slot = d.slot, toTrash = overTrash, q = qOver;
    const lineRect = line && !line.hidden ? line.getBoundingClientRect() : null;
    clearMarks(); drag = null;
    // 데이터는 즉시 바꾸고 연출은 그 위에서 돈다
    if (toTrash) {
      const tr = trash; src = null;
      selectPath(d.from, d.count); deleteSel();
      if (tr) g.into(tr); else g.destroy();
    } else if (q) {
      const el = blockEl(toPath(q));
      if (applyQuantTo(toPath(q), d.item) && el) g.into(el); else g.cancel(d.el);
    } else {
      let ok = !!slot;
      if (ok && d.kind === 'blocks') ok = moveBlocks(d.from, d.count, slot.parent, slot.idx);
      else if (ok) { const nodes = nodesForItem(d.item); ok = !!nodes; if (nodes) insertNodesAt(nodes, slot.parent, slot.idx); }
      if (!ok) { await g.cancel(d.kind === 'blocks' ? d.els[0] : d.el); src = null; fxOff = false; return; }
      src = null;
      await tick();
      // 고스트가 놓은 지점에서 들어갈 자리로 내려앉는 동안 실제 블록은 숨긴다(시한을 걸어 반드시 되돌린다)
      const el = board?.querySelector<HTMLElement>('.blk.sel');
      if (el) {
        el.style.visibility = 'hidden';
        const show = () => { el.style.visibility = ''; };
        const guard = setTimeout(show, 1000);
        g.land(el.getBoundingClientRect()).then(() => { clearTimeout(guard); show(); });
      } else if (lineRect) g.land(lineRect); else g.destroy();
    }
    await tick();
    fxOff = false;
  }
  /** Esc·창 포커스 이동·탭 숨김·포인터 유실: 취소하고 고스트를 원래 자리로 돌려보낸다 */
  function cancel() {
    const d = drag; if (!d) return;
    unlisten(); clearMarks(); drag = null;
    if (!d.started) return;
    suppressUntil = performance.now() + 120;
    d.ghost.cancel(d.kind === 'blocks' ? d.els[0] : d.el).then(() => { src = null; fxOff = false; });
  }
  function onKey(e: KeyboardEvent) { if (e.key === 'Escape' && drag && drag.started) { e.preventDefault(); e.stopPropagation(); cancel(); } }
  $effect(() => () => { if (drag) cancel(); });

  // ---- 블록 조작 ----
  const tap = (path: Path, e: MouseEvent) => { if (performance.now() < suppressUntil) return; tapBlock(path, e.shiftKey); };
  const openNode = (path?: Path) => { if (path) selectPath(path); if (selN() === 1) openSheet('node'); };
  function blockKey(e: KeyboardEvent, path: Path) {
    const k = e.key;
    if (e.altKey && (k === 'ArrowLeft' || k === 'ArrowRight')) { e.preventDefault(); selectPath(path); moveSel(k === 'ArrowLeft' ? -1 : 1); refocus(); return; }
    if (k === 'ArrowLeft' || k === 'ArrowRight') {
      e.preventDefault();
      const all = Array.from(board!.querySelectorAll<HTMLElement>('button.main[data-pk]'));
      const nx = all[all.indexOf(e.currentTarget as HTMLElement) + (k === 'ArrowLeft' ? -1 : 1)];
      if (nx) nx.focus();
    } else if (k === 'Delete' || k === 'Backspace') { e.preventDefault(); if (!inSel(path)) selectPath(path); deleteSel(); }
    else if (k === 'F2' || k === 'e') { e.preventDefault(); openNode(path); }
  }
  /** 키보드로 옮긴 뒤에도 포커스가 그 블록을 따라간다 */
  async function refocus() { await tick(); board?.querySelector<HTMLElement>('.blk.sel > .main, .blk.sel > .gh > .main')?.focus({ preventScroll: true }); }
  const onOver = (e: PointerEvent, n: any) => { e.stopPropagation(); if (!dragKind) S.hover = { a: n.start, b: n.end }; };
  const pickItem = (it: any) => { if (performance.now() < suppressUntil) return; insertItem(it); };
  const noBlur = (e: Event) => e.preventDefault();

  // 선택한 블록이 작업대 안에서 보이도록 스크롤한다
  $effect(() => {
    S.selPath; S.pattern;
    tick().then(() => {
      const el = board?.querySelector('.blk.sel'); if (!el || !board) return;
      const rr = board.getBoundingClientRect(), pr = el.getBoundingClientRect();
      if (pr.bottom > rr.bottom) board.scrollTop += pr.bottom - rr.bottom + 6; else if (pr.top < rr.top) board.scrollTop -= rr.top - pr.top + 6;
    });
  });

  // ---- 선택 막대 ----
  const has = $derived(!!S.selPath);
  const cnt = $derived(selN());
  const selIdx = $derived(S.selPath ? S.selPath[S.selPath.length - 1] : 0);
  const selLen = $derived.by(() => { try { return S.selPath ? RX.listAt(V.tree, S.selPath).length : 0; } catch (e) { return 0; } });
  const selTitle = $derived.by(() => {
    const nodes = selNodes();
    if (!nodes.length) return '블록을 눌러 선택하세요 · 끌어서 옮기기 · 두 번 눌러 세부 설정';
    return (cnt > 1 ? cnt + '개 선택: ' + nodes.map(nodeCode).join('').slice(0, 40) : RX.describe(nodes[0])) + (S.multi ? '  (범위: 끝 블록을 누르세요)' : '');
  });
</script>

{#snippet qbtn(n: any, path: Path)}
  {#if n.q}
    <button class="qbtn" type="button" title={RX.describeQ(n.q)} aria-label={'수량 ' + RX.describeQ(n.q)} onclick={() => openNode(path)}>{n.q}</button>
  {/if}
{/snippet}

{#snippet blocks(nodes: any[], base: Path)}
  {#each nodes as n, i (n.key)}
    {@const path = [...base, i]}
    {@const k = key(path)}
    {@const sel = inSel(path)}
    <div
      class="blk t-{n.t}" class:grp={n.t === 'grp'} class:sel class:at-caret={caretKey === k} class:mo-slot={isSrc(path)} class:q-over={qOver === k}
      role="group" data-path={k} animate:flip={flipFx(fxOff)} in:listFx={{ off: fxOff }} out:listFx={{ off: fxOff }} onpointerover={(e) => onOver(e, n)}
    >
      {#if n.t === 'grp'}
        <div class="gh">
          <button
            class="main" type="button" data-pk={k} tabindex={sel || (!S.selPath && k === '0') ? 0 : -1} title={RX.describe(n)}
            aria-label={RX.describe(n) + ', ' + n.open} aria-pressed={sel}
            onclick={(e) => tap(path, e)} onkeydown={(e) => blockKey(e, path)} ondblclick={() => openNode(path)}
          ><span class="code">{n.open}</span><span class="lab">{RX.shortLabel(n)}</span></button>
        </div>
        <div class="gb" data-gpath={k}>{@render blocks(n.children, path)}</div>
        <div class="gf">
          <button class="main" type="button" tabindex="-1" aria-hidden="true" onclick={(e) => tap(path, e)} ondblclick={() => openNode(path)}><span class="code">{n.closed ? ')' : '(닫히지 않음)'}</span></button>
          {@render qbtn(n, path)}
        </div>
      {:else}
        <button
          class="main" type="button" data-pk={k} tabindex={sel || (!S.selPath && k === '0') ? 0 : -1} title={RX.describe(n)}
          aria-label={RX.describe(n) + ', ' + n.raw} aria-pressed={sel}
          onclick={(e) => tap(path, e)} onkeydown={(e) => blockKey(e, path)} ondblclick={() => openNode(path)}
        ><span class="code">{disp(n)}</span><span class="lab">{RX.shortLabel(n)}</span></button>
        {@render qbtn(n, path)}
      {/if}
    </div>
  {/each}
{/snippet}

{#snippet sb(text: string, label: string, span: number, fn: () => void, disabled: boolean, cls = '', pressed: boolean | undefined = undefined)}
  <button class="btn sm sb {cls}" type="button" aria-label={label} title={label} style="grid-column: span {span}" {disabled} aria-pressed={pressed} onmousedown={noBlur} onclick={fn}>{text}</button>
{/snippet}

<div class="board-wrap">
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div class="board" bind:this={board} role="toolbar" tabindex="-1" aria-label="패턴 블록" onpointerdown={onBoardDown} onpointerleave={() => (S.hover = null)}>
    <div class="blist" bind:this={rootList}>
      {@render blocks(V.tree.children, [])}
      {#if !V.tree.children.length}
        <span class="empty">블록이 없습니다. 아래 팔레트에서 끌어다 놓거나 눌러서 추가하세요.</span>
      {/if}
    </div>
    <div class="mo-drop-line" bind:this={line} hidden></div>
  </div>
  {#if dragKind === 'blocks'}
    <div class="trash" data-mo-drop bind:this={trash} class:mo-drop-over={overTrash} in:listFx out:listFx>여기에 놓으면 삭제</div>
  {/if}
</div>

<div class="selbar" class:empty={!has}>
  <div class="sb-t">{selTitle}</div>
  <div class="sb-g">
    {@render sb('◀', '앞으로 이동 (Alt+←)', 2, () => moveSel(-1), !has || selIdx === 0)}
    {@render sb('▶', '뒤로 이동 (Alt+→)', 2, () => moveSel(1), !has || selIdx + cnt >= selLen)}
    {@render sb('◀+', '왼쪽 블록까지 선택 넓히기', 2, () => growSel(-1), !has || selIdx === 0)}
    {@render sb('+▶', '오른쪽 블록까지 선택 넓히기', 2, () => growSel(1), !has || selIdx + cnt >= selLen)}
    {@render sb('범위', '누른 블록까지 범위 선택', 2, () => (S.multi = !S.multi), !has, S.multi ? 'on' : '', S.multi)}
    {@render sb('해제', '선택 해제', 2, clearSel, !has)}
    {@render sb('세부', '세부 설정', 2, () => openNode(), !has || cnt !== 1, 'primary')}
    {@render sb('묶기( )', '캡처 그룹으로 묶기', 3, () => wrapSel('('), !has)}
    {@render sb('묶기(?:)', '캡처 없이 묶기', 3, () => wrapSel('(?:'), !has)}
    {@render sb('복제', '복제', 2, duplicateSel, !has)}
    {@render sb('삭제', '삭제 (Delete)', 2, deleteSel, !has, 'danger')}
  </div>
</div>

<div class="pal">
  <div class="ptabs" role="tablist" aria-label="팔레트">
    {#each tabs as t (t.id)}
      <button class="ptab mo-tab" class:on={t.id === curTab.id} type="button" role="tab" aria-selected={t.id === curTab.id} onclick={() => (S.palTab = t.id)}>{t.label}</button>
    {/each}
  </div>
  {#key curTab.id}
    <div class="pgrid mo-soft-in">
      {#each curTab.items as it (it.code)}
        <button
          class="pbtn" class:quant={isQuantItem(it)} type="button"
          title={it.desc + (isQuantItem(it) ? ' — 블록 위로 끌어다 놓거나, 블록을 선택하고 누르세요' : ' — 작업대로 끌어다 놓거나, 눌러서 ' + (has ? '선택한 블록 뒤' : '커서 위치') + '에 추가')}
          onmousedown={noBlur} onpointerdown={(e) => onItemDown(e, it)} onclick={() => pickItem(it)}
        ><code>{it.code}</code><span>{it.desc}</span></button>
      {/each}
    </div>
  {/key}
</div>
