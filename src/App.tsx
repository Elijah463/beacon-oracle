import { useState } from 'react'
import { LandingPage } from './components/LandingPage'
import { OracleDashboard } from './components/OracleDashboard'

export default function App() {
  const [view, setView] = useState<'landing' | 'dashboard'>('landing')

  if (view === 'dashboard') {
    return <OracleDashboard onBack={() => setView('landing')} />
  }

  return <LandingPage onEnterDashboard={() => setView('dashboard')} />
}
