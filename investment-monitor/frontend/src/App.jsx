import { useEffect, useState } from 'react'
import { Outlet, Link } from 'react-router-dom'
import { Bell, TrendingUp, Users, AlertCircle } from 'lucide-react'
import { useStore } from './store/appStore'
import Navbar from './components/Navbar'
import RealtimeAlerts from './components/RealtimeAlerts'

function App() {
  const { stats, fetchStats } = useStore()
  const [showNotifications, setShowNotifications] = useState(false)

  useEffect(() => {
    fetchStats()
    const interval = setInterval(fetchStats, 30000) // Update every 30s
    return () => clearInterval(interval)
  }, [fetchStats])

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <Navbar />
      
      {/* Top bar stats */}
      <div className="border-b border-gray-800 bg-gray-800/50 backdrop-blur">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between text-sm">
          <div className="flex gap-8">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-blue-400" />
              <span className="text-gray-400">Investors:</span>
              <span className="font-semibold">{stats.active_investors || 0}</span>
            </div>
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-green-400" />
              <span className="text-gray-400">Posts (7d):</span>
              <span className="font-semibold">{stats.posts_this_week || 0}</span>
            </div>
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-yellow-400" />
              <span className="text-gray-400">Mentions (7d):</span>
              <span className="font-semibold">{stats.mentions_this_week || 0}</span>
            </div>
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4 text-red-400" />
              <span className="text-gray-400">Unread:</span>
              <span className="font-semibold">{stats.unread_alerts || 0}</span>
            </div>
          </div>
          <div className="text-gray-500 text-xs">
            Last updated: {new Date().toLocaleTimeString()}
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="max-w-7xl mx-auto">
        <Outlet />
      </div>

      {/* Real-time alerts drawer */}
      <RealtimeAlerts />
    </div>
  )
}

export default App
