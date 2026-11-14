<script lang="ts">
  // 모달 시트의 틀: 딤 배경, 나타남/사라짐, Esc·바깥 클릭 닫기, 포커스 되돌리기. 내용은 kind 별 컴포넌트가 그린다.
  import { S, closeSheet } from '../lib/app.svelte';
  import { backdropFx, modalFx, panelFx } from '../lib/motion/motion.svelte';
  import NodeSheet from './NodeSheet.svelte';
  import LiteralSheet from './LiteralSheet.svelte';
  import SaveSheet from './SaveSheet.svelte';
  import GuardSheet from './GuardSheet.svelte';
  import DeleteSheet from './DeleteSheet.svelte';
  import MenuSheet from './MenuSheet.svelte';
  import PresetPalette from './PresetPalette.svelte';

  const MAP: Record<string, any> = { node: NodeSheet, lit: LiteralSheet, save: SaveSheet, guard: GuardSheet, del: DeleteSheet, menu: MenuSheet, pal: PresetPalette };
  let sheetEl = $state<HTMLElement | null>(null);
  let lastKind = '';
  let prevFocus: HTMLElement | null = null;
  // 닫는 순간 S.sheet 는 null 이 되지만 내용 컴포넌트는 사라지는 동안(그리고 닫은 직후의 콜백에서) props 를 계속 읽는다.
  // 마지막으로 열렸던 시트를 붙들어 두고 그것으로 그린다.
  let keep: { kind: string; props: any } | null = null;
  const cur = $derived.by(() => { if (S.sheet) keep = { kind: S.sheet.kind, props: S.sheet.props }; return keep!; });

  /** 넓은 화면과 검색 팔레트는 가운데에서 자라나는 모달, 좁은 화면은 아래에서 올라오는 시트 */
  const sheetFx = (n: Element, p: unknown, o: any) =>
    lastKind === 'pal' || matchMedia('(min-width: 720px)').matches ? modalFx(n, p, o) : panelFx(n, { side: 'bottom' }, o);

  $effect(() => {
    const open = !!S.sheet;
    if (open) {
      lastKind = S.sheet!.kind;
      if (!prevFocus) prevFocus = document.activeElement as HTMLElement | null;
      // 내용이 스스로 입력에 포커스를 주지 않았으면 시트에 준다(Tab 이 시트 안에서 시작하도록)
      queueMicrotask(() => { if (sheetEl && !sheetEl.contains(document.activeElement)) sheetEl.focus({ preventScroll: true }); });
    } else if (prevFocus) {
      const el = prevFocus; prevFocus = null;
      if (el.isConnected) el.focus({ preventScroll: true });
    }
  });
  function onKey(e: KeyboardEvent) {
    if (!S.sheet) return;
    if (e.key === 'Escape') { e.preventDefault(); closeSheet(); return; }
    if (e.key !== 'Tab' || !sheetEl) return;
    // 포커스가 시트 밖으로 나가지 않게 한다
    const f = Array.from(sheetEl.querySelectorAll<HTMLElement>('button:not(:disabled), input, textarea, select, [tabindex]:not([tabindex="-1"])')).filter((x) => x.offsetParent !== null);
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1], a = document.activeElement;
    if (e.shiftKey && (a === first || a === sheetEl)) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && a === last) { e.preventDefault(); first.focus(); }
  }
</script>

<svelte:window onkeydown={onKey} />

{#if S.sheet}
  {@const kind = cur.kind}
  {@const Comp = MAP[kind]}
  <div class="ov-dim" in:backdropFx out:backdropFx></div>
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div class="ov-wrap" class:top={kind === 'pal'} role="presentation" onclick={(e) => { if (e.target === e.currentTarget) closeSheet(); }}>
    <div class="sheet" role="dialog" aria-modal="true" tabindex="-1" bind:this={sheetEl} in:sheetFx out:sheetFx>
      {#key kind}
        <div class="mo-soft-in"><Comp {...cur.props} /></div>
      {/key}
    </div>
  </div>
{/if}
