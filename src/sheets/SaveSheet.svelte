<script lang="ts">
  // 프리셋 저장·이름 수정 시트(kind 'save'). editId 가 있으면 이름·설명만 고친다.
  import { closeSheet, renamePreset, saveAsNewPreset } from '../lib/app.svelte';

  let { name = '', desc = '', editId = undefined, after = undefined }: { name?: string; desc?: string; editId?: string; after?: () => void } = $props();

  // 시트가 열린 순간의 값을 초기값으로 쓴다(이후 props 는 바뀌지 않는다).
  // svelte-ignore state_referenced_locally
  let nameV = $state(name || '');
  // svelte-ignore state_referenced_locally
  let descV = $state(desc || '');
  let nameEl: HTMLInputElement;

  function focusOnMount(node: HTMLElement) { node.focus(); }

  function ok() {
    const n = nameV.trim();
    if (!n) { nameEl?.focus(); return; }
    closeSheet();
    if (editId) renamePreset(editId, n, descV);
    else saveAsNewPreset(n, descV, after);
  }
  function onkeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); ok(); }
  }
</script>

<div>
  <h3>{editId ? '이름·설명 수정' : '프리셋으로 저장'}</h3>
  <div class="sub">{editId ? '' : '패턴, 플래그, 치환, 예시 텍스트와 검증 문장이 함께 저장됩니다.'}</div>
  <label class="l" for="psName">이름</label>
  <input class="in" id="psName" type="text" placeholder="예: 주문번호 추출" style="font-family:var(--font)" maxlength="60"
    bind:value={nameV} bind:this={nameEl} {onkeydown} use:focusOnMount />
  <div style="height:10px"></div>
  <label class="l" for="psDesc">설명</label>
  <textarea class="in" id="psDesc" rows="3" style="font-family:var(--font);font-size:14px" maxlength="300" placeholder="무엇을 찾는 패턴인지 간단히 적어 두세요" bind:value={descV}></textarea>
  <div class="btnrow" style="margin-top:12px">
    <button class="btn primary" type="button" onclick={ok}>저장</button>
    <button class="btn" type="button" onclick={closeSheet}>취소</button>
  </div>
</div>
