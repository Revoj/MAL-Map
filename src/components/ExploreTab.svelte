<script lang="ts">
  import { app } from '../lib/app.svelte.ts';
  import { scoreOf } from '../lib/data.ts';
  import { hsl } from '../lib/map-engine.ts';
  import AnimeRow from './AnimeRow.svelte';

  let showAll = $state(false);
  const sorted = $derived([...app.constellations].sort((a, b) => b.size - a.size));

  /** por constelación: cuántas ha visto el usuario */
  const coverage = $derived.by(() => {
    const m = new Map<number, number>();
    if (!app.user) return m;
    for (const [i, st] of app.user.byNode) {
      if (st.status === 'planned' || !app.visible[i]) continue;
      const c = app.cluster[i];
      m.set(c, (m.get(c) ?? 0) + 1);
    }
    return m;
  });

  const bestInFocus = $derived.by(() => {
    const s = app.store!;
    const pool: number[] = [];
    s.nodes.forEach((n, i) => {
      if (!app.visible[i]) return;
      if (app.focusConstellation != null && app.cluster[i] !== app.focusConstellation) return;
      if (n.pop < 15000 || scoreOf(n) == null) return;
      pool.push(i);
    });
    return pool.sort((a, b) => scoreOf(s.nodes[b])! - scoreOf(s.nodes[a])!).slice(0, 8);
  });

  const focusName = $derived(app.constellations.find((c) => c.id === app.focusConstellation)?.name);

  function focus(id: number) {
    const c = app.constellations.find((x) => x.id === id)!;
    app.focusConstellation = app.focusConstellation === id ? null : id;
    if (app.focusConstellation != null) app.engine?.flyToPoint(c.x, c.y, c.radius);
    else app.engine?.resetCamera();
  }
</script>

<p class="intro muted">
  Cada estrella es una serie (con todas sus temporadas, películas y OVAs fusionadas). Las series que la comunidad
  recomienda entre sí forman <b>constelaciones</b>. Haz clic en una estrella o en el nombre de una constelación.
</p>

<div class="actions">
  <button class="btn" onclick={() => app.surprise()}>🎲 Sorpréndeme</button>
  {#if !app.user}
    <button class="btn" onclick={() => (app.tab = 'foryou')}>Conectar mi lista</button>
  {/if}
</div>

<div class="section-title">
  {focusName ? `Mejor valoradas en «${focusName}»` : 'Mejor valoradas del mapa'}
</div>
{#each bestInFocus as i (i)}
  <AnimeRow {i} compact />
{/each}

<div class="section-title">Constelaciones ({app.constellations.length})</div>
<ul class="clist">
  {#each showAll ? sorted : sorted.slice(0, 14) as c (c.id)}
    {@const seen = coverage.get(c.id) ?? 0}
    <li>
      <button class:on={app.focusConstellation === c.id} onclick={() => focus(c.id)}>
        <i style="background:{hsl(c.hue, 75, 62)};box-shadow:0 0 10px {hsl(c.hue, 75, 62)}"></i>
        <span class="cname">
          <b>{c.name}</b>
          <small class="muted">{c.hint}</small>
        </span>
        <span class="count">
          {c.size}
          {#if app.user}
            <small class="faint">{Math.round((100 * seen) / c.size)}% visto</small>
          {/if}
        </span>
      </button>
    </li>
  {/each}
</ul>
{#if sorted.length > 14}
  <button class="btn small ghost" onclick={() => (showAll = !showAll)}>{showAll ? 'Ver menos' : `Ver las ${sorted.length}`}</button>
{/if}

{#if app.history.length}
  <div class="section-title">Visitadas recientemente</div>
  {#each app.history.slice(0, 8) as i (i)}
    <AnimeRow {i} compact />
  {/each}
{/if}

<p class="faint credits">
  Datos: {app.store!.ds.sources.join(' + ')} · actualizado {new Date(app.store!.ds.generated).toLocaleDateString('es')}.
  Basado en <a href="https://github.com/platers/MAL-Map" target="_blank" rel="noreferrer">MAL-Map</a> de platers.
</p>

<style>
  .intro {
    font-size: 13px;
    line-height: 1.5;
    margin: 14px 0 12px;
  }
  .actions {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }
  .clist {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .clist button {
    width: 100%;
    display: flex;
    gap: 10px;
    align-items: center;
    padding: 7px 8px;
    background: none;
    border: 1px solid transparent;
    border-radius: 8px;
    text-align: left;
  }
  .clist button:hover {
    background: rgba(139, 156, 255, 0.08);
  }
  .clist button.on {
    border-color: var(--accent);
    background: rgba(139, 156, 255, 0.12);
  }
  i {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    flex: none;
  }
  .cname {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  .cname b,
  .cname small {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .cname b {
    font-weight: 500;
  }
  .count {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    font-variant-numeric: tabular-nums;
  }
  .credits {
    margin-top: 24px;
    font-size: 11px;
    line-height: 1.5;
  }
</style>
