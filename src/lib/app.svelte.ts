import type { Constellation } from './core/types.ts';
import { describeConstellations } from './core/constellations.ts';
import { loadStore, scoreOf, titleOf, type Store } from './data.ts';
import { applyFilters, defaultFilters, type Filters } from './filters.ts';
import { tr } from './i18n.ts';
import { hsl, type MapEngine, type NodeStyle } from './map-engine.ts';
import { continuations, recommend, type Continuation, type Recommendation } from './recommend.ts';
import { buildUserList, fetchAnilist, fetchMal, parseMalXml, type UserList } from './userlist.ts';
import type { WorkerIn, WorkerOut } from './layout.worker.ts';
import LayoutWorker from './layout.worker.ts?worker';

export type ColorMode = 'constellation' | 'score' | 'year' | 'list';
export type Tab = 'explore' | 'filters' | 'foryou';

const LS_KEY = 'malmap:v2';

function loadPrefs() {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) ?? '{}');
  } catch {
    return {};
  }
}

class AppState {
  store = $state.raw<Store | null>(null);
  error = $state<string | null>(null);

  filters = $state<Filters>(null!);
  rebuild = $state(true); // reconstruir el mapa al filtrar (vs. solo atenuar)
  visible = $state.raw<Uint8Array>(new Uint8Array(0));
  visibleCount = $derived(this.visible.reduce((a, b) => a + b, 0));

  /** constelación por nodo y descripción de las constelaciones del mapa actual */
  cluster = $state.raw<Int32Array>(new Int32Array(0));
  constellations = $state.raw<Constellation[]>([]);
  layoutProgress = $state<number | null>(null);

  selected = $state<number | null>(null);
  hovered = $state<number | null>(null);
  focusConstellation = $state<number | null>(null);
  tab = $state<Tab>('explore');
  titleLang = $state<'romaji' | 'english'>('romaji');
  colorMode = $state<ColorMode>('constellation');
  history = $state<number[]>([]);

  user = $state.raw<UserList | null>(null);
  userLoading = $state(false);
  userError = $state<string | null>(null);
  discovery = $state(0.3);
  recs = $derived.by<Recommendation[]>(() =>
    this.store && this.user ? recommend(this.store, this.user, this.discovery) : [],
  );
  recRank = $derived(new Map(this.recs.map((r, k) => [r.i, k])));
  continuations = $derived.by<Continuation[]>(() =>
    this.store && this.user ? continuations(this.store, this.user) : [],
  );

  engine: MapEngine | null = null;
  private worker: Worker | null = null;
  private job = 0;
  private fullCluster = new Int32Array(0);
  private fullConstellations: Constellation[] = [];

  async init() {
    try {
      const store = await loadStore();
      const prefs = loadPrefs();
      if (prefs.titleLang) this.titleLang = prefs.titleLang;
      if (prefs.colorMode) this.colorMode = prefs.colorMode;
      if (typeof prefs.rebuild === 'boolean') this.rebuild = prefs.rebuild;
      this.filters = defaultFilters(store);
      this.visible = new Uint8Array(store.nodes.length).fill(1);
      this.fullCluster = Int32Array.from(store.nodes.map((n) => n.c));
      const pos = Float64Array.from(store.nodes.flatMap((n) => [n.x, n.y]));
      this.fullConstellations = describeConstellations(store.nodes, this.fullCluster, pos, store.ds.tags, tr.tag, tr.genre);
      this.cluster = this.fullCluster;
      this.constellations = this.fullConstellations;
      this.store = store;
      if (prefs.user?.name && prefs.user.source !== 'xml') void this.connect(prefs.user.source, prefs.user.name);
    } catch (e) {
      this.error = (e as Error).message;
    }
  }

  savePrefs() {
    try {
      localStorage.setItem(
        LS_KEY,
        JSON.stringify({
          titleLang: this.titleLang,
          colorMode: this.colorMode,
          rebuild: this.rebuild,
          user: this.user ? { source: this.user.source, name: this.user.user } : null,
        }),
      );
    } catch {
      /* almacenamiento no disponible */
    }
  }

  title(i: number) {
    return titleOf(this.store!.nodes[i], this.titleLang);
  }

  select(i: number | null, fly = true) {
    this.selected = i;
    if (i != null) {
      this.history = [i, ...this.history.filter((x) => x !== i)].slice(0, 30);
      if (fly && this.visible[i]) this.engine?.flyTo(i);
    }
  }

  // ---------- filtros y reconstrucción ----------
  applyFilters() {
    const s = this.store!;
    const mask = applyFilters(s, this.filters, this.user);
    this.visible = mask;
    const count = mask.reduce((a, b) => a + b, 0);
    const isAll = count === s.nodes.length;
    this.focusConstellation = null;
    if (!this.rebuild || isAll || count < 3) {
      this.worker?.terminate();
      this.worker = null;
      this.layoutProgress = null;
      this.cluster = this.fullCluster;
      this.constellations = this.fullConstellations;
      this.engine?.setConstellations(this.constellations, this.cluster);
      this.engine?.setVisible(mask, !this.rebuild && !isAll);
      this.engine?.setPositions(Float64Array.from(s.nodes.flatMap((n) => [n.x, n.y])), 600);
      if (isAll || !this.rebuild) this.engine?.resetCamera();
      return;
    }
    this.engine?.setVisible(mask, false);
    this.rebuildLayout(mask);
  }

  private rebuildLayout(mask: Uint8Array) {
    const s = this.store!;
    const idx: number[] = [];
    const local = new Int32Array(s.nodes.length).fill(-1);
    mask.forEach((v, i) => {
      if (v) {
        local[i] = idx.length;
        idx.push(i);
      }
    });
    const edges: [number, number, number][] = [];
    const deg = new Int32Array(idx.length);
    for (const [a, b, w] of s.ds.edges)
      if (local[a] >= 0 && local[b] >= 0) {
        edges.push([local[a], local[b], w]);
        deg[local[a]]++;
        deg[local[b]]++;
      }
    // Series que se quedan sin vecinos al filtrar: se enlazan débilmente con las
    // series visibles a dos saltos en el grafo completo (vecinos de sus vecinos).
    idx.forEach((g, k) => {
      if (deg[k] > 0) return;
      const cand = new Map<number, number>();
      for (const [j, w1] of s.adj[g])
        for (const [h, w2] of s.adj[j]) if (h !== g && local[h] >= 0) cand.set(h, (cand.get(h) ?? 0) + w1 * w2);
      [...cand.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 2)
        .forEach(([h, w]) => edges.push([k, local[h], Math.max(0.01, w)]));
    });
    const current = this.engine?.currentPositions();
    const init = new Float64Array(2 * idx.length);
    idx.forEach((g, k) => {
      init[2 * k] = current ? current[2 * g] : s.nodes[g].x;
      init[2 * k + 1] = current ? current[2 * g + 1] : s.nodes[g].y;
    });
    const maxPop = s.nodes[0] ? Math.max(...idx.map((i) => s.nodes[i].pop)) : 1;

    this.worker?.terminate();
    this.worker = new LayoutWorker();
    const job = ++this.job;
    this.layoutProgress = 0;
    const toGlobal = (pos: Float64Array) => {
      const full = new Float64Array(2 * s.nodes.length).fill(NaN);
      idx.forEach((g, k) => ((full[2 * g] = pos[2 * k]), (full[2 * g + 1] = pos[2 * k + 1])));
      return full;
    };
    this.worker.onmessage = (e: MessageEvent<WorkerOut>) => {
      const msg = e.data;
      if (msg.job !== job) return;
      if (msg.type === 'tick') {
        this.layoutProgress = msg.progress;
        this.engine?.setPositions(toGlobal(msg.pos));
      } else {
        this.layoutProgress = null;
        const full = toGlobal(msg.pos);
        const cl = new Int32Array(s.nodes.length).fill(-1);
        idx.forEach((g, k) => (cl[g] = msg.cluster[k]));
        const sub = idx.map((g) => s.nodes[g]);
        const cons = describeConstellations(sub, msg.cluster, msg.pos, s.ds.tags, tr.tag, tr.genre);
        this.cluster = cl;
        this.constellations = cons;
        this.engine?.setPositions(full);
        this.engine?.setConstellations(cons, cl);
        this.engine?.resetCamera();
        this.worker?.terminate();
        this.worker = null;
      }
    };
    this.worker.postMessage({
      job,
      n: idx.length,
      edges,
      init,
      mass: idx.map((i) => Math.sqrt(s.nodes[i].pop / maxPop) * 4),
      iterations: 300,
      resolution: 1.4,
    } satisfies WorkerIn);
  }

  resetFilters() {
    this.filters = defaultFilters(this.store!);
    this.applyFilters();
  }

  // ---------- estilo de nodos ----------
  styles = $derived.by<NodeStyle[]>(() => {
    const s = this.store;
    if (!s) return [];
    const logs = s.nodes.map((n) => Math.log10(n.pop));
    const lo = Math.min(...logs);
    const hi = Math.max(...logs);
    const hueOf = new Map(this.constellations.map((c) => [c.id, c.hue]));
    const [y0, y1] = s.years;
    const mode = this.colorMode;
    const user = this.user;
    const recRank = this.recRank;
    const focusC = this.focusConstellation;
    return s.nodes.map((n, i) => {
      const t = (logs[i] - lo) / (hi - lo || 1);
      let size = 1.4 + 5.5 * t * t;
      let color: string;
      const st = user?.byNode.get(i);
      let emphasis = false;
      let faded = false;
      if (mode === 'score') {
        const sc = scoreOf(n);
        const k = sc == null ? 0.5 : Math.max(0, Math.min(1, (sc - 5.5) / 3.5));
        color = sc == null ? '#667' : hsl(10 + 130 * k, 80, 45 + 15 * k);
      } else if (mode === 'year') {
        const k = n.yr ? (n.yr - y0) / (y1 - y0 || 1) : 0.5;
        color = hsl(260 - 230 * k, 75, 62);
      } else if (mode === 'list' && user) {
        const rank = recRank.get(i);
        if (st?.status === 'completed') color = '#4ade80';
        else if (st?.status === 'watching') color = '#38bdf8';
        else if (st?.status === 'paused') color = '#a78bfa';
        else if (st?.status === 'dropped') color = '#f87171';
        else if (rank != null && rank < 60) {
          color = '#fcd34d';
          size = Math.max(size, 4) * 1.35;
          emphasis = rank < 15;
        } else if (st?.status === 'planned') color = '#fbbf24';
        else {
          color = hsl(hueOf.get(this.cluster[i]) ?? 220, 25, 55);
          faded = true;
        }
      } else {
        const h = hueOf.get(this.cluster[i]) ?? 220;
        const sc = scoreOf(n);
        color = hsl(h, 75, sc != null ? 52 + Math.max(0, Math.min(1, (sc - 6) / 3)) * 22 : 55);
      }
      if (focusC != null && this.cluster[i] !== focusC) faded = true;
      return { color, size, label: titleOf(n, this.titleLang), emphasis, faded };
    });
  });

  // ---------- usuario ----------
  async connect(source: 'mal' | 'anilist', name: string) {
    const s = this.store!;
    this.userLoading = true;
    this.userError = null;
    try {
      const entries = source === 'mal' ? await fetchMal(name.trim()) : await fetchAnilist(name.trim());
      this.user = buildUserList(s, source, name.trim(), entries);
      this.colorMode = 'list';
      this.tab = 'foryou';
      this.savePrefs();
    } catch (e) {
      this.userError = (e as Error).message;
    } finally {
      this.userLoading = false;
    }
  }

  async importXml(file: File) {
    this.userLoading = true;
    this.userError = null;
    try {
      const { user, entries } = await parseMalXml(file);
      this.user = buildUserList(this.store!, 'xml', user, entries);
      this.colorMode = 'list';
      this.tab = 'foryou';
    } catch (e) {
      this.userError = (e as Error).message;
    } finally {
      this.userLoading = false;
    }
  }

  disconnect() {
    this.user = null;
    if (this.colorMode === 'list') this.colorMode = 'constellation';
    if (this.filters.list !== 'all') {
      this.filters.list = 'all';
      this.applyFilters();
    }
    this.savePrefs();
  }

  /** Serie al azar bien valorada y no vista, preferentemente de una constelación poco explorada */
  surprise() {
    const s = this.store!;
    const pool: number[] = [];
    s.nodes.forEach((n, i) => {
      if (!this.visible[i]) return;
      const st = this.user?.byNode.get(i)?.status;
      if (st && st !== 'planned') return;
      const sc = scoreOf(n);
      if (sc != null && sc >= 7.3) pool.push(i);
    });
    if (!pool.length) return;
    const i = pool[Math.floor(Math.random() * pool.length)];
    this.select(i);
  }
}

export const app = new AppState();
