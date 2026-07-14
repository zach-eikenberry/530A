import { useState } from 'preact/hooks'

/**
 * Minimal admin queue (§7 Tier-B approvals). The token is held in memory
 * only (never stored); the page is useless without it. Server-side
 * authorization lives in the newsfeed worker.
 */

const ENDPOINT =
  (import.meta.env.PUBLIC_NEWSFEED_ENDPOINT as string | undefined) ??
  'https://530a-newsfeed.personal-account-fd8.workers.dev'

interface Item {
  id: number
  title: string
  excerpt: string
  source_url: string
  tier: string
  status: string
  amount_cents: number | null
  qualifies_note: string | null
  birth_year_start: number | null
  birth_year_end: number | null
  created_at: string
}

export default function AdminQueue() {
  const [token, setToken] = useState('')
  const [items, setItems] = useState<Item[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const call = async (method: 'GET' | 'POST', body?: unknown) => {
    const res = await fetch(`${ENDPOINT}/admin/items`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    })
    if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`)
    return res.json()
  }

  const refresh = async () => {
    setBusy(true)
    setError(null)
    try {
      const data = (await call('GET')) as { items: Item[] }
      setItems(data.items)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const act = async (body: unknown) => {
    setBusy(true)
    setError(null)
    try {
      await call('POST', body)
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setBusy(false)
    }
  }

  const promote = (item: Item) => {
    const amount = prompt('Gift amount in whole dollars (per child):', '1000')
    if (!amount) return
    const qualifies = prompt('Who qualifies? (region / affiliation):', '')
    if (!qualifies) return
    const start = prompt('Qualifying birth year — start:', '2025')
    const end = prompt('Qualifying birth year — end:', '2028')
    if (!start || !end) return
    act({
      action: 'promote',
      id: item.id,
      amountCents: Math.round(Number(amount) * 100),
      recurring: confirm('Is this a recurring annual gift? (OK = yes)'),
      qualifiesNote: qualifies,
      birthYearStart: Number(start),
      birthYearEnd: Number(end),
    })
  }

  return (
    <div class="stack">
      <div class="card">
        <div class="field">
          <div class="field-row">
            <label class="field-label" for="admin-token">
              Admin token
            </label>
          </div>
          <input
            id="admin-token"
            class="input"
            type="password"
            value={token}
            onInput={(e) => setToken((e.target as HTMLInputElement).value)}
          />
          <div class="field-hint">Held in memory only; every action is authorized server-side.</div>
        </div>
        <button
          type="button"
          class="btn btn-primary btn-sm"
          disabled={!token || busy}
          onClick={refresh}
        >
          Load queue
        </button>
        {error && (
          <p role="alert" style="color: var(--error);">
            {error}
          </p>
        )}
      </div>

      {items?.map((item) => (
        <div class="card" key={item.id}>
          <div class="flex gap-2 wrap items-center">
            <span class="badge">{item.tier === 'B' ? 'Tier B · modelable' : 'Tier A'}</span>
            <span
              class="badge"
              style={
                item.status !== 'published'
                  ? 'background: var(--warn-soft); color: var(--warn);'
                  : ''
              }
            >
              {item.status}
            </span>
            <span class="muted" style="font-size: 0.82rem;">
              #{item.id} · {item.created_at?.slice(0, 10)}
            </span>
          </div>
          <h3 style="font-size: 1.05rem; margin: 8px 0 4px;">{item.title}</h3>
          <p class="muted" style="font-size: 0.9rem;">
            {item.excerpt} — <a href={item.source_url}>source</a>
          </p>
          {item.tier === 'B' && (
            <p style="font-size: 0.9rem;">
              ${((item.amount_cents ?? 0) / 100).toLocaleString()} · {item.qualifies_note} (
              {item.birth_year_start}–{item.birth_year_end})
            </p>
          )}
          <div class="flex gap-2 wrap">
            {item.tier === 'A' && item.status === 'published' && (
              <button
                type="button"
                class="btn btn-gold btn-sm"
                disabled={busy}
                onClick={() => promote(item)}
              >
                Promote to modelable (Tier B)
              </button>
            )}
            {item.status === 'published' ? (
              <button
                type="button"
                class="btn btn-ghost btn-sm"
                disabled={busy}
                onClick={() =>
                  act({ action: 'reject', id: item.id, note: 'unpublished via admin' })
                }
              >
                Unpublish
              </button>
            ) : (
              <button
                type="button"
                class="btn btn-ghost btn-sm"
                disabled={busy}
                onClick={() => act({ action: 'republish', id: item.id })}
              >
                Republish
              </button>
            )}
          </div>
        </div>
      ))}
      {items && items.length === 0 && <div class="card">Queue is empty.</div>}
    </div>
  )
}
