/**
 * Client for GET /v1/returns — live trailing returns for the eligible funds,
 * used by the Advanced Model's return-preset dials. Nominal CAGR decimals
 * (0.15 = 15%/yr); the caller converts to after-inflation terms. One fetch
 * per page view (edge-cached ~6h server-side).
 */

export type Period = '1y' | '5y' | '10y'

export interface ReturnsPayload {
  asOf: string
  source: string
  note: string
  funds: Record<string, Record<Period, number | null>>
}

export const RETURNS_ENDPOINT = 'https://api.530amodel.com/v1/returns'

let inflight: Promise<ReturnsPayload | null> | null = null

export function fetchReturns(): Promise<ReturnsPayload | null> {
  inflight ??= fetch(RETURNS_ENDPOINT)
    .then((res) => (res.ok ? (res.json() as Promise<ReturnsPayload>) : null))
    .catch(() => null)
  return inflight
}

/** Nominal annual return → after-inflation ("real") terms, both as decimals. */
export function toRealReturn(nominal: number, inflation: number): number {
  return (1 + nominal) / (1 + inflation) - 1
}
