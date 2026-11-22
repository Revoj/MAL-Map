/**
 * Paso 1: descarga los anime más populares de AniList (incluye el ID de MAL,
 * relaciones entre obras y recomendaciones de usuarios).
 *
 * Uso: node pipeline/fetch-anilist.ts [paginas=200]
 * Cachea cada página en data/raw/anilist/page-N.json (reanudable).
 */
import { mkdir, writeFile, readFile, access } from 'node:fs/promises';
import { join } from 'node:path';

const PAGES = Number(process.argv[2] ?? 200);
const PER_PAGE = 50;
const OUT = join(import.meta.dirname, '..', 'data', 'raw', 'anilist');

const QUERY = /* GraphQL */ `
query ($p: Int, $perPage: Int, $popLess: Int) {
  Page(page: $p, perPage: $perPage) {
    pageInfo { hasNextPage }
    media(type: ANIME, sort: POPULARITY_DESC, isAdult: false, popularity_lesser: $popLess) {
      id idMal
      title { romaji english native }
      synonyms
      format status episodes duration season seasonYear
      startDate { year month }
      averageScore meanScore popularity favourites
      genres countryOfOrigin source
      tags { name rank category isAdult isMediaSpoiler }
      studios(isMain: true) { nodes { name isAnimationStudio } }
      coverImage { large medium color }
      relations { edges { relationType node { id idMal format type popularity } } }
      recommendations(sort: RATING_DESC, perPage: 25) {
        nodes { rating mediaRecommendation { id } }
      }
    }
  }
}`;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const exists = (p: string) => access(p).then(() => true, () => false);

async function fetchPage(p: number, popLess: number): Promise<any> {
  for (let attempt = 0; attempt < 8; attempt++) {
    const res = await fetch('https://graphql.anilist.co', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ query: QUERY, variables: { p, perPage: PER_PAGE, popLess } }),
    }).catch((e) => ({ ok: false, status: 0, headers: new Headers(), json: async () => ({ e: String(e) }) }) as any);
    if (res.ok) {
      const remaining = Number(res.headers.get('x-ratelimit-remaining') ?? 10);
      if (remaining < 3) await sleep(20_000);
      return res.json();
    }
    const retry = Number(res.headers.get('retry-after') ?? 0);
    const wait = retry ? retry * 1000 + 500 : 5000 * (attempt + 1);
    console.warn(`  página ${p}: HTTP ${res.status}, reintento en ${wait / 1000}s`);
    await sleep(wait);
  }
  throw new Error(`No se pudo descargar la página ${p}`);
}

// AniList no deja paginar más allá de la página 100 (5.000 obras), así que se
// continúa en tramos: cada tramo pide obras con popularidad menor que el anterior.
const BATCH = 100;
async function minPopularity(fromPage: number, toPage: number) {
  let min = Infinity;
  for (let p = fromPage; p <= toPage; p++) {
    const file = join(OUT, `page-${p}.json`);
    if (!(await exists(file))) continue;
    for (const m of JSON.parse(await readFile(file, 'utf8'))) min = Math.min(min, m.popularity);
  }
  return min;
}

await mkdir(OUT, { recursive: true });
let popLess = 100_000_000;
for (let p = 1; p <= PAGES; p++) {
  const batch = Math.floor((p - 1) / BATCH);
  const inBatch = ((p - 1) % BATCH) + 1;
  if (inBatch === 1 && batch > 0) popLess = await minPopularity((batch - 1) * BATCH + 1, batch * BATCH) + 1;
  const file = join(OUT, `page-${p}.json`);
  if (await exists(file)) continue;
  const json = await fetchPage(inBatch, popLess);
  const media = json?.data?.Page?.media ?? [];
  await writeFile(file, JSON.stringify(media));
  console.log(`página ${p}/${PAGES}: ${media.length} obras`);
  if (!media.length) break;
  await sleep(2100); // límite actual de AniList: 30 req/min
}
console.log('AniList listo');
