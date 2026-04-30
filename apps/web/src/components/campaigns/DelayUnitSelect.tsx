'use client'

/**
 * DelayUnitSelect — a (number, unit) pair input used in two places:
 *   1. Step-level "Delay before this step executes" + "Delay Time Span"
 *   2. Per-task reminder rows ("Remind Before" + "Time Span")
 *
 * The spec puts these as two side-by-side dropdowns; we follow that
 * layout exactly (number on the left, unit on the right).
 */

import type { CampaignDelayUnit } from '@crm/database'

type Props = {
  amount: number
  unit: CampaignDelayUnit
  onChange: (next: { amount: number; unit: CampaignDelayUnit }) => void
  /** Suffix shown after the unit, e.g. "From being activated". */
  suffix?: string
  disabled?: boolean
  /** Render number as a select (1..60) instead of a free input. The
   *  spec's activation modal uses a select; the step editor uses a
   *  number input — this prop lets the same component cover both. */
  numberAsSelect?: boolean
}

const UNITS: Array<{ value: CampaignDelayUnit; label: string }> = [
  { value: 'MINUTES', label: 'Minutes' },
  { value: 'HOURS', label: 'Hours' },
  { value: 'DAYS', label: 'Days' },
  { value: 'WEEKS', label: 'Weeks' },
  { value: 'MONTHS', label: 'Months' },
]

export function DelayUnitSelect({
  amount,
  unit,
  onChange,
  suffix,
  disabled,
  numberAsSelect,
}: Props) {
  const inputCls =
    'border border-gray-200 rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-400'

  return (
    <div className="flex items-center gap-2">
      {numberAsSelect ? (
        <select
          value={amount}
          onChange={(e) => onChange({ amount: Number(e.target.value), unit })}
          disabled={disabled}
          className={inputCls + ' min-w-[80px]'}
        >
          {Array.from({ length: 60 }).map((_, i) => (
            <option key={i + 1} value={i + 1}>
              {i + 1}
            </option>
          ))}
        </select>
      ) : (
        <input
          type="number"
          min={0}
          value={amount}
          onChange={(e) =>
            onChange({ amount: Math.max(0, Number(e.target.value)), unit })
          }
          disabled={disabled}
          className={inputCls + ' w-20 text-center'}
        />
      )}
      <select
        value={unit}
        onChange={(e) => onChange({ amount, unit: e.target.value as CampaignDelayUnit })}
        disabled={disabled}
        className={inputCls + ' min-w-[110px]'}
      >
        {UNITS.map((u) => (
          <option key={u.value} value={u.value}>
            {u.label}
          </option>
        ))}
      </select>
      {suffix && <span className="text-xs text-gray-500">{suffix}</span>}
    </div>
  )
}
