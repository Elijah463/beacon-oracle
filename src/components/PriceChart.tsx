/**
 * PriceChart.tsx -- clean canvas price chart
 * - X axis: proportional to real time (no fake equal spacing)
 * - Y axis: exactly 5 ticks, minimum 0.5% spread, 2 decimal labels
 * - Smooth monotone cubic spline (no wild bezier overshoots)
 * - Gradient fill under line
 * - Tap/hover tooltip fades after 10s
 * - Animates draw-on from left to right
 */

import { useEffect, useRef, useState, useCallback } from 'react'
import type { RoundPoint } from '@/hooks/useOracle'

interface PriceChartProps {
  history: RoundPoint[]
  price:   number | null
  loading: boolean
}
interface TooltipState { price: number; time: string; x: number; y: number; opacity: number }

const BRAND  = '#00D66F'
const PAD_L  = 46   // room for "1,345" labels
const PAD_R  = 12
const PAD_T  = 14
const PAD_B  = 14
const H_CHART = 220

// ── Y-axis builder: 5 whole-number, evenly spaced ticks centered on live price ─
// Step is 1 when the data is tight (e.g. live 1347 → 1345, 1346, 1347, 1348, 1349)
// and grows (2, 5, 10...) only as much as needed so EVERY point stays visible.
function buildYAxis(prices: number[], livePrice: number) {
  const all = [...prices, livePrice]
  const lo  = Math.floor(Math.min(...all))
  const hi  = Math.ceil(Math.max(...all))
  const needed = Math.max(hi - lo, 1)
  const raw = Math.ceil(needed / 4)
  const mag = Math.pow(10, Math.floor(Math.log10(raw)))
  const step = [1, 2, 5, 10].map(m => m * mag).find(s => s >= raw) ?? raw

  // Center the 4-interval window on the live price, then shift it so the
  // whole data range [lo, hi] is always inside.
  let start = Math.round(livePrice) - 2 * step
  if (start > lo) start = lo
  if (start + 4 * step < hi) start = hi - 4 * step

  const ticks = Array.from({ length: 5 }, (_, i) => start + i * step)
  return { ticks, yMin: ticks[0], yMax: ticks[4] }
}

// ── Coordinate helpers ──────────────────────────────────────────────────────
function toY(val: number, yMin: number, yMax: number, h: number) {
  return PAD_T + (1 - (val - yMin) / (yMax - yMin)) * (h - PAD_T - PAD_B)
}
function toX(ts: number, tsMin: number, tsMax: number, w: number) {
  if (tsMin === tsMax) return PAD_L + (w - PAD_L - PAD_R) / 2
  return PAD_L + ((ts - tsMin) / (tsMax - tsMin)) * (w - PAD_L - PAD_R)
}

// ── Monotone cubic spline (Fritsch-Carlson) prevents overshoots ─────────────
function buildSpline(pts: {x: number; y: number}[]): {x: number; y: number; cp1x: number; cp1y: number; cp2x: number; cp2y: number}[] {
  const n = pts.length
  if (n < 2) return []
  const dx = pts.slice(1).map((p, i) => p.x - pts[i].x)
  const dy = pts.slice(1).map((p, i) => p.y - pts[i].y)
  const m  = dx.map((d, i) => d === 0 ? 0 : dy[i] / d)

  // Tangents
  const t = Array(n).fill(0)
  t[0] = m[0]; t[n - 1] = m[n - 2]
  for (let i = 1; i < n - 1; i++) t[i] = (m[i - 1] + m[i]) / 2

  // Monotonicity constraint
  for (let i = 0; i < n - 1; i++) {
    if (m[i] === 0) { t[i] = t[i + 1] = 0; continue }
    const a = t[i] / m[i], b = t[i + 1] / m[i]
    if (a < 0 || b < 0) { t[i] = t[i + 1] = 0; continue }
    if (a * a + b * b > 9) {
      const s = 3 / Math.sqrt(a * a + b * b)
      t[i] *= s * a; t[i + 1] *= s * b
    }
  }

  return pts.slice(0, -1).map((p, i) => ({
    x: pts[i + 1].x, y: pts[i + 1].y,
    cp1x: p.x + dx[i] / 3,       cp1y: p.y + t[i] * dx[i] / 3,
    cp2x: pts[i + 1].x - dx[i] / 3, cp2y: pts[i + 1].y - t[i + 1] * dx[i] / 3,
  }))
}

// ── Label formatter ─────────────────────────────────────────────────────────
function fmtY(v: number) {
  return Math.round(v).toLocaleString('en-US')
}

export function PriceChart({ history, price, loading }: PriceChartProps) {
  const canvasRef   = useRef<HTMLCanvasElement>(null)
  const progressRef = useRef(0)
  const rafRef      = useRef<number>(0)
  const timerRef    = useRef<ReturnType<typeof setTimeout> | null>(null)
  const fadeRef     = useRef<ReturnType<typeof setInterval> | null>(null)
  const [tooltip, setTooltip] = useState<TooltipState | null>(null)

  const draw = useCallback((progress: number) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const w = canvas.offsetWidth  || 400
    const h = canvas.offsetHeight || H_CHART
    if (w < 10 || h < 10) return

    ctx.clearRect(0, 0, w, h)
    if (history.length < 2) return

    const prices = history.map(r => r.price)
    const times  = history.map(r => r.updatedAt)
    const minT   = Math.min(...times),  maxT = Math.max(...times)
    const liveP  = price ?? prices[prices.length - 1]
    const { ticks, yMin, yMax } = buildYAxis(prices, liveP)

    // ── Y-axis labels + gridlines ─────────────────────────────────────────
    ctx.font      = '11px system-ui, sans-serif'
    ctx.textAlign = 'right'
    ctx.textBaseline = 'middle'
    for (const tick of ticks) {
      const cy = toY(tick, yMin, yMax, h)
      ctx.strokeStyle = 'rgba(255,255,255,0.06)'
      ctx.lineWidth   = 1
      ctx.beginPath(); ctx.moveTo(PAD_L, cy); ctx.lineTo(w - PAD_R, cy); ctx.stroke()
      ctx.fillStyle = 'rgba(148,163,184,0.85)'
      ctx.fillText(fmtY(tick), PAD_L - 6, cy)
    }

    // ── Clip how many points to draw based on progress ────────────────────
    const visibleCount = Math.max(2, Math.ceil(progress * history.length))
    const visible = history.slice(0, visibleCount)
    const pts = visible.map(r => ({
      x: toX(r.updatedAt, minT, maxT, w),
      y: toY(r.price, yMin, yMax, h),
    }))

    const spline = buildSpline(pts)
    const lastPt = pts[pts.length - 1]
    const baseY  = toY(yMin, yMin, yMax, h)

    // ── Gradient fill ─────────────────────────────────────────────────────
    const grad = ctx.createLinearGradient(0, PAD_T, 0, baseY)
    grad.addColorStop(0,   'rgba(0,214,111,0.22)')
    grad.addColorStop(0.7, 'rgba(0,214,111,0.06)')
    grad.addColorStop(1,   'rgba(0,214,111,0.00)')

    ctx.beginPath()
    ctx.moveTo(pts[0].x, baseY)
    ctx.lineTo(pts[0].x, pts[0].y)
    if (spline.length > 0) {
      for (const s of spline) ctx.bezierCurveTo(s.cp1x, s.cp1y, s.cp2x, s.cp2y, s.x, s.y)
    } else {
      ctx.lineTo(lastPt.x, lastPt.y)
    }
    ctx.lineTo(lastPt.x, baseY)
    ctx.closePath()
    ctx.fillStyle = grad
    ctx.fill()

    // ── Line ─────────────────────────────────────────────────────────────
    ctx.beginPath()
    ctx.moveTo(pts[0].x, pts[0].y)
    if (spline.length > 0) {
      for (const s of spline) ctx.bezierCurveTo(s.cp1x, s.cp1y, s.cp2x, s.cp2y, s.x, s.y)
    } else {
      ctx.lineTo(lastPt.x, lastPt.y)
    }
    ctx.strokeStyle = BRAND
    ctx.lineWidth   = 2
    ctx.lineJoin    = 'round'
    ctx.lineCap     = 'round'
    ctx.stroke()

    // ── Tip dot ──────────────────────────────────────────────────────────
    if (progress >= 1) {
      ctx.beginPath()
      ctx.arc(lastPt.x, lastPt.y, 3.5, 0, Math.PI * 2)
      ctx.fillStyle   = BRAND
      ctx.shadowColor = BRAND
      ctx.shadowBlur  = 10
      ctx.fill()
      ctx.shadowBlur  = 0
    }
  }, [history, price])

  // ── Animate on new history ──────────────────────────────────────────────
  useEffect(() => {
    if (history.length < 2) return
    progressRef.current = 0
    const start    = performance.now()
    const duration = Math.min(1000 + history.length * 60, 2000)
    const step = (now: number) => {
      const t = Math.min((now - start) / duration, 1)
      progressRef.current = 1 - Math.pow(1 - t, 3)
      draw(progressRef.current)
      if (t < 1) rafRef.current = requestAnimationFrame(step)
    }
    rafRef.current = requestAnimationFrame(step)
    return () => cancelAnimationFrame(rafRef.current)
  }, [history, draw])

  // ── Resize ───────────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const setSize = () => {
      const dpr = window.devicePixelRatio || 1
      const cw  = canvas.offsetWidth
      const ch  = canvas.offsetHeight
      if (cw === 0 || ch === 0) return
      canvas.width  = cw * dpr
      canvas.height = ch * dpr
      const ctx = canvas.getContext('2d')
      if (ctx) { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.scale(dpr, dpr) }
      draw(progressRef.current)
    }
    setSize()
    const obs = new ResizeObserver(setSize)
    obs.observe(canvas)
    return () => obs.disconnect()
  }, [draw])

  // ── Tooltip hit-test ─────────────────────────────────────────────────────
  const handlePointer = useCallback((clientX: number) => {
    if (history.length < 2) return
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const mx   = clientX - rect.left
    const w    = rect.width
    const times = history.map(r => r.updatedAt)
    const minT  = Math.min(...times), maxT = Math.max(...times)

    let best = 0, bestDist = Infinity
    for (let i = 0; i < history.length; i++) {
      const cx = toX(history[i].updatedAt, minT, maxT, w)
      const d  = Math.abs(cx - mx)
      if (d < bestDist) { bestDist = d; best = i }
    }
    const pt  = history[best]
    const prices = history.map(r => r.price)
    const liveP2 = price ?? prices[prices.length - 1]
    const { yMin, yMax } = buildYAxis(prices, liveP2)
    const cx = toX(pt.updatedAt, minT, maxT, w)
    const cy = toY(pt.price, yMin, yMax, rect.height)

    if (timerRef.current) clearTimeout(timerRef.current)
    if (fadeRef.current)  clearInterval(fadeRef.current)

    setTooltip({ price: pt.price, time: new Date(pt.updatedAt * 1000).toLocaleTimeString(), x: Math.max(0, Math.min(cx + 12, w - 130)), y: cy, opacity: 1 })

    timerRef.current = setTimeout(() => {
      let op = 1
      fadeRef.current = setInterval(() => {
        op -= 0.05
        if (op <= 0) { clearInterval(fadeRef.current!); setTooltip(null) }
        else setTooltip(prev => prev ? { ...prev, opacity: op } : null)
      }, 40)
    }, 10000)
  }, [history, price])

  if (loading) return (
    <div style={{ borderRadius: 18, padding: 24, background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
      <div style={{ height: 16, width: 140, background: 'var(--bg-muted)', borderRadius: 6, marginBottom: 16, animation: 'shimmer 1.5s infinite' }} />
      <div style={{ height: H_CHART, background: 'var(--bg-muted)', borderRadius: 10, animation: 'shimmer 1.5s infinite' }} />
    </div>
  )

  if (history.length < 2) return (
    <div style={{ borderRadius: 18, padding: 24, background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
      <Header count={0} />
      <div style={{ height: H_CHART, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
        <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
          <rect width="40" height="40" rx="10" fill="var(--bg-muted)" />
          <path d="M8 28L15 20L22 23L32 13" stroke="var(--border-strong)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          <circle cx="32" cy="13" r="2.5" fill="#00D66F" fillOpacity="0.5"/>
        </svg>
        <p style={{ color: 'var(--muted)', fontSize: 13, fontWeight: 500, margin: 0 }}>Waiting for price rounds</p>
        <p style={{ color: 'var(--subtle)', fontSize: 12, margin: 0 }}>Chart populates once 2 rounds are published.</p>
      </div>
    </div>
  )

  return (
    <div style={{ borderRadius: 18, padding: 24, background: 'var(--bg-card)', border: '1px solid var(--border)', position: 'relative' }}>
      <Header count={history.length} />
      <div style={{ position: 'relative', height: H_CHART }}>
        <canvas
          ref={canvasRef}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', cursor: 'crosshair' }}
          onMouseMove={e => handlePointer(e.clientX)}
          onTouchStart={e => { e.preventDefault(); handlePointer(e.touches[0].clientX) }}
        />
        {tooltip && (
          <div style={{
            position: 'absolute',
            left: tooltip.x,
            top:  Math.max(tooltip.y - 48, 0),
            pointerEvents: 'none', opacity: tooltip.opacity,
            background: 'rgba(6,10,18,0.93)', border: '1px solid rgba(0,214,111,0.28)',
            borderRadius: 9, padding: '7px 12px', boxShadow: '0 4px 20px rgba(0,0,0,0.55)',
          }}>
            <p style={{ color: '#fff', fontSize: 13, fontWeight: 700, margin: 0, fontVariantNumeric: 'tabular-nums' }}>
              {tooltip.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} NGN
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
        <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--subtle)', margin: 0 }}>Price History</p>
        <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)', margin: '3px 0 0', fontFamily: "'Space Grotesk', sans-serif" }}>USDC / NGN</p>
      </div>
      {count > 0 && <span style={{ fontSize: 11, color: 'var(--subtle)' }}>{count} updates</span>}
    </div>
  )
}
