import type { AnimeNode, Dataset } from './core/types.ts';
import { DEMOGRAPHICS } from './i18n.ts';

export interface Store {
  ds: Dataset;
  nodes: AnimeNode[];
  /** vecinos por índice: [índice, peso] ordenados por peso desc */
  adj: [number, number][][];
  /** idMal -> índice de nodo (incluye todas las obras de la franquicia) */
  byMal: Map<number, number>;
  /** idAniList -> índice de nodo (incluye todas las obras de la franquicia) */
  byAnilist: Map<number, number>;
  /** demografía (Shounen, Seinen...) por nodo, derivada de las etiquetas */
  demo: (string | null)[];
  genres: string[];
  /** etiquetas usadas por ≥ 3 obras, ordenadas por frecuencia */
  tagOptions: { idx: number; name: string; count: number }[];
  studioOptions: { idx: number; name: string; count: number }[];
  sources: string[];
  countries: string[];
  years: [number, number];
  maxEpisodes: number;
}

export async function loadStore(): Promise<Store> {
  const res = await fetch(`${import.meta.env.BASE_URL}data/anime.json`);
  if (!res.ok) throw new Error(`No se pudo cargar el dataset (${res.status})`);
  const ds = (await res.json()) as Dataset;
  const nodes = ds.nodes;

  const adj: [number, number][][] = nodes.map(() => []);
  for (const [a, b, w] of ds.edges) {
    adj[a].push([b, w]);
    adj[b].push([a, w]);
  }
  for (const l of adj) l.sort((x, y) => y[1] - x[1]);

  const byMal = new Map<number, number>();
  const byAnilist = new Map<number, number>();
  nodes.forEach((n, i) => {
    for (const [al, ml] of n.m) {
      byAnilist.set(al, i);
      if (ml) byMal.set(ml, i);
    }
    byAnilist.set(n.id, i);
    if (n.mal) byMal.set(n.mal, i);
  });

  const demoTag = new Map<number, string>();
  ds.tags.forEach((t, i) => {
    if (DEMOGRAPHICS.includes(t.name)) demoTag.set(i, t.name);
  });
  const demo = nodes.map((n) => {
    let best: [string, number] | null = null;
    for (const [t, r] of n.tg) {
      const d = demoTag.get(t);
      if (d && (!best || r > best[1])) best = [d, r];
    }
    return best ? best[0] : null;
  });

  const count = <K>(get: (n: AnimeNode) => K[]) => {
    const m = new Map<K, number>();
    for (const n of nodes) for (const k of get(n)) m.set(k, (m.get(k) ?? 0) + 1);
    return m;
  };
  const genreCount = count((n) => n.g);
  const tagCount = count((n) => n.tg.map(([t]) => t));
  const studioCount = count((n) => n.stu);
  const years = nodes.map((n) => n.yr).filter((y): y is number => !!y);

  return {
    ds,
    nodes,
    adj,
    byMal,
    byAnilist,
    demo,
    genres: [...genreCount.entries()].sort((a, b) => b[1] - a[1]).map(([g]) => g),
    tagOptions: [...tagCount.entries()]
      .filter(([t, c]) => c >= 3 && !DEMOGRAPHICS.includes(ds.tags[t].name))
      .sort((a, b) => b[1] - a[1])
      .map(([idx, c]) => ({ idx, name: ds.tags[idx].name, count: c })),
    studioOptions: [...studioCount.entries()]
      .filter(([, c]) => c >= 2)
      .sort((a, b) => b[1] - a[1])
      .map(([idx, c]) => ({ idx, name: ds.studios[idx], count: c })),
    sources: [...count((n) => (n.src ? [n.src] : [])).entries()].sort((a, b) => b[1] - a[1]).map(([s]) => s),
    countries: [...count((n) => [n.cty]).entries()].sort((a, b) => b[1] - a[1]).map(([s]) => s),
    years: [Math.min(...years), Math.max(...years)],
    maxEpisodes: Math.max(...nodes.map((n) => n.ep)),
  };
}

/** Puntuación 0-10 a mostrar: MAL si existe, si no la de AniList */
export const scoreOf = (n: AnimeNode): number | null => n.msc ?? (n.sc != null ? n.sc / 10 : null);

export const titleOf = (n: AnimeNode, lang: 'romaji' | 'english') => (lang === 'english' ? n.en ?? n.t : n.t);
