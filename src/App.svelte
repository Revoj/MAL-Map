<script lang="ts">
  import { app } from './lib/app.svelte.ts';
  import MapView from './components/MapView.svelte';
  import SearchBar from './components/SearchBar.svelte';
  import Sidebar from './components/Sidebar.svelte';
  import AnimeDetail from './components/AnimeDetail.svelte';
  import Legend from './components/Legend.svelte';

  app.init();
  let sidebarOpen = $state(true);
</script>

{#if app.error}
  <div class="splash">
    <h1>✦ MAL Map</h1>
    <p class="bad">{app.error}</p>
    <p class="muted">¿Generaste el dataset? Ejecuta <code>npm run data</code>.</p>
  </div>
{:else if !app.store}
  <div class="splash">
    <h1>✦ MAL Map</h1>
    <p class="muted">Cartografiando el universo del anime…</p>
    <div class="loader"></div>
  </div>
{:else}
  <div class="layout" class:collapsed={!sidebarOpen}>
    <header class="topbar">
      <button class="btn ghost burger" onclick={() => (sidebarOpen = !sidebarOpen)} aria-label="Mostrar u ocultar panel">☰</button>
      <div class="brand">✦ <b>MAL</b> Map</div>
      <SearchBar />
      <div class="spacer"></div>
      <label class="ctl">
        <span class="muted">Color</span>
        <select class="input" bind:value={app.colorMode} onchange={() => app.savePrefs()}>
          <option value="constellation">Constelación</option>
          <option value="score">Puntuación</option>
          <option value="year">Año</option>
          <option value="list" disabled={!app.user}>Mi lista</option>
        </select>
      </label>
      <button
        class="btn small"
        title="Idioma de los títulos"
        onclick={() => {
          app.titleLang = app.titleLang === 'romaji' ? 'english' : 'romaji';
          app.savePrefs();
        }}>{app.titleLang === 'romaji' ? 'Romaji' : 'English'}</button
      >
    </header>

    {#if sidebarOpen}
      <Sidebar />
    {/if}

    <main class="map-area">
      <MapView />
      <Legend />
      {#if app.selected != null}
        <AnimeDetail i={app.selected} />
      {/if}
    </main>
  </div>
{/if}

<style>
  .splash {
    height: 100%;
    display: grid;
    place-content: center;
    text-align: center;
    background: radial-gradient(ellipse at center, #1a1f4a 0%, var(--bg) 70%);
  }
  .splash h1 {
    font-size: 42px;
    margin: 0 0 8px;
    letter-spacing: 0.04em;
  }
  .bad {
    color: var(--bad);
  }
  .loader {
    margin: 20px auto;
    width: 36px;
    height: 36px;
    border-radius: 50%;
    border: 3px solid rgba(139, 156, 255, 0.2);
    border-top-color: var(--accent);
    animation: spin 0.9s linear infinite;
  }
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
  .layout {
    height: 100%;
    display: grid;
    grid-template-columns: 360px 1fr;
    grid-template-rows: 56px 1fr;
    grid-template-areas: 'top top' 'side map';
  }
  .layout.collapsed {
    grid-template-columns: 0 1fr;
  }
  .topbar {
    grid-area: top;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 0 14px;
    border-bottom: 1px solid var(--border);
    background: rgba(10, 12, 28, 0.9);
    z-index: 20;
  }
  .brand {
    font-size: 17px;
    letter-spacing: 0.03em;
    white-space: nowrap;
  }
  .spacer {
    flex: 1;
  }
  .ctl {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .ctl select {
    width: auto;
    padding: 5px 8px;
  }
  .map-area {
    grid-area: map;
    position: relative;
    overflow: hidden;
    background:
      radial-gradient(ellipse at 30% 20%, rgba(80, 60, 160, 0.12), transparent 60%),
      radial-gradient(ellipse at 80% 80%, rgba(40, 90, 160, 0.1), transparent 60%),
      var(--bg);
  }
  @media (max-width: 820px) {
    .layout {
      grid-template-columns: 1fr;
      grid-template-areas: 'top' 'map';
    }
    .ctl span,
    .brand b {
      display: none;
    }
    .brand {
      display: none;
    }
  }
</style>
