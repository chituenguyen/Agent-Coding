// Currently executing queue item (one at a time). Module-private `let` —
// exposed via getter/setter wrappers so consumers can't accidentally reassign
// the exported `let` (Node ESM does not propagate re-binding to importers).
// `getQueueRunningInternal()` returns the raw object including `proc` for
// internal use (queueTick close handler, kill path). Public `getQueueRunning()`
// returns a shallow copy without proc.

let queueRunning = null; // { type, path, proc } | null

export function getQueueRunning() {
  if (!queueRunning) return null;
  return { type: queueRunning.type, path: queueRunning.path };
}

export function getQueueRunningInternal() {
  return queueRunning;
}

export function setQueueRunning(value) {
  queueRunning = value;
}

export function killQueueRunning() {
  if (queueRunning?.proc) {
    try {
      queueRunning.proc.kill("SIGTERM");
    } catch {}
  }
}
