<script lang="ts">
  import type { Snippet } from 'svelte';
  import { app } from '../lib/app.svelte.ts';
  import { scoreOf } from '../lib/data.ts';
  import { STATUS_LABEL } from '../lib/userlist.ts';

  let { i, extra, compact = false }: { i: number; extra?: Snippet; compact?: boolean } = $props();
  const n = $derived(app.store!.nodes[i]);
  const st = $derived(app.user?.byNode.get(i)?.status);
</script>

<button class="row" class:compact class:hidden={!app.visible[i]} onclick={() => app.select(i)}>
  <img src={n.img} alt="" loading="lazy" style="background:{n.col ?? '#223'}" />
  <span class="info">
    <b title={app.title(i)}>{app.title(i)}</b>
    <small class="muted">
      {n.yr ?? '?'}{n.yr2 && n.yr2 !== n.yr ? `–${n.yr2}` : ''} · <span class="score">★ {scoreOf(n)?.toFixed(1) ?? '–'}</span>
      {#if n.ep}· {n.ep} ep{/if}
      {#if st}· <span class="st st-{st}">{STATUS_LABEL[st]}</span>{/if}
    </small>
    {#if extra}{@render extra()}{/if}
  </span>
</button>

<style>
  .row {
    width: 100%;
    display: flex;
    gap: 10px;
    padding: 6px;
    border: none;
    background: none;
    border-radius: 8px;
    text-align: left;
    align-items: flex-start;
  }
  .row:hover {
    background: rgba(139, 156, 255, 0.1);
  }
  .row.hidden {
    opacity: 0.55;
  }
  img {
    width: 40px;
    height: 56px;
    border-radius: 5px;
    object-fit: cover;
    flex: none;
  }
  .compact img {
    width: 30px;
    height: 42px;
  }
  .info {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
    flex: 1;
  }
  b {
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  small {
    font-size: 12px;
  }
  .score {
    color: var(--accent-2);
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
</style>
