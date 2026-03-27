import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import DashAndBurn from './DashAndBurn.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <DashAndBurn />
  </StrictMode>,
)
