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

/**
 * Parse a decimal string (e.g. "12345.67") into a BigInt atomic value
 * with exactly `decimals` decimal places, using pure string arithmetic
 * to avoid IEEE-754 float precision loss.
 *
 * Returns null if the input is not a valid non-negative decimal number.
 *
 * Examples:
 *   parseDecimalToBigInt("1.5",   6) => 1500000n
 *   parseDecimalToBigInt("1234",  6) => 1234000000n
 *   parseDecimalToBigInt("0.001", 6) => 1000n
 *   parseDecimalToBigInt("1.999999999", 6) => 1999999n  (truncates, does not round)
 */
export function parseDecimalToBigInt(value: string, decimals: number): bigint | null {
  const s = value.trim()
  if (!s || !/^\d+(\.\d+)?$/.test(s)) return null

  const [intPart, fracPart = ''] = s.split('.')
  // Pad or truncate fractional part to exactly `decimals` digits
  const frac = fracPart.padEnd(decimals, '0').slice(0, decimals)
  const combined = (intPart + frac).replace(/^0+/, '') || '0'
  try {
    return BigInt(combined)
  } catch {
    return null
  }
}
