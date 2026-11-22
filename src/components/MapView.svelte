<script lang="ts">
  import { onMount } from 'svelte';
  import { app } from '../lib/app.svelte.ts';
  import { MapEngine } from '../lib/map-engine.ts';

  let el: HTMLDivElement;

  onMount(() => {
    const engine = new MapEngine(el, app.store!, {
      click: (i) => app.select(i, false),
      hover: (i) => (app.hovered = i),
      constellation: (c) => {
        app.focusConstellation = app.focusConstellation === c.id ? null : c.id;
        if (app.focusConstellation != null) engine.flyToPoint(c.x, c.y, c.radius);
      },
    });
    app.engine = engine;
    engine.setConstellations(app.constellations, app.cluster);
    return () => {
      engine.destroy();
      app.engine = null;
    };
  });

  $effect(() => {
    app.engine?.setStyles(app.styles);
  });
  $effect(() => {
    app.engine?.setSelected(app.selected);
  });
</script>

<div class="map" bind:this={el}></div>

<div class="hud panel">
  <span><b>{app.visibleCount.toLocaleString('es')}</b> series</span>
  <span class="sep">·</span>
  <span><b>{app.constellations.length}</b> constelaciones</span>
  {#if app.focusConstellation != null}
    <button class="btn small" onclick={() => (app.focusConstellation = null)}>✕ Quitar foco</button>
  {/if}
</div>

{#if app.layoutProgress != null}
  <div class="progress panel">
    <span>Reconstruyendo constelaciones…</span>
    <div class="bar"><div style="width:{Math.round(app.layoutProgress * 100)}%"></div></div>
  </div>
{/if}

<div class="zoom">
  <button class="btn" onclick={() => app.engine?.zoom(1)} aria-label="Acercar">＋</button>
  <button class="btn" onclick={() => app.engine?.zoom(-1)} aria-label="Alejar">－</button>
  <button class="btn" onclick={() => app.engine?.resetCamera()} aria-label="Ver todo" title="Ver todo">⤢</button>
  <button class="btn" onclick={() => app.surprise()} title="Sorpréndeme: una serie bien valorada al azar">🎲</button>
</div>

<style>
  .map {
    position: absolute;
    inset: 0;
  }
  .hud {
    position: absolute;
    top: 12px;
    left: 12px;
    padding: 7px 12px;
    display: flex;
    gap: 8px;
    align-items: center;
    font-size: 13px;
    z-index: 10;
  }
  .sep {
    color: var(--faint);
  }
  .progress {
    position: absolute;
    top: 12px;
    left: 50%;
    transform: translateX(-50%);
    padding: 10px 16px;
    z-index: 10;
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-size: 13px;
    min-width: 260px;
  }
  .bar {
    height: 4px;
    background: rgba(255, 255, 255, 0.08);
    border-radius: 2px;
    overflow: hidden;
  }
  .bar div {
    height: 100%;
    background: linear-gradient(90deg, var(--accent), var(--accent-2));
    transition: width 0.1s;
  }
  .zoom {
    position: absolute;
    left: 12px;
    bottom: 64px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    z-index: 10;
  }
  .zoom .btn {
    width: 38px;
    height: 38px;
    justify-content: center;
    background: var(--panel);
    backdrop-filter: blur(10px);
    font-size: 16px;
  }
</style>
