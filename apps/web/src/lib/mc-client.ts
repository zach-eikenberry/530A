import type { MonteCarloResult, Projection, ScenarioState } from '@530a/engine'
import type { McRequest, McResponse } from '../workers/mc-worker'

/**
 * Promise wrapper around the Monte-Carlo worker. Superseded requests are
 * ignored on arrival (latest-wins), so slider scrubbing never renders stale
 * ranges. A crashed, unloadable, or hung worker rejects every in-flight
 * request with WorkerFailedError (callers fall back to the deterministic
 * projection) and is torn down so the next request starts a fresh worker.
 */

export interface McRun {
  mc: MonteCarloResult
  projection: Projection
}

/** Worker-level failure (crash / failed load / timeout) — not an engine input error. */
export class WorkerFailedError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'WorkerFailedError'
  }
}

/** A response slower than this means the worker is hung or never loaded. */
const WATCHDOG_MS = 12_000

interface Pending {
  resolve: (r: McRun) => void
  reject: (e: Error) => void
  watchdog: ReturnType<typeof setTimeout>
}

let worker: Worker | null = null
let nextId = 1
const pending = new Map<number, Pending>()

function settle(id: number): Pending | undefined {
  const entry = pending.get(id)
  if (entry) {
    pending.delete(id)
    clearTimeout(entry.watchdog)
  }
  return entry
}

/** Tear down the worker; the next request creates a fresh one (retry path). */
export function resetWorker(): void {
  worker?.terminate()
  worker = null
}

function failAll(message: string): void {
  resetWorker()
  const ids = [...pending.keys()]
  for (const id of ids) settle(id)?.reject(new WorkerFailedError(message))
}

function ensureWorker(): Worker {
  if (worker) return worker
  worker = new Worker(new URL('../workers/mc-worker.ts', import.meta.url), { type: 'module' })
  worker.onmessage = (e: MessageEvent<McResponse>) => {
    const entry = settle(e.data.id)
    if (!entry) return
    if (e.data.ok) entry.resolve({ mc: e.data.mc, projection: e.data.projection })
    else entry.reject(new Error(e.data.error))
  }
  worker.onerror = () => failAll('simulation worker failed to run')
  worker.onmessageerror = () => failAll('simulation worker sent an unreadable response')
  return worker
}

export function runMonteCarlo(state: ScenarioState): { id: number; result: Promise<McRun> } {
  const id = nextId++
  const result = new Promise<McRun>((resolve, reject) => {
    const watchdog = setTimeout(
      () => failAll('simulation timed out — the worker appears hung'),
      WATCHDOG_MS,
    )
    pending.set(id, { resolve, reject, watchdog })
    const request: McRequest = { id, state }
    ensureWorker().postMessage(request)
  })
  return { id, result }
}

export const SUPERSEDED = 'superseded'

/** Reject any in-flight requests older than `latestId` (latest-wins UI). */
export function cancelBefore(latestId: number): void {
  for (const id of [...pending.keys()]) {
    if (id < latestId) settle(id)?.reject(new Error(SUPERSEDED))
  }
}
