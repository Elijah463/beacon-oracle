/**
 * PriceChart.tsx
 * Canvas-based USDC/NGN price chart.
 * - Y-axis: 0, 1000, 1200, 1400, 1600, then actual price
 * - Line animates drawing left-to-right from zero on mount
 * - No X-axis labels -- hover/tap shows a tooltip that fades after 10s
 * - Brand-green gradient fill directly under the line
 * - No Recharts -- pure canvas for full control
 */

import { useEffect, useRef, useState, useCallback } from 'react'
import type { RoundPoint } from '@/hooks/useOracle'

interface PriceChartProps {
  history: RoundPoint[]
  price:   number | null
  loading: boolean
}

interface TooltipState {
  price:     number
  time:      string
  x:         number
  y:         number
  visible:   boolean
  opacity:   number
}

const BRAND   = '#00D66F'
const PAD_L   = 56   // left padding for Y-axis labels
const PAD_R   = 12
const PAD_T   = 16
const PAD_B   = 12

/**
 * Build a fully dynamic Y-axis.
 * Strategy:
 *   - yMin = floor of (minPrice - small pad) snapped to step
 *   - yMax = ceil  of (maxPrice + small pad) snapped to step
 *   - step = nice round number that gives 5-8 ticks across the range
 *   - Always include 0 as the chart baseline (line draws from zero)
 *     but the visible labels start from yMin so the detail is tight.
 */
function buildYAxis(minPrice: number, maxPrice: number): { ticks: number[]; yMin: number; yMax: number } {
  const range = maxPrice - minPrice
  // If all prices are identical (1 round), use a ±0.5% spread
  const spread = range === 0 ? maxPrice * 0.01 : range

  // Pick a step that gives roughly 5-7 visible ticks
  const rawStep = spread / 5
  const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)))
  const niceStep = (() => {
    const ratio = rawStep / magnitude
    if (ratio < 1.5) return magnitude
    if (ratio < 3.5) return 2 * magnitude
    if (ratio < 7.5) return 5 * magnitude
    return 10 * magnitude
  })()

  const yMin = Math.max(0, Math.floor((minPrice - spread * 0.1) / niceStep) * niceStep)
  const yMax = Math.ceil((maxPrice + spread * 0.1) / niceStep) * niceStep

  const ticks: number[] = []
  for (let t = yMin; t <= yMax + niceStep * 0.01; t += niceStep) {
    ticks.push(Math.round(t))
  }
  // Always ensure yMax is in ticks
  if (ticks[ticks.length - 1] < yMax) ticks.push(Math.round(yMax))

  return { ticks, yMin, yMax }
}

function toCanvasY(val: number, yMin: number, yMax: number, h: number): number {
  return PAD_T + (1 - (val - yMin) / (yMax - yMin)) * (h - PAD_T - PAD_B)
}

function toCanvasX(idx: number, total: number, w: number): number {
  if (total <= 1) return PAD_L + (w - PAD_L - PAD_R) / 2
  return PAD_L + (idx / (total - 1)) * (w - PAD_L - PAD_R)
}

export function PriceChart({ history, price: _price, loading }: PriceChartProps) {
  const canvasRef   = useRef<HTMLCanvasElement>(null)
  const progressRef = useRef(0)      // 0..1 draw progress
  const rafRef      = useRef<number>(0)
  const timerRef    = useRef<ReturnType<typeof setTimeout> | null>(null)
  const fadeRef     = useRef<ReturnType<typeof setInterval> | null>(null)
  const [tooltip, setTooltip] = useState<TooltipState | null>(null)

  const draw = useCallback((progress: number) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const dpr = window.devicePixelRatio || 1
    const w = canvas.width  / dpr
    const h = canvas.height / dpr

    ctx.clearRect(0, 0, w * dpr, h * dpr)

    if (history.length < 2) return

    const prices  = history.map(r => r.price)
    const minP    = Math.min(...prices)
    const maxP    = Math.max(...prices)
    const { ticks: yTicks, yMin, yMax } = buildYAxis(minP, maxP)

    // ── Y-axis grid lines + labels ──────────────────────────────────────
    ctx.font = `10px DM Sans, sans-serif`
    ctx.textAlign = 'right'
    for (const tick of yTicks) {
      if (tick === yMin && yMin === 0) continue   // skip zero label when baseline is 0
      const cy = toCanvasY(tick, yMin, yMax, h)
      // gridline
      ctx.beginPath()
      ctx.strokeStyle = 'rgba(255,255,255,0.05)'
      ctx.lineWidth   = 1
      ctx.moveTo(PAD_L, cy)
      ctx.lineTo(w - PAD_R, cy)
      ctx.stroke()
      // label
      ctx.fillStyle = 'rgba(100,116,139,0.9)'
      ctx.fillText(
        tick.toLocaleString('en-US', { maximumFractionDigits: 0 }),
        PAD_L - 6,
        cy + 4,
      )
    }

    // ── Build point list, animated by progress ──────────────────────────
    const total  = history.length
    // How many full segments to draw: progress * (total-1) segments
    const segMax = progress * (total - 1)
    const points: Array<{ cx: number; cy: number }> = []

    for (let i = 0; i <= total - 1; i++) {
      if (i > segMax) break
      points.push({
        cx: toCanvasX(i, total, w),
        cy: toCanvasY(history[i].price, yMin, yMax, h),
      })
    }

    // Partial last segment
    const fullSegs  = Math.floor(segMax)
    if (fullSegs < total - 1) {
      const frac = segMax - fullSegs
      const a    = points[points.length - 1] ?? { cx: PAD_L, cy: toCanvasY(0, yMin, yMax, h) }
      const bx   = toCanvasX(fullSegs + 1, total, w)
      const by   = toCanvasY(history[fullSegs + 1].price, yMin, yMax, h)
      points.push({ cx: a.cx + (bx - a.cx) * frac, cy: a.cy + (by - a.cy) * frac })
    }

    if (points.length < 2) return

    const lastPt = points[points.length - 1]
    const baseY  = toCanvasY(yMin, yMin, yMax, h)

    // ── Gradient fill ───────────────────────────────────────────────────
    const grad = ctx.createLinearGradient(0, PAD_T, 0, baseY)
    grad.addColorStop(0,   'rgba(0,214,111,0.30)')
    grad.addColorStop(0.6, 'rgba(0,214,111,0.08)')
    grad.addColorStop(1,   'rgba(0,214,111,0.00)')

    ctx.beginPath()
    ctx.moveTo(points[0].cx, baseY)
    ctx.lineTo(points[0].cx, points[0].cy)
    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1]
      const curr = points[i]
      const cpx  = (prev.cx + curr.cx) / 2
      ctx.bezierCurveTo(cpx, prev.cy, cpx, curr.cy, curr.cx, curr.cy)
    }
    ctx.lineTo(lastPt.cx, baseY)
    ctx.closePath()
    ctx.fillStyle = grad
    ctx.fill()

    // ── Line ────────────────────────────────────────────────────────────
    ctx.beginPath()
    ctx.moveTo(points[0].cx, points[0].cy)
    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1]
      const curr = points[i]
      const cpx  = (prev.cx + curr.cx) / 2
      ctx.bezierCurveTo(cpx, prev.cy, cpx, curr.cy, curr.cx, curr.cy)
    }
    ctx.strokeStyle = BRAND
    ctx.lineWidth   = 2.5
    ctx.lineJoin    = 'round'
    ctx.stroke()

    // ── Tip dot ─────────────────────────────────────────────────────────
    if (progress >= 1) {
      ctx.beginPath()
      ctx.arc(lastPt.cx, lastPt.cy, 4, 0, Math.PI * 2)
      ctx.fillStyle   = BRAND
      ctx.shadowColor = BRAND
      ctx.shadowBlur  = 8
      ctx.fill()
      ctx.shadowBlur  = 0
    }
  }, [history])

  // Animate draw-on
  useEffect(() => {
    if (history.length < 2) return
    progressRef.current = 0
    const start = performance.now()
    const duration = Math.min(1200 + history.length * 80, 2400)

    const step = (now: number) => {
      const t = Math.min((now - start) / duration, 1)
      // Ease out cubic
      progressRef.current = 1 - Math.pow(1 - t, 3)
      draw(progressRef.current)
      if (t < 1) rafRef.current = requestAnimationFrame(step)
    }
    rafRef.current = requestAnimationFrame(step)
    return () => cancelAnimationFrame(rafRef.current)
  }, [history, draw])

  // Resize -- reset transform before scaling to prevent accumulation
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const setSize = () => {
      const dpr = window.devicePixelRatio || 1
      const w   = canvas.offsetWidth
      const h   = canvas.offsetHeight
      if (w === 0 || h === 0) return
      canvas.width  = w * dpr
      canvas.height = h * dpr
      const ctx = canvas.getContext('2d')
      if (ctx) {
        ctx.setTransform(1, 0, 0, 1, 0, 0)  // reset before scaling
        ctx.scale(dpr, dpr)
      }
      draw(progressRef.current)
    }
    setSize()   // set initial size immediately
    const obs = new ResizeObserver(setSize)
    obs.observe(canvas)
    return () => obs.disconnect()
  }, [draw])

  // Hit-test on hover/touch
  const handlePointer = useCallback((clientX: number, _clientY: number) => {
    if (history.length < 2) return
    const canvas = canvasRef.current
    if (!canvas) return
    const rect  = canvas.getBoundingClientRect()
    const mx    = clientX - rect.left
    const w     = rect.width
    const h     = rect.height
    const prices = history.map(r => r.price)
    const minP   = Math.min(...prices)
    const maxP   = Math.max(...prices)
    const { yMin, yMax } = buildYAxis(minP, maxP)

    // Find closest point
    let best = 0, bestDist = Infinity
    for (let i = 0; i < history.length; i++) {
      const cx = toCanvasX(i, history.length, w)
      const d  = Math.abs(cx - mx)
      if (d < bestDist) { bestDist = d; best = i }
    }

    const pt = history[best]
    const cx = toCanvasX(best, history.length, w)
    const cy = toCanvasY(pt.price, yMin, yMax, h)

    // Clear existing fade timer
    if (timerRef.current) clearTimeout(timerRef.current)
    if (fadeRef.current)  clearInterval(fadeRef.current)

    setTooltip({
      price:   pt.price,
      time:    new Date(pt.updatedAt * 1000).toLocaleTimeString(),
      x:       cx,
      y:       cy,
      visible: true,
      opacity: 1,
    })

    // Auto-fade after 10s
    timerRef.current = setTimeout(() => {
      let op = 1
      fadeRef.current = setInterval(() => {
        op -= 0.05
        if (op <= 0) {
          clearInterval(fadeRef.current!)
          setTooltip(null)
        } else {
          setTooltip(prev => prev ? { ...prev, opacity: op } : null)
        }
      }, 40)
    }, 10000)
  }, [history])

  const onMouseMove  = (e: React.MouseEvent)  => handlePointer(e.clientX, e.clientY)
  const onTouchStart = (e: React.TouchEvent)  => {
    e.preventDefault()
    handlePointer(e.touches[0].clientX, e.touches[0].clientY)
  }

  if (loading) {
    return (
      <div style={{ borderRadius: 18, padding: 24, background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
        <div style={{ height: 16, width: 140, background: 'var(--bg-muted)', borderRadius: 6, marginBottom: 16, animation: 'shimmer 1.5s infinite' }} />
        <div style={{ height: 220, background: 'var(--bg-muted)', borderRadius: 10, animation: 'shimmer 1.5s infinite' }} />
      </div>
    )
  }

  if (history.length < 2) {
    return (
      <div style={{ borderRadius: 18, padding: 24, background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
        <Header count={0} />
        <div style={{ height: 220, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
            <rect width="40" height="40" rx="10" fill="var(--bg-muted)" />
            <path d="M8 28L15 20L22 23L32 13" stroke="var(--border-strong)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="32" cy="13" r="2.5" fill="#00D66F" fillOpacity="0.5" />
          </svg>
          <p style={{ color: 'var(--muted)', fontSize: 13, fontWeight: 500, margin: 0 }}>Waiting for price rounds</p>
          <p style={{ color: 'var(--subtle)', fontSize: 12, margin: 0 }}>Chart populates once 2 rounds are published.</p>
        </div>
      </div>
    )
  }

  return (
    <div style={{ borderRadius: 18, padding: 24, background: 'var(--bg-card)', border: '1px solid var(--border)', position: 'relative' }}>
      <Header count={history.length} />

      <div style={{ position: 'relative', height: 220 }}>
        <canvas
          ref={canvasRef}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', cursor: 'crosshair' }}
          onMouseMove={onMouseMove}
          onTouchStart={onTouchStart}
        />
        {tooltip && (
          <div style={{
            position:   'absolute',
            left:       Math.min(tooltip.x + 10, 200),
            top:        Math.max(tooltip.y - 44, 0),
            pointerEvents: 'none',
            opacity:    tooltip.opacity,
            transition: 'opacity 0.08s linear',
            background: 'rgba(6,10,18,0.93)',
            border:     '1px solid rgba(0,214,111,0.28)',
            borderRadius: 9,
            padding:    '7px 12px',
            boxShadow:  '0 4px 20px rgba(0,0,0,0.55)',
          }}>
            <p style={{ color: '#fff', fontSize: 13, fontWeight: 700, margin: 0, fontVariantNumeric: 'tabular-nums' }}>
              {tooltip.price.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} NGN
            </p>
            <p style={{ color: '#64748b', fontSize: 11, margin: '2px 0 0' }}>{tooltip.time}</p>
          </div>
        )}
      </div>
    </div>
  )
}

function Header({ count }: { count: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
      <div>
        <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--subtle)', margin: 0 }}>
          Price History
        </p>
        <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)', margin: '3px 0 0', fontFamily: "'Space Grotesk', sans-serif" }}>
          USDC / NGN
        </p>
      </div>
      {count > 0 && (
        <span style={{ fontSize: 11, color: 'var(--subtle)' }}>{count} updates</span>
      )}
    </div>
  )
}
