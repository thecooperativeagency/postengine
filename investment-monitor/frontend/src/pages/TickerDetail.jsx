import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import api from '../lib/api'
import { TrendingUp } from 'lucide-react'

export default function TickerDetail() {
  const { ticker } = useParams()
  const [mentions, setMentions] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true)
        const res = await api.get(`/mentions/ticker/${ticker}`)
        setMentions(res.data)
      } catch (error) {
        console.error('Error fetching mentions:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [ticker])

  if (loading) return <div className="p-6">Loading...</div>

  const bullish = mentions.filter(m => m.sentiment === 'positive').length
  const bearish = mentions.filter(m => m.sentiment === 'negative').length
  const neutral = mentions.filter(m => m.sentiment === 'neutral').length

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
        <div className="flex items-center gap-4 mb-4">
          <div className="w-12 h-12 bg-gradient-to-br from-green-500 to-teal-600 rounded-full flex items-center justify-center text-white font-bold text-lg">
            {ticker[0]}
          </div>
          <div>
            <h1 className="text-3xl font-bold">${ticker}</h1>
            <p className="text-gray-400">Investor Activity & Sentiment</p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div className="bg-gray-700 p-4 rounded">
            <div className="text-sm text-gray-400">Total Mentions</div>
            <div className="text-2xl font-bold mt-1">{mentions.length}</div>
          </div>
          <div className="bg-gray-700 p-4 rounded">
            <div className="text-sm text-green-400">Bullish</div>
            <div className="text-2xl font-bold text-green-400 mt-1">+{bullish}</div>
          </div>
          <div className="bg-gray-700 p-4 rounded">
            <div className="text-sm text-red-400">Bearish</div>
            <div className="text-2xl font-bold text-red-400 mt-1">-{bearish}</div>
          </div>
        </div>
      </div>

      {/* Mention History */}
      <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
        <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-blue-400" />
          Mentions by Investor
        </h2>
        <div className="space-y-3 max-h-96 overflow-y-auto">
          {mentions.map((mention, idx) => (
            <div 
              key={idx} 
              className={`p-4 rounded-lg border-l-4 ${
                mention.sentiment === 'positive' ? 'bg-green-900/20 border-green-600' :
                mention.sentiment === 'negative' ? 'bg-red-900/20 border-red-600' :
                'bg-gray-700 border-gray-600'
              }`}
            >
              <div className="flex items-start justify-between mb-2">
                <div>
                  <div className="font-bold">{mention.investor_name || 'Unknown'}</div>
                  <div className="text-xs text-gray-400">{new Date(mention.mentioned_at).toLocaleString()}</div>
                </div>
                <div className={`font-bold ${
                  mention.sentiment === 'positive' ? 'text-green-400' :
                  mention.sentiment === 'negative' ? 'text-red-400' :
                  'text-gray-400'
                }`}>
                  {mention.sentiment.toUpperCase()}
                </div>
              </div>
              {mention.context && (
                <p className="text-sm text-gray-200 line-clamp-2">{mention.context}</p>
              )}
              {mention.extraction_confidence && (
                <div className="mt-2 text-xs text-gray-400">
                  Confidence: {(mention.extraction_confidence * 100).toFixed(0)}%
                </div>
              )}
            </div>
          ))}
          {mentions.length === 0 && (
            <div className="text-center text-gray-400 py-8">No mentions found</div>
          )}
        </div>
      </div>
    </div>
  )
}
