<script lang="ts">
  // 내 프리셋 삭제 확인 시트(kind 'del').
  import { closeSheet, deletePreset, toast } from '../lib/app.svelte';

  let { preset }: { preset: any } = $props();

  function remove() {
    closeSheet();
    deletePreset(preset.id);
    toast('삭제했습니다');
  }
</script>

<div>
  <h3>"{preset.name}" 프리셋을 삭제할까요?</h3>
  <div class="sub">삭제하면 복구할 수 없습니다. 백업이 있으면 다시 가져올 수 있습니다.</div>
  <div class="btnrow">
    <button class="btn danger" type="button" onclick={remove}>삭제</button>
    <button class="btn" type="button" onclick={closeSheet}>취소</button>
  </div>
</div>
