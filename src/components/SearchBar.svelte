<script lang="ts">
  import { app } from '../lib/app.svelte.ts';
  import { scoreOf } from '../lib/data.ts';

  let q = $state('');
  let open = $state(false);
  let active = $state(0);

  const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const index = $derived(
    app.store!.nodes.map((n) => norm([n.t, n.en ?? '', n.nat ?? '', ...n.m.map((m) => m[4])].join(' | '))),
  );

  const results = $derived.by(() => {
    const k = norm(q.trim());
    if (k.length < 2) return [];
    const out: [number, number][] = [];
    index.forEach((s, i) => {
      const p = s.indexOf(k);
      if (p >= 0) out.push([i, (p === 0 ? 2 : 1) * Math.log10(app.store!.nodes[i].pop)]);
    });
    return out
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([i]) => i);
  });

  function pick(i: number) {
    if (!app.visible[i]) {
      // si está oculta por los filtros, se abre igualmente la ficha
      app.select(i, false);
    } else app.select(i);
    q = '';
    open = false;
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === 'ArrowDown') (active = Math.min(active + 1, results.length - 1)), e.preventDefault();
    else if (e.key === 'ArrowUp') (active = Math.max(active - 1, 0)), e.preventDefault();
    else if (e.key === 'Enter' && results[active] != null) pick(results[active]);
    else if (e.key === 'Escape') open = false;
  }
</script>

<div class="search">
  <input
    class="input"
    placeholder="Buscar anime… (título en romaji, inglés o japonés)"
    bind:value={q}
    onfocus={() => (open = true)}
    oninput={() => ((open = true), (active = 0))}
    onblur={() => setTimeout(() => (open = false), 150)}
    onkeydown={onKey}
  />
  {#if open && results.length}
    <ul class="panel">
      {#each results as i, k (i)}
        {@const n = app.store!.nodes[i]}
        {@const st = app.user?.byNode.get(i)?.status}
        <li>
          <button class:active={k === active} onmousedown={() => pick(i)}>
            <img src={n.img} alt="" loading="lazy" />
            <span class="t">
              <b>{app.title(i)}</b>
              <small class="muted">
                {n.yr ?? '?'} · {scoreOf(n)?.toFixed(1) ?? '–'}★
                {#if n.seasons > 1}· {n.seasons} temporadas{/if}
                {#if !app.visible[i]}· <em>oculta por filtros</em>{/if}
                {#if st}· <span class="st">{st === 'completed' ? '✓ vista' : st}</span>{/if}
              </small>
            </span>
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .search {
    position: relative;
    width: min(460px, 50vw);
  }
  ul {
    position: absolute;
    top: calc(100% + 6px);
    left: 0;
    right: 0;
    margin: 0;
    padding: 4px;
    list-style: none;
    z-index: 50;
    background: var(--panel-solid);
    max-height: 70vh;
    overflow: auto;
  }
  li button {
    width: 100%;
    display: flex;
    gap: 10px;
    align-items: center;
    padding: 6px;
    border: none;
    background: none;
    border-radius: 8px;
    text-align: left;
  }
  li button:hover,
  li button.active {
    background: rgba(139, 156, 255, 0.14);
  }
  img {
    width: 32px;
    height: 45px;
    object-fit: cover;
    border-radius: 4px;
    flex: none;
  }
  .t {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  .t b {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    font-weight: 500;
  }
  .st {
    color: var(--ok);
  }
</style>
