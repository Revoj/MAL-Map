<script lang="ts" generics="K extends string | number">
  /** Autocompletado para elegir etiquetas o estudios (con incluir/excluir opcional) */
  let {
    options,
    selected,
    placeholder,
    onadd,
  }: {
    options: { key: K; name: string; count: number }[];
    selected: Set<K>;
    placeholder: string;
    onadd: (k: K) => void;
  } = $props();

  let q = $state('');
  let open = $state(false);
  const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const results = $derived(
    options.filter((o) => !selected.has(o.key) && (!q || norm(o.name).includes(norm(q)))).slice(0, 40),
  );
</script>

<div class="picker">
  <input
    class="input"
    {placeholder}
    bind:value={q}
    onfocus={() => (open = true)}
    onblur={() => setTimeout(() => (open = false), 150)}
  />
  {#if open && results.length}
    <ul class="panel">
      {#each results as o (o.key)}
        <li>
          <button
            onmousedown={(e) => {
              e.preventDefault();
              onadd(o.key);
              q = '';
            }}>{o.name} <span class="faint">{o.count}</span></button
          >
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .picker {
    position: relative;
  }
  ul {
    position: absolute;
    z-index: 30;
    top: calc(100% + 4px);
    left: 0;
    right: 0;
    max-height: 240px;
    overflow: auto;
    margin: 0;
    padding: 4px;
    list-style: none;
    background: var(--panel-solid);
  }
  button {
    width: 100%;
    text-align: left;
    background: none;
    border: none;
    padding: 6px 8px;
    border-radius: 6px;
    display: flex;
    justify-content: space-between;
  }
  button:hover {
    background: rgba(139, 156, 255, 0.14);
  }
</style>
