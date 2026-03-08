import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import './index.css'
import App from './App.jsx'
import { AuthProvider } from './features/auth/context/AuthContext'
import initFirebase from './shared/lib/firebase'

const queryClient = new QueryClient()

const CANONICAL_PROD_HOST = 'simple-flow-rho.vercel.app'

if (
  import.meta.env.PROD &&
  window.location.hostname.endsWith('.vercel.app') &&
  window.location.hostname !== CANONICAL_PROD_HOST
) {
  // Keep auth operations on one whitelisted host to avoid OAuth domain mismatches.
  window.location.replace(
    `https://${CANONICAL_PROD_HOST}${window.location.pathname}${window.location.search}${window.location.hash}`,
  )
}

void initFirebase()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  </StrictMode>,
)
