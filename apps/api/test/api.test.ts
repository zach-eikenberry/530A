import { monteCarlo, project } from '@530a/engine'
import { describe, expect, it } from 'vitest'
import handler from '../src/api'
import { openApiSpec } from '../src/openapi'
import { RULES, runScenario, ScenarioSchema, stateFromInput } from '../src/shared'

function post(body: unknown): Request {
  return new Request('https://api.example/v1/project', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const validBody = {
  asOf: '2026-07-12',
  birthDate: '2026-01-15',
  targetAgeMonths: 216,
  mcPaths: 300,
  sources: [
    {
      id: 'family',
      kind: 'family',
      schedule: { type: 'monthly', amountCents: '10000', startAgeMonths: 6, endAgeMonths: 216 },
    },
  ],
}

describe('POST /v1/project', () => {
  it('returns engine-exact numbers (shares the engine, not a copy)', async () => {
    const res = await handler.fetch(post(validBody))
    expect(res.status).toBe(200)
    const data = (await res.json()) as {
      deterministic: { finalNominalCents: string; contributedCents: string }
      percentiles: { nominalCents: string[][] }
      assumptions: { mcPathsSimulated: number }
    }

    const state = stateFromInput(validBody)
    const scenario = { schemaVersion: 1 as const, rules: RULES, ...destate(state) }
    const p = project(scenario)
    expect(data.deterministic.finalNominalCents).toBe(String(p.nominalCents[p.months]))
    expect(data.deterministic.contributedCents).toBe(String(p.breakdown.contributedCents))

    const mc = monteCarlo(scenario, 530, data.assumptions.mcPathsSimulated)
    expect(data.percentiles.nominalCents[2]).toEqual(
      (mc.percentileCents[2] as bigint[]).map(String),
    )
  })

  it('accepts the ?s= share-link encoding', async () => {
    const { encodeState } = await import('@530a/engine')
    const s = encodeState(stateFromInput(validBody))
    const res = await handler.fetch(post({ s }))
    expect(res.status).toBe(200)
    const viaJson = await (await handler.fetch(post(validBody))).json()
    expect(await res.json()).toEqual(viaJson)
  })

  it('embeds attribution and disclaimer in every response', async () => {
    const data = (await (await handler.fetch(post(validBody))).json()) as Record<string, unknown>
    expect(data.sourceUrl).toBe('https://530amodel.com')
    expect(String(data.disclaimer)).toContain('not financial advice')
    expect(data.rulesVerifiedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('clamps Monte-Carlo work to the CPU budget and reports it', () => {
    const state = stateFromInput({ ...validBody, targetAgeMonths: 1428, mcPaths: 5000 })
    const result = runScenario(state)
    expect(result.assumptions.mcPathsSimulated).toBeLessThan(5000)
    expect(result.assumptions.mcPathsRequested).toBe(5000)
    expect(result.percentiles.ages.length).toBeGreaterThan(0)
  })

  it('rejects malformed input with helpful errors', async () => {
    expect((await handler.fetch(post({ nope: 1 }))).status).toBe(400)
    expect((await handler.fetch(post({ ...validBody, annualReturn: 5 }))).status).toBe(400)
    expect((await handler.fetch(post({ s: 'garbage' }))).status).toBe(400)
    const big = new Request('https://api.example/v1/project', {
      method: 'POST',
      body: 'x'.repeat(20_000),
    })
    expect((await handler.fetch(big)).status).toBe(413)
  })

  it('serves rules and openapi with CORS for anyone', async () => {
    const rules = await handler.fetch(new Request('https://api.example/v1/rules'))
    expect(rules.status).toBe(200)
    expect(rules.headers.get('Access-Control-Allow-Origin')).toBe('*')
    const facts = (await rules.json()) as { facts: { annualCap: string } }
    expect(facts.facts.annualCap).toContain('$5,000')

    const spec = await handler.fetch(new Request('https://api.example/openapi.json'))
    expect(((await spec.json()) as { openapi: string }).openapi).toBe('3.1.0')
  })
})

describe('rate limiting', () => {
  const deny = { limit: async () => ({ success: false }) }
  const allow = { limit: async () => ({ success: true }) }
  const broken = {
    limit: async () => {
      throw new Error('limiter down')
    },
  }

  it('returns 429 with Retry-After when the per-IP limit trips', async () => {
    const res = await handler.fetch(post(validBody), { RATE_LIMITER: deny })
    expect(res.status).toBe(429)
    expect(res.headers.get('Retry-After')).toBe('60')
  })

  it('passes traffic under the limit and without the binding', async () => {
    expect((await handler.fetch(post(validBody), { RATE_LIMITER: allow })).status).toBe(200)
    expect((await handler.fetch(post(validBody), {})).status).toBe(200)
  })

  it('fails open when the limiter itself errors', async () => {
    expect((await handler.fetch(post(validBody), { RATE_LIMITER: broken })).status).toBe(200)
  })

  it('does not throttle the read-only GET endpoints', async () => {
    const res = await handler.fetch(new Request('https://api.example/v1/rules'), {
      RATE_LIMITER: deny,
    })
    expect(res.status).toBe(200)
  })
})

describe('openapi ↔ zod schema consistency', () => {
  it('required fields and bounds match', () => {
    const doc = openApiSpec.components.schemas.Scenario
    expect(doc.required).toEqual(['asOf', 'birthDate', 'targetAgeMonths'])
    // Bounds pinned in both places — a drift here fails the build
    expect(doc.properties.mcPaths.maximum).toBe(5000)
    expect(doc.properties.targetAgeMonths.maximum).toBe(1428)
    const parsed = ScenarioSchema.safeParse({
      asOf: '2026-07-12',
      birthDate: '2026-01-15',
      targetAgeMonths: 1428,
    })
    expect(parsed.success).toBe(true)
  })
})

/** Strip mc fields to build an engine Scenario from a ScenarioState. */
function destate(state: ReturnType<typeof stateFromInput>) {
  const { mcSeed: _s, mcPaths: _p, ...rest } = state
  return rest
}
