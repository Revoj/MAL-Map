/**
 * Paso 3: construye public/data/anime.json
 *
 *  - Fusiona cada franquicia (cadenas de secuela/precuela, incluidas películas
 *    intermedias) en UN nodo: la serie principal (TV/ONA) más popular.
 *    Películas, OVAs y especiales quedan como "obras de la franquicia" del nodo.
 *  - Suma las recomendaciones de AniList (y de MAL si existe data/raw/mal)
 *    de todas las obras de la franquicia y crea aristas ponderadas.
 *  - Calcula constelaciones (Louvain) y la disposición inicial (ForceAtlas2).
 *
 * Uso: node pipeline/build.ts [popularidadMinimaAniList=6000]
 */
import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { computeLayout } from '../src/lib/core/layout.ts';
import type { AnimeNode, Dataset, Member } from '../src/lib/core/types.ts';

const ROOT = join(import.meta.dirname, '..');
const RAW = join(ROOT, 'data', 'raw');
const MIN_POP = Number(process.argv[2] ?? 4000);
const MAIN = new Set(['TV', 'TV_SHORT', 'ONA']);
const MIN_EDGE = 0.025; // peso mínimo de una arista (como el original: 0.03)

// ---------- carga ----------
const media = new Map<number, any>();
for (const f of await readdir(join(RAW, 'anilist'))) {
  for (const m of JSON.parse(await readFile(join(RAW, 'anilist', f), 'utf8'))) media.set(m.id, m);
}
const mal = new Map<number, any>();
try {
  for (const f of await readdir(join(RAW, 'mal'))) {
    const j = JSON.parse(await readFile(join(RAW, 'mal', f), 'utf8'));
    mal.set(j.id, j);
  }
} catch {
  /* sin datos MAL */
}
console.log(`AniList: ${media.size} obras · MAL: ${mal.size} obras`);
const anilistByMal = new Map<number, number>();
for (const m of media.values()) if (m.idMal) anilistByMal.set(m.idMal, m.id);

// ---------- franquicias (union-find sobre secuela/precuela) ----------
const parent = new Map<number, number>();
const find = (x: number): number => {
  let p = parent.get(x) ?? x;
  if (p !== x) {
    p = find(p);
    parent.set(x, p);
  }
  return p;
};
const union = (a: number, b: number) => {
  const ra = find(a);
  const rb = find(b);
  if (ra !== rb) parent.set(ra, rb);
};
for (const m of media.values()) {
  if (!m.format || m.format === 'MUSIC') continue;
  for (const e of m.relations.edges) {
    if ((e.relationType === 'SEQUEL' || e.relationType === 'PREQUEL') && media.has(e.node.id)) {
      const o = media.get(e.node.id);
      if (o.format && o.format !== 'MUSIC') union(m.id, e.node.id);
    }
  }
}
const groups = new Map<number, number[]>();
for (const m of media.values()) {
  if (!m.format || m.format === 'MUSIC') continue;
  const r = find(m.id);
  if (!groups.has(r)) groups.set(r, []);
  groups.get(r)!.push(m.id);
}

// Grupos sin serie principal (películas/OVAs sueltas): se anexan a la franquicia
// principal con la que tengan relación de historia paralela, padre o resumen.
const groupOf = new Map<number, number>();
for (const [r, ids] of groups) for (const id of ids) groupOf.set(id, r);
const hasMain = (r: number) => !!groups.get(r)?.some((id) => MAIN.has(media.get(id).format));
for (const [r, ids] of [...groups]) {
  if (hasMain(r)) continue;
  let target: number | null = null;
  for (const id of ids) {
    for (const e of media.get(id).relations.edges) {
      if (!['PARENT', 'SIDE_STORY', 'SUMMARY', 'SEQUEL', 'PREQUEL'].includes(e.relationType)) continue;
      const g = groupOf.get(e.node.id);
      if (g !== undefined && g !== r && hasMain(g)) target = g;
    }
  }
  if (target !== null) {
    groups.get(target)!.push(...ids);
    for (const id of ids) groupOf.set(id, target);
  }
  groups.delete(r);
}

// ---------- nodos ----------
const tagIndex = new Map<string, number>();
const tags: { name: string; cat: string }[] = [];
const studioIndex = new Map<string, number>();
const studios: string[] = [];
const idx = <T>(map: Map<string, number>, arr: T[], key: string, val: T) => {
  if (!map.has(key)) {
    map.set(key, arr.length);
    arr.push(val);
  }
  return map.get(key)!;
};

interface Group {
  canon: any;
  ids: number[];
  main: any[];
}
const kept: Group[] = [];
for (const ids of groups.values()) {
  const all = ids.map((id) => media.get(id));
  const main = all.filter((m) => MAIN.has(m.format));
  if (!main.length) continue;
  const canon = main.reduce((a, b) => (b.popularity > a.popularity ? b : a));
  if (canon.popularity < MIN_POP) continue;
  if (canon.format === 'TV_SHORT' && canon.popularity < MIN_POP * 3) continue;
  kept.push({ canon, ids, main });
}

const scoreOf = (m: any) => m.averageScore ?? m.meanScore ?? null;
const nodes: AnimeNode[] = kept.map(({ canon, ids, main }) => {
  const years = main.map((m) => m.seasonYear ?? m.startDate?.year).filter(Boolean) as number[];
  // puntuación: media ponderada por popularidad de las temporadas principales
  let sw = 0;
  let ss = 0;
  for (const m of main) if (scoreOf(m)) (ss += scoreOf(m) * m.popularity), (sw += m.popularity);
  const malInfo = canon.idMal ? mal.get(canon.idMal) : null;
  const releasing = main.some((m) => m.status === 'RELEASING');
  const upcoming = main.every((m) => m.status === 'NOT_YET_RELEASED');
  const members: Member[] = ids
    .map((id) => media.get(id))
    .sort((a, b) => (a.startDate?.year ?? 9999) - (b.startDate?.year ?? 9999) || (a.startDate?.month ?? 0) - (b.startDate?.month ?? 0))
    // las «series» de 1-3 episodios (one-shots en formato TV/ONA) se tratan como especiales
    .map((m) => [
      m.id,
      m.idMal ?? 0,
      MAIN.has(m.format) && m.episodes != null && m.episodes < 4 ? 'SPECIAL' : m.format,
      m.startDate?.year ?? 0,
      m.title.english ?? m.title.romaji,
    ]);
  return {
    id: canon.id,
    mal: canon.idMal ?? 0,
    t: canon.title.romaji,
    en: canon.title.english,
    nat: canon.title.native,
    img: canon.coverImage.large ?? canon.coverImage.medium,
    col: canon.coverImage.color,
    f: canon.format,
    yr: years.length ? Math.min(...years) : null,
    yr2: years.length ? Math.max(...years) : null,
    season: canon.season,
    // episodios desconocidos (serie en emisión sin total) → 0 = «?»
    ep: main.some((m) => m.episodes == null && m.status === 'RELEASING') ? 0 : main.reduce((s, m) => s + (m.episodes ?? 0), 0),
    dur: canon.duration,
    seasons: Math.max(1, main.filter((m) => m.episodes == null || m.episodes >= 4).length),
    sc: sw ? Math.round(ss / sw) : null,
    msc: malInfo?.score ?? null,
    mem: malInfo?.members ?? null,
    pop: canon.popularity,
    fav: canon.favourites,
    st: releasing ? 'RELEASING' : upcoming ? 'NOT_YET_RELEASED' : canon.status,
    src: canon.source,
    cty: canon.countryOfOrigin,
    g: canon.genres,
    tg: canon.tags
      .filter((t: any) => !t.isAdult && !t.isMediaSpoiler && t.rank >= 50)
      .map((t: any) => [idx(tagIndex, tags, t.name, { name: t.name, cat: t.category }), t.rank]),
    stu: canon.studios.nodes.filter((s: any) => s.isAnimationStudio).map((s: any) => idx(studioIndex, studios, s.name, s.name)),
    m: members,
    x: 0,
    y: 0,
    c: 0,
  };
});
const nodeOfMedia = new Map<number, number>(); // id AniList -> índice de nodo
kept.forEach((g, i) => g.ids.forEach((id) => nodeOfMedia.set(id, i)));

// ---------- aristas ----------
// recs[i] = Map<j, votos>, sumando AniList y MAL sobre toda la franquicia
const recs: Map<number, number>[] = kept.map(() => new Map());
const add = (i: number, target: number | undefined, votes: number) => {
  if (target === undefined || target === i || votes <= 0) return;
  recs[i].set(target, (recs[i].get(target) ?? 0) + votes);
};
kept.forEach((g, i) => {
  for (const id of g.ids) {
    const m = media.get(id);
    for (const r of m.recommendations.nodes) {
      if (r.mediaRecommendation) add(i, nodeOfMedia.get(r.mediaRecommendation.id), r.rating);
    }
    const mi = m.idMal ? mal.get(m.idMal) : null;
    if (mi) {
      for (const [malId, votes] of mi.recs) {
        const al = anilistByMal.get(malId);
        add(i, al === undefined ? undefined : nodeOfMedia.get(al), votes);
      }
    }
  }
});
// Peso como el original: votos / total de votos del nodo, simétrico
const totals = recs.map((r) => [...r.values()].reduce((a, b) => a + b, 0));
const ew = new Map<string, number>();
recs.forEach((r, i) => {
  for (const [j, v] of r) {
    const key = i < j ? `${i}-${j}` : `${j}-${i}`;
    ew.set(key, (ew.get(key) ?? 0) + v / totals[i] / 2);
  }
});
const all = [...ew.entries()].map(([k, w]) => {
  const [a, b] = k.split('-').map(Number);
  return [a, b, w] as [number, number, number];
});
// se conservan las fuertes + las 2 mejores de cada nodo (para no dejar estrellas sueltas)
const keepKey = new Set<string>();
const best = new Map<number, [number, number, number][]>();
for (const e of all) {
  if (e[2] >= MIN_EDGE) keepKey.add(`${e[0]}-${e[1]}`);
  for (const v of [e[0], e[1]]) {
    if (!best.has(v)) best.set(v, []);
    best.get(v)!.push(e);
  }
}
for (const list of best.values()) {
  list.sort((a, b) => b[2] - a[2]);
  for (const e of list.slice(0, 2)) keepKey.add(`${e[0]}-${e[1]}`);
}
let edges = all.filter((e) => keepKey.has(`${e[0]}-${e[1]}`));

// quitar nodos aislados (sin ninguna recomendación)
const degree = new Int32Array(nodes.length);
for (const [a, b] of edges) degree[a]++, degree[b]++;
const alive = nodes.map((_, i) => degree[i] > 0);
const remap = new Map<number, number>();
const finalNodes: AnimeNode[] = [];
nodes.forEach((nd, i) => {
  if (alive[i]) {
    remap.set(i, finalNodes.length);
    finalNodes.push(nd);
  }
});
edges = edges
  .filter(([a, b]) => alive[a] && alive[b])
  .map(([a, b, w]) => [remap.get(a)!, remap.get(b)!, Math.round(w * 1000) / 1000] as [number, number, number]);
console.log(`Nodos: ${finalNodes.length} (descartados ${nodes.length - finalNodes.length} sin recomendaciones) · Aristas: ${edges.length}`);

// ---------- layout ----------
const maxPop = Math.max(...finalNodes.map((n) => n.pop));
const t0 = Date.now();
const { pos, cluster, clusterCount } = computeLayout({
  n: finalNodes.length,
  edges,
  init: null,
  mass: finalNodes.map((n) => Math.sqrt(n.pop / maxPop) * 4),
  iterations: 400,
  resolution: 1.4,
});
console.log(`Layout: ${clusterCount} constelaciones en ${((Date.now() - t0) / 1000).toFixed(1)}s`);
finalNodes.forEach((nd, i) => {
  nd.x = Math.round(pos[2 * i] * 10) / 10;
  nd.y = Math.round(pos[2 * i + 1] * 10) / 10;
  nd.c = cluster[i];
});

const dataset: Dataset = {
  version: 2,
  generated: new Date().toISOString(),
  sources: mal.size ? ['AniList', 'MyAnimeList'] : ['AniList'],
  tags,
  studios,
  nodes: finalNodes,
  edges,
};
await mkdir(join(ROOT, 'public', 'data'), { recursive: true });
const out = join(ROOT, 'public', 'data', 'anime.json');
await writeFile(out, JSON.stringify(dataset));
console.log(`Escrito ${out}`);
