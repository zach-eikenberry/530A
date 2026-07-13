import type { MonteCarloResult, Projection, ScenarioState } from '@530a/engine'
import type { McRequest, McResponse } from '../workers/mc-worker'

/**
 * Promise wrapper around the Monte-Carlo worker. Superseded requests are
 * ignored on arrival (latest-wins), so slider scrubbing never renders stale
 * ranges.
 */

export interface McRun {
  mc: MonteCarloResult
  projection: Projection
}

let worker: Worker | null = null
let nextId = 1
const pending = new Map<number, { resolve: (r: McRun) => void; reject: (e: Error) => void }>()

function ensureWorker(): Worker {
  if (worker) return worker
  worker = new Worker(new URL('../workers/mc-worker.ts', import.meta.url), { type: 'module' })
  worker.onmessage = (e: MessageEvent<McResponse>) => {
    const entry = pending.get(e.data.id)
    if (!entry) return
    pending.delete(e.data.id)
    if (e.data.ok) entry.resolve({ mc: e.data.mc, projection: e.data.projection })
    else entry.reject(new Error(e.data.error))
  }
  return worker
}

export function runMonteCarlo(state: ScenarioState): { id: number; result: Promise<McRun> } {
  const id = nextId++
  const result = new Promise<McRun>((resolve, reject) => {
    pending.set(id, { resolve, reject })
    const request: McRequest = { id, state }
    ensureWorker().postMessage(request)
  })
  return { id, result }
}

export const SUPERSEDED = 'superseded'

/** Reject any in-flight requests older than `latestId` (latest-wins UI). */
export function cancelBefore(latestId: number): void {
  for (const [id, entry] of pending) {
    if (id < latestId) {
      pending.delete(id)
      entry.reject(new Error(SUPERSEDED))
    }
  }
}
