import { defineConfig, type Plugin } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { fetchMalList, MalListError } from './server/mal-list.ts';

/**
 * MAL no permite CORS en su endpoint de listas, así que en desarrollo/preview
 * Vite actúa de proxy: GET /api/mal/<usuario>
 * En producción usa api/mal.ts (Vercel) o define VITE_MAL_PROXY.
 */
function malProxy(): Plugin {
  const handler = async (req: any, res: any, next: () => void) => {
    const m = /^\/api\/mal\/([\w-]{2,16})\/?(\?.*)?$/.exec(req.url ?? '');
    if (!m) return next();
    res.setHeader('Content-Type', 'application/json');
    try {
      res.end(JSON.stringify(await fetchMalList(m[1])));
    } catch (e) {
      res.statusCode = e instanceof MalListError ? e.status : 502;
      res.end(JSON.stringify({ error: (e as Error).message }));
    }
  };
  return {
    name: 'mal-list-proxy',
    configureServer: (s) => void s.middlewares.use(handler),
    configurePreviewServer: (s) => void s.middlewares.use(handler),
  };
}

export default defineConfig({
  base: './',
  plugins: [svelte(), malProxy()],
  worker: { format: 'es' },
});
