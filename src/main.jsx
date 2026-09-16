import{createRoot}from'react-dom/client'
import'./index.css'
import App from'./App.jsx'
import WatchView from'./watch.jsx'

const watchCode=new URLSearchParams(window.location.search).get('watch')

createRoot(document.getElementById('root')).render(
  watchCode?<WatchView code={watchCode.toUpperCase()}/>:<App/>
)
