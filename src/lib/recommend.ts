import type { Store } from './data.ts';
import { scoreOf } from './data.ts';
import type { UserList, NodeStatus } from './userlist.ts';
import type { Member } from './core/types.ts';

export interface Recommendation {
  i: number;
  score: number; // 0-100 relativo
  because: number[]; // nodos vistos que más contribuyen
  planned: boolean;
}

const SEEN = new Set(['completed', 'watching', 'paused', 'dropped']);
const MAIN = new Set(['TV', 'TV_SHORT', 'ONA']);

/** Afinidad del usuario con una franquicia vista (-1.5 .. 2) */
export function affinity(st: NodeStatus, u: UserList): number {
  const z = st.score != null ? (st.score - u.mean) / u.std : null;
  switch (st.status) {
    case 'completed':
    case 'watching':
      return z != null ? Math.max(-1.5, Math.min(2, 0.7 + 0.6 * z)) : st.status === 'completed' ? 0.55 : 0.4;
    case 'paused':
      return z != null ? Math.max(-1, Math.min(1, 0.2 + 0.4 * z)) : 0.1;
    case 'dropped':
      return z != null ? Math.min(-0.3, -0.6 + 0.3 * z) : -0.8;
    default:
      return 0;
  }
}

/**
 * Recomendaciones personalizadas: PageRank personalizado sobre el grafo de
 * recomendaciones, sembrado con las franquicias que el usuario valoró bien,
 * restando la influencia de las que valoró mal o abandonó.
 *
 * @param discovery 0 = prioriza populares, 1 = prioriza joyas poco conocidas
 */
export function recommend(s: Store, u: UserList, discovery = 0.3, limit = 300): Recommendation[] {
  const n = s.nodes.length;
  const r = new Float64Array(n);
  const seed = new Float64Array(n);
  let seedSum = 0;
  for (const [i, st] of u.byNode) {
    r[i] = affinity(st, u);
    if (r[i] > 0) (seed[i] = r[i]), (seedSum += r[i]);
  }
  if (!seedSum) return [];
  for (let i = 0; i < n; i++) seed[i] /= seedSum;

  const deg = s.adj.map((l) => l.reduce((a, [, w]) => a + w, 0) || 1);
  // PageRank personalizado (empuje desde cada nodo a sus vecinos)
  const alpha = 0.3;
  let p = Float64Array.from(seed);
  for (let it = 0; it < 25; it++) {
    const next = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      if (!p[i]) continue;
      const share = ((1 - alpha) * p[i]) / deg[i];
      for (const [j, w] of s.adj[i]) next[j] += share * w;
    }
    for (let i = 0; i < n; i++) next[i] += alpha * seed[i];
    p = next;
  }
  // penalización por vecinos que no gustaron
  const neg = new Float64Array(n);
  for (const [i] of u.byNode) {
    if (r[i] >= 0) continue;
    for (const [j, w] of s.adj[i]) neg[j] += -r[i] * w;
  }

  const pops = s.nodes.map((x) => x.pop).sort((a, b) => a - b);
  const median = pops[Math.floor(pops.length / 2)];
  const raw: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const st = u.byNode.get(i);
    if (st && SEEN.has(st.status)) continue;
    if (s.nodes[i].st === 'NOT_YET_RELEASED') continue;
    let v = p[i] / Math.pow(deg[i], 0.2) - (neg[i] / seedSum) * 0.6;
    if (v <= 0) continue;
    const sc = scoreOf(s.nodes[i]);
    const q = sc != null ? Math.max(0, Math.min(1, (sc - 5.5) / 3.5)) : 0.4;
    v *= 0.5 + q;
    v *= Math.pow(s.nodes[i].pop / median, -0.45 * discovery + 0.15 * (1 - discovery));
    raw.push([i, v]);
  }
  raw.sort((a, b) => b[1] - a[1]);
  const top = raw.slice(0, limit);
  const max = top[0]?.[1] ?? 1;
  return top.map(([i, v]) => ({
    i,
    score: Math.round((100 * v) / max),
    because: explain(s, u, r, i),
    planned: u.byNode.get(i)?.status === 'planned',
  }));
}

/** Franquicias vistas que más empujan hacia el nodo i (vecinos directos) */
export function explain(s: Store, u: UserList, r: Float64Array | null, i: number): number[] {
  const out: [number, number][] = [];
  for (const [j, w] of s.adj[i]) {
    const st = u.byNode.get(j);
    if (!st) continue;
    const a = r ? r[j] : affinity(st, u);
    if (a > 0) out.push([j, a * w]);
  }
  return out.sort((a, b) => b[1] - a[1]).slice(0, 3).map(([j]) => j);
}

export interface Continuation {
  i: number;
  missing: Member[];
}

/** Franquicias empezadas con temporadas principales sin ver */
export function continuations(s: Store, u: UserList): Continuation[] {
  const year = new Date().getFullYear();
  const out: Continuation[] = [];
  for (const [i, st] of u.byNode) {
    if (st.status !== 'completed' && st.status !== 'watching') continue;
    if (!st.seen.size) continue;
    const missing = s.nodes[i].m.filter(([al, , f, y]) => MAIN.has(f) && !st.seen.has(al) && y && y <= year);
    if (missing.length) out.push({ i, missing });
  }
  const aff = (i: number) => affinity(u.byNode.get(i)!, u);
  return out.sort((a, b) => aff(b.i) - aff(a.i));
}
