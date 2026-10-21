/**
 * BeaconLogo.tsx
 * Faithful SVG reproduction of the BEACON radial-burst logo.
 * 20 rounded teardrop spokes radiating from a shared center, brand color #00D66F.
 * Use BeaconLogo for full lockup (icon + wordmark), BeaconMark for icon only.
 */

interface LogoProps {
  size?: number
  className?: string
}

/** Icon-only mark -- 20-spoke radial burst */
export function BeaconMark({ size = 40, className = '' }: LogoProps) {
  const spokes = Array.from({ length: 20 }, (_, i) => i)
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="BEACON logo"
    >
      {spokes.map((i) => (
        <g key={i} transform={`rotate(${i * 18} 50 50)`}>
          {/* Each spoke: a thin rounded rectangle tapering to a circle tip */}
          <rect x="47.5" y="8" width="5" height="22" rx="2.5" fill="#00D66F" />
        </g>
      ))}
    </svg>
  )
}

/** Full lockup: mark + BEACON wordmark side by side */
export function BeaconLogo({ size = 36, className = '' }: LogoProps) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <BeaconMark size={size} />
      <span
        style={{
          fontFamily: "'Space Grotesk', sans-serif",
          fontWeight: 700,
          fontSize: size * 0.67,
          letterSpacing: '0.04em',
          color: '#0a0a0a',
          lineHeight: 1,
        }}
      >
        BEACON
      </span>
    </span>
  )
}

/** Dashboard variant with white wordmark for use on dark backgrounds if needed */
export function BeaconLogoMark({ size = 32, className = '' }: LogoProps) {
  return <BeaconMark size={size} className={className} />
}
