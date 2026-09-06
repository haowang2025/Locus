import { Outlet } from 'react-router-dom'
import './App.css'
import './xhs.css'

function App() {
  return (
    <div className="app-shell">
      <Outlet />
    </div>
  )
}

export default App
