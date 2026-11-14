<script lang="ts">
  // 저장하지 않은 수정이 있을 때 이동 전에 묻는 시트(kind 'guard').
  import { closeSheet, saveThen } from '../lib/app.svelte';

  let { next }: { next: () => void } = $props();
</script>

<div>
  <h3>저장하지 않은 수정이 있습니다</h3>
  <div class="sub">다른 내용을 불러오면 지금 작업 중인 패턴과 예시가 사라집니다.</div>
  <div class="btnrow">
    <button class="btn primary" type="button" onclick={() => { closeSheet(); saveThen(next); }}>저장하고 이동</button>
    <button class="btn danger" type="button" onclick={() => { closeSheet(); next(); }}>버리고 이동</button>
    <button class="btn" type="button" onclick={closeSheet}>취소</button>
  </div>
</div>
