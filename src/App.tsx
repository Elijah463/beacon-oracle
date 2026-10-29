import { useState, useEffect } from 'react'
import { LandingPage } from './components/LandingPage'
import { OracleDashboard } from './components/OracleDashboard'
import { DocsPage } from './components/DocsPage'

type View = 'landing' | 'dashboard' | 'docs'

function hashToView(hash: string): View {
  if (hash === '#/dashboard') return 'dashboard'
  if (hash === '#/docs') return 'docs'
  return 'landing'
}

export default function App() {
  const [view, setView] = useState<View>(() => hashToView(window.location.hash))

  // Keep hash in sync when view changes programmatically
  const navigate = (v: View) => {
    const hash = v === 'dashboard' ? '#/dashboard' : v === 'docs' ? '#/docs' : '#/'
    window.location.hash = hash
    setView(v)
  }

  // Sync view when user hits back/forward or refreshes
  useEffect(() => {
    const onHash = () => setView(hashToView(window.location.hash))
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  if (view === 'dashboard') return <OracleDashboard onNavigate={navigate} />
  if (view === 'docs')      return <DocsPage onNavigate={navigate} />

  return (
    <LandingPage
      onEnterDashboard={() => navigate('dashboard')}
      onOpenDocs={() => navigate('docs')}
    />
  )
}
