<script lang="ts">
  // 글자 추가 시트(kind 'lit'): 입력한 글자를 이스케이프해서 패턴에 넣는다.
  import { RX, closeSheet, insertRaw } from '../lib/app.svelte';

  let value = $state('');

  function focusOnMount(node: HTMLElement) { node.focus(); }

  function ok() {
    const v = value;
    if (!v) return;
    closeSheet();
    insertRaw(RX.escapeLiteral(v));
  }
  function onkeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); ok(); }
  }
</script>

<div>
  <h3>글자 추가</h3>
  <div class="sub">특수문자도 입력한 그대로 찾습니다.</div>
  <input class="in" type="text" placeholder="예: 010 또는 http" autocapitalize="off" autocorrect="off" spellcheck="false" aria-label="추가할 글자"
    bind:value {onkeydown} use:focusOnMount />
  <div class="btnrow" style="margin-top:10px">
    <button class="btn primary" type="button" onclick={ok}>추가</button>
    <button class="btn" type="button" onclick={closeSheet}>취소</button>
  </div>
</div>
