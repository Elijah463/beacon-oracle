/**
 * useLerpedNumber.ts
 * Smooth-animates a number toward its target using linear interpolation.
 * Used for the USDC/NGN rate display so price updates feel live, not jarring.
 * Only animates when the target actually changes from real on-chain data.
 */

import { useState, useEffect, useRef } from 'react'

export function useLerpedNumber(target: number | null, speed = 0.12): number | null {
  const [display, setDisplay] = useState<number | null>(target)
  const ref = useRef(target ?? 0)

  useEffect(() => {
    if (target == null) return
    let raf = 0

    const tick = () => {
      ref.current += (target - ref.current) * speed
      if (Math.abs(target - ref.current) < 0.0001) ref.current = target
      setDisplay(ref.current)
      if (Math.abs(ref.current - target) > 0.0001) {
        raf = requestAnimationFrame(tick)
      }
    }

    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, speed])

  return display
}
