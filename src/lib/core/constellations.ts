import type { Constellation } from './types.ts';

interface NodeLike {
  t: string;
  en: string | null;
  pop: number;
  g: string[];
  tg: [number, number][];
}

/** Etiquetas demasiado genéricas para nombrar una constelación */
const SKIP_TAGS = new Set([
  'Male Protagonist', 'Female Protagonist', 'Ensemble Cast', 'Primarily Adult Cast',
  'Primarily Teen Cast', 'Primarily Female Cast', 'Primarily Male Cast', 'Primarily Child Cast',
  'Episodic', 'Heterosexual', 'Nudity', 'Shounen', 'Seinen', 'Shoujo', 'Josei', 'Kids',
  'Coming of Age', 'Tragedy', 'Iyashikei', 'Cute Girls Doing Cute Things', 'Full CGI',
  'Anachronism', 'Urban', 'Rural', 'Japan', 'Twins', 'Tsundere', 'Kuudere', 'Primarily Animal Cast',
  'Female Harem', 'Male Harem', 'Cute Boys Doing Cute Things', 'Mixed Gender Harem', 'Adoption', 'Orphan', 'Amnesia',
  'Bisexual', 'Ojou-sama', 'Large Breasts', 'Ecchi', 'Lost Civilization',
]);
const SKIP_CATS = new Set(['Technical', 'Sexual Content', 'Cast-Traits']);

/**
 * Calcula centro, radio, color y nombre de cada constelación. El nombre son las dos
 * etiquetas más características (frecuentes en la constelación y raras fuera de ella).
 */
export function describeConstellations(
  nodes: NodeLike[],
  cluster: ArrayLike<number>,
  pos: ArrayLike<number>,
  tags: { name: string; cat: string }[],
  translateTag: (t: string) => string = (t) => t,
): Constellation[] {
  const n = nodes.length;
  const k = n ? Math.max(...Array.from(cluster)) + 1 : 0;
  const globalTag = new Float64Array(tags.length);
  const clusterTag: Float64Array[] = Array.from({ length: k }, () => new Float64Array(tags.length));
  const members: number[][] = Array.from({ length: k }, () => []);

  for (let i = 0; i < n; i++) {
    const c = cluster[i];
    members[c].push(i);
    for (const [t, rank] of nodes[i].tg) {
      const w = rank / 100;
      globalTag[t] += w;
      clusterTag[c][t] += w;
    }
  }

  let gx = 0;
  let gy = 0;
  for (let i = 0; i < n; i++) (gx += pos[2 * i]), (gy += pos[2 * i + 1]);
  gx /= n || 1;
  gy /= n || 1;

  const out: Constellation[] = [];
  for (let c = 0; c < k; c++) {
    const idx = members[c];
    if (!idx.length) continue;
    // centro ponderado por popularidad (más estable visualmente)
    let sx = 0;
    let sy = 0;
    let sw = 0;
    for (const i of idx) {
      const w = Math.log10(nodes[i].pop + 10);
      sx += pos[2 * i] * w;
      sy += pos[2 * i + 1] * w;
      sw += w;
    }
    const x = sx / sw;
    const y = sy / sw;
    const ds = idx.map((i) => Math.hypot(pos[2 * i] - x, pos[2 * i + 1] - y)).sort((a, b) => a - b);
    const radius = ds[Math.floor(ds.length * 0.8)] || 10;

    // etiquetas distintivas: frecuencia * lift
    const size = idx.length;
    const score = (minLift: number) => {
      const out: [number, number][] = [];
      for (let t = 0; t < tags.length; t++) {
        const inC = clusterTag[c][t];
        if (inC < Math.max(1.2, size * 0.18)) continue;
        const tag = tags[t];
        if (SKIP_TAGS.has(tag.name) || SKIP_CATS.has(tag.cat)) continue;
        const freq = inC / size;
        const lift = freq / (globalTag[t] / n);
        if (lift < minLift) continue;
        out.push([t, minLift < 1.4 ? 0.01 * Math.sqrt(freq) * lift : Math.pow(freq, 0.75) * Math.log2(lift)]);
      }
      return out;
    };
    let scored = score(1.4);
    if (scored.length < 2) scored = [...scored, ...score(1).filter(([t]) => !scored.some(([u]) => u === t))];
    scored.sort((a, b) => b[1] - a[1]);
    const picked: string[] = [];
    for (const [t] of scored) {
      const name = translateTag(tags[t].name);
      if (!picked.includes(name)) picked.push(name);
      if (picked.length === 4) break;
    }
    const top = idx.reduce((a, b) => (nodes[b].pop > nodes[a].pop ? b : a), idx[0]);
    const hint = nodes[top].t;
    out.push({
      id: c,
      name: '',
      candidates: picked,
      hint,
      size,
      x,
      y,
      radius,
      hue: (((Math.atan2(y - gy, x - gx) * 180) / Math.PI + 360) % 360),
    } as Constellation);
  }
  // nombres únicos: si dos constelaciones coinciden, se prueban otras combinaciones
  const used = new Set<string>();
  for (const c of [...out].sort((a, b) => b.size - a.size)) {
    const p = (c as any).candidates as string[];
    const options = [
      [p[0], p[1]],
      [p[0], p[2]],
      [p[1], p[2]],
      [p[0], p[3]],
      [p[0]],
    ].filter((o) => o.every(Boolean)).map((o) => o.join(' · '));
    // título corto para nombres de respaldo: hasta los dos puntos y ~22 caracteres
    let short = c.hint.split(/[:：]/)[0].trim();
    if (short.length > 22) short = short.slice(0, 21).replace(/\s+\S*$/, '') + '…';
    c.name = options.find((o) => !used.has(o)) ?? (p[0] ? `${p[0]} · ${short}` : short);
    used.add(c.name);
    delete (c as any).candidates;
  }
  return out;
}
