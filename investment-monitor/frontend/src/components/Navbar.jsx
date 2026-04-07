import { Link } from 'react-router-dom'
import { TrendingUp, Bell, Settings } from 'lucide-react'

export default function Navbar() {
  return (
    <nav className="border-b border-gray-800 bg-gray-800 sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2 font-bold text-lg hover:text-blue-400 transition">
          <TrendingUp className="w-6 h-6 text-blue-500" />
          Investment Monitor
        </Link>

        <div className="flex items-center gap-6">
          <Link to="/" className="text-sm text-gray-300 hover:text-white transition">
            Dashboard
          </Link>
          <Link to="/alerts" className="text-sm text-gray-300 hover:text-white transition flex items-center gap-1">
            <Bell className="w-4 h-4" />
            Alerts
          </Link>
          <a href="#" className="text-sm text-gray-300 hover:text-white transition">
            <Settings className="w-4 h-4" />
          </a>
        </div>
      </div>
    </nav>
  )
}
