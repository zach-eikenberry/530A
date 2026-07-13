import { describe, expect, it } from 'vitest'
import handler, { type Env } from '../src/events'

function makeEnv(): Env & { writes: unknown[] } {
  const writes: unknown[] = []
  return {
    writes,
    EVENTS: {
      writeDataPoint: (point: unknown) => {
        writes.push(point)
      },
    } as unknown as Env['EVENTS'],
  }
}

function post(body: unknown, origin = 'https://530amodel.com'): Request {
  const payload = JSON.stringify(body)
  return new Request('https://events.example/', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': String(payload.length),
      Origin: origin,
    },
    body: payload,
  })
}

describe('events worker', () => {
  it('accepts a valid batch and writes allowed events', async () => {
    const env = makeEnv()
    const res = await handler.fetch(
      post({ v: 1, events: [{ n: 'scenario_modeled', b: '1e5' }, { n: 'link_copied' }] }),
      env,
    )
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, written: 2 })
    expect(env.writes).toHaveLength(2)
  })

  it('silently drops unknown event names (no error oracle for probing)', async () => {
    const env = makeEnv()
    const res = await handler.fetch(
      post({ v: 1, events: [{ n: 'evil_event' }, { n: 'scenario_modeled' }] }),
      env,
    )
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, written: 1 })
  })

  it('rejects malformed payloads, wrong methods, and foreign origins', async () => {
    const env = makeEnv()
    expect((await handler.fetch(post({ v: 2, events: [] }), env)).status).toBe(400)
    expect((await handler.fetch(post({ nope: true }), env)).status).toBe(400)
    expect(
      (await handler.fetch(new Request('https://events.example/', { method: 'GET' }), env)).status,
    ).toBe(405)
    expect(
      (await handler.fetch(post({ v: 1, events: [{ n: 'x' }] }, 'https://evil.example'), env))
        .status,
    ).toBe(403)
    expect(env.writes).toHaveLength(0)
  })

  it('rejects oversized payloads and >50-event batches', async () => {
    const env = makeEnv()
    const big = new Request('https://events.example/', {
      method: 'POST',
      headers: { 'Content-Length': '9000', Origin: 'https://530amodel.com' },
      body: 'x',
    })
    expect((await handler.fetch(big, env)).status).toBe(413)
    const many = { v: 1, events: Array.from({ length: 51 }, () => ({ n: 'scenario_modeled' })) }
    expect((await handler.fetch(post(many), env)).status).toBe(400)
  })

  it('answers CORS preflight', async () => {
    const env = makeEnv()
    const res = await handler.fetch(
      new Request('https://events.example/', {
        method: 'OPTIONS',
        headers: { Origin: 'https://530amodel.com' },
      }),
      env,
    )
    expect(res.status).toBe(204)
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://530amodel.com')
  })
})
