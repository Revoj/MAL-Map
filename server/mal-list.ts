/**
 * Descarga la lista pública de anime de un usuario de MyAnimeList.
 * Usa el mismo endpoint JSON que la web de MAL (no requiere clave),
 * paginando de 300 en 300. Se ejecuta en servidor por la política CORS de MAL.
 */
export interface MalListEntry {
  id: number; // idMal
  status: number; // 1 viendo, 2 completado, 3 en pausa, 4 abandonado, 6 pendiente
  score: number; // 0-10 (0 = sin puntuar)
  eps: number; // episodios vistos
}

export class MalListError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

const cache = new Map<string, { at: number; data: MalListEntry[] }>();

export async function fetchMalList(user: string): Promise<MalListEntry[]> {
  if (!/^[\w-]{2,16}$/.test(user)) throw new MalListError('Nombre de usuario no válido', 400);
  const key = user.toLowerCase();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 5 * 60_000) return hit.data;

  const out: MalListEntry[] = [];
  for (let offset = 0; offset < 30_000; offset += 300) {
    const res = await fetch(
      `https://myanimelist.net/animelist/${encodeURIComponent(user)}/load.json?offset=${offset}&status=7`,
      { headers: { 'User-Agent': 'mal-map/2.0', Accept: 'application/json' }, signal: AbortSignal.timeout(20_000) },
    );
    if (res.status === 400 || res.status === 404)
      throw new MalListError('Usuario no encontrado o lista privada', 404);
    if (res.status === 403 || res.status === 401) throw new MalListError('La lista de este usuario es privada', 403);
    if (!res.ok) throw new MalListError(`MyAnimeList respondió ${res.status}`, 502);
    const page = (await res.json()) as any[];
    for (const e of page)
      out.push({ id: e.anime_id, status: e.status, score: e.score ?? 0, eps: e.num_watched_episodes ?? 0 });
    if (page.length < 300) break;
  }
  cache.set(key, { at: Date.now(), data: out });
  return out;
}
