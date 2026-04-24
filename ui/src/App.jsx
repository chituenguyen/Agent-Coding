import { Routes, Route, Navigate } from 'react-router-dom'
import Sidebar from './components/Sidebar'
import Tasks from './pages/Tasks'
import TaskDetail from './pages/TaskDetail'
import Queue from './pages/Queue'
import Investigate from './pages/Investigate'
import Agents from './pages/Agents'
import Commands from './pages/Commands'
import Mcp from './pages/Mcp'
import Settings from './pages/Settings'
import Onboarding from './components/Onboarding'
import { useTheme } from './hooks/useTheme'

export default function App() {
  const [theme, setTheme] = useTheme()
  return (
    <div className="flex h-screen bg-gray-50 dark:bg-gray-950 overflow-hidden">
      <Onboarding />
      <Sidebar theme={theme} setTheme={setTheme} />
      <main className="flex-1 overflow-y-auto">
        <Routes>
          <Route path="/" element={<Navigate to="/tasks" replace />} />
          <Route path="/tasks" element={<Tasks />} />
          <Route path="/tasks/:project/:taskId" element={<TaskDetail />} />
          <Route path="/queue" element={<Queue />} />
          <Route path="/investigate" element={<Investigate />} />
          <Route path="/agents" element={<Agents />} />
          <Route path="/commands" element={<Commands />} />
          <Route path="/mcp" element={<Mcp />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </main>
    </div>
  )
}
