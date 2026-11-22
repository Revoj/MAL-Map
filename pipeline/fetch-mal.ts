/**
 * Paso 2 (opcional): enriquece con datos de MyAnimeList — puntuación MAL,
 * miembros, ranking y recomendaciones de usuarios de MAL.
 *
 * Fuente, por orden de preferencia:
 *   1. API oficial de MAL si existe la variable MAL_CLIENT_ID
 *      (créala gratis en https://myanimelist.net/apiconfig).
 *   2. Jikan (https://api.jikan.moe), sin clave.
 * Si ninguna responde, el paso se omite y el mapa usa solo AniList.
 *
 * Uso: MAL_CLIENT_ID=xxx node pipeline/fetch-mal.ts [popularidadMinimaAniList=6000]
 * Cachea cada obra en data/raw/mal/<idMal>.json (reanudable).
 */
import { mkdir, writeFile, readdir, readFile, access } from 'node:fs/promises';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..', 'data', 'raw');
const OUT = join(ROOT, 'mal');
const MIN_POP = Number(process.argv[2] ?? 6000);
const CLIENT_ID = process.env.MAL_CLIENT_ID;
const MAIN = new Set(['TV', 'TV_SHORT', 'ONA']);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const exists = (p: string) => access(p).then(() => true, () => false);

async function getJSON(url: string, headers: Record<string, string> = {}): Promise<any | null> {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const res = await fetch(url, { headers, signal: AbortSignal.timeout(20_000) });
      if (res.ok) return await res.json();
      if (res.status === 404) return null;
      await sleep(res.status === 429 ? 4000 * (attempt + 1) : 2000);
    } catch {
      await sleep(3000);
    }
  }
  return null;
}

type MalInfo = {
  id: number;
  score: number | null;
  members: number | null;
  rank: number | null;
  genres: string[];
  themes: string[];
  demographics: string[];
  recs: [number, number][]; // [idMal, votos]
};

async function fromOfficial(id: number): Promise<MalInfo | null> {
  const fields = 'mean,rank,num_list_users,genres,recommendations';
  const j = await getJSON(`https://api.myanimelist.net/v2/anime/${id}?fields=${fields}`, {
    'X-MAL-CLIENT-ID': CLIENT_ID!,
  });
  if (!j) return null;
  return {
    id,
    score: j.mean ?? null,
    members: j.num_list_users ?? null,
    rank: j.rank ?? null,
    genres: (j.genres ?? []).map((g: any) => g.name),
    themes: [],
    demographics: [],
    recs: (j.recommendations ?? []).map((r: any) => [r.node.id, r.num_recommendations]),
  };
}

async function fromJikan(id: number): Promise<MalInfo | null> {
  const full = await getJSON(`https://api.jikan.moe/v4/anime/${id}`);
  await sleep(1100);
  const recs = await getJSON(`https://api.jikan.moe/v4/anime/${id}/recommendations`);
  await sleep(1100);
  const d = full?.data;
  if (!d) return null;
  return {
    id,
    score: d.score ?? null,
    members: d.members ?? null,
    rank: d.rank ?? null,
    genres: (d.genres ?? []).map((g: any) => g.name),
    themes: (d.themes ?? []).map((g: any) => g.name),
    demographics: (d.demographics ?? []).map((g: any) => g.name),
    recs: (recs?.data ?? []).map((r: any) => [r.entry.mal_id, r.votes]),
  };
}

// ¿Qué fuente está disponible?
let source: ((id: number) => Promise<MalInfo | null>) | null = null;
if (CLIENT_ID && (await getJSON('https://api.myanimelist.net/v2/anime/1?fields=mean', { 'X-MAL-CLIENT-ID': CLIENT_ID }))) {
  source = fromOfficial;
  console.log('Usando la API oficial de MAL');
} else if (await getJSON('https://api.jikan.moe/v4/anime/1')) {
  source = fromJikan;
  console.log('Usando Jikan');
}
if (!source) {
  console.warn('MAL/Jikan no disponibles: se omite el enriquecimiento con datos de MAL.');
  process.exit(0);
}

const ids = new Set<number>();
for (const f of await readdir(join(ROOT, 'anilist'))) {
  for (const m of JSON.parse(await readFile(join(ROOT, 'anilist', f), 'utf8'))) {
    if (m.idMal && MAIN.has(m.format) && m.popularity >= MIN_POP) ids.add(m.idMal);
  }
}
await mkdir(OUT, { recursive: true });
let i = 0;
for (const id of ids) {
  i++;
  const file = join(OUT, `${id}.json`);
  if (await exists(file)) continue;
  const info = await source(id);
  if (info) await writeFile(file, JSON.stringify(info));
  if (source === fromOfficial) await sleep(350);
  if (i % 50 === 0) console.log(`${i}/${ids.size}`);
}
console.log('MAL listo');
