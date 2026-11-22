<script lang="ts">
  import { app } from '../lib/app.svelte.ts';
</script>

<div class="legend panel">
  {#if app.colorMode === 'list' && app.user}
    <span><i style="background:#fcd34d"></i>Recomendada para ti</span>
    <span><i style="background:#4ade80"></i>Vista</span>
    <span><i style="background:#38bdf8"></i>Viendo</span>
    <span><i style="background:#fbbf24"></i>Pendiente</span>
    <span><i style="background:#f87171"></i>Abandonada</span>
  {:else if app.colorMode === 'score'}
    <span class="grad" style="background:linear-gradient(90deg,hsl(10,80%,45%),hsl(75,80%,52%),hsl(140,80%,60%))"></span>
    <span class="muted">≤5.5 → ≥9 ★</span>
  {:else if app.colorMode === 'year'}
    <span class="grad" style="background:linear-gradient(90deg,hsl(260,75%,62%),hsl(145,75%,62%),hsl(30,75%,62%))"></span>
    <span class="muted">{app.store!.years[0]} → {app.store!.years[1]}</span>
  {:else}
    <span class="muted">Cada color es una constelación de series que la comunidad recomienda entre sí. Tamaño = popularidad.</span>
  {/if}
</div>

<style>
  .legend {
    position: absolute;
    left: 12px;
    bottom: 12px;
    padding: 8px 12px;
    display: flex;
    gap: 12px;
    flex-wrap: wrap;
    align-items: center;
    font-size: 12px;
    z-index: 10;
    max-width: min(560px, calc(100% - 24px));
  }
  span {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  i {
    width: 9px;
    height: 9px;
    border-radius: 50%;
    display: inline-block;
  }
  .grad {
    width: 120px;
    height: 8px;
    border-radius: 4px;
  }
</style>
