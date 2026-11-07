// The main thread's side of the cover painter worker (coverpaint.worker.js), shared by the racks and the
// suitcase. Painting a cover with brush strokes takes tens of ms: too long for a frame.
import { coverLevel } from './coverpaint.js';
import CoverWorker from './coverpaint.worker.js?worker&inline';

let worker, workerJobs = new Map(), workerId = 0;
function coverWorker() {
  if (worker !== undefined) return worker;
  worker = null;
  try {
    if (typeof OffscreenCanvas === 'undefined' || typeof createImageBitmap === 'undefined') return null;
    worker = new CoverWorker();
    worker.onmessage = ({ data }) => {
      const job = workerJobs.get(data.id);
      workerJobs.delete(data.id);
      job?.(data.error ? null : data);
    };
    worker.onerror = () => { // the worker itself broke: everything still waiting is painted here instead
      for (const job of workerJobs.values()) job(null);
      workerJobs.clear();
      worker?.terminate(); worker = null;
    };
  } catch { worker = null; }
  return worker;
}
// resolves { bitmap, color } or null (then paint on the main thread)
export function paintOffThread(url, size) {
  const w = coverWorker();
  if (!w) return Promise.resolve(null);
  return new Promise((res) => {
    const id = ++workerId;
    workerJobs.set(id, res);
    w.postMessage({ id, url, size, level: coverLevel() });
  });
}
