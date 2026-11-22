/**
 * Función serverless (Vercel / cualquier runtime con Web Fetch API).
 * GET /api/mal?user=<usuario>  →  MalListEntry[]
 * El frontend usa /api/mal/<usuario>; vercel.json reescribe esa ruta aquí.
 */
import { fetchMalList, MalListError } from '../server/mal-list.ts';

export default async function handler(req: Request): Promise<Response> {
  const user = new URL(req.url).searchParams.get('user') ?? '';
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 's-maxage=300',
  };
  try {
    return new Response(JSON.stringify(await fetchMalList(user)), { headers });
  } catch (e) {
    const status = e instanceof MalListError ? e.status : 502;
    return new Response(JSON.stringify({ error: (e as Error).message }), { status, headers });
  }
}

export const config = { runtime: 'edge' };
