import { useState } from 'preact/hooks'

/**
 * Number input using the draft-string pattern (see the return field in
 * AdvancedModel): while focused, the DOM value mirrors the raw text so a
 * controlled re-render never rewrites the field underneath the user —
 * clearing mid-edit or typing "1e" won't snap the value to 0. Only finite
 * parses commit; blur restores the last committed value's display.
 */

interface Props {
  value: number
  onCommit: (n: number) => void
  /** Display formatting when idle (default String). */
  format?: (n: number) => string
  id?: string
  min?: number
  max?: number
  step?: number
  style?: string
  placeholder?: string
  'aria-label'?: string
  'aria-invalid'?: boolean
  'aria-describedby'?: string
  'data-testid'?: string
}

export default function NumberField({ value, onCommit, format, ...rest }: Props) {
  const [draft, setDraft] = useState<string | null>(null)
  const idle = format ? format(value) : String(value)
  return (
    <input
      class="input"
      type="number"
      {...rest}
      value={draft ?? idle}
      onFocus={() => setDraft(format ? format(value) : String(value))}
      onBlur={() => setDraft(null)}
      onInput={(e) => {
        const raw = (e.target as HTMLInputElement).value
        setDraft(raw)
        const parsed = Number(raw)
        if (raw.trim() !== '' && Number.isFinite(parsed)) onCommit(parsed)
      }}
    />
  )
}
