import { ExternalLink, Radio } from 'lucide-react'

interface ReporterInfoProps {
  reporter: string | null
  contractAddress: string
}

function shortAddr(addr: string): string {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`
}

const EXPLORER = 'https://explorer.arc.io'

export function ReporterInfo({ reporter, contractAddress }: ReporterInfoProps) {
  const rows = [
    {
      label: 'Contract',
      value: contractAddress,
      href: `${EXPLORER}/address/${contractAddress}`,
    },
    {
      label: 'Reporter',
      value: reporter ?? '--',
      href: reporter ? `${EXPLORER}/address/${reporter}` : undefined,
    },
  ]

  return (
    <div
      className="rounded-2xl p-5 h-full"
      style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)' }}
    >
      <div className="flex items-center gap-2 mb-4">
        <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'var(--brand-muted)' }}>
          <Radio size={14} style={{ color: 'var(--brand)' }} />
        </div>
        <div>
          <p className="text-xs font-semibold tracking-widest uppercase" style={{ color: 'var(--subtle)', letterSpacing: '0.08em' }}>Network</p>
          <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>Arc Network</p>
        </div>
      </div>

      <div className="space-y-3">
        {rows.map((row) => (
          <div key={row.label} className="flex items-center justify-between">
            <span className="text-xs" style={{ color: 'var(--subtle)' }}>{row.label}</span>
            {row.href ? (
              <a
                href={row.href}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-xs mono hover:underline transition-opacity hover:opacity-70"
                style={{ color: 'var(--ink-2)' }}
              >
                {shortAddr(row.value)}
                <ExternalLink size={10} />
              </a>
            ) : (
              <span className="text-xs mono" style={{ color: 'var(--placeholder)' }}>not set</span>
            )}
          </div>
        ))}
      </div>

      <div className="mt-4 pt-4" style={{ borderTop: '1px solid var(--border)' }}>
        <p className="text-xs" style={{ color: 'var(--subtle)' }}>
          UUPS Upgradeable. Single trusted reporter for testnet PoC.
          Upgrade to multi-node by replacing the reporter address.
        </p>
      </div>
    </div>
  )
}
