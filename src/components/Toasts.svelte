<script lang="ts">
  import { S } from '../lib/app.svelte';
  import { flip } from 'svelte/animate';
  import { toastFx, flipFx } from '../lib/motion/motion.svelte';
</script>

<div class="toasts" role="status" aria-live="polite">
  {#each S.toasts as t (t.id)}
    <div class="toast" animate:flip={flipFx()} in:toastFx out:toastFx>{t.msg}</div>
  {/each}
</div>
