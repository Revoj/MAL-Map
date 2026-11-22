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
  'Primarily Teen Cast', 'Primarily Child Cast', 'Episodic', 'Heterosexual', 'Nudity',
  'Coming of Age', 'Tragedy', 'Full CGI', 'Anachronism', 'Urban', 'Rural', 'Japan', 'Twins',
  'Tsundere', 'Kuudere', 'Primarily Animal Cast', 'Mixed Gender Harem', 'Adoption', 'Orphan',
  'Amnesia', 'Bisexual', 'Ojou-sama', 'Large Breasts', 'Lost Civilization', 'Foreign', 'Bar',
  'Chibi', 'Henshin', 'Tokusatsu', 'Philosophy', 'Ecchi',
]);
const SKIP_CATS = new Set(['Technical', 'Sexual Content', 'Cast-Traits']);

/** Título corto (hasta los dos puntos y ~22 caracteres) */
export function shortTitle(t: string, max = 22): string {
  let s = t.split(/[:：]/)[0].trim();
  if (s.length > max) s = s.slice(0, max - 1).replace(/\s+\S*$/, '') + '…';
  return s;
}

/**
 * Calcula centro, radio, color y nombre de cada constelación.
 *
 * El nombre combina géneros y etiquetas de AniList que:
 *  - cubren a buena parte de la constelación, pesando más las series populares
 *    (que son las que la gente reconoce), y
 *  - son mucho más frecuentes ahí que en el resto del mapa (lift).
 * Así se evitan nombres basados en una etiqueta que solo tienen dos series.
 */
export function describeConstellations(
  nodes: NodeLike[],
  cluster: ArrayLike<number>,
  pos: ArrayLike<number>,
  tags: { name: string; cat: string }[],
  translateTag: (t: string) => string = (t) => t,
  translateGenre: (g: string) => string = (g) => g,
): Constellation[] {
  const n = nodes.length;
  const k = n ? Math.max(...Array.from(cluster)) + 1 : 0;
  const members: number[][] = Array.from({ length: k }, () => []);
  for (let i = 0; i < n; i++) if (cluster[i] >= 0) members[cluster[i]].push(i);

  // ---- rasgos (géneros + etiquetas) con su intensidad por serie ----
  const featName: string[] = [];
  const featIndex = new Map<string, number>();
  const feat = (key: string, label: string) => {
    if (!featIndex.has(key)) {
      featIndex.set(key, featName.length);
      featName.push(label);
    }
    return featIndex.get(key)!;
  };
  const nodeFeats: [number, number][][] = nodes.map((nd) => {
    const out: [number, number][] = nd.g.map((g) => [feat(`g:${g}`, translateGenre(g)), 1]);
    for (const [t, rank] of nd.tg) {
      const tag = tags[t];
      if (SKIP_TAGS.has(tag.name) || SKIP_CATS.has(tag.cat)) continue;
      out.push([feat(`t:${t}`, translateTag(tag.name)), Math.min(1, rank / 80)]);
    }
    return out;
  });
  const F = featName.length;
  const weight = nodes.map((nd) => Math.sqrt(Math.max(1, nd.pop)));

  const globalCov = new Float64Array(F);
  let globalW = 0;
  for (let i = 0; i < n; i++) {
    globalW += weight[i];
    for (const [f, v] of nodeFeats[i]) globalCov[f] += weight[i] * v;
  }
  for (let f = 0; f < F; f++) globalCov[f] /= globalW || 1;

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

    // cobertura ponderada de cada rasgo en la constelación
    const cov = new Float64Array(F);
    let cw = 0;
    for (const i of idx) {
      cw += weight[i];
      for (const [f, v] of nodeFeats[i]) cov[f] += weight[i] * v;
    }
    const rank = (minCov: number, minLift: number) => {
      const r: [number, number][] = [];
      for (let f = 0; f < F; f++) {
        const cv = cov[f] / cw;
        if (cv < minCov) continue;
        const lift = cv / (globalCov[f] || 1e-9);
        if (lift < minLift) continue;
        r.push([f, Math.pow(cv, 1.3) * Math.log2(lift)]);
      }
      return r.sort((a, b) => b[1] - a[1]);
    };
    let ranked = rank(0.3, 1.5);
    if (ranked.length < 3) {
      const seen = new Set(ranked.map(([f]) => f));
      ranked = [...ranked, ...rank(0.2, 1.15).filter(([f]) => !seen.has(f)).map(([f, v]) => [f, v * 0.5] as [number, number])];
    }
    const picked: string[] = [];
    const best = ranked[0]?.[1] ?? 0;
    for (const [f, v] of ranked) {
      // el segundo término solo si es razonablemente fuerte
      if (picked.length >= 1 && v < best * 0.3) break;
      const name = featName[f];
      if (!picked.includes(name)) picked.push(name);
      if (picked.length === 4) break;
    }
    const top = idx.reduce((a, b) => (nodes[b].pop > nodes[a].pop ? b : a), idx[0]);
    out.push({
      id: c,
      name: '',
      candidates: picked,
      hint: nodes[top].t,
      size: idx.length,
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
    const options = [[p[0], p[1]], [p[0]], [p[0], p[2]], [p[1], p[2]], [p[0], p[3]], [p[1]]]
      .filter((o) => o.every(Boolean))
      .map((o) => o.join(' · '));
    // un solo término solo si es el preferido (evita «Escuela» a secas como respaldo)
    const pref = p.length >= 2 ? options.filter((o) => o.includes(' · ') || o === p[0]) : options;
    c.name = pref.find((o) => !used.has(o)) ?? (p[0] ? `${p[0]} · ${shortTitle(c.hint)}` : shortTitle(c.hint));
    used.add(c.name);
    delete (c as any).candidates;
  }
  return out;
}
