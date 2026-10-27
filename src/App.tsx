import { useState } from 'react'
import { LandingPage } from './components/LandingPage'
import { OracleDashboard } from './components/OracleDashboard'
import { DocsPage } from './components/DocsPage'

type View = 'landing' | 'dashboard' | 'docs'

export default function App() {
  const [view, setView] = useState<View>('landing')

  if (view === 'dashboard') {
    return <OracleDashboard onBack={() => setView('landing')} />
  }

  if (view === 'docs') {
    return <DocsPage onBack={() => setView('landing')} />
  }

  return (
    <LandingPage
      onEnterDashboard={() => setView('dashboard')}
      onOpenDocs={() => setView('docs')}
    />
  )
}
