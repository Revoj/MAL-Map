<script lang="ts">
  import { app } from '../lib/app.svelte.ts';
  import { scoreOf } from '../lib/data.ts';
  import { hsl } from '../lib/map-engine.ts';
  import AnimeRow from './AnimeRow.svelte';

  let source = $state<'mal' | 'anilist'>('mal');
  let name = $state('');
  let shown = $state(25);
  let onlyVisible = $state(true);

  const recs = $derived(onlyVisible ? app.recs.filter((r) => app.visible[r.i]) : app.recs);

  /** Constelaciones grandes casi sin explorar, con su mejor serie no vista */
  const blindSpots = $derived.by(() => {
    const u = app.user;
    const s = app.store!;
    if (!u) return [];
    const seen = new Map<number, number>();
    for (const [i, st] of u.byNode) if (st.status !== 'planned' && app.cluster[i] >= 0) seen.set(app.cluster[i], (seen.get(app.cluster[i]) ?? 0) + 1);
    return app.constellations
      .filter((c) => c.size >= 12 && (seen.get(c.id) ?? 0) / c.size < 0.06)
      .map((c) => {
        let best = -1;
        s.nodes.forEach((n, i) => {
          if (app.cluster[i] !== c.id || u.byNode.has(i) || n.pop < 20000) return;
          if (best < 0 || (scoreOf(n) ?? 0) > (scoreOf(s.nodes[best]) ?? 0)) best = i;
        });
        return { c, best };
      })
      .filter((x) => x.best >= 0)
      .sort((a, b) => b.c.size - a.c.size)
      .slice(0, 6);
  });

  const stats = $derived.by(() => {
    const u = app.user;
    if (!u) return null;
    let completed = 0;
    for (const st of u.byNode.values()) if (st.status === 'completed') completed++;
    return { completed, pct: Math.round((100 * completed) / app.store!.nodes.length) };
  });

  function submit(e: SubmitEvent) {
    e.preventDefault();
    if (name.trim()) app.connect(source, name);
  }
</script>

{#if !app.user}
  <p class="intro muted">
    Conecta tu lista para ver en el mapa lo que ya viste, descubrir constelaciones que no has explorado y recibir
    recomendaciones basadas en tus notas.
  </p>
  <form class="panel connect" onsubmit={submit}>
    <div class="seg">
      <button type="button" class:on={source === 'mal'} onclick={() => (source = 'mal')}>MyAnimeList</button>
      <button type="button" class:on={source === 'anilist'} onclick={() => (source = 'anilist')}>AniList</button>
    </div>
    <input class="input" placeholder="Nombre de usuario" bind:value={name} autocomplete="username" />
    <button class="btn primary" disabled={app.userLoading || !name.trim()}>
      {app.userLoading ? 'Cargando lista…' : 'Conectar'}
    </button>
    <small class="faint">
      {source === 'mal'
        ? 'La lista debe ser pública. No se pide contraseña: solo se lee tu lista pública.'
        : 'Se consulta la API pública de AniList.'}
    </small>
  </form>
  <details class="xml">
    <summary class="muted">¿Lista privada? Importa tu exportación de MAL</summary>
    <p class="faint">
      Descárgala en <a href="https://myanimelist.net/panel.php?go=export" target="_blank" rel="noreferrer">myanimelist.net → Export</a>
      y sube el archivo <code>.xml.gz</code> (todo se procesa en tu navegador).
    </p>
    <input
      type="file"
      accept=".xml,.gz"
      onchange={(e) => {
        const file = e.currentTarget.files?.[0];
        if (file) app.importXml(file);
      }}
    />
  </details>
  {#if app.userError}
    <p class="err">{app.userError}</p>
  {/if}
{:else}
  <div class="user panel">
    <div>
      <b>{app.user.user}</b>
      <small class="muted">
        {app.user.source === 'anilist' ? 'AniList' : 'MyAnimeList'} · {app.user.matched}/{app.user.total} obras en el mapa ·
        {stats?.completed} franquicias vistas ({stats?.pct}% del mapa) · nota media {app.user.mean.toFixed(1)}
      </small>
    </div>
    <button class="btn small" onclick={() => app.disconnect()}>Desconectar</button>
  </div>

  {#if app.continuations.length}
    <div class="section-title">Continúa tus franquicias</div>
    {#each app.continuations.slice(0, 6) as c (c.i)}
      <AnimeRow i={c.i} compact>
        {#snippet extra()}
          <small class="pending">Te falta: {c.missing.map((m) => `${m[4]} (${m[3]})`).join(', ')}</small>
        {/snippet}
      </AnimeRow>
    {/each}
  {/if}

  <div class="section-title">Recomendadas para ti</div>
  <div class="disc">
    <span class="muted">Populares</span>
    <input type="range" min="0" max="1" step="0.05" bind:value={app.discovery} aria-label="Nivel de descubrimiento" />
    <span class="muted">Joyas ocultas</span>
  </div>
  <label class="check muted">
    <input type="checkbox" bind:checked={onlyVisible} /> Solo las que cumplen los filtros actuales
  </label>

  {#if !recs.length}
    <p class="muted">No hay recomendaciones con estos filtros. Puntúa más series en tu lista para afinar los resultados.</p>
  {/if}
  {#each recs.slice(0, shown) as r (r.i)}
    <AnimeRow i={r.i}>
      {#snippet extra()}
        <span class="match"><span class="bar" style="width:{r.score}%"></span><small>{r.score}% afinidad</small></span>
        {#if r.because.length}
          <small class="because faint">Porque viste {r.because.map((j) => app.title(j)).join(', ')}</small>
        {/if}
        {#if r.planned}<small class="planned">★ Ya está en tus pendientes</small>{/if}
      {/snippet}
    </AnimeRow>
  {/each}
  {#if recs.length > shown}
    <button class="btn small ghost" onclick={() => (shown += 25)}>Ver más</button>
  {/if}

  {#if blindSpots.length}
    <div class="section-title">Constelaciones por explorar</div>
    <p class="faint small">Zonas del mapa que casi no has visitado, con su serie mejor valorada.</p>
    {#each blindSpots as b (b.c.id)}
      <div class="blind">
        <button
          class="cname"
          style="color:{hsl(b.c.hue, 80, 75)}"
          onclick={() => {
            app.focusConstellation = b.c.id;
            app.engine?.flyToPoint(b.c.x, b.c.y, b.c.radius);
          }}>✦ {b.c.name}</button
        >
        <AnimeRow i={b.best} compact />
      </div>
    {/each}
  {/if}
{/if}

<style>
  .intro {
    margin: 14px 0;
    line-height: 1.5;
    font-size: 13px;
  }
  .connect {
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .seg {
    display: flex;
    background: rgba(0, 0, 0, 0.3);
    border-radius: 8px;
    padding: 3px;
  }
  .seg button {
    flex: 1;
    border: none;
    background: none;
    padding: 6px;
    border-radius: 6px;
    color: var(--muted);
  }
  .seg button.on {
    background: rgba(139, 156, 255, 0.25);
    color: var(--text);
  }
  .xml {
    margin-top: 14px;
    font-size: 13px;
  }
  .xml summary {
    cursor: pointer;
  }
  .err {
    color: var(--bad);
  }
  .user {
    margin-top: 14px;
    padding: 10px 12px;
    display: flex;
    justify-content: space-between;
    gap: 10px;
    align-items: center;
  }
  .user div {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  .user small {
    font-size: 12px;
    line-height: 1.4;
  }
  .disc {
    display: flex;
    gap: 8px;
    align-items: center;
    font-size: 12px;
  }
  .disc input {
    flex: 1;
    accent-color: var(--accent-2);
  }
  .check {
    display: flex;
    gap: 6px;
    font-size: 12px;
    margin: 6px 0 8px;
  }
  .match {
    position: relative;
    height: 16px;
    display: flex;
    align-items: center;
  }
  .match .bar {
    position: absolute;
    left: 0;
    top: 6px;
    height: 4px;
    border-radius: 2px;
    background: linear-gradient(90deg, var(--accent), var(--accent-2));
    opacity: 0.6;
  }
  .match small {
    position: relative;
    margin-left: auto;
    font-size: 11px;
    color: var(--accent-2);
  }
  .because,
  .pending,
  .planned {
    font-size: 11.5px;
    line-height: 1.35;
    white-space: normal;
  }
  .pending {
    color: #7dd3fc;
  }
  .planned {
    color: #fbbf24;
  }
  .small {
    font-size: 12px;
  }
  .blind {
    margin-bottom: 6px;
  }
  .cname {
    background: none;
    border: none;
    font-weight: 600;
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    padding: 4px 6px;
  }
</style>
