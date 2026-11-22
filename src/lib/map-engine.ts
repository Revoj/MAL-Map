import Graph from 'graphology';
import Sigma from 'sigma';
import { createNodeImageProgram } from '@sigma/node-image';
import type { Constellation } from './core/types.ts';
import type { Store } from './data.ts';

export interface NodeStyle {
  color: string;
  size: number;
  label: string;
  /** se pinta por encima y con etiqueta forzada */
  emphasis?: boolean;
  /** atenuado (modo "solo atenuar" o fuera del foco) */
  faded?: boolean;
}

export function hsl(h: number, s: number, l: number, a = 1): string {
  s /= 100;
  l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const f = (n: number) => l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  const c = (x: number) => Math.round(x * 255);
  return a < 1 ? `rgba(${c(f(0))},${c(f(8))},${c(f(4))},${a})` : `rgb(${c(f(0))},${c(f(8))},${c(f(4))})`;
}

const FADED_NODE = '#262c4a';
/** Por debajo de este ratio de cámara (más zoom) se muestran las portadas */
const IMAGE_RATIO = 0.22;

/**
 * Envuelve Sigma: grafo fijo con todos los nodos; los filtros solo cambian
 * visibilidad/posiciones. Dibuja además las nebulosas y nombres de constelación.
 */
export class MapEngine {
  graph = new Graph({ type: 'undirected' });
  sigma: Sigma;
  private bg: HTMLCanvasElement;
  private labels: HTMLDivElement;
  private constellations: Constellation[] = [];
  private visible: Uint8Array;
  private styles: NodeStyle[] = [];
  private hovered: number | null = null;
  private selected: number | null = null;
  private focusSet: Set<number> | null = null;
  private dimHidden = false;
  private neighborSet = new Set<number>();
  private tween = 0;
  private imageMode = false;
  private imageTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private container: HTMLElement,
    private store: Store,
    private cb: { click: (i: number | null) => void; hover: (i: number | null) => void; constellation: (c: Constellation) => void },
  ) {
    const n = store.nodes.length;
    this.visible = new Uint8Array(n).fill(1);
    store.nodes.forEach((nd, i) => this.graph.addNode(i, { x: nd.x, y: nd.y, size: 2, color: '#fff', label: nd.t }));
    for (const [a, b, w] of store.ds.edges) if (!this.graph.hasEdge(a, b)) this.graph.addEdge(a, b, { weight: w, size: 0.4 + w * 2 });

    this.bg = document.createElement('canvas');
    this.bg.className = 'nebula';
    this.labels = document.createElement('div');
    this.labels.className = 'constellation-labels';
    container.append(this.bg);

    this.sigma = new Sigma(this.graph, container, {
      allowInvalidContainer: true,
      defaultEdgeColor: 'rgba(255,255,255,0.08)',
      labelColor: { color: '#e8ecff' },
      labelFont: 'Inter, system-ui, sans-serif',
      labelSize: 12,
      labelWeight: '500',
      labelDensity: 0.35,
      labelGridCellSize: 110,
      labelRenderedSizeThreshold: 7,
      zIndex: true,
      minCameraRatio: 0.02,
      maxCameraRatio: 3,
      hideEdgesOnMove: false,
      stagePadding: 40,
      defaultDrawNodeHover: drawHover,
      nodeProgramClasses: {
        image: createNodeImageProgram({
          size: { mode: 'force', value: 128 },
          objectFit: 'cover',
          crossOrigin: 'anonymous',
          drawingMode: 'background',
          padding: 0.06,
          drawHover,
        }),
      },
      nodeReducer: (node, data) => this.reduceNode(Number(node), data),
      edgeReducer: (edge, data) => this.reduceEdge(edge, data),
    });
    container.append(this.labels);

    this.sigma.on('clickNode', ({ node }) => cb.click(Number(node)));
    this.sigma.on('clickStage', () => cb.click(null));
    this.sigma.on('enterNode', ({ node }) => {
      this.hovered = Number(node);
      container.style.cursor = 'pointer';
      cb.hover(this.hovered);
      this.sigma.refresh({ skipIndexation: true });
    });
    this.sigma.on('leaveNode', () => {
      this.hovered = null;
      container.style.cursor = '';
      cb.hover(null);
      this.sigma.refresh({ skipIndexation: true });
    });
    this.sigma.on('afterRender', () => this.drawOverlay());
    this.sigma.getCamera().on('updated', (state) => {
      this.drawOverlay();
      // modo portada: al acercarse se vuelven a evaluar los nodos visibles (con retardo)
      const want = state.ratio < IMAGE_RATIO;
      if (want || want !== this.imageMode) {
        clearTimeout(this.imageTimer);
        this.imageTimer = setTimeout(() => {
          this.imageMode = want;
          this.sigma.refresh({ skipIndexation: true });
        }, 150);
      }
    });
    new ResizeObserver(() => this.drawOverlay()).observe(container);
  }

  /** Vecinos del nodo seleccionado (el hover NO atenúa nada, para evitar parpadeos) */
  private updateNeighbors() {
    this.neighborSet.clear();
    const c = this.selected;
    if (c == null) return;
    this.neighborSet.add(c);
    for (const [j] of this.store.adj[c]) if (this.visible[j]) this.neighborSet.add(j);
  }

  /** ¿Está el nodo dentro de la pantalla (con margen)? */
  private onScreen(x: number, y: number) {
    const p = this.sigma.graphToViewport({ x, y });
    const { width, height } = this.sigma.getDimensions();
    const m = 120;
    return p.x > -m && p.y > -m && p.x < width + m && p.y < height + m;
  }

  private reduceNode(i: number, data: any) {
    const st = this.styles[i];
    const out: any = { ...data };
    if (!this.visible[i]) {
      if (!this.dimHidden) return { ...out, hidden: true };
      return { ...out, color: FADED_NODE, label: '', size: Math.max(1, (st?.size ?? 2) * 0.6), zIndex: 0 };
    }
    let faded = !!st?.faded;
    let focusFaded = false; // atenuado por selección/foco (sin portada)
    if (st) {
      out.color = st.color;
      out.size = st.size;
      out.label = st.label;
      out.zIndex = st.emphasis ? 2 : 1;
      if (st.emphasis) out.forceLabel = true;
    }
    const sel = this.selected;
    if (sel != null) {
      if (this.neighborSet.has(i)) {
        faded = false;
        out.zIndex = 3;
        out.forceLabel = true;
      } else {
        faded = focusFaded = true;
        out.forceLabel = false;
      }
      if (i === sel) {
        out.highlighted = true;
        out.size *= 1.4;
      }
    } else if (this.focusSet && !this.focusSet.has(i)) faded = focusFaded = true;
    if (faded) {
      out.color = FADED_NODE;
      out.label = '';
      out.forceLabel = false;
    }
    // portadas dentro de las estrellas al acercarse
    if (this.imageMode && !focusFaded && this.onScreen(data.x, data.y)) {
      out.type = 'image';
      out.image = this.store.nodes[i].img;
      out.size *= 1.5;
      out.label = st?.label ?? out.label;
    }
    if (i === this.hovered) {
      out.highlighted = true;
      out.zIndex = 4;
      out.size *= 1.25;
    }
    return out;
  }

  private reduceEdge(edge: string, data: any) {
    const [a, b] = this.graph.extremities(edge).map(Number);
    if (!this.visible[a] || !this.visible[b]) return { ...data, hidden: true };
    const sel = this.selected;
    if (sel != null) {
      if (a === sel || b === sel) {
        const other = a === sel ? b : a;
        return { ...data, color: this.styles[other]?.color ?? '#fff', size: 0.8 + data.weight * 6, zIndex: 2 };
      }
      if (a !== this.hovered && b !== this.hovered) return { ...data, hidden: true };
    }
    const h = this.hovered;
    if (h != null && (a === h || b === h)) {
      // hover: solo se resaltan sus conexiones, sin apagar el resto
      return { ...data, color: 'rgba(255,255,255,0.55)', size: 0.6 + data.weight * 4, zIndex: 3 };
    }
    if (this.focusSet && !(this.focusSet.has(a) && this.focusSet.has(b))) return { ...data, hidden: true };
    const sa = this.styles[a];
    const sb = this.styles[b];
    if (sa?.faded || sb?.faded) return { ...data, hidden: true };
    const color = this.edgeColor(a, b);
    return color ? { ...data, color } : { ...data, hidden: true };
  }

  private edgeColors = new Map<number, string>();
  private edgeColor(a: number, b: number): string | null {
    const ca = this.constOf[a];
    if (ca !== this.constOf[b]) return null;
    let c = this.edgeColors.get(ca);
    if (!c) {
      const k = this.constellations.find((x) => x.id === ca);
      c = k ? hsl(k.hue, 75, 60, 0.09) : 'rgba(255,255,255,0.05)';
      this.edgeColors.set(ca, c);
    }
    return c;
  }
  private constOf: Int32Array = new Int32Array(0);

  setVisible(mask: Uint8Array, dimHidden: boolean) {
    this.visible = mask;
    this.dimHidden = dimHidden;
    this.updateNeighbors();
    this.sigma.refresh();
  }

  setStyles(styles: NodeStyle[]) {
    this.styles = styles;
    this.sigma.refresh({ skipIndexation: true });
  }

  setSelected(i: number | null) {
    this.selected = i;
    this.updateNeighbors();
    this.sigma.refresh({ skipIndexation: true });
  }

  setFocusSet(set: Set<number> | null) {
    this.focusSet = set;
    this.sigma.refresh({ skipIndexation: true });
  }

  setConstellations(list: Constellation[], cluster: Int32Array) {
    this.constellations = list;
    this.constOf = cluster;
    this.edgeColors.clear();
    this.sigma.refresh({ skipIndexation: true });
  }

  /** Posiciona los nodos (pos indexado por nodo; los ocultos se llevan al centro) */
  setPositions(pos: Float64Array, animateMs = 0) {
    cancelAnimationFrame(this.tween);
    const n = this.store.nodes.length;
    const target = new Float64Array(2 * n);
    for (let i = 0; i < n; i++) {
      const ok = Number.isFinite(pos[2 * i]);
      target[2 * i] = ok ? pos[2 * i] : 0;
      target[2 * i + 1] = ok ? pos[2 * i + 1] : 0;
    }
    if (!animateMs) {
      this.graph.updateEachNodeAttributes((k, a) => ({ ...a, x: target[2 * +k], y: target[2 * +k + 1] }), {
        attributes: ['x', 'y'],
      });
      return;
    }
    const from = new Float64Array(2 * n);
    this.graph.forEachNode((k, a) => ((from[2 * +k] = a.x), (from[2 * +k + 1] = a.y)));
    const t0 = performance.now();
    const step = () => {
      const t = Math.min(1, (performance.now() - t0) / animateMs);
      const e = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
      this.graph.updateEachNodeAttributes(
        (k, a) => ({
          ...a,
          x: from[2 * +k] + (target[2 * +k] - from[2 * +k]) * e,
          y: from[2 * +k + 1] + (target[2 * +k + 1] - from[2 * +k + 1]) * e,
        }),
        { attributes: ['x', 'y'] },
      );
      if (t < 1) this.tween = requestAnimationFrame(step);
    };
    this.tween = requestAnimationFrame(step);
  }

  currentPositions(): Float64Array {
    const pos = new Float64Array(2 * this.store.nodes.length);
    this.graph.forEachNode((k, a) => ((pos[2 * +k] = a.x), (pos[2 * +k + 1] = a.y)));
    return pos;
  }

  /** Centra la cámara en un nodo, desplazándolo a la izquierda si la ficha lateral lo taparía */
  flyTo(i: number, ratio = 0.3) {
    const d = this.sigma.getNodeDisplayData(i);
    if (!d) return;
    const { width } = this.sigma.getDimensions();
    const panel = width > 700 ? 210 : 0;
    this.sigma.getCamera().animate({ x: d.x + (ratio * panel) / Math.max(width, 1), y: d.y, ratio }, { duration: 700 });
  }

  flyToPoint(x: number, y: number, radius: number) {
    // convertir coordenadas del grafo al espacio normalizado de la cámara
    const vp = this.sigma.graphToViewport({ x, y });
    const fr = this.sigma.viewportToFramedGraph(vp);
    const edge = this.sigma.viewportToFramedGraph(this.sigma.graphToViewport({ x: x + radius * 1.6, y }));
    const cam = this.sigma.getCamera();
    const span = Math.abs(edge.x - fr.x) * 2;
    cam.animate({ x: fr.x, y: fr.y, ratio: Math.max(0.05, Math.min(1, span * 1.1)) }, { duration: 800 });
  }

  resetCamera() {
    this.sigma.getCamera().animatedReset({ duration: 600 });
  }

  zoom(dir: 1 | -1) {
    const cam = this.sigma.getCamera();
    if (dir > 0) cam.animatedZoom({ duration: 300 });
    else cam.animatedUnzoom({ duration: 300 });
  }

  /** Nebulosas (fondo) + nombres de constelación (capa HTML) */
  private drawOverlay() {
    const { width, height } = this.container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    if (this.bg.width !== Math.round(width * dpr) || this.bg.height !== Math.round(height * dpr)) {
      this.bg.width = Math.round(width * dpr);
      this.bg.height = Math.round(height * dpr);
      this.bg.style.width = `${width}px`;
      this.bg.style.height = `${height}px`;
    }
    const ctx = this.bg.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.globalCompositeOperation = 'lighter';
    const ratio = this.sigma.getCamera().ratio;
    const html: string[] = [];
    const dimmed = this.selected != null || this.focusSet != null;
    const placed: [number, number, number, number][] = [];
    const sorted = [...this.constellations].sort((a, b) => b.size - a.size);
    for (const c of sorted) {
      const p = this.sigma.graphToViewport({ x: c.x, y: c.y });
      const q = this.sigma.graphToViewport({ x: c.x + c.radius, y: c.y });
      const r = Math.max(20, Math.abs(q.x - p.x) * 1.35);
      if (p.x + r < 0 || p.y + r < 0 || p.x - r > width || p.y - r > height) continue;
      const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
      g.addColorStop(0, hsl(c.hue, 70, 45, dimmed ? 0.06 : 0.16));
      g.addColorStop(1, hsl(c.hue, 70, 30, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fill();
      // nombre: visible si la constelación ocupa un tamaño razonable en pantalla
      if (c.size >= 5 && r > 24 && r < Math.max(width, height) * 1.2 && !dimmed) {
        const fs = Math.max(11, Math.min(20, r / 6));
        const op = ratio < 0.08 ? 0.35 : 0.92;
        // evitar solapes entre nombres (prioridad: constelaciones grandes)
        const w = c.name.length * fs * 0.68 + 10;
        const h = fs * 1.9;
        const box: [number, number, number, number] = [p.x - w / 2, p.y - r * 0.55 - h / 2, p.x + w / 2, p.y - r * 0.55 + h / 2];
        if (placed.some((b) => box[0] < b[2] && box[2] > b[0] && box[1] < b[3] && box[3] > b[1])) continue;
        placed.push(box);
        html.push(
          `<button class="clabel" data-id="${c.id}" style="left:${p.x}px;top:${p.y - r * 0.55}px;font-size:${fs}px;opacity:${op};color:${hsl(c.hue, 85, 80)}">${escapeHtml(c.name)}<small>${c.size} series</small></button>`,
        );
      }
    }
    this.labels.innerHTML = html.join('');
    this.labels.querySelectorAll<HTMLButtonElement>('.clabel').forEach((b) => {
      b.onclick = () => {
        const c = this.constellations.find((x) => x.id === Number(b.dataset.id));
        if (c) this.cb.constellation(c);
      };
    });
  }

  destroy() {
    cancelAnimationFrame(this.tween);
    clearTimeout(this.imageTimer);
    this.sigma.kill();
    this.bg.remove();
    this.labels.remove();
  }
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}

/** Tarjeta de hover en tema oscuro */
function drawHover(ctx: CanvasRenderingContext2D, data: any, settings: any) {
  const size = settings.labelSize;
  ctx.font = `600 ${size}px ${settings.labelFont}`;
  const label = data.label ?? '';
  const w = ctx.measureText(label).width;
  const x = data.x;
  const y = data.y;
  const pad = 6;
  ctx.fillStyle = 'rgba(12,14,30,0.92)';
  ctx.strokeStyle = data.color;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(x, y, data.size + 3, 0, Math.PI * 2);
  ctx.stroke();
  if (label) {
    const bx = x + data.size + 6;
    const by = y - size / 2 - pad;
    ctx.beginPath();
    ctx.roundRect(bx, by, w + pad * 2, size + pad * 2, 6);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.fillText(label, bx + pad, y + size / 3);
  }
}
