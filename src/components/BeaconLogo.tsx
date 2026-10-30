/**
 * BeaconLogo.tsx
 * Uses the real Beacon_Logo.png uploaded to public/.
 * BeaconMark = icon only, BeaconLogo = icon + wordmark.
 */

interface LogoProps {
  size?: number
  className?: string
}

/** Icon-only mark -- real PNG logo */
export function BeaconMark({ size = 40, className = '' }: LogoProps) {
  return (
    <img
      src="/Beacon_Logo.png"
      alt="BEACON"
      width={size}
      height={size}
      className={className}
      style={{ objectFit: 'contain', display: 'block' }}
    />
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
