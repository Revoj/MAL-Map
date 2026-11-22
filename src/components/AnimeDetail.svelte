<script lang="ts">
  import { app } from '../lib/app.svelte.ts';
  import { scoreOf } from '../lib/data.ts';
  import { tr } from '../lib/i18n.ts';
  import { hsl } from '../lib/map-engine.ts';
  import { explain } from '../lib/recommend.ts';
  import { STATUS_LABEL } from '../lib/userlist.ts';
  import AnimeRow from './AnimeRow.svelte';

  let { i }: { i: number } = $props();
  const s = app.store!;
  const n = $derived(s.nodes[i]);
  const st = $derived(app.user?.byNode.get(i));
  const sc = $derived(scoreOf(n));
  const cons = $derived(app.constellations.find((c) => c.id === app.cluster[i]));
  const similar = $derived(s.adj[i].slice(0, 12));
  const maxW = $derived(similar[0]?.[1] ?? 1);
  const rank = $derived(app.recRank.get(i));
  const because = $derived(app.user ? explain(s, app.user, null, i) : []);
  const tags = $derived(n.tg.filter(([t]) => s.ds.tags[t].cat !== 'Demographic').slice(0, 12));

  // ---------- detalles bajo demanda (sinopsis, tráiler, próximo episodio) ----------
  type Extra = { description: string | null; trailer: { id: string; site: string } | null; next: { episode: number; airingAt: number } | null; banner: string | null };
  const cache = new Map<number, Promise<Extra>>();
  function details(id: number): Promise<Extra> {
    if (!cache.has(id)) {
      const query = `query($id:Int){Media(id:$id){description(asHtml:false) bannerImage trailer{id site} nextAiringEpisode{episode airingAt}}}`;
      cache.set(
        id,
        fetch('https://graphql.anilist.co', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ query, variables: { id } }),
        })
          .then((r) => r.json())
          .then((j) => {
            const m = j.data.Media;
            return {
              description: m.description?.replace(/<br\s*\/?>/g, '\n').replace(/<[^>]+>/g, '') ?? null,
              trailer: m.trailer,
              next: m.nextAiringEpisode,
              banner: m.bannerImage,
            };
          }),
      );
    }
    return cache.get(id)!;
  }
  let expanded = $state(false);
  $effect(() => {
    void i;
    expanded = false;
  });

  function addGenre(g: string) {
    app.filters.genres[g] = 'include';
    app.tab = 'filters';
    app.applyFilters();
  }
  function addTag(t: number) {
    app.filters.tags[t] = 'include';
    app.tab = 'filters';
    app.applyFilters();
  }
</script>

<aside class="detail panel">
  <button class="close btn ghost" onclick={() => app.select(null)} aria-label="Cerrar">✕</button>
  {#await details(n.id) then d}
    {#if d.banner}<div class="banner" style="background-image:url({d.banner})"></div>{/if}
  {/await}
  <div class="head">
    <img src={n.img} alt="" style="background:{n.col ?? '#223'}" />
    <div class="titles">
      <h2>{app.title(i)}</h2>
      {#if app.titleLang === 'romaji' && n.en && n.en !== n.t}<div class="muted">{n.en}</div>{/if}
      {#if app.titleLang === 'english' && n.t !== n.en}<div class="muted">{n.t}</div>{/if}
      {#if n.nat}<div class="faint">{n.nat}</div>{/if}
      <div class="score-line">
        <span class="score">★ {sc?.toFixed(2) ?? '–'}</span>
        <span class="muted">{(n.mem ?? n.pop).toLocaleString('es')} {n.mem ? 'miembros MAL' : 'usuarios AniList'}</span>
      </div>
      {#if st}
        <span class="status st-{st.status}">
          {STATUS_LABEL[st.status]}{st.score ? ` · tu nota ${st.score.toFixed(1)}` : ''}
        </span>
      {/if}
    </div>
  </div>

  {#if !app.visible[i]}
    <p class="warn">Esta serie está oculta por los filtros actuales.</p>
  {/if}

  <dl class="facts">
    <div><dt>Años</dt><dd>{n.yr ?? '?'}{n.yr2 && n.yr2 !== n.yr ? ` – ${n.yr2}` : ''}</dd></div>
    <div><dt>Episodios</dt><dd>{n.ep || '?'}{n.seasons > 1 ? ` · ${n.seasons} temp.` : ''}</dd></div>
    <div><dt>Formato</dt><dd>{tr.format(n.f)}</dd></div>
    <div><dt>Estado</dt><dd>{tr.status(n.st)}</dd></div>
    <div><dt>Origen</dt><dd>{tr.source(n.src)}</dd></div>
    <div><dt>Estudio</dt><dd>{n.stu.map((x) => s.ds.studios[x]).join(', ') || '—'}</dd></div>
  </dl>

  {#if cons}
    <button
      class="constellation"
      style="color:{hsl(cons.hue, 80, 75)};border-color:{hsl(cons.hue, 70, 50, 0.5)}"
      onclick={() => {
        app.focusConstellation = cons.id;
        app.engine?.flyToPoint(cons.x, cons.y, cons.radius);
      }}>✦ Constelación «{cons.name}» · {cons.size} series</button
    >
  {/if}

  {#if rank != null && rank < 300}
    <div class="why">
      <b>#{rank + 1} en tus recomendaciones</b>
      {#if because.length}<span class="muted">Porque viste {because.map((j) => app.title(j)).join(', ')}.</span>{/if}
    </div>
  {/if}

  <div class="chips">
    {#each n.g as g (g)}
      <button class="chip" title="Filtrar por este género" onclick={() => addGenre(g)}>{tr.genre(g)}</button>
    {/each}
  </div>
  <div class="chips tags">
    {#each tags as [t, r] (t)}
      <button class="chip" title="Relevancia {r}% · clic para filtrar" onclick={() => addTag(t)} style="opacity:{0.55 + r / 230}">
        {tr.tag(s.ds.tags[t].name)}
      </button>
    {/each}
  </div>

  {#await details(n.id)}
    <p class="faint">Cargando sinopsis…</p>
  {:then d}
    {#if d.next}
      <p class="next">📡 Episodio {d.next.episode} el {new Date(d.next.airingAt * 1000).toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
    {/if}
    {#if d.description}
      <p class="desc" class:expanded>{d.description}</p>
      {#if d.description.length > 320}
        <button class="btn small ghost" onclick={() => (expanded = !expanded)}>{expanded ? 'Ver menos' : 'Leer más'}</button>
      {/if}
    {/if}
    {#if d.trailer?.site === 'youtube'}
      <a class="btn small" href="https://www.youtube.com/watch?v={d.trailer.id}" target="_blank" rel="noreferrer">▶ Ver tráiler</a>
    {/if}
  {:catch}
    <p class="faint">No se pudo cargar la sinopsis.</p>
  {/await}

  <div class="links">
    {#if n.mal}<a class="btn small" href="https://myanimelist.net/anime/{n.mal}" target="_blank" rel="noreferrer">MyAnimeList ↗</a>{/if}
    <a class="btn small" href="https://anilist.co/anime/{n.id}" target="_blank" rel="noreferrer">AniList ↗</a>
  </div>

  <div class="section-title">Series similares</div>
  {#each similar as [j, w] (j)}
    <AnimeRow i={j} compact>
      {#snippet extra()}
        <span class="sim"><span style="width:{(100 * w) / maxW}%"></span></span>
      {/snippet}
    </AnimeRow>
  {/each}

  {#if n.m.length > 1}
    <div class="section-title">Obras de la franquicia ({n.m.length})</div>
    <ul class="franchise">
      {#each n.m as [al, ml, fmt, yr, title] (al)}
        {@const seen = st?.seen.has(al)}
        <li class:seen>
          <span class="fmt">{tr.format(fmt)}</span>
          <a href={ml ? `https://myanimelist.net/anime/${ml}` : `https://anilist.co/anime/${al}`} target="_blank" rel="noreferrer">{title}</a>
          <span class="faint">{yr || ''}</span>
          {#if seen}<span class="ok">✓</span>{/if}
        </li>
      {/each}
    </ul>
  {/if}
</aside>

<style>
  .detail {
    position: absolute;
    top: 12px;
    right: 12px;
    bottom: 12px;
    width: min(400px, calc(100% - 24px));
    overflow-y: auto;
    padding: 16px;
    z-index: 12;
    background: rgba(14, 16, 36, 0.94);
  }
  .close {
    position: absolute;
    top: 8px;
    right: 8px;
    z-index: 2;
  }
  .banner {
    margin: -16px -16px 12px;
    height: 90px;
    background-size: cover;
    background-position: center;
    mask-image: linear-gradient(to bottom, black 30%, transparent);
    opacity: 0.7;
  }
  .head {
    display: flex;
    gap: 14px;
  }
  .head img {
    width: 100px;
    height: 142px;
    object-fit: cover;
    border-radius: 8px;
    flex: none;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
  }
  .titles {
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 0;
    padding-right: 20px;
  }
  h2 {
    margin: 0;
    font-size: 18px;
    line-height: 1.25;
  }
  .titles div {
    font-size: 12.5px;
  }
  .score-line {
    display: flex;
    gap: 8px;
    align-items: baseline;
    margin-top: 6px;
  }
  .score {
    color: var(--accent-2);
    font-weight: 700;
    font-size: 17px;
  }
  .status {
    margin-top: 4px;
    font-size: 12px;
    font-weight: 600;
  }
  .st-completed {
    color: var(--ok);
  }
  .st-watching {
    color: #38bdf8;
  }
  .st-dropped {
    color: var(--bad);
  }
  .st-planned {
    color: #fbbf24;
  }
  .warn {
    color: #fbbf24;
    font-size: 12px;
  }
  .facts {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 8px 10px;
    margin: 14px 0;
  }
  dt {
    font-size: 11px;
    color: var(--faint);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  dd {
    margin: 2px 0 0;
    font-size: 13px;
  }
  .constellation {
    width: 100%;
    text-align: left;
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid;
    border-radius: 8px;
    padding: 7px 10px;
    font-size: 12.5px;
    font-weight: 600;
    margin-bottom: 12px;
  }
  .why {
    display: flex;
    flex-direction: column;
    gap: 3px;
    padding: 8px 10px;
    border-radius: 8px;
    background: rgba(252, 211, 77, 0.08);
    border: 1px solid rgba(252, 211, 77, 0.35);
    margin-bottom: 12px;
    font-size: 12.5px;
  }
  .why b {
    color: var(--accent-2);
  }
  .tags {
    margin-top: 8px;
  }
  .desc {
    font-size: 13px;
    line-height: 1.55;
    color: #c9cdef;
    white-space: pre-line;
    display: -webkit-box;
    -webkit-line-clamp: 6;
    line-clamp: 6;
    -webkit-box-orient: vertical;
    overflow: hidden;
    margin-bottom: 4px;
  }
  .desc.expanded {
    -webkit-line-clamp: unset;
    line-clamp: unset;
  }
  .next {
    font-size: 12.5px;
    color: #7dd3fc;
  }
  .links {
    display: flex;
    gap: 8px;
    margin-top: 12px;
  }
  .links a,
  a.btn {
    text-decoration: none;
  }
  .sim {
    height: 3px;
    background: rgba(255, 255, 255, 0.06);
    border-radius: 2px;
    margin-top: 4px;
  }
  .sim span {
    display: block;
    height: 100%;
    background: var(--accent);
    border-radius: 2px;
  }
  .franchise {
    list-style: none;
    padding: 0;
    margin: 0;
    font-size: 12.5px;
  }
  .franchise li {
    display: grid;
    grid-template-columns: 74px 1fr auto auto;
    gap: 8px;
    padding: 4px 0;
    border-bottom: 1px solid rgba(255, 255, 255, 0.04);
  }
  .franchise a {
    color: var(--text);
    text-decoration: none;
  }
  .franchise a:hover {
    color: var(--accent);
  }
  .fmt {
    color: var(--faint);
    font-size: 11px;
  }
  .seen a {
    color: var(--ok);
  }
  .ok {
    color: var(--ok);
  }
</style>
