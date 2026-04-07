import { useEffect } from 'react'
import { useStore } from '../store/appStore'
import { AlertCircle, CheckCircle, Clock } from 'lucide-react'

export default function Alerts() {
  const { alerts, fetchAlerts, markAlertAsRead } = useStore()

  useEffect(() => {
    fetchAlerts(100)
    const interval = setInterval(() => fetchAlerts(100), 30000)
    return () => clearInterval(interval)
  }, [fetchAlerts])

  const unread = alerts.filter(a => !a.read_at)
  const read = alerts.filter(a => a.read_at)

  const getSeverityColor = (severity) => {
    switch (severity) {
      case 'critical':
        return 'border-red-600 bg-red-900/20'
      case 'high':
        return 'border-orange-600 bg-orange-900/20'
      case 'medium':
        return 'border-yellow-600 bg-yellow-900/20'
      default:
        return 'border-blue-600 bg-blue-900/20'
    }
  }

  const getSeverityIcon = (severity) => {
    switch (severity) {
      case 'critical':
        return <AlertCircle className="w-5 h-5 text-red-400" />
      case 'high':
        return <AlertCircle className="w-5 h-5 text-orange-400" />
      case 'medium':
        return <Clock className="w-5 h-5 text-yellow-400" />
      default:
        return <CheckCircle className="w-5 h-5 text-blue-400" />
    }
  }

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-3xl font-bold">Alerts & Notifications</h1>

      {/* Unread alerts */}
      <div>
        <h2 className="text-xl font-bold mb-4 text-red-400">Unread ({unread.length})</h2>
        {unread.length > 0 ? (
          <div className="space-y-3">
            {unread.map(alert => (
              <div 
                key={alert.id} 
                className={`p-4 rounded-lg border-l-4 ${getSeverityColor(alert.severity)} hover:opacity-80 cursor-pointer transition`}
                onClick={() => markAlertAsRead(alert.id)}
              >
                <div className="flex items-start gap-3">
                  {getSeverityIcon(alert.severity)}
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-1">
                      <div className="font-bold text-lg">{alert.ticker || 'System Alert'}</div>
                      <div className="text-xs text-gray-400">{new Date(alert.created_at).toLocaleString()}</div>
                    </div>
                    <div className="text-sm mb-1">{alert.message}</div>
                    {alert.investor_name && (
                      <div className="text-xs text-gray-400">Investor: {alert.investor_name}</div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center text-gray-400 py-8 bg-gray-800 rounded-lg">
            🎉 All caught up! No unread alerts.
          </div>
        )}
      </div>

      {/* Read alerts */}
      {read.length > 0 && (
        <div>
          <h2 className="text-xl font-bold mb-4 text-gray-400">Archive ({read.length})</h2>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {read.map(alert => (
              <div 
                key={alert.id} 
                className="p-3 rounded bg-gray-700 text-sm opacity-60"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-bold">{alert.ticker || 'Alert'}</span> - {alert.message}
                  </div>
                  <div className="text-xs text-gray-500">
                    {new Date(alert.created_at).toLocaleString()}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
