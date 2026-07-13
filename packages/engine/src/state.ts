import type { ContributionSchedule, ContributionSource, Scenario } from './types'

/**
 * `?s=` scenario state (§2.5): the entire scenario in a compact, versioned,
 * URL-safe string. Every scenario is shareable, bookmarkable, reproducible,
 * and testable with zero server state. The public API accepts this same
 * encoding. RuleSet is NOT encoded — rules come from config at decode time,
 * so links always model under current law.
 *
 * Format: "1." + base64url(JSON with short keys, cents as decimal strings).
 */

export const STATE_VERSION = 1

/** Scenario minus rules — what actually travels in the URL. */
export type ScenarioState = Omit<Scenario, 'rules' | 'schemaVersion'> & {
  /** Monte-Carlo reproducibility: seed + path count travel with the link. */
  mcSeed: number
  mcPaths: number
}

interface WireSchedule {
  t: 'm' | 'a' | 'o'
  c: string // cents
  s?: number // startAgeMonths
  e?: number // endAgeMonths
  y?: number // monthOfYear
  x?: number // atAgeMonths
}

interface WireSource {
  i: string
  k: 'f' | 'r' | 'c' | 'e'
  u?: number // stepUpRate
  d: WireSchedule
}

interface WireState {
  v: number
  o: string // asOf
  b: string // birthDate
  g: 0 | 1 // includeSeed
  r: number // annualReturn
  n: 0 | 1 // returnIsReal
  f: number // annualInflation
  p: number // annualFee
  q: number // annualVolatility
  a: number // targetAgeMonths
  z: number // mcSeed
  w: number // mcPaths
  s: WireSource[]
}

const KIND_TO_WIRE = { family: 'f', relative: 'r', charity: 'c', employer: 'e' } as const
const WIRE_TO_KIND = { f: 'family', r: 'relative', c: 'charity', e: 'employer' } as const

function toBase64Url(json: string): string {
  const bytes = new TextEncoder().encode(json)
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(s: string): string {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/')
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new TextDecoder().decode(bytes)
}

function encodeSchedule(sched: ContributionSchedule): WireSchedule {
  switch (sched.type) {
    case 'monthly':
      return {
        t: 'm',
        c: sched.amountCents.toString(),
        s: sched.startAgeMonths,
        e: sched.endAgeMonths,
      }
    case 'annual':
      return {
        t: 'a',
        c: sched.amountCents.toString(),
        s: sched.startAgeMonths,
        e: sched.endAgeMonths,
        y: sched.monthOfYear,
      }
    case 'once':
      return { t: 'o', c: sched.amountCents.toString(), x: sched.atAgeMonths }
  }
}

function decodeSchedule(w: WireSchedule): ContributionSchedule {
  const amountCents = BigInt(w.c)
  if (w.t === 'm') {
    return { type: 'monthly', amountCents, startAgeMonths: w.s ?? 0, endAgeMonths: w.e ?? 0 }
  }
  if (w.t === 'a') {
    return {
      type: 'annual',
      amountCents,
      monthOfYear: w.y ?? 1,
      startAgeMonths: w.s ?? 0,
      endAgeMonths: w.e ?? 0,
    }
  }
  return { type: 'once', amountCents, atAgeMonths: w.x ?? 0 }
}

export function encodeState(state: ScenarioState): string {
  const wire: WireState = {
    v: STATE_VERSION,
    o: state.asOf,
    b: state.child.birthDate,
    g: state.includeSeed ? 1 : 0,
    r: state.assumptions.annualReturn,
    n: state.assumptions.returnIsReal ? 1 : 0,
    f: state.assumptions.annualInflation,
    p: state.assumptions.annualFee,
    q: state.assumptions.annualVolatility,
    a: state.targetAgeMonths,
    z: state.mcSeed,
    w: state.mcPaths,
    s: state.sources.map((src) => {
      const ws: WireSource = {
        i: src.id,
        k: KIND_TO_WIRE[src.kind],
        d: encodeSchedule(src.schedule),
      }
      if (src.stepUpRate !== undefined && src.stepUpRate > 0) ws.u = src.stepUpRate
      return ws
    }),
  }
  return `${STATE_VERSION}.${toBase64Url(JSON.stringify(wire))}`
}

export class StateDecodeError extends Error {}

export function decodeState(encoded: string): ScenarioState {
  const dot = encoded.indexOf('.')
  if (dot < 1) throw new StateDecodeError('missing version prefix')
  const version = Number(encoded.slice(0, dot))
  if (version !== STATE_VERSION) throw new StateDecodeError(`unsupported version ${version}`)

  let wire: WireState
  try {
    wire = JSON.parse(fromBase64Url(encoded.slice(dot + 1))) as WireState
  } catch {
    throw new StateDecodeError('malformed state payload')
  }
  if (wire.v !== STATE_VERSION || typeof wire.o !== 'string' || !Array.isArray(wire.s)) {
    throw new StateDecodeError('invalid state shape')
  }

  const sources: ContributionSource[] = wire.s.map((ws) => {
    const kind = WIRE_TO_KIND[ws.k]
    if (!kind || typeof ws.i !== 'string') throw new StateDecodeError('invalid source')
    const source: ContributionSource = { id: ws.i, kind, schedule: decodeSchedule(ws.d) }
    if (ws.u !== undefined) source.stepUpRate = ws.u
    return source
  })

  return {
    asOf: wire.o,
    child: { birthDate: wire.b },
    includeSeed: wire.g === 1,
    sources,
    assumptions: {
      annualReturn: wire.r,
      returnIsReal: wire.n === 1,
      annualInflation: wire.f,
      annualFee: wire.p,
      annualVolatility: wire.q,
    },
    targetAgeMonths: wire.a,
    mcSeed: wire.z,
    mcPaths: wire.w,
  }
}
