import { useEffect, useState } from 'react'
import { io } from 'socket.io-client'
import { AlertCircle, X } from 'lucide-react'
import { useStore } from '../store/appStore'

const socket = io(window.location.origin, {
  reconnection: true,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  reconnectionAttempts: 5,
})

export default function RealtimeAlerts() {
  const { addAlert } = useStore()
  const [alerts, setAlerts] = useState([])

  useEffect(() => {
    socket.on('new_alert', (alert) => {
      console.log('New alert received:', alert)
      setAlerts(prev => [alert, ...prev].slice(0, 10)) // Keep last 10
      addAlert(alert)

      // Auto-dismiss after 10 seconds
      setTimeout(() => {
        setAlerts(prev => prev.filter(a => a.id !== alert.id))
      }, 10000)
    })

    socket.on('price_update', (data) => {
      console.log('Price update:', data)
    })

    socket.on('connect', () => {
      console.log('Connected to WebSocket')
    })

    return () => {
      socket.off('new_alert')
      socket.off('price_update')
    }
  }, [addAlert])

  return (
    <div className="fixed bottom-4 right-4 z-50 space-y-2 max-w-sm">
      {alerts.map(alert => (
        <div
          key={alert.id}
          className={`p-4 rounded-lg flex items-start gap-3 ${
            alert.severity === 'critical' ? 'bg-red-900 border border-red-700' :
            alert.severity === 'high' ? 'bg-orange-900 border border-orange-700' :
            'bg-yellow-900 border border-yellow-700'
          }`}
        >
          <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <div className="font-semibold text-sm">{alert.ticker || 'Alert'}</div>
            <div className="text-xs text-gray-200">{alert.message}</div>
            <div className="text-xs text-gray-400 mt-1">
              {alert.investor_name || 'System Alert'}
            </div>
          </div>
          <button
            onClick={() => setAlerts(prev => prev.filter(a => a.id !== alert.id))}
            className="text-gray-400 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ))}
    </div>
  )
}
