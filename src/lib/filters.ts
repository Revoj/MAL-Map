import type { Store } from './data.ts';
import { scoreOf } from './data.ts';
import type { UserList } from './userlist.ts';

export type TriState = 'include' | 'exclude';
export type ListFilter = 'all' | 'unseen' | 'seen' | 'planned' | 'unseen-or-planned';

export interface Filters {
  years: [number, number];
  score: [number, number]; // 0-10
  minPopularity: number; // usuarios en AniList
  maxPopularity: number; // 0 = sin límite
  episodes: [number, number];
  maxSeasons: number; // 0 = sin límite
  formats: string[]; // vacío = todos
  status: string[]; // vacío = todos
  genres: Record<string, TriState>;
  genreMode: 'all' | 'any'; // incluir: todas o alguna
  tags: Record<number, TriState>;
  demographics: string[];
  studios: number[];
  sources: string[];
  countries: string[];
  list: ListFilter;
}

export function defaultFilters(s: Store): Filters {
  return {
    years: [...s.years],
    score: [0, 10],
    minPopularity: 0,
    maxPopularity: 0,
    episodes: [0, s.maxEpisodes],
    maxSeasons: 0,
    formats: [],
    status: [],
    genres: {},
    genreMode: 'all',
    tags: {},
    demographics: [],
    studios: [],
    sources: [],
    countries: [],
    list: 'all',
  };
}

/** Número de filtros activos respecto a los valores por defecto */
export function activeCount(f: Filters, s: Store): number {
  const d = defaultFilters(s);
  let k = 0;
  if (f.years[0] !== d.years[0] || f.years[1] !== d.years[1]) k++;
  if (f.score[0] > 0 || f.score[1] < 10) k++;
  if (f.minPopularity > 0 || f.maxPopularity > 0) k++;
  if (f.episodes[0] > 0 || f.episodes[1] < d.episodes[1]) k++;
  if (f.maxSeasons) k++;
  k += +!!f.formats.length + +!!f.status.length + +!!f.demographics.length;
  k += +!!f.studios.length + +!!f.sources.length + +!!f.countries.length;
  k += Object.keys(f.genres).length + Object.keys(f.tags).length;
  if (f.list !== 'all') k++;
  return k;
}

const SEEN = new Set(['completed', 'watching', 'dropped', 'paused']);

/** Devuelve la máscara de nodos que pasan los filtros */
export function applyFilters(s: Store, f: Filters, user: UserList | null): Uint8Array {
  const pass = new Uint8Array(s.nodes.length);
  const incG = Object.entries(f.genres).filter(([, v]) => v === 'include').map(([g]) => g);
  const excG = new Set(Object.entries(f.genres).filter(([, v]) => v === 'exclude').map(([g]) => g));
  const incT = Object.entries(f.tags).filter(([, v]) => v === 'include').map(([t]) => Number(t));
  const excT = new Set(Object.entries(f.tags).filter(([, v]) => v === 'exclude').map(([t]) => Number(t)));
  const formats = new Set(f.formats);
  const status = new Set(f.status);
  const demos = new Set(f.demographics);
  const studios = new Set(f.studios);
  const sources = new Set(f.sources);
  const countries = new Set(f.countries);

  s.nodes.forEach((n, i) => {
    const yr = n.yr ?? 0;
    if (yr && (yr < f.years[0] || yr > f.years[1])) return;
    const sc = scoreOf(n);
    if ((f.score[0] > 0 || f.score[1] < 10) && (sc == null || sc < f.score[0] || sc > f.score[1])) return;
    if (n.pop < f.minPopularity) return;
    if (f.maxPopularity && n.pop > f.maxPopularity) return;
    if (n.ep && (n.ep < f.episodes[0] || n.ep > f.episodes[1])) return;
    if (f.maxSeasons && n.seasons > f.maxSeasons) return;
    if (formats.size && !formats.has(n.f)) return;
    if (status.size && !status.has(n.st)) return;
    if (demos.size && !demos.has(s.demo[i] ?? 'none')) return;
    if (studios.size && !n.stu.some((x) => studios.has(x))) return;
    if (sources.size && !sources.has(n.src ?? '')) return;
    if (countries.size && !countries.has(n.cty)) return;
    if (n.g.some((g) => excG.has(g))) return;
    if (incG.length) {
      const ok = f.genreMode === 'all' ? incG.every((g) => n.g.includes(g)) : incG.some((g) => n.g.includes(g));
      if (!ok) return;
    }
    if (excT.size && n.tg.some(([t]) => excT.has(t))) return;
    if (incT.length) {
      const has = (t: number) => n.tg.some(([x]) => x === t);
      const ok = f.genreMode === 'all' ? incT.every(has) : incT.some(has);
      if (!ok) return;
    }
    if (user && f.list !== 'all') {
      const st = user.byNode.get(i)?.status;
      const seen = !!st && SEEN.has(st);
      if (f.list === 'unseen' && (seen || st === 'planned')) return;
      if (f.list === 'unseen-or-planned' && seen) return;
      if (f.list === 'seen' && !seen) return;
      if (f.list === 'planned' && st !== 'planned') return;
    }
    pass[i] = 1;
  });
  return pass;
}
