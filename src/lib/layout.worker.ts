/// <reference lib="webworker" />
import { computeLayout, normalize, type LayoutInput } from './core/layout.ts';

export type WorkerIn = LayoutInput & { job: number };
export type WorkerOut =
  | { job: number; type: 'tick'; pos: Float64Array; progress: number }
  | { job: number; type: 'done'; pos: Float64Array; cluster: Int32Array; clusterCount: number };

self.onmessage = (e: MessageEvent<WorkerIn>) => {
  const { job, ...input } = e.data;
  let last = 0;
  const res = computeLayout(input, (pos, progress) => {
    const now = performance.now();
    if (now - last < 50) return;
    last = now;
    const p = normalize(pos);
    (self as unknown as Worker).postMessage({ job, type: 'tick', pos: p, progress } satisfies WorkerOut, [p.buffer]);
  });
  (self as unknown as Worker).postMessage(
    { job, type: 'done', pos: res.pos, cluster: res.cluster, clusterCount: res.clusterCount } satisfies WorkerOut,
    [res.pos.buffer, res.cluster.buffer],
  );
};
