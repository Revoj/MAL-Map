/**
 * «Esqueleto» de cada constelación: el árbol de máximo peso de las
 * recomendaciones internas (Kruskal) más, opcionalmente, unas pocas aristas
 * muy fuertes. Da un dibujo limpio, tipo constelación, en lugar de una telaraña.
 *
 * Devuelve los índices (en `edges`) de las aristas que forman el esqueleto.
 */
export function constellationSkeleton(
  n: number,
  edges: [number, number, number][],
  cluster: ArrayLike<number>,
  extraStrong = 0.3,
): Set<number> {
  const order = edges
    .map((e, k) => k)
    .filter((k) => cluster[edges[k][0]] >= 0 && cluster[edges[k][0]] === cluster[edges[k][1]])
    .sort((a, b) => edges[b][2] - edges[a][2]);
  const parent = new Int32Array(n).map((_, i) => i);
  const find = (x: number): number => {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]];
      x = parent[x];
    }
    return x;
  };
  const out = new Set<number>();
  // peso máximo por nodo, para admitir como extra solo aristas casi tan fuertes como la mejor
  const best = new Float64Array(n);
  for (const k of order) {
    const [a, b, w] = edges[k];
    best[a] = Math.max(best[a], w);
    best[b] = Math.max(best[b], w);
  }
  for (const k of order) {
    const [a, b, w] = edges[k];
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) {
      parent[ra] = rb;
      out.add(k);
    } else if (w >= extraStrong && w >= 0.8 * Math.min(best[a], best[b])) {
      out.add(k); // cierra algún triángulo muy marcado, como en las constelaciones reales
    }
  }
  return out;
}
