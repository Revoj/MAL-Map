<script lang="ts">
  let {
    min,
    max,
    step = 1,
    value = $bindable(),
    format = (v: number) => String(v),
    onchange,
  }: {
    min: number;
    max: number;
    step?: number;
    value: [number, number];
    format?: (v: number) => string;
    onchange?: () => void;
  } = $props();

  const pct = (v: number) => ((v - min) / (max - min || 1)) * 100;

  function set(k: 0 | 1, v: number) {
    const next: [number, number] = [...value];
    next[k] = v;
    if (next[0] > next[1]) next[k === 0 ? 1 : 0] = v;
    value = next;
    onchange?.();
  }
</script>

<div class="range">
  <div class="track">
    <div class="fill" style="left:{pct(value[0])}%;right:{100 - pct(value[1])}%"></div>
  </div>
  <input type="range" {min} {max} {step} value={value[0]} oninput={(e) => set(0, +e.currentTarget.value)} aria-label="mínimo" />
  <input type="range" {min} {max} {step} value={value[1]} oninput={(e) => set(1, +e.currentTarget.value)} aria-label="máximo" />
  <div class="vals muted"><span>{format(value[0])}</span><span>{format(value[1])}</span></div>
</div>

<style>
  .range {
    position: relative;
    height: 40px;
  }
  .track {
    position: absolute;
    top: 9px;
    left: 8px;
    right: 8px;
    height: 4px;
    border-radius: 2px;
    background: rgba(255, 255, 255, 0.1);
  }
  .fill {
    position: absolute;
    top: 0;
    bottom: 0;
    background: var(--accent);
    border-radius: 2px;
  }
  input {
    position: absolute;
    left: 0;
    right: 0;
    top: 0;
    width: 100%;
    margin: 0;
    height: 22px;
    background: none;
    pointer-events: none;
    -webkit-appearance: none;
    appearance: none;
  }
  input::-webkit-slider-thumb {
    -webkit-appearance: none;
    pointer-events: auto;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: #fff;
    border: 3px solid var(--accent);
    cursor: grab;
  }
  input::-moz-range-thumb {
    pointer-events: auto;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: #fff;
    border: 3px solid var(--accent);
    cursor: grab;
  }
  input::-webkit-slider-runnable-track,
  input::-moz-range-track {
    background: none;
  }
  .vals {
    position: absolute;
    bottom: 0;
    left: 2px;
    right: 2px;
    display: flex;
    justify-content: space-between;
    font-size: 12px;
    font-variant-numeric: tabular-nums;
  }
</style>
