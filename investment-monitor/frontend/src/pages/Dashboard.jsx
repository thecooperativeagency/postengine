import { useEffect } from 'react'
import { useStore } from '../store/appStore'
import { TrendingUp, Users, Activity } from 'lucide-react'
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899']

export default function Dashboard() {
  const { 
    stats, 
    investors, 
    trendingTickers, 
    activityFeed,
    fetchInvestors, 
    fetchTrendingTickers, 
    fetchActivityFeed 
  } = useStore()

  useEffect(() => {
    fetchInvestors()
    fetchTrendingTickers()
    fetchActivityFeed()
    
    const interval = setInterval(() => {
      fetchTrendingTickers()
      fetchActivityFeed()
    }, 60000) // Update every minute

    return () => clearInterval(interval)
  }, [fetchInvestors, fetchTrendingTickers, fetchActivityFeed])

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-3xl font-bold">Real-Time Intelligence Hub</h1>

      {/* Trending Tickers */}
      <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
        <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-green-400" />
          Trending Tickers (24h)
        </h2>
        {trendingTickers.length > 0 ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={trendingTickers.slice(0, 10)}>
                <CartesianGrid strokeDasharray="3 3" stroke="#444" />
                <XAxis dataKey="ticker" stroke="#999" />
                <YAxis stroke="#999" />
                <Tooltip contentStyle={{ backgroundColor: '#333' }} />
                <Bar dataKey="mention_count" fill="#3b82f6" />
              </BarChart>
            </ResponsiveContainer>
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {trendingTickers.slice(0, 10).map((ticker, idx) => (
                <div key={ticker.ticker} className="bg-gray-700 p-3 rounded flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center font-bold text-sm">
                      {idx + 1}
                    </div>
                    <div>
                      <div className="font-bold">{ticker.ticker}</div>
                      <div className="text-sm text-gray-400">{ticker.mention_count} mentions from {ticker.investor_count} investors</div>
                    </div>
                  </div>
                  <div className={`font-bold ${ticker.avg_sentiment > 0 ? 'text-green-400' : ticker.avg_sentiment < 0 ? 'text-red-400' : 'text-gray-400'}`}>
                    {ticker.avg_sentiment.toFixed(2)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="text-center text-gray-400 py-8">No trending tickers yet</div>
        )}
      </div>

      {/* Investor Activity */}
      <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
        <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
          <Users className="w-5 h-5 text-blue-400" />
          Active Investors ({investors.length})
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          {investors.map(investor => (
            <div 
              key={investor.id} 
              className="bg-gray-700 p-4 rounded hover:bg-gray-600 cursor-pointer transition"
            >
              <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-cyan-400 rounded-full mb-2" />
              <div className="font-semibold text-sm">{investor.name}</div>
              {investor.handle_x && (
                <div className="text-xs text-gray-400">@{investor.handle_x}</div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Recent Activity Feed */}
      <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
        <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
          <Activity className="w-5 h-5 text-purple-400" />
          Recent Activity
        </h2>
        <div className="space-y-3 max-h-96 overflow-y-auto">
          {activityFeed.length > 0 ? (
            activityFeed.slice(0, 20).map((activity, idx) => (
              <div key={idx} className="bg-gray-700 p-4 rounded-lg border-l-4 border-blue-500">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <div className="font-bold">{activity.investor_name}</div>
                    <div className="text-xs text-gray-400">{activity.data_source} • {new Date(activity.timestamp).toLocaleString()}</div>
                  </div>
                  {activity.mention_count > 0 && (
                    <div className="bg-blue-900 px-2 py-1 rounded text-xs font-bold">{activity.mention_count} mentions</div>
                  )}
                </div>
                <div className="text-sm text-gray-200 line-clamp-2">{activity.content}</div>
              </div>
            ))
          ) : (
            <div className="text-center text-gray-400 py-8">No recent activity</div>
          )}
        </div>
      </div>
    </div>
  )
}
