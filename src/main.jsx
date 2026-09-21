import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import Watch from './Watch.jsx'

const watch = new URLSearchParams(location.search).get('watch')
createRoot(document.getElementById('root')).render(
  watch !== null ? <Watch initial={watch.toUpperCase()} /> : <App />
)
