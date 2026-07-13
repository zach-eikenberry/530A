import type { ScenarioState } from '@530a/engine'
import { type MonteCarloResult, monteCarlo, type Projection, project } from '@530a/engine'
import { toScenario } from '../lib/scenario'

/**
 * Monte-Carlo Web Worker (§9.4): keeps the UI thread free while simulating.
 * structuredClone carries bigint natively, so scenarios/results cross the
 * boundary without lossy serialization.
 */

export interface McRequest {
  id: number
  state: ScenarioState
}

export type McResponse =
  | { id: number; ok: true; mc: MonteCarloResult; projection: Projection }
  | { id: number; ok: false; error: string }

self.onmessage = (e: MessageEvent<McRequest>) => {
  const { id, state } = e.data
  try {
    const scenario = toScenario(state)
    const projection = project(scenario)
    const mc = monteCarlo(scenario, state.mcSeed, state.mcPaths)
    const response: McResponse = { id, ok: true, mc, projection }
    self.postMessage(response)
  } catch (err) {
    const response: McResponse = {
      id,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    }
    self.postMessage(response)
  }
}
