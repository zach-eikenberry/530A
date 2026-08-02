import { useEffect, useRef, useState } from 'preact/hooks'

/**
 * First-run guided walkthrough (§5.2): four short steps, dismissible,
 * shown once (localStorage). Deliberately lightweight — a modal sequence,
 * not a spotlight library.
 */

const STEPS = [
  {
    title: 'Welcome to the Advanced Model',
    body: 'Everything you change recalculates instantly, right on your device. Nothing you enter is uploaded or stored.',
  },
  {
    title: 'Contributions',
    body: 'Add each person who might contribute — parents, grandparents, an employer, a charity — each with their own amount and schedule. The $5,000/yr legal cap is enforced automatically.',
  },
  {
    title: 'Honest ranges',
    body: 'The shaded bands show the middle 50% and 80% of 5,000 simulated markets. The future is a range, not a number — anyone promising a number is selling something.',
  },
  {
    title: 'Share it',
    body: 'The whole scenario lives in the link. Copy it to revisit later, send it to a spouse, or compare up to three side by side.',
  },
] as const

const KEY = '530a-walkthrough-done'

export default function Walkthrough() {
  const [step, setStep] = useState(-1)
  const dialogRef = useRef<HTMLDivElement>(null)
  const restoreFocus = useRef<HTMLElement | null>(null)
  const open = step >= 0

  useEffect(() => {
    try {
      if (!localStorage.getItem(KEY)) setStep(0)
    } catch {
      /* storage unavailable → skip the tour */
    }
  }, [])

  // Modal focus management: initial focus in, Tab cycles within, Escape
  // closes, and focus returns to wherever the user was on close.
  useEffect(() => {
    if (!open) return
    restoreFocus.current = (document.activeElement as HTMLElement) ?? null
    dialogRef.current?.querySelector<HTMLElement>('[data-testid="tour-next"]')?.focus()
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        dismiss()
        return
      }
      if (e.key !== 'Tab') return
      const focusables = [
        ...(dialogRef.current?.querySelectorAll<HTMLElement>('button') ?? []),
      ].filter((el) => !el.hasAttribute('disabled'))
      if (focusables.length === 0) return
      const first = focusables[0] as HTMLElement
      const last = focusables[focusables.length - 1] as HTMLElement
      const active = document.activeElement
      if (e.shiftKey && (active === first || !dialogRef.current?.contains(active))) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && (active === last || !dialogRef.current?.contains(active))) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown, true)
    return () => {
      document.removeEventListener('keydown', onKeyDown, true)
      restoreFocus.current?.focus?.()
    }
  }, [open])

  const dismiss = () => {
    try {
      localStorage.setItem(KEY, '1')
    } catch {
      /* ignore */
    }
    setStep(-1)
  }

  if (step < 0) return null
  const s = STEPS[step]
  if (!s) return null

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label={s.title}
      style="position: fixed; inset: 0; background: rgba(15, 23, 42, 0.55); display: flex; align-items: center; justify-content: center; z-index: 50; padding: 1rem;"
    >
      <div class="card" style="max-width: 24rem; background: var(--bg);">
        <h2 style="margin-top: 0; font-size: 1.15rem;">{s.title}</h2>
        <p>{s.body}</p>
        <div style="display: flex; gap: 0.75rem; justify-content: space-between; align-items: center;">
          <span class="muted">
            {step + 1} of {STEPS.length}
          </span>
          <div style="display: flex; gap: 0.5rem;">
            <button
              type="button"
              class="btn btn-ghost btn-sm"
              onClick={dismiss}
              data-testid="tour-skip"
            >
              Skip
            </button>
            <button
              type="button"
              class="btn btn-gold btn-sm"
              data-testid="tour-next"
              onClick={() => (step + 1 < STEPS.length ? setStep(step + 1) : dismiss())}
            >
              {step + 1 < STEPS.length ? 'Next' : 'Done'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
