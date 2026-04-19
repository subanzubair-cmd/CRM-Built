'use client'

import { useState, useCallback } from 'react'

interface Props {
  value: string
  onChange: (raw: string) => void
  placeholder?: string
  className?: string
  disabled?: boolean
}

function formatWithCommas(raw: string): string {
  // Strip everything except digits and decimal
  const cleaned = raw.replace(/[^0-9.]/g, '')
  // Split on decimal
  const parts = cleaned.split('.')
  // Add commas to integer part
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return parts.length > 1 ? `${parts[0]}.${parts[1]}` : parts[0]
}

function stripCommas(val: string): string {
  return val.replace(/,/g, '')
}

/**
 * Currency input that auto-formats with commas as you type.
 * Stores raw numeric string (no commas) via onChange,
 * displays formatted string with commas.
 */
export function CurrencyInput({ value, onChange, placeholder = '0', className, disabled }: Props) {
  const displayValue = formatWithCommas(value)

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = stripCommas(e.target.value)
    // Only allow digits, one decimal point
    if (/^[0-9]*\.?[0-9]*$/.test(raw)) {
      onChange(raw)
    }
  }, [onChange])

  return (
    <div className={`flex items-center rounded-lg border border-gray-200 bg-white px-3 py-1.5 focus-within:border-blue-400 focus-within:ring-1 focus-within:ring-blue-400 ${className ?? ''}`}>
      <span className="mr-1 text-sm text-gray-400">$</span>
      <input
        type="text"
        inputMode="decimal"
        value={displayValue}
        onChange={handleChange}
        placeholder={placeholder}
        disabled={disabled}
        className="w-full bg-transparent text-right text-sm text-gray-900 outline-none placeholder:text-gray-300 disabled:opacity-50"
      />
    </div>
  )
}

/**
 * Inline currency input without the border wrapper — for use inside tables/forms
 * that already have their own border styling.
 */
export function CurrencyInputInline({ value, onChange, placeholder = '0', className, disabled }: Props) {
  const displayValue = formatWithCommas(value)

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = stripCommas(e.target.value)
    if (/^[0-9]*\.?[0-9]*$/.test(raw)) {
      onChange(raw)
    }
  }, [onChange])

  return (
    <input
      type="text"
      inputMode="decimal"
      value={displayValue}
      onChange={handleChange}
      placeholder={placeholder}
      disabled={disabled}
      className={`bg-transparent text-right text-sm text-gray-900 outline-none placeholder:text-gray-300 ${className ?? ''}`}
    />
  )
}

/**
 * Helper: format a number for display with commas and $ sign
 */
export function formatCurrencyDisplay(val: number | string | null | undefined): string {
  if (val == null || val === '') return '$0'
  const num = typeof val === 'string' ? parseFloat(val.replace(/,/g, '')) : val
  if (isNaN(num)) return '$0'
  return `$${num.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
}
