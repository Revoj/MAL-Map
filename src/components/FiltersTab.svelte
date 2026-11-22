<script lang="ts">
  import { app } from '../lib/app.svelte.ts';
  import { defaultFilters, type TriState, type ListFilter } from '../lib/filters.ts';
  import { tr, DEMOGRAPHICS } from '../lib/i18n.ts';
  import RangeSlider from './RangeSlider.svelte';
  import OptionPicker from './OptionPicker.svelte';

  const s = app.store!;
  const f = $derived(app.filters);
  let timer: ReturnType<typeof setTimeout>;

  /** Aplica con un pequeño retardo para no reconstruir en cada movimiento del slider */
  function changed(delay = 450) {
    clearTimeout(timer);
    timer = setTimeout(() => app.applyFilters(), delay);
  }

  function cycle(rec: Record<string | number, TriState>, key: string | number) {
    const cur = rec[key];
    if (!cur) rec[key] = 'include';
    else if (cur === 'include') rec[key] = 'exclude';
    else delete rec[key];
    changed();
  }

  function toggle<T>(arr: T[], v: T) {
    const k = arr.indexOf(v);
    if (k >= 0) arr.splice(k, 1);
    else arr.push(v);
    changed();
  }

  const EPISODES: { label: string; range: [number, number] }[] = [
    { label: 'Cualquiera', range: [0, s.maxEpisodes] },
    { label: '≤ 13', range: [0, 13] },
    { label: '≤ 26', range: [0, 26] },
    { label: '27 – 60', range: [27, 60] },
    { label: '> 60', range: [61, s.maxEpisodes] },
  ];
  const POPULARITY: { label: string; min: number; max: number }[] = [
    { label: 'Cualquiera', min: 0, max: 0 },
    { label: 'Poco conocidas', min: 0, max: 30000 },
    { label: 'Conocidas', min: 50000, max: 0 },
    { label: 'Muy populares', min: 200000, max: 0 },
  ];
  const year = new Date().getFullYear();

  type Preset = { label: string; hint: string; apply: () => void; needsUser?: boolean };
  const PRESETS: Preset[] = [
    {
      label: '💎 Joyas ocultas',
      hint: 'Muy bien valoradas pero poco vistas',
      apply: () => Object.assign(app.filters, { score: [7.6, 10], maxPopularity: 40000, minPopularity: 0 }),
    },
    {
      label: '🏛️ Clásicos',
      hint: 'Antes de 2006 y nota alta',
      apply: () => Object.assign(app.filters, { years: [s.years[0], 2005], score: [7.5, 10] }),
    },
    { label: '📡 En emisión', hint: 'Franquicias con temporada en emisión', apply: () => (app.filters.status = ['RELEASING']) },
    { label: '🆕 Recientes', hint: 'Estrenadas en los últimos 3 años', apply: () => (app.filters.years = [year - 2, s.years[1]]) },
    { label: '⚡ Cortas', hint: 'Una temporada de ≤ 13 episodios', apply: () => Object.assign(app.filters, { episodes: [0, 13], maxSeasons: 1 }) },
    { label: '🙈 No vistas', hint: 'Oculta todo lo que ya viste', needsUser: true, apply: () => (app.filters.list = 'unseen') },
  ];

  function preset(p: Preset) {
    p.apply();
    changed(0);
  }

  const tagOpts = s.tagOptions.map((t) => ({ key: t.idx, name: tr.tag(t.name), count: t.count }));
  const studioOpts = s.studioOptions.map((t) => ({ key: t.idx, name: t.name, count: t.count }));
  const tagSel = $derived(new Set(Object.keys(f.tags).map(Number)));
  const studioSel = $derived(new Set(f.studios));
  const epIdx = $derived(EPISODES.findIndex((e) => e.range[0] === f.episodes[0] && e.range[1] === f.episodes[1]));
  const popIdx = $derived(POPULARITY.findIndex((p) => p.min === f.minPopularity && p.max === f.maxPopularity));
  const LIST: [ListFilter, string][] = [
    ['all', 'Todas'],
    ['unseen', 'No vistas'],
    ['unseen-or-planned', 'No vistas + pendientes'],
    ['planned', 'Solo pendientes'],
    ['seen', 'Solo vistas'],
  ];
</script>

<div class="mode panel">
  <label>
    <input
      type="checkbox"
      bind:checked={app.rebuild}
      onchange={() => {
        app.savePrefs();
        changed(0);
      }}
    />
    <span>
      <b>Reconstruir el mapa al filtrar</b>
      <small class="muted">Recalcula constelaciones y posiciones solo con las series filtradas. Desactívalo para únicamente atenuar las demás.</small>
    </span>
  </label>
</div>

<div class="section-title">Atajos</div>
<div class="chips">
  {#each PRESETS as p (p.label)}
    {#if !p.needsUser || app.user}
      <button class="chip" title={p.hint} onclick={() => preset(p)}>{p.label}</button>
    {/if}
  {/each}
</div>

{#if app.user}
  <div class="section-title">Mi lista ({app.user.user})</div>
  <div class="chips">
    {#each LIST as [k, label] (k)}
      <button class="chip" class:on={f.list === k} onclick={() => ((app.filters.list = k), changed(0))}>{label}</button>
    {/each}
  </div>
{/if}

<div class="section-title">Año de estreno</div>
<RangeSlider min={s.years[0]} max={s.years[1]} bind:value={app.filters.years} onchange={() => changed()} />

<div class="section-title">Puntuación</div>
<RangeSlider min={0} max={10} step={0.1} bind:value={app.filters.score} format={(v) => v.toFixed(1) + ' ★'} onchange={() => changed()} />

<div class="section-title">Popularidad</div>
<div class="chips">
  {#each POPULARITY as p, k (p.label)}
    <button
      class="chip"
      class:on={popIdx === k}
      onclick={() => {
        app.filters.minPopularity = p.min;
        app.filters.maxPopularity = p.max;
        changed(0);
      }}>{p.label}</button
    >
  {/each}
</div>

<div class="section-title">Episodios (sumando temporadas)</div>
<div class="chips">
  {#each EPISODES as e, k (e.label)}
    <button class="chip" class:on={epIdx === k} onclick={() => ((app.filters.episodes = [...e.range]), changed(0))}>{e.label}</button>
  {/each}
</div>
<div class="chips mt">
  {#each [[0, 'Cualquier nº de temporadas'], [1, 'Una sola temporada'], [3, '≤ 3 temporadas']] as [v, label] (v)}
    <button class="chip" class:on={f.maxSeasons === v} onclick={() => ((app.filters.maxSeasons = v as number), changed(0))}>{label}</button>
  {/each}
</div>

<div class="section-title">Géneros <span class="hint">clic: incluir · 2º clic: excluir</span></div>
<div class="chips">
  {#each s.genres as g (g)}
    <button class="chip {f.genres[g] ?? ''}" onclick={() => cycle(app.filters.genres, g)}>{tr.genre(g)}</button>
  {/each}
</div>
<div class="chips mt">
  <span class="muted small">Incluidos:</span>
  <button class="chip" class:on={f.genreMode === 'all'} onclick={() => ((app.filters.genreMode = 'all'), changed(0))}>todos</button>
  <button class="chip" class:on={f.genreMode === 'any'} onclick={() => ((app.filters.genreMode = 'any'), changed(0))}>alguno</button>
</div>

<div class="section-title">Temas y etiquetas</div>
<OptionPicker
  options={tagOpts}
  selected={tagSel}
  placeholder="Isekai, Viajes en el tiempo, Militar…"
  onadd={(k) => {
    app.filters.tags[k] = 'include';
    changed(0);
  }}
/>
{#if tagSel.size}
  <div class="chips mt">
    {#each [...tagSel] as t (t)}
      <button class="chip {f.tags[t]}" onclick={() => cycle(app.filters.tags, t)}>{tr.tag(s.ds.tags[t].name)}</button>
    {/each}
  </div>
{/if}

<div class="section-title">Demografía</div>
<div class="chips">
  {#each DEMOGRAPHICS as d (d)}
    <button class="chip" class:on={f.demographics.includes(d)} onclick={() => toggle(app.filters.demographics, d)}>{tr.tag(d)}</button>
  {/each}
</div>

<div class="section-title">Formato y estado</div>
<div class="chips">
  {#each ['TV', 'ONA', 'TV_SHORT'] as fm (fm)}
    <button class="chip" class:on={f.formats.includes(fm)} onclick={() => toggle(app.filters.formats, fm)}>{tr.format(fm)}</button>
  {/each}
  {#each ['FINISHED', 'RELEASING', 'NOT_YET_RELEASED'] as st (st)}
    <button class="chip" class:on={f.status.includes(st)} onclick={() => toggle(app.filters.status, st)}>{tr.status(st)}</button>
  {/each}
</div>

<div class="section-title">Estudio</div>
<OptionPicker
  options={studioOpts}
  selected={studioSel}
  placeholder="Madhouse, Kyoto Animation…"
  onadd={(k) => {
    app.filters.studios.push(k);
    changed(0);
  }}
/>
{#if f.studios.length}
  <div class="chips mt">
    {#each f.studios as st (st)}
      <button class="chip on" onclick={() => toggle(app.filters.studios, st)}>{s.ds.studios[st]} ✕</button>
    {/each}
  </div>
{/if}

<div class="section-title">Material original</div>
<div class="chips">
  {#each s.sources.slice(0, 10) as src (src)}
    <button class="chip" class:on={f.sources.includes(src)} onclick={() => toggle(app.filters.sources, src)}>{tr.source(src)}</button>
  {/each}
</div>

<div class="section-title">País</div>
<div class="chips">
  {#each s.countries as c (c)}
    <button class="chip" class:on={f.countries.includes(c)} onclick={() => toggle(app.filters.countries, c)}>{tr.country(c)}</button>
  {/each}
</div>

<div class="footer">
  <button class="btn" onclick={() => app.resetFilters()} disabled={JSON.stringify(f) === JSON.stringify(defaultFilters(s))}>
    Restablecer filtros
  </button>
</div>

<style>
  .mode {
    margin-top: 14px;
    padding: 10px 12px;
  }
  .mode label {
    display: flex;
    gap: 10px;
    align-items: flex-start;
    cursor: pointer;
  }
  .mode input {
    margin-top: 3px;
    accent-color: var(--accent);
  }
  .mode span {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  .mode small {
    font-size: 12px;
    line-height: 1.4;
  }
  .hint {
    text-transform: none;
    letter-spacing: 0;
    font-weight: 400;
    margin-left: 6px;
  }
  .mt {
    margin-top: 8px;
  }
  .small {
    font-size: 12px;
    align-self: center;
  }
  .footer {
    margin-top: 22px;
  }
</style>
