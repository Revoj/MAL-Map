import type { Store } from './data.ts';

export type Status = 'completed' | 'watching' | 'paused' | 'dropped' | 'planned';

export interface RawEntry {
  mal?: number;
  anilist?: number;
  status: Status;
  score: number; // 0-10, 0 = sin nota
}

export interface NodeStatus {
  status: Status;
  score: number | null; // media de notas de la franquicia
  /** ids (AniList) de obras de la franquicia que el usuario tiene vistas o viendo */
  seen: Set<number>;
}

export interface UserList {
  source: 'mal' | 'anilist' | 'xml';
  user: string;
  total: number;
  matched: number;
  byNode: Map<number, NodeStatus>;
  mean: number;
  std: number;
}

const MAL_STATUS: Record<number, Status> = { 1: 'watching', 2: 'completed', 3: 'paused', 4: 'dropped', 6: 'planned' };
const PRIORITY: Status[] = ['completed', 'watching', 'paused', 'dropped', 'planned'];

export const STATUS_LABEL: Record<Status, string> = {
  completed: 'Completado',
  watching: 'Viendo',
  paused: 'En pausa',
  dropped: 'Abandonado',
  planned: 'Pendiente',
};

/** Proxy para la lista de MAL: VITE_MAL_PROXY o /api/mal del propio sitio */
const MAL_PROXY = (import.meta.env.VITE_MAL_PROXY as string | undefined) ?? `${import.meta.env.BASE_URL}api/mal`;

export async function fetchMal(user: string): Promise<RawEntry[]> {
  const res = await fetch(`${MAL_PROXY.replace(/\/$/, '')}/${encodeURIComponent(user)}`);
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.error ?? `Error ${res.status} al consultar MyAnimeList`);
  return (body as { id: number; status: number; score: number }[])
    .filter((e) => MAL_STATUS[e.status])
    .map((e) => ({ mal: e.id, status: MAL_STATUS[e.status], score: e.score }));
}

export async function fetchAnilist(user: string): Promise<RawEntry[]> {
  const query = `query ($u: String) {
    MediaListCollection(userName: $u, type: ANIME) {
      lists { entries { mediaId status score(format: POINT_10_DECIMAL) media { idMal } } }
    }
  }`;
  const res = await fetch('https://graphql.anilist.co', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ query, variables: { u: user } }),
  });
  const body = await res.json();
  if (!res.ok || body.errors) {
    const msg: string = body.errors?.[0]?.message ?? `Error ${res.status}`;
    if (/not found/i.test(msg)) throw new Error('Usuario de AniList no encontrado');
    if (/private/i.test(msg)) throw new Error('La lista de este usuario de AniList es privada');
    throw new Error(msg);
  }
  const map: Record<string, Status> = {
    COMPLETED: 'completed', CURRENT: 'watching', REPEATING: 'completed', PAUSED: 'paused', DROPPED: 'dropped', PLANNING: 'planned',
  };
  const out: RawEntry[] = [];
  for (const l of body.data.MediaListCollection.lists)
    for (const e of l.entries) out.push({ anilist: e.mediaId, mal: e.media?.idMal ?? undefined, status: map[e.status] ?? 'planned', score: e.score ?? 0 });
  return out;
}

/** Importa el XML exportado desde https://myanimelist.net/panel.php?go=export (.xml o .xml.gz) */
export async function parseMalXml(file: File): Promise<{ user: string; entries: RawEntry[] }> {
  let text: string;
  if (file.name.endsWith('.gz')) {
    const stream = file.stream().pipeThrough(new DecompressionStream('gzip'));
    text = await new Response(stream).text();
  } else text = await file.text();
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if (doc.querySelector('parsererror')) throw new Error('El archivo no es un XML válido de MyAnimeList');
  const map: Record<string, Status> = {
    Completed: 'completed', Watching: 'watching', 'On-Hold': 'paused', Dropped: 'dropped', 'Plan to Watch': 'planned',
  };
  const entries: RawEntry[] = [];
  for (const a of doc.querySelectorAll('anime')) {
    const id = Number(a.querySelector('series_animedb_id')?.textContent);
    const st = map[a.querySelector('my_status')?.textContent?.trim() ?? ''];
    if (id && st) entries.push({ mal: id, status: st, score: Number(a.querySelector('my_score')?.textContent) || 0 });
  }
  return { user: doc.querySelector('user_name')?.textContent ?? 'importado', entries };
}

/** Proyecta las entradas del usuario sobre los nodos del mapa (por franquicia) */
export function buildUserList(s: Store, source: UserList['source'], user: string, entries: RawEntry[]): UserList {
  const tmp = new Map<number, { statuses: Status[]; scores: number[]; seen: Set<number> }>();
  let matched = 0;
  for (const e of entries) {
    const i = (e.anilist != null ? s.byAnilist.get(e.anilist) : undefined) ?? (e.mal ? s.byMal.get(e.mal) : undefined);
    if (i === undefined) continue;
    matched++;
    if (!tmp.has(i)) tmp.set(i, { statuses: [], scores: [], seen: new Set() });
    const t = tmp.get(i)!;
    t.statuses.push(e.status);
    if (e.score > 0) t.scores.push(e.score);
    if (e.status === 'completed' || e.status === 'watching') {
      const member = s.nodes[i].m.find(([al, ml]) => (e.anilist != null && al === e.anilist) || (!!e.mal && ml === e.mal));
      if (member) t.seen.add(member[0]);
    }
  }
  const byNode = new Map<number, NodeStatus>();
  const all: number[] = [];
  for (const [i, t] of tmp) {
    const status = PRIORITY.find((p) => t.statuses.includes(p))!;
    const score = t.scores.length ? t.scores.reduce((a, b) => a + b, 0) / t.scores.length : null;
    if (score != null) all.push(score);
    byNode.set(i, { status, score, seen: t.seen });
  }
  const mean = all.length ? all.reduce((a, b) => a + b, 0) / all.length : 7;
  const std = all.length > 1 ? Math.sqrt(all.reduce((a, b) => a + (b - mean) ** 2, 0) / all.length) || 1 : 1.5;
  return { source, user, total: entries.length, matched, byNode, mean, std };
}
