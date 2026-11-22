<script lang="ts">
  import { app } from '../lib/app.svelte.ts';
  import { activeCount } from '../lib/filters.ts';
  import ExploreTab from './ExploreTab.svelte';
  import FiltersTab from './FiltersTab.svelte';
  import ForYouTab from './ForYouTab.svelte';

  const nFilters = $derived(activeCount(app.filters, app.store!));
</script>

<aside class="sidebar">
  <nav>
    <button class:on={app.tab === 'explore'} onclick={() => (app.tab = 'explore')}>Explorar</button>
    <button class:on={app.tab === 'filters'} onclick={() => (app.tab = 'filters')}>
      Filtros {#if nFilters}<span class="badge">{nFilters}</span>{/if}
    </button>
    <button class:on={app.tab === 'foryou'} onclick={() => (app.tab = 'foryou')}>
      Para ti {#if app.user}<span class="dot"></span>{/if}
    </button>
  </nav>
  <div class="body">
    {#if app.tab === 'explore'}
      <ExploreTab />
    {:else if app.tab === 'filters'}
      <FiltersTab />
    {:else}
      <ForYouTab />
    {/if}
  </div>
</aside>

<style>
  .sidebar {
    grid-area: side;
    display: flex;
    flex-direction: column;
    min-height: 0;
    border-right: 1px solid var(--border);
    background: rgba(10, 12, 28, 0.92);
    z-index: 15;
  }
  nav {
    display: flex;
    padding: 8px 8px 0;
    gap: 4px;
    border-bottom: 1px solid var(--border);
  }
  nav button {
    flex: 1;
    padding: 10px 6px;
    background: none;
    border: none;
    border-bottom: 2px solid transparent;
    color: var(--muted);
    font-weight: 500;
    display: inline-flex;
    justify-content: center;
    align-items: center;
    gap: 6px;
  }
  nav button.on {
    color: var(--text);
    border-bottom-color: var(--accent);
  }
  .badge {
    background: var(--accent);
    color: #0b0e22;
    border-radius: 999px;
    font-size: 11px;
    padding: 0 6px;
    font-weight: 700;
  }
  .dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--ok);
  }
  .body {
    flex: 1;
    overflow-y: auto;
    padding: 4px 16px 24px;
  }
  @media (max-width: 820px) {
    .sidebar {
      position: absolute;
      top: 56px;
      bottom: 0;
      left: 0;
      width: min(360px, 92vw);
    }
  }
</style>
