/**
 * Number formatting utilities for BEACON.
 *
 * Rules:
 *  - < 1,000,000 (1M): show full value with commas, e.g. 1,340.52 or 950,000.00
 *  - >= 1B: abbreviate with B, e.g. 1.81B
 *  - >= 1T: abbreviate with T, e.g. 2.50T
 *  - decimals: how many fraction digits to show (default 2)
 */

export function formatCompact(value: number, decimals = 2): string {
  if (!isFinite(value)) return '--'

  const abs = Math.abs(value)

  if (abs >= 1_000_000_000_000) {
    return (value / 1_000_000_000_000).toFixed(decimals) + 'T'
  }
  if (abs >= 1_000_000_000) {
    return (value / 1_000_000_000).toFixed(decimals) + 'B'
  }
  // Under 1 billion: show full value with commas, no abbreviation
  return value.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

/**
 * Format a plain integer count (round IDs, transmission counts).
 * Always full value with commas, no decimals.
 */
export function formatCount(value: number): string {
  if (!isFinite(value)) return '--'
  return value.toLocaleString('en-US', { maximumFractionDigits: 0 })
}
