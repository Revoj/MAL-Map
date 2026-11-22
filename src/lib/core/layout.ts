/**
 * Núcleo compartido entre el pipeline (Node) y el navegador (Web Worker):
 * detección de constelaciones (Louvain) + disposición espacial (d3-force).
 *
 * Trabaja con arrays planos para poder enviarse a un Worker sin coste.
 */
import Graph from 'graphology';
import louvain from 'graphology-communities-louvain';
import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceCollide,
  forceX,
  forceY,
  type SimulationNodeDatum,
} from 'd3-force';

export interface LayoutInput {
  n: number;
  edges: [number, number, number][];
  /** Posiciones iniciales (x0,y0,x1,y1,...) o null para aleatorias */
  init: Float64Array | number[] | null;
  /** Peso de cada nodo (popularidad normalizada) para que los populares atraigan más */
  mass?: number[];
  iterations?: number;
  resolution?: number;
  seed?: number;
}

export interface LayoutResult {
  pos: Float64Array;
  cluster: Int32Array;
  clusterCount: number;
}

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildGraph(n: number, edges: [number, number, number][]) {
  const g = new Graph({ type: 'undirected', multi: false, allowSelfLoops: false });
  for (let i = 0; i < n; i++) g.addNode(i);
  for (const [a, b, w] of edges) {
    if (a === b) continue;
    if (g.hasEdge(a, b)) g.updateEdgeAttribute(a, b, 'weight', (x: number) => x + w);
    else g.addEdge(a, b, { weight: w });
  }
  return g;
}

/** Detecta constelaciones y funde las diminutas con su vecina más conectada. */
export function detectClusters(
  n: number,
  edges: [number, number, number][],
  resolution = 1,
  seed = 7,
): { cluster: Int32Array; count: number } {
  const g = buildGraph(n, edges);
  const rng = mulberry32(seed);
  const comm: Record<string, number> = g.size
    ? louvain(g, { resolution, getEdgeWeight: 'weight', rng })
    : Object.fromEntries(g.nodes().map((k) => [k, Number(k)]));

  const cluster = new Int32Array(n);
  for (let i = 0; i < n; i++) cluster[i] = comm[i] ?? i;

  // Constelaciones mínimas: tamaño relativo al grafo (≥ 4 nodos, ~0.4 %)
  const minSize = Math.max(4, Math.round(n * 0.004));
  for (let pass = 0; pass < 3; pass++) {
    const size = new Map<number, number>();
    for (const c of cluster) size.set(c, (size.get(c) ?? 0) + 1);
    let changed = false;
    for (const [c, s] of size) {
      if (s >= minSize) continue;
      // peso hacia otras constelaciones
      const toward = new Map<number, number>();
      for (const [a, b, w] of edges) {
        if (cluster[a] === c && cluster[b] !== c) toward.set(cluster[b], (toward.get(cluster[b]) ?? 0) + w);
        else if (cluster[b] === c && cluster[a] !== c) toward.set(cluster[a], (toward.get(cluster[a]) ?? 0) + w);
      }
      let best = -1;
      let bestW = 0;
      for (const [k, w] of toward) if (w > bestW) (best = k), (bestW = w);
      if (best >= 0) {
        for (let i = 0; i < n; i++) if (cluster[i] === c) cluster[i] = best;
        changed = true;
      }
    }
    if (!changed) break;
  }

  // Las diminutas sin ninguna conexión se agrupan en una sola constelación «miscelánea»
  {
    const size = new Map<number, number>();
    for (const c of cluster) size.set(c, (size.get(c) ?? 0) + 1);
    const tiny = [...size.entries()].filter(([, s]) => s < minSize).map(([c]) => c);
    if (tiny.length > 1) {
      const target = tiny[0];
      const set = new Set(tiny);
      for (let i = 0; i < n; i++) if (set.has(cluster[i])) cluster[i] = target;
    }
  }

  // Renumerar 0..k-1 por tamaño descendente
  const size = new Map<number, number>();
  for (const c of cluster) size.set(c, (size.get(c) ?? 0) + 1);
  const order = [...size.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c);
  const remap = new Map(order.map((c, i) => [c, i]));
  for (let i = 0; i < n; i++) cluster[i] = remap.get(cluster[i])!;
  return { cluster, count: order.length };
}

/**
 * Disposición en dos fases (como el MAL-Map original, que colocaba primero los
 * clústeres y luego sus miembros):
 *  1. Se coloca cada constelación como un disco (tamaño ∝ √miembros) usando
 *     el peso de las recomendaciones entre constelaciones.
 *  2. Cada serie se coloca dentro de su constelación con las aristas internas,
 *     atraída hacia el centro de su constelación.
 */
export function runLayout(
  input: LayoutInput,
  cluster: Int32Array,
  onTick?: (pos: Float64Array, progress: number) => void,
): Float64Array {
  const { n, edges } = input;
  const iterations = input.iterations ?? 300;
  const rng = mulberry32(input.seed ?? 11);
  const k = n ? Math.max(...Array.from(cluster)) + 1 : 0;
  const size = new Int32Array(k);
  for (let i = 0; i < n; i++) size[cluster[i]]++;
  const SP = 8; // separación media entre estrellas
  const rc = (c: number) => SP * Math.sqrt(size[c]) * 0.85 + 10;

  // ---------- fase 1: constelaciones ----------
  type MetaNode = SimulationNodeDatum & { c: number; r: number };
  const meta: MetaNode[] = [];
  const R0 = Math.sqrt(n) * SP;
  for (let c = 0; c < k; c++) {
    let x = 0;
    let y = 0;
    if (input.init) {
      let m = 0;
      for (let i = 0; i < n; i++)
        if (cluster[i] === c && Number.isFinite(input.init[2 * i])) {
          x += input.init[2 * i];
          y += input.init[2 * i + 1];
          m++;
        }
      if (m) (x /= m), (y /= m);
    } else {
      const a = rng() * Math.PI * 2;
      const d = Math.sqrt(rng()) * R0;
      (x = Math.cos(a) * d), (y = Math.sin(a) * d);
    }
    meta.push({ c, r: rc(c), x, y });
  }
  if (input.init && k) {
    // reescalar centros iniciales a la escala de esta simulación
    const ext = Math.max(1, ...meta.map((m) => Math.hypot(m.x!, m.y!)));
    for (const m of meta) (m.x = (m.x! / ext) * R0), (m.y = (m.y! / ext) * R0);
  }
  const between = new Map<number, number>();
  for (const [a, b, w] of edges) {
    const ca = cluster[a];
    const cb = cluster[b];
    if (ca === cb) continue;
    const key = ca < cb ? ca * k + cb : cb * k + ca;
    between.set(key, (between.get(key) ?? 0) + w);
  }
  const metaLinks = [...between.entries()].map(([key, w]) => {
    const a = Math.floor(key / k);
    const b = key % k;
    return { source: a, target: b, w: w / Math.sqrt(size[a] * size[b]) };
  });
  const maxMW = Math.max(1e-9, ...metaLinks.map((l) => l.w));
  forceSimulation(meta)
    .force(
      'link',
      forceLink<MetaNode, any>(metaLinks)
        .id((d) => d.c)
        .strength((l) => 0.5 * Math.sqrt(l.w / maxMW))
        .distance((l) => (l.source as MetaNode).r + (l.target as MetaNode).r + 25),
    )
    .force('charge', forceManyBody<MetaNode>().strength((d) => -8 * d.r))
    .force('collide', forceCollide<MetaNode>((d) => d.r + 18).iterations(3))
    .force('x', forceX(0).strength(0.05))
    .force('y', forceY(0).strength(0.05))
    .stop()
    .tick(300);

  // ---------- fase 2: estrellas ----------
  type Star = SimulationNodeDatum & { i: number; c: number; r: number };
  const stars: Star[] = [];
  for (let i = 0; i < n; i++) {
    const m = meta[cluster[i]];
    const a = rng() * Math.PI * 2;
    const d = Math.sqrt(rng()) * m.r;
    stars.push({ i, c: cluster[i], r: 2.5 + (input.mass?.[i] ?? 0), x: m.x! + Math.cos(a) * d, y: m.y! + Math.sin(a) * d });
  }
  const intra = edges.filter(([a, b]) => cluster[a] === cluster[b]);
  const meanW = intra.reduce((s, e) => s + e[2], 0) / (intra.length || 1);
  const count = new Int32Array(n);
  for (const [a, b] of intra) count[a]++, count[b]++;
  const sim = forceSimulation(stars)
    .force(
      'link',
      forceLink<Star, any>(intra.map(([a, b, w]) => ({ source: a, target: b, w })))
        .id((d) => d.i)
        .distance(SP * 1.6)
        .strength((l) => {
          const base = 1 / Math.min(count[(l.source as Star).i], count[(l.target as Star).i]);
          return base * Math.max(0.3, Math.min(2, l.w / meanW));
        }),
    )
    .force('charge', forceManyBody<Star>().strength(-14).distanceMax(SP * 12))
    .force('collide', forceCollide<Star>((d) => d.r + 1.5))
    .force('x', forceX<Star>((d) => meta[d.c].x!).strength(0.09))
    .force('y', forceY<Star>((d) => meta[d.c].y!).strength(0.09))
    .alphaDecay(1 - Math.pow(0.001, 1 / iterations))
    .stop();

  const read = () => {
    const pos = new Float64Array(2 * n);
    for (const s of stars) (pos[2 * s.i] = s.x!), (pos[2 * s.i + 1] = s.y!);
    return pos;
  };
  for (let t = 0; t < iterations; t++) {
    sim.tick();
    if (onTick && t % 10 === 9) onTick(read(), (t + 1) / iterations);
  }
  return normalize(read());
}

/** Centra y escala para que la densidad sea constante sin importar el nº de nodos. */
export function normalize(pos: Float64Array): Float64Array {
  const n = pos.length / 2;
  if (!n) return pos;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < n; i++) (cx += pos[2 * i]), (cy += pos[2 * i + 1]);
  cx /= n;
  cy /= n;
  const d: number[] = [];
  for (let i = 0; i < n; i++) d.push(Math.hypot(pos[2 * i] - cx, pos[2 * i + 1] - cy));
  d.sort((a, b) => a - b);
  const r90 = d[Math.floor(n * 0.9)] || 1;
  const target = Math.sqrt(n) * 18; // radio deseado
  const s = target / r90;
  const out = new Float64Array(pos.length);
  for (let i = 0; i < n; i++) {
    out[2 * i] = (pos[2 * i] - cx) * s;
    out[2 * i + 1] = (pos[2 * i + 1] - cy) * s;
  }
  return out;
}

export function computeLayout(input: LayoutInput, onTick?: (pos: Float64Array, p: number) => void): LayoutResult {
  const { cluster, count } = detectClusters(input.n, input.edges, input.resolution ?? 1, input.seed ?? 7);
  const pos = runLayout(input, cluster, onTick);
  return { pos, cluster, clusterCount: count };
}
