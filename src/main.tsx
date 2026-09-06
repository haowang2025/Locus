import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'
import './index.css'
import './xhs-landscape.css'
import { seedTengwangDemoIfEmpty } from './lib/tengwangDemo'
import { installXhsLandscapePreference } from './lib/xhsLandscape'
import { router } from './router.tsx'

installXhsLandscapePreference()

function renderApp() {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <RouterProvider router={router} />
    </StrictMode>,
  )
}

void seedTengwangDemoIfEmpty()
  .catch((error) => {
    console.warn('[demo] unable to seed Tengwang Pavilion demo, continuing without it', error)
  })
  .finally(renderApp)
