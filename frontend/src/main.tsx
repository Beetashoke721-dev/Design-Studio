import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { FrappeProvider } from 'frappe-react-sdk'
import './index.css'
import App from './App.tsx'

// In production this is served by Frappe's www page at /design_studio.
// In dev, vite serves the SPA under its own `base` path instead (see vite.config.ts),
// so the router has to match whichever prefix the page is actually mounted at.
const basename = import.meta.env.DEV ? import.meta.env.BASE_URL : '/design_studio'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <FrappeProvider>
      <BrowserRouter basename={basename}>
        <App />
      </BrowserRouter>
    </FrappeProvider>
  </StrictMode>,
)
